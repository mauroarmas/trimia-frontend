import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addInternalNote,
  generateEscalationKnowledgeDraft,
  ingestKnowledge,
  releaseConversation,
  replyManually,
  resolveEscalationManual,
} from '../api';
import { contactInitials } from '../conversationHelpers';
import ConversationThread from './ConversationThread';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown } from '../chatExport';

const AGENT_OPTIONS = [
  { value: '', label: 'General (todas las áreas)' },
  { value: 'SALES', label: 'Ventas' },
  { value: 'COLLECTIONS', label: 'Cobranzas' },
  { value: 'LOGISTICS', label: 'Logística' },
  { value: 'DEPOSITS', label: 'Depósito' },
  { value: 'ADMIN', label: 'Administración' },
];

/**
 * Modal grande tipo chat que se abre al presionar "Tomar control" en un caso
 * escalado.
 *
 * Flujo en 3 etapas:
 *  1. `chat`      — Conversación en vivo con el cliente + nota interna rápida +
 *                   botón "Liberar control".
 *  2. `ask-kb`    — Tras liberar el control, pregunta si desea generar un
 *                   documento nuevo con IA para la Base de Conocimiento.
 *  3. `review-kb` — Muestra el borrador generado por la IA (editable en título,
 *                   categoría, audiencia, área y contenido) para confirmar o
 *                   modificar antes de guardarlo.
 */
export default function EscalationTakeoverModal({
  token,
  me,
  escalation,
  conversation,
  onRefresh,
  onClose,
  onEscalationResolved,
  onKnowledgeSaved,
}) {
  const [stage, setStage] = useState('chat'); // 'chat' | 'ask-kb' | 'review-kb' | 'saved-kb'
  const [releasedAndResolved, setReleasedAndResolved] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [sessionReplies, setSessionReplies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Estado del borrador de conocimiento generado con IA
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftMeta, setDraftMeta] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docAudience, setDocAudience] = useState('PUBLICO');
  const [docAgentType, setDocAgentType] = useState('');
  const [docContent, setDocContent] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  const textareaRef = useRef(null);

  const emp = conversation?.employee ?? escalation?.conversation?.employee;
  const rawContactId =
    conversation?.externalId || escalation?.conversation?.externalId || 'Contacto';
  const displayName = emp?.name || conversation?.client?.name || rawContactId;
  const channelLabel =
    (conversation?.channel ?? escalation?.conversation?.channel) === 'WHATSAPP'
      ? 'WhatsApp'
      : 'Chat Web';
  const iHoldControl =
    conversation?.status === 'HUMAN_HANDLING' && conversation?.handledById === me?.id;
  const notesCount = conversation?.internalNotes?.length ?? 0;

  // Polling suave mientras el chat en vivo está abierto para ver respuestas del cliente
  useEffect(() => {
    if (stage !== 'chat') return undefined;
    const timer = setInterval(() => {
      onRefresh?.();
    }, 5000);
    return () => clearInterval(timer);
  }, [stage, onRefresh]);

  // Bloqueo de scroll del body mientras el modal está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSendReply(e) {
    e?.preventDefault();
    const text = replyText.trim();
    if (!text || busy || !conversation?.id) return;
    setBusy(true);
    setError('');
    try {
      await replyManually(token, conversation.id, text);
      setSessionReplies((prev) => [...prev, text]);
      setReplyText('');
      await onRefresh?.();
      textareaRef.current?.focus();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el mensaje.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddQuickNote(e) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text || busy || !conversation?.id) return;
    setBusy(true);
    setError('');
    try {
      await addInternalNote(token, conversation.id, text);
      setNoteText('');
      setShowQuickNote(false);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la nota interna.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseControl() {
    if (busy || !conversation?.id) return;
    if (
      sessionReplies.length === 0 &&
      !confirm(
        'Vas a liberar el control sin haber enviado ningún mensaje en esta sesión.\n\n' +
          '¿Querés liberar el control igual?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await releaseConversation(token, conversation.id);
      if (escalation?.id && escalation.status === 'PENDING') {
        const resolutionText =
          sessionReplies.length > 0
            ? sessionReplies.join('\n\n')
            : 'Atendido y resuelto mediante control manual en vivo.';
        await resolveEscalationManual(token, escalation.id, {
          resolution: resolutionText,
        });
        setReleasedAndResolved(true);
      }
      await onRefresh?.();
      setStage('ask-kb');
    } catch (err) {
      setError(err.message || 'No se pudo liberar el control de la conversación.');
    } finally {
      setBusy(false);
    }
  }

  function handleFinishClose() {
    if (releasedAndResolved) {
      onEscalationResolved?.();
    } else {
      onClose?.();
    }
  }

  async function handleGenerateDraft() {
    if (!escalation?.id) return;
    setStage('review-kb');
    setDraftLoading(true);
    setDraftError('');
    try {
      const draft = await generateEscalationKnowledgeDraft(token, escalation.id, {
        supervisorReplies: sessionReplies,
      });
      setDocTitle(draft.title || '');
      setDocAudience(draft.audience || 'PUBLICO');
      setDocAgentType(draft.agentType || '');
      setDocContent(draft.content || '');
      setDraftMeta(draft.basedOn || null);
    } catch (err) {
      setDraftError(err.message || 'No se pudo generar el documento con IA.');
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleConfirmKnowledge(e) {
    e.preventDefault();
    if (savingDoc || !docTitle.trim() || !docContent.trim()) return;
    setSavingDoc(true);
    setDraftError('');
    try {
      await ingestKnowledge(token, {
        title: docTitle.trim(),
        audience: docAudience,
        agentType: docAgentType || undefined,
        content: docContent.trim(),
      });
      setStage('saved-kb');
      onKnowledgeSaved?.(docTitle.trim());
    } catch (err) {
      setDraftError(err.message || 'No se pudo guardar el documento en la Base de Conocimiento.');
    } finally {
      setSavingDoc(false);
    }
  }

  return createPortal(
    <div
      className="modal-overlay esc-takeover-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== 'chat') {
          handleFinishClose();
        }
      }}
    >
      <div
        className={`modal-content esc-takeover-modal${stage !== 'chat' ? ' is-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="esc-takeover-modal-title"
      >
        {/* Cabecera unificada estilo hero */}
        <header className="econ-modal-header esc-takeover-header">
          <div className="esc-takeover-identity">
            <div className="sup-contact-avatar esc-takeover-avatar" aria-hidden="true">
              {contactInitials(displayName)}
            </div>
            <div>
              <span className="econ-modal-kicker">
                {stage === 'chat'
                  ? `CONTROL MANUAL EN VIVO · ${channelLabel.toUpperCase()}`
                  : 'BASE DE CONOCIMIENTO · GENERACIÓN ASISTIDA POR IA'}
              </span>
              <h2 id="esc-takeover-modal-title">
                {stage === 'chat'
                  ? `Conversación con ${displayName}`
                  : stage === 'ask-kb'
                    ? 'Control liberado'
                    : stage === 'saved-kb'
                      ? 'Documento incorporado'
                      : 'Revisar documento generado con IA'}
              </h2>
              {stage === 'chat' && (
                <p>
                  {displayName !== rawContactId ? `Tel/ID: ${rawContactId} · ` : ''}
                  {iHoldControl
                    ? 'El asistente IA está pausado mientras conversás directamente con el cliente.'
                    : 'Revisando conversación del caso escalado.'}
                </p>
              )}
            </div>
          </div>

          <div className="esc-takeover-header-actions">
            {stage === 'chat' && (
              <>
                <span className="sup-live-pill is-live">
                  <span className="sup-live-dot" aria-hidden="true" />
                  En vivo
                </span>
                <button
                  type="button"
                  className="secondary esc-takeover-ghost-btn"
                  onClick={() => onRefresh?.()}
                  disabled={busy}
                  title="Actualizar mensajes"
                >
                  ↻
                </button>
                <ChatExportMenu
                  filename={`control-manual-${displayName || escalation?.id}`}
                  disabled={!conversation?.messages?.length}
                  getMarkdown={() =>
                    buildConversationMarkdown({
                      title: `Control manual — ${displayName}`,
                      contactLabel: displayName,
                      conversation,
                      me,
                    })
                  }
                />
                {iHoldControl && (
                  <button
                    type="button"
                    className="esc-takeover-release-btn"
                    onClick={handleReleaseControl}
                    disabled={busy}
                  >
                    Liberar control
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="econ-modal-close"
              onClick={handleFinishClose}
              aria-label="Cerrar ventana"
              title="Cerrar"
            >
              ×
            </button>
          </div>
        </header>

        {/* ETAPA 1: CHAT GRANDE EN VIVO */}
        {stage === 'chat' && (
          <div className="esc-takeover-body">
            {error && (
              <p className="error" role="alert" style={{ margin: '0 0 8px' }}>
                {error}
              </p>
            )}

            <div className="esc-takeover-chat-area">
              <ConversationThread
                conversation={conversation}
                me={me}
                className="esc-takeover-thread"
                autoScroll
                emptyMessage="Todavía no hay mensajes registrados en este hilo."
              />
            </div>

            {showQuickNote && (
              <form className="esc-takeover-quick-note" onSubmit={handleAddQuickNote}>
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Anotá un dato interno para el equipo (se tendrá en cuenta al generar conocimiento)…"
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="secondary"
                  disabled={busy || !noteText.trim()}
                >
                  Guardar nota
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowQuickNote(false)}
                >
                  Cancelar
                </button>
              </form>
            )}

            <form className="esc-takeover-composer" onSubmit={handleSendReply}>
              <textarea
                ref={textareaRef}
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  iHoldControl
                    ? `Escribí tu mensaje para enviar en vivo por ${channelLabel}… (Enter para enviar, Shift+Enter para salto de línea)`
                    : 'El control manual ya no está activo.'
                }
                disabled={busy || !iHoldControl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
              />
              <div className="esc-takeover-composer-bar">
                <div className="esc-takeover-composer-left">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowQuickNote((v) => !v)}
                    disabled={busy}
                  >
                    {showQuickNote ? 'Ocultar nota interna' : `+ Nota interna (${notesCount})`}
                  </button>
                  {sessionReplies.length > 0 && (
                    <span className="esc-takeover-sent-count">
                      {sessionReplies.length}{' '}
                      {sessionReplies.length === 1 ? 'mensaje enviado' : 'mensajes enviados'} en esta sesión
                    </span>
                  )}
                </div>
                <div className="esc-takeover-composer-right">
                  {iHoldControl && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={handleReleaseControl}
                      disabled={busy}
                    >
                      Liberar control
                    </button>
                  )}
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || !iHoldControl || !replyText.trim()}
                  >
                    {busy ? 'Enviando…' : 'Enviar mensaje'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ETAPA 2: PREGUNTA TRAS LIBERAR CONTROL */}
        {stage === 'ask-kb' && (
          <div className="esc-kb-stage">
            <div className="esc-kb-prompt-card">
              <div className="esc-kb-prompt-icon" aria-hidden="true">
                ✦
              </div>
              <h3>¿Querés generar contenido con IA para la Base de Conocimiento?</h3>
              <p>
                La conversación volvió al asistente automático. Podemos redactar un{' '}
                <strong>documento nuevo</strong> usando:
              </p>
              <ul className="esc-kb-sources-list">
                <li>La pregunta original que provocó la derivación al supervisor</li>
                <li>
                  Las notas internas registradas en el caso ({notesCount}{' '}
                  {notesCount === 1 ? 'nota' : 'notas'})
                </li>
                <li>
                  Las respuestas que acabás de dar al cliente ({sessionReplies.length}{' '}
                  {sessionReplies.length === 1 ? 'mensaje' : 'mensajes'} en esta sesión)
                </li>
              </ul>
              <p className="esc-kb-prompt-note">
                Vas a poder revisar y modificar el documento completo antes de confirmarlo.
              </p>

              <div className="esc-kb-prompt-actions">
                <button type="button" className="secondary" onClick={handleFinishClose}>
                  No, cerrar
                </button>
                <button type="button" className="primary" onClick={handleGenerateDraft}>
                  ✦ Sí, generar documento con IA
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 3: REVISAR / EDITAR Y CONFIRMAR DOCUMENTO */}
        {stage === 'review-kb' && (
          <div className="esc-kb-stage">
            {draftLoading ? (
              <div className="esc-kb-loading">
                <div className="fin-eval-spinner-wrap" aria-hidden="true">
                  <span className="fin-eval-spinner" />
                </div>
                <strong>Redactando borrador con IA…</strong>
                <p>
                  Analizando la consulta escalada, las notas internas y tus respuestas para armar un
                  documento reutilizable.
                </p>
              </div>
            ) : (
              <form className="esc-kb-review-form" onSubmit={handleConfirmKnowledge}>
                {draftError && (
                  <p className="error" role="alert" style={{ margin: 0 }}>
                    {draftError}
                  </p>
                )}

                {draftMeta && (
                  <div className="esc-kb-based-on">
                    <strong>Base usada por la IA:</strong> consulta «{draftMeta.triggerQuestion}» ·{' '}
                    {draftMeta.notesCount}{' '}
                    {draftMeta.notesCount === 1 ? 'nota interna' : 'notas internas'} ·{' '}
                    {draftMeta.supervisorRepliesCount}{' '}
                    {draftMeta.supervisorRepliesCount === 1
                      ? 'respuesta del supervisor'
                      : 'respuestas del supervisor'}
                  </div>
                )}

                <div className="esc-field">
                  <label htmlFor="esc-kb-title">Título del documento *</label>
                  <input
                    id="esc-kb-title"
                    required
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Ej. Zonas de entrega y horarios de atención"
                  />
                </div>

                <div className="esc-two-fields">
                  <div className="esc-field">
                    <label htmlFor="esc-kb-audience">Audiencia</label>
                    <select
                      id="esc-kb-audience"
                      value={docAudience}
                      onChange={(e) => setDocAudience(e.target.value)}
                    >
                      <option value="PUBLICO">Público (clientes y empleados)</option>
                      <option value="INTERNO">Interno (solo equipo)</option>
                    </select>
                  </div>
                  <div className="esc-field">
                    <label htmlFor="esc-kb-agent">Área / Agente asignado</label>
                    <select
                      id="esc-kb-agent"
                      value={docAgentType}
                      onChange={(e) => setDocAgentType(e.target.value)}
                    >
                      {AGENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="esc-field">
                  <label htmlFor="esc-kb-content">Contenido del documento *</label>
                  <textarea
                    id="esc-kb-content"
                    rows={9}
                    required
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Texto completo que usará el asistente para futuras consultas…"
                  />
                </div>

                <div className="esc-kb-review-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleFinishClose}
                    disabled={savingDoc}
                  >
                    Descartar
                  </button>
                  <div className="esc-kb-review-actions-right">
                    <button
                      type="button"
                      className="secondary"
                      onClick={handleGenerateDraft}
                      disabled={savingDoc || draftLoading}
                    >
                      ↻ Regenerar con IA
                    </button>
                    <button
                      type="submit"
                      className="primary"
                      disabled={savingDoc || !docTitle.trim() || !docContent.trim()}
                    >
                      {savingDoc
                        ? 'Guardando…'
                        : '✓ Confirmar y guardar en Base de Conocimiento'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ETAPA 4: CONFIRMACIÓN DE GUARDADO */}
        {stage === 'saved-kb' && (
          <div className="esc-kb-stage">
            <div className="esc-kb-prompt-card">
              <div className="esc-kb-prompt-icon is-success" aria-hidden="true">
                ✓
              </div>
              <h3>Documento guardado en la Base de Conocimiento</h3>
              <p>
                Se incorporó <strong>«{docTitle}»</strong>. El asistente ya puede utilizar esta
                información para responder consultas similares.
              </p>
              <div className="esc-kb-prompt-actions">
                <button type="button" className="primary" onClick={handleFinishClose}>
                  Volver a casos escalados
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
