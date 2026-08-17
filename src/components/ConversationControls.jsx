import { useState } from 'react';
import {
  takeoverConversation,
  releaseConversation,
  replyManually,
  addInternalNote,
} from '../api';
import { statusBadgeClass } from '../statusBadge';

const AGENT_LABELS = {
  ORCHESTRATOR: 'Orquestador',
  SALES: 'Ventas',
  COLLECTIONS: 'Cobranzas',
  LOGISTICS: 'Logística',
  DEPOSITS: 'Depósito',
  ADMIN: 'Administración',
};

const AGENT_COLORS = {
  ORCHESTRATOR: '#6b7280',
  SALES: '#2563eb',
  COLLECTIONS: '#d97706',
  LOGISTICS: '#059669',
  DEPOSITS: '#7c3aed',
  ADMIN: '#dc2626',
};

// Paleta para personas: color estable por nombre (hash simple), no por id,
// para que la misma persona se vea igual en toda la sesión sin pedirle
// nada extra al backend.
const PERSON_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/**
 * Autor de una InternalNote: o un Employee (author) o un agente de IA
 * (authorAgentType) — nunca ambos, ver InternalNote en schema.prisma.
 */
function noteAuthor(note) {
  if (note.authorAgentType) {
    return {
      isAgent: true,
      label: AGENT_LABELS[note.authorAgentType] ?? note.authorAgentType,
      color: AGENT_COLORS[note.authorAgentType] ?? '#6b7280',
      avatar: '🤖',
    };
  }
  const name = note.author?.name ?? 'Empleado';
  return { isAgent: false, label: name, color: colorForName(name), avatar: initials(name) };
}

export default function ConversationControls({ token, conversation, me, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');

  const iHoldControl =
    conversation.status === 'HUMAN_HANDLING' && conversation.handledById === me.id;
  const someoneElseHoldsControl =
    conversation.status === 'HUMAN_HANDLING' && conversation.handledById !== me.id;
  const canTakeOver = conversation.status !== 'CLOSED' && !someoneElseHoldsControl;

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleTakeover() {
    run(() => takeoverConversation(token, conversation.id));
  }

  function handleRelease() {
    run(() => releaseConversation(token, conversation.id));
  }

  function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim()) return;
    run(async () => {
      await replyManually(token, conversation.id, replyText);
      setReplyText('');
    });
  }

  function handleNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    run(async () => {
      await addInternalNote(token, conversation.id, noteText);
      setNoteText('');
    });
  }

  return (
    <div className="panel-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className={statusBadgeClass(conversation.status)}>{conversation.status}</span>
        {conversation.status === 'HUMAN_HANDLING' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {iHoldControl ? 'lo tenés tomado vos' : `tomado por otro supervisor (${conversation.handledById})`}
            {conversation.handledAt && ` · desde ${new Date(conversation.handledAt).toLocaleTimeString()}`}
          </span>
        )}
      </div>

      {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {!iHoldControl && (
          <button disabled={busy || !canTakeOver} onClick={handleTakeover}>
            Tomar control
          </button>
        )}
        {iHoldControl && (
          <button className="secondary" disabled={busy} onClick={handleRelease}>
            Liberar control
          </button>
        )}
      </div>

      {iHoldControl && (
        <form onSubmit={handleReply} style={{ marginBottom: 12 }}>
          <div className="field">
            <label>Responder manualmente al cliente</label>
            <textarea
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Este mensaje se envía al usuario por WhatsApp/WEB"
            />
          </div>
          <button type="submit" disabled={busy}>Enviar respuesta</button>
        </form>
      )}

      <h4 style={{ marginBottom: 6 }}>Notas internas ({conversation.internalNotes?.length ?? 0})</h4>
      <ul className="notes-list">
        {(conversation.internalNotes ?? []).map((n) => {
          const author = noteAuthor(n);
          return (
            <li key={n.id} className="note-item">
              <div className="note-avatar" style={{ background: author.color }} title={author.label}>
                {author.avatar}
              </div>
              <div className="note-bubble">
                <div className="note-author">{author.label}{author.isAgent && ' (IA)'}</div>
                {n.content}
                <div className="msg-time">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            </li>
          );
        })}
        {(conversation.internalNotes ?? []).length === 0 && (
          <li style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin notas.</li>
        )}
      </ul>
      <form onSubmit={handleNote}>
        <div className="field-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Nota interna (nunca visible para el cliente)"
            />
          </div>
          <button type="submit" disabled={busy} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>Agregar</button>
        </div>
      </form>
    </div>
  );
}
