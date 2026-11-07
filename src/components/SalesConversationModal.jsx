import { useCallback, useEffect, useState } from 'react';
import ConversationControls from './ConversationControls';
import ConversationThread from './ConversationThread';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown } from '../chatExport';
import { salesProspectAction } from '../api';

export default function SalesConversationModal({ token, me, prospect, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const displayName = prospect.name || prospect.nombreApellido || 'Cliente';
  const displayPhone = prospect.phone || prospect.telefono || '';
  const displayProduct = prospect.productInterest || prospect.productoInteres || '';

  const refresh = useCallback(async () => {
    try {
      const next = await salesProspectAction(token, prospect.id, 'conversation');
      setConversation(next);
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo cargar la conversación.');
    } finally {
      setLoading(false);
    }
  }, [token, prospect.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-content sales-conv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-conv-modal-title"
      >
        <header className="sales-conv-modal-head">
          <div className="sales-conv-modal-identity">
            <div className="sales-prospect-avatar" aria-hidden="true">
              {displayName.trim().slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 id="sales-conv-modal-title">Conversación con {displayName}</h3>
              <div className="sales-conv-modal-meta">
                {displayPhone && <span>Tel. {displayPhone}</span>}
                {prospect.comercio && <span>· {prospect.comercio}</span>}
                {displayProduct && <span>· Interés: {displayProduct}</span>}
              </div>
            </div>
          </div>

          <div className="sales-conv-modal-actions">
            <button
              type="button"
              className="btn-pill-action"
              onClick={refresh}
              disabled={loading}
            >
              ↻ Actualizar
            </button>
            <ChatExportMenu
              filename={`ventas-${displayName || prospect.id}`}
              disabled={!conversation?.messages?.length}
              getMarkdown={() =>
                buildConversationMarkdown({
                  title: `Conversación comercial — ${displayName}`,
                  contactLabel: displayName,
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
          Los mensajes enviados quedan registrados en el hilo de TrimIA. Recordá liberar el control al asistente cuando finalices la atención.
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
            <ConversationControls
              token={token}
              me={me}
              conversation={conversation}
              onRefresh={refresh}
              hideNotes
              actions={{
                takeover: () => salesProspectAction(token, prospect.id, 'takeover'),
                release: () => salesProspectAction(token, prospect.id, 'release'),
                reply: (_token, _id, message) =>
                  salesProspectAction(token, prospect.id, 'reply', message),
              }}
            />
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
