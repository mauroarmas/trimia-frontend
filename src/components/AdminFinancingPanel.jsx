import CommercialReviewPanel from './CommercialReviewPanel';
import FinancingPlanPanel from './FinancingPlanPanel';
import FinancingConversationModal from './FinancingConversationModal';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listFinancingRequests,
  reviewFinancingRequest,
  getFinancingRequest,
  correctFinancingRequest,
  cancelFinancingRequest,
  retryFinancingNotice,
  simulateFinancingNoticeDelivery,
} from '../api';
import { contactInitials } from '../conversationHelpers';
import InfoNotes, { InfoToggle } from './InfoNotes';
import PageHero from './PageHero';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown } from '../chatExport';

const LABELS = {
  PENDING_REVIEW: 'Pendiente',
  APPROVED: 'Aprobada',
  APPROVED_WITH_CONDITIONS: 'Con condiciones',
  UNAVAILABLE: 'No disponible',
  REJECTED: 'Rechazada',
  DRAFT: 'Borrador',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
  SENDING: 'En proceso',
  ACCEPTED: 'Aceptado',
  DELIVERED: 'Entregado (simulado)',
  FAILED: 'Fallido',
  UNCERTAIN: 'Resultado incierto: requiere atención',
};

const EVENT_LABELS = {
  PLAN_CREATED: 'Plan de cuotas registrado',
  DRAFT_UPDATED: 'Datos recopilados',
  DRAFT_CORRECTED: 'Datos confirmados por responsable',
  IDENTITY_CONFLICT: 'Identidad a revisar',
  SUBMITTED: 'Solicitud presentada para revisión',
  EVALUATED: 'Evaluación crediticia registrada',
  CORRECTED: 'Solicitud corregida (nueva verificación)',
  DECIDED: 'Decisión humana registrada',
  CANCELLED: 'Solicitud cancelada',
  NOTICE_CLAIMED: 'Intento de aviso iniciado',
  NOTICE_ACCEPTED: 'Aviso aceptado en simulación',
  NOTICE_DELIVERED: 'Entrega confirmada en simulación',
  NOTICE_FAILED: 'Aviso fallido',
  NOTICE_UNCERTAIN: 'Aviso incierto',
  NOTICE_RETRY: 'Reintento solicitado',
};

const FILTER_TABS = [
  { id: 'PENDING_REVIEW', label: 'Pendiente' },
  { id: 'APPROVED', label: 'Aprobada' },
  { id: 'REJECTED', label: 'Rechazada' },
  { id: 'CANCELLED', label: 'Cancelada' },
  { id: 'ALL', label: 'Todas' },
];

const STATUS_TONE = {
  PENDING_REVIEW: 'is-pending',
  APPROVED: 'is-approved',
  APPROVED_WITH_CONDITIONS: 'is-conditions',
  REJECTED: 'is-rejected',
  CANCELLED: 'is-cancelled',
  UNAVAILABLE: 'is-unavailable',
};

const NOTICE_TONE = {
  ACCEPTED: 'is-approved',
  DELIVERED: 'is-approved',
  PENDING: 'is-pending',
  SENDING: 'is-sending',
  FAILED: 'is-rejected',
  UNCERTAIN: 'is-conditions',
};

const POLL_INTERVAL_MS = 2800;

const money = (value) =>
  value == null
    ? 'Sin importe'
    : Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

const noticeLabel = (n) =>
  n.status === 'ACCEPTED' && n.transportMode === 'simulated'
    ? 'Aceptado en simulación'
    : LABELS[n.status] ?? n.status;

export default function AdminFinancingPanel({ token, me, initialRequestId, onOpenCollections }) {
  const [rows, setRows] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);

  const detailRequest = useRef(0);
  const detailSectionRef = useRef(null);
  const prevEvalStateRef = useRef(null);

  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('PENDING_REVIEW');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evalElapsedSec, setEvalElapsedSec] = useState(0);
  const [showConvModal, setShowConvModal] = useState(false);

  const busy = Boolean(busyAction);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingList((prev) => prev && rows.length === 0);
      try {
        const list = await listFinancingRequests(token);
        setRows(list);
      } catch (e) {
        if (!silent) setError(e.message);
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [token, rows.length],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (initialRequestId) {
      open(initialRequestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestId]);

  async function open(id, { silent = false, preserveDraft = false } = {}) {
    const request = ++detailRequest.current;
    if (!preserveDraft) {
      setEditing(null);
      setNote('');
    }
    if (!silent) {
      setOpeningId(id);
      setError('');
    }
    try {
      const result = await getFinancingRequest(token, id);
      if (request === detailRequest.current) {
        setDetail(result);
        if (!silent && result?.request?.status) {
          setFilter((prev) =>
            prev === 'ALL' || prev === result.request.status
              ? prev
              : result.request.status,
          );
        }
        if (!silent) {
          requestAnimationFrame(() => {
            window.scrollTo?.({ top: 0, behavior: 'smooth' });
          });
        }
      }
    } catch (e) {
      if (request === detailRequest.current && !silent) setError(e.message);
    } finally {
      if (request === detailRequest.current && !silent) {
        setOpeningId(null);
      }
    }
  }

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      const request = detailRequest.current;
      const id = detail?.request.id;
      if (!silent) setRefreshing(true);
      try {
        await load({ silent });
        if (id && request === detailRequest.current) {
          await open(id, { silent: true, preserveDraft: true });
        }
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail?.request.id, load],
  );

  async function mutate(actionName, action, success) {
    setBusyAction(actionName);
    setError('');
    setFeedback('');
    try {
      await action();
      await refresh({ silent: true });
      setFeedback(success);
    } catch (e) {
      if (e.status === 409) {
        await refresh({ silent: true });
        setError(
          'El caso cambió mientras lo revisabas. Verificá los datos actualizados antes de decidir nuevamente.',
        );
      } else {
        setError(e.message);
      }
    } finally {
      setBusyAction(null);
    }
  }

  const selected = detail?.request;
  const snapshot = selected?.reviewedSnapshot ?? selected?.inputSnapshot;
  const pending = selected?.status === 'PENDING_REVIEW';
  const assessment = pending
    ? detail?.assessments?.find((a) => a.requestVersion === selected?.version) ??
      selected?.creditAssessments?.find(
        (a) => a.requestVersion === selected?.version,
      )
    : detail?.assessments?.at(-1) ?? selected?.creditAssessments?.[0];
  const isSelectedEvaluating =
    Boolean(selected) &&
    pending &&
    !selected.legacyNeedsConfirmation &&
    selected.evaluationState === 'PENDING';

  const evaluatingRowsCount = rows.filter(
    (r) =>
      r.status === 'PENDING_REVIEW' &&
      !r.legacyNeedsConfirmation &&
      r.evaluationState === 'PENDING',
  ).length;

  const isSelectedNoticeActive =
    Boolean(selected?.notice) &&
    (selected.notice.status === 'SENDING' ||
      (selected.notice.status === 'PENDING' && !selected.notice.lastErrorCode));

  const shouldAutoPoll =
    evaluatingRowsCount > 0 || isSelectedEvaluating || isSelectedNoticeActive;

  // Auto-actualización silenciosa mientras corre una verificación crediticia o un aviso saliente
  useEffect(() => {
    if (!shouldAutoPoll) return undefined;
    const timer = setInterval(() => {
      refresh({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldAutoPoll, refresh]);

  // Contador en vivo de segundos mientras el caso abierto está verificando crédito
  useEffect(() => {
    if (!isSelectedEvaluating) {
      setEvalElapsedSec(0);
      return undefined;
    }
    setEvalElapsedSec(1);
    const timer = setInterval(() => {
      setEvalElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isSelectedEvaluating, selected?.id, selected?.version]);

  // Aviso claro cuando la verificación crediticia del caso abierto pasa de PENDING a READY
  useEffect(() => {
    if (!selected) {
      prevEvalStateRef.current = null;
      return;
    }
    const prev = prevEvalStateRef.current;
    if (
      prev &&
      prev.id === selected.id &&
      prev.state === 'PENDING' &&
      selected.evaluationState === 'READY'
    ) {
      setFeedback(
        'Verificación crediticia completada. El dictamen actualizado ya está disponible para revisar.',
      );
    }
    prevEvalStateRef.current = {
      id: selected.id,
      version: selected.version,
      state: selected.evaluationState,
    };
  }, [selected]);

  const canMutate = me.role === 'SUPERVISOR';
  const canDecide =
    pending &&
    !selected.legacyNeedsConfirmation &&
    selected.evaluationState === 'READY' &&
    Number(selected.amount) > 0;

  const requiresNoteForApprove =
    !assessment ||
    ['APPROVED_WITH_CONDITIONS', 'UNAVAILABLE'].includes(assessment.verdict) ||
    assessment.verdict !== 'APPROVED';

  const requiresNoteForReject =
    !assessment ||
    ['APPROVED_WITH_CONDITIONS', 'UNAVAILABLE'].includes(assessment.verdict) ||
    assessment.verdict !== 'REJECTED';

  function decide(decision) {
    const requiresNote =
      !assessment ||
      ['APPROVED_WITH_CONDITIONS', 'UNAVAILABLE'].includes(assessment.verdict) ||
      assessment.verdict !== decision;
    if (requiresNote && !note.trim()) {
      setError(
        'Explicá la decisión o las condiciones confirmadas en la nota de revisión antes de continuar.',
      );
      return;
    }
    mutate(
      decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      () =>
        reviewFinancingRequest(token, selected.id, {
          expectedVersion: selected.version,
          decision,
          note,
        }),
      'Decisión registrada correctamente. El aviso al cliente tiene su propio seguimiento abajo.',
    );
  }

  function edit() {
    const data = selected.inputSnapshot ?? selected.client;
    setEditing({
      name: data.name ?? '',
      dni: data.dni ?? '',
      productSummary: selected.productSummary,
      amount: selected.amount ?? '',
      ...(data.sku ? { sku: data.sku } : {}),
    });
  }

  const counts = {
    ALL: rows.length,
    PENDING_REVIEW: rows.filter((r) => r.status === 'PENDING_REVIEW').length,
    APPROVED: rows.filter((r) => r.status === 'APPROVED').length,
    REJECTED: rows.filter((r) => r.status === 'REJECTED').length,
    CANCELLED: rows.filter((r) => r.status === 'CANCELLED').length,
  };

  const filteredRows = rows.filter((r) => filter === 'ALL' || r.status === filter);
  const olderAssessments = (detail?.assessments ?? []).filter(
    (a) => !assessment || a.requestVersion !== assessment.requestVersion,
  );

  return (
    <div className="knowledge-module financing-module fin-admin-page">
      <PageHero
        kicker="Administración"
        title="Aprobación de financiación"
        description="Revisión humana de solicitudes, verificación crediticia automática y estado de avisos al cliente."
        action={
          <div className="fin-hero-actions">
            <button
              type="button"
              className="knowledge-hero-action"
              onClick={() => refresh({ silent: false })}
              disabled={busy || refreshing}
            >
              <span
                className={refreshing ? 'fin-spin-inline' : ''}
                aria-hidden="true"
              >
                ↻
              </span>{' '}
              {refreshing ? 'Actualizando…' : 'Refrescar'}
            </button>
            <InfoToggle
              open={mostrarInfo}
              onToggle={() => setMostrarInfo((v) => !v)}
            />
          </div>
        }
      />

      {mostrarInfo && (
        <InfoNotes
          title="Aprobación y verificación de financiaciones"
          onClose={() => setMostrarInfo(false)}
          notes={[
            [
              'Verificación crediticia automática.',
              'Cada solicitud confirmada por el cliente dispara una consulta automática de antecedentes. Mientras está en curso, la pantalla se actualiza sola hasta habilitar la decisión.',
            ],
            [
              'Revisión humana obligatoria.',
              'La pre-evaluación sugiere un dictamen (Aprobada, Con condiciones, Rechazada o No disponible), pero la decisión final siempre la toma un supervisor.',
            ],
            [
              'Decisión y aviso separados.',
              'Registrar la aprobación o el rechazo genera un aviso saliente con seguimiento independiente para que puedas auditar o reintentar fallos de envío.',
            ],
          ]}
        />
      )}

      {error && (
        <div className="error fin-banner-alert" role="alert">
          {error}
        </div>
      )}

      {feedback && (
        <div className="success-msg fin-banner-feedback" role="status">
          <span>✓ {feedback}</span>
          <button
            type="button"
            className="fin-banner-dismiss"
            onClick={() => setFeedback('')}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {!selected && !openingId && (
        <>
          <div className="submenu-bar fin-filter-bar">
            <nav className="submenu-pills" aria-label="Filtrar solicitudes">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`submenu-pill${filter === t.id ? ' active' : ''}`}
                  onClick={() => setFilter(t.id)}
                >
                  {t.label}{' '}
                  <span className="fin-tab-count">{counts[t.id] ?? 0}</span>
                </button>
              ))}
            </nav>

            {evaluatingRowsCount > 0 && (
              <div className="fin-live-sync-pill" role="status" aria-live="polite">
                <span className="fin-spinner-sm" aria-hidden="true" />
                <span>
                  {evaluatingRowsCount === 1
                    ? '1 verificación crediticia en curso'
                    : `${evaluatingRowsCount} verificaciones crediticias en curso`}{' '}
                  · Sincronizando
                </span>
              </div>
            )}
          </div>

          <section className="card fin-table-card">
            {loadingList && rows.length === 0 ? (
              <div className="fin-empty-box">
                <span className="fin-spinner-md" aria-hidden="true" />
                <p>Cargando solicitudes de financiación…</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="fin-empty-box">
                <p>
                  {rows.length === 0
                    ? 'No hay solicitudes registradas todavía.'
                    : `No hay solicitudes en estado «${
                        FILTER_TABS.find((t) => t.id === filter)?.label ?? filter
                      }».`}
                </p>
              </div>
            ) : (
              <div className="knowledge-table-wrap fin-table-wrap">
                <table className="knowledge-table fin-requests-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Producto</th>
                      <th>Importe</th>
                      <th>Verificación crediticia</th>
                      <th>Estado</th>
                      <th>Aviso</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => {
                      const clientName = r.inputSnapshot?.name ?? r.client.name;
                      const clientDni =
                        r.inputSnapshot?.dni ?? r.client.dni ?? 'Sin confirmar';
                      const rowAssessment = r.creditAssessments?.[0];
                      const isRowEvaluating =
                        r.status === 'PENDING_REVIEW' &&
                        !r.legacyNeedsConfirmation &&
                        r.evaluationState === 'PENDING';
                      const isSelected = selected?.id === r.id;
                      const isOpeningThis = openingId === r.id;

                      return (
                        <tr
                          key={r.id}
                          className={isSelected ? 'is-selected' : ''}
                        >
                          <td>
                            <div className="fin-client-cell">
                              <span className="fin-client-avatar" aria-hidden="true">
                                {contactInitials(clientName)}
                              </span>
                              <div>
                                <strong className="fin-client-name">{clientName}</strong>
                                <div className="fin-client-sub">
                                  DNI {clientDni} · {r.client.phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="fin-product-cell">{r.productSummary}</span>
                          </td>
                          <td>
                            <strong className="fin-amount-cell">{money(r.amount)}</strong>
                          </td>
                          <td>
                            {r.legacyNeedsConfirmation ? (
                              <span className="fin-pill is-conditions">
                                Confirmar datos históricos
                              </span>
                            ) : isRowEvaluating ? (
                              <span className="fin-pill is-evaluating">
                                <span className="fin-spinner-xs" aria-hidden="true" />
                                Verificando crédito…
                              </span>
                            ) : rowAssessment &&
                              (r.status !== 'PENDING_REVIEW' ||
                                rowAssessment.requestVersion === r.version) ? (
                              <span
                                className={`fin-pill ${
                                  STATUS_TONE[rowAssessment.verdict] ?? ''
                                }`}
                              >
                                {LABELS[rowAssessment.verdict] ?? rowAssessment.verdict}
                              </span>
                            ) : (
                              <span className="fin-pill is-muted">Sin evaluar</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`fin-pill ${STATUS_TONE[r.status] ?? ''}`}
                            >
                              {LABELS[r.status] ?? r.status}
                            </span>
                          </td>
                          <td>
                            {r.notice ? (
                              <span
                                className={`fin-pill ${
                                  NOTICE_TONE[r.notice.status] ?? 'is-muted'
                                }`}
                              >
                                {noticeLabel(r.notice)}
                              </span>
                            ) : (
                              <span className="fin-muted-dash">Sin aviso</span>
                            )}
                          </td>
                          <td className="fin-action-cell">
                            <button
                              type="button"
                              className={isSelected ? '' : 'secondary'}
                              disabled={isOpeningThis}
                              onClick={() => open(r.id)}
                            >
                              {isOpeningThis
                                ? 'Abriendo…'
                                : isSelected
                                  ? 'Revisando'
                                  : 'Revisar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {openingId && !selected && (
        <section className="card fin-detail-loading" aria-live="polite">
          <span className="fin-spinner-md" aria-hidden="true" />
          <div>
            <strong>Abriendo expediente de financiación…</strong>
            <p>Consultando verificación crediticia, mensajes y trazabilidad del caso.</p>
          </div>
        </section>
      )}

      {selected?.commercialFlow ? (
        <div ref={detailSectionRef}>
          <CommercialReviewPanel
            key={selected.id}
            token={token}
            me={me}
            detail={detail}
            onChanged={refresh}
            onClose={() => {
              detailRequest.current++;
              setDetail(null);
            }}
          />
        </div>
      ) : selected && (
        <section
          ref={detailSectionRef}
          className={`card financing-detail fin-detail-card${
            openingId && openingId !== selected.id ? ' is-switching' : ''
          }`}
        >
          {/* Cabecera del expediente */}
          <header className="fin-detail-header">
            <div className="fin-detail-identity">
              <div className="fin-detail-avatar" aria-hidden="true">
                {contactInitials(snapshot?.name ?? selected.client.name)}
              </div>
              <div>
                <div className="fin-detail-title-row">
                  <h3>{snapshot?.name ?? selected.client.name}</h3>
                  <span
                    className={`fin-pill ${STATUS_TONE[selected.status] ?? ''}`}
                  >
                    {LABELS[selected.status] ?? selected.status}
                  </span>
                  <span className="fin-version-tag">Versión #{selected.version}</span>
                </div>
                <p className="fin-detail-sub">
                  Solicitud recibida el{' '}
                  {new Date(selected.createdAt).toLocaleString('es-AR')}
                </p>
              </div>
            </div>

            <div className="commerce-head-actions">
              <button
                type="button"
                className="btn-pill-action commerce-conv-btn"
                onClick={() => setShowConvModal(true)}
              >
                <span>💬 Conversación con el cliente</span>
                {detail.messages?.length > 0 && (
                  <span className="commerce-conv-count">
                    {detail.messages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  detailRequest.current++;
                  setDetail(null);
                  setEditing(null);
                  setShowConvModal(false);
                }}
              >
                ← Volver a solicitudes
              </button>
            </div>
          </header>

          {/* Grilla resumen de los 4 datos clave */}
          <div className="fin-summary-grid">
            <div className="fin-summary-box">
              <span>DNI revisado</span>
              <strong>{snapshot?.dni ?? selected.client.dni ?? 'Sin confirmar'}</strong>
            </div>
            <div className="fin-summary-box">
              <span>Teléfono de contacto</span>
              <strong>{selected.client.phone}</strong>
            </div>
            <div className="fin-summary-box">
              <span>Producto solicitado</span>
              <strong title={selected.productSummary}>{selected.productSummary}</strong>
            </div>
            <div className="fin-summary-box is-highlight">
              <span>Importe a financiar</span>
              <strong>{money(selected.amount)}</strong>
            </div>
          </div>

          {snapshot &&
            (snapshot.name !== selected.client.name ||
              snapshot.dni !== selected.client.dni) && (
              <div className="fin-callout is-warning">
                <strong>Atención sobre la ficha del cliente:</strong> La ficha actual
                registrada para este contacto ({selected.client.name} · DNI{' '}
                {selected.client.dni ?? 's/d'}) difiere de los datos declarados en
                este pedido.
              </div>
            )}

          {/* BLOQUE CENTRAL: Estado de la verificación crediticia */}
          <div className="fin-section-block">
            <div className="fin-section-head">
              <h4>Verificación crediticia</h4>
              {isSelectedEvaluating && (
                <span className="fin-live-chip">
                  <span className="fin-live-dot" aria-hidden="true" />
                  Actualización automática activa
                </span>
              )}
            </div>

            {selected.legacyNeedsConfirmation ? (
              <div className="fin-callout is-warning">
                <strong>Requiere confirmar datos históricos:</strong> Esta solicitud
                no cuenta con snapshot confirmado. Usá <b>Corregir datos</b> para
                confirmar identidad e importe e iniciar una nueva verificación
                crediticia.
              </div>
            ) : isSelectedEvaluating ? (
              /* Tarjeta protagonista de feedback mientras carga la verificación crediticia */
              <div
                className="fin-eval-loading-card"
                role="status"
                aria-live="polite"
              >
                <div className="fin-eval-loading-top">
                  <div className="fin-eval-radar" aria-hidden="true">
                    <span className="fin-spinner-lg" />
                  </div>
                  <div className="fin-eval-loading-copy">
                    <div className="fin-eval-loading-heading">
                      <strong>
                        Verificando antecedentes crediticios del solicitante…
                      </strong>
                      <span className="fin-eval-timer">
                        En curso{evalElapsedSec > 0 ? ` · ${evalElapsedSec} s` : ''}
                      </span>
                    </div>
                    <p>
                      Consultando central de riesgo y situación crediticia para el DNI{' '}
                      <b>{snapshot?.dni ?? selected.client.dni}</b> por un monto de{' '}
                      <b>{money(selected.amount)}</b>. Todavía no se puede aprobar ni
                      rechazar hasta contar con el dictamen de esta versión.
                    </p>
                  </div>
                </div>

                <div className="fin-eval-progress-track" aria-hidden="true">
                  <div className="fin-eval-progress-bar" />
                </div>

                <ol className="fin-eval-steps">
                  <li className="is-done">
                    <span className="fin-step-badge">✓</span>
                    <div>
                      <strong>Datos confirmados</strong>
                      <small>Identidad, producto e importe registrados</small>
                    </div>
                  </li>
                  <li className="is-active">
                    <span className="fin-step-badge">
                      <span className="fin-spinner-xs" />
                    </span>
                    <div>
                      <strong>Evaluando perfil crediticio</strong>
                      <small>
                        {evalElapsedSec >= 12
                          ? 'Aguardando procesamiento de la cola de riesgo (puede demorar hasta 30 s)…'
                          : 'Consultando antecedentes e indicadores comerciales…'}
                      </small>
                    </div>
                  </li>
                  <li className="is-upcoming">
                    <span className="fin-step-badge">3</span>
                    <div>
                      <strong>Habilitar decisión humana</strong>
                      <small>Se destrabará sola al recibir el resultado</small>
                    </div>
                  </li>
                </ol>

                <div className="fin-eval-loading-foot">
                  <span>
                    No hace falta recargar la pantalla: te avisaremos acá mismo apenas
                    termine.
                  </span>
                  <button
                    type="button"
                    className="secondary fin-btn-sm"
                    disabled={refreshing}
                    onClick={() => refresh({ silent: false })}
                  >
                    {refreshing ? 'Comprobando…' : 'Comprobar ahora'}
                  </button>
                </div>
              </div>
            ) : assessment ? (
              <div
                className={`fin-verdict-card ${
                  STATUS_TONE[assessment.verdict] ?? ''
                }`}
              >
                <div className="fin-verdict-top">
                  <div className="fin-verdict-badges">
                    <span
                      className={`fin-pill ${
                        STATUS_TONE[assessment.verdict] ?? ''
                      }`}
                    >
                      Pre-evaluación: {LABELS[assessment.verdict] ?? assessment.verdict}
                    </span>
                    <span className="fin-source-tag">
                      Fuente: {assessment.source === 'MOCK' ? 'Simulada' : assessment.source}
                    </span>
                    {assessment.requestVersion != null && (
                      <span className="fin-source-tag">
                        Versión #{assessment.requestVersion}
                      </span>
                    )}
                  </div>
                  <time className="fin-verdict-time">
                    {new Date(assessment.createdAt).toLocaleString('es-AR')}
                  </time>
                </div>

                <p className="fin-verdict-reason">{assessment.reason}</p>

                {assessment.commercialCondition && (
                  <div className="fin-verdict-condition">
                    <strong>Condición comercial sugerida:</strong>{' '}
                    {assessment.commercialCondition}
                  </div>
                )}
              </div>
            ) : (
              <div className="fin-callout">
                Evaluación lista para revisión. No se registraron observaciones
                adicionales.
              </div>
            )}

            {olderAssessments.length > 0 && (
              <details className="fin-older-assessments">
                <summary>
                  Ver evaluaciones de versiones anteriores ({olderAssessments.length})
                </summary>
                <div className="fin-older-list">
                  {olderAssessments.map((a, i) => (
                    <div key={i} className="fin-older-item">
                      <strong>
                        {LABELS[a.verdict] ?? a.verdict} (v{a.requestVersion})
                      </strong>{' '}
                      · {a.source === 'MOCK' ? 'Simulada' : a.source} ·{' '}
                      {new Date(a.createdAt).toLocaleString('es-AR')}: {a.reason}{' '}
                      {a.commercialCondition ?? ''}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Resolución ya tomada (cuando fue aprobada/rechazada) */}
          {selected.reviewedBy && (
            <div className="fin-resolution-summary">
              <strong>Decisión registrada por {selected.reviewedBy.name}</strong> el{' '}
              {new Date(selected.reviewedAt).toLocaleString('es-AR')}.
              {selected.reviewNote && (
                <p className="fin-resolution-note">“{selected.reviewNote}”</p>
              )}
            </div>
          )}

          {/* Panel de Decisión Humana / Edición */}
          {pending && canMutate && (
            <div className="fin-decision-box">
              <div className="fin-decision-head">
                <h4>Resolución del supervisor</h4>
                {!isSelectedEvaluating && assessment && (
                  <span className="fin-note-requirement">
                    {requiresNoteForApprove && requiresNoteForReject
                      ? 'Nota obligatoria para decidir en este caso'
                      : 'Nota obligatoria si cambiás el dictamen sugerido o corregís datos'}
                  </span>
                )}
              </div>

              <label className="fin-note-field">
                <span>Nota de revisión</span>
                <textarea
                  aria-label="Nota de revisión"
                  rows={3}
                  placeholder={
                    isSelectedEvaluating
                      ? 'Podés ir redactando observaciones mientras termina la verificación crediticia…'
                      : 'Dejá constancia de condiciones acordadas, motivo de rechazo o justificación…'
                  }
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>

              <div className="knowledge-form-actions fin-decision-actions">
                <button
                  type="button"
                  className="fin-btn-approve"
                  disabled={busy || !canDecide}
                  title={
                    isSelectedEvaluating
                      ? 'Esperando que termine la verificación crediticia en curso'
                      : undefined
                  }
                  onClick={() => decide('APPROVED')}
                >
                  {busyAction === 'APPROVE'
                    ? 'Aprobando…'
                    : '✓ Aprobar financiación'}
                </button>
                <button
                  type="button"
                  className="secondary fin-btn-reject"
                  disabled={busy || !canDecide}
                  title={
                    isSelectedEvaluating
                      ? 'Esperando que termine la verificación crediticia en curso'
                      : undefined
                  }
                  onClick={() => decide('REJECTED')}
                >
                  {busyAction === 'REJECT'
                    ? 'Rechazando…'
                    : '✕ Rechazar financiación'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={edit}
                >
                  ✎ Corregir datos
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      'CANCEL',
                      () =>
                        cancelFinancingRequest(token, selected.id, {
                          expectedVersion: selected.version,
                          note,
                        }),
                      'Solicitud cancelada.',
                    )
                  }
                >
                  {busyAction === 'CANCEL' ? 'Cancelando…' : 'Cancelar solicitud'}
                </button>
              </div>
            </div>
          )}

          {/* Formulario de corrección de datos */}
          {editing && (
            <form
              className="fin-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) {
                  setError(
                    'Agregá una nota de revisión arriba para confirmar y auditar la corrección.',
                  );
                  return;
                }
                mutate(
                  'CORRECT',
                  async () => {
                    await correctFinancingRequest(token, selected.id, {
                      ...editing,
                      amount: Number(editing.amount).toFixed(2),
                      expectedVersion: selected.version,
                      confirmData: true,
                      note,
                    });
                    setEditing(null);
                  },
                  'Corrección guardada. Se inició una nueva verificación crediticia automática.',
                );
              }}
            >
              <div className="fin-edit-head">
                <h4>Corregir datos de la solicitud</h4>
                <p>
                  Confirmá identidad e importe con una nota de revisión. Al guardar,
                  se ejecutará una nueva verificación crediticia sobre los datos
                  corregidos (no modifica otras operaciones del cliente).
                </p>
              </div>

              <div className="fin-edit-grid">
                {Object.entries({
                  name: 'Nombre',
                  dni: 'DNI',
                  productSummary: 'Producto',
                  amount: 'Importe ARS',
                }).map(([key, label]) => (
                  <label key={key} className="fin-edit-field">
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      value={editing[key]}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.value })
                      }
                      maxLength={
                        key === 'name'
                          ? 120
                          : key === 'productSummary'
                            ? 500
                            : key === 'dni'
                              ? 8
                              : 30
                      }
                      required
                    />
                  </label>
                ))}
              </div>

              <div className="fin-edit-actions">
                <button type="submit" disabled={busy}>
                  {busyAction === 'CORRECT'
                    ? 'Guardando e iniciando verificación…'
                    : 'Confirmar corrección'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Descartar
                </button>
              </div>
            </form>
          )}

          <FinancingPlanPanel key={selected.id} token={token} request={selected} plan={detail.plan} canCreate={canMutate} onCreated={refresh} onOpenCollections={onOpenCollections} />

          {/* Estado independiente del aviso saliente */}
          {selected.notice && (
            <section className="fin-notice-card">
              <div className="fin-notice-head">
                <h4>Aviso al cliente</h4>
                <span
                  className={`fin-pill ${
                    NOTICE_TONE[selected.notice.status] ?? 'is-muted'
                  }`}
                >
                  {isSelectedNoticeActive && (
                    <span className="fin-spinner-xs" aria-hidden="true" />
                  )}
                  {noticeLabel(selected.notice)}
                </span>
              </div>

              <p className="fin-notice-desc">
                Estado actual: <strong>{noticeLabel(selected.notice)}</strong> · Intentos:{' '}
                <strong>{selected.notice.attemptCount || 0}/3</strong>.{' '}
                {selected.notice.lastErrorCode === 'TRANSPORT_DISABLED'
                  ? 'El transporte de mensajería está deshabilitado en este entorno.'
                  : selected.notice.lastErrorCode === 'HUMAN_PAUSED'
                    ? 'El hilo está tomado manualmente por una persona; liberá la conversación para despachar.'
                    : selected.notice.lastErrorCode === 'CONTACT_OPT_OUT'
                      ? 'El contacto solicitó no recibir mensajes automáticos (022).'
                      : selected.notice.lastErrorCode === 'CONDITIONS_CHANGED'
                        ? 'Las condiciones u oferta asociada cambiaron o vencieron (48 h).'
                        : ''}
              </p>

              {selected.notice.status === 'ACCEPTED' && canMutate && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      'CONFIRM_DELIVERY',
                      () =>
                        simulateFinancingNoticeDelivery(
                          token,
                          selected.notice.id,
                          {
                            providerMessageId:
                              selected.notice.providerMessageId || undefined,
                          },
                        ),
                      'Entrega simulada confirmada (DELIVERED).',
                    )
                  }
                >
                  {busyAction === 'CONFIRM_DELIVERY'
                    ? 'Confirmando entrega…'
                    : '✓ Confirmar entrega simulada'}
                </button>
              )}

              {selected.notice.status === 'FAILED' && canMutate && (
                <button
                  type="button"
                  disabled={busy || (selected.notice.attemptCount || 0) >= 3}
                  onClick={() =>
                    mutate(
                      'RETRY_NOTICE',
                      () =>
                        retryFinancingNotice(
                          token,
                          selected.notice.id,
                          selected.notice.version,
                        ),
                      'Reintento de aviso solicitado.',
                    )
                  }
                >
                  {busyAction === 'RETRY_NOTICE'
                    ? 'Reintentando…'
                    : (selected.notice.attemptCount || 0) >= 3
                      ? 'Tope de reintentos alcanzado (3/3)'
                      : '↻ Reintentar aviso fallido'}
                </button>
              )}

              {selected.notice.status === 'UNCERTAIN' && (
                <p className="fin-notice-warn">
                  Revisá lo ocurrido en el hilo antes de volver a contactar al
                  cliente. No se reenviará automáticamente para evitar duplicados.
                </p>
              )}

              {selected.notice.transportMode === 'simulated' && (
                <p className="fin-notice-sim-hint">
                  Prueba simulada: registra el mensaje en el hilo pero no acredita
                  entrega externa por WhatsApp.
                </p>
              )}
            </section>
          )}

          {/* Conversación y Trazabilidad en dos columnas limpias */}
          <div className="fin-bottom-grid">
            <section className="fin-subcard">
              <div className="fin-subcard-head">
                <h4>Conversación ({detail.messages.length})</h4>
                <ChatExportMenu
                  filename={`financiacion-${
                    snapshot?.name ?? selected.client.name ?? selected.id
                  }`}
                  disabled={!detail.messages?.length}
                  getMarkdown={() =>
                    buildConversationMarkdown({
                      title: `Solicitud de financiación — ${
                        snapshot?.name ?? selected.client.name
                      }`,
                      contactLabel: snapshot?.name ?? selected.client.name,
                      messages: detail.messages,
                      me,
                      extraMeta: [
                        ['Teléfono', selected.client.phone],
                        ['Producto', selected.productSummary],
                        ['Importe', money(selected.amount)],
                      ],
                    })
                  }
                />
              </div>

              {detail.messages.length === 0 ? (
                <p className="fin-muted-empty">Sin mensajes asociados.</p>
              ) : (
                <div className="fin-chat-list">
                  {detail.messages.map((m) => {
                    const isUser = m.role === 'USER';
                    const isNotice =
                      m.noticeId &&
                      selected.notice &&
                      m.noticeId === selected.notice.id;
                    return (
                      <div
                        key={m.id}
                        className={`fin-chat-bubble ${
                          isUser ? 'is-client' : 'is-assistant'
                        }`}
                      >
                        <div className="fin-chat-meta">
                          <strong>{isUser ? 'Cliente' : 'Asistente'}</strong>
                          {m.createdAt && (
                            <time>
                              {new Date(m.createdAt).toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          )}
                        </div>
                        <p>{m.content}</p>
                        {isNotice && (
                          <span className="fin-chat-notice-tag">
                            Aviso de resolución · {noticeLabel(selected.notice)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="fin-subcard">
              <div className="fin-subcard-head">
                <h4>Trazabilidad ({detail.events.length})</h4>
              </div>
              {detail.events.length === 0 ? (
                <p className="fin-muted-empty">Sin eventos registrados.</p>
              ) : (
                <ol className="fin-timeline-list">
                  {detail.events.map((e) => (
                    <li key={e.id} className="fin-timeline-item">
                      <span className="fin-timeline-dot" aria-hidden="true" />
                      <div>
                        <div className="fin-timeline-title">
                          {EVENT_LABELS[e.eventType.replace('FINANCING_', '')] ??
                            'Evento del caso'}
                          {e.requestVersion != null && (
                            <span className="fin-timeline-ver">
                              v{e.requestVersion}
                            </span>
                          )}
                        </div>
                        <div className="fin-timeline-meta">
                          {new Date(e.createdAt).toLocaleString('es-AR')}
                          {e.actorId ? ` · Responsable: ${e.actorId.slice(0, 8)}…` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {showConvModal && (
            <FinancingConversationModal
              token={token}
              me={me}
              conversationId={selected.conversationId}
              prospectId={selected.prospectId}
              clientName={snapshot?.name ?? selected.client.name}
              clientPhone={selected.client.phone}
              clientDni={snapshot?.dni ?? selected.client.dni}
              productSummary={selected.productSummary}
              fallbackMessages={detail.messages}
              onClose={() => setShowConvModal(false)}
            />
          )}
        </section>
      )}
    </div>
  );
}
