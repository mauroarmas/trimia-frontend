import { useState } from 'react';
import { closeSale, resolveEscalation } from '../api';

const money = value => Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export default function CommercialCasePanel({ token, me, draft, escalation, onResolved, onOpenFinancing }) {
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = draft?.request;
  if (!request) return null;
  const approved = request.status === 'APPROVED';
  const canClose = me?.isGeneralSupervisor || me?.sectorName === 'Ventas';
  const canReview = me?.isGeneralSupervisor || ['Administración', 'Admin'].includes(me?.sectorName);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    let closed = false;
    try {
      if (!request.closedAt) {
        await closeSale(token, { purchaseRequestId: request.id, finalAmount: Number(request.amount), modality: 'FINANCED', notes: reference.trim() });
      }
      closed = true;
      await resolveEscalation(token, escalation.id, { message: message.trim(), teachAgent: false });
      await onResolved();
    } catch (e) {
      setError(closed ? `La venta quedó cerrada, pero falta resolver el caso: ${e.message}. Podés reintentar.` : e.message);
    } finally { setBusy(false); }
  }
  return <section aria-label="Estado de la compra">
    <h3>{request.closedAt ? 'Venta cerrada' : approved ? 'Financiación aprobada · Falta cerrar la venta' : request.status === 'PENDING_REVIEW' ? 'Financiación en revisión' : 'Financiación sin aprobación vigente'}</h3>
    <p><strong>{request.productSummary}</strong> · {money(request.amount)}</p>
    {request.closedAt && <p>Cierre registrado el {new Date(request.closedAt).toLocaleString('es-AR')}.</p>}
    {!approved && !request.closedAt && <>
      <p>{request.status === 'PENDING_REVIEW' ? 'La solicitud ya fue presentada. El próximo paso es la revisión del supervisor.' : 'Para cerrar una venta financiada se necesita una solicitud aprobada.'}</p>
      {canReview && onOpenFinancing && <button className="secondary" onClick={() => onOpenFinancing(request.id)}>Ver solicitud de financiación</button>}
    </>}
    {approved && escalation.status === 'PENDING' && canClose && <form onSubmit={submit} className="esc-resolve-form">
      {!request.closedAt && <div className="esc-field">
        <label htmlFor="sale-close-reference">Referencia del cierre</label>
        <input id="sale-close-reference" required value={reference} onChange={e => setReference(e.target.value)} placeholder="Comprobante o registro de la venta acordada" />
        <p>Registrá el cierre acordado con el cliente. Esta acción no cobra ni genera cuotas.</p>
      </div>}
      <label htmlFor="sale-close-reply">Respuesta al cliente</label>
      <textarea id="sale-close-reply" required rows={3} className="conv-ctrl-textarea" value={message} onChange={e => setMessage(e.target.value)} placeholder="Confirmale cómo continuará su compra…" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="esc-submit-primary" disabled={busy || !message.trim() || (!request.closedAt && !reference.trim())}>
        {busy ? 'Guardando…' : request.closedAt ? 'Responder y resolver caso' : 'Registrar cierre, responder y resolver'}
      </button>
    </form>}
    {approved && !canClose && <p>El cierre lo registra Ventas o supervisión general.</p>}
  </section>;
}
