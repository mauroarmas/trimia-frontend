import { useCallback, useEffect, useState } from 'react';
import { listFinancingRequests, reviewFinancingRequest } from '../api';
import PageHero from './PageHero';

const LABELS = { PENDING_REVIEW: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', DRAFT: 'Borrador', CANCELLED: 'Cancelada' };
const money = (amount) => amount == null ? 'Sin monto informado' : Number(amount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

export default function AdminFinancingPanel({ token, me }) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('PENDING_REVIEW');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const load = useCallback(async () => {
    setError('');
    setBusy(true);
    try { setRequests(await listFinancingRequests(token)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const selected = requests.find((request) => request.id === selectedId);
  const visible = requests.filter((request) => filter === 'ALL' || request.status === filter);

  async function decide(decision) {
    if (!selected || !window.confirm(`${decision === 'APPROVED' ? 'Aprobar' : 'Rechazar'} la financiación de ${selected.client.name} por ${money(selected.amount)}? La decisión quedará registrada.`)) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const updated = await reviewFinancingRequest(token, selected.id, { decision, note });
      setRequests((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      setFeedback(`Solicitud ${LABELS[updated.status].toLowerCase()}. La decisión quedó guardada.`);
      setNote('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="knowledge-page financing-page">
      <PageHero
        kicker="Crédito y riesgo"
        title="Aprobación de Financiación"
        description="Revisión y autorización de solicitudes de compra financiada registradas en el sistema."
        action={
          <button className="knowledge-hero-action" onClick={load} disabled={busy}>
            <span>🔄</span> {busy ? 'Cargando...' : 'Refrescar'}
          </button>
        }
      />
    <div className="submenu-bar">
      <nav className="submenu-pills" aria-label="Filtrar solicitudes">
        {[['PENDING_REVIEW', 'Pendientes'], ['APPROVED', 'Aprobadas'], ['REJECTED', 'Rechazadas'], ['ALL', 'Todas']].map(([value, label]) => <button key={value} className={`submenu-pill${filter === value ? ' active' : ''}`} onClick={() => setFilter(value)}>{label} ({requests.filter((request) => value === 'ALL' || request.status === value).length})</button>)}
      </nav>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {feedback && <p className="success-msg" role="status">{feedback}</p>}
    <section className="knowledge-panel">
      {busy && <p>Cargando…</p>}
      {!busy && !error && visible.length === 0 && <p>No hay solicitudes en esta vista.</p>}
      <div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr><th>Cliente</th><th>Producto</th><th>Monto</th><th>Estado</th><th>Revisión</th><th></th></tr></thead><tbody>
        {visible.map((request) => <tr key={request.id}><td><strong>{request.client.name}</strong><div>DNI: {request.client.dni ?? 'Sin informar'}</div></td><td>{request.productSummary}</td><td>{money(request.amount)}</td><td>{LABELS[request.status] ?? request.status}</td><td>{request.reviewedBy?.name ?? 'Pendiente'}</td><td><button className="secondary" onClick={() => { setSelectedId(request.id); setNote(''); }}>Revisar</button></td></tr>)}
      </tbody></table></div>
    </section>
    {selected && <section className="card financing-detail">
      <div className="page-header"><h3>{selected.client.name}</h3><button className="secondary" onClick={() => setSelectedId(null)}>Cerrar</button></div>
      <dl className="financing-facts">
        <div><dt>DNI</dt><dd>{selected.client.dni ?? 'Sin informar'}</dd></div>
        <div><dt>Teléfono</dt><dd>{selected.client.phone}</dd></div>
        <div><dt>Producto</dt><dd>{selected.productSummary}</dd></div>
        <div><dt>Monto</dt><dd>{money(selected.amount)}</dd></div>
        <div><dt>Plan</dt><dd>{selected.financing ? `${selected.financing.quotaCount} cuotas, total ${money(selected.financing.totalAmount)}` : 'Sin plan registrado'}</dd></div>
      </dl>
      <h4>Evaluación crediticia</h4>
      {selected.creditAssessments.length ? selected.creditAssessments.map((assessment, index) => <p key={index}>{LABELS[assessment.verdict] ?? assessment.verdict}: {assessment.reason} · {assessment.source}</p>) : <p>Sin evaluación registrada.</p>}
      {selected.reviewedBy && <p>Revisada por {selected.reviewedBy.name} el {new Date(selected.reviewedAt).toLocaleString('es-AR')}. {selected.reviewNote}</p>}
      {selected.status === 'PENDING_REVIEW' && (me.role === 'SUPERVISOR' ? <>
        <div className="field"><label htmlFor="financing-note">Nota de revisión</label><textarea id="financing-note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></div>
        <div className="knowledge-form-actions"><button className="secondary knowledge-danger-button" disabled={busy} onClick={() => decide('REJECTED')}>Rechazar financiación</button><button disabled={busy || !(Number(selected.amount) > 0)} onClick={() => decide('APPROVED')}>Aprobar financiación</button></div>
      </> : <p>Un supervisor de Administración o el supervisor general debe aprobar o rechazar esta solicitud.</p>)}
    </section>}
  </div>
  );
}
