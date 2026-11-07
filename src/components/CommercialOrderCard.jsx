import { useCallback, useEffect, useState } from 'react';
import {
  getCommercialOrder,
  closeCommercialOrder,
  editCommercialOrder,
  getSalesStock,
  salesProspectAction,
} from '../api';
import ConversationControls from './ConversationControls';
import ConversationThread from './ConversationThread';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown } from '../chatExport';
import './commercialFlow.css';

export const commercialMoney = (value) =>
  Number(value ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
  });

export const commercialStage = (row) =>
  row.status === 'CANCELLED'
    ? 'Pedido cancelado'
    : row.closedAt
    ? 'Venta cerrada'
    : row.expired
    ? 'Vigencia vencida · Requiere renovación'
    : {
        REVIEW: 'En revisión de Administración',
        CHOOSING: 'Esperando elección y confirmación del cliente',
        READY: 'Listo para cerrar',
      }[row.flow.stage] ?? 'Pendiente';

export function commercialStageTone(row) {
  if (row.status === 'CANCELLED') return 'is-cancelled';
  if (row.closedAt) return 'is-closed';
  if (row.expired) return 'is-expired';
  if (row.flow?.stage === 'READY') return 'is-ready';
  if (row.flow?.stage === 'CHOOSING') return 'is-choosing';
  if (row.flow?.stage === 'REVIEW') return 'is-review';
  return 'is-pending';
}

export default function CommercialOrderCard({
  token,
  me,
  id,
  onChanged,
  onClose,
  children,
}) {
  const [order, setOrder] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [reference, setReference] = useState('');
  const [editing, setEditing] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const next = await getCommercialOrder(token, id);
    setOrder(next);
    if (next.prospectId && (me.isGeneralSupervisor || me.sectorName === 'Ventas')) {
      setConversation(
        await salesProspectAction(token, next.prospectId, 'conversation'),
      );
    }
  }, [token, id, me.isGeneralSupervisor, me.sectorName]);

  useEffect(() => {
    let active = true;
    refresh().catch((e) => {
      if (active) setError(e.message);
    });
    const interval = setInterval(() => refresh().catch(() => {}), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refresh]);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      setEditing(null);
      await refresh();
      await onChanged?.();
    } catch (e) {
      setError(e.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <section className="card commerce-loading-card">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <div className="sales-empty-box">
            <span className="fin-inline-spinner" aria-hidden="true" />
            <p>Cargando ficha comercial del pedido…</p>
          </div>
        )}
      </section>
    );
  }

  const flow = order.flow;
  const offer = flow.offers.find((o) => o.id === flow.selectedOfferId);
  const canClose = me.isGeneralSupervisor || me.sectorName === 'Ventas';
  const address =
    flow.deliveryMode === 'SHIPPING'
      ? flow.deliveryAddress || 'Falta dirección'
      : flow.deliveryMode === 'PICKUP'
      ? 'Retiro en sucursal'
      : 'A elegir por el cliente';

  async function beginEdit() {
    setError('');
    try {
      setCatalog(await getSalesStock(token));
      setEditing({
        sku: order.sku,
        offerId: flow.selectedOfferId || '',
        deliveryMode: flow.deliveryMode || 'PICKUP',
        deliveryAddress: flow.deliveryAddress || '',
        contactName: flow.contactName || order.client.name,
        contactPhone: flow.contactPhone || order.client.phone,
      });
    } catch (e) {
      setError(e.message);
    }
  }

  const main = (
    <section className="card commerce-operation">
      <header className="commerce-heading">
        <div className="commerce-heading-main">
          <div className="commerce-title-row">
            <h3>{order.client.name}</h3>
            <span className={`commerce-stage-pill ${commercialStageTone(order)}`}>
              {commercialStage(order)}
            </span>
          </div>
          <p className="commerce-subtitle">
            DNI {order.client.dni} · {order.business} ({order.locality})
          </p>
        </div>

        <div className="commerce-head-actions">
          {!order.closedAt && order.status !== 'CANCELLED' && canClose && !editing && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={beginEdit}
            >
              Modificar datos
            </button>
          )}
          {onClose && (
            <button type="button" className="secondary" onClick={onClose}>
              Cerrar ficha
            </button>
          )}
        </div>
      </header>

      <dl className="commerce-data">
        <div>
          <dt>DNI</dt>
          <dd>{order.client.dni}</dd>
        </div>
        <div>
          <dt>Contacto</dt>
          <dd>
            {flow.contactName || order.client.name} ·{' '}
            {flow.contactPhone || order.client.phone}
          </dd>
        </div>
        <div>
          <dt>Comercio</dt>
          <dd>{order.business}</dd>
        </div>
        <div>
          <dt>Localidad</dt>
          <dd>{order.locality}</dd>
        </div>
        <div className="commerce-wide is-highlight">
          <dt>Producto · 1 unidad</dt>
          <dd>{order.productSummary}</dd>
        </div>
        <div>
          <dt>Forma de pago elegida</dt>
          <dd>{offer?.label || 'Pendiente de elección'}</dd>
        </div>
        <div>
          <dt>Total del producto</dt>
          <dd className="commerce-price-val">
            {commercialMoney(offer?.total ?? order.amount)}
          </dd>
        </div>
        <div className="commerce-wide">
          <dt>Entrega</dt>
          <dd>{address}</dd>
        </div>
        {flow.deliveryMode === 'SHIPPING' && (
          <div>
            <dt>Envío, aparte al contado</dt>
            <dd>{commercialMoney(flow.shippingCost)}</dd>
          </div>
        )}
        <div>
          <dt>Vigente hasta</dt>
          <dd>
            {new Date(flow.expiresAt).toLocaleString('es-AR', {
              timeZone: 'America/Argentina/Tucuman',
              hour12: false,
            })}
          </dd>
        </div>
      </dl>

      {flow.reviewReason && (
        <div className="commerce-notice">
          <strong>Observación del flujo:</strong> {flow.reviewReason}
        </div>
      )}

      {offer?.modality === 'FINANCED' && (
        <section className="commerce-installments-box">
          <div className="commerce-installments-head">
            <h4>
              {order.financing
                ? 'Plan de cuotas registrado'
                : 'Plan de cuotas precargado'}
            </h4>
            <span className="commerce-quota-badge">
              {offer.quotaCount} cuotas semanales
            </span>
          </div>
          <p className="commerce-installments-meta">
            Primer vencimiento: <strong>{offer.firstDueDate}</strong> · Cobrador:{' '}
            <strong>{order.collector?.name || 'Asignado por Administración'}</strong>
          </p>
          <details className="commerce-schedule-details">
            <summary>Ver importes y vencimientos detallados</summary>
            <div className="commerce-schedule-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Importe</th>
                    <th>Vencimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: offer.quotaCount }, (_, i) => {
                    const cents = Math.round(Number(offer.total) * 100);
                    const base = Math.floor(cents / offer.quotaCount);
                    const amount =
                      (i === offer.quotaCount - 1
                        ? cents - base * (offer.quotaCount - 1)
                        : base) / 100;
                    const due = new Date(offer.firstDueDate + 'T15:00:00Z');
                    due.setUTCDate(due.getUTCDate() + i * 7);
                    return (
                      <tr key={i}>
                        <td>#{i + 1}</td>
                        <td>{commercialMoney(amount)}</td>
                        <td>{due.toLocaleDateString('es-AR')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const changes = Object.fromEntries(
              Object.entries(editing).filter(
                ([key, value]) =>
                  value &&
                  value !==
                    {
                      sku: order.sku,
                      offerId: flow.selectedOfferId,
                      deliveryMode: flow.deliveryMode,
                      deliveryAddress: flow.deliveryAddress,
                      contactName: flow.contactName || order.client.name,
                      contactPhone: flow.contactPhone || order.client.phone,
                    }[key],
              ),
            );
            run(() =>
              editCommercialOrder(token, id, {
                expectedVersion: order.version,
                ...changes,
              }),
            );
          }}
          className="commerce-form commerce-edit-box"
        >
          <div className="commerce-edit-head">
            <h4>Modificar condiciones o entrega</h4>
            <p className="commerce-notice">
              Los cambios deben comunicarse al cliente. Producto o plan vuelven a Administración; entrega o contacto requieren que el cliente acepte un resumen nuevo. El cierre quedará bloqueado hasta completar la validación.
            </p>
          </div>

          <div className="commerce-form-grid">
            <label>
              <span>Producto</span>
              <select
                value={editing.sku}
                onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
              >
                {catalog.map((item) => (
                  <option key={item.sku} value={item.sku}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Forma de pago</span>
              <select
                value={editing.offerId}
                onChange={(e) =>
                  setEditing({ ...editing, offerId: e.target.value })
                }
              >
                <option value="">Sin elección</option>
                {flow.offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Entrega</span>
              <select
                value={editing.deliveryMode}
                onChange={(e) =>
                  setEditing({ ...editing, deliveryMode: e.target.value })
                }
              >
                <option value="PICKUP">Retiro en sucursal</option>
                {order.delivery && <option value="SHIPPING">Envío a domicilio</option>}
              </select>
            </label>

            <label>
              <span>Nombre de contacto</span>
              <input
                required
                value={editing.contactName}
                onChange={(e) =>
                  setEditing({ ...editing, contactName: e.target.value })
                }
              />
            </label>

            <label className={editing.deliveryMode === 'SHIPPING' ? '' : 'commerce-wide'}>
              <span>Teléfono de contacto</span>
              <input
                required
                value={editing.contactPhone}
                onChange={(e) =>
                  setEditing({ ...editing, contactPhone: e.target.value })
                }
              />
            </label>

            {editing.deliveryMode === 'SHIPPING' && (
              <label className="commerce-wide">
                <span>Dirección de entrega</span>
                <textarea
                  required
                  value={editing.deliveryAddress}
                  onChange={(e) =>
                    setEditing({ ...editing, deliveryAddress: e.target.value })
                  }
                />
              </label>
            )}
          </div>

          <div className="commerce-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cambios y solicitar validación'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!order.closedAt && order.status !== 'CANCELLED' && canClose && !editing && (
        <form
          className="commerce-form commerce-close-box"
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              closeCommercialOrder(token, id, {
                expectedVersion: order.version,
                reference,
              }),
            );
          }}
        >
          <div className="commerce-close-head">
            <h4>Confirmación comercial del cierre</h4>
            <span
              className={`commerce-ready-tag ${
                flow.stage === 'READY' && !order.expired ? 'is-ready' : 'is-locked'
              }`}
            >
              {flow.stage === 'READY' && !order.expired
                ? 'Habilitado para cerrar'
                : 'Esperando validación previa'}
            </span>
          </div>

          <label>
            <span>Comprobante o constancia del cierre</span>
            <textarea
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              maxLength={2000}
              placeholder="Ej. Factura / remito acordado en Paljet, observaciones de entrega…"
            />
          </label>

          <div className="commerce-actions">
            <button
              type="submit"
              className="fin-btn-approve"
              disabled={
                busy ||
                flow.stage !== 'READY' ||
                order.expired ||
                !reference.trim()
              }
            >
              {busy
                ? 'Registrando…'
                : offer?.modality === 'FINANCED'
                ? 'Confirmar cierre y registrar cuotas'
                : 'Confirmar cierre de venta'}
            </button>
          </div>

          {flow.stage !== 'READY' && (
            <p className="commerce-inline-note is-warn">
              El cierre se habilita cuando Administración autoriza las condiciones y el cliente confirma su resumen.
            </p>
          )}
          <p className="commerce-inline-note">
            Esta acción registra la operación en TrimIA. No cobra ni emite una factura fiscal real.
          </p>
        </form>
      )}

      {order.closedAt && (
        <div className="commerce-success">
          <strong>Venta registrada</strong>
          {order.financing
            ? ` con ${order.financing.quotaCount} cuotas semanales.`
            : ' al contado.'}{' '}
          El cliente recibe un aviso en su hilo de prueba.
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {children}
    </section>
  );

  return (
    <div className={conversation ? 'commerce-workspace' : ''}>
      {main}
      {conversation && (
        <section className="card commerce-chat">
          <header className="commerce-chat-head">
            <div>
              <h3>Conversación con el cliente</h3>
              <p>Hilo comercial en vivo vinculado al pedido</p>
            </div>
            <ChatExportMenu
              filename={`pedido-${order.client.name || order.id}`}
              disabled={!conversation?.messages?.length}
              getMarkdown={() =>
                buildConversationMarkdown({
                  title: `Pedido comercial — ${order.client.name}`,
                  contactLabel: order.client.name,
                  conversation,
                  me,
                })
              }
            />
          </header>

          <ConversationThread conversation={conversation} me={me} autoScroll />

          <ConversationControls
            compact
            token={token}
            me={me}
            conversation={conversation}
            onRefresh={refresh}
            hideNotes
            actions={{
              takeover: () =>
                salesProspectAction(token, order.prospectId, 'takeover'),
              release: () =>
                salesProspectAction(token, order.prospectId, 'release'),
              reply: (_token, _id, message) =>
                salesProspectAction(token, order.prospectId, 'reply', message),
            }}
          />
        </section>
      )}
    </div>
  );
}
