"""Portable on-going-DDC project comparison UI."""
from __future__ import annotations
import argparse,ctypes,json,os,queue,sys,threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk,filedialog,messagebox
ROOT=Path(getattr(sys,'_MEIPASS',Path(__file__).resolve().parents[2]))
if not getattr(sys,'frozen',False):sys.path.insert(0,str(ROOT/'lib'))
from weekly_order_comparison import VERSION,CURRENCIES,Translator,CompareError,compare,stats,visible,joined,described,display,text,exact,export_csv,export_html,write_output
MODES=('changed','modified','same','status','date','amount','added','removed','review','all')

class App:
    def __init__(self,root,language='zh-CN',smoke=None,parent=None):
        self.root=root;self.tr=Translator(ROOT,language).tr;self.smoke=smoke
        self.host=parent if parent is not None else root
        self.old=tk.StringVar();self.new=tk.StringVar();self.team=tk.StringVar();self.brand=tk.StringVar();self.currency=tk.StringVar(value='EUR');self.mode=tk.StringVar();self.search=tk.StringVar();self.status=tk.StringVar(value=self.tr('ready'))
        self.result=None;self.scoped=[];self.shown=[];self.busy=False;self.generation=0;self.events=queue.Queue();self.controls=[]
        self.build();self.old.trace_add('write',self.invalidate);self.new.trace_add('write',self.invalidate);self.search.trace_add('write',lambda *args:self.refresh())
        root.after(100,self.poll)
        if smoke:self.old.set(smoke[0]);self.new.set(smoke[1]);root.after(200,self.start)
    def build(self):
        tr=self.tr;root=self.root;root.title(tr('title')+' '+VERSION);root.geometry('1320x880');root.minsize(1050,720)
        root.configure(bg='#f3f6f9');style=ttk.Style(root);style.theme_use('clam');style.configure('.',font=('Microsoft YaHei UI',10));style.configure('TFrame',background='#f3f6f9');style.configure('TLabel',background='#f3f6f9',foreground='#193349');style.configure('TButton',padding=(9,5));style.configure('Treeview',font=('Microsoft YaHei UI',11),rowheight=32);style.configure('Treeview.Heading',background='#193f59',foreground='white',padding=6)
        main=ttk.Frame(self.host,padding=(20,12));main.pack(fill='both',expand=True);main.columnconfigure(0,weight=1);main.rowconfigure(4,weight=1)
        head=ttk.Frame(main);head.grid(row=0,column=0,sticky='ew',pady=(0,9));head.columnconfigure(0,weight=1)
        ttk.Label(head,text=tr('title'),font=('Microsoft YaHei UI',18,'bold')).grid(row=0,column=0,sticky='w')
        self.html_button=ttk.Button(head,text=tr('exportHtml'),command=lambda:self.export('html'),state='disabled');self.html_button.grid(row=0,column=1,padx=6)
        self.csv_button=ttk.Button(head,text=tr('exportCsv'),command=lambda:self.export('csv'),state='disabled');self.csv_button.grid(row=0,column=2)
        try:
            logo=tk.PhotoImage(file=str(ROOT/'DIAM Logos/DIAM triangle (1).png'));self.logo=logo.subsample(max(1,logo.width()//36));root.iconphoto(True,self.logo)
        except tk.TclError:pass
        files=ttk.Frame(main);files.grid(row=1,column=0,sticky='ew',pady=(0,10));files.columnconfigure(1,weight=1,uniform='files');files.columnconfigure(4,weight=1,uniform='files');self.file_entries=[]
        for c,(key,var) in enumerate((('oldSource',self.old),('newSource',self.new))):
            col=c*3;ttk.Label(files,text=tr(key)).grid(row=0,column=col,padx=(10 if c else 0,6))
            entry=ttk.Entry(files,textvariable=var,width=15);entry.grid(row=0,column=col+1,sticky='ew');self.file_entries.append(entry)
            button=ttk.Button(files,text=tr('browseCompact'),command=lambda v=var:self.browse(v));button.grid(row=0,column=col+2,padx=(6,0));self.controls.extend((entry,button))
        self.run_button=ttk.Button(files,text=tr('compare'),command=self.start);self.run_button.grid(row=0,column=6,padx=(10,0));self.controls.append(self.run_button)
        cards=ttk.Frame(main);cards.grid(row=2,column=0,sticky='ew',pady=(0,8));self.card_values=[];self.card_notes=[]
        for i,key in enumerate(('modified','added','removed','same')):
            cards.columnconfigure(i,weight=1,uniform='cards');box=tk.Frame(cards,bg='#193f59' if i==3 else 'white',padx=14,pady=8);box.grid(row=0,column=i,sticky='nsew',padx=(0,9 if i<3 else 0));bg=box['bg'];fg='white' if i==3 else '#193349'
            tk.Label(box,text=tr(key),bg=bg,fg=fg,font=('Microsoft YaHei UI',10),anchor='w').pack(fill='x');value=tk.StringVar(value='—');note=tk.StringVar();tk.Label(box,textvariable=value,bg=bg,fg=fg,font=('Microsoft YaHei UI',22,'bold'),anchor='w').pack(fill='x');tk.Label(box,textvariable=note,bg=bg,fg=fg,font=('Microsoft YaHei UI',9),anchor='w').pack(fill='x');self.card_values.append(value);self.card_notes.append(note)
        filters=ttk.Frame(main);filters.grid(row=3,column=0,sticky='ew',pady=(0,8));filters.columnconfigure(9,weight=1)
        for i,(key,var,width,values) in enumerate((('team',self.team,19,[tr('all')]),('brand',self.brand,16,[tr('all')]),('currency',self.currency,7,list(CURRENCIES)),('mode',self.mode,12,[tr('mode.'+m) for m in MODES]))):
            ttk.Label(filters,text=tr(key)).grid(row=0,column=i*2,padx=(0,5));box=ttk.Combobox(filters,textvariable=var,width=width,state='readonly',values=values);box.grid(row=0,column=i*2+1,padx=(0,10));box.bind('<<ComboboxSelected>>',lambda event:self.refresh());setattr(self,key+'_box',box)
        self.team.set(tr('all'));self.brand.set(tr('all'));self.mode.set(tr('mode.changed'));ttk.Label(filters,text=tr('search')).grid(row=0,column=8,padx=(0,5));ttk.Entry(filters,textvariable=self.search,width=14).grid(row=0,column=9,sticky='ew')
        self.views=ttk.Notebook(main);self.views.grid(row=4,column=0,sticky='nsew');visual=ttk.Frame(self.views);self.data_view=ttk.Frame(self.views);self.views.add(visual,text=tr('overview'));self.views.add(self.data_view,text=tr('dataChanges'))
        self.canvas=tk.Canvas(visual,bg='white',highlightthickness=0);bar=ttk.Scrollbar(visual,command=self.canvas.yview);bar.pack(side='right',fill='y');self.canvas.pack(side='left',fill='both',expand=True);self.canvas.configure(yscrollcommand=bar.set);self.canvas.bind('<Configure>',lambda event:self.draw());self.canvas.bind('<MouseWheel>',lambda event:self.canvas.yview_scroll(int(-event.delta/120),'units'))
        pane=ttk.Panedwindow(self.data_view,orient='vertical');pane.pack(fill='both',expand=True);top=ttk.Frame(pane);bottom=ttk.Frame(pane);pane.add(top,weight=3);pane.add(bottom,weight=2);top.rowconfigure(0,weight=1);top.columnconfigure(0,weight=1);self.pane=pane;self.views.bind('<<NotebookTabChanged>>',lambda event:root.after_idle(self.resize_detail))
        columns=('kind','job','project','team','brand','rmb','usd','eur','status','date','same');self.tree=ttk.Treeview(top,columns=columns,show='headings',selectmode='browse',height=9)
        for key,width in zip(columns,(110,145,260,135,105,115,115,115,160,155,95)):
            label=key.upper()+' Δ' if key in ('rmb','usd','eur') else tr(key);self.tree.heading(key,text=label,command=lambda c=key:self.sort(c));self.tree.column(key,width=width,minwidth=60,stretch=key=='project')
        self.tree.grid(row=0,column=0,sticky='nsew');vbar=ttk.Scrollbar(top,command=self.tree.yview);vbar.grid(row=0,column=1,sticky='ns');hbar=ttk.Scrollbar(top,orient='horizontal',command=self.tree.xview);hbar.grid(row=1,column=0,sticky='ew');self.tree.configure(yscrollcommand=vbar.set,xscrollcommand=hbar.set);self.tree.bind('<<TreeviewSelect>>',self.details)
        self.detail_text=tk.Text(bottom,height=8,wrap='word',font=('Microsoft YaHei UI',11),bg='white',relief='flat',padx=12,pady=12);scroll=ttk.Scrollbar(bottom,command=self.detail_text.yview);scroll.pack(side='right',fill='y');self.detail_text.pack(side='left',fill='both',expand=True);self.detail_text.configure(yscrollcommand=scroll.set)
        self.tree.tag_configure('added',background='#e5f3ec');self.tree.tag_configure('removed',background='#faeae5');self.tree.tag_configure('review',background='#fff1d5')
        self.status_label=ttk.Label(main,textvariable=self.status,wraplength=1100);self.status_label.grid(row=5,column=0,sticky='ew',pady=(6,0));root.bind('<Configure>',lambda e:self.status_label.configure(wraplength=max(300,root.winfo_width()-40)) if e.widget==root else None)
    def resize_detail(self):
        if self.views.select()==str(self.data_view) and self.pane.winfo_height()>100 and not getattr(self,'sized',False):self.pane.sashpos(0,int(self.pane.winfo_height()*.65));self.sized=True
    def browse(self,var):
        path=filedialog.askopenfilename(filetypes=[('Excel','*.xlsx')])
        if path:var.set(path)
    def invalidate(self,*args):
        self.generation+=1;self.result=None;self.scoped=[];self.shown=[];self.tree.delete(*self.tree.get_children());self.html_button.configure(state='disabled');self.csv_button.configure(state='disabled')
        for value in self.card_values:value.set('—')
        self.draw();self.status.set(self.tr('ready'))
    def start(self):
        if self.busy:return
        if not self.old.get() or not self.new.get():messagebox.showerror(self.tr('title'),self.tr('chooseBoth'));return
        self.invalidate();self.busy=True;token=self.generation;old,new=self.old.get(),self.new.get();self.status.set(self.tr('working'))
        for control in self.controls:control.configure(state='disabled')
        def work():
            try:self.events.put((token,compare(old,new),None))
            except Exception as error:self.events.put((token,None,error))
        threading.Thread(target=work,daemon=True).start()
    def poll(self):
        try:
            token,result,error=self.events.get_nowait();self.busy=False
            for control in self.controls:control.configure(state='normal')
            if token==self.generation:
                if error:
                    message=self.tr(error.key,**error.params) if isinstance(error,CompareError) else str(error);self.status.set(message)
                    if self.smoke:Path(self.smoke[2]).write_text(json.dumps({'error':message}),encoding='utf-8');self.root.destroy();return
                    messagebox.showerror(self.tr('title'),message)
                else:
                    self.result=result
                    for c,var,box in ((3,self.team,self.team_box),(6,self.brand,self.brand_box)):
                        values=sorted({str(r.values[c]).replace('\n',' ') for r in result.old.rows+result.new.rows if r.values[c] is not None});box.configure(values=[self.tr('all')]+values);var.set(self.tr('all'))
                    self.html_button.configure(state='normal');self.csv_button.configure(state='normal');self.refresh()
                    if self.smoke:self.root.after(300,self.finish_smoke)
        except queue.Empty:pass
        self.root.after(100,self.poll)
    def args(self):
        tr=self.tr;mode=next((m for m in MODES if tr('mode.'+m)==self.mode.get()),'changed');return dict(team='' if self.team.get()==tr('all') else self.team.get(),brand='' if self.brand.get()==tr('all') else self.brand.get(),mode=mode,search=self.search.get())
    def refresh(self):
        if self.result is None:return
        args=self.args();self.scoped=self.result.changes(args['team'],args['brand'],args['search']);self.shown=[c for c in self.scoped if visible(c,args['mode'])];self.render_rows();s=stats(self.scoped,self.currency.get())
        for i,key in enumerate(('modified','added','removed','same')):self.card_values[i].set(str(s[key]))
        self.card_notes[0].set(f"{self.tr('amount')} {s['amount']} / {self.tr('date')} {s['date']} / {self.tr('status')} {s['status']}");self.card_notes[1].set(self.tr('projectGroups'));self.card_notes[2].set(self.tr('projectGroups'));self.card_notes[3].set(self.tr('sameShort'))
        self.draw();self.status.set(self.tr('loaded',old=len(self.result.old.rows),new=len(self.result.new.rows),count=len(self.shown),review=s['review']))
    def render_rows(self):
        self.tree.delete(*self.tree.get_children())
        for i,c in enumerate(self.shown):
            transition=lambda col:(described(c['old'],col)+' → '+described(c['new'],col)) if c['old'] and c['new'] and described(c['old'],col)!=described(c['new'],col) else described(c['new'] or c['old'],col)
            self.tree.insert('','end',iid=str(i),values=(self.tr('kind.'+c['kind']),c['job'],c['project'],c['team'],c['brand'],*[display(c['amounts'][v]['delta']) for v in CURRENCIES],transition(11),transition(19),self.tr('yes') if c['same'] else ''),tags=(c['kind'],))
        if self.shown:self.tree.selection_set('0');self.details()
    def sort(self,column):
        if column in ('rmb','usd','eur'):self.shown.sort(key=lambda c:(c['amounts'][column.upper()]['delta'] is None,-abs(c['amounts'][column.upper()]['delta'] or 0)))
        else:self.shown.sort(key=lambda c:str(c.get(column,'')))
        self.render_rows()
    def focus(self,c):
        self.mode.set(self.tr('mode.all'));self.refresh();self.views.select(self.data_view)
        for i,row in enumerate(self.shown):
            if row['key']==c['key']:self.tree.selection_set(str(i));self.tree.see(str(i));self.details();break
    def details(self,event=None):
        selection=self.tree.selection()
        if not selection:return
        c=self.shown[int(selection[0])];tr=self.tr;lines=[c['job']+' / '+c['project'],tr('groupNote'),'']
        for currency in CURRENCIES:
            a=c['amounts'][currency];lines.append(currency+': '+a['old']['text']+' → '+a['new']['text']+'   Δ '+display(a['delta']))
        lines.extend([tr('oldStatus')+': '+described(c['old'],11),tr('newStatus')+': '+described(c['new'],11),tr('oldDate')+': '+described(c['old'],19),tr('newDate')+': '+described(c['new'],19),'',tr('sourceRows')])
        for side in ('old','new'):
            for r in c[side]:lines.append(f"{tr(side)} / {tr('row')} {r.row} / {text(r.values[3])} / {text(r.values[6])} / {text(r.values[11])} / {text(r.values[19])} / RMB {text(r.values[13])} / USD {text(r.values[14])} / EUR {text(r.values[15])}")
        self.detail_text.configure(state='normal');self.detail_text.delete('1.0','end');self.detail_text.insert('end','\n'.join(lines));self.detail_text.configure(state='disabled')
    def draw(self):
        cv=self.canvas;cv.delete('all');w=max(cv.winfo_width(),900);tr=self.tr
        def label(x,y,value,size=10,color='#193349',**kw):return cv.create_text(x,y,text=str(value),font=('Microsoft YaHei UI',size),fill=color,anchor='nw',**kw)
        if self.result is None:label(24,28,tr('scope'),12,width=w-48);return
        currency=self.currency.get();s=stats(self.scoped,currency);label(22,16,tr('amountNote'),10,'#607487',width=w-44);label(22,50,tr('knownNet')+' '+currency+': '+display(s['positive']+s['negative']),15)
        mid=w*.53;label(22,94,tr('rankTitle')+' / '+currency,12);label(mid+20,94,tr('statusTitle'),12)
        ranked=sorted([c for c in self.scoped if c['amounts'][currency]['delta'] is not None and abs(c['amounts'][currency]['delta'])>0.000001],key=lambda c:abs(c['amounts'][currency]['delta']),reverse=True)[:8];maximum=max([abs(c['amounts'][currency]['delta']) for c in ranked] or [1])
        for i,c in enumerate(ranked):
            y=132+i*39;d=c['amounts'][currency]['delta'];tag='project'+str(i);color='#18745b' if d>=0 else '#b64b37';cv.create_rectangle(15,y-3,mid-10,y+33,fill='white',outline='',tags=tag);cv.addtag_withtag(tag,label(22,y,c['job'],10));cv.addtag_withtag(tag,label(22,y+18,c['project'][:28],9,'#607487'));x=mid*.56;length=float(abs(d)/maximum)*max(10,mid*.20);cv.create_rectangle(x,y+8,x+length,y+19,fill=color,outline='',tags=tag);cv.addtag_withtag(tag,label(mid-118,y+5,('+' if d>0 else '')+display(d),10,color));cv.tag_bind(tag,'<Button-1>',lambda e,row=c:self.focus(row))
        transitions={}
        for c in self.scoped:
            if 'status' in c['flags']:
                name=described(c['old'],11)+' → '+described(c['new'],11);transitions[name]=transitions.get(name,0)+1
        for i,(name,count) in enumerate(sorted(transitions.items(),key=lambda item:-item[1])[:8]):
            y=132+i*43;label(mid+20,y,name,9,width=w-mid-85);label(w-55,y,count,12,'#28658d')
        if not transitions:label(mid+20,145,tr('noStatusChanges'),10,'#607487')
        if not ranked:label(22,145,tr('noAmountChanges'),10,'#607487')
        tag='same-status';y=470;cv.create_rectangle(22,y,w-22,y+42,fill='#e6eef5',outline='',tags=tag);cv.addtag_withtag(tag,label(36,y+10,tr('same')+': '+str(s['same'])+'  — '+tr('sameShort'),11));cv.tag_bind(tag,'<Button-1>',lambda event:self.show_same());label(22,y+60,tr('sameNote'),10,'#607487',width=w-44);cv.configure(scrollregion=(0,0,w,max(570,cv.winfo_height())))
    def show_same(self):self.mode.set(self.tr('mode.same'));self.refresh();self.views.select(self.data_view)
    def export(self,kind):
        if self.result is None or self.busy:return
        path=filedialog.asksaveasfilename(defaultextension='.'+kind,initialfile='DDC-'+self.result.new.path.stem+'-vs-'+self.result.old.path.stem+'.'+kind,filetypes=[(kind.upper(),'*.'+kind)])
        if not path:return
        try:
            args=self.args()
            if kind=='html':export_html(self.result,path,self.tr,**args,currency=self.currency.get())
            else:export_csv(self.result,path,self.tr,**args)
            self.status.set(self.tr('saved',path=path))
        except Exception as e:messagebox.showerror(self.tr('title'),self.tr(e.key,**e.params) if isinstance(e,CompareError) else str(e))
    def finish_smoke(self):
        s=stats(self.scoped);self.show_same();same=len(self.shown);self.mode.set(self.tr('mode.all'));self.team.set(self.team_box['values'][1]);self.refresh();filtered=len(self.scoped);self.team.set(self.tr('all'));self.refresh();self.focus(self.scoped[0]);self.root.update_idletasks()
        evidence={'version':VERSION,'summary':{k:str(v) for k,v in s.items()},'sameList':same,'teamFiltered':filtered,'detailVisible':self.views.select()==str(self.data_view),'formulaAbsent':'SUM(' not in self.detail_text.get('1.0','end'),'pickersSameRow':self.file_entries[0].winfo_rooty()==self.file_entries[1].winfo_rooty(),'htmlEnabled':str(self.html_button['state'])=='normal'}
        Path(self.smoke[2]).write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8');self.root.after(200,self.root.destroy)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--lang',choices=('en','zh-CN'),default='zh-CN');parser.add_argument('--old');parser.add_argument('--new');parser.add_argument('--html');parser.add_argument('--csv');parser.add_argument('--summary');parser.add_argument('--team',default='');parser.add_argument('--brand',default='');parser.add_argument('--mode',choices=MODES,default='changed');parser.add_argument('--currency',choices=CURRENCIES,default='EUR');parser.add_argument('--preview',nargs=2);parser.add_argument('--ui-smoke-test',nargs=3)
    parser.add_argument('--history-db');parser.add_argument('--history-import',nargs='*');parser.add_argument('--replace-week',action='append',default=[]);parser.add_argument('--history-html');parser.add_argument('--history-csv');parser.add_argument('--history-summary');parser.add_argument('--history-start');parser.add_argument('--history-end');parser.add_argument('--history-all',action='store_true');parser.add_argument('--history-ui-smoke-test')
    args=parser.parse_args()
    from weekly_continuity import HistoryStore,HistoryTranslator,ImportRequest,prepare_snapshot,parse_period,monday,build_timeline,export_timeline_csv,export_timeline_html,VERSION as APP_VERSION
    database=Path(args.history_db).resolve() if args.history_db else ((Path(sys.executable).parent/'history/continuity.sqlite') if getattr(sys,'frozen',False) else ROOT/'.local/continuity-history/continuity.sqlite')
    if args.history_import is not None or args.history_html or args.history_csv or args.history_summary:
        try:
            store=HistoryStore(database);tr=HistoryTranslator(ROOT,args.lang).tr
            if args.history_import:
                requests=[]
                for item in args.history_import:
                    label,path=item.split('=',1);year,week=parse_period(label);requests.append(ImportRequest(prepare_snapshot(path),year,week,label in args.replace_week))
                store.import_batch(requests)
            snapshots=store.snapshots();timeline=build_timeline(snapshots,monday(*parse_period(args.history_start)) if args.history_start else None,monday(*parse_period(args.history_end)) if args.history_end else None,args.team,args.brand,latest_only=not args.history_all)
            if args.history_html:export_timeline_html(snapshots,args.history_html,tr,timeline)
            if args.history_csv:export_timeline_csv(timeline,args.history_csv,tr)
            if args.history_summary:write_output(args.history_summary,json.dumps({'version':APP_VERSION,'activeWeeks':len(snapshots),'weeks':[list(w) for w in timeline.weeks],'projects':len(timeline.projects),'latest':timeline.latest,'latestOnly':timeline.latest_only},ensure_ascii=False,indent=2),None,'.json')
            return 0
        except Exception as error:
            if sys.stderr:print(str(error),file=sys.stderr)
            return 1
    if args.old or args.new:
        if not args.old or not args.new:parser.error('--old and --new are required together')
        try:
            result=compare(args.old,args.new);tr=Translator(ROOT,args.lang).tr
            if args.html:export_html(result,args.html,tr,args.team,args.brand,args.mode,currency=args.currency)
            if args.csv:export_csv(result,args.csv,tr,args.team,args.brand,args.mode)
            if args.summary:write_output(args.summary,json.dumps({'version':VERSION,'oldRows':len(result.old.rows),'newRows':len(result.new.rows),'stats':stats(result.changes(args.team,args.brand),args.currency)},ensure_ascii=False,indent=2,default=str),result,'.json')
            return 0
        except Exception as error:
            if sys.stderr:print(str(error),file=sys.stderr)
            return 1
    if os.name=='nt':
        try:ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError,OSError):pass
    root=tk.Tk();navigation=ttk.Notebook(root);navigation.pack(fill='both',expand=True);two=ttk.Frame(navigation);continuous=ttk.Frame(navigation);history_tr=HistoryTranslator(ROOT,args.lang).tr
    navigation.add(two,text=history_tr('twoPage'));navigation.add(continuous,text=history_tr('historyPage'));app=App(root,args.lang,args.ui_smoke_test,parent=two)
    from continuity_page import ContinuityPage
    try:history=ContinuityPage(continuous,root,HistoryStore(database),ROOT,args.lang)
    except Exception as error:
        messagebox.showerror(history_tr('historyPage'),history_tr('databaseError',path=database,reason=str(error)));root.destroy();return 1
    root.title(history_tr('appTitle')+' '+APP_VERSION)
    if args.preview:app.old.set(args.preview[0]);app.new.set(args.preview[1]);root.after(200,app.start)
    if args.history_ui_smoke_test:
        navigation.select(continuous)
        def verify(attempt=0):
            if history.busy and attempt<150:root.after(100,lambda:verify(attempt+1));return
            try:
                initial=history.timeline;count=len(initial.projects);active=len(history.store.active_list());history.project_scope.set(history.tr('allHistory'));history.refresh();all_count=len(history.timeline.projects)
                history.pick_week(0);source_text=history.raw.get('1.0','end');history.project_scope.set(history.tr('latestOnly'));history.refresh()
                navigation.select(two);app.old.set('independent-old.xlsx');app.new.set('independent-new.xlsx');navigation.select(continuous)
                evidence={'version':APP_VERSION,'tabs':len(navigation.tabs()),'activeWeeks':active,'defaultLatestOnly':initial.latest_only,'defaultProjects':count,'allProjects':all_count,'matrixRows':len(history.matrix.get_children()),'sourceEvidence':bool(source_text.strip()),'twoPageIndependent':active==len(history.store.active_list()) and app.old.get()=='independent-old.xlsx','htmlEnabled':str(history.html_button['state'])=='normal'}
            except Exception as error:evidence={'error':str(error)}
            Path(args.history_ui_smoke_test).write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8');root.destroy()
        root.after(300,verify)
    root.mainloop();return 0
if __name__=='__main__':raise SystemExit(main())
