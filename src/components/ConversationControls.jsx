import { internalNoteText } from '../internalNoteText';
import { useState } from 'react';
import {
  takeoverConversation,
  releaseConversation,
  replyManually,
  addInternalNote,
} from '../api';
import { statusBadgeClass } from '../statusBadge';

const AGENT_LABELS = {
  ORCHESTRATOR: 'Recepción',
  SALES: 'Ventas',
  COLLECTIONS: 'Cobranzas',
  LOGISTICS: 'Logística',
  DEPOSITS: 'Depósito',
  ADMIN: 'Administración',
};

const AGENT_COLORS = {
  ORCHESTRATOR: '#64748b',
  SALES: '#2563eb',
  COLLECTIONS: '#0d9488',
  LOGISTICS: '#d97706',
  DEPOSITS: '#0284c7',
  ADMIN: '#7c3aed',
};

const STATUS_NAMES = {
  ACTIVE: 'Activa (IA)',
  WAITING_HUMAN: 'Esperando humano',
  HUMAN_HANDLING: 'Control manual',
  CLOSED: 'Cerrada',
};

// Paleta para personas: color estable por nombre (hash simple), no por id,
// para que la misma persona se vea igual en toda la sesión sin pedirle
// nada extra al backend.
const PERSON_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#0284c7', '#4f46e5', '#0891b2'];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

function initials(name) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || 'S'
  );
}

/**
 * Autor de una InternalNote: o un Employee (author) o un agente de IA
 * (authorAgentType) — nunca ambos, ver InternalNote en schema.prisma.
 */
function noteAuthor(note) {
  if (note.authorAgentType) {
    return {
      isAgent: true,
      label: `Agente IA · ${AGENT_LABELS[note.authorAgentType] ?? note.authorAgentType}`,
      color: AGENT_COLORS[note.authorAgentType] ?? '#64748b',
      initials: 'IA',
    };
  }
  const name = note.author?.name ?? 'Supervisor';
  return {
    isAgent: false,
    label: name,
    color: colorForName(name),
    initials: initials(name),
  };
}

export default function ConversationControls({
  token,
  conversation,
  me,
  onRefresh,
  hideReplyAndNotes = false,
  hideNotes = false,
  actions,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  /**
   * ¿Se le contestó algo desde que se tomó el control?
   *
   * Al escalar, al cliente se le prometió que un responsable le iba a contestar. Si
   * el control se libera sin haber respondido, esa promesa queda colgada y **el
   * cliente no se entera de nada**: la conversación vuelve a manos del asistente en
   * silencio. Por WhatsApp no hay ningún cartel de estado — lo único que tiene es lo
   * que se le escribió.
   */
  const [respondio, setRespondio] = useState(false);

  const iHoldControl =
    conversation.status === 'HUMAN_HANDLING' && conversation.handledById === me?.id;
  const someoneElseHoldsControl =
    conversation.status === 'HUMAN_HANDLING' && conversation.handledById !== me?.id;
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
    setRespondio(false);
    run(() => (actions?.takeover ?? takeoverConversation)(token, conversation.id));
  }

  function handleRelease() {
    // Avisar, no impedir: puede haberse resuelto por teléfono o en el local, y en
    // ese caso liberar sin escribir nada es lo correcto. Lo que no puede pasar es
    // que se libere sin darse cuenta.
    if (
      !respondio &&
      !confirm(
        'Vas a liberar el control sin haberle respondido nada.\n\n' +
          'Cuando el caso se escaló se le dijo que un responsable le iba a ' +
          'contestar. Si liberás ahora, la conversación vuelve al asistente y esa ' +
          'persona no recibe ningún aviso: se queda esperando una respuesta que no ' +
          'va a llegar.\n\n¿Liberar igual?',
      )
    ) {
      return;
    }
    run(() => (actions?.release ?? releaseConversation)(token, conversation.id));
  }

  function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim()) return;
    run(async () => {
      await (actions?.reply ?? replyManually)(token, conversation.id, replyText);
      setReplyText('');
      setRespondio(true);
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

  const channelLabel = conversation.channel === 'WHATSAPP' ? 'WhatsApp' : 'Chat Web';
  const handledSince = conversation.handledAt
    ? new Date(conversation.handledAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const otherHandlerName =
    conversation.handledBy?.name || conversation.handledById || 'otro supervisor';
  const notes = conversation.internalNotes ?? [];

  return (
    <div className="conv-ctrl-root">
      {(conversation.messages ?? []).filter(m => m.outboundCommunication).map(m => {
        const n = m.outboundCommunication;
        const labels = { PENDING: 'Pendiente', SENDING: 'En proceso', FAILED: 'Fallido', UNCERTAIN: 'Incierto: requiere atención', ACCEPTED: n.transportMode === 'simulated' ? 'Aceptado en simulación' : 'Aceptado por el canal' };
        return <p key={n.id}>Aviso de financiación: {labels[n.status]}. No acredita entrega al destinatario.</p>;
      })}

      {/* 1. Barra horizontal de estado y toma/liberación de control */}
      <div className={`conv-ctrl-status-bar${iHoldControl ? ' is-manual' : ''}`}>
        <div className="conv-ctrl-status-left">
          <span className={statusBadgeClass(conversation.status)}>
            {STATUS_NAMES[conversation.status] ?? conversation.status}
          </span>
          <span className="conv-ctrl-status-desc">
            {conversation.status === 'HUMAN_HANDLING' ? (
              iHoldControl ? (
                <>
                  <strong>Intervención activa:</strong> tenés el control manual
                  {handledSince ? ` desde las ${handledSince}` : ''}
                </>
              ) : (
                <>
                  Tomado por <strong>{otherHandlerName}</strong>
                  {handledSince ? ` · desde ${handledSince}` : ''}
                </>
              )
            ) : conversation.status === 'WAITING_HUMAN' ? (
              'Derivada por el agente · Esperando que un supervisor tome el control'
            ) : conversation.status === 'CLOSED' ? (
              'Conversación finalizada'
            ) : (
              'El asistente IA responde automáticamente en este hilo'
            )}
          </span>
        </div>

        <div className="conv-ctrl-status-actions">
          {!iHoldControl && (
            <button
              type="button"
              className="conv-ctrl-takeover-btn"
              disabled={busy || !canTakeOver}
              onClick={handleTakeover}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
              </svg>
              <span>Tomar control</span>
            </button>
          )}
          {iHoldControl && (
            <button
              type="button"
              className="secondary conv-ctrl-release-btn"
              disabled={busy}
              onClick={handleRelease}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 14l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 10h11a4 4 0 1 1 0 8h-1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Liberar control</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {/* 2. Paneles inferiores ordenados: Respuesta manual y Notas internas */}
      {(!hideReplyAndNotes && (iHoldControl || !hideNotes)) && (
        <div
          className={`conv-ctrl-panels${
            iHoldControl && !hideNotes ? ' has-two-cols' : ''
          }`}
        >
          {iHoldControl && (
            <form className="conv-ctrl-card conv-ctrl-reply-card" onSubmit={handleReply}>
              <div className="conv-ctrl-card-head">
                <div className="conv-ctrl-card-title">
                  <span className="conv-ctrl-card-icon is-supervisor" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <h4>Responder manualmente al contacto</h4>
                    <p>Se enviará en vivo por {channelLabel} como intervención de supervisor</p>
                  </div>
                </div>
              </div>

              <textarea
                className="conv-ctrl-textarea"
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Escribí tu respuesta para enviar por ${channelLabel}…`}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    handleReply(e);
                  }
                }}
              />

              <div className="conv-ctrl-card-foot">
                <span className="conv-ctrl-foot-hint">Ctrl + Enter para enviar rápido</span>
                <button type="submit" disabled={busy || !replyText.trim()}>
                  Enviar respuesta
                </button>
              </div>
            </form>
          )}

          {!hideNotes && (
            <div className="conv-ctrl-card conv-ctrl-notes-card">
              <div className="conv-ctrl-card-head">
                <div className="conv-ctrl-card-title">
                  <span className="conv-ctrl-card-icon is-note" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <div>
                    <h4>
                      Notas internas{' '}
                      <span className="conv-ctrl-count-badge">{notes.length}</span>
                    </h4>
                    <p>Privadas para supervisores (nunca visibles para el cliente)</p>
                  </div>
                </div>
              </div>

              {notes.length === 0 ? (
                <div className="conv-ctrl-notes-empty">
                  Sin notas internas registradas en esta conversación.
                </div>
              ) : (
                <ul className="conv-ctrl-notes-list">
                  {notes.map((n) => {
                    const author = noteAuthor(n);
                    return (
                      <li key={n.id} className="conv-ctrl-note-item">
                        <div
                          className="conv-ctrl-note-avatar"
                          style={{ backgroundColor: author.color }}
                          title={author.label}
                        >
                          {author.initials}
                        </div>
                        <div className="conv-ctrl-note-body">
                          <div className="conv-ctrl-note-meta">
                            <strong>{author.label}</strong>
                            <span>
                              {new Date(n.createdAt).toLocaleString('es-AR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p style={{ whiteSpace: 'pre-line' }}>{internalNoteText(n)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form className="conv-ctrl-note-form" onSubmit={handleNote}>
                <input
                  type="text"
                  className="conv-ctrl-note-input"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Agregar una nota interna para el equipo…"
                />
                <button
                  type="submit"
                  className="secondary conv-ctrl-note-btn"
                  disabled={busy || !noteText.trim()}
                >
                  Agregar
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
