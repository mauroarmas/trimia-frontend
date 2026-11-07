import { useEffect, useState } from 'react';
import { getCommercialOrder, getCommercialOffers, reviewCommercialOrder, renewCommercialOrder, listCollectors } from '../api';
import CommercialOrderCard, { commercialMoney } from './CommercialOrderCard';
export default function CommercialReviewPanel({ token, me, detail, onChanged, onClose }) {
  const [order, setOrder] = useState(null);
  const [offers, setOffers] = useState([]);
  const [enabled, setEnabled] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [collectorId, setCollectorId] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const id = detail.request.id;
  useEffect(() => {
    let active = true;
    Promise.all([getCommercialOrder(token, id), getCommercialOffers(token, id), listCollectors(token)]).then(([row, choices, people]) => {
      if (!active) return; setOrder(row); setOffers(choices); setCollectors(people); setCollectorId(row.client.assignedCollectorId || '');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, id, detail.request.version, revision]);
  async function run(action) { setBusy(true); setError(''); try { await action(); setEnabled([]); setNote(''); setRevision(v => v + 1); await onChanged(); } catch(e) { setError(e.message); setRevision(v => v + 1); } finally { setBusy(false); } }
  const financed = enabled.some(key => offers.find(o => o.id === key)?.modality === 'FINANCED');
  const assessment = detail.assessments.at(-1);
  return <section className="card"><header className="commerce-heading"><h3>Revisión del pedido</h3><button className="secondary" onClick={onClose}>Cerrar ficha</button></header>
    {order && <>
      <p>{order.client.name} · DNI {order.client.dni} · {order.business} · {order.locality}</p><p><strong>{order.productSummary}</strong> · Una unidad · {commercialMoney(order.amount)}</p>
      <p>Vigencia: {new Date(order.flow.startedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Tucuman', hour12: false })} a {new Date(order.flow.expiresAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Tucuman', hour12: false })}.</p>
      {order.flow.reviewReason && <p className="commerce-notice">{order.flow.reviewReason}</p>}
      {order.flow.stage === 'REVIEW' && <>
        <p><strong>Evaluación preliminar simulada:</strong> {{ APPROVED: 'Favorable', APPROVED_WITH_CONDITIONS: 'Requiere revisar condiciones', REJECTED: 'Desfavorable', UNAVAILABLE: 'No disponible' }[assessment?.verdict] || 'En proceso'}. {assessment?.reason}</p>
        <p className="hint">Información interna. El agente comunicará únicamente el resultado comercial y las opciones habilitadas.</p>
        {order.expired || order.flow.reviewReason ? <div className="commerce-actions"><button disabled={busy} onClick={() => run(() => renewCommercialOrder(token, id, { expectedVersion: order.version }))}>Renovar datos y evaluación por 48 horas</button><p className="hint">La renovación conserva el pedido y obliga a revisar la evaluación y obtener una aceptación nueva del cliente.</p></div> : null}
        {!order.expired && <form className="commerce-form" onSubmit={event => { event.preventDefault(); run(() => reviewCommercialOrder(token, id, { expectedVersion: order.version, decision: 'APPROVED', offerIds: enabled, ...(financed ? { collectorId, firstDueDate } : {}), note })); }}>
          <h4>Ofertas del catálogo mock</h4><div className="commerce-offers">{offers.map(o => <label key={o.id} className="commerce-offer"><input type="checkbox" checked={enabled.includes(o.id)} onChange={e => setEnabled(e.target.checked ? [...enabled, o.id] : enabled.filter(key => key !== o.id))} /><span>{o.label} · Total {commercialMoney(o.total)}{o.modality === 'FINANCED' ? ' · Semanal, sin cargos adicionales en esta demo' : ''}</span></label>)}</div>
          {financed && <><label>Cobrador<select required value={collectorId} onChange={e => setCollectorId(e.target.value)}><option value="">Elegir cobrador…</option>{collectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Primer vencimiento<input type="date" required value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} /></label></>}
          <label>Nota interna de revisión<textarea required value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="Dejá constancia de tu decisión…" /></label>
          <div className="commerce-actions"><button disabled={busy || !enabled.length || !note.trim() || detail.request.evaluationState !== 'READY'}>Aprobar y habilitar ofertas</button><button type="button" className="secondary" disabled={busy || !note.trim() || detail.request.evaluationState !== 'READY'} onClick={() => run(() => reviewCommercialOrder(token, id, { expectedVersion: order.version, decision: 'REJECTED', offerIds: enabled.filter(key => key === 'cash'), note }))}>Rechazar financiación{enabled.includes('cash') ? ' y ofrecer contado' : ''}</button></div>
        </form>}
      </>}
      {order.flow.stage !== 'REVIEW' && <p>{order.closedAt ? 'La venta ya quedó cerrada.' : 'La decisión está registrada. El agente continuará con la elección y confirmación del cliente; Ventas verá la ficha para el cierre.'}</p>}
      <details><summary>Ver ficha comercial y conversación</summary><CommercialOrderCard key={`${id}-${revision}`} token={token} me={me} id={id} onChanged={onChanged} /></details>
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
