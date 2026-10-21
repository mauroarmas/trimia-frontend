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
};

/**
 * `internal_note_added` duplica (sin el texto) lo que ya se ve como item
 * `type: internal_note` en el mismo feed, y `ROUTED_TO_AGENT` se loguea en
 * cada turno del orquestador — repite lo que ya se ve como par de mensajes
 * USER/ASSISTANT. Ninguno de los dos aporta algo que no esté ya visible por
 * otro item, así que se ocultan para que la línea de tiempo no quede
 * saturada de ruido técnico.
 */
const HIDDEN_EVENT_TYPES = new Set(['internal_note_added', 'ROUTED_TO_AGENT']);

/**
 * Color del punto en la línea de tiempo (Fig 7 del prototipo): gris para lo
 * automático de la IA, teal para acciones del cobrador, naranja para el
 * Cobrador Controlador, rojo para alertas. El prototipo deja el criterio
 * exacto a nuestro criterio — esta es la interpretación que usamos:
 *   - mensajes y notas de agentes IA -> gris
 *   - notas manuales y acciones del cobrador (aceptar/rechazar/manual/
 *     solicitar comprobante/tomar-liberar conversación) -> teal
 *   - verificación de impacto CONFIRMED -> naranja
 *   - verificación de impacto MISSING y escalamientos -> rojo (requieren
 *     atención)
 */
const DOT_COLORS = { gray: '#9ca3af', teal: '#0d9488', orange: '#06d9cc', red: '#2690dc' };

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
]);

const IA_EVENT_TYPES = new Set([
  'agent_handoff',
  'payment_proof_received',
  'quota_reminder_sent',
  'reminder_cycle_blocked',
]);

function describeActivity(item) {
  if (item.type === 'message') {
    const actor = item.role === 'USER' ? 'Cliente' : `Asistente${item.agentType ? ` (${AGENT_LABELS[item.agentType] ?? item.agentType})` : ''}`;
    return { dot: 'gray', actor, text: item.content || '(mensaje sin texto)' };
  }

  if (item.type === 'internal_note') {
    if (item.authorAgentType) {
      return {
        dot: 'gray',
        actor: `${AGENT_LABELS[item.authorAgentType] ?? item.authorAgentType} (IA)`,
        text: item.content,
      };
    }
    return { dot: 'teal', actor: item.author?.name ?? 'Empleado', text: item.content };
  }

  // type === 'event'
  if (item.eventType === 'payment_impact_verified') {
    const missing = item.payload?.impactStatus === 'MISSING';
    return {
      dot: missing ? 'red' : 'orange',
      actor: 'Cobrador Controlador',
      text: missing
        ? 'El pago no impactó en la cuenta — se notificó al cobrador responsable.'
        : 'Se confirmó que el pago impactó en la cuenta de la empresa.',
    };
  }
  if (item.eventType === 'escalation_created') {
    return { dot: 'red', actor: 'Sistema', text: EVENT_TYPE_LABELS[item.eventType] };
  }
  if (COLLECTOR_EVENT_TYPES.has(item.eventType)) {
    return { dot: 'teal', actor: 'Cobrador', text: EVENT_TYPE_LABELS[item.eventType] ?? item.eventType };
  }
  if (IA_EVENT_TYPES.has(item.eventType)) {
    return { dot: 'gray', actor: 'Asistente IA', text: EVENT_TYPE_LABELS[item.eventType] ?? item.eventType };
  }
  return { dot: 'gray', actor: 'Sistema', text: EVENT_TYPE_LABELS[item.eventType] ?? item.eventType };
}

function groupByClient(items) {
  const order = [];
  const groups = {};
  for (const item of items) {
    const key = item.clientId ?? 'sin-cliente';
    if (!groups[key]) {
      groups[key] = { clientId: item.clientId, clientName: item.clientName ?? 'Cliente', items: [] };
      order.push(key);
    }
    groups[key].items.push(item);
  }
  return order.map((k) => groups[k]);
}

/**
 * "Registro de Actividad" (Fig 7 del prototipo): vista cruzada sobre todos
 * los clientes en el alcance del empleado, con filtros y paginación —
 * distinta de CollectionsPanel's "Historial" (que es de a un cliente).
 *
 * Se reusa tal cual para "Recordatorios Enviados" (otro ítem del sidebar del
 * prototipo) pasando `fixedEventType="quota_reminder_sent"`: es el mismo
 * endpoint con ?eventType=quota_reminder_sent, así que no hace falta
 * duplicar la lógica de carga/paginación en un componente aparte.
 */
export default function ActivityFeed({ token, clients, collectors, isController, fixedEventType }) {
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

  const visible = data.filter((item) => !(item.type === 'event' && HIDDEN_EVENT_TYPES.has(item.eventType)));
  const groups = groupByClient(visible);

  function toggleGroup(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{fixedEventType ? 'Recordatorios Enviados' : 'Registro de Actividad'}</h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {isController && (
          <select value={collectorId} onChange={(e) => setCollectorId(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los cobradores</option>
            {collectors.map((col) => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
        )}

        {!fixedEventType && (
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todo tipo de actividad</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}

        <input type="date" value={after} onChange={(e) => setAfter(e.target.value)} style={{ width: 'auto' }} />
        <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>a</span>
        <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando...</p>}

      {!loading && groups.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Sin actividad para estos filtros.
        </div>
      )}

      {groups.map((g) => {
        const key = g.clientId ?? 'sin-cliente';
        const isCollapsed = collapsed.has(key);
        return (
          <div key={key} style={{ marginBottom: 12 }}>
            <button
              className="secondary"
              onClick={() => toggleGroup(key)}
              style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}
            >
              {isCollapsed ? '▸' : '▾'} {g.clientName} ({g.items.length})
            </button>
            {!isCollapsed && (
              <ul className="activity-timeline">
                {g.items.map((item) => {
                  const d = describeActivity(item);
                  return (
                    <li key={item.id} className="activity-item">
                      <span className="activity-dot" style={{ background: DOT_COLORS[d.dot] }} />
                      <div className="activity-bubble">
                        <div className="note-author">
                          {d.actor} · {new Date(item.createdAt).toLocaleString()}
                        </div>
                        {d.text}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {total > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button className="secondary" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            Anterior
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Página {page} · {total} resultado{total === 1 ? '' : 's'}
          </span>
          <button className="secondary" disabled={!hasMore || loading} onClick={() => load(page + 1)}>
            Siguiente
          </button>
        </div>
      )}

      <div className="hint" style={{ marginTop: 12 }}>
        <b>Leyenda:</b>{' '}
        <span style={{ color: DOT_COLORS.gray }}>●</span> Automático (IA) &nbsp;
        <span style={{ color: DOT_COLORS.teal }}>●</span> Acción del cobrador &nbsp;
        <span style={{ color: DOT_COLORS.orange }}>●</span> Cobrador Controlador &nbsp;
        <span style={{ color: DOT_COLORS.red }}>●</span> Alerta / notificación
      </div>
    </div>
  );
}