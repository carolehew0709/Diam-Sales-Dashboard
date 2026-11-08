import * as XLSX from 'xlsx';
import {excelDate} from './receivables-parser';
import type {Finding} from './types';
import type {ReceivableRecord,AgingBucket} from './receivables-types';
const text=(v:unknown)=>String(v??'').trim();
/** A specifically identified DDC ledger replaces DDC invoices only, in original currencies. */
export function parseDdcAging(bytes:Buffer,file:string){
 const wb=XLSX.read(bytes,{type:'buffer',cellFormula:true});
 const entry=wb.SheetNames.map(name=>({name,ws:wb.Sheets[name]})).find(({ws})=>ws.A1?.v==='序号'&&ws.Q1?.v==='余额'&&ws.L1?.v==='最后到期日');
 if(!entry)return null;
 const date=file.match(/(20\d{2})(\d{2})(\d{2})/),asOfDate=date?excelDate(`${date[1]}-${date[2]}-${date[3]}`):null;
 const records:ReceivableRecord[]=[],findings:Finding[]=[];
 if(!asOfDate)throw Error('DDC source reporting date is missing');
 const rows=XLSX.utils.sheet_to_json<unknown[]>(entry.ws,{header:1,range:0,defval:null});let mismatch=0,missing=0;
 rows.slice(1).forEach((r,index)=>{
  if(!r[9]&&!r[5])return;
  if(text(r[2])!=='迪亚姆展示设备（昆山）有限公司')throw Error(`Unexpected settlement organization at row ${index+2}`);
  const currency=text(r[6])==='欧元'?'EUR':text(r[6])==='人民币'?'RMB':null;
  const invoiceDate=excelDate(r[10]),dueDate=excelDate(r[11]);
  if(!currency||!invoiceDate||!dueDate||typeof r[16]!=='number'||!Number.isFinite(r[16])||!r[9]||!r[5])throw Error(`Missing or invalid DDC invoice field at row ${index+2}`);
  for(const c of [10,11,16]){const cell=entry.ws[XLSX.utils.encode_cell({r:index+1,c})];if(cell?.t==='e'||(cell?.f&&cell.v===undefined))throw Error(`Invalid cached DDC value at row ${index+2}`);}
  const days=typeof r[12]==='number'?r[12]:typeof r[13]==='number'?-r[13]:null;
  const aging:AgingBucket=days===null?'unclassified':days<=0?'not-due':days<=30?'1-30':days<=60?'31-60':days<=90?'61-90':days<=120?'91-120':'over-120';
  if(days===null)missing++;else if(Math.round((Date.parse(asOfDate)-Date.parse(dueDate))/86400000)!==days)mismatch++;
  records.push({id:`ddc:${entry.name}:${index+2}`,entityId:'ddc',category:'invoice',customer:text(r[5]),subCustomer:'',salesTeam:text(r[17]),pic:text(r[18]),invoiceNumber:text(r[9]),invoiceDate,receivedDate:null,dueDate,asOfDate,terms:null,overdueDays:days,aging,sourceAging:`逾期天数=${r[12]??''}; 即将到期天数=${r[13]??''}`,customerType:'Unclassified',amount:r[16],currency,note:text(r[19]),sourceFile:file,sourceSheet:entry.name,sourceRow:index+2});
 });
 if(!records.length)throw Error('No valid DDC invoices');
 findings.push({severity:'review',message:'DDC invoices only; preserve DEHK invoices and all Unknown/Advance receipts. Original EUR/RMB remain separate. External/Group allocation is not supplied.'});
 if(missing)findings.push({severity:'review',message:`${missing} invoices have no source aging days; leave unclassified rather than recompute.`});
 if(mismatch)findings.push({severity:'review',message:`${mismatch} source aging values differ from due-date arithmetic; preserve the source aging columns.`});
 return {records,findings,sourceKind:'aging' as const,replacementEntityIds:['ddc'],sheets:wb.SheetNames.map(name=>({name,rows:XLSX.utils.decode_range(wb.Sheets[name]['!ref']??'A1').e.r+1,kind:name===entry.name?'DDC invoices':'Supporting (not added)'}))};
}
