'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Send, Trash2 } from 'lucide-react';
import { entities } from '@/lib/seed';
import { canEdit, canPublish } from '@/lib/permissions';
import type { User } from '@/lib/types';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type PortalLine = { product: string; customer: string; customerType: 'External' | 'Group'; dgc: 'E' | 'G'; total2026: string; total2027: string; monthly2026: string[] };
const emptyLine = (): PortalLine => ({ product: '', customer: '', customerType: 'External', dgc: 'E', total2026: '', total2027: '', monthly2026: months.map(() => '') });

export function ImportPortal({ currentUser }: { currentUser: User }) {
  const [entityId, setEntityId] = useState('ddc');
  const [week, setWeek] = useState('37');
  const [turnoverExternal, setTurnoverExternal] = useState('');
  const [turnoverGroup, setTurnoverGroup] = useState('');
  const [p1, setP1] = useState('');
  const [source, setSource] = useState('APAC weekly review');
  const [lines, setLines] = useState<PortalLine[]>([emptyLine()]);
  const [message, setMessage] = useState('');
  const [reviewBatch, setReviewBatch] = useState<{ id: string; status: string; records: number; completeness: number } | null>(null);
  const entity = entities.find((item) => item.id === entityId) ?? entities[0];
  const editable = canEdit(currentUser, entity);
  const publishable = canPublish(currentUser, entity);
  const orderbook = useMemo(() => lines.reduce((sum, line) => sum + Number(line.total2026 || 0), 0), [lines]);
  const forecast = Number(turnoverExternal || 0) + Number(turnoverGroup || 0) + orderbook + Number(p1 || 0);
  const updateLine = (index: number, patch: Partial<PortalLine>) => setLines((items) => items.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line));
  const updateMonth = (lineIndex: number, monthIndex: number, value: string) => setLines((items) => items.map((line, index) => index === lineIndex ? { ...line, monthly2026: line.monthly2026.map((month, itemIndex) => itemIndex === monthIndex ? value : month) } : line));
  const submit = async () => {
    const response = await fetch('/api/import/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId, week, turnover: String(Number(turnoverExternal || 0) + Number(turnoverGroup || 0)), orderbook: String(orderbook), forecast: String(forecast), p1, source, turnoverExternal, turnoverGroup, lines: lines.filter((line) => line.product || line.customer) }) });
    const result = await response.json();
    if (result.batch) setReviewBatch({ id: result.batch.id, status: result.batch.status, records: result.batch.records, completeness: result.batch.completeness });
    setMessage(result.ok ? `Review batch created · ${result.batch.records} order lines · ${result.batch.completeness}% complete` : (result.validation?.findings ?? result.findings ?? ['Please complete the required fields']).join(' · '));
  };
  const publish = async () => {
    if (!reviewBatch) return;
    const response = await fetch('/api/import/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reviewBatch.id }) });
    const result = await response.json();
    setReviewBatch((batch) => batch ? { ...batch, status: result.ok ? 'published' : batch.status } : batch);
    setMessage(result.ok ? 'Published into the active demo snapshot.' : 'Publish failed. Review the batch and try again.');
  };
  return <section className="import-page" id="import-center">
    <div className="hero-row"><div><div className="eyebrow">DATA OPERATIONS / ENTRY PORTAL</div><h1>Enter weekly data</h1><p>Complete the entity submission directly in the portal. The review snapshot is kept separate until an authorized user publishes it.</p></div></div>
    <div className="portal-status"><span className={editable ? 'status ready' : 'status review'}>{editable ? 'Edit access' : 'View only'}</span><span>Entity scope: {entity.name}</span><span>Reporting unit: EUR K</span></div>
    <div className="panel portal-panel"><div className="panel-heading"><div><span className="kicker">Step 01 · Submission context</span><h2>Entity and weekly snapshot</h2></div><span className="unit">Required</span></div><div className="form-grid"><label>Entity<select value={entityId} onChange={(event) => setEntityId(event.target.value)}>{entities.filter((item) => canEdit(currentUser, item) || canViewSafe(currentUser, item)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Week<input type="number" min="1" max="53" value={week} onChange={(event) => setWeek(event.target.value)}/></label><label>YTD turnover · external<input inputMode="decimal" value={turnoverExternal} onChange={(event) => setTurnoverExternal(event.target.value)} placeholder="0.0"/></label><label>YTD turnover · group<input inputMode="decimal" value={turnoverGroup} onChange={(event) => setTurnoverGroup(event.target.value)} placeholder="0.0"/></label><label>P1 upside<input inputMode="decimal" value={p1} onChange={(event) => setP1(event.target.value)} placeholder="0.0"/></label><label className="wide">Source note<input value={source} onChange={(event) => setSource(event.target.value)}/></label></div><div className="portal-calculated"><span>Orderbook 2026 <strong>{orderbook.toFixed(1)}</strong></span><span>Forecast 2026 <strong>{forecast.toFixed(1)}</strong></span><span>Lines <strong>{lines.filter((line) => line.product || line.customer).length}</strong></span></div></div>
    <div className="panel portal-panel"><div className="panel-heading"><div><span className="kicker">Step 02 · Orderbook lines</span><h2>Orders to be delivered</h2></div><button className="button secondary" type="button" onClick={() => setLines((items) => [...items, emptyLine()])}><Plus size={15}/>Add order line</button></div><div className="table-wrap portal-table"><table><thead><tr><th>Product / order</th><th>Customer</th><th>Type</th><th>DGC</th><th>2026 total</th><th>2027 total</th><th></th></tr></thead><tbody>{lines.map((line, index) => <tr key={index}><td><input value={line.product} placeholder="Product or order" onChange={(event) => updateLine(index, { product: event.target.value })}/></td><td><input value={line.customer} placeholder="Customer" onChange={(event) => updateLine(index, { customer: event.target.value })}/></td><td><select value={line.customerType} onChange={(event) => updateLine(index, { customerType: event.target.value as PortalLine['customerType'] })}><option>External</option><option>Group</option></select></td><td><select value={line.dgc} onChange={(event) => updateLine(index, { dgc: event.target.value as PortalLine['dgc'] })}><option>E</option><option>G</option></select></td><td><input inputMode="decimal" value={line.total2026} placeholder="0.0" onChange={(event) => updateLine(index, { total2026: event.target.value })}/></td><td><input inputMode="decimal" value={line.total2027} placeholder="0.0" onChange={(event) => updateLine(index, { total2027: event.target.value })}/></td><td><button className="icon-button" type="button" aria-label="Remove order line" onClick={() => setLines((items) => items.length === 1 ? items : items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div></div>
    <div className="panel portal-panel"><div className="panel-heading"><div><span className="kicker">Step 03 · Monthly phasing</span><h2>2026 orderbook allocation</h2></div><span className="unit">Optional detail</span></div><div className="table-wrap portal-phase"><table><thead><tr><th>Order line</th>{months.map((month) => <th key={month}>{month}</th>)}</tr></thead><tbody>{lines.map((line, lineIndex) => <tr key={lineIndex}><td><strong>{line.product || `Line ${lineIndex + 1}`}</strong><small>{line.customer || 'Customer pending'}</small></td>{months.map((month, monthIndex) => <td key={month}><input aria-label={`${month} allocation`} inputMode="decimal" value={line.monthly2026[monthIndex]} onChange={(event) => updateMonth(lineIndex, monthIndex, event.target.value)} placeholder="-"/></td>)}</tr>)}</tbody></table></div></div>
    <div className="portal-actions"><button className="button dark" type="button" disabled={!editable} onClick={() => void submit()}><Send size={16}/>Submit for review</button>{reviewBatch && <button className="button secondary" type="button" disabled={!publishable || reviewBatch.status === 'published'} onClick={() => void publish()}><CheckCircle2 size={16}/>{reviewBatch.status === 'published' ? 'Published' : 'Publish snapshot'}</button>}</div>{message && <div className="notice success"><CheckCircle2 size={16}/>{message}</div>}
  </section>;
}

function canViewSafe(user: User, entity: typeof entities[number]) {
  return user.role === 'superadmin' || user.role === 'editor' || user.permissions[entity.id]?.includes('view');
}
