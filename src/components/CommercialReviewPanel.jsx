import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getCommercialOrder,
  getCommercialOffers,
  reviewCommercialOrder,
  renewCommercialOrder,
  editCommercialOrder,
  closeCommercialOrder,
  getSalesStock,
  listCollectors,
  salesProspectAction,
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

function PencilIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  );
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

  // Estado para cierre de venta integrado en pantalla principal
  const [conversationState, setConversationState] = useState(null);
  const [closeReference, setCloseReference] = useState('');
  const [customerMessage, setCustomerMessage] = useState(null);

  // Modales
  const [showConvModal, setShowConvModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [editCatalog, setEditCatalog] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const id = detail.request.id;
  const busy = Boolean(busyAction);
  const canClose = Boolean(me?.isGeneralSupervisor || me?.sectorName === 'Ventas');

  useEffect(() => {
    setCustomerMessage(null);
    setCloseReference('');
  }, [id]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getCommercialOrder(token, id),
      getCommercialOffers(token, id),
      listCollectors(token),
    ])
      .then(async ([row, choices, people]) => {
        if (!active) return;
        setOrder(row);
        setOffers(choices);
        setCollectors(people);
        setCollectorId((prev) => prev || row.client.assignedCollectorId || '');
        if (canClose && row.prospectId) {
          try {
            const conv = await salesProspectAction(token, row.prospectId, 'conversation');
            if (active) setConversationState(conv);
          } catch {
            // ignorar si el rol no tiene acceso al hilo comercial
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, id, detail.request.version, revision, canClose]);

  // Cerrar modales con Escape
  useEffect(() => {
    if (!showOrderModal && !editDraft) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        if (editDraft) setEditDraft(null);
        else if (showOrderModal) setShowOrderModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showOrderModal, editDraft, busy]);

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

  async function openEditModal() {
    if (!order) return;
    setEditError('');
    setEditLoading(true);
    setEditDraft({
      sku: order.sku || '',
      offerId: order.flow.selectedOfferId || '',
      deliveryMode: order.flow.deliveryMode || 'PICKUP',
      deliveryAddress: order.flow.deliveryAddress || '',
      contactName: order.flow.contactName || order.client.name || '',
      contactPhone: order.flow.contactPhone || order.client.phone || '',
    });
    try {
      const items = await getSalesStock(token).catch(() => []);
      setEditCatalog(Array.isArray(items) ? items : []);
    } finally {
      setEditLoading(false);
    }
  }

  async function submitEditModal(e) {
    e.preventDefault();
    if (!order || !editDraft) return;
    const baseline = {
      sku: order.sku || '',
      offerId: order.flow.selectedOfferId || '',
      deliveryMode: order.flow.deliveryMode || 'PICKUP',
      deliveryAddress: order.flow.deliveryAddress || '',
      contactName: order.flow.contactName || order.client.name || '',
      contactPhone: order.flow.contactPhone || order.client.phone || '',
    };
    const changes = Object.fromEntries(
      Object.entries(editDraft).filter(
        ([key, value]) => value && value !== baseline[key],
      ),
    );
    if (Object.keys(changes).length === 0) {
      setEditDraft(null);
      return;
    }

    setBusyAction('EDIT');
    setEditError('');
    try {
      await editCommercialOrder(token, id, {
        expectedVersion: order.version,
        ...changes,
      });
      setEditDraft(null);
      setRevision((v) => v + 1);
      await onChanged();
      setNotice('Datos del pedido actualizados correctamente.');
    } catch (err) {
      setEditError(err.message || 'No se pudieron guardar los cambios.');
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

  const canEditOrder =
    Boolean(order) && !order.closedAt && order.status !== 'CANCELLED';

  const remainingHours = useMemo(() => {
    if (!order?.flow?.expiresAt) return null;
    const diffMs = new Date(order.flow.expiresAt).getTime() - Date.now();
    return diffMs / (1000 * 60 * 60);
  }, [order?.flow?.expiresAt]);

  const showRenewalBanner =
    Boolean(order) &&
    order.flow.stage === 'REVIEW' &&
    (order.expired || (remainingHours !== null && remainingHours <= 6));

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

  // Datos y estado del cierre de venta
  const otherOwner =
    conversationState?.status === 'HUMAN_HANDLING' &&
    conversationState.handledById !== me.id;
  const myControl =
    conversationState?.status === 'HUMAN_HANDLING' &&
    conversationState.handledById === me.id;
  const finalMessage = customerMessage ?? order?.suggestedClosingMessage ?? '';
  const isReadyToClose = Boolean(order && order.flow.stage === 'READY' && !order.expired);
  const closingNotice = order?.closingNotice;
  const closingNoticeText = !closingNotice
    ? 'Aviso aún no registrado.'
    : {
        PENDING: 'Aviso pendiente de envío.',
        SENDING: 'Enviando aviso al cliente…',
        ACCEPTED:
          closingNotice.transportMode === 'simulated'
            ? 'Aviso registrado en el chat de prueba.'
            : 'Aviso aceptado para envío. Aún no hay confirmación de entrega.',
        DELIVERED: 'Entrega del aviso confirmada.',
        FAILED:
          'El aviso no pudo enviarse. Revisá la conversación para contactar al cliente.',
        UNCERTAIN:
          'No se pudo confirmar el envío. Revisá el chat antes de reenviar para evitar duplicados.',
      }[closingNotice.status] ?? 'Consultando estado del aviso.';

  const selectedOffer = order?.flow?.offers?.find(
    (o) => o.id === order.flow.selectedOfferId,
  );

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
      {/* Cabecera limpia */}
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
          {canEditOrder && (
            <button
              type="button"
              className="cr-btn-icon"
              onClick={openEditModal}
              disabled={busy}
              title="Modificar producto, entrega o contacto"
              aria-label="Modificar datos del pedido"
            >
              <PencilIcon />
            </button>
          )}

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
          {/* Franja compacta del producto */}
          <div className="cr-summary-strip">
            <div className="cr-summary-item cr-summary-product">
              <span className="cr-summary-label">Producto solicitado</span>
              <strong title={order.productSummary}>{order.productSummary}</strong>
              <small>1 unidad{order.sku ? ` · SKU ${order.sku}` : ''}</small>
            </div>

            <div className="cr-summary-item">
              <span className="cr-summary-label">Entrega</span>
              <strong>
                {order.flow.deliveryMode === 'SHIPPING'
                  ? `Envío (${commercialMoney(order.flow.shippingCost ?? order.delivery?.cost)})`
                  : order.flow.deliveryMode === 'PICKUP'
                    ? 'Retiro en sucursal'
                    : order.delivery
                      ? `Envío (${commercialMoney(order.delivery.cost)})`
                      : 'Retiro en sucursal'}
              </strong>
              <small>{order.flow.deliveryAddress || order.locality || 'A confirmar'}</small>
            </div>

            <div className="cr-summary-item cr-summary-price">
              <span className="cr-summary-label">
                {selectedOffer ? selectedOffer.label : 'Precio de lista'}
              </span>
              <strong>{commercialMoney(selectedOffer?.total ?? order.amount)}</strong>
              <small>
                {selectedOffer ? 'Opción elegida por el cliente' : 'Referencia del catálogo'}
              </small>
            </div>
          </div>

          {meaningfulReviewReason && (
            <div className="cr-inline-alert">
              <strong>Motivo de revisión:</strong> {meaningfulReviewReason}
            </div>
          )}

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

          {/* Workbench unificado en 2 columnas para todas las etapas */}
          <div className="cr-workbench">
            {/* Columna Principal: Aprobación de ofertas + Cierre de venta */}
            <div className="cr-main-col">
              {order.flow.stage === 'REVIEW' ? (
                !order.expired ? (
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
                )
              ) : (
                <section className="cr-progress-card">
                  {/* Progreso del circuito en 3 pasos */}
                  <ol className="cr-stepper" aria-label="Estado del circuito">
                    <li className="is-done">
                      <span className="cr-stepper-dot">✓</span>
                      <span>Revisión aprobada</span>
                    </li>
                    <li
                      className={
                        order.closedAt || order.flow.stage === 'READY'
                          ? 'is-done'
                          : 'is-current'
                      }
                    >
                      <span className="cr-stepper-dot">
                        {order.closedAt || order.flow.stage === 'READY' ? '✓' : '2'}
                      </span>
                      <span>Confirmación del cliente</span>
                    </li>
                    <li
                      className={
                        order.closedAt
                          ? 'is-done'
                          : order.flow.stage === 'READY'
                            ? 'is-current'
                            : ''
                      }
                    >
                      <span className="cr-stepper-dot">
                        {order.closedAt ? '✓' : '3'}
                      </span>
                      <span>Cierre de venta</span>
                    </li>
                  </ol>

                  <div className="cr-resolved-copy">
                    <strong>
                      {order.closedAt
                        ? 'Venta registrada y cerrada'
                        : order.flow.stage === 'READY'
                          ? 'El cliente confirmó el resumen. Ya podés registrar el cierre abajo.'
                          : 'Esperando elección y confirmación del cliente en el chat'}
                    </strong>
                    {detail.request?.reviewNote && (
                      <p>Nota de Administración: “{detail.request.reviewNote}”</p>
                    )}
                  </div>

                  {Array.isArray(order.flow.offers) && order.flow.offers.length > 0 && (
                    <div className="cr-enabled-offers">
                      <span className="cr-enabled-label">
                        Ofertas habilitadas ({order.flow.offers.length})
                      </span>
                      <div className="cr-enabled-grid">
                        {order.flow.offers.map((o) => {
                          const isPicked = o.id === order.flow.selectedOfferId;
                          const isFin = o.modality === 'FINANCED';
                          const perQuota = isFin
                            ? quotaAmountPreview(o.total, o.quotaCount)
                            : null;
                          return (
                            <div
                              key={o.id}
                              className={`cr-enabled-item${isPicked ? ' is-picked' : ''}`}
                            >
                              <div className="cr-enabled-top">
                                <strong>{o.label}</strong>
                                {isPicked && (
                                  <span className="cr-picked-tag">Elegida</span>
                                )}
                              </div>
                              <div className="cr-enabled-price">
                                {isFin && perQuota
                                  ? `${perQuota} / sem`
                                  : commercialMoney(o.total)}
                              </div>
                              <small>
                                {isFin
                                  ? `Total ${commercialMoney(o.total)}${o.firstDueDate ? ` · 1er vto ${o.firstDueDate}` : ''}`
                                  : 'Pago único contado'}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {order.flow.stage === 'CHOOSING' && !order.closedAt && (
                    <div className="cr-next-step-bar">
                      <span>
                        Cuando el cliente confirme su resumen en el chat, acá se habilitará el formulario de cierre.
                      </span>
                      <button
                        type="button"
                        className="cr-text-btn"
                        onClick={() => setShowConvModal(true)}
                      >
                        Ver chat →
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Último paso: Cierre de venta y aviso al cliente integrado en pantalla principal */}
              {order.closedAt ? (
                <section className="cr-closed-card">
                  <div className="cr-closed-head">
                    <strong>✓ Venta registrada</strong>
                    <span className="cr-step-badge is-done">Cerrada</span>
                  </div>
                  <p>
                    {order.financing
                      ? `Plan de ${order.financing.quotaCount} cuotas semanales cargado en la cartera de ${order.collector?.name || 'su cobrador asignado'}.`
                      : 'Operación registrada al contado.'}
                  </p>
                  <p
                    className={`cr-closed-notice${
                      ['FAILED', 'UNCERTAIN'].includes(closingNotice?.status)
                        ? ' is-warn'
                        : ''
                    }`}
                    role="status"
                  >
                    {closingNoticeText}
                  </p>
                </section>
              ) : (
                order.status !== 'CANCELLED' &&
                canClose &&
                isReadyToClose && (
                  <form
                    className="cr-close-card is-ready"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(
                        'CLOSE',
                        () =>
                          closeCommercialOrder(token, id, {
                            expectedVersion: order.version,
                            reference: closeReference,
                            customerMessage: finalMessage,
                          }),
                        'Venta cerrada y registrada correctamente.',
                      );
                    }}
                  >
                    <div className="cr-close-head">
                      <div>
                        <h4>Último paso: cerrar y avisar al cliente</h4>
                        <p>
                          Al confirmar se registra la venta y, si corresponde, las cuotas del cobrador asignado.
                        </p>
                      </div>
                      <span
                        className={`cr-step-badge ${
                          isReadyToClose ? 'is-ready' : 'is-locked'
                        }`}
                      >
                        {isReadyToClose
                          ? 'Listo para cerrar'
                          : 'Esperando validación previa'}
                      </span>
                    </div>

                    {myControl && (
                      <div className="cr-close-info">
                        Tenés el control del chat. Se liberará automáticamente al cerrar.
                      </div>
                    )}
                    {otherOwner && (
                      <div className="cr-close-warn">
                        Otra persona está atendiendo este chat. Debe liberar el control antes del cierre.
                      </div>
                    )}

                    <label className="cr-field">
                      <span>Mensaje final al cliente</span>
                      <textarea
                        value={finalMessage}
                        onChange={(e) => setCustomerMessage(e.target.value)}
                        required
                        maxLength={4000}
                        rows={4}
                        disabled={!isReadyToClose || busy}
                        placeholder="Confirmale cómo continúa su compra…"
                      />
                    </label>

                    <label className="cr-field">
                      <span>Constancia interna del cierre</span>
                      <textarea
                        value={closeReference}
                        onChange={(e) => setCloseReference(e.target.value)}
                        required
                        maxLength={2000}
                        rows={2}
                        disabled={!isReadyToClose || busy}
                        placeholder="Ej. Factura / remito acordado en Paljet, observaciones de entrega…"
                      />
                    </label>

                    <div className="cr-close-foot">
                      <button
                        type="submit"
                        className="cr-btn-approve"
                        disabled={
                          busy ||
                          !isReadyToClose ||
                          !closeReference.trim() ||
                          !finalMessage.trim() ||
                          otherOwner
                        }
                      >
                        {busyAction === 'CLOSE'
                          ? 'Registrando…'
                          : 'Cerrar venta y enviar aviso'}
                      </button>

                      <span className="cr-close-footnote">
                        {isReadyToClose
                          ? 'Registra la operación en TrimIA sin emitir factura fiscal.'
                          : 'Se habilita cuando Administración autoriza y el cliente confirma su resumen.'}
                      </span>
                    </div>
                  </form>
                )
              )}
            </div>

            {/* Columna Lateral: Evaluación crediticia + Botón de Ficha modal */}
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

              <button
                type="button"
                className="cr-sheet-trigger"
                onClick={() => setShowOrderModal(true)}
              >
                <span className="cr-sheet-trigger-icon">
                  <SheetIcon />
                </span>
                <span className="cr-sheet-trigger-copy">
                  <strong>Ficha comercial y entrega</strong>
                  <small>Ver cliente, entrega y cronograma de cuotas</small>
                </span>
                <span className="cr-sheet-trigger-arrow" aria-hidden="true">→</span>
              </button>
            </aside>
          </div>
        </>
      )}

      {/* Modal 1: Ficha comercial y entrega (solo lectura de ficha, entrega y cuotas; sin modificar ni cerrar) */}
      {showOrderModal && order &&
        createPortal(
          <div
            className="cr-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowOrderModal(false);
            }}
          >
            <div
              className="cr-modal cr-modal-lg"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cr-sheet-modal-title"
            >
              <header className="cr-modal-header">
                <div>
                  <div className="cr-title-row">
                    <h3 id="cr-sheet-modal-title">Ficha comercial y entrega</h3>
                    <span className={`commerce-stage-pill ${commercialStageTone(order)}`}>
                      {commercialStage(order)}
                    </span>
                  </div>
                  <p className="cr-modal-sub">
                    {order.client.name} · {order.business || 'Compra personal'} ({order.locality || 'Sin localidad'})
                  </p>
                </div>
                <button
                  type="button"
                  className="cr-modal-close"
                  onClick={() => setShowOrderModal(false)}
                  aria-label="Cerrar ficha"
                >
                  ×
                </button>
              </header>

              <div className="cr-modal-body">
                <CommercialOrderCard
                  key={`${id}-${revision}`}
                  token={token}
                  me={me}
                  id={id}
                  hideConversation
                  hideEdit
                  hideHeader
                  hideClose
                  onChanged={onChanged}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal 2: Modificar datos del pedido (disparado desde el lapicito) */}
      {editDraft && order &&
        createPortal(
          <div
            className="cr-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !busy) setEditDraft(null);
            }}
          >
            <div
              className="cr-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cr-edit-modal-title"
            >
              <header className="cr-modal-header">
                <div>
                  <h3 id="cr-edit-modal-title">Modificar datos del pedido</h3>
                  <p className="cr-modal-sub">
                    Cambiar producto o plan solicita una nueva revisión; cambiar entrega o contacto pide nueva aceptación al cliente.
                  </p>
                </div>
                <button
                  type="button"
                  className="cr-modal-close"
                  disabled={busy}
                  onClick={() => setEditDraft(null)}
                  aria-label="Cerrar edición"
                >
                  ×
                </button>
              </header>

              <form className="cr-modal-form" onSubmit={submitEditModal}>
                <div className="cr-modal-body">
                  {editError && (
                    <div className="cr-feedback is-error" role="alert">
                      <span>{editError}</span>
                    </div>
                  )}

                  <div className="cr-edit-grid">
                    <label className="cr-field cr-edit-full">
                      <span>Producto</span>
                      {editCatalog.length > 0 ? (
                        <select
                          value={editDraft.sku}
                          disabled={editLoading || busy}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, sku: e.target.value })
                          }
                        >
                          {editCatalog.map((item) => (
                            <option key={item.sku} value={item.sku}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={order.productSummary}
                          disabled
                        />
                      )}
                    </label>

                    {order.flow.offers.length > 0 && (
                      <label className="cr-field">
                        <span>Forma de pago</span>
                        <select
                          value={editDraft.offerId}
                          disabled={busy}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, offerId: e.target.value })
                          }
                        >
                          <option value="">Sin elección</option>
                          {order.flow.offers.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className={`cr-field${order.flow.offers.length === 0 ? ' cr-edit-full' : ''}`}>
                      <span>Modalidad de entrega</span>
                      <select
                        value={editDraft.deliveryMode}
                        disabled={busy}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, deliveryMode: e.target.value })
                        }
                      >
                        <option value="PICKUP">Retiro en sucursal</option>
                        {order.delivery && (
                          <option value="SHIPPING">Envío a domicilio</option>
                        )}
                      </select>
                    </label>

                    <label className="cr-field">
                      <span>Nombre de contacto</span>
                      <input
                        required
                        disabled={busy}
                        value={editDraft.contactName}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, contactName: e.target.value })
                        }
                      />
                    </label>

                    <label className="cr-field">
                      <span>Teléfono de contacto</span>
                      <input
                        required
                        disabled={busy}
                        value={editDraft.contactPhone}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, contactPhone: e.target.value })
                        }
                      />
                    </label>

                    {editDraft.deliveryMode === 'SHIPPING' && (
                      <label className="cr-field cr-edit-full">
                        <span>Dirección de entrega</span>
                        <textarea
                          required
                          rows={2}
                          disabled={busy}
                          value={editDraft.deliveryAddress}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              deliveryAddress: e.target.value,
                            })
                          }
                          placeholder="Calle, altura y referencias…"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <footer className="cr-modal-footer">
                  <button
                    type="button"
                    className="cr-btn-ghost"
                    disabled={busy}
                    onClick={() => setEditDraft(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="cr-btn-primary"
                    disabled={busy}
                  >
                    {busyAction === 'EDIT' ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </footer>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal 3: Conversación con el cliente */}
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
