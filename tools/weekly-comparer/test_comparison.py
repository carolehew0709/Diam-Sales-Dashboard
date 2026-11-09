"""Synthetic workbooks only. Private owner workbooks are never test fixtures."""
import csv
from decimal import Decimal
import hashlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import shutil
from xml.sax.saxutils import escape
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'lib'))
from weekly_comparison import CompareError, Translator, compare, export_csv, export_html, load_source, overview, report_payload


HEADERS = ['Team','DEHK/DDC','External or Group','Customer（Bill to）','1月开票','2月开票','3月开票','4月开票','备注','YTD','5月INV','2026-08-26','2026-11-26','2026-12-26','2027-01-27','2027-02-27','2027-03-27','2027-04-27','2027-05-27','2027-06-27','2027-12-27','TBC','Total（FCST）','Total(INV+FCST）',None,'WK43','差异']


def fixture(path, records, hidden=(), headers=None, total=None):
    def cell(c, r, value):
        from openpyxl.utils import get_column_letter
        coord = get_column_letter(c)+str(r)
        if value is None: return ''
        if isinstance(value, tuple):
            formula, cached = value
            return f'<c r="{coord}"><f>{escape(formula)}</f>'+('' if cached is None else f'<v>{cached}</v>')+'</c>'
        if isinstance(value, (int,float,Decimal)):
            return f'<c r="{coord}"><v>{value}</v></c>'
        return f'<c r="{coord}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'
    rows = [headers or HEADERS, *records]
    if total is not None: rows.append(total)
    data=''.join(f'<row r="{r}"'+(' hidden="1"' if r in hidden else '')+'>'+''.join(cell(c,r,v) for c,v in enumerate(row,1))+'</row>' for r,row in enumerate(rows,1))
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="汇总" sheetId="1" r:id="rId1"/><sheet name="Ignore" sheetId="2" r:id="rId2"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+data+'</sheetData></worksheet>')
        z.writestr('xl/worksheets/sheet2.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Unrelated data</t></is></c></row></sheetData></worksheet>')


def record(name='Customer A', amount=100, entity='DDC', team='Team A', month=None):
    row=[None]*27
    row[:4]=[team,entity,'External',name]
    row[9]=0; row[12]=amount if month is None else month
    row[22]=amount; row[23]=amount; row[25]=100; row[26]=amount-100
    return row


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.folder=Path(self.temp.name)
        self.a=self.folder/'上周.xlsx'; self.b=self.folder/'本周.xlsx'
        self.tr=Translator(ROOT).tr

    def tearDown(self): self.temp.cleanup()

    def run_pair(self, a, b, **kwargs):
        fixture(self.a,a,**kwargs); fixture(self.b,b)
        return compare(self.a,self.b)

    def test_reorder_and_hidden_rows_do_not_create_changes(self):
        result=self.run_pair([record('A'),record('B')],[record('B'),record('A')],hidden=(2,))
        self.assertEqual(len(result.changed),0)
        self.assertEqual(result.old.hidden,1)
        self.assertEqual(result.total(result.old,23),Decimal(200))
        self.assertTrue(any(i.key=='issueHidden' for i in result.issues))

    def test_added_removed_and_amount_start_are_distinct(self):
        result=self.run_pair([record('A'),record('B',0)],[record('B',40),record('C',10)])
        self.assertEqual([r.kind for r in result.rows],['removed','increase','added'])
        self.assertEqual(result.net,Decimal(-50))

    def test_reordered_relative_formulas_are_not_modifications(self):
        a=record('A'); b=record('B'); a[22]=('SUM(L2:V2)',100); b[22]=('SUM(L3:V3)',100)
        moved_a=record('A'); moved_b=record('B')
        moved_a[22]=('SUM(L3:V3)',100); moved_b[22]=('SUM(L2:V2)',100)
        result=self.run_pair([a,b],[moved_b,moved_a])
        self.assertEqual(len(result.changed),0)

    def test_month_transfer_keeps_total(self):
        a=record(); b=record(); b[12]=None; b[13]=100
        result=self.run_pair([a],[b]); row=result.changed[0]
        self.assertEqual(row.kind,'rescheduled'); self.assertEqual(row.delta,0)
        self.assertEqual(row.fields,(12,13))

    def test_reference_changes_are_not_business_changes(self):
        a=record(); b=record(); b[25]=0; b[26]=100
        result=self.run_pair([a],[b]); self.assertEqual(len(result.changed),0)
        self.assertEqual(result.rows[0].kind,'reference')

    def test_formula_only_changes_are_excluded(self):
        a=record(); b=record(); a[22]=('SUM(L2:V2)',100); b[22]=('M2',100)
        result=self.run_pair([a],[b]); self.assertEqual(result.rows[0].kind,'unchanged')

    def test_formula_cache_missing_not_zero(self):
        a=record(); b=record(); b[22]=('SUM(L2:V2)',None)
        result=self.run_pair([a],[b]); self.assertIsNone(result.net)
        self.assertIsNone(result.rows[0].delta)
        self.assertTrue(any(i.key=='issueCache' for i in result.issues))

    def test_blank_and_zero_are_different(self):
        a=record(); b=record(); a[8]=None; b[8]=0
        result=self.run_pair([a],[b]); self.assertEqual(result.rows[0].kind,'modified')
        self.assertIn(8,result.rows[0].fields)

    def test_duplicate_key_stops(self):
        fixture(self.a,[record(),record()])
        with self.assertRaises(CompareError) as ctx: load_source(self.a,'old')
        self.assertEqual(ctx.exception.key,'errorDuplicate')

    def test_case_and_whitespace_identity(self):
        result=self.run_pair([record('  Customer A  ')],[record('customer a')])
        self.assertEqual(len(result.rows),1); self.assertEqual(result.rows[0].kind,'modified')

    def test_same_customer_different_entity_is_not_merged(self):
        result=self.run_pair([record(),record(entity='DEHK')],[record(),record(entity='DEHK')])
        self.assertEqual(len(result.rows),2)

    def test_identity_change_is_removed_added(self):
        result=self.run_pair([record(team='Old')],[record(team='New')])
        self.assertEqual([r.kind for r in result.rows],['removed','added'])

    def test_layout_change_stops(self):
        fixture(self.a,[record()]); headers=HEADERS.copy(); headers[12]='Different period'
        fixture(self.b,[record()],headers=headers)
        with self.assertRaises(CompareError) as ctx: compare(self.a,self.b)
        self.assertEqual(ctx.exception.key,'errorHeaders')

    def test_reference_week_header_may_change(self):
        fixture(self.a,[record()]); headers=HEADERS.copy(); headers[25]='WK44'
        fixture(self.b,[record()],headers=headers)
        self.assertEqual(len(compare(self.a,self.b).changed),0)

    def test_invalid_template_and_same_path(self):
        headers=HEADERS.copy(); headers[0]='Unknown'
        fixture(self.a,[record()],headers=headers)
        with self.assertRaises(CompareError): load_source(self.a,'old')
        with self.assertRaises(CompareError): compare(self.a,self.a)

    def test_incomplete_identity_stops(self):
        a=record(); a[3]=None; fixture(self.a,[a])
        with self.assertRaises(CompareError) as ctx: load_source(self.a,'old')
        self.assertEqual(ctx.exception.key,'errorIdentity')

    def test_precision_noise_is_ignored_but_real_change_remains(self):
        result=self.run_pair([record(amount=0.1+0.2)],[record(amount=0.3)])
        self.assertEqual(len(result.changed),0)
        result=self.run_pair([record(amount=0.3)],[record(amount=0.30001)])
        self.assertEqual(result.rows[0].kind,'increase')

    def test_reconciliation_issues(self):
        a=record(); a[12]=20; a[26]=10; a[23]=None
        fixture(self.a,[a],hidden=(2,),total=[None,None,None,'Total']+[None]*18+[('SUBTOTAL(109,W2:W2)',0)])
        source=load_source(self.a,'old'); keys={i.key for i in source.issues}
        self.assertTrue({'issueSum','issueDifference','issueBlank','issueHidden','issueFilteredTotal'} <= keys)

    def test_note_footer_is_not_record(self):
        fixture(self.a,[record(),['Exchange rate note']])
        self.assertEqual(len(load_source(self.a,'old').records),1)

    def test_exports_escape_text_retain_precision_and_preserve_sources(self):
        result=self.run_pair([record('=1+1',1)],[record('=1+1',Decimal('1.123456789'))])
        before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.a,self.b)}
        csv_path=self.folder/'details.csv'; html_path=self.folder/'report.html'
        export_csv(result,csv_path,self.tr); export_html(result,html_path,self.tr)
        data=list(csv.reader(io.StringIO(csv_path.read_text(encoding='utf-8-sig'))))
        self.assertIn("'=1+1",data[1]); self.assertIn('1.123456789',csv_path.read_text(encoding='utf-8-sig'))
        self.assertTrue(csv_path.read_bytes().startswith(b'\xef\xbb\xbf'))
        self.assertIn('charset="utf-8"',html_path.read_text(encoding='utf-8'))
        self.assertEqual(before,{p:hashlib.sha256(p.read_bytes()).hexdigest() for p in before})
        with self.assertRaises(CompareError): export_csv(result,self.a,self.tr)

    def test_html_escapes_customer_markup(self):
        result=self.run_pair([record('<script>alert(1)</script>',1)],[record('<script>alert(1)</script>',2)])
        target=self.folder/'report.html'; export_html(result,target,self.tr)
        content=target.read_text(encoding='utf-8')
        self.assertNotIn('<script>alert(1)',content); self.assertIn('\\u003cscript\\u003e',content)

    def test_visual_model_totals_and_no_formula_evidence(self):
        a=record('A',100); b=record('A',150); b[22]=('SUM(L2:V2)',150)
        result=self.run_pair([a,record('B',80)],[b,record('B',40)])
        model=overview(result.rows)
        self.assertEqual((model['old'],model['new'],model['net']),(180,190,10))
        self.assertEqual((model['positive'],model['negative']),(50,-40))
        self.assertEqual(overview([result.rows[0]])['net'],50)
        payload=report_payload(result,self.tr)
        self.assertNotIn('formulas',payload['rows'][0]['new'])
        self.assertNotIn('SUM(',str(payload))

    def test_month_chart_preserves_absence_and_missing_values(self):
        a=record(); b=record(); b[13]=('N2',None)
        result=self.run_pair([a],[b]); model=overview(result.rows)
        month=next(m for m in model['months'] if m['column']==13)
        self.assertIsNone(month['old']); self.assertIsNone(month['new'])

    def test_packaged_template_location(self):
        result=self.run_pair([record(amount=1)],[record(amount=2)])
        templates=self.folder/'templates'; templates.mkdir()
        shutil.copyfile(ROOT/'tools/weekly-comparer/report.html',templates/'report.html')
        with patch.object(sys,'frozen',True,create=True), patch.object(sys,'_MEIPASS',str(self.folder),create=True):
            export_html(result,self.folder/'packaged.html',self.tr)
        self.assertIn('report-data',(self.folder/'packaged.html').read_text(encoding='utf-8'))

    def test_locale_keys_match(self):
        a=Translator(ROOT,'en').messages; b=Translator(ROOT,'zh-CN').messages
        self.assertEqual({k for k in a if k.startswith('weeklyComparer.')},{k for k in b if k.startswith('weeklyComparer.')})


if __name__=='__main__': unittest.main()
