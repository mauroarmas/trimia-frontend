import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './collectionsPanel.css';
import {
  getCollectionsKpis,
  listPaymentProofs,
  acceptPaymentProof,
  rejectPaymentProof,
  markProofManualHandling,
  listAcceptedProofs,
  verifyPaymentImpact,
  listCollectionClients,
  listCollectors,
  releaseConversation,
  markQuotaManual,
  requestQuotaProof,
  escalateClient,
  assignCollector,
} from '../api';
import ActivityFeed from './ActivityFeed';
import ReminderConfig from './ReminderConfig';
import PageHero from './PageHero';
import { formatCalendarDate, formatProofDate } from '../date';

const QUOTA_STATUS_LABELS = {
  PENDING: 'Pendiente',
  AWAITING_CONFIRMATION: 'Esperando confirmación',
  OVERDUE: 'Vencida',
  PAID: 'Pagada',
  MANUAL: 'Manejo manual',
};

/**
 * Vistas de la cola de comprobantes. `PENDING_REVIEW` es la única accionable:
 * en el resto el comprobante ya está resuelto y accept/reject/manual-handling
 * devuelven 409 (el backend exige que esté pendiente), así que van sin botones.
 */
const PROOF_VIEWS = [
  { status: 'PENDING_REVIEW', label: 'Pendientes' },
  { status: 'MANUAL_HANDLING', label: 'En manejo manual' },
  { status: 'REJECTED', label: 'Rechazados' },
  { status: 'ACCEPTED', label: 'Aceptados' },
];

const REJECTION_LABELS = {
  PAST_DATE: 'Fecha anterior',
  WRONG_CBU: 'CBU incorrecto',
  AMOUNT_TOO_LOW: 'Monto insuficiente',
};

const money = (value) => value == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
const accountLabel = (status) => ({ SIN_DEUDA: 'Sin deuda', EN_MORA: 'Con atraso', AL_DIA: 'Al día' }[status] ?? 'Sin información');
const proofLabel = (status) => ({ PENDING_REVIEW: 'Pendiente de revisión', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado', MANUAL_HANDLING: 'Manejo manual', PENDING: 'Por verificar', CONFIRMED: 'Confirmado', MISSING: 'No impactó' }[status] ?? status);

function CollectionDialog({ children, title, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = [...ref.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div className="collection-dialog-shade" onClick={onClose}><section className="collection-dialog collections-panel" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => event.stopPropagation()}>{children}</section></div>, document.body);
}

export default function CollectionsPanel({ token, me, isCollector, initialClientId }) {
  const [kpis, setKpis] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [acceptedProofs, setAcceptedProofs] = useState([]);
  const [clients, setClients] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [selectedProof, setSelectedProof] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [tab, setTab] = useState(isCollector ? 'clients' : 'proofs');
  useEffect(() => { if (initialClientId) { setTab('clients'); setSelectedClient(initialClientId); } }, [initialClientId]);
  const [proofStatus, setProofStatus] = useState('PENDING_REVIEW');

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [quotaFilter, setQuotaFilter] = useState('pending');
  const closeClient = useCallback(() => setSelectedClient(null), []);
  const closeProof = useCallback(() => setSelectedProof(null), []);
  const isController = me.isController ?? false;

  async function loadAll(status = proofStatus) {
    setLoading(true);
    setError('');
    try {
      const [kpisRes, proofsRes, clientsRes, collectorsRes, ...impactRes] = await Promise.all([
        getCollectionsKpis(token),
        listPaymentProofs(token, { status }),
        listCollectionClients(token),
        listCollectors(token),
        isController ? listAcceptedProofs(token) : Promise.resolve([]),
      ]);
      setKpis(kpisRes);
      setProofs(proofsRes);
      setClients(clientsRes);
      setCollectors(collectorsRes);
      if (isController && impactRes[0]) setAcceptedProofs(impactRes[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(proofStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofStatus]);

  useEffect(() => {
    let live = true;
    const refreshPortfolio = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [nextClients, nextKpis] = await Promise.all([listCollectionClients(token), getCollectionsKpis(token)]);
        if (live) { setClients(nextClients); setKpis(nextKpis); }
      } catch { /* Se mantiene el contenido actual; Actualizar permite ver errores. */ }
    };
    const timer = setInterval(refreshPortfolio, 10000);
    window.addEventListener('focus', refreshPortfolio);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refreshPortfolio); };
  }, [token]);

  async function handleAcceptProof(proofId) {
    if (!window.confirm('¿Aceptar este comprobante? Quedará pendiente de verificación bancaria.')) return;
    try {
      await acceptPaymentProof(token, proofId);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRejectProof(proofId, reason) {
    if (!window.confirm(`¿Rechazar este comprobante por ${REJECTION_LABELS[reason] ?? reason}? Se notificará al cliente.`)) return;
    try {
      await rejectPaymentProof(token, proofId, reason);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleManualHandling(proofId, note) {
    if (!window.confirm('¿Pasar este comprobante a manejo manual y pausar el asistente?')) return;
    try {
      await markProofManualHandling(token, proofId, note);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVerifyImpact(proofId, status, observation) {
    if (!window.confirm(status === 'CONFIRMED' ? '¿Confirmar que el pago impactó? La cuota se marcará como pagada.' : '¿Registrar que el pago no impactó?')) return;
    try {
      await verifyPaymentImpact(token, proofId, { impactStatus: status, observation });
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReleaseConversation(conversationId) {
    try {
      await releaseConversation(token, conversationId);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMarkQuotaManual(quotaId) {
    const note = window.prompt('Nota (opcional):', '');
    if (note === null) return;
    if (!window.confirm('¿Marcar esta cuota para manejo manual? Se detendrán sus recordatorios.')) return;
    try {
      await markQuotaManual(token, quotaId, note || undefined);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRequestProof(quotaId) {
    setError('');
    setSuccessMsg('');
    try {
      await requestQuotaProof(token, quotaId);
      setSuccessMsg('Se le pidió el comprobante al cliente por WhatsApp.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEscalateClient(clientId) {
    const reason = window.prompt('Motivo del escalamiento (obligatorio):', '');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('El motivo es obligatorio para escalar un caso.');
      return;
    }
    if (!window.confirm('¿Escalar este caso al supervisor? El asistente quedará en espera.')) return;
    setError('');
    setSuccessMsg('');
    try {
      await escalateClient(token, clientId, reason);
      setSuccessMsg('Caso escalado — ya aparece en la cola de escalados del supervisor.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignCollector(clientId, collectorId) {
    if (!collectorId) return;
    setError('');
    setSuccessMsg('');
    try {
      await assignCollector(token, clientId, collectorId);
      setSuccessMsg('Cobrador asignado.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function openClientHistory(clientId) {
    setSelectedClient(clientId);
  }

  const statusBadgeColor = (status) => {
    const map = {
      PENDING_REVIEW: 'status-warning',
      ACCEPTED: 'status-active',
      REJECTED: 'status-idle',
      MANUAL_HANDLING: 'status-info',
      PENDING: 'status-warning',
      CONFIRMED: 'status-active',
      MISSING: 'status-error',
      AWAITING_CONFIRMATION: 'status-warning',
      OVERDUE: 'status-error',
      PAID: 'status-active',
      MANUAL: 'status-info',
    };
    return map[status] || 'status-idle';
  };

  const activeClient = clients.find((client) => client.id === selectedClient);
  const visibleClients = clients.filter((client) => {
    const text = `${client.name} ${client.phone} ${client.dni ?? ''}`.toLocaleLowerCase('es-AR');
    return text.includes(search.trim().toLocaleLowerCase('es-AR')) && (accountFilter === 'all' || client.accountSummary?.status === accountFilter);
  });
  return (
    <div className="collections-panel">
      <PageHero
        kicker="Recupero y cartera"
        title={isCollector ? 'Mi Panel de Cobranzas' : 'Panel de Cobranzas'}
        description="Gestión de cartera, validación de comprobantes y seguimiento de cuotas."
        action={
          <button className="knowledge-hero-action" onClick={() => loadAll()} disabled={loading}>
            <span>🔄</span> {loading ? 'Cargando...' : 'Refrescar'}
          </button>
        }
      />
      {error && <p className="error">{error}</p>}
      {successMsg && <p className="success-msg">{successMsg}</p>}

      <div className="collection-metrics" aria-label="Resumen de cobranzas">
        <button className="collection-metric" onClick={() => setTab('clients')}><strong>{kpis?.clientsWithPendingQuotas ?? 0}</strong><span>Cuotas pendientes</span><small>Ver cartera →</small></button>
        <button className="collection-metric collection-metric-warning" onClick={() => { setTab('proofs'); setProofStatus('PENDING_REVIEW'); }}><strong>{kpis?.proofsToReview ?? 0}</strong><span>Comprobantes para revisar</span><small>Revisar comprobantes →</small></button>
        <div className="collection-metric"><strong>{kpis?.confirmedThisWeek ?? 0}</strong><span>Pagos confirmados esta semana</span><small>Con verificación bancaria</small></div>
      </div>

      <div className="submenu-bar collections-tabs">
        <div className="submenu-pills">
          <button className={`submenu-pill${tab === 'proofs' ? ' active' : ''}`} onClick={() => setTab('proofs')}>
            {isCollector ? 'Mis Comprobantes' : 'Comprobantes'} ({proofs.length})
          </button>
          {isController && (
            <button className={`submenu-pill${tab === 'impact' ? ' active' : ''}`} onClick={() => setTab('impact')}>
              Verificar Impacto ({acceptedProofs.length})
            </button>
          )}
          <button className={`submenu-pill${tab === 'clients' ? ' active' : ''}`} onClick={() => setTab('clients')}>
            {isCollector ? 'Mis Clientes' : 'Clientes'} ({clients.length})
          </button>
          <button className={`submenu-pill${tab === 'reminders' ? ' active' : ''}`} onClick={() => setTab('reminders')}>
            Recordatorios Enviados
          </button>
          {(me.role === 'SUPERVISOR' || isController) && <button className={`submenu-pill${tab === 'reminder-config' ? ' active' : ''}`} onClick={() => setTab('reminder-config')}>Configuración de recordatorios</button>}
          <button className={`submenu-pill${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
            Registro de Actividad
          </button>
        </div>
      </div>

      {tab === 'proofs' && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{isCollector ? 'Mis Comprobantes' : 'Comprobantes'}</h3>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
            {PROOF_VIEWS.map((v) => (
              <button
                key={v.status}
                className={proofStatus === v.status ? '' : 'secondary'}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => { setProofStatus(v.status); setSelectedProof(null); }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {proofs.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {loading
                ? 'Cargando...'
                : `Sin comprobantes en ${PROOF_VIEWS.find((v) => v.status === proofStatus)?.label.toLowerCase()}.`}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th><th>Monto</th><th>Fecha</th><th>Banco</th>
                  {proofStatus === 'MANUAL_HANDLING' && <th>Nota</th>}
                  {proofStatus === 'REJECTED' && <th>Motivo</th>}
                  {proofStatus === 'ACCEPTED' && <th>Aceptado</th>}
                  {proofStatus === 'ACCEPTED' && <th>Impacto</th>}
                  <th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((p) => (
                  <tr key={p.id}>
                    <td>{p.quota?.client?.name ?? 'N/A'}</td>
                    <td>{money(p.extractedAmount)}</td>
                    <td>{formatProofDate(p.extractedDate)}</td>
                    <td>{p.extractedBank ?? '—'}</td>
                    {proofStatus === 'MANUAL_HANDLING' && (
                      <td>{p.manualHandlingNote ?? '—'}</td>
                    )}
                    {proofStatus === 'REJECTED' && (
                      <td>{REJECTION_LABELS[p.rejectionReason] ?? p.rejectionReason ?? '—'}</td>
                    )}
                    {proofStatus === 'ACCEPTED' && (
                      <td>{p.acceptedAt ? new Date(p.acceptedAt).toLocaleString() : '—'}</td>
                    )}
                    {proofStatus === 'ACCEPTED' && (
                      <td><span className={`badge ${statusBadgeColor(p.impactStatus)}`}>{proofLabel(p.impactStatus)}</span></td>
                    )}
                    <td><span className={`badge ${statusBadgeColor(p.status)}`}>{proofLabel(p.status)}</span></td>
                    <td><button className="secondary" onClick={() => setSelectedProof(p)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isController && tab === 'impact' && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Verificar Impacto Bancario</h3>
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Monto</th><th>Aceptado por</th><th>Impacto</th><th></th>
              </tr>
            </thead>
            <tbody>
              {acceptedProofs.length === 0 && <tr><td colSpan={5}>Sin comprobantes aceptados.</td></tr>}
              {acceptedProofs.map((p) => (
                <tr key={p.id}>
                  <td>{p.quota?.client?.name ?? 'N/A'}</td>
                  <td>{money(p.extractedAmount)}</td>
                  <td>{p.acceptedBy?.name ?? '—'}</td>
                  <td><span className={`badge ${statusBadgeColor(p.impactStatus)}`}>{proofLabel(p.impactStatus)}</span></td>
                  <td><button className="secondary" onClick={() => setSelectedProof(p)}>Verificar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reminders' && (
        <ActivityFeed
          token={token}
          clients={clients}
          collectors={collectors}
          isController={isController}
          fixedEventType="quota_reminder_sent"
        />
      )}

      {tab === 'activity' && (
        <ActivityFeed token={token} clients={clients} collectors={collectors} isController={isController} />
      )}

      {tab === 'clients' && (
        <section className="card collection-portfolio">
          <div className="collection-section-heading"><div><h3>{isCollector ? 'Mi cartera' : 'Cartera de clientes'}</h3><p>Elegí un cliente para revisar sus cuotas y gestionar la cobranza.</p></div><span>{visibleClients.length} de {clients.length} clientes</span></div>
          <div className="collection-toolbar"><label className="collection-search">Buscar cliente<input type="search" placeholder="Nombre, teléfono o DNI" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Estado de cuenta<select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">Todos los clientes</option><option value="EN_MORA">Con atraso</option><option value="AL_DIA">Al día</option><option value="SIN_DEUDA">Sin deuda</option></select></label></div>
          <div className="collection-table-scroll"><table><thead><tr><th>Cliente</th><th>Estado</th><th>Cuotas sin pagar</th><th>Total adeudado</th>{!isCollector && <th>Cobrador</th>}<th><span className="collection-sr-only">Acciones</span></th></tr></thead><tbody>
            {visibleClients.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small className="collection-subline">{client.phone}</small></td><td><span className={`badge ${client.accountSummary?.status === 'EN_MORA' ? 'status-error' : 'status-active'}`}>{accountLabel(client.accountSummary?.status)}</span>{client.accountSummary?.overdueQuotaCount > 0 && <small className="collection-subline">{client.accountSummary.overdueQuotaCount} vencidas</small>}</td><td>{client.quotas?.filter((quota) => quota.status !== 'PAID').length ?? 0}</td><td className="collection-money">{money(client.accountSummary?.totalDebt)}</td>{!isCollector && <td>{client.assignedCollector?.name ?? (isController ? <select aria-label={`Asignar cobrador a ${client.name}`} value="" onChange={(event) => handleAssignCollector(client.id, event.target.value)}><option value="">Asignar cobrador…</option>{collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.name}</option>)}</select> : 'Sin asignar')}</td>}<td><button className="secondary" onClick={() => { setQuotaFilter('pending'); openClientHistory(client.id); }}>Ver cuenta →</button></td></tr>)}
            {!visibleClients.length && <tr><td colSpan={isCollector ? 5 : 6} className="collection-empty">{loading ? 'Cargando cartera…' : clients.length ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no tenés clientes asignados.'}</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {tab === 'reminder-config' && <ReminderConfig token={token} />}

      {selectedProof && (
        <CollectionDialog title="Revisar comprobante" onClose={closeProof}><div className="collection-dialog-body">
          {error && <p className="error" role="alert">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Comprobante: {selectedProof.quota?.client?.name}</h4>
            <button className="secondary" onClick={() => setSelectedProof(null)}>Cerrar</button>
          </div>
          <p><b>Monto:</b> {money(selectedProof.extractedAmount)} | <b>Fecha:</b> {formatProofDate(selectedProof.extractedDate)} | <b>Banco:</b> {selectedProof.extractedBank}</p>
          <p>
            <b>Estado:</b> <span className={`badge ${statusBadgeColor(selectedProof.status)}`}>{proofLabel(selectedProof.status)}</span>
            {selectedProof.rejectionReason && (
              <> · <b>Motivo:</b> {REJECTION_LABELS[selectedProof.rejectionReason] ?? selectedProof.rejectionReason}</>
            )}
            {selectedProof.acceptedAt && (
              <> · <b>Aceptado:</b> {new Date(selectedProof.acceptedAt).toLocaleString()}</>
            )}
          </p>
          {selectedProof.impactObservation && (
            <p><b>Observación de impacto:</b> {selectedProof.impactObservation}</p>
          )}
          {selectedProof.manualHandlingNote && (
            <p><b>Nota de manejo manual:</b> {selectedProof.manualHandlingNote}</p>
          )}

          {/* Las tres acciones pasan por assertPendingReview() en el backend:
              sobre un comprobante ya resuelto devuelven 409, así que la vista
              de un resuelto es de solo lectura. */}
          {selectedProof.status !== 'PENDING_REVIEW' &&
            !(isController && selectedProof.status === 'ACCEPTED') && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Este comprobante ya está resuelto — solo lectura.
              </p>
            )}

          {/* Marcar manejo manual toma la conversación (conversations.takeover)
              y la deja pausada para la IA. POST /supervisor/conversations/:id/release
              es lo único que la devuelve — desde 1fa568c también lo puede llamar
              el EMPLEADO que la tomó, no solo un SUPERVISOR. */}
          {selectedProof.status === 'MANUAL_HANDLING' && selectedProof.message?.conversationId && (
            <div className="panel-section">
              <h4>Conversación</h4>
              <button onClick={() => handleReleaseConversation(selectedProof.message.conversationId)}>
                🤖 Devolver a la IA
              </button>
            </div>
          )}

          {selectedProof.status === 'PENDING_REVIEW' && (
            <div className="panel-section">
              <h4>Revisar comprobante</h4>
              {(!Number.isFinite(Number(selectedProof.extractedAmount)) || Number(selectedProof.extractedAmount) <= 0) && <p className="error">El monto debe ser válido y mayor a cero para aceptar el comprobante. Podés rechazarlo o revisarlo mediante manejo manual.</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleAcceptProof(selectedProof.id)} disabled={!Number.isFinite(Number(selectedProof.extractedAmount)) || Number(selectedProof.extractedAmount) <= 0}>✓ Aceptar</button>
                <select onChange={(e) => { const reason = e.target.value; e.target.value = ''; if (reason) handleRejectProof(selectedProof.id, reason); }} defaultValue="">
                  <option value="">Rechazar por...</option>
                  <option value="PAST_DATE">Fecha anterior</option>
                  <option value="WRONG_CBU">CBU incorrecto</option>
                  <option value="AMOUNT_TOO_LOW">Monto insuficiente</option>
                </select>
                <button
                  className="secondary"
                  onClick={() => {
                    const note = window.prompt('Nota (opcional):', '');
                    if (note !== null) handleManualHandling(selectedProof.id, note);
                  }}
                >
                  ⚙ Manejo manual
                </button>
              </div>
            </div>
          )}

          {isController && selectedProof.status === 'ACCEPTED' && (
            <div className="panel-section">
              <h4>Verificar impacto bancario</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={!Number.isFinite(Number(selectedProof.extractedAmount)) || Number(selectedProof.extractedAmount) <= 0} title={Number(selectedProof.extractedAmount) > 0 ? undefined : 'El monto debe ser mayor a cero'} onClick={() => handleVerifyImpact(selectedProof.id, 'CONFIRMED', '')}>✓ Confirmado</button>
                <button className="secondary" onClick={() => {
                  const obs = window.prompt('Observación:', '');
                  if (obs !== null) handleVerifyImpact(selectedProof.id, 'MISSING', obs);
                }}>✗ No impactó</button>
              </div>
              {selectedProof.impactStatus && <p><b>Impacto:</b> {proofLabel(selectedProof.impactStatus)}</p>}
            </div>
          )}
        </div></CollectionDialog>
      )}

      {activeClient && (
        <CollectionDialog title={`Cuenta de ${activeClient.name}`} onClose={closeClient}>
          <header className="collection-dialog-header"><div><small>CUENTA DEL CLIENTE</small><h2>{activeClient.name}</h2><p>{activeClient.phone}{activeClient.dni ? ` · DNI ${activeClient.dni}` : ''}</p></div><button className="secondary" onClick={closeClient}>Cerrar ✕</button></header>
          <div className="collection-dialog-body">
            {(error || successMsg) && <p role="status" className={error ? 'error' : 'success-msg'}>{error || successMsg}</p>}
            <div className="collection-account-totals"><div><span>Total adeudado</span><strong>{money(activeClient.accountSummary?.totalDebt)}</strong></div><div><span>Cuotas vencidas</span><strong>{activeClient.accountSummary?.overdueQuotaCount ?? '—'}</strong></div><div><span>Estado de cuenta</span><strong>{accountLabel(activeClient.accountSummary?.status)}</strong></div></div>
            <div className="collection-section-heading"><div><h3>Plan de cuotas</h3><p>Los pagos se confirman después de verificar su impacto bancario.</p></div><label className="collection-sr-only" htmlFor="collection-quota-filter">Mostrar cuotas</label><select id="collection-quota-filter" value={quotaFilter} onChange={(event) => setQuotaFilter(event.target.value)}><option value="pending">Sin pagar</option><option value="paid">Pagadas</option><option value="all">Todas</option></select></div>
            <div className="collection-table-scroll"><table><thead><tr><th>Vencimiento</th><th>Importe</th><th>Estado</th><th>Gestión</th></tr></thead><tbody>
              {(activeClient.quotas ?? []).filter((quota) => quotaFilter === 'all' || (quotaFilter === 'paid' ? quota.status === 'PAID' : quota.status !== 'PAID')).map((quota) => <tr key={quota.id}><td>{formatCalendarDate(quota.dueDate)}</td><td className="collection-money">{money(quota.amount)}</td><td><span className={`badge ${statusBadgeColor(quota.status)}`}>{QUOTA_STATUS_LABELS[quota.status] ?? quota.status}</span>{quota.manualHandlingNote && <small className="collection-subline">{quota.manualHandlingNote}</small>}</td><td>{!['PAID', 'MANUAL'].includes(quota.status) ? <div className="collection-quota-actions"><button className="secondary" onClick={() => handleRequestProof(quota.id)}>Pedir comprobante</button><button className="collection-text-action" onClick={() => handleMarkQuotaManual(quota.id)}>Manejo manual</button></div> : '—'}</td></tr>)}
              {!(activeClient.quotas ?? []).some((quota) => quotaFilter === 'all' || (quotaFilter === 'paid' ? quota.status === 'PAID' : quota.status !== 'PAID')) && <tr><td colSpan={4} className="collection-empty">No hay cuotas en esta vista.</td></tr>}
            </tbody></table></div>
          </div>
          <footer className="collection-dialog-footer"><span>¿Necesitás ayuda para gestionar este cliente?</span><button className="secondary" onClick={() => handleEscalateClient(activeClient.id)}>Consultar a un supervisor</button></footer>
        </CollectionDialog>
      )}
    </div>
  );
}
