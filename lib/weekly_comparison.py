"""Read-only first-sheet weekly comparison. No Excel automation or network access."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import html
import io
import json
import os
from pathlib import Path
import re
import tempfile
import sys

import openpyxl
from openpyxl.utils import get_column_letter

VERSION = '1.2.0'
EPSILON = Decimal('0.000001')


class CompareError(ValueError):
    def __init__(self, key, **params):
        self.key, self.params = key, params
        super().__init__(f'{key}: {params}')


class Translator:
    def __init__(self, root, language='zh-CN'):
        self.messages = json.loads((Path(root) / 'locales' / f'{language}.json').read_text(encoding='utf-8'))

    def tr(self, key, **params):
        value = self.messages.get('weeklyComparer.' + key, key)
        for name, replacement in params.items():
            value = value.replace('{' + name + '}', str(replacement))
        return value


def number(value):
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return Decimal(str(value))
    return None


def equal(a, b):
    x, y = number(a), number(b)
    return abs(x - y) <= EPSILON if x is not None and y is not None else type(a) is type(b) and a == b


def display(value):
    if value is None:
        return '∅'
    if number(value) is not None:
        return f'{number(value):,.2f}'
    if isinstance(value, (date, datetime)):
        return value.strftime('%Y-%m-%d')
    return str(value)


def exact(value):
    if value is None:
        return ''
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def identity(values):
    return tuple(re.sub(r'\s+', ' ', str(v)).strip().casefold() for v in values[:4])


@dataclass
class Record:
    row: int
    values: tuple
    formulas: tuple
    hidden: bool


@dataclass
class Issue:
    side: str
    cell: str
    key: str
    detail: str = ''


@dataclass
class Source:
    path: Path
    sheet: str
    headers: tuple
    records: dict
    issues: list
    hidden: int


@dataclass
class Change:
    key: tuple
    before: Record | None
    after: Record | None
    kind: str
    fields: tuple
    reference: tuple

    @property
    def record(self):
        return self.after or self.before

    @property
    def delta(self):
        a = number(self.before.values[22]) if self.before else Decimal(0)
        b = number(self.after.values[22]) if self.after else Decimal(0)
        return b - a if a is not None and b is not None else None


@dataclass
class Result:
    old: Source
    new: Source
    rows: list
    issues: list

    @property
    def changed(self):
        return [r for r in self.rows if r.kind not in ('unchanged', 'reference')]

    def total(self, source, column):
        values = [number(r.values[column - 1]) for r in source.records.values()]
        return sum(values, Decimal(0)) if all(v is not None for v in values) else None

    @property
    def net(self):
        a, b = self.total(self.old, 23), self.total(self.new, 23)
        return b - a if a is not None and b is not None else None


def load_source(path, side):
    path = Path(path).resolve()
    if path.suffix.lower() != '.xlsx' or not path.is_file():
        raise CompareError('errorFile', file=path.name)
    formulas = cached = None
    try:
        # Read a snapshot and release the Windows source handle immediately. Normal-mode
        # openpyxl can otherwise retain a source handle until garbage collection.
        payload = path.read_bytes()
        formulas = openpyxl.load_workbook(io.BytesIO(payload), data_only=False, keep_links=False)
        cached = openpyxl.load_workbook(io.BytesIO(payload), data_only=True, keep_links=False)
        sf, sv = formulas.worksheets[0], cached.worksheets[0]
        headers = tuple(sv.cell(1, c).value for c in range(1, 28))
        expected = {1: 'team', 2: 'dehk/ddc', 3: 'external or group', 10: 'ytd'}
        if any(str(headers[c-1]).strip().casefold() != name for c, name in expected.items()) or 'customer' not in str(headers[3]).lower() or 'fcst' not in str(headers[22]).lower():
            raise CompareError('errorTemplate', file=path.name)
        if sf.max_row > 100000 or sf.max_column > 1000:
            raise CompareError('errorSize', file=path.name)
        records, issues, totals = {}, [], []
        for row in range(2, sf.max_row + 1):
            values = tuple(sv.cell(row, c).value for c in range(1, 28))
            if str(values[3]).strip().casefold() == 'total' and not any(values[:3]):
                totals.append(row)
                continue
            if values[1] is None and values[2] is None and values[3] is None:
                continue  # exchange-rate notes / footer / formatting, never records
            if not all(isinstance(v, str) and v.strip() for v in values[:4]):
                raise CompareError('errorIdentity', file=path.name, row=row)
            if str(values[2]).strip().casefold() not in ('external', 'group'):
                raise CompareError('errorIdentity', file=path.name, row=row)
            key = identity(values)
            if key in records:
                raise CompareError('errorDuplicate', file=path.name, row=row, other=records[key].row)
            expr = tuple(sf.cell(row, c).value if sf.cell(row, c).data_type == 'f' else None for c in range(1, 28))
            records[key] = Record(row, values, expr, bool(sf.row_dimensions[row].hidden))
            for c, value in enumerate(values, 1):
                if sv.cell(row, c).data_type == 'e':
                    issues.append(Issue(side, f'{get_column_letter(c)}{row}', 'issueExcelError', exact(value)))
                if expr[c-1] and value is None:
                    issues.append(Issue(side, f'{get_column_letter(c)}{row}', 'issueCache'))
            for c in (23, 24, 27):
                if values[c-1] is None:
                    detail = ''
                    if c == 27 and number(values[22]) is not None and number(values[25]) is not None:
                        detail = 'W - Z = ' + display(number(values[22])-number(values[25]))
                    issues.append(Issue(side, f'{get_column_letter(c)}{row}', 'issueBlank', detail))
            # Independent reconciliation; SUM ignores actual blanks, but not missing formula caches.
            monthly = values[11:22]
            usable = all(v is None or number(v) is not None for v in monthly) and not any(expr[c] and values[c] is None for c in range(11, 22))
            w = number(values[22])
            if usable and w is not None:
                total = sum((number(v) for v in monthly if v is not None), Decimal(0))
                if abs(total - w) > EPSILON:
                    issues.append(Issue(side, f'W{row}', 'issueSum', f'{display(w)} / {display(total)}'))
            if number(values[26]) is not None and w is not None and number(values[25]) is not None:
                delta = w - number(values[25])
                if abs(number(values[26]) - delta) > EPSILON:
                    issues.append(Issue(side, f'AA{row}', 'issueDifference', f'{display(values[26])} / {display(delta)}'))
        if not records:
            raise CompareError('errorEmpty', file=path.name)
        hidden = sum(r.hidden for r in records.values())
        if hidden:
            issues.append(Issue(side, '', 'issueHidden', str(hidden)))
        for row in totals:
            for c in (10, 23, 24):
                vals = [number(r.values[c-1]) for r in records.values()]
                total = sum(vals, Decimal(0)) if all(v is not None for v in vals) else None
                current = number(sv.cell(row, c).value)
                if total is not None and current is not None and abs(total-current) > EPSILON:
                    issues.append(Issue(side, f'{get_column_letter(c)}{row}', 'issueFilteredTotal', f'{display(current)} / {display(total)}'))
        issues.append(Issue(side, 'Z1', 'issueReferenceHeader', exact(headers[25])))
        return Source(path, sf.title, headers, records, issues, hidden)
    except CompareError:
        raise
    except Exception as exc:
        raise CompareError('errorRead', file=path.name, reason=str(exc)) from exc
    finally:
        if formulas is not None:
            formulas.close()
        if cached is not None:
            cached.close()


def compare(old_path, new_path):
    if Path(old_path).resolve() == Path(new_path).resolve():
        raise CompareError('errorSame')
    old, new = load_source(old_path, 'old'), load_source(new_path, 'new')
    for c in range(27):
        if c != 25 and not equal(old.headers[c], new.headers[c]):
            raise CompareError('errorHeaders', column=get_column_letter(c+1), old=display(old.headers[c]), new=display(new.headers[c]))
    rows, issues = [], old.issues + new.issues
    for key in dict.fromkeys([*old.records, *new.records]):
        a, b = old.records.get(key), new.records.get(key)
        fields = tuple(c for c in range(24) if a and b and not equal(a.values[c], b.values[c]))
        refs = tuple(c for c in (25, 26) if a and b and not equal(a.values[c], b.values[c]))
        if a is None:
            kind = 'added'
        elif b is None:
            kind = 'removed'
        elif fields:
            x, y = number(a.values[22]), number(b.values[22])
            if x is not None and y is not None and abs(y-x) > EPSILON:
                kind = 'increase' if y > x else 'decrease'
            elif x is not None and y is not None and any(c in range(11,22) for c in fields) and all(c in range(11,24) for c in fields):
                kind = 'rescheduled'
            else:
                kind = 'modified'
        else:
            kind = 'reference' if refs else 'unchanged'
        rows.append(Change(key, a, b, kind, fields, refs))
        if a and b and number(b.values[25]) is not None and number(a.values[22]) is not None and abs(number(b.values[25])-number(a.values[22])) > EPSILON:
            issues.append(Issue('new', f'Z{b.row}', 'issueBaseline', f'{display(b.values[25])} / {display(a.values[22])}'))
    return Result(old, new, rows, issues)


def safe_csv(value):
    text = exact(value)
    return "'" + text if isinstance(value, str) and text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else text


def overview(rows):
    """Shared chart aggregates; identity removals/additions have structural zero only."""
    def total(side, column, monthly=False):
        values = []
        for row in rows:
            record = getattr(row, side)
            if record is None:
                continue
            value = record.values[column]
            if monthly and value is None and not record.formulas[column]:
                continue
            n = number(value)
            if n is None:
                return None
            values.append(n)
        return sum(values, Decimal(0)) if values or not monthly else None
    old, new = total('before',22), total('after',22)
    net = new-old if old is not None and new is not None else None
    known = [r.delta for r in rows if r.delta is not None]
    return {'old':old,'new':new,'net':net,
            'positive':sum((d for d in known if d>0),Decimal(0)),
            'negative':sum((d for d in known if d<0),Decimal(0)),
            'incomplete':any(r.delta is None for r in rows),
            'changed':sum(r.kind not in ('unchanged','reference') for r in rows),
            'added':sum(r.kind=='added' for r in rows), 'removed':sum(r.kind=='removed' for r in rows),
            'increased':sum(r.kind=='increase' for r in rows), 'decreased':sum(r.kind=='decrease' for r in rows),
            'rescheduled':sum(r.kind=='rescheduled' for r in rows),
            'months':[{'column':c,'old':total('before',c,True),'new':total('after',c,True)} for c in range(11,22)]}


def report_payload(result, tr):
    def record(rec):
        if rec is None:
            return None
        return {'row':rec.row,'values':[None if v is None else exact(v) for v in rec.values],
                'numbers':[float(number(v)) if number(v) is not None else None for v in rec.values],
                'missing':[c for c in range(27) if rec.formulas[c] and rec.values[c] is None],
                'hidden':rec.hidden}
    return {'version':VERSION,'old':{'file':result.old.path.name,'sheet':result.old.sheet},
            'new':{'file':result.new.path.name,'sheet':result.new.sheet},
            'headers':[tr('expectedAmount') if c==22 else display(h) for c,h in enumerate(result.new.headers)],
            'copy':{k:tr(k) for k in TranslatorKeys},
            'rows':[{'id':i,'kind':r.kind,'identity':list(r.record.values[:4]),'old':record(r.before),
                     'new':record(r.after),'delta':float(r.delta) if r.delta is not None else None,
                     'fields':r.fields} for i,r in enumerate(result.rows)],
            'issues':[{'side':tr(i.side),'cell':i.cell,'message':tr(i.key),'detail':i.detail} for i in result.issues]}


TranslatorKeys = ('title','visualTitle','visualHint','old','new','oldFcst','newFcst','netChange','changedRecords',
                 'added','removed','increased','decreased','rescheduled','unitNote','flowTitle','rankingTitle',
                 'monthsTitle','chartHint','noRows','all','team','entity','salesType','search','detailKind',
                 'customer','delta','kind','oldValue','newValue','field','detail','changes',
                 'issues','source','cell','issue','evidence','scope','precision','referenceNote','close',
                 'chooseCustomer','sourceEvidence','showing','reset','monthNote','incomplete','noMonthChanges',
                 'knownIncrease','knownDecrease','records','emptyRanking','selectedFilters',
                 *('kind.'+k for k in ('allChanges','added','removed','increase','decrease','rescheduled','modified','unchanged','allRows')))


def write_output(path, content, result, extension):
    target = Path(path).resolve()
    if (result is not None and target in (result.old.path, result.new.path)) or target.suffix.lower() != extension:
        raise CompareError('errorOutput')
    # Replace atomically; an interrupted export never leaves a partial report.
    fd, temp = tempfile.mkstemp(dir=target.parent, prefix='.weekly-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8-sig' if extension == '.csv' else 'utf-8', newline='') as stream:
            stream.write(content)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def export_csv(result, path, tr):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow([tr(k) for k in ('kind', 'team', 'entity', 'salesType', 'customer', 'oldFile', 'newFile', 'oldSheet', 'newSheet', 'oldRow', 'newRow', 'field', 'oldValue', 'newValue')])
    for row in result.rows:
        if row.kind in ('unchanged','reference'):
            continue
        cols = row.fields if row.before and row.after else [c for c in range(24) if row.record.values[c] is not None]
        for c in cols:
            values = [tr('kind.'+row.kind), *row.record.values[:4], result.old.path.name, result.new.path.name, result.old.sheet, result.new.sheet, row.before.row if row.before else None, row.after.row if row.after else None, get_column_letter(c+1)+' '+(tr('expectedAmount') if c==22 else display(result.new.headers[c])), row.before.values[c] if row.before else None, row.after.values[c] if row.after else None]
            writer.writerow([safe_csv(v) for v in values])
    write_output(path, stream.getvalue(), result, '.csv')


def export_html(result, path, tr):
    template = (Path(sys._MEIPASS) / 'templates' / 'report.html') if getattr(sys, 'frozen', False) else (Path(__file__).resolve().parents[1] / 'tools' / 'weekly-comparer' / 'report.html')
    # JSON is inert data. Escape HTML delimiters so workbook text cannot end the data element.
    payload = json.dumps(report_payload(result, tr), ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    content = template.read_text(encoding='utf-8').replace('__REPORT_TITLE__',html.escape(tr('title'))).replace('__REPORT_DATA__',payload)
    write_output(path, content, result, '.html')
