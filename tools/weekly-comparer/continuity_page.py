"""Separate desktop page for local history; never mutates the two-file comparison."""
from __future__ import annotations
from datetime import date, timedelta
from pathlib import Path
import json
import queue
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from weekly_continuity import (HistoryStore, HistoryTranslator, HistoryError, ImportRequest,
    prepare_snapshot, period_label, parse_period, monday, default_range, build_timeline,
    export_timeline_html, export_timeline_csv, source_text)
from weekly_order_comparison import CURRENCIES, text, joined


class ContinuityPage:
    def __init__(self,parent,root,store,asset_root,language='zh-CN'):
        self.parent,self.root,self.store=parent,root,store
        self.tr=HistoryTranslator(asset_root,language).tr
        self.events=queue.Queue();self.busy=False;self.snapshots=[];self.timeline=None;self.selected=None;self.selected_week=0;self.syncing=False
        self.start=tk.StringVar();self.end=tk.StringVar();self.team=tk.StringVar();self.brand=tk.StringVar();self.search=tk.StringVar();self.project_scope=tk.StringVar();self.status=tk.StringVar()
        self.build();self.root.after(100,self.poll);self.reload()
    def build(self):
        tr=self.tr;main=ttk.Frame(self.parent,padding=(16,10));main.pack(fill='both',expand=True);main.columnconfigure(0,weight=1);main.rowconfigure(3,weight=1)
        head=ttk.Frame(main);head.grid(row=0,column=0,sticky='ew',pady=(0,8));head.columnconfigure(0,weight=1)
        ttk.Label(head,text=tr('historyPage'),font=('Microsoft YaHei UI',18,'bold')).grid(row=0,column=0,sticky='w')
        self.import_button=ttk.Button(head,text=tr('importFiles'),command=self.choose_import);self.import_button.grid(row=0,column=1,padx=5)
        self.manage_button=ttk.Button(head,text=tr('manageHistory'),command=self.manage);self.manage_button.grid(row=0,column=2,padx=5)
        self.html_button=ttk.Button(head,text=tr('exportHtml'),command=lambda:self.export('html'));self.html_button.grid(row=0,column=3,padx=5)
        self.csv_button=ttk.Button(head,text=tr('exportCsv'),command=lambda:self.export('csv'));self.csv_button.grid(row=0,column=4)
        filters=ttk.Frame(main);filters.grid(row=1,column=0,sticky='ew',pady=(0,7));filters.columnconfigure(7,weight=1)
        self.boxes={}
        for i,(key,var,width) in enumerate((('start',self.start,12),('end',self.end,12),('team',self.team,18),('brand',self.brand,15))):
            ttk.Label(filters,text=tr(key)).grid(row=0,column=i*2,padx=(0,5))
            box=ttk.Combobox(filters,textvariable=var,width=width,state='readonly');box.grid(row=0,column=i*2+1,padx=(0,9),sticky='ew');box.bind('<<ComboboxSelected>>',lambda event:self.refresh());self.boxes[key]=box
        ttk.Label(filters,text=tr('projectScope')).grid(row=1,column=0,sticky='w',pady=6)
        self.boxes['projectScope']=ttk.Combobox(filters,textvariable=self.project_scope,state='readonly',values=(tr('latestOnly'),tr('allHistory')))
        self.boxes['projectScope'].grid(row=1,column=1,columnspan=3,sticky='ew',padx=(0,9));self.boxes['projectScope'].bind('<<ComboboxSelected>>',lambda event:self.refresh());self.project_scope.set(tr('latestOnly'))
        ttk.Label(filters,text=tr('search')).grid(row=1,column=4,padx=(0,5));self.search_entry=ttk.Entry(filters,textvariable=self.search,width=12);self.search_entry.grid(row=1,column=5,columnspan=3,sticky='ew');self.search.trace_add('write',lambda *args:self.refresh())
        self.summary=tk.StringVar();ttk.Label(main,textvariable=self.summary,font=('Microsoft YaHei UI',10,'bold')).grid(row=2,column=0,sticky='ew',pady=(0,8))
        panes=ttk.Panedwindow(main,orient='vertical');panes.grid(row=3,column=0,sticky='nsew');upper=ttk.Frame(panes);lower=ttk.Frame(panes);panes.add(upper,weight=3);panes.add(lower,weight=3)
        upper.columnconfigure(1,weight=1);upper.rowconfigure(0,weight=1)
        self.left=ttk.Treeview(upper,columns=('job','project'),show='headings',selectmode='browse',height=9)
        for key,width in (('job',145),('project',240)):
            self.left.heading(key,text=tr(key));self.left.column(key,width=width,stretch=False)
        self.left.grid(row=0,column=0,sticky='ns')
        self.matrix=ttk.Treeview(upper,show='headings',selectmode='browse',height=9);self.matrix.grid(row=0,column=1,sticky='nsew')
        self.vertical=ttk.Scrollbar(upper,command=self.scroll_both);self.vertical.grid(row=0,column=2,sticky='ns')
        self.left.configure(yscrollcommand=lambda a,b:self.sync_scroll(self.matrix,a,b));self.matrix.configure(yscrollcommand=lambda a,b:self.sync_scroll(self.left,a,b))
        horizontal=ttk.Scrollbar(upper,orient='horizontal',command=self.matrix.xview);horizontal.grid(row=1,column=1,sticky='ew');self.matrix.configure(xscrollcommand=horizontal.set)
        self.left.bind('<<TreeviewSelect>>',lambda e:self.select_row(self.left));self.matrix.bind('<<TreeviewSelect>>',lambda e:self.select_row(self.matrix));self.matrix.bind('<ButtonRelease-1>',self.select_cell)
        detail_tabs=ttk.Notebook(lower);detail_tabs.pack(fill='both',expand=True,pady=(6,0));chart_frame=ttk.Frame(detail_tabs);source_frame=ttk.Frame(detail_tabs);detail_tabs.add(chart_frame,text=tr('detail'));detail_tabs.add(source_frame,text=tr('sourceRows'))
        chart_frame.columnconfigure(0,weight=1);chart_frame.rowconfigure(0,weight=1)
        self.chart=tk.Canvas(chart_frame,bg='white',highlightthickness=0);bar=ttk.Scrollbar(chart_frame,command=self.chart.yview);bar.grid(row=0,column=1,sticky='ns');self.chart.grid(row=0,column=0,sticky='nsew');self.chart.configure(yscrollcommand=bar.set);self.chart.bind('<Configure>',lambda e:self.draw());self.chart.bind('<MouseWheel>',lambda e:self.chart.yview_scroll(int(-e.delta/120),'units'))
        self.chart_hbar=ttk.Scrollbar(chart_frame,orient='horizontal',command=self.chart.xview);self.chart_hbar.grid(row=1,column=0,sticky='ew');self.chart.configure(xscrollcommand=self.chart_hbar.set)
        self.raw=tk.Text(source_frame,font=('Microsoft YaHei UI',10),wrap='word',bg='white',relief='flat',padx=12,pady=10);raw_scroll=ttk.Scrollbar(source_frame,command=self.raw.yview);raw_scroll.pack(side='right',fill='y');self.raw.pack(side='left',fill='both',expand=True);self.raw.configure(yscrollcommand=raw_scroll.set)
        self.status_label=ttk.Label(main,textvariable=self.status,wraplength=950);self.status_label.grid(row=4,column=0,sticky='ew',pady=(6,0))
        main.bind('<Configure>',lambda e:self.status_label.configure(wraplength=max(300,e.width-30)))
    def work(self,operation,success):
        if self.busy:return
        self.busy=True;self.import_button.configure(state='disabled');self.manage_button.configure(state='disabled');self.html_button.configure(state='disabled');self.csv_button.configure(state='disabled');self.status.set(self.tr('working'))
        def run():
            try:self.events.put((success,operation(),None))
            except Exception as error:self.events.put((success,None,error))
        threading.Thread(target=run,daemon=True).start()
    def poll(self):
        try:
            success,result,error=self.events.get_nowait();self.busy=False;self.import_button.configure(state='normal');self.manage_button.configure(state='normal')
            if error:self.status.set(self.message(error));messagebox.showerror(self.tr('historyPage'),self.message(error),parent=self.root)
            else:success(result)
            state='normal' if not error and not self.busy and self.timeline and self.timeline.projects else 'disabled';self.html_button.configure(state=state);self.csv_button.configure(state=state)
        except queue.Empty:pass
        self.root.after(100,self.poll)
    def message(self,error):return self.tr(error.key,**error.params) if hasattr(error,'key') else str(error)
    def reload(self):self.work(self.store.snapshots,self.accept_snapshots)
    def accept_snapshots(self,snapshots):
        self.snapshots=snapshots;tr=self.tr
        if snapshots:
            first=min(s.day for s in snapshots);last=max(s.day for s in snapshots);labels=[];day=first
            while day<=last:
                iso=day.isocalendar();labels.append(period_label(iso.year,iso.week));day+=timedelta(weeks=1)
            for key in ('start','end'):self.boxes[key].configure(values=labels)
            start,end=default_range(snapshots)
            self.start.set(period_label(*start.isocalendar()[:2]));self.end.set(period_label(*end.isocalendar()[:2]))
            for c,var,key in ((3,self.team,'team'),(6,self.brand,'brand')):
                values=sorted({str(r.values[c]).replace('\n',' ') for s in snapshots for r in s.source.rows if r.values[c] is not None});self.boxes[key].configure(values=[tr('all')]+values)
                if var.get() not in values:var.set(tr('all'))
        else:self.start.set('');self.end.set('');self.team.set(tr('all'));self.brand.set(tr('all'))
        self.refresh()
    def refresh(self):
        if not self.snapshots:self.timeline=build_timeline([]);self.summary.set(self.tr('noHistory'))
        else:
            try:
                self.timeline=build_timeline(self.snapshots,monday(*parse_period(self.start.get())),monday(*parse_period(self.end.get())),'' if self.team.get()==self.tr('all') else self.team.get(),'' if self.brand.get()==self.tr('all') else self.brand.get(),self.search.get(),self.project_scope.get()==self.tr('latestOnly'))
            except HistoryError as error:
                self.status.set(self.message(error));self.html_button.configure(state='disabled');self.csv_button.configure(state='disabled');return
            missing=sum(period not in {(s.year,s.week) for s in self.timeline.snapshots} for period in self.timeline.weeks)
            self.summary.set(self.tr('summary',weeks=len(self.timeline.snapshots),projects=len(self.timeline.projects),missing=missing))
        self.left.delete(*self.left.get_children());self.matrix.delete(*self.matrix.get_children());columns=[period_label(*p) for p in self.timeline.weeks];self.matrix.configure(columns=columns)
        for col in columns:self.matrix.heading(col,text=col);self.matrix.column(col,width=175,stretch=False)
        for i,p in enumerate(self.timeline.projects):
            self.left.insert('','end',iid=str(i),values=(('['+self.tr('review')+'] ' if p.review else '')+p.job,p.project))
            self.matrix.insert('','end',iid=str(i),values=[obs['status'] if obs['kind']=='present' and obs['statusKnown'] else self.tr('fieldMissing')+' '+obs['status'] if obs['kind']=='present' else self.tr(obs['kind']) for obs in p.observations])
        self.selected=None;self.selected_week=max(0,len(columns)-1)
        if self.timeline.projects:self.left.selection_set('0');self.select_row(self.left)
        else:self.draw();self.show_source()
        self.matrix.xview_moveto(1.0);self.status.set(self.tr('timelineNote'));state='normal' if self.timeline.projects and not self.busy else 'disabled';self.html_button.configure(state=state);self.csv_button.configure(state=state)
    def scroll_both(self,*args):self.left.yview(*args);self.matrix.yview(*args)
    def sync_scroll(self,other,first,last):
        self.vertical.set(first,last)
        if not self.syncing and abs(other.yview()[0]-float(first))>0.000001:
            self.syncing=True;other.yview_moveto(float(first));self.syncing=False
    def select_row(self,tree):
        selection=tree.selection()
        if not selection or not self.timeline:return
        index=int(selection[0])
        if index>=len(self.timeline.projects):return
        self.selected=self.timeline.projects[index];other=self.matrix if tree==self.left else self.left
        if other.selection()!=selection:other.selection_set(selection)
        self.draw();self.show_source()
    def select_cell(self,event):
        column=self.matrix.identify_column(event.x)
        if column.startswith('#') and column!='#0':self.selected_week=max(0,int(column[1:])-1);self.select_row(self.matrix);self.show_source()
    def draw(self):
        cv=self.chart;cv.delete('all');tr=self.tr;width=max(800,cv.winfo_width())
        def label(x,y,value,size=10,color='#193349',**kwargs):return cv.create_text(x,y,text=str(value),font=('Microsoft YaHei UI',size),fill=color,anchor='nw',**kwargs)
        if self.selected is None:label(20,25,tr('selectProject'),12);return
        p=self.selected;label(20,10,p.job+' / '+p.project,12,width=width-40);label(20,41,tr('timelineNote'),9,'#607487',width=width-40)
        obs=p.observations;n=len(obs);left=110;step=max(105,(width-left-35)/max(n,1));full_width=max(width,left+n*step+20)
        for i,o in enumerate(obs):
            x=left+i*step;label(x,79,period_label(*o['period']),9)
            valid=o['kind']=='present' and o['statusKnown'];digest=sum((i+1)*ord(c) for i,c in enumerate(o['statusKey']))
            color=('#e2eef8','#e4f2e9','#f7edda','#eee5f5','#f6e6e1')[digest%5] if valid else '#edf0f3'
            cv.create_rectangle(x,103,x+step-8,154,fill=color,outline='#bbcbd6' if i==self.selected_week else '')
            status=o['status'] if valid else tr('fieldMissing') if o['kind']=='present' else tr(o['kind'])
            item=label(x+5,108,status[:30]+('…' if len(status)>30 else ''),9,width=step-18);tag='week'+str(i);cv.addtag_withtag(tag,item);cv.tag_bind(tag,'<Button-1>',lambda e,index=i:self.pick_week(index))
        label(16,115,tr('status'),10)
        for ci,currency in enumerate(CURRENCIES):
            top=180+ci*125;label(16,top+28,currency,11);values=[o['amounts'][currency]['total'] if o['kind']=='present' else None for o in obs];known=[float(v) for v in values if v is not None];lo=min([0]+known);hi=max([0]+known);span=hi-lo or 1
            cv.create_line(left,top+88,full_width-30,top+88,fill='#dce5ec');last=None
            for i,v in enumerate(values):
                x=left+i*step+step*.42
                if v is None:last=None;label(x-15,top+55,'∅',9,'#7f8d97');continue
                y=top+80-(float(v)-lo)/span*65
                if last:cv.create_line(*last,x,y,fill='#28658d',width=2)
                cv.create_oval(x-3,y-3,x+3,y+3,fill='#28658d',outline='');label(x-35,y-20,f'{v:,.2f}',8);last=(x,y)
        label(16,575,tr('invoice'),10)
        for i,o in enumerate(obs):label(left+i*step,575,o['invoice'] if o['kind']=='present' else tr(o['kind']),9,width=step-10)
        label(16,650,tr('amountNote'),9,'#607487',width=width-35)
        cv.configure(scrollregion=(0,0,full_width,710))
    def pick_week(self,index):self.selected_week=index;self.draw();self.show_source()
    def show_source(self):
        self.raw.configure(state='normal');self.raw.delete('1.0','end')
        if self.selected and self.selected.observations:
            o=self.selected.observations[min(self.selected_week,len(self.selected.observations)-1)];s=o['snapshot'];lines=[self.selected.job+' / '+self.selected.project,period_label(*o['period'])+' / '+self.tr(o['kind'])]
            if s:lines.extend([s.filename,s.sha256])
            for r in o['rows']:lines.append(' / '.join([self.tr('row')+' '+str(r.row),source_text(r.values[3]),source_text(r.values[6]),source_text(r.values[11]),source_text(r.values[19])]+[currency+' '+source_text(r.values[13+i]) for i,currency in enumerate(CURRENCIES)]))
            self.raw.insert('end','\n\n'.join(lines))
        self.raw.configure(state='disabled')
    def choose_import(self):
        if self.busy:return
        paths=filedialog.askopenfilenames(parent=self.root,filetypes=[('Excel','*.xlsx')])
        if not paths:return
        def prepare():
            results=[]
            for path in paths:
                try:results.append((prepare_snapshot(path),None))
                except Exception as error:results.append((None,(Path(path).name,self.message(error))))
            return results
        self.work(prepare,self.preview_import)
    def preview_import(self,prepared):
        tr=self.tr;dialog=tk.Toplevel(self.root);dialog.title(tr('previewImport'));dialog.geometry('1000x530');dialog.transient(self.root);dialog.grab_set();frame=ttk.Frame(dialog,padding=14);frame.pack(fill='both',expand=True);frame.columnconfigure(0,weight=1);frame.rowconfigure(2,weight=1)
        ttk.Label(frame,text=tr('periodHint'),wraplength=950).grid(row=0,column=0,sticky='ew',pady=(0,8))
        bulk=ttk.Frame(frame);bulk.grid(row=1,column=0,sticky='ew');year_var=tk.StringVar();ttk.Label(bulk,text=tr('batchYear')).pack(side='left');ttk.Entry(bulk,textvariable=year_var,width=9).pack(side='left',padx=6)
        columns=('filename','year','week','rows','validation','replace');tree=ttk.Treeview(frame,columns=columns,show='headings',selectmode='browse')
        for key,width in zip(columns,(300,75,75,75,260,100)):tree.heading(key,text=tr(key));tree.column(key,width=width)
        tree.grid(row=2,column=0,sticky='nsew',pady=10);vbar=ttk.Scrollbar(frame,command=tree.yview);vbar.grid(row=2,column=1,sticky='ns');tree.configure(yscrollcommand=vbar.set)
        candidates=[];active={(r['year'],r['week']):r for r in self.store.active_list()}
        for item,error in prepared:candidates.append({'prepared':item,'error':error,'year':item.suggested_year if item else None,'week':item.suggested_week if item else None,'replace':False})
        def render():
            tree.delete(*tree.get_children())
            for i,c in enumerate(candidates):
                if c['error']:name,message=c['error'];count=''
                else:
                    p=c['prepared'];name=p.filename;count=p.row_count;message=tr('readyImport')
                    try:
                        label=period_label(c['year'],c['week']);current=active.get((int(c['year']),int(c['week'])))
                        if current:message=tr('sameFile') if current['sha256']==p.sha256 else tr('needsReplace')
                        other=next((v for period,v in active.items() if v['sha256']==p.sha256 and period!=(int(c['year']),int(c['week']))),None)
                        if other:message=tr('fileOtherPeriod',period=period_label(other['year'],other['week']))
                    except (HistoryError,ValueError,TypeError):message=tr('needsPeriod')
                tree.insert('','end',iid=str(i),values=(name,c['year'] or '',c['week'] or '',count,message,tr('yes') if c['replace'] else ''))
        def apply_year():
            try:value=int(year_var.get());monday(value,1)
            except Exception:messagebox.showerror(tr('historyPage'),tr('needsPeriod'),parent=dialog);return
            for c in candidates:
                if c['prepared'] and not c['year']:c['year']=value
            render()
        ttk.Button(bulk,text=tr('applyYear'),command=apply_year).pack(side='left')
        def edit():
            chosen=tree.selection()
            if not chosen:return
            c=candidates[int(chosen[0])]
            if c['error']:return
            editor=tk.Toplevel(dialog);editor.title(tr('editPeriod'));editor.transient(dialog);editor.grab_set();box=ttk.Frame(editor,padding=15);box.pack();yv=tk.StringVar(value=str(c['year'] or ''));wv=tk.StringVar(value=str(c['week'] or ''));replace=tk.BooleanVar(value=c['replace'])
            for r,(key,var) in enumerate((('year',yv),('week',wv))):ttk.Label(box,text=tr(key)).grid(row=r,column=0);ttk.Entry(box,textvariable=var,width=12).grid(row=r,column=1,pady=5)
            ttk.Checkbutton(box,text=tr('replaceConsent'),variable=replace).grid(row=2,column=0,columnspan=2,pady=8)
            def save():
                try:c['year'],c['week']=parse_period(f'{yv.get()}-W{wv.get()}')
                except HistoryError as e:messagebox.showerror(tr('historyPage'),self.message(e),parent=editor);return
                c['replace']=replace.get();editor.destroy();dialog.grab_set();render()
            ttk.Button(box,text=tr('save'),command=save).grid(row=3,column=0,columnspan=2)
        tree.bind('<Double-1>',lambda e:edit());buttons=ttk.Frame(frame);buttons.grid(row=3,column=0,sticky='ew');ttk.Button(buttons,text=tr('editPeriod'),command=edit).pack(side='left')
        def remove_candidate():
            chosen=tree.selection()
            if chosen:del candidates[int(chosen[0])];render()
        ttk.Button(buttons,text=tr('excludeFile'),command=remove_candidate).pack(side='left',padx=6)
        def save_batch():
            try:
                if not candidates:raise HistoryError('noFiles')
                requests=[];seen=set();hashes={}
                for c in candidates:
                    if c['error']:raise HistoryError('badImportFile')
                    year,week=parse_period(f"{c['year']}-W{c['week']}");period=(year,week)
                    if period in seen:raise HistoryError('batchDuplicate',period=period_label(year,week))
                    seen.add(period);current=active.get(period)
                    if current and current['sha256']!=c['prepared'].sha256 and not c['replace']:raise HistoryError('weekConflict',period=period_label(year,week))
                    digest=c['prepared'].sha256;other=next((p for p,v in active.items() if v['sha256']==digest and p!=period),hashes.get(digest))
                    if other and other!=period:raise HistoryError('fileOtherPeriod',period=period_label(*other))
                    hashes[digest]=period
                    requests.append(ImportRequest(c['prepared'],year,week,c['replace']))
            except HistoryError as error:messagebox.showerror(tr('historyPage'),self.message(error),parent=dialog);return
            dialog.destroy();self.work(lambda:self.store.import_batch(requests),lambda result:self.reload())
        ttk.Button(buttons,text=tr('confirmImport'),command=save_batch).pack(side='right');render()
    def manage(self):
        if self.busy:return
        tr=self.tr;dialog=tk.Toplevel(self.root);dialog.title(tr('manageHistory'));dialog.geometry('880x500');dialog.transient(self.root);dialog.grab_set();frame=ttk.Frame(dialog,padding=14);frame.pack(fill='both',expand=True);frame.rowconfigure(0,weight=1);frame.columnconfigure(0,weight=1)
        tree=ttk.Treeview(frame,columns=('period','filename','rows','version'),show='headings',selectmode='browse');tree.grid(row=0,column=0,sticky='nsew')
        for key,width in (('period',130),('filename',430),('rows',90),('version',80)):tree.heading(key,text=tr(key));tree.column(key,width=width)
        for r in self.store.active_list():tree.insert('','end',iid=str(r['id']),values=(period_label(r['year'],r['week']),r['filename'],r['row_count'],r['id']))
        buttons=ttk.Frame(frame);buttons.grid(row=1,column=0,sticky='ew',pady=10)
        def remove():
            chosen=tree.selection()
            if not chosen:return
            year,week=parse_period(tree.item(chosen[0],'values')[0])
            if messagebox.askyesno(tr('removeWeek'),tr('removeConfirm',period=period_label(year,week)),parent=dialog):dialog.destroy();self.work(lambda:self.store.remove(year,week),lambda _:self.reload())
        def restore():
            versions=self.store.versions();popup=tk.Toplevel(dialog);popup.title(tr('restoreVersion'));popup.geometry('950x500');popup.transient(dialog);popup.grab_set();view=ttk.Treeview(popup,columns=('period','file','version','active','created'),show='headings',selectmode='browse');view.pack(fill='both',expand=True,padx=12,pady=12)
            for key,width in (('period',130),('file',320),('version',70),('active',75),('created',270)):view.heading(key,text=tr(key));view.column(key,width=width)
            for v in versions:view.insert('','end',iid=str(v['id']),values=(period_label(v['year'],v['week']),v['filename'],v['id'],tr('yes') if v['active'] else '',v['created_at']))
            def activate():
                chosen=view.selection()
                if chosen and messagebox.askyesno(tr('restoreVersion'),tr('restoreConfirm'),parent=popup):version_id=int(chosen[0]);popup.destroy();dialog.destroy();self.work(lambda:self.store.restore(version_id),lambda _:self.reload())
            ttk.Button(popup,text=tr('restoreVersion'),command=activate).pack(pady=(0,12))
        ttk.Button(buttons,text=tr('removeWeek'),command=remove).pack(side='left');ttk.Button(buttons,text=tr('restoreVersion'),command=restore).pack(side='left',padx=8)
    def export(self,kind):
        if self.busy or self.timeline is None:return
        path=filedialog.asksaveasfilename(parent=self.root,defaultextension='.'+kind,initialfile='DIAM-continuity.'+kind,filetypes=[(kind.upper(),'*.'+kind)])
        if not path:return
        try:
            if kind=='html':export_timeline_html(self.snapshots,path,self.tr,self.timeline)
            else:export_timeline_csv(self.timeline,path,self.tr)
            self.status.set(self.tr('saved',path=path))
        except Exception as error:messagebox.showerror(self.tr('historyPage'),self.message(error),parent=self.root)
