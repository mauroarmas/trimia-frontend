import { useEffect, useState } from 'react';
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
    label: 'Requiere revisar condiciones',
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

function formatArDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Tucuman',
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [showConvModal, setShowConvModal] = useState(false);

  const id = detail.request.id;

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
        setCollectorId(row.client.assignedCollectorId || '');
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, id, detail.request.version, revision]);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      setEnabled([]);
      setNote('');
      setRevision((v) => v + 1);
      await onChanged();
    } catch (e) {
      setError(e.message);
      setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  const financed = enabled.some(
    (key) => offers.find((o) => o.id === key)?.modality === 'FINANCED',
  );
  const assessment = detail.assessments.at(-1);
  const isEvaluationReady = detail.request.evaluationState === 'READY';
  const verdictInfo = VERDICT_META[assessment?.verdict] ?? {
    label: isEvaluationReady ? 'Evaluada' : 'En proceso',
    tone: 'is-pending',
  };

  const clientDisplayName =
    order?.client?.name ||
    detail.request?.inputSnapshot?.name ||
    detail.request?.client?.name ||
    'Cliente';

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
    <section className="card financing-detail fin-detail-card commerce-review-card commerce-fullscreen-card">
      <header className="fin-detail-header commerce-heading">
        <div className="fin-detail-identity">
          <div className="fin-detail-avatar" aria-hidden="true">
            {contactInitials(clientDisplayName)}
          </div>
          <div>
            <div className="fin-detail-title-row">
              <h3>Revisión del pedido</h3>
              {order && (
                <>
                  <span
                    className={`commerce-stage-pill ${commercialStageTone(order)}`}
                  >
                    {commercialStage(order)}
                  </span>
                  <span className="fin-version-tag">
                    Versión #{order.version}
                  </span>
                  <span
                    className={`commerce-validity-pill ${
                      order.expired ? 'is-expired' : 'is-valid'
                    }`}
                  >
                    {order.expired ? 'Vigencia vencida' : 'Vigencia activa (48 h)'}
                  </span>
                </>
              )}
            </div>
            {order ? (
              <p className="fin-detail-sub">
                Vigencia: {formatArDateTime(order.flow.startedAt)} a{' '}
                {formatArDateTime(order.flow.expiresAt)}.
              </p>
            ) : (
              <p className="fin-detail-sub">
                Consultando información comercial del pedido…
              </p>
            )}
          </div>
        </div>

        <div className="commerce-head-actions">
          <button
            type="button"
            className="btn-pill-action commerce-conv-btn"
            onClick={() => setShowConvModal(true)}
          >
            <span>💬 Conversación con el cliente</span>
            {msgCount > 0 && (
              <span className="commerce-conv-count">{msgCount}</span>
            )}
          </button>

          <button type="button" className="secondary" onClick={onClose}>
            ← Volver a solicitudes
          </button>
        </div>
      </header>

      {!order && !error && (
        <div className="fin-empty-box">
          <span className="fin-spinner-md" aria-hidden="true" />
          <p>Cargando datos del pedido y ofertas del catálogo…</p>
        </div>
      )}

      {order && (
        <>
          {/* Resumen estructurado en tarjetas */}
          <div className="fin-summary-grid commerce-review-summary">
            <div className="fin-summary-box">
              <span>Cliente y documento</span>
              <strong title={order.client.name}>{order.client.name}</strong>
              <small className="commerce-summary-sub">
                DNI {order.client.dni}
                {order.client.phone ? ` · ${order.client.phone}` : ''}
              </small>
            </div>

            <div className="fin-summary-box">
              <span>Comercio y localidad</span>
              <strong title={order.business}>
                {order.business || 'Sin especificar'}
              </strong>
              <small className="commerce-summary-sub">
                {order.locality || 'Sin localidad'}
                {order.delivery
                  ? ` · Envío ${commercialMoney(order.delivery.cost)}`
                  : ' · Retiro en sucursal'}
              </small>
            </div>

            <div className="fin-summary-box">
              <span>Producto solicitado</span>
              <strong title={order.productSummary}>{order.productSummary}</strong>
              <small className="commerce-summary-sub">
                Una unidad{order.sku ? ` · SKU ${order.sku}` : ''}
              </small>
            </div>

            <div className="fin-summary-box is-highlight">
              <span>Importe de referencia</span>
              <strong>{commercialMoney(order.amount)}</strong>
              <small className="commerce-summary-sub">
                Precio base del catálogo
              </small>
            </div>
          </div>

          {order.flow.reviewReason && (
            <div className="commerce-notice commerce-review-alert">
              <strong>Motivo de revisión:</strong> {order.flow.reviewReason}
            </div>
          )}

          {order.flow.stage === 'REVIEW' && (
            <>
              {/* Bloque de Evaluación preliminar simulada */}
              <div className="fin-section-block">
                <div className="fin-section-head">
                  <h4>Evaluación crediticia y comercial</h4>
                  <span className="commerce-internal-badge">
                    Uso interno de Administración
                  </span>
                </div>

                <div className={`fin-verdict-card ${verdictInfo.tone}`}>
                  <div className="fin-verdict-top">
                    <div className="fin-verdict-badges">
                      <span className={`fin-pill ${verdictInfo.tone}`}>
                        <strong>Evaluación preliminar simulada:</strong>{' '}
                        {verdictInfo.label}
                      </span>
                      <span className="fin-source-tag">Fuente: Simulada</span>
                      {assessment?.requestVersion != null && (
                        <span className="fin-source-tag">
                          Versión #{assessment.requestVersion}
                        </span>
                      )}
                    </div>
                    {assessment?.createdAt && (
                      <time className="fin-verdict-time">
                        {formatArDateTime(assessment.createdAt)}
                      </time>
                    )}
                  </div>

                  {assessment?.reason && (
                    <p className="fin-verdict-reason">{assessment.reason}</p>
                  )}

                  {assessment?.commercialCondition && (
                    <div className="fin-verdict-condition">
                      <strong>Condición sugerida:</strong>{' '}
                      {assessment.commercialCondition}
                    </div>
                  )}

                  <p className="commerce-verdict-privacy">
                    Información interna. El agente comunicará únicamente el
                    resultado comercial y las opciones habilitadas.
                  </p>
                </div>
              </div>

              {/* Bloque de renovación cuando venció o requiere revalidación */}
              {(order.expired || order.flow.reviewReason) && (
                <div className="commerce-renewal-box">
                  <div className="commerce-renewal-copy">
                    <strong>
                      {order.expired
                        ? 'La vigencia de 48 horas del pedido está vencida'
                        : 'Actualización de vigencia y condiciones disponible'}
                    </strong>
                    <p className="commerce-inline-note">
                      La renovación conserva el pedido y obliga a revisar la
                      evaluación y obtener una aceptación nueva del cliente.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={order.expired ? 'fin-btn-approve' : 'secondary'}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        renewCommercialOrder(token, id, {
                          expectedVersion: order.version,
                        }),
                      )
                    }
                  >
                    {busy
                      ? 'Renovando…'
                      : '↻ Renovar datos y evaluación por 48 horas'}
                  </button>
                </div>
              )}

              {/* Formulario de habilitación de ofertas y resolución */}
              {!order.expired && (
                <form
                  className="commerce-form commerce-review-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(() =>
                      reviewCommercialOrder(token, id, {
                        expectedVersion: order.version,
                        decision: 'APPROVED',
                        offerIds: enabled,
                        ...(financed ? { collectorId, firstDueDate } : {}),
                        note,
                      }),
                    );
                  }}
                >
                  {/* Selección de ofertas del catálogo */}
                  <div className="commerce-offers-section">
                    <div className="commerce-offers-header">
                      <div>
                        <h4>Ofertas del catálogo mock</h4>
                        <p className="commerce-offers-subtitle">
                          Marcá las alternativas de pago que querés habilitar para
                          este cliente.
                        </p>
                      </div>
                      {offers.length > 0 && (
                        <div className="commerce-offers-controls">
                          <span className="commerce-offers-count">
                            {enabled.length} de {offers.length} seleccionadas
                          </span>
                          <button
                            type="button"
                            className="secondary fin-btn-sm"
                            onClick={selectAllOffers}
                          >
                            {enabled.length === offers.length
                              ? 'Desmarcar todas'
                              : 'Seleccionar todas'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="commerce-offers">
                      {offers.map((o) => {
                        const isChecked = enabled.includes(o.id);
                        const isFinancedOffer = o.modality === 'FINANCED';
                        const perQuota = isFinancedOffer
                          ? quotaAmountPreview(o.total, o.quotaCount)
                          : null;
                        const cashSavings =
                          !isFinancedOffer &&
                          Number(order.amount) > Number(o.total)
                            ? Number(order.amount) - Number(o.total)
                            : 0;

                        return (
                          <label
                            key={o.id}
                            className={`commerce-offer${
                              isChecked ? ' is-selected' : ''
                            }${isFinancedOffer ? ' is-financed' : ' is-cash'}`}
                          >
                            <div className="commerce-offer-top">
                              <span className="commerce-offer-check-wrap">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    toggleOffer(o.id, e.target.checked)
                                  }
                                />
                                <span className="commerce-offer-title">
                                  {o.label}
                                </span>
                              </span>

                              <span
                                className={`commerce-offer-badge ${
                                  isFinancedOffer ? 'is-financed' : 'is-cash'
                                }`}
                              >
                                {isFinancedOffer
                                  ? `${o.quotaCount} cuotas`
                                  : 'Pago contado'}
                              </span>
                            </div>

                            <div className="commerce-offer-body">
                              <div className="commerce-offer-price-main">
                                {isFinancedOffer && perQuota ? (
                                  <>
                                    <strong>{perQuota}</strong>
                                    <span>/ semana</span>
                                  </>
                                ) : (
                                  <strong>{commercialMoney(o.total)}</strong>
                                )}
                              </div>

                              <p className="commerce-offer-desc">
                                {o.label} · Total {commercialMoney(o.total)}
                                {isFinancedOffer
                                  ? ' · Semanal, sin cargos adicionales en esta demo'
                                  : ''}
                              </p>

                              {cashSavings > 0 && (
                                <span className="commerce-offer-saving">
                                  Bonificación contado:{' '}
                                  {commercialMoney(cashSavings)} vs. precio de
                                  lista
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configuración adicional si hay oferta financiada seleccionada */}
                  {financed && (
                    <div className="commerce-financed-box">
                      <div className="commerce-financed-head">
                        <h5>Condiciones operativas del plan en cuotas</h5>
                        <span>
                          Requerido al habilitar ofertas con financiación semanal
                        </span>
                      </div>

                      <div className="commerce-form-grid">
                        <label className="commerce-field">
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
                          {order.client.assignedCollectorId && (
                            <small className="commerce-field-hint">
                              Preseleccionado según la cartera actual del cliente.
                            </small>
                          )}
                        </label>

                        <label className="commerce-field">
                          <div className="commerce-field-label-row">
                            <span>Primer vencimiento</span>
                            <div className="commerce-date-shortcuts">
                              <button
                                type="button"
                                className="commerce-date-pill"
                                onClick={() => setFirstDueDate(addDaysIso(7))}
                              >
                                +7 días
                              </button>
                              <button
                                type="button"
                                className="commerce-date-pill"
                                onClick={() => setFirstDueDate(addDaysIso(14))}
                              >
                                +14 días
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
                          <small className="commerce-field-hint">
                            Las cuotas siguientes vencerán cada 7 días a partir de
                            esta fecha.
                          </small>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Nota interna y botones de decisión */}
                  <div className="fin-decision-box commerce-decision-box">
                    <div className="fin-decision-head">
                      <h4>Resolución de Administración</h4>
                      <span className="fin-note-requirement">
                        {!isEvaluationReady
                          ? 'Esperando evaluación crediticia…'
                          : !note.trim()
                          ? 'Nota interna obligatoria para registrar la decisión'
                          : !enabled.length
                          ? 'Seleccioná al menos una oferta para aprobar, o rechazá la financiación'
                          : 'Listo para confirmar decisión'}
                      </span>
                    </div>

                    <label className="fin-note-field commerce-note-field">
                      <span>Nota interna de revisión</span>
                      <textarea
                        required
                        rows={3}
                        value={note}
                        maxLength={2000}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Dejá constancia de tu decisión…"
                      />
                    </label>

                    <div className="commerce-actions fin-decision-actions">
                      <button
                        type="submit"
                        className="fin-btn-approve"
                        disabled={!canSubmitApprove}
                      >
                        {busy
                          ? 'Procesando…'
                          : 'Aprobar y habilitar ofertas'}
                      </button>

                      <button
                        type="button"
                        className="secondary fin-btn-reject"
                        disabled={!canSubmitReject}
                        onClick={() =>
                          run(() =>
                            reviewCommercialOrder(token, id, {
                              expectedVersion: order.version,
                              decision: 'REJECTED',
                              offerIds: enabled.filter((key) => key === 'cash'),
                              note,
                            }),
                          )
                        }
                      >
                        Rechazar financiación
                        {enabled.includes('cash') ? ' y ofrecer contado' : ''}
                      </button>

                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setShowConvModal(true)}
                      >
                        💬 Ver conversación e interactuar
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}

          {order.flow.stage !== 'REVIEW' && (
            <div className="fin-resolution-summary commerce-resolution-banner">
              <strong>
                {order.closedAt
                  ? 'La venta ya quedó cerrada.'
                  : 'La decisión está registrada. El agente continuará con la elección y confirmación del cliente; Ventas verá la ficha para el cierre.'}
              </strong>
              {detail.request?.reviewNote && (
                <p className="fin-resolution-note">
                  Nota registrada: “{detail.request.reviewNote}”
                </p>
              )}
            </div>
          )}

          <details className="commerce-details-drawer">
            <summary className="commerce-details-summary">
              <span>Ver ficha comercial y datos de entrega</span>
              <small>
                Condiciones elegidas, modalidad de entrega y cronograma de cuotas
              </small>
            </summary>
            <div className="commerce-details-body">
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

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
