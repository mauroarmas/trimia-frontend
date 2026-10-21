import { useEffect, useState } from 'react';
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

export default function CollectionsPanel({ token, me, isCollector }) {
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
  const [tab, setTab] = useState('proofs');
  const [proofStatus, setProofStatus] = useState('PENDING_REVIEW');

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

  async function handleAcceptProof(proofId) {
    try {
      await acceptPaymentProof(token, proofId);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRejectProof(proofId, reason) {
    try {
      await rejectPaymentProof(token, proofId, reason);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleManualHandling(proofId, note) {
    try {
      await markProofManualHandling(token, proofId, note);
      setSelectedProof(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVerifyImpact(proofId, status, observation) {
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Panel de Cobranzas</h2>
          <p className="page-subtitle">Gestión de cartera, validación de comprobantes y seguimiento de cuotas.</p>
        </div>
        <button className="btn-pill-action" onClick={loadAll} disabled={loading}>
          <span>🔄</span> {loading ? 'Cargando...' : 'Refrescar'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {successMsg && <p className="success-msg">{successMsg}</p>}

      {/* GET /collections/kpis ya viene acotado al cobrador logueado salvo que
          sea Controlador, así que los KPIs son los suyos, no los globales. */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>{isController ? 'KPIs de Cobranzas (todos)' : 'Mis KPIs'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7f3', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--success)' }}>{kpis?.clientsWithPendingQuotas ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cuotas pendientes</div>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #8afdf6', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#09b4aa' }}>{kpis?.proofsToReview ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comprobantes para revisar</div>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1d4ed8' }}>{kpis?.confirmedThisWeek ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pagos confirmados esta semana</div>
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 12 }}>
        <button className={`tab${tab === 'proofs' ? ' active' : ''}`} onClick={() => setTab('proofs')}>
          {isCollector ? 'Mis Comprobantes' : 'Comprobantes'} ({proofs.length})
        </button>
        {isController && (
          <button className={`tab${tab === 'impact' ? ' active' : ''}`} onClick={() => setTab('impact')}>
            Verificar Impacto ({acceptedProofs.length})
          </button>
        )}
        <button className={`tab${tab === 'clients' ? ' active' : ''}`} onClick={() => setTab('clients')}>
          {isCollector ? 'Mis Clientes' : 'Clientes'} ({clients.length})
        </button>
        <button className={`tab${tab === 'reminders' ? ' active' : ''}`} onClick={() => setTab('reminders')}>
          Recordatorios Enviados
        </button>
        <button className={`tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
          Registro de Actividad
        </button>
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
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((p) => (
                  <tr key={p.id}>
                    <td>{p.quota?.client?.name ?? 'N/A'}</td>
                    <td>${p.extractedAmount ?? '?'}</td>
                    <td>{p.extractedDate ? new Date(p.extractedDate).toLocaleDateString() : '—'}</td>
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
                      <td><span className={`badge ${statusBadgeColor(p.impactStatus)}`}>{p.impactStatus}</span></td>
                    )}
                    <td><span className={`badge ${statusBadgeColor(p.status)}`}>{p.status}</span></td>
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
                  <td>${p.extractedAmount ?? '?'}</td>
                  <td>{p.acceptedBy?.name ?? '—'}</td>
                  <td><span className={`badge ${statusBadgeColor(p.impactStatus)}`}>{p.impactStatus}</span></td>
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
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{isCollector ? 'Mis Clientes' : 'Clientes'}</h3>
          {clients.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Sin clientes asignados.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Teléfono</th><th>Cuotas Pendientes</th><th>Cobrador</th><th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone}</td>
                    <td>{c.quotas?.filter((q) => q.status === 'PENDING').length ?? 0}</td>
                    <td>
                      {c.assignedCollector ? (
                        c.assignedCollector.name
                      ) : isController ? (
                        // Solo el Controlador puede asignar: el endpoint
                        // responde 403 a cualquier otro.
                        <select
                          defaultValue=""
                          style={{ width: 'auto' }}
                          onChange={(e) => handleAssignCollector(c.id, e.target.value)}
                        >
                          <option value="">Asignar cobrador...</option>
                          {collectors.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.name}{col.isController ? ' (Controlador)' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge status-warning">Sin asignar</span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary" onClick={() => openClientHistory(c.id)}>Historial</button>
                      <button className="secondary" onClick={() => handleEscalateClient(c.id)}>Escalar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedProof && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Comprobante: {selectedProof.quota?.client?.name}</h4>
            <button className="secondary" onClick={() => setSelectedProof(null)}>Cerrar</button>
          </div>
          <p><b>Monto:</b> ${selectedProof.extractedAmount ?? '?'} | <b>Fecha:</b> {selectedProof.extractedDate} | <b>Banco:</b> {selectedProof.extractedBank}</p>
          <p>
            <b>Status:</b> <span className={`badge ${statusBadgeColor(selectedProof.status)}`}>{selectedProof.status}</span>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleAcceptProof(selectedProof.id)}>✓ Aceptar</button>
                <select onChange={(e) => e.target.value && handleRejectProof(selectedProof.id, e.target.value)} defaultValue="">
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
                <button onClick={() => handleVerifyImpact(selectedProof.id, 'CONFIRMED', '')}>✓ Confirmado</button>
                <button className="secondary" onClick={() => {
                  const obs = window.prompt('Observación:', '');
                  if (obs !== null) handleVerifyImpact(selectedProof.id, 'MISSING', obs);
                }}>✗ No impactó</button>
              </div>
              {selectedProof.impactStatus && <p><b>Impacto:</b> {selectedProof.impactStatus}</p>}
            </div>
          )}
        </div>
      )}

      {selectedClient && (
        <div className="modal-backdrop" onClick={() => setSelectedClient(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>
                Historial — {clients.find((c) => c.id === selectedClient)?.name}
              </h4>
              <button className="secondary" onClick={() => setSelectedClient(null)}>Cerrar</button>
            </div>

            {/* POST /collections/quotas/:id/manual (Historia 5) y
                POST /collections/quotas/:id/request-proof (Fig 3) — la
                conversación completa de este cliente (mensajes, notas,
                eventos) se ve en Registro de Actividad filtrando por este
                mismo cliente; no se duplica acá. */}
            <table>
              <thead>
                <tr>
                  <th>Vencimiento</th><th>Monto</th><th>Status</th><th>Nota</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(clients.find((c) => c.id === selectedClient)?.quotas ?? []).map((q) => (
                  <tr key={q.id}>
                    <td>{new Date(q.dueDate).toLocaleDateString()}</td>
                    <td>${q.amount}</td>
                    <td><span className={`badge ${statusBadgeColor(q.status)}`}>{QUOTA_STATUS_LABELS[q.status] ?? q.status}</span></td>
                    <td>{q.manualHandlingNote ?? '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {!['PAID', 'MANUAL'].includes(q.status) && (
                        <>
                          <button className="secondary" onClick={() => handleRequestProof(q.id)}>
                            Solicitar comprobante
                          </button>
                          <button className="secondary" onClick={() => handleMarkQuotaManual(q.id)}>
                            Marcar manual
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
