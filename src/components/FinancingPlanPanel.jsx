import { useEffect, useState } from 'react';
import { createFinancingPlan, listCollectors } from '../api';
const money = value => Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const date = value => new Date(value).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' });
export default function FinancingPlanPanel({ token, request, plan, canCreate, onCreated, onOpenCollections }) {
  const [collectors, setCollectors] = useState([]);
  const [count, setCount] = useState('');
  const [firstDate, setFirstDate] = useState('');
  const [collectorId, setCollectorId] = useState(request.client.assignedCollectorId ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const planId = plan?.id;
  useEffect(() => {
    let active = true;
    if (!planId && canCreate) listCollectors(token).then(rows => { if (active) setCollectors(rows); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, planId, canCreate]);
  if (request.status !== 'APPROVED') return null;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await createFinancingPlan(token, request.id, { expectedVersion: request.version, quotaCount: Number(count), firstDueDate: firstDate, collectorId, note: note.trim() });
      await onCreated();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="card" aria-label="Plan de cuotas">
    <h3>{plan ? 'Plan de cuotas registrado' : 'Plan de cuotas'}</h3>
    {request.closedAt && <p>Venta cerrada el {date(request.closedAt)}.</p>}
    {!request.closedAt && <p>Para registrar las cuotas, Ventas debe completar primero el cierre de la venta.</p>}
    {plan ? <>
      <p><strong>{plan.quotaCount} cuotas semanales</strong> · Total {money(plan.totalAmount)} · Responsable: {plan.collector?.name ?? 'Cobrador asignado'}.</p>
      <details><summary>Ver cuotas y vencimientos</summary><div style={{ overflowX: 'auto' }}><table>
        <thead><tr><th>Cuota</th><th>Vencimiento</th><th>Importe</th><th>Estado</th></tr></thead>
        <tbody>{plan.quotas.map(q => <tr key={q.id}><td>{q.number}</td><td>{date(q.dueDate)}</td><td>{money(q.amount)}</td><td>{{ PENDING: 'Pendiente', PAID: 'Pagada', OVERDUE: 'Vencida', AWAITING_CONFIRMATION: 'Por confirmar', MANUAL: 'Manejo manual' }[q.status] ?? q.status}</td></tr>)}</tbody>
      </table></div></details>
      {onOpenCollections && <button type="button" className="secondary" onClick={() => onOpenCollections(request.client.id)}>Ver cliente en Cobranzas</button>}
    </> : request.closedAt && canCreate ? <form onSubmit={submit} className="fin-draft-form">
      <p>Total aprobado: <strong>{money(request.amount)}</strong>. Ingresá el plan semanal acordado con el cliente. No se agregan intereses ni cargos.</p>
      <div className="fin-draft-fields">
        <div className="fin-draft-field"><label htmlFor="plan-quota-count">Cantidad de cuotas semanales</label><input id="plan-quota-count" type="number" min="1" max="260" step="1" required value={count} onChange={e => setCount(e.target.value)} /></div>
        <div className="fin-draft-field"><label htmlFor="plan-first-date">Primer vencimiento</label><input id="plan-first-date" type="date" required value={firstDate} onChange={e => setFirstDate(e.target.value)} /></div>
        <div className="fin-draft-field"><label htmlFor="plan-collector">Cobrador responsable</label><select id="plan-collector" required value={collectorId} onChange={e => setCollectorId(e.target.value)}><option value="">Elegir cobrador…</option>{collectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      {Number(count) > 0 && <p>Se distribuirá el total en {count} cuotas. Si hay diferencia de centavos, se ajustará en la última cuota.</p>}
      <label htmlFor="plan-agreement">Condiciones acordadas</label><textarea id="plan-agreement" required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Dejá constancia del acuerdo con el cliente…" />
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy || !note.trim() || !collectorId || !firstDate || !(Number(count) > 0)}>{busy ? 'Registrando…' : 'Registrar plan de cuotas'}</button>
    </form> : !plan && request.closedAt && <p>Un supervisor de Administración o supervisión general puede registrar el plan.</p>}
  </section>;
}
