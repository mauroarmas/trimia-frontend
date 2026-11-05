import { useEffect, useState } from 'react';
import { getFinancingDraft, completeFinancingDraft } from '../api';
const STAGES = { COLLECTING: 'Reuniendo datos', AWAITING_CONFIRMATION: 'Esperando confirmación del cliente', SUBMITTED: 'Presentada para revisión', CANCELLED: 'Cancelada', IDENTITY_CONFLICT: 'Identidad a revisar' };
const FIELDS = { name: 'nombre', dni: 'DNI', product: 'producto', confirmedAmount: 'importe confirmado', customerConfirmation: 'confirmación del cliente' };
export default function FinancingDraftEditor({ token, me, conversation }) {
  const [draft, setDraft] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = me?.isGeneralSupervisor || ['Administración', 'Admin'].includes(me?.sectorName ?? me?.sector?.name);
  useEffect(() => {
    let mounted = true; setDraft(null); setError('');
    if (allowed && ['WHATSAPP', 'WEB'].includes(conversation?.channel)) getFinancingDraft(token, conversation.id).then(d => { if (mounted) { setDraft(d); setAmount(d.confirmedAmount ?? ''); } }).catch(e => { if (mounted && e.status !== 404) setError(e.message); });
    return () => { mounted = false; };
  }, [token, conversation?.id, allowed]);
  if (!allowed || (!draft && !error)) return null;
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const next = await completeFinancingDraft(token, conversation.id, { expectedVersion: draft.version, confirmedAmount: Number(amount).toFixed(2), note });
      setDraft(next); setNote('');
    } catch (e) {
      setError(e.status === 409 ? 'Los datos cambiaron. Volvé a revisarlos antes de confirmar.' : e.message);
      if (e.status === 409) setDraft(await getFinancingDraft(token, conversation.id));
    } finally { setBusy(false); }
  }
  return <section className="card">
    <h4>Solicitud de financiación en preparación</h4>
    {error && <p role="alert" className="error">{error}</p>}
    {draft && <>
      <p>{draft.name ?? 'Nombre pendiente'} · {draft.productSummary ?? 'Producto pendiente'}</p>
      <p>Falta: {draft.missingFields.map(f => FIELDS[f] ?? f).join(', ') || (draft.stage === 'SUBMITTED' ? 'ningún dato; solicitud presentada' : draft.stage === 'CANCELLED' ? 'sin acciones pendientes' : 'confirmación del cliente')}. Estado: {STAGES[draft.stage]}.</p>
      {conversation.status !== 'ACTIVE' && <p>El asistente está pausado. Retomá la conversación con el control habitual para que el cliente pueda confirmar su resumen.</p>}
      {me.role === 'SUPERVISOR' && !['SUBMITTED', 'CANCELLED'].includes(draft.stage) && <form onSubmit={save}>
        <label>Importe confirmado (ARS)<input aria-label="Importe confirmado (ARS)" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <label>Confirmación del responsable<textarea aria-label="Confirmación del responsable" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} required /></label>
        <button disabled={busy || !note.trim() || !(Number(amount) > 0)}>Confirmar importe</button>
      </form>}
      <p>Confirmar el importe no presenta ni aprueba el pedido. El cliente debe confirmar el resumen actualizado en su siguiente intercambio.</p>
    </>}
  </section>;
}
