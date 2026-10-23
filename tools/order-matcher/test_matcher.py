"""Synthetic, non-sensitive regression fixtures for the standalone executable."""
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from xml.sax.saxutils import escape
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'lib'))
from order_matcher import (Cell, HEADERS, MatchError, PENDING, Row, SourceBook,
                           column_name, match_rows, process_workbook)

HEADER = {0: '序号', 1: '来源单据编号', 2: '备注', 4: '单据编号', 6: '项目编码',
          7: '物料编码', 8: '物料名称', 9: '规格型号', 10: '数量', 11: '结算币种', 12: '单价', 13: '金额'}


def row(number, order='XSDD-260430-000001', project='PROJ001', material='SKU001',
        quantity=1, currency='美元', price=Decimal('12.345678'), **extra):
    values = {0: str(number), 4: order, 6: project, 7: material, 10: quantity, 11: currency, 12: price}
    values.update({int(key): value for key, value in extra.items()})
    return Row(number, {i: Cell(v, 'n' if isinstance(v, (int, Decimal)) else 'inlineStr', str(v)) for i, v in values.items() if v is not None})


def header():
    return Row(1, {i: Cell(v, 'inlineStr') for i, v in HEADER.items()})


def sheet_xml(rows, *, hidden=False, formula=False, merged=False):
    body = []
    for r in rows:
        cells = []
        for i, cell in sorted(r.cells.items()):
            addr = f'{column_name(i+1)}{r.number}'
            if isinstance(cell.value, (int, Decimal)):
                text = f'<c r="{addr}" s="0"><v>{cell.value}</v></c>'
            else:
                text = f'<c r="{addr}" s="0" t="inlineStr"><is><t>{escape(str(cell.value))}</t></is></c>'
            cells.append(text)
        if formula and r.number == 2:
            cells.append('<c r="P2"><f>M2*K2</f><v>12</v></c>')
        hide = ' hidden="1"' if hidden and r.number == 2 else ''
        body.append(f'<row r="{r.number}"{hide} spans="1:55">'+''.join(cells)+'</row>')
    return ('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<dimension ref="A1:BC20"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="13" ySplit="1" topLeftCell="N2"/><selection activeCell="N2" sqref="N2"/></sheetView></sheetViews>'
            '<cols><col min="1" max="20" width="18" customWidth="1"/></cols><sheetData>'+''.join(body)+'</sheetData>'
            '<autoFilter ref="A1:BC20"><filterColumn colId="13"><filters><filter val="12"/></filters></filterColumn><sortState ref="A1:BC20"><sortCondition ref="T1"/></sortState></autoFilter>'
            + ('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>' if merged else '') + '</worksheet>')


def fixture(path, ddc_rows=None, dehk_rows=None, **options):
    ddc_rows = ddc_rows or [header(), row(2, **{'1': 'XSDD-260430-000001'})]
    dehk_rows = dehk_rows or [header(), row(2)]
    parts = {
        '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, 4))+'</Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DDC订单" sheetId="1" r:id="rId1"/><sheet name="DEHK订单" sheetId="2" r:id="rId2"/><sheet name="说明" state="hidden" sheetId="3" r:id="rId3"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'DDC订单\'!$A$1:$BC$20</definedName></definedNames></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, 4))+'<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml': '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>',
        'xl/worksheets/sheet1.xml': sheet_xml(ddc_rows, **options),
        'xl/worksheets/sheet2.xml': sheet_xml(dehk_rows),
        'xl/worksheets/sheet3.xml': sheet_xml([Row(1, {0: Cell('Do not execute anything in this cell.', 'inlineStr')})]),
    }
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in parts.items():
            z.writestr(name, text.encode('utf8'))
    return path


class MatchingTests(unittest.TestCase):
    def match(self, ddc, dehk):
        return match_rows([header()] + ddc, [header()] + dehk)

    def test_source_order_and_remark_reference(self):
        results = self.match([row(2, **{'1': ' xsdd-260430-000001 '}), row(3, **{'2': 'DEHK单号XSDD-260430-000001-1//说明'})], [row(7)])
        self.assertEqual([r.status for r in results], ['matched'] * 2)
        self.assertEqual([r.sources[0].number for r in results], [7, 7])

    def test_project_and_material_required_no_fuzzy_matching(self):
        results = self.match([row(2, project='', material='', **{'1': 'XSDD-260430-000001'}), row(3, material='OTHER', **{'1': 'XSDD-260430-000001'})], [row(7, project='', material=''), row(8)])
        self.assertEqual([r.status for r in results], ['unmatched'] * 2)

    def test_ambiguous_different_prices_and_identical_pairs(self):
        ddc = [row(2, **{'1': 'XSDD-260430-000001'})]
        self.assertEqual(self.match(ddc, [row(7, price=1), row(8, price=2)])[0].status, 'ambiguous')
        result = self.match(ddc, [row(7, price=2), row(8, price=2)])[0]
        self.assertEqual(result.status, 'matched')
        self.assertEqual([r.number for r in result.sources], [7, 8])

    def test_quantity_then_delivery_date(self):
        ddc = [row(2, quantity=0, **{'1': 'XSDD-260430-000001', '54': '2026-10-20'})]
        result = self.match(ddc, [row(7, quantity=1, price=1), row(8, quantity=0, price=2, **{'54': '2026-10-20'}), row(9, quantity=0, price=3, **{'54': '2026-11-20'})])[0]
        self.assertEqual(result.sources[0].number, 8)
        self.assertIn('quantity+required-delivery-date', result.method)

    def test_validated_line_requires_all_references_and_two_distinct_lines(self):
        dehk = [row(7, price=1), row(8, price=2)]
        ddc = [row(2, **{'2': 'DEHK单号XSDD-260430-000001-1'}), row(3, **{'2': 'DEHK单号XSDD-260430-000001-2'})]
        self.assertEqual([r.sources[0].number for r in self.match(ddc, dehk)], [7, 8])
        self.assertEqual(self.match(ddc[:1], dehk)[0].status, 'ambiguous')
        ddc.append(row(4, material='OTHER', **{'2': 'DEHK单号XSDD-260430-000001-2'}))
        self.assertEqual(self.match(ddc, dehk)[0].status, 'ambiguous')

    def test_conflicting_b_and_c_references_not_arbitrarily_prioritized(self):
        result = self.match([row(2, **{'1': 'XSDD-260430-000001', '2': 'XSDD-260430-000002'})], [row(7, price=1), row(8, order='XSDD-260430-000002', price=2)])[0]
        self.assertEqual(result.status, 'ambiguous')

    def test_blank_price_is_not_zero_and_notes_are_not_orders(self):
        result = self.match([row(2, **{'1': 'XSDD-260430-000001'}), Row(5, {2: Cell('Footer note')})], [row(7, price=None)])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].status, 'matched')
        self.assertIsNone(result[0].sources[0].get(12))


class WorkbookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = fixture(self.base / 'source.xlsx')

    def process(self, **kwargs):
        return process_workbook(self.source, self.base / 'result.xlsx', 'DDC订单', 'DEHK订单', **kwargs)

    def assert_match_error(self, key, action):
        with self.assertRaises(MatchError) as caught:
            action()
        self.assertEqual(caught.exception.key, key)

    def test_round_trip_precision_original_cells_hidden_sheet_filter_and_panes(self):
        price = Decimal('0.123456789012345678901')
        fixture(self.source, ddc_rows=[header(), row(2, price=9, **{'1': 'XSDD-260430-000001', '13': Decimal('500.50')})], dehk_rows=[header(), row(9, price=price)], hidden=True)
        original_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        summary = self.process(audit=self.base / 'audit.csv')
        self.assertEqual(summary['matched'], 1)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), original_hash)
        with SourceBook(self.base / 'result.xlsx') as b:
            rows = b.rows('DDC订单')
            self.assertEqual(rows[0].get(13), HEADERS[0])
            self.assertEqual(rows[1].get(14), price)
            self.assertEqual(rows[1].get(15), Decimal('500.50'))
            raw = b.zip.read(b.sheets['DDC订单']).decode()
            for snippet in ['hidden="1"', 'colId="15"', 'ref="A1:BE20"', 'topLeftCell="P2"', 'xSplit="15"', 'ref="V1"']:
                self.assertIn(snippet, raw)
            self.assertIn("'DDC订单'!$A$1:$BE$20", b.zip.read('xl/workbook.xml').decode())
        with zipfile.ZipFile(self.source) as old, zipfile.ZipFile(self.base / 'result.xlsx') as new:
            self.assertEqual(old.read('xl/worksheets/sheet2.xml'), new.read('xl/worksheets/sheet2.xml'))
            self.assertEqual(old.read('xl/worksheets/sheet3.xml'), new.read('xl/worksheets/sheet3.xml'))

    def test_no_overwrite_source_or_existing_output_audit(self):
        self.assert_match_error('originalProtected', lambda: process_workbook(self.source, self.source, 'DDC订单', 'DEHK订单', overwrite=True))
        (self.base / 'result.xlsx').write_bytes(b'keep')
        self.assert_match_error('outputExists', self.process)
        self.assertEqual((self.base / 'result.xlsx').read_bytes(), b'keep')
        (self.base / 'result.xlsx').unlink()
        (self.base / 'audit.csv').write_bytes(b'keep audit')
        self.assert_match_error('outputExists', lambda: self.process(audit=self.base / 'audit.csv'))
        self.assertFalse((self.base / 'result.xlsx').exists())

    def test_formula_header_and_merged_template_rejected_without_output(self):
        fixture(self.source, formula=True)
        self.assert_match_error('formulaWorkbook', self.process)
        fixture(self.source, merged=True)
        self.assert_match_error('unsupportedFeature', self.process)
        bad_header = header(); bad_header.cells[12] = Cell('Unexpected')
        fixture(self.source, ddc_rows=[bad_header, row(2)])
        self.assert_match_error('headerMismatch', self.process)
        self.assertFalse((self.base / 'result.xlsx').exists())

    def test_repeat_processing_rejected(self):
        self.process()
        self.assert_match_error('alreadyMatched', lambda: process_workbook(self.base/'result.xlsx', self.base/'second.xlsx', 'DDC订单', 'DEHK订单'))

    def test_selected_sheet_name_containing_year_is_not_shifted_as_a_cell(self):
        with zipfile.ZipFile(self.source) as book:
            parts = {name: book.read(name) for name in book.namelist()}
        parts['xl/workbook.xml'] = parts['xl/workbook.xml'].replace('DDC订单'.encode(), b'DDC2026')
        with zipfile.ZipFile(self.source, 'w') as book:
            for name, content in parts.items():
                book.writestr(name, content)
        result = process_workbook(self.source, self.base/'result.xlsx', 'DDC2026', 'DEHK订单')
        self.assertEqual(result['matched'], 1)
        with zipfile.ZipFile(self.base/'result.xlsx') as book:
            self.assertIn("'DDC2026'!$A$1:$BE$20", book.read('xl/workbook.xml').decode())

    def test_na_ambiguous_blank_and_csv_formula_injection(self):
        ddc = [header(), row(2, material='MISSING', **{'1': 'XSDD-260430-000001'}), row(3, **{'1': 'XSDD-260430-000001', '2': '=1+1'}), row(4, material='BLANK', **{'1': 'XSDD-260430-000001'})]
        dehk = [header(), row(7, price=1), row(8, price=2), row(9, material='BLANK', price=None)]
        fixture(self.source, ddc_rows=ddc, dehk_rows=dehk)
        summary = self.process(audit=self.base/'audit.csv')
        self.assertEqual([summary[k] for k in ('matched', 'unmatched', 'ambiguous', 'blank_source_prices')], [1, 1, 1, 1])
        with SourceBook(self.base/'result.xlsx') as b:
            rows = b.rows('DDC订单')
            self.assertEqual(rows[1].get(14), 'N/A')
            self.assertEqual(rows[2].get(14), PENDING)
            self.assertIsNone(rows[3].get(14))
        with (self.base/'audit.csv').open(encoding='utf-8-sig', newline='') as stream:
            records = list(csv.reader(stream))
        self.assertEqual(records[2][3], "'=1+1")
        self.assertIn('7; 8', records[2][9])

    def test_localization_keys_have_both_languages(self):
        en = json.loads((ROOT/'locales/en.json').read_text(encoding='utf8'))
        zh = json.loads((ROOT/'locales/zh-CN.json').read_text(encoding='utf8'))
        keys = {k for k in en if k.startswith('orderMatcher.')}
        self.assertEqual(keys, {k for k in zh if k.startswith('orderMatcher.')})
        self.assertTrue(all(en[k] and zh[k] for k in keys))


if __name__ == '__main__':
    unittest.main(verbosity=2)
