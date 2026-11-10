"""Portable, versioned local history and gap-aware weekly project timelines."""
from __future__ import annotations

from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import csv
import hashlib
import html
import io
import json
from pathlib import Path
import re
import sqlite3
import sys

from weekly_order_comparison import (Row, Source, load_source, norm, text, joined,
    described, amount, state_values, status_known, CURRENCIES)
from weekly_comparison import safe_csv, write_output

VERSION = '3.0.0'


class HistoryError(ValueError):
    def __init__(self,key,**params):
        self.key,self.params=key,params
        super().__init__(f'{key}: {params}')


class HistoryTranslator:
    def __init__(self,root,language='zh-CN'):
        self.messages=json.loads((Path(root)/'locales'/f'{language}.json').read_text(encoding='utf-8'))
    def tr(self,key,**params):
        value=self.messages.get('weeklyHistory.'+key,self.messages.get('weeklyOrders.'+key,self.messages.get('weeklyComparer.'+key,key)))
        for key,replacement in params.items():value=value.replace('{'+key+'}',str(replacement))
        return value


def monday(year,week):
    try:return date.fromisocalendar(int(year),int(week),1)
    except (ValueError,TypeError,OverflowError) as exc:raise HistoryError('badPeriod',year=year,week=week) from exc


def period_label(year,week):
    monday(year,week)
    return f'{int(year):04d}-W{int(week):02d}'


def parse_period(label):
    match=re.fullmatch(r'(\d{4})-W(\d{1,2})',label.strip(),re.I)
    if not match:raise HistoryError('badPeriod',year=label,week='')
    year,week=map(int,match.groups());monday(year,week);return year,week


def suggest_period(path):
    path=Path(path)
    year=re.search(r'(?<!\d)(20\d{2})(?!\d)',path.stem)
    week=re.search(r'(?:WK?|周)\s*[-_ ]?(\d{1,2})(?!\d)',path.stem,re.I)
    if not year:year=re.search(r'(?<!\d)(20\d{2})(?!\d)',path.parent.name)
    return int(year.group(1)) if year else None,int(week.group(1)) if week else None


def encode_value(value):
    if isinstance(value,datetime):return {'type':'datetime','value':value.isoformat()}
    if isinstance(value,date):return {'type':'date','value':value.isoformat()}
    if isinstance(value,Decimal):return {'type':'decimal','value':str(value)}
    return value


def decode_value(value):
    if not isinstance(value,dict):return value
    return {'datetime':datetime.fromisoformat,'date':date.fromisoformat,'decimal':Decimal}[value['type']](value['value'])


def source_text(value):
    if isinstance(value,datetime) and value.time()!=datetime.min.time():return value.isoformat(sep=' ')
    return text(value)


def invoice_description(rows):
    labels={};counts=Counter()
    for row in rows:
        value=source_text(row.values[19]);key=norm(value);counts[key]+=1;labels.setdefault(key,value)
    return ' / '.join(labels[k]+(f' × {n}' if n>1 else '') for k,n in counts.items())


def encode_source(source):
    return json.dumps({'sheet':source.sheet,'issues':source.issues,'rows':[
        {'row':r.row,'values':[encode_value(v) for v in r.values],'missing':list(r.missing)} for r in source.rows]},
        ensure_ascii=False,allow_nan=False,separators=(',',':'))


def decode_source(payload,filename):
    data=json.loads(payload)
    return Source(Path(filename),[Row(r['row'],tuple(decode_value(v) for v in r['values']),tuple(r['missing'])) for r in data['rows']],data['issues'],data['sheet'])


@dataclass(frozen=True)
class PreparedSnapshot:
    filename: str
    source_path: str
    sha256: str
    payload: str
    row_count: int
    suggested_year: int | None = None
    suggested_week: int | None = None


def prepare_snapshot(path):
    path=Path(path).resolve();raw=path.read_bytes()
    source=load_source(path,'history',payload=raw)
    year,week=suggest_period(path)
    return PreparedSnapshot(path.name,str(path),hashlib.sha256(raw).hexdigest(),encode_source(source),len(source.rows),year,week)


@dataclass(frozen=True)
class ImportRequest:
    prepared: PreparedSnapshot
    year: int
    week: int
    replace: bool = False


@dataclass(frozen=True)
class ContinuitySnapshot:
    id: int
    year: int
    week: int
    filename: str
    sha256: str
    source: Source
    created_at: str

    @property
    def label(self):return period_label(self.year,self.week)
    @property
    def day(self):return monday(self.year,self.week)


class HistoryStore:
    """Every mutation opens its own connection and commits a complete transaction."""
    def __init__(self,path):
        self.path=Path(path).resolve();self.path.parent.mkdir(parents=True,exist_ok=True)
        with closing(self.connect()) as db, db:
            version=db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0,1):raise HistoryError('schemaVersion',version=version)
            db.executescript('''
                CREATE TABLE IF NOT EXISTS snapshots(
                    id INTEGER PRIMARY KEY, year INTEGER NOT NULL, week INTEGER NOT NULL,
                    filename TEXT NOT NULL, source_path TEXT NOT NULL, sha256 TEXT NOT NULL,
                    payload TEXT NOT NULL, row_count INTEGER NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(year,week,sha256));
                CREATE TABLE IF NOT EXISTS active(
                    year INTEGER NOT NULL,week INTEGER NOT NULL,snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
                    PRIMARY KEY(year,week));
                CREATE TABLE IF NOT EXISTS events(
                    id INTEGER PRIMARY KEY,action TEXT NOT NULL,snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),created_at TEXT NOT NULL);
                PRAGMA user_version=1;
            ''')
    def connect(self):
        db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON');return db
    def active_list(self):
        with closing(self.connect()) as db:
            return [dict(r) for r in db.execute('SELECT s.id,s.year,s.week,s.filename,s.sha256,s.row_count,s.created_at FROM active a JOIN snapshots s ON s.id=a.snapshot_id ORDER BY s.year,s.week')]
    def versions(self,year=None,week=None):
        with closing(self.connect()) as db:
            sql='SELECT s.id,s.year,s.week,s.filename,s.sha256,s.row_count,s.created_at,CASE WHEN a.snapshot_id=s.id THEN 1 ELSE 0 END AS active FROM snapshots s LEFT JOIN active a ON a.year=s.year AND a.week=s.week'
            params=()
            if year is not None:sql+=' WHERE s.year=? AND s.week=?';params=(year,week)
            return [dict(r) for r in db.execute(sql+' ORDER BY s.year DESC,s.week DESC,s.id DESC',params)]
    def import_batch(self,requests):
        requests=list(requests);seen=set()
        for request in requests:
            period=(int(request.year),int(request.week));monday(*period)
            if period in seen:raise HistoryError('batchDuplicate',period=period_label(*period))
            seen.add(period)
            # Validate typed payload before any database transaction is made active.
            decode_source(request.prepared.payload,request.prepared.filename)
        ids=[]
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            for request in requests:
                p=request.prepared;year,week=int(request.year),int(request.week)
                elsewhere=db.execute('SELECT a.year,a.week FROM active a JOIN snapshots s ON s.id=a.snapshot_id WHERE s.sha256=? AND (a.year<>? OR a.week<>?)',(p.sha256,year,week)).fetchone()
                if elsewhere:raise HistoryError('fileOtherPeriod',period=period_label(elsewhere['year'],elsewhere['week']))
                current=db.execute('SELECT s.id,s.sha256 FROM active a JOIN snapshots s ON s.id=a.snapshot_id WHERE a.year=? AND a.week=?',(year,week)).fetchone()
                if current and current['sha256']==p.sha256:ids.append(current['id']);continue
                if current and not request.replace:raise HistoryError('weekConflict',period=period_label(year,week))
                timestamp=datetime.now(timezone.utc).isoformat()
                existing=db.execute('SELECT id FROM snapshots WHERE year=? AND week=? AND sha256=?',(year,week,p.sha256)).fetchone()
                if existing:snapshot_id=existing['id']
                else:
                    cursor=db.execute('INSERT INTO snapshots(year,week,filename,source_path,sha256,payload,row_count,created_at) VALUES(?,?,?,?,?,?,?,?)',(year,week,p.filename,p.source_path,p.sha256,p.payload,p.row_count,timestamp));snapshot_id=cursor.lastrowid
                db.execute('INSERT INTO active VALUES(?,?,?) ON CONFLICT(year,week) DO UPDATE SET snapshot_id=excluded.snapshot_id',(year,week,snapshot_id))
                db.execute('INSERT INTO events(action,snapshot_id,created_at) VALUES(?,?,?)',('replace' if current else 'import',snapshot_id,timestamp));ids.append(snapshot_id)
        return ids
    def remove(self,year,week):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT snapshot_id FROM active WHERE year=? AND week=?',(year,week)).fetchone()
            if current:
                db.execute('DELETE FROM active WHERE year=? AND week=?',(year,week))
                db.execute('INSERT INTO events(action,snapshot_id,created_at) VALUES(?,?,?)',('remove',current['snapshot_id'],datetime.now(timezone.utc).isoformat()))
    def restore(self,snapshot_id):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE');snapshot=db.execute('SELECT * FROM snapshots WHERE id=?',(snapshot_id,)).fetchone()
            if snapshot is None:raise HistoryError('noVersion')
            conflict=db.execute('SELECT a.year,a.week FROM active a JOIN snapshots s ON s.id=a.snapshot_id WHERE s.sha256=? AND (a.year<>? OR a.week<>?)',(snapshot['sha256'],snapshot['year'],snapshot['week'])).fetchone()
            if conflict:raise HistoryError('fileOtherPeriod',period=period_label(conflict['year'],conflict['week']))
            db.execute('INSERT INTO active VALUES(?,?,?) ON CONFLICT(year,week) DO UPDATE SET snapshot_id=excluded.snapshot_id',(snapshot['year'],snapshot['week'],snapshot_id))
            db.execute('INSERT INTO events(action,snapshot_id,created_at) VALUES(?,?,?)',('restore',snapshot_id,datetime.now(timezone.utc).isoformat()))
    def snapshots(self):
        with closing(self.connect()) as db:
            return [ContinuitySnapshot(r['id'],r['year'],r['week'],r['filename'],r['sha256'],decode_source(r['payload'],r['filename']),r['created_at']) for r in db.execute('SELECT s.* FROM active a JOIN snapshots s ON s.id=a.snapshot_id ORDER BY s.year,s.week')]


def default_range(snapshots):
    if not snapshots:return None,None
    first=min(s.day for s in snapshots);last=max(s.day for s in snapshots)
    return max(first,last-timedelta(weeks=11)),last


def calendar_weeks(start,end):
    if end<start:raise HistoryError('rangeOrder')
    weeks=[]
    while start<=end:
        iso=start.isocalendar();weeks.append((iso.year,iso.week));start+=timedelta(weeks=1)
    return weeks


@dataclass
class ProjectTimeline:
    key: tuple
    job: str
    project: str
    review: bool
    observations: list


@dataclass
class Timeline:
    snapshots: list
    weeks: list
    projects: list
    latest: tuple | None
    team: str
    brand: str
    search: str
    latest_only: bool


def build_timeline(snapshots,start=None,end=None,team='',brand='',search='',latest_only=True):
    snapshots=sorted(snapshots,key=lambda s:s.day)
    if not snapshots:return Timeline([],[],[],None,team,brand,search,latest_only)
    default_start,default_end=default_range(snapshots);start=start or default_start;end=end or default_end
    weeks=calendar_weeks(start,end);selected={(s.year,s.week):s for s in snapshots if start<=s.day<=end};latest=max(selected,key=lambda p:monday(*p)) if selected else None
    duplicates={job for s in snapshots for job,count in Counter(r.job for r in s.source.rows if r.job).items() if count>1}
    groups={}
    for period,snapshot in selected.items():
        for row in snapshot.source.rows:
            review=not row.job or (row.job in duplicates and not row.project)
            key=('review',str(snapshot.id),str(row.row)) if review else (row.job,row.project if row.job in duplicates else '')
            group=groups.setdefault(key,{'review':review,'periods':{}});group['periods'].setdefault(period,[]).append(row)
    projects=[]
    for key,group in groups.items():
        filtered={p:[r for r in rows if (not team or norm(r.values[3])==norm(team)) and (not brand or norm(r.values[6])==norm(brand))] for p,rows in group['periods'].items()}
        known=[r for period in weeks for r in filtered.get(period,[])]
        if not known or (latest_only and not filtered.get(latest)):continue
        if search and norm(search) not in norm(' '.join(str(r.values[c] or '') for r in known for c in (3,4,6,10))):continue
        observations=[]
        for period in weeks:
            snapshot=selected.get(period);rows=filtered.get(period,[])
            if snapshot is None:kind='weekMissing'
            elif not group['periods'].get(period):kind='projectMissing'
            elif not rows:kind='filteredOut'
            else:kind='present'
            observations.append({'period':period,'kind':kind,'snapshot':snapshot,'rows':rows,
                'status':described(rows,11) if rows else '', 'statusKnown':bool(rows and status_known(rows)),
                'statusKey':json.dumps(state_values(rows,11),ensure_ascii=False) if rows and status_known(rows) else '',
                'invoice':invoice_description(rows) if rows else '',
                'amounts':{currency:amount(rows,13+i) for i,currency in enumerate(CURRENCIES)}})
        label_rows=filtered.get(latest) or [known[-1]]
        projects.append(ProjectTimeline(key,text(label_rows[0].values[4]),text(label_rows[0].values[10]),group['review'],observations))
    projects.sort(key=lambda p:(norm(p.job),norm(p.project)))
    return Timeline(list(selected.values()),weeks,projects,latest,team,brand,search,latest_only)


def timeline_payload(snapshots,tr,timeline=None):
    timeline=timeline or build_timeline(snapshots)
    def row(r):return {'row':r.row,'values':[source_text(v) if v is not None else None for v in r.values],
        'numbers':[float(v) if isinstance(v,(int,float,Decimal)) and not isinstance(v,bool) else None for v in r.values],'missing':r.missing}
    duplicates=sorted({job for s in snapshots for job,count in Counter(r.job for r in s.source.rows if r.job).items() if count>1})
    return {'version':VERSION,'copy':{key:tr(key) for key in HISTORY_KEYS},'duplicates':duplicates,
        'snapshots':[{'id':s.id,'year':s.year,'week':s.week,'label':s.label,'filename':s.filename,'sha256':s.sha256,'rows':[row(r) for r in s.source.rows]} for s in timeline.snapshots],
        'initial':{'start':period_label(*timeline.weeks[0]) if timeline.weeks else '', 'end':period_label(*timeline.weeks[-1]) if timeline.weeks else '',
                   'team':timeline.team,'brand':timeline.brand,'search':timeline.search,'latestOnly':timeline.latest_only}}


HISTORY_KEYS=('title','team','brand','job','project','search','all','historyPage','start','end','latestOnly','allHistory',
    'status','invoice','sourceRows','row','period','source','importedWeeks','projects','missingWeeks','weekMissing',
    'projectMissing','filteredOut','fieldMissing','noHistory','noRows','selectProject','timelineNote','amountNote',
    'downloadCsv','detail','close','reset','review','filename','statusNote','rangeOrder','observation')


def export_timeline_csv(timeline,path,tr):
    stream=io.StringIO(newline='');writer=csv.writer(stream)
    writer.writerow([tr(k) for k in ('team','brand','job','project','period','status','invoice')]+list(CURRENCIES)+[tr(k) for k in ('source','sourceRows','observation')])
    for p in timeline.projects:
        for obs in p.observations:
            rows=obs['rows'];snapshot=obs['snapshot']
            values=[joined(rows,3),joined(rows,6),p.job,p.project,period_label(*obs['period']),obs['status'],obs['invoice']]
            values.extend(obs['amounts'][c]['total'] if obs['amounts'][c]['total'] is not None else (obs['amounts'][c]['text'] if rows else None) for c in CURRENCIES)
            values.extend([snapshot.filename if snapshot else '',', '.join(str(r.row) for r in rows),tr('review') if p.review and obs['kind']=='present' else tr(obs['kind'])])
            writer.writerow([safe_csv(v) for v in values])
    write_output(path,stream.getvalue(),None,'.csv')


def export_timeline_html(snapshots,path,tr,timeline=None):
    template=(Path(sys._MEIPASS)/'templates/continuity-report.html') if getattr(sys,'frozen',False) else Path(__file__).resolve().parents[1]/'tools/weekly-comparer/continuity-report.html'
    data=json.dumps(timeline_payload(snapshots,tr,timeline),ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    output=template.read_text(encoding='utf-8').replace('__TITLE__',html.escape(tr('historyPage'))).replace('__DATA__',data)
    write_output(path,output,None,'.html')
