import { useEffect, useState } from 'react';
import { listActivity } from '../api';

const AGENT_LABELS = {
  ORCHESTRATOR: 'Orquestador',
  SALES: 'Ventas',
  COLLECTIONS: 'Cobranzas',
  LOGISTICS: 'Logística',
  DEPOSITS: 'Depósito',
  ADMIN: 'Administración',
};

/**
 * Traducción de eventType a una línea legible, para no mostrarle al usuario
 * el nombre técnico del evento tal cual lo guarda OrchestrationEvent.
 */
const EVENT_TYPE_LABELS = {
  agent_handoff: 'La IA derivó la conversación a otro agente.',
  conversation_release: 'Se liberó el control manual de la conversación.',
  conversation_takeover: 'Se tomó el control manual de la conversación.',
  conversation_manual_reply: 'Un responsable envió una respuesta manual al cliente.',
  escalation_created: 'El caso fue escalado a un supervisor.',
  escalation_delegated: 'El caso escalado fue delegado a otro supervisor.',
  escalation_resolved: 'El caso escalado fue resuelto.',
  payment_proof_accepted: 'Se aceptó el comprobante de pago.',
  payment_proof_manual_handling: 'El comprobante pasó a manejo manual.',
  payment_proof_received: 'Se recibió un comprobante de pago por WhatsApp.',
  payment_proof_rejected: 'Se rechazó el comprobante de pago.',
  proof_requested: 'Se solicitó el comprobante de pago al cliente.',
  quota_marked_manual: 'La cuota se marcó como gestionada manualmente.',
  quota_reminder_sent: 'Se envió un recordatorio de cuota al cliente.',
  reminder_cycle_blocked: 'El ciclo de recordatorios está bloqueado (plantilla no aprobada).',
  FINANCING_CUSTOMER_SELECTION: 'El cliente eligió su opción de pago y modalidad de entrega.',
  FINANCING_CUSTOMER_ACCEPTED: 'El cliente confirmó el resumen final de su compra financiada.',
  FINANCING_SALE_CLOSED: 'Se registró el cierre de la venta financiada y el plan de cuotas.',
  FINANCING_NOTICE_ACCEPTED: 'Aviso de financiación enviado y aceptado por el canal.',
  FINANCING_NOTICE_DELIVERED: 'Entrega del aviso de financiación confirmada.',
  FINANCING_NOTICE_FAILED: 'Falló el envío del aviso de financiación.',
  FINANCING_NOTICE_UNCERTAIN: 'Estado del aviso de financiación incierto (requiere verificación).',
  FINANCING_NOTICE_RETRY: 'Se solicitó el reintento del aviso de financiación.',
  FINANCING_SUBMITTED: 'Solicitud de financiación presentada para revisión de Administración.',
  FINANCING_EVALUATED: 'Se completó la verificación crediticia automática de la solicitud.',
  FINANCING_DECIDED: 'Administración registró la resolución de la solicitud de financiación.',
  FINANCING_PLAN_CREATED: 'Se generó el cronograma de cuotas semanales del cliente.',
  FINANCING_DRAFT_UPDATED: 'El asistente actualizó los datos de la solicitud de financiación.',
  FINANCING_DRAFT_CORRECTED: 'Se corrigieron y confirmaron los datos de la solicitud.',
};

/**
 * Se ocultan eventos internos redundantes que duplican mensajes o notificaciones
 * ya visibles en la misma línea de tiempo.
 */
const HIDDEN_EVENT_TYPES = new Set([
  'internal_note_added',
  'ROUTED_TO_AGENT',
  'FINANCING_NOTICE_CLAIMED',
  'conversation_manual_reply',
]);

const DOT_COLORS = {
  gray: '#64748b',
  teal: '#0d9488',
  orange: '#d97706',
  red: '#e11d48',
  blue: '#2563eb',
};

const COLLECTOR_EVENT_TYPES = new Set([
  'payment_proof_accepted',
  'payment_proof_rejected',
  'payment_proof_manual_handling',
  'quota_marked_manual',
  'proof_requested',
  'conversation_takeover',
  'conversation_release',
  'escalation_delegated',
  'escalation_resolved',
  'FINANCING_SALE_CLOSED',
  'FINANCING_DECIDED',
  'FINANCING_DRAFT_CORRECTED',
]);

const IA_EVENT_TYPES = new Set([
  'agent_handoff',
  'payment_proof_received',
  'quota_reminder_sent',
  'reminder_cycle_blocked',
  'FINANCING_CUSTOMER_SELECTION',
  'FINANCING_CUSTOMER_ACCEPTED',
  'FINANCING_NOTICE_ACCEPTED',
  'FINANCING_NOTICE_DELIVERED',
  'FINANCING_SUBMITTED',
  'FINANCING_EVALUATED',
  'FINANCING_PLAN_CREATED',
  'FINANCING_DRAFT_UPDATED',
]);

function humanizeFallbackEvent(eventType) {
  if (!eventType) return 'Actividad registrada en el sistema.';
  return String(eventType)
    .replace(/^FINANCING_/i, 'Financiación: ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function describeActivity(item) {
  if (item.type === 'message') {
    const isUser = item.role === 'USER';
    const actor = isUser
      ? 'Cliente'
      : `Asistente${item.agentType ? ` (${AGENT_LABELS[item.agentType] ?? item.agentType})` : ''}`;
    return {
      dot: isUser ? 'blue' : 'gray',
      tone: isUser ? 'is-client' : 'is-ai',
      actor,
      text: item.content || '(mensaje sin texto)',
    };
  }

  if (item.type === 'internal_note') {
    if (item.authorAgentType) {
      return {
        dot: 'gray',
        tone: 'is-ai',
        actor: `${AGENT_LABELS[item.authorAgentType] ?? item.authorAgentType} (IA)`,
        text: item.content,
      };
    }
    return {
      dot: 'teal',
      tone: 'is-staff',
      actor: item.author?.name ?? 'Empleado',
      text: item.content,
    };
  }

  // type === 'event'
  if (item.eventType === 'payment_impact_verified') {
    const missing = item.payload?.impactStatus === 'MISSING';
    return {
      dot: missing ? 'red' : 'orange',
      tone: missing ? 'is-alert' : 'is-controller',
      actor: 'Cobrador Controlador',
      text: missing
        ? 'El pago no impactó en la cuenta — se notificó al cobrador responsable.'
        : 'Se confirmó que el pago impactó en la cuenta de la empresa.',
    };
  }
  if (
    item.eventType === 'escalation_created' ||
    item.eventType === 'FINANCING_NOTICE_FAILED' ||
    item.eventType === 'FINANCING_NOTICE_UNCERTAIN'
  ) {
    return {
      dot: 'red',
      tone: 'is-alert',
      actor: 'Alerta del Sistema',
      text: EVENT_TYPE_LABELS[item.eventType] ?? humanizeFallbackEvent(item.eventType),
    };
  }
  if (COLLECTOR_EVENT_TYPES.has(item.eventType)) {
    return {
      dot: 'teal',
      tone: 'is-staff',
      actor: item.eventType.startsWith('FINANCING_') ? 'Gestión Comercial' : 'Cobrador',
      text: EVENT_TYPE_LABELS[item.eventType] ?? humanizeFallbackEvent(item.eventType),
    };
  }
  if (IA_EVENT_TYPES.has(item.eventType)) {
    return {
      dot: 'gray',
      tone: 'is-ai',
      actor: 'Asistente IA',
      text: EVENT_TYPE_LABELS[item.eventType] ?? humanizeFallbackEvent(item.eventType),
    };
  }
  return {
    dot: 'gray',
    tone: 'is-system',
    actor: 'Sistema',
    text: EVENT_TYPE_LABELS[item.eventType] ?? humanizeFallbackEvent(item.eventType),
  };
}

function groupByClient(items) {
  const order = [];
  const groups = {};
  for (const item of items) {
    const key = item.clientId ?? 'sin-cliente';
    if (!groups[key]) {
      groups[key] = {
        clientId: item.clientId,
        clientName: item.clientName ?? 'Cliente',
        items: [],
      };
      order.push(key);
    }
    groups[key].items.push(item);
  }
  return order.map((k) => groups[k]);
}

function getClientInitials(name) {
  const parts = String(name || 'CL')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || 'CL').slice(0, 2).toUpperCase();
}

export default function ActivityFeed({
  token,
  clients,
  collectors,
  isController,
  fixedEventType,
}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());

  const [clientId, setClientId] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [eventType, setEventType] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');

  const limit = 20;

  async function load(pageArg) {
    setLoading(true);
    setError('');
    try {
      const params = { page: pageArg, limit };
      if (clientId) params.clientId = clientId;
      if (isController && collectorId) params.collectorId = collectorId;
      const et = fixedEventType ?? eventType;
      if (et) params.eventType = et;
      if (after) params.after = new Date(`${after}T00:00:00`).toISOString();
      if (before) params.before = new Date(`${before}T23:59:59`).toISOString();

      const res = await listActivity(token, params);
      setData(res.data);
      setTotal(res.total);
      setPage(res.page);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, collectorId, eventType, after, before, fixedEventType]);

  const visible = data.filter(
    (item) => !(item.type === 'event' && HIDDEN_EVENT_TYPES.has(item.eventType)),
  );
  const groups = groupByClient(visible);

  function toggleGroup(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasActiveFilters = Boolean(clientId || collectorId || eventType || after || before);

  return (
    <div className="card activity-feed-card" style={{ marginTop: 12 }}>
      <div className="collection-section-heading">
        <div>
          <h3>{fixedEventType ? 'Recordatorios Enviados' : 'Registro de Actividad'}</h3>
          <p>
            Historial cronológico unificado de mensajes, avisos automáticos y acciones sobre tu cartera de clientes.
          </p>
        </div>
        {total > 0 && (
          <span className="activity-count-badge">
            {total} {total === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </div>

      <div className="collection-toolbar activity-feed-toolbar">
        <label>
          <span>Cliente</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {isController && (
          <label>
            <span>Cobrador asignado</span>
            <select value={collectorId} onChange={(e) => setCollectorId(e.target.value)}>
              <option value="">Todos los cobradores</option>
              {collectors.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!fixedEventType && (
          <label className="activity-filter-grow">
            <span>Tipo de evento</span>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">Todo tipo de actividad</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span>Desde</span>
          <input type="date" value={after} onChange={(e) => setAfter(e.target.value)} />
        </label>

        <label>
          <span>Hasta</span>
          <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            className="secondary activity-clear-btn"
            onClick={() => {
              setClientId('');
              setCollectorId('');
              setEventType('');
              setAfter('');
              setBefore('');
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && (
        <div className="activity-empty-state">
          <span className="fin-inline-spinner" aria-hidden="true" />
          <span>Consultando actividad reciente…</span>
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="activity-empty-state">
          <strong>Sin actividad registrada para estos filtros</strong>
          <p>Probá cambiando el rango de fechas o seleccionando otro cliente de la cartera.</p>
        </div>
      )}

      <div className="activity-groups">
        {groups.map((g) => {
          const key = g.clientId ?? 'sin-cliente';
          const isCollapsed = collapsed.has(key);
          return (
            <section key={key} className="activity-client-group">
              <button
                type="button"
                className={`activity-group-header${isCollapsed ? ' is-collapsed' : ''}`}
                onClick={() => toggleGroup(key)}
                aria-expanded={!isCollapsed}
              >
                <div className="activity-group-identity">
                  <span className="activity-group-avatar" aria-hidden="true">
                    {getClientInitials(g.clientName)}
                  </span>
                  <span className="activity-group-name">{g.clientName}</span>
                  <span className="activity-group-count">
                    {g.items.length} {g.items.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
                <span className="activity-group-chevron" aria-hidden="true">
                  {isCollapsed ? '▸ Mostrar' : '▾ Ocultar'}
                </span>
              </button>

              {!isCollapsed && (
                <ul className="activity-timeline">
                  {g.items.map((item) => {
                    const d = describeActivity(item);
                    return (
                      <li key={item.id} className={`activity-item ${d.tone || ''}`}>
                        <span
                          className="activity-dot"
                          style={{ background: DOT_COLORS[d.dot] || DOT_COLORS.gray }}
                          aria-hidden="true"
                        />
                        <div className="activity-bubble">
                          <div className="activity-meta-row">
                            <span className={`activity-actor-pill ${d.tone || ''}`}>
                              {d.actor}
                            </span>
                            <time className="activity-timestamp">
                              {new Date(item.createdAt).toLocaleString('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                          <div className="activity-text">{d.text}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {total > 0 && (
        <div className="activity-pagination-bar">
          <div className="activity-legend">
            <strong>Leyenda:</strong>
            <span>
              <i style={{ background: DOT_COLORS.gray }} /> Automático (IA)
            </span>
            <span>
              <i style={{ background: DOT_COLORS.blue }} /> Mensaje del cliente
            </span>
            <span>
              <i style={{ background: DOT_COLORS.teal }} /> Gestión humana
            </span>
            <span>
              <i style={{ background: DOT_COLORS.orange }} /> Verificación bancaria
            </span>
            <span>
              <i style={{ background: DOT_COLORS.red }} /> Alerta / escalado
            </span>
          </div>

          <div className="activity-pagination-controls">
            <button
              type="button"
              className="secondary"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              ← Anterior
            </button>
            <span className="activity-page-indicator">
              Página <strong>{page}</strong> · {total} resultado{total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={!hasMore || loading}
              onClick={() => load(page + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
