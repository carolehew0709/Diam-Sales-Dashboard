"""Typed, transactional, multi-week regression fixtures; never private data."""
from datetime import date, datetime, timedelta
from contextlib import closing
from decimal import Decimal
from dataclasses import replace
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'lib'))
from weekly_order_comparison import Row,Source
from weekly_continuity import (HistoryStore,HistoryError,HistoryTranslator,PreparedSnapshot,ImportRequest,
    encode_source,prepare_snapshot,build_timeline,period_label,monday,default_range,
    export_timeline_csv,timeline_payload,suggest_period)
from test_orders import row,workbook


def prepared(rows,name='source.xlsx'):
    source=Source(Path(name),[Row(i,tuple(values)) for i,values in enumerate(rows,4)],[])
    payload=encode_source(source);return PreparedSnapshot(name,name,hashlib.sha256(payload.encode()).hexdigest(),payload,len(rows))


class ContinuityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name);self.path=self.folder/'history/continuity.sqlite';self.store=HistoryStore(self.path);self.tr=HistoryTranslator(ROOT).tr
    def tearDown(self):self.temp.cleanup()
    def add(self,week,rows,year=2026,replace=False):return self.store.import_batch([ImportRequest(prepared(rows,f'{year}-W{week}.xlsx'),year,week,replace)])[0]
    def test_batch_order_and_restart(self):
        self.store.import_batch([ImportRequest(prepared([row(status='B')]),2026,45),ImportRequest(prepared([row(status='A')]),2026,44)])
        again=HistoryStore(self.path);self.assertEqual([s.week for s in again.snapshots()],[44,45]);self.assertEqual(len(again.active_list()),2)
    def test_same_file_is_idempotent(self):
        p=prepared([row()]);a=self.store.import_batch([ImportRequest(p,2026,44)]);b=self.store.import_batch([ImportRequest(p,2026,44)]);self.assertEqual(a,b);self.assertEqual(len(self.store.versions()),1)
    def test_same_file_other_week_not_fabricated(self):
        p=prepared([row()]);self.store.import_batch([ImportRequest(p,2026,44)])
        with self.assertRaises(HistoryError):self.store.import_batch([ImportRequest(p,2026,45)])
        self.assertEqual(len(self.store.active_list()),1)
    def test_atomic_rollback_for_later_conflict(self):
        self.add(45,[row(eur=1)])
        with self.assertRaises(HistoryError):self.store.import_batch([ImportRequest(prepared([row(eur=2)]),2026,44),ImportRequest(prepared([row(eur=3)]),2026,45)])
        self.assertEqual([s.week for s in self.store.snapshots()],[45]);self.assertEqual(len(self.store.versions()),1)
    def test_database_write_failure_rolls_back_whole_batch(self):
        import sqlite3
        good=prepared([row(eur=1)]);bad=replace(prepared([row(eur=2)]),row_count=None)
        with self.assertRaises(sqlite3.IntegrityError):self.store.import_batch([ImportRequest(good,2026,44),ImportRequest(bad,2026,45)])
        self.assertFalse(self.store.active_list());self.assertFalse(self.store.versions())
    def test_invalid_period_and_duplicate_batch_leave_no_records(self):
        with self.assertRaises(HistoryError):self.add(53,[row()],year=2025)
        p=prepared([row()])
        with self.assertRaises(HistoryError):self.store.import_batch([ImportRequest(p,2026,44),ImportRequest(p,2026,44)])
        self.assertFalse(self.store.active_list())
    def test_replace_remove_restore_preserve_versions(self):
        a=self.add(44,[row(eur=1)]);b=self.add(44,[row(eur=2)],replace=True);self.assertNotEqual(a,b);self.assertEqual(len(self.store.versions()),2)
        self.store.remove(2026,44);self.assertFalse(self.store.snapshots());self.store.restore(a);self.assertEqual(self.store.snapshots()[0].source.rows[0].values[15],1)
        self.store.restore(b);self.assertEqual(self.store.snapshots()[0].source.rows[0].values[15],2)
    def test_typed_values_and_precision(self):
        values=row(invoice=datetime(2026,11,1,13,30),eur=Decimal('12.123456789'));values[0]=date(2026,1,1);values[14]='TBC';self.add(44,[values]);r=HistoryStore(self.path).snapshots()[0].source.rows[0]
        self.assertIsInstance(r.values[0],date);self.assertIsInstance(r.values[19],datetime);self.assertEqual(r.values[19].hour,13);self.assertEqual(r.values[15],Decimal('12.123456789'));self.assertEqual(r.values[14],'TBC')
        t=build_timeline(self.store.snapshots());self.assertIn('13:30',t.projects[0].observations[0]['invoice']);self.assertIn('13:30',timeline_payload(self.store.snapshots(),self.tr)['snapshots'][0]['rows'][0]['values'][19])
    def test_snapshot_survives_original_file_removed(self):
        file=self.folder/'2026-W44.xlsx';workbook(file,[row()]);p=prepare_snapshot(file);self.store.import_batch([ImportRequest(p,2026,44)]);file.unlink();self.assertEqual(self.store.snapshots()[0].source.rows[0].job,'j1')
    def test_iso_year_boundary(self):
        self.add(53,[row(eur=1)]);self.add(1,[row(eur=2)],year=2027);t=build_timeline(self.store.snapshots());self.assertEqual(t.weeks,[(2026,53),(2027,1)])
    def test_missing_week_has_no_carry_forward(self):
        self.add(44,[row(eur=1)]);self.add(46,[row(eur=2)]);t=build_timeline(self.store.snapshots());o=t.projects[0].observations
        self.assertEqual([x['kind'] for x in o],['present','weekMissing','present']);self.assertIsNone(o[1]['amounts']['EUR']['total']);self.assertEqual(o[1]['status'],'')
    def test_project_missing_then_returns(self):
        self.add(44,[row('J1')]);self.add(45,[row('J2')]);self.add(46,[row('J1',eur=2)]);p=build_timeline(self.store.snapshots()).projects[0];self.assertEqual([o['kind'] for o in p.observations],['present','projectMissing','present'])
    def test_latest_only_and_all_history(self):
        self.add(44,[row('J1'),row('J2')]);self.add(45,[row('J2',eur=9)]);self.assertEqual(len(build_timeline(self.store.snapshots()).projects),1);self.assertEqual(len(build_timeline(self.store.snapshots(),latest_only=False).projects),2)
    def test_latest_is_relative_to_selected_range(self):
        self.add(44,[row('J1')]);self.add(45,[row('J2')]);t=build_timeline(self.store.snapshots(),end=monday(2026,44));self.assertEqual(t.latest,(2026,44));self.assertEqual(t.projects[0].job,'J1')
    def test_duplicate_identity_is_from_full_history_not_filtered_range(self):
        self.add(44,[row('J1',project='A'),row('J1',project='B')]);self.add(45,[row('J1',project='B',eur=9)]);t=build_timeline(self.store.snapshots(),start=monday(2026,45));self.assertEqual(t.projects[0].key,('j1','b'))
    def test_brand_filters_before_aggregation(self):
        self.add(44,[row(brand='A',eur=1),row(brand='B',eur=100)]);self.add(45,[row(brand='A',eur=2),row(brand='B',eur=200)]);p=build_timeline(self.store.snapshots(),brand='A').projects[0];self.assertEqual([o['amounts']['EUR']['total'] for o in p.observations],[1,2])
    def test_assignment_outside_filter_not_project_absence(self):
        self.add(44,[row(brand='A')]);self.add(45,[row(brand='B',eur=9)]);p=build_timeline(self.store.snapshots(),brand='A',latest_only=False).projects[0];self.assertEqual(p.observations[1]['kind'],'filteredOut')
    def test_unknown_fields_remain_unknown(self):
        self.add(44,[row(status=None,eur='TBC',invoice='开发阶段')]);self.add(45,[row(status='Production',eur=12,invoice='预计12月开票')]);p=build_timeline(self.store.snapshots()).projects[0];self.assertFalse(p.observations[0]['statusKnown']);self.assertIsNone(p.observations[0]['amounts']['EUR']['total']);self.assertEqual(p.observations[0]['invoice'],'开发阶段')
    def test_status_multiplicities_and_original_labels(self):
        self.add(44,[row(status='Production'),row(status='Production')]);self.add(45,[row(status='Production'),row(status='Porduction')]);p=build_timeline(self.store.snapshots()).projects[0];self.assertNotEqual(p.observations[0]['statusKey'],p.observations[1]['statusKey']);self.assertIn('× 2',p.observations[0]['status'])
    def test_default_range_is_twelve_calendar_weeks(self):
        self.add(1,[row(eur=1)]);self.add(45,[row(eur=2)]);a,b=default_range(self.store.snapshots());self.assertEqual((b-a).days,77);self.assertEqual(len(build_timeline(self.store.snapshots()).weeks),12)
    def test_range_validation(self):
        self.add(44,[row()])
        with self.assertRaises(HistoryError):build_timeline(self.store.snapshots(),start=monday(2026,45),end=monday(2026,44))
    def test_csv_missingness_precision_and_injection(self):
        self.add(44,[row(job='=1+1',eur=Decimal('1.123456789'))]);self.add(46,[row(job='=1+1',eur=2)]);t=build_timeline(self.store.snapshots());target=self.folder/'out.csv';export_timeline_csv(t,target,self.tr);content=target.read_text(encoding='utf-8-sig');rows=list(csv.reader(io.StringIO(content)));self.assertEqual(len(rows),4);self.assertIn("'=1+1",rows[1]);self.assertIn('1.123456789',content);self.assertEqual(rows[2][7:10],['','','']);self.assertIn(self.tr('weekMissing'),rows[2])
    def test_report_excludes_weeks_outside_range_but_keeps_global_identity(self):
        self.add(44,[row(project='A'),row(project='B')]);self.add(45,[row(project='B',eur=9)]);s=self.store.snapshots();t=build_timeline(s,start=monday(2026,45));data=timeline_payload(s,self.tr,t);self.assertEqual(len(data['snapshots']),1);self.assertEqual(data['duplicates'],['j1'])
    def test_suggestions_not_current_year(self):
        self.assertEqual(suggest_period('WK45.xlsx'),(None,45));self.assertEqual(suggest_period('2026-W45.xlsx'),(2026,45))
    def test_move_entire_history_folder(self):
        self.add(44,[row()]);target=self.folder/'moved/continuity.sqlite';target.parent.mkdir();shutil.copy2(self.path,target);self.assertEqual(HistoryStore(target).snapshots()[0].week,44)
    def test_future_schema_not_silently_overwritten(self):
        import sqlite3
        with closing(sqlite3.connect(self.path)) as db, db:db.execute('PRAGMA user_version=99')
        with self.assertRaises(HistoryError):HistoryStore(self.path)


if __name__=='__main__':unittest.main()
