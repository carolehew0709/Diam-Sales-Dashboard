"""Portable Windows GUI; all matching and workbook rules live in lib/order_matcher.py."""
from __future__ import annotations

import argparse
import ctypes
from datetime import datetime
import json
import os
from pathlib import Path
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(ROOT / 'lib'))
from order_matcher import MatchError, SourceBook, VERSION, process_workbook


class Translator:
    def __init__(self, language='zh-CN'):
        self.language = language
        self.messages = json.loads((ROOT / 'locales' / f'{language}.json').read_text(encoding='utf-8'))

    def tr(self, key, **params):
        value = self.messages.get('orderMatcher.' + key, key)
        for name, text in params.items():
            value = value.replace('{' + name + '}', str(text))
        return value


class App:
    def __init__(self, root, language='zh-CN', smoke=None):
        self.root, self.i18n, self.smoke = root, Translator(language), smoke
        self.tr = self.i18n.tr
        self.events = queue.Queue()
        self.busy, self.result = False, None
        self.input = tk.StringVar()
        self.output = tk.StringVar()
        self.ddc, self.dehk = tk.StringVar(), tk.StringVar()
        self.audit = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value=self.tr('ready'))
        self.summary = tk.StringVar(value=self.tr('emptySummary'))
        self.detail = tk.StringVar(value=self.tr('scope'))
        self.controls = []
        self.build()
        self.root.after(100, self.poll)
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        if smoke:
            self.root.after(200, self.start_smoke)

    def build(self):
        root, tr = self.root, self.tr
        root.title(tr('title') + '  ' + VERSION)
        root.geometry('960x720')
        root.minsize(820, 680)
        root.configure(bg='#F3F5F8')
        root.option_add('*Font', ('Microsoft YaHei UI', 10))
        style = ttk.Style(root)
        style.theme_use('clam')
        style.configure('.', font=('Microsoft YaHei UI', 10))
        style.configure('TFrame', background='#F3F5F8')
        style.configure('TLabel', background='#F3F5F8', foreground='#172C43')
        style.configure('Title.TLabel', font=('Microsoft YaHei UI', 23, 'bold'))
        style.configure('Sub.TLabel', foreground='#526477')
        style.configure('Primary.TButton', background='#173D5B', foreground='white', padding=(22, 12), font=('Microsoft YaHei UI', 11, 'bold'))
        style.map('Primary.TButton', background=[('active', '#245575'), ('disabled', '#AAB6C0')])
        style.configure('TButton', padding=(12, 7))
        style.configure('TCheckbutton', background='#F3F5F8')
        main = ttk.Frame(root, padding=(30, 22))
        main.pack(fill='both', expand=True)
        main.columnconfigure(0, weight=1)
        head = ttk.Frame(main)
        head.grid(row=0, column=0, sticky='ew', pady=(0, 18))
        head.columnconfigure(0, weight=1)
        ttk.Label(head, text=tr('title'), style='Title.TLabel').grid(row=0, column=0, sticky='w')
        ttk.Label(head, text=tr('subtitle'), style='Sub.TLabel').grid(row=1, column=0, sticky='w', pady=(6, 0))
        try:
            image = tk.PhotoImage(file=str(ROOT / 'assets' / 'diam.png'))
            self.logo = image.subsample(max(1, image.width() // 100), max(1, image.width() // 100))
            ttk.Label(head, image=self.logo).grid(row=0, column=1, rowspan=2, padx=(15, 0))
            root.iconphoto(True, self.logo)
        except tk.TclError:
            pass
        ttk.Separator(main).grid(row=1, column=0, sticky='ew', pady=(0, 18))
        self.path_row(main, 2, tr('sourceLabel'), self.input, self.choose_input)
        sheets = ttk.Frame(main)
        sheets.grid(row=3, column=0, sticky='ew', pady=(8, 16))
        sheets.columnconfigure(1, weight=1)
        sheets.columnconfigure(3, weight=1)
        ttk.Label(sheets, text=tr('ddcLabel')).grid(row=0, column=0, padx=(0, 10))
        self.ddc_combo = ttk.Combobox(sheets, textvariable=self.ddc, state='readonly', width=24)
        self.ddc_combo.grid(row=0, column=1, sticky='ew')
        ttk.Label(sheets, text=tr('dehkLabel')).grid(row=0, column=2, padx=(24, 10))
        self.dehk_combo = ttk.Combobox(sheets, textvariable=self.dehk, state='readonly', width=24)
        self.dehk_combo.grid(row=0, column=3, sticky='ew')
        self.controls.extend([self.ddc_combo, self.dehk_combo])
        self.path_row(main, 4, tr('outputLabel'), self.output, self.choose_output)
        audit_check = ttk.Checkbutton(main, text=tr('auditLabel'), variable=self.audit)
        audit_check.grid(row=5, column=0, sticky='w', pady=(10, 16))
        self.controls.append(audit_check)
        rules = ttk.Label(main, text=tr('rules'), style='Sub.TLabel', justify='left', wraplength=850)
        rules.grid(row=6, column=0, sticky='ew', pady=(0, 14))
        actions = ttk.Frame(main)
        actions.grid(row=7, column=0, sticky='ew')
        self.run_button = ttk.Button(actions, text=tr('run'), style='Primary.TButton', command=self.run)
        self.run_button.pack(side='left')
        ttk.Label(actions, text=tr('localOnly'), style='Sub.TLabel').pack(side='left', padx=18)
        self.progress = ttk.Progressbar(main, mode='indeterminate')
        self.progress.grid(row=8, column=0, sticky='ew', pady=(16, 8))
        ttk.Label(main, textvariable=self.status).grid(row=9, column=0, sticky='w')
        ttk.Separator(main).grid(row=10, column=0, sticky='ew', pady=16)
        ttk.Label(main, textvariable=self.summary, font=('Microsoft YaHei UI', 13, 'bold')).grid(row=11, column=0, sticky='w')
        ttk.Label(main, textvariable=self.detail, style='Sub.TLabel', wraplength=850, justify='left').grid(row=12, column=0, sticky='ew', pady=(10, 12))
        bottom = ttk.Frame(main)
        bottom.grid(row=13, column=0, sticky='ew')
        self.open_button = ttk.Button(bottom, text=tr('openResult'), command=lambda: self.open_path('output'), state='disabled')
        self.open_button.pack(side='left')
        self.audit_button = ttk.Button(bottom, text=tr('openAudit'), command=lambda: self.open_path('audit'), state='disabled')
        self.audit_button.pack(side='left', padx=10)
        ttk.Label(bottom, text=tr('version', version=VERSION), style='Sub.TLabel').pack(side='right')

    def path_row(self, parent, row, label, variable, command):
        group = ttk.Frame(parent)
        group.grid(row=row, column=0, sticky='ew', pady=(0, 6))
        group.columnconfigure(1, weight=1)
        ttk.Label(group, text=label, width=12).grid(row=0, column=0, sticky='w')
        entry = ttk.Entry(group, textvariable=variable)
        entry.grid(row=0, column=1, sticky='ew', padx=(0, 10), ipady=5)
        button = ttk.Button(group, text=self.tr('browse'), command=command)
        button.grid(row=0, column=2)
        self.controls.extend([entry, button])

    def inspect_source(self, path):
        with SourceBook(path) as book:
            names = list(book.sheets)
        self.ddc_combo['values'] = names
        self.dehk_combo['values'] = names
        for token, variable in [('DDC', self.ddc), ('DEHK', self.dehk)]:
            found = [name for name in names if token in name.upper()]
            variable.set(found[0] if len(found) == 1 else '')

    def choose_input(self):
        path = filedialog.askopenfilename(title=self.tr('sourceLabel'), filetypes=[('Excel', '*.xlsx')])
        if not path:
            return
        try:
            self.inspect_source(path)
            self.input.set(path)
            stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            self.output.set(str(Path(path).with_name(Path(path).stem + self.tr('outputSuffix') + '_' + stamp + '.xlsx')))
            self.status.set(self.tr('ready'))
        except Exception as error:
            messagebox.showerror(self.tr('errorTitle'), self.error_text(error))

    def choose_output(self):
        current = Path(self.output.get()) if self.output.get() else Path.home() / 'DDC_DEHK.xlsx'
        path = filedialog.asksaveasfilename(title=self.tr('outputLabel'), defaultextension='.xlsx', filetypes=[('Excel', '*.xlsx')], initialdir=str(current.parent), initialfile=current.name, confirmoverwrite=False)
        if path:
            self.output.set(path)

    def set_busy(self, value):
        self.busy = value
        self.run_button.configure(state='disabled' if value else 'normal')
        for control in self.controls:
            control.configure(state='disabled' if value else 'readonly' if isinstance(control, ttk.Combobox) else 'normal')
        if value:
            self.progress.start(10)
            self.open_button.configure(state='disabled')
            self.audit_button.configure(state='disabled')
        else:
            self.progress.stop()

    def run(self):
        if self.busy:
            return
        if not self.input.get() or not self.output.get() or not self.ddc.get() or not self.dehk.get():
            self.fail(MatchError('selectFiles'))
            return
        output = Path(self.output.get())
        overwrite = False
        if output.exists():
            if self.smoke or not messagebox.askyesno(self.tr('overwriteTitle'), self.tr('overwriteQuestion', path=output)):
                return
            overwrite = True
        audit = output.with_name(output.stem + self.tr('auditSuffix') + '.csv') if self.audit.get() else None
        args = (self.input.get(), str(output), self.ddc.get(), self.dehk.get(), audit, self.i18n.language, overwrite)
        self.result = None
        self.summary.set(self.tr('emptySummary'))
        self.detail.set(self.tr('scope'))
        self.set_busy(True)
        def work():
            try:
                result = process_workbook(*args, progress=lambda stage: self.events.put(('progress', stage)))
                self.events.put(('done', result))
            except Exception as error:
                self.events.put(('error', error))
        threading.Thread(target=work, daemon=True).start()

    def poll(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'progress':
                    self.status.set(self.tr('stage.' + value))
                elif kind == 'done':
                    self.set_busy(False)
                    self.result = value
                    self.status.set(self.tr('complete', total=value['total']))
                    self.summary.set(self.tr('counts', **value))
                    self.detail.set(self.tr('resultDetail', blank=value['blank_source_prices'], output=value['output']))
                    self.open_button.configure(state='normal')
                    self.audit_button.configure(state='normal' if value['audit'] else 'disabled')
                    if self.smoke:
                        self.finish_smoke({'ok': True, 'result': value})
                else:
                    self.set_busy(False)
                    self.fail(value)
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def error_text(self, error):
        if isinstance(error, MatchError):
            return self.tr('error.' + error.key, **error.params)
        if isinstance(error, PermissionError):
            return self.tr('error.permission')
        if isinstance(error, FileNotFoundError):
            return self.tr('error.fileMissing')
        return self.tr('error.unexpected', detail=str(error))

    def fail(self, error):
        text = self.error_text(error)
        self.status.set(self.tr('failed'))
        self.detail.set(text)
        if self.smoke:
            self.finish_smoke({'ok': False, 'error': text})
        else:
            messagebox.showerror(self.tr('errorTitle'), text)

    def open_path(self, key):
        if self.result and self.result.get(key):
            try:
                os.startfile(self.result[key])
            except OSError as error:
                self.fail(error)

    def close(self):
        if self.busy:
            messagebox.showinfo(self.tr('title'), self.tr('waitForCompletion'))
        else:
            self.root.destroy()

    def start_smoke(self):
        try:
            source, output, _ = self.smoke
            self.input.set(source)
            self.output.set(output)
            self.inspect_source(source)
            self.run()
        except Exception as error:
            self.fail(error)

    def finish_smoke(self, result):
        self.root.update_idletasks()
        result.update({'title': self.root.title(), 'window': [self.root.winfo_width(), self.root.winfo_height()],
                       'summary': self.summary.get(), 'status': self.status.get(),
                       'ddc': self.ddc.get(), 'dehk': self.dehk.get(),
                       'open_result_enabled': str(self.open_button.cget('state')) == 'normal'})
        Path(self.smoke[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        self.root.after(200, self.root.destroy)


def main():
    parser = argparse.ArgumentParser(description='DIAM offline DDC / DEHK order matching')
    parser.add_argument('--lang', choices=['zh-CN', 'en'], default='zh-CN')
    parser.add_argument('--process', metavar='INPUT')
    parser.add_argument('--output')
    parser.add_argument('--ddc', default='DDC订单')
    parser.add_argument('--dehk', default='DEHK订单')
    parser.add_argument('--audit')
    parser.add_argument('--summary')
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--ui-smoke-test', nargs=3, metavar=('INPUT', 'OUTPUT', 'EVIDENCE'))
    args = parser.parse_args()
    if args.process:
        if not args.output:
            parser.error('--output is required with --process')
        try:
            result = process_workbook(args.process, args.output, args.ddc, args.dehk, args.audit, args.lang, args.overwrite)
            code = 0
        except Exception as error:
            result = {'error': str(error)}
            code = 1
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.summary:
            summary = Path(args.summary).resolve()
            if summary in {Path(args.process).resolve(), Path(args.output).resolve()} or (args.audit and summary == Path(args.audit).resolve()):
                return 2
            with summary.open('x', encoding='utf8') as stream:
                stream.write(text)
        elif sys.stdout:
            print(text)
        return code
    if os.name == 'nt':
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError, OSError):
            pass
    root = tk.Tk()
    App(root, args.lang, args.ui_smoke_test)
    root.mainloop()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
