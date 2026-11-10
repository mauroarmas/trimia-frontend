export const AGENT_META = {
  SALES: {
    name: 'Ventas',
    subtitle: 'Catálogo, precios y financiación',
    accent: '#2563eb',
    bgSoft: '#eff6ff',
    borderSoft: '#bfdbfe',
  },
  COLLECTIONS: {
    name: 'Cobranzas',
    subtitle: 'Cuotas, pagos y comprobantes',
    accent: '#0d9488',
    bgSoft: '#f0fdfa',
    borderSoft: '#99f6e4',
  },
  ADMIN: {
    name: 'Administración',
    subtitle: 'Políticas y evaluación crediticia',
    accent: '#7c3aed',
    bgSoft: '#f5f3ff',
    borderSoft: '#ddd6fe',
  },
  LOGISTICS: {
    name: 'Logística',
    subtitle: 'Envíos, entregas y reparto',
    accent: '#d97706',
    bgSoft: '#fffbeb',
    borderSoft: '#fde68a',
  },
  DEPOSITS: {
    name: 'Depósito',
    subtitle: 'Inventario físico y despacho',
    accent: '#0284c7',
    bgSoft: '#f0f9ff',
    borderSoft: '#bae6fd',
  },
  ORCHESTRATOR: {
    name: 'Recepción',
    subtitle: 'Clasificación inicial',
    accent: '#475569',
    bgSoft: '#f8fafc',
    borderSoft: '#e2e8f0',
  },
};

export const STATUS_LABELS = {
  ACTIVE: 'Activa (IA)',
  WAITING_HUMAN: 'Esperando humano',
  HUMAN_HANDLING: 'Control manual',
  CLOSED: 'Cerrada',
};

export function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Sin actividad';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Hace instantes';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function contactInitials(label) {
  if (!label) return 'C';
  const letters = label.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s]/g, '').trim();
  if (letters) {
    return letters
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
  return label.slice(-2).toUpperCase();
}

/**
 * Limpia prefijos técnicos redundantes como `[COLLECTIONS]` o `[SALES]` del
 * motivo de escalamiento y traduce puntajes decimales (`0.64`) a porcentaje.
 */
export function formatEscalationReason(rawReason) {
  if (!rawReason) return 'Derivación a atención humana';
  let cleaned = String(rawReason)
    .replace(/\s*\[(SALES|COLLECTIONS|ADMIN|LOGISTICS|DEPOSITS|ORCHESTRATOR)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lowConfMatch = cleaned.match(/^confianza insuficiente\s*\(([\d.]+)\)$/i);
  if (lowConfMatch) {
    const num = Number(lowConfMatch[1]);
    if (Number.isFinite(num)) {
      const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
      return `Confianza insuficiente en la respuesta (${pct}%)`;
    }
  }

  if (cleaned.length > 0) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  return cleaned || rawReason;
}

export function resolveMessageActor(m, conversation, me) {
  const isUser = m.role === 'USER';
  if (isUser) {
    const isEmployee =
      conversation?.userType === 'EMPLEADO' || Boolean(conversation?.employee);
    if (isEmployee) {
      const empName = conversation?.employee?.name || 'Empleado';
      const empSector = conversation?.employee?.sector?.name;
      return {
        actorType: 'EMPLOYEE',
        title: empName,
        badge: empSector
          ? `Personal interno · Área de ${empSector}`
          : 'Personal interno',
        accent: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
        side: 'left',
      };
    }
    return {
      actorType: 'CLIENT',
      title: conversation?.client?.name || 'Cliente',
      badge: 'Cliente',
      accent: '#0284c7',
      bg: '#f0f9ff',
      border: '#bae6fd',
      side: 'left',
    };
  }

  const events = conversation?.events ?? [];
  const msgTime = new Date(m.createdAt).getTime();

  const explicitManualEvent = events.find(
    (ev) =>
      ev.eventType === 'conversation_manual_reply' &&
      ev.payload?.messageId === m.id,
  );

  let inTakeoverWindow = false;
  let takeoverOpenAt = null;
  for (const ev of events) {
    const evTime = new Date(ev.createdAt).getTime();
    if (ev.eventType === 'conversation_takeover') {
      takeoverOpenAt = evTime;
    } else if (ev.eventType === 'conversation_release' && takeoverOpenAt != null) {
      if (msgTime >= takeoverOpenAt - 1000 && msgTime <= evTime + 1000) {
        inTakeoverWindow = true;
      }
      takeoverOpenAt = null;
    }
  }
  if (takeoverOpenAt != null && msgTime >= takeoverOpenAt - 1000) {
    inTakeoverWindow = true;
  }

  const inCurrentHandling =
    conversation?.status === 'HUMAN_HANDLING' &&
    conversation?.handledAt &&
    msgTime >= new Date(conversation.handledAt).getTime() - 1000;

  if (explicitManualEvent || inTakeoverWindow || inCurrentHandling) {
    const supName =
      conversation?.handledBy?.name ||
      (conversation?.handledById && conversation?.handledById === me?.id ? me?.name : null);
    return {
      actorType: 'SUPERVISOR',
      title: supName ? `Supervisor · ${supName}` : 'Supervisor',
      badge: 'Intervención humana',
      accent: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
      side: 'right',
    };
  }

  const areaKey = m.agentType || conversation?.currentAgent;
  const areaMeta = areaKey ? AGENT_META[areaKey] : null;
  const isEmployeeConv =
    conversation?.userType === 'EMPLEADO' || Boolean(conversation?.employee);
  return {
    actorType: 'AGENT',
    title: areaMeta
      ? isEmployeeConv
        ? `Agente IA · Tema: ${areaMeta.name}`
        : `Agente IA · ${areaMeta.name}`
      : 'Agente IA',
    badge: 'Respuesta IA',
    accent: areaMeta?.accent ?? '#2563eb',
    bg: areaMeta?.bgSoft ?? '#eff6ff',
    border: areaMeta?.borderSoft ?? '#bfdbfe',
    side: 'right',
  };
}

export function buildConversationFeed(conversation, me) {
  const items = [];
  for (const m of conversation?.messages ?? []) {
    items.push({
      kind: 'message',
      id: `msg-${m.id}`,
      time: new Date(m.createdAt).getTime(),
      createdAt: m.createdAt,
      message: m,
      actor: resolveMessageActor(m, conversation, me),
    });
  }

  for (const ev of conversation?.events ?? []) {
    if (ev.eventType === 'ESCALATED') {
      items.push({
        kind: 'milestone',
        id: `ev-${ev.id}`,
        time: new Date(ev.createdAt).getTime(),
        createdAt: ev.createdAt,
        variant: 'escalated',
        label: 'El Agente IA derivó la conversación a un supervisor',
      });
    } else if (ev.eventType === 'conversation_takeover') {
      items.push({
        kind: 'milestone',
        id: `ev-${ev.id}`,
        time: new Date(ev.createdAt).getTime(),
        createdAt: ev.createdAt,
        variant: 'takeover',
        label: 'Un supervisor intervino y tomó el control manual',
      });
    } else if (ev.eventType === 'conversation_release') {
      items.push({
        kind: 'milestone',
        id: `ev-${ev.id}`,
        time: new Date(ev.createdAt).getTime(),
        createdAt: ev.createdAt,
        variant: 'release',
        label: 'Control liberado · La atención volvió al Agente IA',
      });
    }
  }

  return items.sort((a, b) => a.time - b.time);
}

