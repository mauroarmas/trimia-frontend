import {
  AGENT_META,
  STATUS_LABELS,
  buildConversationFeed,
  resolveMessageActor,
} from './conversationHelpers';
import { internalNoteText } from './internalNoteText';

function formatDateTime(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slugifyFilename(value) {
  const clean = String(value ?? 'chat')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return clean || 'chat';
}

function buildDateStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

export function downloadMarkdownFile(baseName, markdownContent) {
  const filename = `${slugifyFilename(baseName)}-${buildDateStamp()}.md`;
  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Construye el documento Markdown para conversaciones estándar de TrimIA
 * (Simulador de Chat, Chat con el Asistente, Panel del Supervisor, Casos Escalados,
 * Ventas y Aprobación de Financiación).
 */
export function buildConversationMarkdown({
  title = 'Conversación TrimIA',
  contactLabel,
  conversation,
  messages,
  optimisticMessages = [],
  me,
  extraMeta = [],
}) {
  const effectiveMessages = messages ?? conversation?.messages ?? [];
  const convObj = conversation
    ? { ...conversation, messages: effectiveMessages }
    : { messages: effectiveMessages };

  const feedItems = buildConversationFeed(convObj, me);

  const lines = [`# ${title}`, ''];

  const metaEntries = [];
  metaEntries.push(['Exportado', formatDateTime(new Date())]);

  const resolvedContact =
    contactLabel ||
    conversation?.client?.name ||
    conversation?.externalId ||
    null;
  if (resolvedContact) {
    metaEntries.push(['Contacto', resolvedContact]);
  }
  if (
    conversation?.externalId &&
    conversation?.client?.name &&
    conversation.externalId !== conversation.client.name
  ) {
    metaEntries.push(['Teléfono / ID', conversation.externalId]);
  }
  if (conversation?.userType) {
    metaEntries.push([
      'Perfil',
      conversation.userType === 'EMPLEADO' ? 'Empleado' : 'Cliente',
    ]);
  }
  if (conversation?.channel) {
    metaEntries.push([
      'Canal',
      conversation.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web',
    ]);
  }
  if (conversation?.currentAgent) {
    const areaName =
      AGENT_META[conversation.currentAgent]?.name ?? conversation.currentAgent;
    metaEntries.push(['Agente / Área', areaName]);
  }
  if (conversation?.status) {
    metaEntries.push([
      'Estado',
      STATUS_LABELS[conversation.status] ?? conversation.status,
    ]);
  }
  for (const [k, v] of extraMeta) {
    if (k && v) metaEntries.push([k, v]);
  }

  for (const [label, value] of metaEntries) {
    lines.push(`- **${label}:** ${value}`);
  }

  lines.push('', '---', '', '## Mensajes', '');

  if (feedItems.length === 0 && optimisticMessages.length === 0) {
    lines.push('_Sin mensajes registrados._', '');
  } else {
    for (const item of feedItems) {
      if (item.kind === 'milestone') {
        const when = formatDateTime(item.createdAt);
        lines.push(`> _${item.label}${when ? ` (${when})` : ''}_`, '');
        continue;
      }

      const { message: m, actor } = item;
      const authorLabel =
        m.role === 'USER' && contactLabel && actor.title === 'Cliente'
          ? contactLabel
          : actor.title;
      const when = formatDateTime(m.createdAt);
      lines.push(
        `### ${authorLabel}${when ? ` — _${when}_` : ''}`,
        '',
        (m.content ?? '').trim() || '_(mensaje vacío)_',
        '',
      );
    }

    for (const opt of optimisticMessages) {
      const when = formatDateTime(opt.createdAt);
      const authorLabel = contactLabel || 'Usuario';
      lines.push(
        `### ${authorLabel}${when ? ` — _${when} (enviando)_` : ''}`,
        '',
        (opt.content ?? '').trim(),
        '',
      );
    }
  }

  const notes = conversation?.internalNotes ?? [];
  if (notes.length > 0) {
    lines.push('---', '', '## Notas internas', '');
    for (const note of notes) {
      const author = note.authorAgentType
        ? `Agente IA (${AGENT_META[note.authorAgentType]?.name ?? note.authorAgentType})`
        : note.author?.name || note.authorName || 'Supervisor';
      const when = formatDateTime(note.createdAt);
      lines.push(
        `- **${author}**${when ? ` _(${when})_` : ''}: ${internalNoteText(note)}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Construye el Markdown para la vista multicanal de lectura (ContactTimelineModal).
 */
export function buildTimelineMarkdown({ data }) {
  const externalId = data?.contact?.externalId ?? 'Contacto';
  const empName = data?.contact?.employee?.name;
  const title = empName
    ? `Historial Multicanal — ${empName} (${externalId})`
    : `Historial Multicanal — ${externalId}`;

  const isEmployee = Boolean(data?.contact?.employee);
  const timeline = data?.timeline ?? [];

  const lines = [
    `# ${title}`,
    '',
    `- **Exportado:** ${formatDateTime(new Date())}`,
    `- **Contacto:** ${externalId}${empName ? ` (${empName})` : ''}`,
    `- **Perfil:** ${isEmployee ? 'Empleado' : 'Cliente'}`,
    `- **Hilos combinados:** ${data?.conversations?.length ?? 0}`,
    '',
    '---',
    '',
    '## Mensajes',
    '',
  ];

  if (timeline.length === 0) {
    lines.push('_Sin mensajes registrados._', '');
  } else {
    for (const m of timeline) {
      const fakeConv = {
        userType: isEmployee ? 'EMPLEADO' : 'CLIENTE',
        currentAgent: m.agentType,
      };
      const actor = resolveMessageActor(m, fakeConv, null);
      const channelLabel = m.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web';
      const when = formatDateTime(m.createdAt);
      lines.push(
        `### [${channelLabel}] ${actor.title}${when ? ` — _${when}_` : ''}`,
        '',
        (m.content ?? '').trim() || '_(mensaje vacío)_',
        '',
      );
    }
  }

  return lines.join('\n');
}

/**
 * Construye el Markdown para simulaciones pedagógicas de capacitación.
 */
export function buildTrainingSimulationMarkdown({
  title = 'Simulación de Capacitación',
  mode,
  customerName,
  scenarioTitle,
  employeeName,
  messages = [],
  goals = [],
  feedback = null,
}) {
  const lines = [`# ${title}`, ''];
  lines.push(`- **Exportado:** ${formatDateTime(new Date())}`);
  if (mode) {
    lines.push(
      `- **Modalidad:** ${mode === 'GUIDED' ? 'Práctica Guiada' : 'Simulación Libre'}`,
    );
  }
  if (employeeName) lines.push(`- **Empleado:** ${employeeName}`);
  if (customerName) lines.push(`- **Cliente simulado:** ${customerName}`);
  if (scenarioTitle) lines.push(`- **Caso:** ${scenarioTitle}`);

  lines.push('', '---', '', '## Conversación', '');

  if (messages.length === 0) {
    lines.push('_Sin mensajes registrados._', '');
  } else {
    for (const m of messages) {
      const isEmployee = m.sender === 'EMPLOYEE';
      const speaker = isEmployee
        ? employeeName
          ? `Empleado (${employeeName})`
          : 'Empleado'
        : `${customerName || 'Cliente Simulado (IA)'}${m.emotion ? ` [${m.emotion}]` : ''}`;
      const when = formatDateTime(m.createdAt);
      lines.push(
        `### ${speaker}${when ? ` — _${when}_` : ''}`,
        '',
        (m.content ?? '').trim() || '_(mensaje vacío)_',
        '',
      );
    }
  }

  if (goals.length > 0) {
    lines.push('---', '', '## Objetivos de la práctica', '');
    for (const g of goals) {
      const done = g.isCompleted !== undefined ? g.isCompleted : Boolean(g.isAchieved);
      lines.push(`- [${done ? 'x' : ' '}] ${g.description || g.objective || ''}`);
    }
    lines.push('');
  }

  if (feedback) {
    lines.push('---', '', '## Evaluación cualitativa', '');
    if (feedback.band) lines.push(`- **Banda global:** ${feedback.band}`);
    if (feedback.summary) lines.push('', feedback.summary, '');
    if (feedback.whatWentWell) {
      lines.push('### Qué salió bien', '', feedback.whatWentWell, '');
    }
    if (feedback.toImprove || feedback.whatToImprove) {
      lines.push(
        '### Aspectos a mejorar',
        '',
        feedback.toImprove || feedback.whatToImprove,
        '',
      );
    }
    if (feedback.businessRules || feedback.businessRulesCompliance) {
      lines.push(
        '### Reglas del negocio',
        '',
        feedback.businessRules || feedback.businessRulesCompliance,
        '',
      );
    }
  }

  return lines.join('\n');
}
