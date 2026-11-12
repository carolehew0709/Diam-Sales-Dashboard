"""Synthetic on-going-DDC fixtures; no private workbook content is committed."""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape
import zipfile
import shutil
from openpyxl import Workbook

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'lib'))
from weekly_order_comparison import Row,Source,Result,Translator,CompareError,compare,stats,visible,export_csv,export_html,report_payload


def row(job='J1',project='Project',team='A',brand='B',status='Production',rmb=None,usd=10,eur=8,invoice=None,order=None):
    values=[None]*24
    for c,v in ((1,order),(3,team),(4,job),(6,brand),(10,project),(11,status),(13,rmb),(14,usd),(15,eur),(19,invoice)):values[c]=v
    return values


def workbook(path,rows,sheet='on-going-DDC',bad_header=False):
    from openpyxl.utils import get_column_letter
    headers=[None]*24
    for c,v in ((1,'Order Date'),(3,'Team'),(4,'Job Number'),(6,'Brand'),(10,'Project Name'),(11,'Quotation \nStatus'),(13,'Order Amount (RMB)'),(14,'Order Amount (USD)'),(15,'Order Amount (EUR)'),(19,'Invoice Date')):headers[c]=v
    if bad_header:headers[19]='Unexpected'
    def cell(r,c,value):
        if value is None:return ''
        ref=get_column_letter(c)+str(r)
        if isinstance(value,tuple):
            formula,cached=value;return f'<c r="{ref}"><f>{escape(formula)}</f>'+('' if cached is None else f'<v>{cached}</v>')+'</c>'
        if isinstance(value,(int,float)):return f'<c r="{ref}"><v>{value}</v></c>'
        return f'<c r="{ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
    xml=''.join(f'<row r="{r}">'+''.join(cell(r,c,v) for c,v in enumerate(values,1))+'</row>' for r,values in [(2,headers),*list(enumerate(rows,4))])
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml',f'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Unrelated first sheet" sheetId="1" r:id="rId1"/><sheet name="{sheet}" sheetId="2" r:id="rId2"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/blank.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/blank.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>')
        z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+xml+'</sheetData></worksheet>')


def opportunity_workbook(path, rows, job_header='项目编号.项目编码'):
    book = Workbook()
    sheet = book.create_sheet('列表数据')
    sheet.append(['商机名称', job_header, '预计成交日期', '结算币别.名称', '预计收入', '销售阶段', '销售组', '品牌.名称'])
    for values in rows:
        sheet.append(values)
    book.save(path)
    book.close()


class OrderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name);self.a=self.folder/'a.xlsx';self.b=self.folder/'b.xlsx';self.tr=Translator(ROOT).tr
    def tearDown(self):self.temp.cleanup()
    def pair(self,a,b):workbook(self.a,a);workbook(self.b,b);return compare(self.a,self.b)
    def test_named_sheet_not_first_and_reordering(self):
        result=self.pair([row('J1'),row('J2')],[row('J2'),row('J1')]);changes=result.changes();self.assertTrue(all(c['kind']=='unchanged' and c['same'] for c in changes))
    def test_unique_job_project_name_can_change_without_breaking_match(self):
        c=self.pair([row(project='Old')],[row(project='New',eur=9)]).changes();self.assertEqual(len(c),1);self.assertEqual(c[0]['kind'],'modified')
    def test_duplicate_job_uses_project_name(self):
        c=self.pair([row(project='A'),row(project='B')],[row(project='B',eur=9),row(project='A')]).changes();self.assertEqual(len(c),2);self.assertEqual(sum(x['kind']=='modified' for x in c),1)
    def test_same_job_and_project_aggregates_rows_and_retains_evidence(self):
        c=self.pair([row(eur=8),row(eur=2)],[row(eur=3),row(eur=7)]).changes()[0];self.assertEqual(c['kind'],'unchanged');self.assertEqual(c['amounts']['EUR']['old']['total'],10);self.assertEqual(len(c['old']),2)
    def test_brand_filter_recomputes_group_amounts(self):
        result=self.pair([row(brand='A',eur=8),row(brand='B',eur=2)],[row(brand='A',eur=9),row(brand='B',eur=5)]);c=result.changes(brand='A')[0];self.assertEqual(c['amounts']['EUR']['delta'],1);self.assertEqual(len(c['old']),1);self.assertEqual(len(c['new']),1)
    def test_state_unchanged_independent_of_amount_and_date(self):
        c=self.pair([row()],[row(eur=15,invoice='2026-11-30')]).changes()[0];self.assertTrue(c['same']);self.assertIn('date',c['flags']);self.assertIn('15',c['flags']);self.assertTrue(visible(c,'same'))
    def test_blank_and_unknown_status_not_marked_same(self):
        for status in (None,'','TBC'):
            c=self.pair([row(status=status)],[row(status=status)]).changes()[0];self.assertFalse(c['same'])
    def test_mixed_status_multiplicity_is_preserved(self):
        c=self.pair([row(status='A'),row(status='A'),row(status='B')],[row(status='A'),row(status='B'),row(status='B')]).changes()[0];self.assertFalse(c['same']);self.assertIn('status',c['flags'])
    def test_spelling_not_corrected(self):
        c=self.pair([row(status='Production')],[row(status='Porduction')]).changes()[0];self.assertFalse(c['same']);self.assertIn('status',c['flags'])
    def test_blank_amount_not_zero_and_tbc_stays_unknown(self):
        c=self.pair([row(eur=None)],[row(eur=0)]).changes()[0];self.assertIsNone(c['amounts']['EUR']['delta']);self.assertIn('15',c['flags'])
        c=self.pair([row(eur=8),row(eur='TBC')],[row(eur=10),row(eur='TBC')]).changes()[0];self.assertIsNone(c['amounts']['EUR']['new']['total']);self.assertIn('TBC',c['amounts']['EUR']['new']['text'])
    def test_currencies_are_independent(self):
        result=self.pair([row(rmb=70,usd=10,eur=8)],[row(rmb=77,usd=11,eur=9)]);c=result.changes()[0];self.assertEqual([c['amounts'][x]['delta'] for x in ('RMB','USD','EUR')],[7,1,1]);self.assertEqual(stats([c],'RMB')['positive'],7)
    def test_missing_job_retained_as_review(self):
        result=self.pair([row()],[row(),row(job=None)]);self.assertEqual(stats(result.changes())['review'],1);self.assertEqual(stats(result.changes())['added'],0)
    def test_filtered_assignment_change_not_global_add_remove(self):
        result=self.pair([row(brand='A')],[row(brand='B')]);self.assertEqual(result.changes(brand='A')[0]['kind'],'scope')
    def test_only_requested_fields_compared(self):
        a=row();b=row();b[16]='Different PO';b[18]='Different invoice number';b[3]='Other team'
        c=self.pair([a],[b]).changes()[0];self.assertEqual(c['kind'],'unchanged')
    def test_missing_date_not_taken_from_neighbor(self):
        a=row();b=row();a[18]='2026-01-01';b[18]='2026-02-01';self.assertEqual(self.pair([a],[b]).changes()[0]['kind'],'unchanged')
    def test_opportunity_export_maps_dates_currencies_and_duplicate_projects(self):
        previous = self.folder / '导出列表_商业机会.xlsx'
        opportunity_workbook(previous, [
            ('Project A', 'J1', '2026-11-12', '美元', 10, '报价', 'A', 'B'),
            ('Project A', 'J1', '2026-11-12', '人民币', 21, '报价', 'A', 'B'),
            ('Project B', 'J1', '2026-11-15', '欧元', 6, '生产', 'A', 'B'),
        ])
        workbook(self.b, [
            row(project='Project A', status='Quotation', rmb=21, usd=11, eur=9, invoice='2026-12-01', order='2026-11-12'),
            row(project='Project A', status='Quotation', rmb=0, usd=0, eur=3, invoice='2026-12-01', order='2026-11-12'),
            row(project='Project B', status='生产', eur=6, invoice='2026-11-15', order='2026-11-16'),
        ])
        result = compare(previous, self.b)
        self.assertEqual(result.old.sheet, '列表数据')
        a, b = result.changes(team='A', brand='B')
        self.assertEqual(a['flags'], ['14', 'status'])
        self.assertEqual(a['amounts']['USD']['delta'], 1)
        self.assertEqual(a['amounts']['RMB']['delta'], 0)
        self.assertIsNone(a['amounts']['EUR']['delta'])
        self.assertEqual(b['flags'], ['date'])
        self.assertTrue(b['same'])
        report = report_payload(result, self.tr)
        self.assertEqual(report['dateColumns'], {'old': 19, 'new': 1})
        self.assertEqual(report['oldRows'][0]['row'], 2)
        self.assertEqual(report['oldRows'][0]['unreportedAmounts'], (13, 15))
        target = self.folder / 'comparison.csv'
        export_csv(result, target, self.tr)
        with target.open(encoding='utf-8-sig', newline='') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(rows[0]['本周 Order Date'], '2026-11-12 × 2')
        self.assertEqual(rows[1]['上周预计成交日期'], '2026-11-15')

    def test_opportunity_import_alias_only_accepted_as_previous_file(self):
        from weekly_continuity import prepare_snapshot
        previous = self.folder / '导入列表.xlsx'
        opportunity_workbook(previous, [('Project', 'J1', None, 'USD', None, None, 'A', 'B')], '项目编码')
        workbook(self.b, [row()])
        change = compare(previous, self.b).changes()[0]
        self.assertIsNone(change['amounts']['USD']['delta'])
        with self.assertRaises(CompareError):
            compare(self.b, previous)
        with self.assertRaises(CompareError):
            prepare_snapshot(previous)
    def test_footer_not_a_project(self):
        footer=[None]*24;footer[15]=999999;result=self.pair([row(),footer],[row(),footer]);self.assertEqual(len(result.old.rows),1)
    def test_missing_cache_keeps_status_unknown(self):
        a=row();a[11]=('A1',None);c=self.pair([a],[a]).changes()[0];self.assertFalse(c['same'])
    def test_bad_sheet_and_headers_stop(self):
        workbook(self.a,[row()],sheet='other');workbook(self.b,[row()]);
        with self.assertRaises(CompareError):compare(self.a,self.b)
        workbook(self.a,[row()],bad_header=True)
        with self.assertRaises(CompareError):compare(self.a,self.b)
    def test_safe_filtered_export_and_immutable_inputs(self):
        result=self.pair([row(job='=1+1',brand='A'),row(job='J2',brand='B')],[row(job='=1+1',brand='A',eur=9),row(job='J2',brand='B',eur=10)])
        hashes=[hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.a,self.b)];target=self.folder/'out.csv';export_csv(result,target,self.tr,brand='A',mode='same');rows=list(csv.reader(io.StringIO(target.read_text(encoding='utf-8-sig'))));self.assertEqual(len(rows),2);self.assertIn("'=1+1",rows[1]);self.assertNotIn('J2',target.read_text(encoding='utf-8-sig'));self.assertEqual(hashes,[hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.a,self.b)])
    def test_html_safe_and_no_formula_payload(self):
        result=self.pair([row(project='</script><script>alert(1)</script>')],[row(project='</script><script>alert(1)</script>',eur=9)]);target=self.folder/'report.html';export_html(result,target,self.tr);content=target.read_text(encoding='utf-8');self.assertNotIn('</script><script>alert(1)',content);self.assertIn('\\u003c',content);self.assertNotIn('formulas',report_payload(result,self.tr)['oldRows'][0])
    def test_packaged_template(self):
        result=self.pair([row()],[row(eur=9)]);templates=self.folder/'templates';templates.mkdir();shutil.copy2(ROOT/'tools/weekly-comparer/report.html',templates/'report.html')
        with patch.object(sys,'frozen',True,create=True),patch.object(sys,'_MEIPASS',str(self.folder),create=True):export_html(result,self.folder/'packed.html',self.tr)


if __name__=='__main__':unittest.main()
