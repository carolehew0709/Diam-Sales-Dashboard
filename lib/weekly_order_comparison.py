"""Offline on-going-DDC comparison. Source rows remain immutable evidence."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import csv
import html
import io
import json
from pathlib import Path
import re
import sys

import openpyxl
from weekly_comparison import CompareError, display, exact, number, safe_csv, write_output

VERSION = '2.0.0'
SHEET = 'on-going-DDC'
CURRENCIES = ('RMB','USD','EUR')
EPSILON = Decimal('0.000001')


def norm(value):
    return re.sub(r'\s+', ' ', '' if value is None else str(value)).strip().casefold()


def text(value):
    if value is None: return '∅'
    if isinstance(value,(datetime,date)): return value.strftime('%Y-%m-%d')
    return str(value)


def canonical(value):
    if isinstance(value,(datetime,date)): return value.strftime('%Y-%m-%d')
    if number(value) is not None: return str(number(value).quantize(EPSILON))
    return norm(value)


class Translator:
    def __init__(self,root,language='zh-CN'):
        self.messages=json.loads((Path(root)/'locales'/f'{language}.json').read_text(encoding='utf-8'))

    def tr(self,key,**params):
        value=self.messages.get('weeklyOrders.'+key,self.messages.get('weeklyComparer.'+key,key))
        for name,replacement in params.items(): value=value.replace('{'+name+'}',str(replacement))
        return value


@dataclass(frozen=True)
class Row:
    row: int
    values: tuple
    missing: tuple = ()

    @property
    def job(self): return norm(self.values[4])
    @property
    def project(self): return norm(self.values[10])


@dataclass
class Source:
    path: Path
    rows: list
    issues: list
    sheet: str = SHEET


@dataclass
class Result:
    old: Source
    new: Source
    duplicate_jobs: set

    @property
    def issues(self): return self.old.issues+self.new.issues

    def changes(self,team='',brand='',search=''):
        grouped={}
        for side,source in (('old',self.old),('new',self.new)):
            for row in source.rows:
                invalid=not row.job or (row.job in self.duplicate_jobs and not row.project)
                key=('review',side,str(row.row)) if invalid else (row.job,row.project if row.job in self.duplicate_jobs else '')
                group=grouped.setdefault(key,{'key':key,'oldAll':[],'newAll':[],'review':invalid})
                group[side+'All'].append(row)
        changes=[]
        for group in grouped.values():
            for side in ('old','new'):
                group[side]=[r for r in group[side+'All'] if (not team or norm(r.values[3])==norm(team)) and (not brand or norm(r.values[6])==norm(brand))]
            if not group['old'] and not group['new']: continue
            rows=group['new'] or group['old']
            if search and norm(search) not in norm(' '.join(str(r.values[c] or '') for r in group['old']+group['new'] for c in (3,4,6,10))): continue
            old,new=group['old'],group['new']
            flags=[]
            for c in (13,14,15):
                a,b=amount(old,c),amount(new,c)
                if old and new and not amounts_equal(a,b): flags.append(str(c))
            if old and new and state_values(old,19)!=state_values(new,19): flags.append('date')
            if old and new and state_values(old,11)!=state_values(new,11): flags.append('status')
            if old and new and len(old)!=len(new): flags.append('rows')
            if group['review']: kind='review'
            elif not group['oldAll']: kind='added'
            elif not group['newAll']: kind='removed'
            elif not old or not new: kind='scope'
            elif flags: kind='modified'
            else: kind='unchanged'
            same=bool(old and new and not group['review'] and status_known(old) and status_known(new) and state_values(old,11)==state_values(new,11))
            changes.append({**group,'job':text(rows[0].values[4]),'project':text(rows[0].values[10]),
                'team':joined(rows,3),'brand':joined(rows,6),'kind':kind,'flags':flags,'same':same,
                'amounts':{currency:{'old':amount(old,13+i),'new':amount(new,13+i),'delta':delta(old,new,13+i)} for i,currency in enumerate(CURRENCIES)}})
        return changes


def joined(rows,column):
    return ' / '.join(dict.fromkeys(text(r.values[column]).replace('\n',' ') for r in rows))


def described(rows,column):
    counts=Counter(canonical(r.values[column]) for r in rows)
    labels={canonical(r.values[column]):text(r.values[column]).replace('\n',' ') for r in reversed(rows)}
    return ' / '.join(labels[key]+(f' × {count}' if count>1 else '') for key,count in counts.items())


def state_values(rows,column):
    # Preserve multiplicity without inventing correspondence between duplicate lines.
    return sorted(canonical(r.values[column]) for r in rows)


def status_known(rows):
    return all(norm(r.values[11]) not in ('','tbc','n/a','na','待定') and 11 not in r.missing for r in rows)


def amount(rows,column):
    values=[r.values[column] for r in rows]
    nums=[number(v) for v in values]
    known=sum((n for n in nums if n is not None),Decimal(0))
    complete=bool(values) and all(n is not None for n in nums) and not any(column in r.missing for r in rows)
    total=known if complete else None
    unknown=list(dict.fromkeys(text(v) for v,n in zip(values,nums) if n is None))
    label=display(total) if complete else ((display(known)+' + ') if any(n is not None for n in nums) else '')+' / '.join(unknown or ['∅'])
    return {'total':total,'known':known,'text':label,'signature':sorted(canonical(v) for v in values)}


def amounts_equal(a,b):
    if a['total'] is not None and b['total'] is not None: return abs(a['total']-b['total'])<=EPSILON
    return a['signature']==b['signature']


def delta(old,new,column):
    a=amount(old,column)['total'] if old else Decimal(0)
    b=amount(new,column)['total'] if new else Decimal(0)
    return b-a if a is not None and b is not None else None


def load_source(path,side):
    path=Path(path).resolve()
    if not path.is_file() or path.suffix.lower()!='.xlsx': raise CompareError('errorFile',file=path.name)
    books=[]
    try:
        payload=path.read_bytes()
        for values in (False,True): books.append(openpyxl.load_workbook(io.BytesIO(payload),data_only=values,keep_links=False))
        names=[name for name in books[0].sheetnames if norm(name)==norm(SHEET)]
        if len(names)!=1: raise CompareError('errorSheet',file=path.name)
        sf,sv=books[0][names[0]],books[1][names[0]]
        if sf.max_row>100000: raise CompareError('errorSize',file=path.name)
        expected={3:'team',4:'job number',6:'brand',10:'project name',11:'quotation status',19:'invoice date'}
        if any(norm(sv.cell(2,c+1).value)!=label for c,label in expected.items()): raise CompareError('errorTemplate',file=path.name)
        if any(currency.casefold() not in norm(sv.cell(2,c+14).value) for c,currency in enumerate(CURRENCIES)): raise CompareError('errorTemplate',file=path.name)
        rows=[];issues=[]
        for r in range(3,sf.max_row+1):
            values=tuple(sv.cell(r,c).value for c in range(1,25))
            if values[4] is None and values[10] is None: continue # blank, notes or footer total
            missing=tuple(c for c in (11,13,14,15,19) if (sf.cell(r,c+1).data_type=='f' and values[c] is None) or sv.cell(r,c+1).data_type=='e')
            row=Row(r,values,missing);rows.append(row)
            if not row.job: issues.append({'side':side,'row':r,'key':'missingJob'})
            if missing: issues.append({'side':side,'row':r,'key':'missingData'})
            if any(sv.cell(r,c+1).data_type=='e' for c in (11,13,14,15,19)): issues.append({'side':side,'row':r,'key':'missingData'})
        if not rows: raise CompareError('errorEmpty',file=path.name)
        return Source(path,rows,issues,names[0])
    except CompareError: raise
    except Exception as exc: raise CompareError('errorRead',file=path.name,reason=str(exc)) from exc
    finally:
        for book in books: book.close()


def compare(old_path,new_path):
    if Path(old_path).resolve()==Path(new_path).resolve(): raise CompareError('errorSame')
    old,new=load_source(old_path,'old'),load_source(new_path,'new')
    counts=[Counter(row.job for row in source.rows if row.job) for source in (old,new)]
    duplicate={job for count in counts for job,n in count.items() if n>1}
    for side,source in (('old',old),('new',new)):
        for row in source.rows:
            if row.job in duplicate and not row.project: source.issues.append({'side':side,'row':row.row,'key':'missingProject'})
    return Result(old,new,duplicate)


def stats(changes,currency='EUR'):
    deltas=[c['amounts'][currency]['delta'] for c in changes if c['kind']!='review']
    return {'projects':len(changes),'added':sum(c['kind']=='added' for c in changes),
            'removed':sum(c['kind']=='removed' for c in changes),'modified':sum(c['kind']=='modified' for c in changes),
            'amount':sum(any(f in c['flags'] for f in ('13','14','15')) for c in changes),
            'date':sum('date' in c['flags'] for c in changes),'status':sum('status' in c['flags'] for c in changes),
            'same':sum(c['same'] for c in changes),'review':sum(c['kind']=='review' for c in changes),
            'positive':sum((v for v in deltas if v is not None and v>0),Decimal(0)),
            'negative':sum((v for v in deltas if v is not None and v<0),Decimal(0)),
            'unknown':sum(v is None for v in deltas)}


def visible(change,mode):
    return mode=='all' or (mode=='same' and change['same']) or (mode=='status' and 'status' in change['flags']) or (mode=='date' and 'date' in change['flags']) or (mode=='amount' and any(f in change['flags'] for f in ('13','14','15'))) or (mode=='changed' and change['kind']!='unchanged') or change['kind']==mode


def export_csv(result,path,tr,team='',brand='',mode='all',search=''):
    stream=io.StringIO(newline='');writer=csv.writer(stream)
    keys=['team','brand','job','project','kind','same','oldStatus','newStatus','oldDate','newDate']
    writer.writerow([tr(k) for k in keys]+[f'{tr(side)} {currency}' for currency in CURRENCIES for side in ('old','new','delta')]+[tr('oldRows'),tr('newRows')])
    for c in result.changes(team,brand,search):
        if not visible(c,mode): continue
        values=[c['team'],c['brand'],c['job'],c['project'],tr('kind.'+c['kind']),tr('yes') if c['same'] else tr('no'),described(c['old'],11),described(c['new'],11),described(c['old'],19),described(c['new'],19)]
        for currency in CURRENCIES:
            m=c['amounts'][currency]
            values.extend([m[s]['total'] if m[s]['total'] is not None else m[s]['text'] for s in ('old','new')]+[m['delta']])
        values.extend([', '.join(str(r.row) for r in c[s]) for s in ('old','new')])
        writer.writerow([safe_csv(v) for v in values])
    write_output(path,stream.getvalue(),result,'.csv')


def report_payload(result,tr,team='',brand='',mode='changed',search='',currency='EUR'):
    def row(r):
        return {'row':r.row,'values':[text(v) if v is not None else None for v in r.values],
                'numbers':[float(number(v)) if number(v) is not None else None for v in r.values],'missing':r.missing}
    return {'version':VERSION,'sheet':SHEET,'old':result.old.path.name,'new':result.new.path.name,
            'duplicates':sorted(result.duplicate_jobs),'oldRows':[row(r) for r in result.old.rows],'newRows':[row(r) for r in result.new.rows],
            'copy':{k:tr(k) for k in COPY_KEYS},'initial':{'team':team,'brand':brand,'mode':mode,'search':search,'currency':currency},
            'issues':[{**i,'message':tr(i['key'])} for i in result.issues]}


COPY_KEYS=('title','subtitle','team','brand','job','project','kind','same','oldStatus','newStatus','oldDate','newDate',
           'old','new','delta','all','changed','amount','date','status','added','removed','modified','review','currency',
           'search','reset','yes','no','oldRows','newRows','summary','rankTitle','statusTitle','detail','sourceRows',
           'scope','sameNote','groupNote','amountNote','chooseProject','noRows','knownNet','notes','downloadCsv',
           'dataChanges','oldSource','newSource','projects','dataOnly','close','sourceSide','row','rawAmount',
           *('mode.'+k for k in ('changed','modified','all','same','amount','date','status','added','removed','review')),
           *('kind.'+k for k in ('added','removed','modified','unchanged','review','scope')))


def export_html(result,path,tr,team='',brand='',mode='changed',search='',currency='EUR'):
    template=(Path(sys._MEIPASS)/'templates/report.html') if getattr(sys,'frozen',False) else Path(__file__).resolve().parents[1]/'tools/weekly-comparer/report.html'
    data=json.dumps(report_payload(result,tr,team,brand,mode,search,currency),ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    output=template.read_text(encoding='utf-8').replace('__REPORT_TITLE__',html.escape(tr('title'))).replace('__REPORT_DATA__',data)
    write_output(path,output,result,'.html')
