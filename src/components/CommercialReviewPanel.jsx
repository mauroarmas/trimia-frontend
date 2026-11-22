import { useEffect, useMemo, useState } from 'react';
import {
  getCommercialOrder,
  getCommercialOffers,
  reviewCommercialOrder,
  renewCommercialOrder,
  listCollectors,
} from '../api';
import { contactInitials } from '../conversationHelpers';
import CommercialOrderCard, {
  commercialMoney,
  commercialStage,
  commercialStageTone,
} from './CommercialOrderCard';
import FinancingConversationModal from './FinancingConversationModal';

const VERDICT_META = {
  APPROVED: {
    label: 'Favorable',
    tone: 'is-approved',
  },
  APPROVED_WITH_CONDITIONS: {
    label: 'Con condiciones',
    tone: 'is-conditions',
  },
  REJECTED: {
    label: 'Desfavorable',
    tone: 'is-rejected',
  },
  UNAVAILABLE: {
    label: 'No disponible',
    tone: 'is-unavailable',
  },
};

function formatShortExpiry(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Tucuman',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function quotaAmountPreview(total, quotaCount) {
  if (!quotaCount || quotaCount <= 0) return null;
  const cents = Math.round(Number(total ?? 0) * 100);
  const base = Math.floor(cents / quotaCount) / 100;
  return commercialMoney(base);
}

export default function CommercialReviewPanel({
  token,
  me,
  detail,
  onChanged,
  onClose,
}) {
  const [order, setOrder] = useState(null);
  const [offers, setOffers] = useState([]);
  const [enabled, setEnabled] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [collectorId, setCollectorId] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [showConvModal, setShowConvModal] = useState(false);

  const id = detail.request.id;
  const busy = Boolean(busyAction);

  useEffect(() => {
    let active = true;
    Promise.all([
      getCommercialOrder(token, id),
      getCommercialOffers(token, id),
      listCollectors(token),
    ])
      .then(([row, choices, people]) => {
        if (!active) return;
        setOrder(row);
        setOffers(choices);
        setCollectors(people);
        setCollectorId((prev) => prev || row.client.assignedCollectorId || '');
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, id, detail.request.version, revision]);

  async function run(actionName, action, successMessage) {
    setBusyAction(actionName);
    setError('');
    setNotice('');
    try {
      await action();
      setEnabled([]);
      setNote('');
      setRevision((v) => v + 1);
      await onChanged();
      if (successMessage) setNotice(successMessage);
    } catch (e) {
      setError(e.message);
      setRevision((v) => v + 1);
    } finally {
      setBusyAction(null);
    }
  }

  const financed = enabled.some(
    (key) => offers.find((o) => o.id === key)?.modality === 'FINANCED',
  );
  const assessment = detail.assessments.at(-1);
  const isEvaluationReady = detail.request.evaluationState === 'READY';
  const isEvaluating = detail.request.evaluationState === 'PENDING';
  const verdictInfo = VERDICT_META[assessment?.verdict] ?? {
    label: isEvaluationReady ? 'Evaluada' : 'Evaluando…',
    tone: 'is-pending',
  };

  const clientDisplayName =
    order?.client?.name ||
    detail.request?.inputSnapshot?.name ||
    detail.request?.client?.name ||
    'Cliente';

  const remainingHours = useMemo(() => {
    if (!order?.flow?.expiresAt) return null;
    const diffMs = new Date(order.flow.expiresAt).getTime() - Date.now();
    return diffMs / (1000 * 60 * 60);
  }, [order?.flow?.expiresAt]);

  // Mostrar renovación únicamente si venció o si faltan <= 6 horas para vencer
  const showRenewalBanner =
    Boolean(order) &&
    order.flow.stage === 'REVIEW' &&
    (order.expired || (remainingHours !== null && remainingHours <= 6));

  // Ocultar la leyenda genérica de renovación reciente para evitar ruido innecesario
  const meaningfulReviewReason = useMemo(() => {
    const reason = order?.flow?.reviewReason?.trim();
    if (!reason) return null;
    if (/^Condiciones renovadas/i.test(reason)) return null;
    return reason;
  }, [order?.flow?.reviewReason]);

  const canSubmitApprove =
    !busy &&
    enabled.length > 0 &&
    Boolean(note.trim()) &&
    isEvaluationReady &&
    (!financed || (Boolean(collectorId) && Boolean(firstDueDate)));

  const canSubmitReject = !busy && Boolean(note.trim()) && isEvaluationReady;

  function toggleOffer(offerId, checked) {
    setEnabled((prev) =>
      checked
        ? prev.includes(offerId)
          ? prev
          : [...prev, offerId]
        : prev.filter((key) => key !== offerId),
    );
  }

  function selectAllOffers() {
    if (enabled.length === offers.length) {
      setEnabled([]);
    } else {
      setEnabled(offers.map((o) => o.id));
    }
  }

  const tomorrowIso = addDaysIso(1);
  const msgCount = detail.messages?.length ?? 0;

  return (
    <section className="cr-shell">
      {/* Cabecera limpia y de alto contraste */}
      <header className="cr-header">
        <div className="cr-header-left">
          <div className="cr-avatar" aria-hidden="true">
            {contactInitials(clientDisplayName)}
          </div>
          <div className="cr-header-copy">
            <div className="cr-title-row">
              <h3>{clientDisplayName}</h3>
              {order && (
                <span className={`commerce-stage-pill ${commercialStageTone(order)}`}>
                  {commercialStage(order)}
                </span>
              )}
            </div>
            {order ? (
              <p className="cr-meta-line">
                <span>DNI {order.client.dni}</span>
                {order.client.phone && <span>{order.client.phone}</span>}
                <span>
                  {order.business
                    ? `${order.business}${order.locality ? ` · ${order.locality}` : ''}`
                    : order.locality || 'Compra personal'}
                </span>
                <span>
                  {order.expired
                    ? 'Vigencia vencida'
                    : `Vigente hasta ${formatShortExpiry(order.flow.expiresAt)}`}
                </span>
                <span className="cr-meta-version">v{order.version}</span>
              </p>
            ) : (
              <p className="cr-meta-line">Cargando datos del pedido…</p>
            )}
          </div>
        </div>

        <div className="cr-header-actions">
          <button
            type="button"
            className="cr-btn-outline"
            onClick={() => setShowConvModal(true)}
          >
            <span>Conversación</span>
            {msgCount > 0 && <span className="cr-count-dot">{msgCount}</span>}
          </button>

          <button type="button" className="cr-btn-ghost" onClick={onClose}>
            ← Volver
          </button>
        </div>
      </header>

      {/* Feedback inmediato tras acciones (renovar, aprobar, rechazar) */}
      {notice && (
        <div className="cr-feedback is-success" role="status">
          <span>✓ {notice}</span>
          <button
            type="button"
            className="cr-feedback-close"
            onClick={() => setNotice('')}
            aria-label="Cerrar mensaje"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="cr-feedback is-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="cr-feedback-close"
            onClick={() => setError('')}
            aria-label="Cerrar error"
          >
            ×
          </button>
        </div>
      )}

      {!order && !error && (
        <div className="cr-loading">
          <span className="fin-spinner-md" aria-hidden="true" />
          <p>Cargando expediente y ofertas…</p>
        </div>
      )}

      {order && (
        <>
          {/* Franja compacta del producto y referencia */}
          <div className="cr-summary-strip">
            <div className="cr-summary-item cr-summary-product">
              <span className="cr-summary-label">Producto solicitado</span>
              <strong title={order.productSummary}>{order.productSummary}</strong>
              <small>1 unidad{order.sku ? ` · SKU ${order.sku}` : ''}</small>
            </div>

            <div className="cr-summary-item">
              <span className="cr-summary-label">Entrega</span>
              <strong>
                {order.delivery
                  ? `Envío (${commercialMoney(order.delivery.cost)})`
                  : 'Retiro en sucursal'}
              </strong>
              <small>{order.locality || 'A confirmar'}</small>
            </div>

            <div className="cr-summary-item cr-summary-price">
              <span className="cr-summary-label">Precio de lista</span>
              <strong>{commercialMoney(order.amount)}</strong>
              <small>Referencia del catálogo</small>
            </div>
          </div>

          {meaningfulReviewReason && (
            <div className="cr-inline-alert">
              <strong>Motivo de revisión:</strong> {meaningfulReviewReason}
            </div>
          )}

          {/* Renovación: solo aparece cuando la vigencia venció o está por vencer */}
          {showRenewalBanner && (
            <div className={`cr-renewal-bar ${order.expired ? 'is-expired' : 'is-expiring'}`}>
              <div className="cr-renewal-text">
                <strong>
                  {order.expired
                    ? 'La vigencia de 48 horas venció'
                    : `La vigencia vence en menos de ${Math.max(1, Math.ceil(remainingHours))} h`}
                </strong>
                <span>
                  Renovar actualiza el precio de lista, relanza la evaluación y reinicia el plazo de 48 horas.
                </span>
              </div>
              <button
                type="button"
                className={order.expired ? 'cr-btn-primary' : 'cr-btn-outline'}
                disabled={busy}
                onClick={() =>
                  run(
                    'RENEW',
                    () =>
                      renewCommercialOrder(token, id, {
                        expectedVersion: order.version,
                      }),
                    'Vigencia renovada por 48 horas. Se actualizó la evaluación crediticia del pedido.',
                  )
                }
              >
                {busyAction === 'RENEW' ? 'Renovando…' : '↻ Renovar por 48 horas'}
              </button>
            </div>
          )}

          {order.flow.stage === 'REVIEW' ? (
            <div className="cr-workbench">
              {/* Columna Principal: Ofertas y Resolución */}
              <div className="cr-main-col">
                {!order.expired ? (
                  <form
                    className="cr-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(
                        'APPROVE',
                        () =>
                          reviewCommercialOrder(token, id, {
                            expectedVersion: order.version,
                            decision: 'APPROVED',
                            offerIds: enabled,
                            ...(financed ? { collectorId, firstDueDate } : {}),
                            note,
                          }),
                        'Financiación aprobada y ofertas habilitadas para el cliente.',
                      );
                    }}
                  >
                    <section className="cr-section">
                      <div className="cr-section-head">
                        <div>
                          <h4>Ofertas a habilitar</h4>
                          <p>Elegí las alternativas de pago que podrá seleccionar el cliente.</p>
                        </div>
                        {offers.length > 0 && (
                          <button
                            type="button"
                            className="cr-text-btn"
                            onClick={selectAllOffers}
                          >
                            {enabled.length === offers.length
                              ? 'Desmarcar todas'
                              : `Seleccionar todas (${offers.length})`}
                          </button>
                        )}
                      </div>

                      <div className="cr-offers-grid">
                        {offers.map((o) => {
                          const isChecked = enabled.includes(o.id);
                          const isFinancedOffer = o.modality === 'FINANCED';
                          const perQuota = isFinancedOffer
                            ? quotaAmountPreview(o.total, o.quotaCount)
                            : null;
                          const cashSavings =
                            !isFinancedOffer && Number(order.amount) > Number(o.total)
                              ? Number(order.amount) - Number(o.total)
                              : 0;

                          return (
                            <label
                              key={o.id}
                              className={`cr-offer-card${isChecked ? ' is-selected' : ''}${
                                isFinancedOffer ? ' is-financed' : ' is-cash'
                              }`}
                            >
                              <div className="cr-offer-head">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => toggleOffer(o.id, e.target.checked)}
                                />
                                <span className="cr-offer-name">{o.label}</span>
                              </div>

                              <div className="cr-offer-price">
                                {isFinancedOffer && perQuota ? (
                                  <>
                                    <strong>{perQuota}</strong>
                                    <span>/ semana</span>
                                  </>
                                ) : (
                                  <strong>{commercialMoney(o.total)}</strong>
                                )}
                              </div>

                              <div className="cr-offer-foot">
                                {isFinancedOffer ? (
                                  <span>Total {commercialMoney(o.total)}</span>
                                ) : cashSavings > 0 ? (
                                  <span className="cr-saving-text">
                                    Ahorro {commercialMoney(cashSavings)} vs. lista
                                  </span>
                                ) : (
                                  <span>Pago único</span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </section>

                    {financed && (
                      <section className="cr-financed-params">
                        <div className="cr-section-head">
                          <div>
                            <h4>Plan de cuotas</h4>
                            <p>Cobrador responsable y fecha de inicio del cronograma semanal.</p>
                          </div>
                        </div>

                        <div className="cr-params-grid">
                          <label className="cr-field">
                            <span>Cobrador asignado</span>
                            <select
                              required
                              value={collectorId}
                              onChange={(e) => setCollectorId(e.target.value)}
                            >
                              <option value="">Elegir cobrador…</option>
                              {collectors.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="cr-field">
                            <div className="cr-field-top">
                              <span>Primer vencimiento</span>
                              <div className="cr-date-chips">
                                <button
                                  type="button"
                                  onClick={() => setFirstDueDate(addDaysIso(7))}
                                >
                                  +7 d
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFirstDueDate(addDaysIso(14))}
                                >
                                  +14 d
                                </button>
                              </div>
                            </div>
                            <input
                              type="date"
                              min={tomorrowIso}
                              required
                              value={firstDueDate}
                              onChange={(e) => setFirstDueDate(e.target.value)}
                            />
                          </label>
                        </div>
                      </section>
                    )}

                    <section className="cr-decision-panel">
                      <label className="cr-field">
                        <div className="cr-field-top">
                          <span>Nota interna de resolución</span>
                          <small className="cr-field-hint">
                            {!isEvaluationReady
                              ? 'Esperando evaluación…'
                              : !note.trim()
                                ? 'Obligatoria'
                                : enabled.length > 0
                                  ? `${enabled.length} oferta${enabled.length > 1 ? 's' : ''} lista${enabled.length > 1 ? 's' : ''}`
                                  : 'Podés rechazar o elegir ofertas'}
                          </small>
                        </div>
                        <textarea
                          required
                          rows={3}
                          value={note}
                          maxLength={2000}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Justificación o condiciones confirmadas para auditoría interna…"
                        />
                      </label>

                      <div className="cr-decision-actions">
                        <button
                          type="submit"
                          className="cr-btn-approve"
                          disabled={!canSubmitApprove}
                        >
                          {busyAction === 'APPROVE'
                            ? 'Aprobando…'
                            : 'Aprobar y habilitar ofertas'}
                        </button>

                        <button
                          type="button"
                          className="cr-btn-reject"
                          disabled={!canSubmitReject}
                          onClick={() =>
                            run(
                              'REJECT',
                              () =>
                                reviewCommercialOrder(token, id, {
                                  expectedVersion: order.version,
                                  decision: 'REJECTED',
                                  offerIds: enabled.filter((key) => key === 'cash'),
                                  note,
                                }),
                              enabled.includes('cash')
                                ? 'Financiación rechazada. Se habilitó alternativa de contado.'
                                : 'Solicitud de financiación rechazada.',
                            )
                          }
                        >
                          {busyAction === 'REJECT'
                            ? 'Rechazando…'
                            : enabled.includes('cash')
                              ? 'Rechazar y ofrecer contado'
                              : 'Rechazar financiación'}
                        </button>
                      </div>
                    </section>
                  </form>
                ) : (
                  <div className="cr-expired-placeholder">
                    <p>
                      Renová la vigencia del pedido arriba para revisar las ofertas actualizadas y registrar una decisión.
                    </p>
                  </div>
                )}
              </div>

              {/* Columna Lateral: Dictamen crediticio conciso + Ficha */}
              <aside className="cr-side-col">
                <div className={`cr-verdict-card ${verdictInfo.tone}`}>
                  <div className="cr-verdict-head">
                    <span className="cr-verdict-eyebrow">Evaluación crediticia</span>
                    {assessment?.createdAt && (
                      <time>{formatShortExpiry(assessment.createdAt)}</time>
                    )}
                  </div>

                  {isEvaluating ? (
                    <div className="cr-verdict-loading">
                      <span className="fin-spinner-sm" aria-hidden="true" />
                      <span>Actualizando evaluación crediticia…</span>
                    </div>
                  ) : (
                    <>
                      <div className="cr-verdict-status">
                        <span className={`cr-verdict-dot ${verdictInfo.tone}`} aria-hidden="true" />
                        <strong>{verdictInfo.label}</strong>
                      </div>

                      {assessment?.reason && (
                        <p className="cr-verdict-reason">{assessment.reason}</p>
                      )}

                      {assessment?.commercialCondition && (
                        <div className="cr-verdict-suggestion">
                          <span>Sugerencia</span>
                          <p>{assessment.commercialCondition}</p>
                        </div>
                      )}
                    </>
                  )}

                  <p className="cr-verdict-foot">
                    Uso interno · El cliente solo recibe la decisión comercial.
                  </p>
                </div>

                <details className="cr-details-drawer">
                  <summary>Ficha comercial y entrega</summary>
                  <div className="cr-details-body">
                    <CommercialOrderCard
                      key={`${id}-${revision}`}
                      token={token}
                      me={me}
                      id={id}
                      hideConversation
                      onChanged={onChanged}
                    />
                  </div>
                </details>
              </aside>
            </div>
          ) : (
            <div className="cr-resolved-wrap">
              <div className="cr-resolved-banner">
                <strong>
                  {order.closedAt
                    ? 'La venta ya quedó cerrada.'
                    : 'Decisión registrada. El agente continuará con la elección del cliente y Ventas verá la ficha para el cierre.'}
                </strong>
                {detail.request?.reviewNote && (
                  <p>Nota registrada: “{detail.request.reviewNote}”</p>
                )}
              </div>

              <details className="cr-details-drawer" open>
                <summary>Ficha comercial y entrega</summary>
                <div className="cr-details-body">
                  <CommercialOrderCard
                    key={`${id}-${revision}`}
                    token={token}
                    me={me}
                    id={id}
                    hideConversation
                    onChanged={onChanged}
                  />
                </div>
              </details>
            </div>
          )}
        </>
      )}

      {showConvModal && (
        <FinancingConversationModal
          token={token}
          me={me}
          conversationId={order?.conversationId || detail.request?.conversationId}
          prospectId={order?.prospectId || detail.request?.prospectId}
          clientName={clientDisplayName}
          clientPhone={order?.client?.phone || detail.request?.client?.phone || ''}
          clientDni={order?.client?.dni || detail.request?.client?.dni || ''}
          business={order?.business || ''}
          productSummary={order?.productSummary || detail.request?.productSummary || ''}
          fallbackMessages={detail.messages}
          onClose={() => setShowConvModal(false)}
        />
      )}
    </section>
  );
}
