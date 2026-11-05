import { useCallback, useEffect, useRef, useState } from 'react';
import { listFinancingRequests, reviewFinancingRequest, getFinancingRequest, correctFinancingRequest, cancelFinancingRequest, retryFinancingNotice } from '../api';
import PageHero from './PageHero';
const LABELS = { PENDING_REVIEW: 'Pendiente', APPROVED: 'Aprobada', APPROVED_WITH_CONDITIONS: 'Con condiciones', UNAVAILABLE: 'No disponible', REJECTED: 'Rechazada', DRAFT: 'Borrador', CANCELLED: 'Cancelada', PENDING: 'Pendiente', SENDING: 'En proceso', ACCEPTED: 'Aceptado', FAILED: 'Fallido', UNCERTAIN: 'Resultado incierto: requiere atención' };
const EVENT_LABELS = { DRAFT_UPDATED: 'Datos recopilados', DRAFT_CORRECTED: 'Datos confirmados por responsable', IDENTITY_CONFLICT: 'Identidad a revisar', SUBMITTED: 'Solicitud presentada para revisión', EVALUATED: 'Evaluación simulada registrada', CORRECTED: 'Solicitud corregida', DECIDED: 'Decisión humana registrada', CANCELLED: 'Solicitud cancelada', NOTICE_CLAIMED: 'Intento de aviso iniciado', NOTICE_ACCEPTED: 'Aviso aceptado en simulación', NOTICE_FAILED: 'Aviso fallido', NOTICE_UNCERTAIN: 'Aviso incierto', NOTICE_RETRY: 'Reintento solicitado' };
const money = value => value == null ? 'Sin importe' : Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const noticeLabel = n => n.status === 'ACCEPTED' && n.transportMode === 'simulated' ? 'Aceptado en simulación' : LABELS[n.status];
export default function AdminFinancingPanel({ token, me }) {
  const [rows, setRows] = useState([]);
  const detailRequest = useRef(0);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('PENDING_REVIEW');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const load = useCallback(async () => { try { setRows(await listFinancingRequests(token)); } catch(e) { setError(e.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  async function open(id) {
    const request = ++detailRequest.current;
    setEditing(null); setNote('');
    try {
      const result = await getFinancingRequest(token, id);
      if (request === detailRequest.current) setDetail(result);
    } catch(e) { if (request === detailRequest.current) setError(e.message); }
  }
  async function refresh() {
    const request = detailRequest.current;
    const id = detail?.request.id;
    await load();
    if (id && request === detailRequest.current) await open(id);
  }
  async function mutate(action, success) {
    setBusy(true); setError(''); setFeedback('');
    try { await action(); await refresh(); setFeedback(success); }
    catch(e) { if (e.status === 409) { await refresh(); setError('El caso cambió. Revisá los datos actualizados antes de decidir nuevamente.'); } else setError(e.message); }
    finally { setBusy(false); }
  }
  const selected = detail?.request;
  const snapshot = selected?.reviewedSnapshot ?? selected?.inputSnapshot;
  const assessment = detail?.assessments?.find(a => a.requestVersion === selected?.version) ?? selected?.creditAssessments?.[0];
  const pending = selected?.status === 'PENDING_REVIEW';
  const canMutate = me.role === 'SUPERVISOR';
  const canDecide = pending && !selected.legacyNeedsConfirmation && selected.evaluationState === 'READY' && Number(selected.amount) > 0;
  function decide(decision) {
    const requiresNote = !assessment || ['APPROVED_WITH_CONDITIONS', 'UNAVAILABLE'].includes(assessment.verdict) || assessment.verdict !== decision;
    if (requiresNote && !note.trim()) { setError('Explicá la decisión o las condiciones confirmadas antes de continuar.'); return; }
    mutate(() => reviewFinancingRequest(token, selected.id, { expectedVersion: selected.version, decision, note }), 'Decisión registrada. El aviso tiene su propio estado.');
  }
  function edit() {
    const data = selected.inputSnapshot ?? selected.client;
    setEditing({ name: data.name ?? '', dni: data.dni ?? '', productSummary: selected.productSummary, amount: selected.amount ?? '', ...(data.sku ? { sku: data.sku } : {}) });
  }
  return <div className="knowledge-module financing-module">
    <PageHero eyebrow="Administración" title="Aprobación de financiación" description="Revisión humana de solicitudes y estado de sus avisos." action={<button onClick={refresh} disabled={busy}>Refrescar</button>} />
    {error && <p className="error" role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    <nav className="submenu-pills" aria-label="Filtrar solicitudes">{['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].map(s => <button key={s} className={`submenu-pill${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>{LABELS[s] ?? 'Todas'}</button>)}</nav>
    <section className="card"><div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr><th>Cliente</th><th>Producto</th><th>Importe</th><th>Estado</th><th>Aviso</th><th></th></tr></thead><tbody>
      {rows.filter(r => filter === 'ALL' || r.status === filter).map(r => <tr key={r.id}><td><strong>{r.inputSnapshot?.name ?? r.client.name}</strong><div>DNI: {r.inputSnapshot?.dni ?? r.client.dni ?? 'Sin confirmar'} · {r.client.phone}</div></td><td>{r.productSummary}</td><td>{money(r.amount)}</td><td>{LABELS[r.status]}</td><td>{r.notice ? noticeLabel(r.notice) : 'Sin aviso'}</td><td><button className="secondary" onClick={() => open(r.id)}>Revisar</button></td></tr>)}
    </tbody></table>{rows.length === 0 && <p>No hay solicitudes registradas.</p>}</div></section>
    {selected && <section className="card financing-detail">
      <div className="page-header"><h3>{snapshot?.name ?? selected.client.name}</h3><button className="secondary" onClick={() => { detailRequest.current++; setDetail(null); setEditing(null); }}>Cerrar</button></div>
      <p>DNI revisado: {snapshot?.dni ?? selected.client.dni ?? 'Sin confirmar'} · Teléfono: {selected.client.phone}</p>
      <p>{selected.productSummary} · {money(selected.amount)} · {LABELS[selected.status]}</p>
      {snapshot && (snapshot.name !== selected.client.name || snapshot.dni !== selected.client.dni) && <p>La ficha actual del cliente puede diferir de los datos históricos de este pedido.</p>}
      <p>Evaluación: {selected.evaluationState === 'PENDING' ? 'En curso; todavía no se puede decidir.' : selected.legacyNeedsConfirmation ? 'Requiere confirmar los datos históricos.' : 'Lista para revisión'}</p>
      <h4>Historial de evaluaciones</h4>
      {detail.assessments.map((a, i) => <p key={i}>{LABELS[a.verdict]} · {a.source === 'MOCK' ? 'Simulada' : a.source} · {new Date(a.createdAt).toLocaleString('es-AR')}: {a.reason} {a.commercialCondition ?? ''}</p>)}
      {selected.reviewedBy && <p>Decidió {selected.reviewedBy.name}, {new Date(selected.reviewedAt).toLocaleString('es-AR')}. {selected.reviewNote}</p>}
      {pending && canMutate && <>
        <label>Nota de revisión<textarea aria-label="Nota de revisión" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label>
        <div className="knowledge-form-actions"><button disabled={busy || !canDecide} onClick={() => decide('APPROVED')}>Aprobar financiación</button><button className="secondary" disabled={busy || !canDecide} onClick={() => decide('REJECTED')}>Rechazar financiación</button><button className="secondary" disabled={busy} onClick={edit}>Corregir datos</button><button className="secondary" disabled={busy} onClick={() => mutate(() => cancelFinancingRequest(token, selected.id, { expectedVersion: selected.version, note }), 'Solicitud cancelada.')}>Cancelar solicitud</button></div>
      </>}
      {editing && <form onSubmit={e => { e.preventDefault(); if (!note.trim()) { setError('Agregá una nota para confirmar la corrección.'); return; } mutate(() => correctFinancingRequest(token, selected.id, { ...editing, amount: Number(editing.amount).toFixed(2), expectedVersion: selected.version, confirmData: true, note }), 'Corrección guardada; se requiere nueva evaluación y revisión.'); }}>
        {Object.entries({ name: 'Nombre', dni: 'DNI', productSummary: 'Producto', amount: 'Importe ARS' }).map(([key, label]) => <label key={key}>{label}<input aria-label={label} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} maxLength={key === 'name' ? 120 : key === 'productSummary' ? 500 : key === 'dni' ? 8 : 30} required /></label>)}
        <p>Confirmá la identidad y el importe con una nota. Esto no modifica otras operaciones del cliente.</p><button disabled={busy}>Confirmar corrección</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Descartar</button>
      </form>}
      {selected.notice && <section><h4>Aviso al cliente</h4><p>{noticeLabel(selected.notice)}. {selected.notice.lastErrorCode === 'TRANSPORT_DISABLED' ? 'El transporte está deshabilitado.' : selected.notice.lastErrorCode === 'HUMAN_PAUSED' ? 'El hilo está tomado por una persona.' : ''}</p>
        {selected.notice.status === 'FAILED' && canMutate && <button disabled={busy} onClick={() => mutate(() => retryFinancingNotice(token, selected.notice.id, selected.notice.version), 'Reintento solicitado.')}>Reintentar aviso fallido</button>}
        {selected.notice.status === 'UNCERTAIN' && <p>Revisá lo ocurrido antes de volver a contactar al cliente. No se reenviará automáticamente.</p>}
        {selected.notice.transportMode === 'simulated' && <p>Prueba simulada: no acredita entrega por WhatsApp.</p>}
      </section>}
      <h4>Conversación</h4>{detail.messages.map(m => <p key={m.id}><strong>{m.role === 'USER' ? 'Cliente' : 'Asistente'}:</strong> {m.content}{m.noticeId && selected.notice && m.noticeId === selected.notice.id && <small> · {noticeLabel(selected.notice)}</small>}</p>)}
      <h4>Trazabilidad</h4>{detail.events.map(e => <p key={e.id}>{new Date(e.createdAt).toLocaleString('es-AR')} · {EVENT_LABELS[e.eventType.replace('FINANCING_', '')] ?? 'Evento del caso'}{e.actorId && ` · Responsable: ${e.actorId}`}</p>)}
    </section>}
  </div>;
}
