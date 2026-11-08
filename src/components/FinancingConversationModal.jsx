import { useCallback, useEffect, useState } from 'react';
import ConversationControls from './ConversationControls';
import ConversationThread from './ConversationThread';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown } from '../chatExport';
import { contactInitials } from '../conversationHelpers';
import {
  getConversation,
  salesProspectAction,
} from '../api';

export default function FinancingConversationModal({
  token,
  me,
  conversationId,
  prospectId,
  clientName = 'Cliente',
  clientPhone = '',
  clientDni = '',
  business = '',
  productSummary = '',
  fallbackMessages = [],
  onClose,
}) {
  const [conversation, setConversation] = useState(null);
  const [useProspectApi, setUseProspectApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      if (conversationId && me?.role === 'SUPERVISOR' && !useProspectApi) {
        try {
          const next = await getConversation(token, conversationId);
          setConversation(next);
          setError('');
          return;
        } catch (supErr) {
          if (prospectId) {
            setUseProspectApi(true);
            const next = await salesProspectAction(token, prospectId, 'conversation');
            setConversation(next);
            setError('');
            return;
          }
          throw supErr;
        }
      }

      if (prospectId) {
        const next = await salesProspectAction(token, prospectId, 'conversation');
        setConversation(next);
        setError('');
        return;
      }

      if (conversationId) {
        const next = await getConversation(token, conversationId);
        setConversation(next);
        setError('');
        return;
      }

      setError('Este pedido no tiene una conversación vinculada.');
    } catch (err) {
      setError(err.message || 'No se pudo cargar la conversación.');
      if (!conversation && fallbackMessages?.length) {
        setConversation({
          id: conversationId || 'fallback',
          channel: 'WHATSAPP',
          status: 'ACTIVE',
          messages: fallbackMessages,
          events: [],
          internalNotes: [],
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    token,
    conversationId,
    prospectId,
    me?.role,
    useProspectApi,
    conversation,
    fallbackMessages,
  ]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      refresh({ silent: true });
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, conversationId, prospectId, useProspectApi]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const customActions =
    useProspectApi && prospectId
      ? {
          takeover: () => salesProspectAction(token, prospectId, 'takeover'),
          release: () => salesProspectAction(token, prospectId, 'release'),
          reply: (_token, _id, message) =>
            salesProspectAction(token, prospectId, 'reply', message),
        }
      : undefined;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-content sales-conv-modal commerce-conv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-conv-modal-title"
      >
        <header className="sales-conv-modal-head">
          <div className="sales-conv-modal-identity">
            <div className="fin-detail-avatar" aria-hidden="true">
              {contactInitials(clientName)}
            </div>
            <div>
              <h3 id="fin-conv-modal-title">
                Conversación con {clientName}
              </h3>
              <div className="sales-conv-modal-meta">
                {clientDni && <span>DNI {clientDni}</span>}
                {clientPhone && <span>· Tel. {clientPhone}</span>}
                {business && <span>· {business}</span>}
                {productSummary && <span>· {productSummary}</span>}
              </div>
            </div>
          </div>

          <div className="sales-conv-modal-actions">
            <button
              type="button"
              className="btn-pill-action"
              onClick={() => refresh({ silent: false })}
              disabled={loading}
            >
              ↻ {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
            <ChatExportMenu
              filename={`conversacion-${clientName || conversationId || 'pedido'}`}
              disabled={!conversation?.messages?.length}
              getMarkdown={() =>
                buildConversationMarkdown({
                  title: `Pedido de financiación — ${clientName}`,
                  contactLabel: clientName,
                  conversation,
                  me,
                })
              }
            />
            <button type="button" className="secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </header>

        <p className="sales-conv-modal-banner">
          Podés tomar el control manual para responderle al cliente en vivo por WhatsApp o dejar una nota interna. Recordá liberar el control cuando finalices para que el asistente continúe el flujo.
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {conversation ? (
          <div className="sales-conv-modal-body">
            <ConversationThread
              conversation={conversation}
              me={me}
              autoScroll
              emptyMessage="Todavía no hay mensajes registrados en este hilo."
            />
            {conversation.id !== 'fallback' && (
              <ConversationControls
                token={token}
                me={me}
                conversation={conversation}
                onRefresh={() => refresh({ silent: true })}
                hideNotes={Boolean(useProspectApi)}
                actions={customActions}
              />
            )}
          </div>
        ) : (
          !error && (
            <div className="sales-empty-box">
              <span className="fin-inline-spinner" aria-hidden="true" />
              <p>Cargando historial de conversación…</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
