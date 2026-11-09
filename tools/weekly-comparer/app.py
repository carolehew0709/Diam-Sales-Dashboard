"""Portable native desktop front end for lib/weekly_comparison.py."""
from __future__ import annotations

import argparse
import ctypes
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
from weekly_comparison import CompareError, Translator, VERSION, compare, display, exact, export_csv, export_html, overview
from openpyxl.utils import get_column_letter

KINDS = ('allChanges', 'added', 'removed', 'increase', 'decrease', 'rescheduled', 'modified', 'unchanged', 'allRows')


class App:
    def __init__(self, root, language='zh-CN', smoke=None):
        self.root, self.language, self.smoke = root, language, smoke
        self.tr = Translator(ROOT, language).tr
        self.events = queue.Queue()
        self.result, self.busy, self.version = None, False, 0
        self.old, self.new = tk.StringVar(), tk.StringVar()
        self.search, self.kind, self.team, self.entity, self.sales = (tk.StringVar() for _ in range(5))
        self.status, self.summary = tk.StringVar(), tk.StringVar()
        self.shown, self.controls = [], []
        self.build()
        self.old.trace_add('write', self.invalidate)
        self.new.trace_add('write', self.invalidate)
        self.root.after(100, self.poll)
        if smoke:
            self.old.set(smoke[0]); self.new.set(smoke[1])
            self.root.after(200, self.start)

    def build(self):
        tr, root = self.tr, self.root
        root.title(tr('title')+' '+VERSION)
        root.geometry('1220x850'); root.minsize(980, 700)
        root.configure(bg='#f3f5f8')
        style = ttk.Style(root); style.theme_use('clam')
        style.configure('.', font=('Microsoft YaHei UI', 10))
        style.configure('TFrame', background='#f3f5f8')
        style.configure('TLabel', background='#f3f5f8', foreground='#183047')
        style.configure('Title.TLabel', font=('Microsoft YaHei UI', 18, 'bold'))
        style.configure('Summary.TLabel', background='#e4edf4', padding=14, font=('Microsoft YaHei UI', 11, 'bold'))
        style.configure('TButton', padding=(10,5))
        style.configure('Primary.TButton', background='#183c56', foreground='white')
        style.map('Primary.TButton', background=[('active','#2a5675'),('disabled','#91a0ad')])
        style.configure('Treeview', rowheight=32, font=('Microsoft YaHei UI',11), background='white', fieldbackground='white')
        style.configure('Treeview.Heading', background='#183c56', foreground='white', padding=6)
        main = ttk.Frame(root, padding=(20,12)); main.pack(fill='both',expand=True)
        main.columnconfigure(0,weight=1); main.rowconfigure(4,weight=1)
        head = ttk.Frame(main); head.grid(row=0,column=0,sticky='ew',pady=(0,8)); head.columnconfigure(0,weight=1)
        ttk.Label(head,text=tr('title'),style='Title.TLabel').grid(row=0,column=0,sticky='w')
        self.html_button=ttk.Button(head,text=tr('exportHtml'),command=lambda:self.export('html'),state='disabled'); self.html_button.grid(row=0,column=1,padx=6)
        self.csv_button=ttk.Button(head,text=tr('exportCsv'),command=lambda:self.export('csv'),state='disabled'); self.csv_button.grid(row=0,column=2)
        try:
            logo = tk.PhotoImage(file=str(ROOT/'DIAM Logos'/'DIAM triangle (1).png'))
            self.logo = logo.subsample(max(1,logo.width()//36))
            ttk.Label(head,image=self.logo).grid(row=0,column=3,padx=(14,0))
            root.iconphoto(True,self.logo)
        except tk.TclError:
            pass
        files = ttk.Frame(main); files.grid(row=1,column=0,sticky='ew',pady=(0,10))
        files.columnconfigure(1,weight=1,uniform='files'); files.columnconfigure(4,weight=1,uniform='files')
        self.file_entries=[]
        for c,(key,var) in enumerate((('oldFile',self.old),('newFile',self.new))):
            col=c*3
            ttk.Label(files,text=tr(key)).grid(row=0,column=col,sticky='w',padx=(12 if c else 0,6))
            entry = ttk.Entry(files,textvariable=var,width=15); entry.grid(row=0,column=col+1,sticky='ew')
            button=ttk.Button(files,text=tr('browseCompact'),command=lambda v=var:self.browse(v)); button.grid(row=0,column=col+2,padx=(6,0))
            self.file_entries.append(entry)
            self.controls.extend([entry,button])
        self.run_button=ttk.Button(files,text=tr('compare'),style='Primary.TButton',command=self.start); self.run_button.grid(row=0,column=6,padx=(12,0))
        self.controls.append(self.run_button)
        self.summary.set(tr('emptySummary')); self.status.set(tr('ready'))
        cards=ttk.Frame(main); cards.grid(row=2,column=0,sticky='ew',pady=(0,8))
        self.card_values=[]; self.card_notes=[]
        for i,key in enumerate(('oldFcst','newFcst','netChange','changedRecords')):
            cards.columnconfigure(i,weight=1,uniform='cards')
            box=tk.Frame(cards,bg='#193f59' if i==2 else 'white',padx=14,pady=7)
            box.grid(row=0,column=i,sticky='nsew',padx=(0,10 if i<3 else 0))
            fg='white' if i==2 else '#193349'; bg=box['bg']
            tk.Label(box,text=tr(key),font=('Microsoft YaHei UI',9),fg=fg,bg=bg,anchor='w').pack(fill='x')
            value=tk.StringVar(value='—'); note=tk.StringVar(value='')
            tk.Label(box,textvariable=value,font=('Microsoft YaHei UI',18,'bold'),fg=fg,bg=bg,anchor='w').pack(fill='x',pady=3)
            tk.Label(box,textvariable=note,font=('Microsoft YaHei UI',8),fg=fg,bg=bg,anchor='w').pack(fill='x')
            self.card_values.append(value); self.card_notes.append(note)
        filters=ttk.Frame(main); filters.grid(row=3,column=0,sticky='ew',pady=(0,8))
        filters.columnconfigure(3,weight=1); filters.columnconfigure(9,weight=1)
        for key,var,width,r,c in (('kind',self.kind,12,0,0),('team',self.team,17,0,2),('entity',self.entity,8,0,4),('salesType',self.sales,9,0,6)):
            ttk.Label(filters,text=tr('detailKind' if key=='kind' else key)).grid(row=r,column=c,sticky='w',padx=(0,6),pady=4)
            box=ttk.Combobox(filters,textvariable=var,state='readonly',width=width); box.grid(row=r,column=c+1,sticky='ew',padx=(0,10),pady=4); box.bind('<<ComboboxSelected>>',lambda e:self.refresh())
            setattr(self,key+'_box',box)
        self.kind_box.configure(values=[tr('kind.'+k) for k in KINDS]); self.kind.set(tr('kind.allChanges'))
        for var,box in ((self.team,self.team_box),(self.entity,self.entity_box),(self.sales,self.salesType_box)):
            var.set(tr('all')); box.configure(values=[tr('all')])
        ttk.Label(filters,text=tr('search')).grid(row=0,column=8,sticky='w',padx=(0,6))
        ttk.Entry(filters,textvariable=self.search,width=12).grid(row=0,column=9,sticky='ew')
        self.search.trace_add('write',lambda *args:self.refresh())
        self.views=ttk.Notebook(main); self.views.grid(row=4,column=0,sticky='nsew')
        visual=ttk.Frame(self.views); self.detail_view=ttk.Frame(self.views)
        self.views.add(visual,text=tr('visualTitle')); self.views.add(self.detail_view,text=tr('detail'))
        self.chart_canvas=tk.Canvas(visual,bg='white',highlightthickness=0)
        chart_scroll=ttk.Scrollbar(visual,command=self.chart_canvas.yview); chart_scroll.pack(side='right',fill='y')
        self.chart_canvas.pack(side='left',fill='both',expand=True); self.chart_canvas.configure(yscrollcommand=chart_scroll.set)
        self.chart_canvas.bind('<MouseWheel>',lambda e:self.chart_canvas.yview_scroll(int(-e.delta/120),'units'))
        self.chart_canvas.bind('<Configure>',lambda event:self.draw_overview())
        panes=ttk.Panedwindow(self.detail_view,orient='vertical'); panes.pack(fill='both',expand=True)
        self.detail_panes=panes; self.detail_sized=False
        self.views.bind('<<NotebookTabChanged>>',self.size_detail)
        upper=ttk.Frame(panes); lower=ttk.Frame(panes); panes.add(upper,weight=3); panes.add(lower,weight=2)
        upper.rowconfigure(0,weight=1); upper.columnconfigure(0,weight=1)
        columns=('kind','team','entity','salesType','customer','oldValue','newValue','delta','oldRow','newRow')
        self.tree=ttk.Treeview(upper,columns=columns,show='headings',selectmode='browse',height=8)
        for key,width in zip(columns,(112,150,65,85,175,110,110,110,65,65)):
            label=tr(key) if key not in ('oldValue','newValue') else tr('oldFcst' if key=='oldValue' else 'newFcst')
            self.tree.heading(key,text=label,command=lambda c=key:self.sort(c))
            self.tree.column(key,width=width,minwidth=55,anchor='e' if key in ('oldValue','newValue','delta') else 'w',stretch=key=='customer')
        self.tree.grid(row=0,column=0,sticky='nsew')
        scrollbar=ttk.Scrollbar(upper,orient='vertical',command=self.tree.yview); scrollbar.grid(row=0,column=1,sticky='ns')
        horizontal=ttk.Scrollbar(upper,orient='horizontal',command=self.tree.xview); horizontal.grid(row=1,column=0,sticky='ew')
        self.tree.configure(yscrollcommand=scrollbar.set,xscrollcommand=horizontal.set)
        for tag,color in (('increase','#eaf4ee'),('decrease','#fff0ed'),('rescheduled','#fff6df'),('added','#eaf4ee'),('removed','#fff0ed')):
            self.tree.tag_configure(tag,background=color)
        self.tree.bind('<<TreeviewSelect>>',self.details)
        tabs=ttk.Notebook(lower); tabs.pack(fill='both',expand=True,pady=(10,0))
        self.detail_text=self.text_tab(tabs,tr('detail'))
        issue_frame=ttk.Frame(self.views); self.views.add(issue_frame,text=tr('issues'))
        self.issue_text=tk.Text(issue_frame,wrap='word',font=('Microsoft YaHei UI',10),bg='white',fg='#183047',relief='flat',padx=14,pady=12)
        issue_scroll=ttk.Scrollbar(issue_frame,command=self.issue_text.yview); issue_scroll.pack(side='right',fill='y')
        self.issue_text.pack(side='left',fill='both',expand=True); self.issue_text.configure(yscrollcommand=issue_scroll.set)
        self.detail_text.insert('end',tr('scope')+'\n\n'+tr('precision')+'\n\n'+tr('referenceNote'))
        self.detail_text.configure(state='disabled')
        self.status_label=ttk.Label(main,textvariable=self.status,wraplength=900)
        self.status_label.grid(row=5,column=0,sticky='ew',pady=(6,0))
        root.bind('<Configure>',lambda event:self.status_label.configure(wraplength=max(300,root.winfo_width()-40)) if event.widget==root else None)
        self.sort_reverse=False

    def size_detail(self,event=None):
        if not self.detail_sized and self.views.select()==str(self.detail_view):
            def resize():
                self.detail_panes.sashpos(0,max(160,int(self.detail_panes.winfo_height()*0.68)))
                self.detail_sized=True
            self.root.after_idle(resize)

    def text_tab(self,tabs,title):
        frame=ttk.Frame(tabs); tabs.add(frame,text=title)
        text=tk.Text(frame,wrap='word',height=7,width=1,font=('Microsoft YaHei UI',11),bg='white',fg='#183047',relief='flat',padx=12,pady=10)
        bar=ttk.Scrollbar(frame,command=text.yview); bar.pack(side='right',fill='y'); text.pack(side='left',fill='both',expand=True); text.configure(yscrollcommand=bar.set)
        return text

    def browse(self,var):
        path=filedialog.askopenfilename(filetypes=[('Excel','*.xlsx')])
        if path: var.set(path)

    def invalidate(self,*args):
        self.version+=1; self.result=None
        self.html_button.configure(state='disabled'); self.csv_button.configure(state='disabled')
        self.tree.delete(*self.tree.get_children()); self.shown=[]
        self.scope_rows=[]
        for value in self.card_values: value.set('—')
        for note in self.card_notes: note.set('')
        self.draw_overview()
        self.summary.set(self.tr('emptySummary')); self.status.set(self.tr('ready'))
        for widget in (self.detail_text,self.issue_text):
            widget.configure(state='normal'); widget.delete('1.0','end'); widget.configure(state='disabled')

    def start(self):
        if self.busy: return
        if not self.old.get().strip() or not self.new.get().strip():
            messagebox.showerror(self.tr('title'),self.tr('chooseBoth')); return
        self.invalidate(); self.busy=True; token=self.version
        old_path, new_path = self.old.get().strip(), self.new.get().strip()
        for control in self.controls: control.configure(state='disabled')
        self.status.set(self.tr('working')); self.root.update_idletasks()
        def work():
            try: self.events.put((token,compare(old_path,new_path),None))
            except Exception as exc: self.events.put((token,None,exc))
        threading.Thread(target=work,daemon=True).start()

    def poll(self):
        try:
            token,result,error=self.events.get_nowait(); self.busy=False
            for control in self.controls: control.configure(state='normal')
            if token==self.version:
                if error:
                    text=self.tr(error.key,**error.params) if isinstance(error,CompareError) else str(error)
                    self.status.set(text)
                    if self.smoke:
                        Path(self.smoke[2]).write_text(json.dumps({'error':text},ensure_ascii=False),encoding='utf-8'); self.root.destroy(); return
                    messagebox.showerror(self.tr('title'),text)
                else: self.accept(result)
        except queue.Empty: pass
        self.root.after(100,self.poll)

    def accept(self,result):
        self.result=result; tr=self.tr
        for var,box,c in ((self.team,self.team_box,0),(self.entity,self.entity_box,1),(self.sales,self.salesType_box,2)):
            box.configure(values=[tr('all')]+sorted({str(r.record.values[c]) for r in result.rows})); var.set(tr('all'))
        self.kind.set(tr('kind.allChanges')); self.search.set('')
        self.summary.set(tr('summary',added=sum(r.kind=='added' for r in result.rows),removed=sum(r.kind=='removed' for r in result.rows),changed=sum(r.kind not in ('added','removed','unchanged','reference') for r in result.rows),unchanged=sum(r.kind in ('unchanged','reference') for r in result.rows),net=display(result.net)))
        self.issue_text.configure(state='normal'); self.issue_text.delete('1.0','end')
        for issue in result.issues:
            self.issue_text.insert('end',f'{tr(issue.side)} · {issue.cell}  {tr(issue.key)}\n{issue.detail}\n\n')
        self.issue_text.configure(state='disabled')
        self.html_button.configure(state='normal'); self.csv_button.configure(state='normal'); self.refresh()
        if self.smoke:
            self.root.after(300,self.finish_smoke)

    def refresh(self):
        if self.result is None: return
        tr=self.tr
        selected=next((k for k in KINDS if tr('kind.'+k)==self.kind.get()),'allChanges')
        rows=[]; scope=[]
        for r in self.result.rows:
            if any(var.get()!=tr('all') and var.get()!=str(r.record.values[c]) for var,c in ((self.team,0),(self.entity,1),(self.sales,2))): continue
            if self.search.get().strip().casefold() not in ' '.join(map(str,r.record.values[:4])).casefold(): continue
            scope.append(r)
            if selected=='allChanges' and r.kind in ('reference','unchanged'): continue
            if selected=='unchanged' and r.kind not in ('unchanged','reference'): continue
            if selected not in ('allChanges','allRows','unchanged') and r.kind!=selected: continue
            rows.append(r)
        self.scope_rows=scope; self.shown=rows; self.render_rows(); self.draw_overview()
        self.status.set(tr('loaded',old=self.result.old.path.name,new=self.result.new.path.name,sheet=self.result.new.sheet,count=len(rows),issues=len(self.result.issues)))

    def render_rows(self):
        self.tree.delete(*self.tree.get_children())
        for i,r in enumerate(self.shown):
            self.tree.insert('','end',iid=str(i),values=(self.tr('kind.'+('unchanged' if r.kind=='reference' else r.kind)),*r.record.values[:4],display(r.before.values[22]) if r.before else '∅',display(r.after.values[22]) if r.after else '∅',display(r.delta),r.before.row if r.before else '∅',r.after.row if r.after else '∅'),tags=(r.kind,))
        if self.shown:
            self.tree.selection_set('0'); self.details()
        else:
            self.detail_text.configure(state='normal'); self.detail_text.delete('1.0','end'); self.detail_text.insert('end',self.tr('noRows')); self.detail_text.configure(state='disabled')

    def sort(self,column):
        from decimal import Decimal
        def key(r):
            if column=='delta': value=r.delta
            elif column in ('oldValue','newValue'):
                from weekly_comparison import number
                record=r.before if column=='oldValue' else r.after; value=number(record.values[22]) if record else None
            elif column in ('oldRow','newRow'):
                record=r.before if column=='oldRow' else r.after; value=record.row if record else None
            else:
                return self.tr('kind.'+r.kind) if column=='kind' else str(r.record.values[{'team':0,'entity':1,'salesType':2,'customer':3}[column]]).casefold()
            return (value is None,value if value is not None else Decimal(0))
        self.sort_reverse=not self.sort_reverse; self.shown.sort(key=key,reverse=self.sort_reverse); self.render_rows()

    def draw_overview(self):
        canvas=self.chart_canvas; canvas.delete('all')
        tr=self.tr; w=max(canvas.winfo_width(),800); h=max(canvas.winfo_height(),420)
        canvas.configure(scrollregion=(0,0,w,h))
        def text(x,y,label,size=10,color='#193349',anchor='nw',width=None,bold=False):
            options=dict(text=str(label),font=('Microsoft YaHei UI',size,'bold' if bold else 'normal'),fill=color,anchor=anchor)
            if width: options['width']=width
            return canvas.create_text(x,y,**options)
        if self.result is None:
            text(24,30,tr('emptySummary'),13); text(24,65,tr('scope'),10,'#607487',width=w-48)
            return
        rows=getattr(self,'scope_rows',self.result.rows); stats=overview(rows)
        for i,key in enumerate(('old','new','net','changed')):
            value=stats[key]
            self.card_values[i].set(str(value) if key=='changed' else ('+' if key=='net' and value is not None and value>0 else '')+display(value))
        pct=stats['net']/stats['old']*100 if stats['old'] and stats['net'] is not None else None
        self.card_notes[0].set(tr('selectedFilters')); self.card_notes[1].set(tr('selectedFilters'))
        self.card_notes[2].set((('+' if pct>0 else '')+f'{pct:.2f}%') if pct is not None else '—')
        self.card_notes[3].set(f"{tr('added')} {stats['added']} / {tr('removed')} {stats['removed']} / {tr('rescheduled')} {stats['rescheduled']}")
        text(20,12,tr('unitNote'),9,'#607487')
        text(20,39,tr('flowTitle'),12,bold=True)
        maximum=max(abs(stats['positive']),abs(stats['negative']),abs(stats['net'] or 0),1)
        step=(w-40)/3
        for i,(label,value,color) in enumerate(((tr('knownIncrease'),stats['positive'],'#18745b'),(tr('knownDecrease'),stats['negative'],'#b64b37'),(tr('netChange'),stats['net'],'#28658d'))):
            x=20+i*step
            text(x,67,label,10,'#607487'); text(x+step-20,65,('+' if value is not None and value>0 else '')+display(value),13,color,anchor='ne',bold=True)
            canvas.create_rectangle(x,94,x+step-20,100,fill='#edf2f5',outline='')
            if value is not None: canvas.create_rectangle(x,94,x+(step-20)*float(abs(value)/maximum),100,fill=color,outline='')
        midpoint=w*.53
        ranked=sorted((r for r in rows if r.delta is not None and abs(r.delta)>0.000001),key=lambda r:abs(r.delta),reverse=True)[:8]
        text(20,121,tr('rankingTitle')+' · TOP 8',12,bold=True)
        text(midpoint+10,121,tr('monthsTitle'),12,bold=True)
        if not ranked: text(20,165,tr('emptyRanking'),10,'#607487')
        top=max((abs(r.delta) for r in ranked),default=1)
        left=midpoint*.50; right=midpoint-117; zero=(left+right)/2
        for i,row in enumerate(ranked):
            y=158+i*32; color='#18745b' if row.delta>=0 else '#b64b37'; tag=f'customer-{i}'
            canvas.create_rectangle(16,y-3,midpoint-10,y+28,fill='white',outline='',tags=tag)
            name=str(row.record.values[3]).strip().replace('\n',' ')
            canvas.addtag_withtag(tag,text(22,y,name[:23]+('…' if len(name)>23 else ''),10,width=left-30))
            canvas.addtag_withtag(tag,text(22,y+17,row.record.values[1],9,'#607487'))
            canvas.create_line(zero,y+2,zero,y+18,fill='#cad7e0')
            length=float(abs(row.delta)/top)*max(8,(right-left)/2-2)
            bar=canvas.create_rectangle(zero if row.delta>=0 else zero-length,y+5,zero+length if row.delta>=0 else zero,y+15,fill=color,outline='',tags=tag)
            value_id=text(midpoint-18,y+2,('+' if row.delta>0 else '')+display(row.delta),10,color,anchor='ne')
            canvas.addtag_withtag(tag,value_id)
            canvas.tag_bind(tag,'<Button-1>',lambda event,r=row:self.focus_customer(r))
            canvas.tag_bind(tag,'<Enter>',lambda event:canvas.configure(cursor='hand2'))
            canvas.tag_bind(tag,'<Leave>',lambda event:canvas.configure(cursor=''))
        months=[m for m in stats['months'] if (m['old'] is not None or m['new'] is not None) and (m['old'] is None or m['new'] is None or abs(m['old']-m['new'])>0.000001)]
        max_month=max((abs(v) for m in months for v in (m['old'],m['new']) if v is not None),default=1) or 1
        if not months: text(midpoint+10,165,tr('noMonthChanges'),10,'#607487')
        for i,m in enumerate(months):
            y=158+i*42; x=midpoint+130; width=max(50,w-x-135)
            text(midpoint+10,y,display(self.result.new.headers[m['column']]),10,'#607487')
            for offset,key,color in ((2,'old','#b8c8d4'),(15,'new','#28658d')):
                if m[key] is not None:
                    canvas.create_rectangle(x,y+offset,x+width*float(abs(m[key])/max_month),y+offset+8,fill=color,outline='')
            delta=m['new']-m['old'] if m['old'] is not None and m['new'] is not None else None
            text(w-20,y+2,('+' if delta is not None and delta>0 else '')+display(delta),10,'#18745b' if delta is not None and delta>=0 else '#b64b37',anchor='ne')
        footer=max(430,158+len(months)*42+12)
        text(20,footer,tr('chartHint'),9,'#607487')
        canvas.create_rectangle(midpoint+10,footer+3,midpoint+22,footer+12,fill='#b8c8d4',outline='')
        text(midpoint+28,footer,tr('old'),9,'#607487')
        canvas.create_rectangle(midpoint+105,footer+3,midpoint+117,footer+12,fill='#28658d',outline='')
        text(midpoint+123,footer,tr('new'),9,'#607487')
        text(20,footer+26,tr('visualHint'),8,'#607487',width=w-40)
        canvas.configure(scrollregion=(0,0,w,max(h,footer+55)))

    def focus_customer(self,row):
        self.kind.set(self.tr('kind.allRows')); self.refresh()
        self.views.select(self.detail_view)
        for i,r in enumerate(self.shown):
            if r.key==row.key:
                self.tree.selection_set(str(i)); self.tree.see(str(i)); self.details(); break

    def details(self,event=None):
        chosen=self.tree.selection()
        if not chosen or self.result is None: return
        row=self.shown[int(chosen[0])]; tr=self.tr
        text=self.detail_text; text.configure(state='normal'); text.delete('1.0','end')
        text.insert('end',' / '.join(map(str,row.record.values[:4]))+'\n'+tr('rowPair',old=row.before.row if row.before else '∅',new=row.after.row if row.after else '∅')+'\n\n')
        cols=row.fields if row.before and row.after else [c for c in range(24) if row.record.values[c] is not None]
        for c in cols:
            a=row.before.values[c] if row.before else None; b=row.after.values[c] if row.after else None
            text.insert('end',get_column_letter(c+1)+'  '+(tr('expectedAmount') if c==22 else display(self.result.new.headers[c]))+'\n'+tr('old')+': '+('∅' if a is None else exact(a))+'\n'+tr('new')+': '+('∅' if b is None else exact(b))+'\n')
            text.insert('end','\n')
        text.insert('end',tr('precision')); text.configure(state='disabled')

    def export(self,kind):
        if self.result is None or self.busy: return
        path=filedialog.asksaveasfilename(defaultextension='.'+kind,initialfile='DIAM-'+self.result.new.path.stem+'-vs-'+self.result.old.path.stem+'.'+kind,filetypes=[(kind.upper(),'*.'+kind)])
        if not path: return
        try:
            (export_html if kind=='html' else export_csv)(self.result,path,self.tr)
            self.status.set(self.tr('saved',path=path))
        except Exception as exc:
            text=self.tr(exc.key,**exc.params) if isinstance(exc,CompareError) else str(exc)
            messagebox.showerror(self.tr('title'),text)

    def finish_smoke(self):
        # Verify actual GUI selection, filter, exact detail and export state against the engine.
        r=self.result
        before=len(self.shown); self.kind.set(self.tr('kind.increase')); self.refresh(); increases=len(self.shown)
        self.entity.set('DDC'); self.refresh(); ddc=len(self.shown)
        self.kind.set(self.tr('kind.allChanges')); self.entity.set(self.tr('all')); self.refresh()
        self.root.update_idletasks()
        self.focus_customer(r.changed[0]); chart_click=self.views.select()==str(self.detail_view)
        self.views.select(0)
        evidence={'version':VERSION,'changed':len(r.changed),'net':str(r.net),'displayed':before,'increaseFilter':increases,'ddcIncreaseFilter':ddc,'chartItems':len(self.chart_canvas.find_all()),'chartViewport':[self.chart_canvas.winfo_width(),self.chart_canvas.winfo_height()],'filePickersSameRow':self.file_entries[0].winfo_rooty()==self.file_entries[1].winfo_rooty(),'chartClickOpensDetail':chart_click,'formulaDetailsAbsent':'SUM(' not in self.detail_text.get('1.0','end'),'detailsPopulated':bool(self.detail_text.get('1.0','end').strip()),'htmlEnabled':str(self.html_button['state'])=='normal','csvEnabled':str(self.csv_button['state'])=='normal','issues':len(r.issues),'window':[self.root.winfo_width(),self.root.winfo_height()]}
        Path(self.smoke[2]).write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
        self.root.after(2500,self.root.destroy)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--lang',choices=('zh-CN','en'),default='zh-CN')
    parser.add_argument('--old'); parser.add_argument('--new'); parser.add_argument('--html'); parser.add_argument('--csv'); parser.add_argument('--summary')
    parser.add_argument('--ui-smoke-test',nargs=3,metavar=('OLD','NEW','EVIDENCE'))
    parser.add_argument('--preview',nargs=2,metavar=('OLD','NEW'))
    args=parser.parse_args()
    if args.old or args.new:
        if not args.old or not args.new: parser.error('--old and --new are required together')
        tr=Translator(ROOT,args.lang).tr
        try:
            result=compare(args.old,args.new)
            if args.html: export_html(result,args.html,tr)
            if args.csv: export_csv(result,args.csv,tr)
            if args.summary:
                from weekly_comparison import write_output
                write_output(args.summary,json.dumps({'version':VERSION,'oldCount':len(result.old.records),'newCount':len(result.new.records),'changed':len(result.changed),'net':str(result.net),'kinds':{k:sum(r.kind==k for r in result.rows) for k in KINDS},'issues':len(result.issues)},ensure_ascii=False,indent=2),result,'.json')
            return 0
        except Exception as exc:
            if sys.stderr: print(str(exc),file=sys.stderr)
            return 1
    if os.name=='nt':
        try: ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError,OSError): pass
    root=tk.Tk(); app=App(root,args.lang,args.ui_smoke_test)
    if args.preview:
        app.old.set(args.preview[0]); app.new.set(args.preview[1]); root.after(200,app.start)
    root.mainloop()
    return 0


if __name__=='__main__':
    raise SystemExit(main())
