"""Review DEHK original prices against an existing DDC execution snapshot."""

from argparse import ArgumentParser
from collections import Counter, defaultdict
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.order_matcher import Cell, Row, SourceBook, column_number, match_rows, norm

HEADERS = {
    'A': '*单据编号', 'M': '销售组织.名称', 'JT': '来源单据编号',
    'IC': '*项目编码.项目编码', 'GD': '*物料编码.编码', 'IZ': '*数量',
    'AD': '*结算币种.货币代码', 'JD': '单价', 'JZ': '含税单价',
}
MATCH_COLUMNS = {0: 'A', 1: 'JT', 4: 'A', 6: 'IC', 7: 'GD', 8: 'GE', 10: 'IZ', 11: 'AD', 12: 'JD', 97: 'JZ'}
DEHK_NAMES = re.compile(r'DE\s*HK(?:\s+LIMITED)?', re.IGNORECASE)


def read_orders(file, organization, order_ids=None):
    def get(row, col):
        return row.get(column_number(col) - 1)

    with SourceBook(file) as book:
        head, *rows = book.rows('sheet1')
        if any(get(head, col) != name for col, name in HEADERS.items()):
            raise ValueError(f'{file.name}: unsupported sales order list layout')
        result = [Row(1, {})]
        for row in rows:
            order = norm(get(row, 'A'))
            if not order:
                continue
            if norm(get(row, 'M')) != organization:
                raise ValueError(f'{file.name}: unexpected sales organization in row {row.number}')
            if order_ids is not None and order not in order_ids:
                continue
            cells = {index: Cell(get(row, col)) for index, col in MATCH_COLUMNS.items()}
            cells[2] = Cell(' '.join(norm(get(row, col)) for col in ['IB', 'BB', 'BC']))
            result.append(Row(row.number, cells))
        return result


def execution_key(row):
    return norm(row['order']), norm(row['item']), norm(Decimal(str(row['quantity'])))


def workbook_key(row):
    return tuple(norm(row.get(index)) for index in (4, 7, 10))


def confirmed_prices(matches):
    verified = []
    for match in matches:
        if match.status != 'matched':
            return None
        reference = norm(match.row.get(1))
        quotes = {(norm(row.get(4)), norm(row.get(11)), row.get(97)) for row in match.sources}
        if len(quotes) != 1:
            return None
        original, currency, gross = quotes.pop()
        if ((reference and original != reference) or not original or
                currency not in {'CNY', 'EUR', 'USD', 'HKD'} or
                match.sources[0].get(12) is None or
                not isinstance(gross, Decimal) or not gross.is_finite()):
            return None
        verified.append((original, currency, gross))
    identities = set(verified)
    if len(identities) != 1:
        return None
    original, currency, gross = identities.pop()
    return {
        'originalOrder': original, 'currency': currency, 'grossUnitPrice': float(gross),
        'sourceRows': sorted({row.number for match in matches for row in match.sources}),
    }


def review(snapshot, ddc_file, dehk_file):
    if snapshot.get('entityId') != 'ddc':
        raise ValueError('The execution snapshot must be for DDC')
    lines = [row for row in snapshot['lines'] if DEHK_NAMES.fullmatch(row['customer'].strip())]
    ids = {norm(row['order']) for row in lines}
    if not ids:
        raise ValueError('The execution snapshot has no DEHK intercompany orders')
    ddc = read_orders(ddc_file, '迪亚姆展示设备（昆山）有限公司', ids)
    dehk = read_orders(dehk_file, 'DEHK')
    if Counter(map(execution_key, lines)) != Counter(map(workbook_key, ddc[1:])):
        raise ValueError('The DDC list does not reconcile on order, material and quantity to the execution snapshot')

    matches = defaultdict(list)
    for entry in match_rows(ddc, dehk):
        matches[workbook_key(entry.row)].append(entry)
    quotes = {key: confirmed_prices(rows) for key, rows in matches.items()}
    prices = [
        {'order': line['order'], 'line': line['line'], **quote}
        for line in lines if (quote := quotes[execution_key(line)]) is not None
    ]
    if not prices:
        raise ValueError('The two workbooks have no confirmed DEHK prices for this snapshot')
    source_stamp = sha256()
    sources = []
    for file in (ddc_file, dehk_file):
        digest = sha256(file.read_bytes()).hexdigest()
        source_stamp.update(digest.encode('ascii'))
        sources.append({'file': file.name, 'sheet': 'sheet1', 'sha256': digest})
    source_stamp.update(snapshot['asOf'].encode('ascii'))
    return {
        'id': source_stamp.hexdigest(), 'sources': sources, 'prices': prices,
    }, {'confirmed': len(prices), 'pending': len(lines) - len(prices)}


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('ddc', type=Path)
    parser.add_argument('dehk', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding='utf-8'))
    pricing, coverage = review(snapshot, args.ddc, args.dehk)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(pricing, output, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(coverage))
