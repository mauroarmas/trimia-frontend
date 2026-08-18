import { useEffect, useRef, useState } from 'react';
import { sendWebhookMessage, getConversations, getConversation } from '../api';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TRIES = 20; // ~40s

export default function ChatSimulator({ token }) {
  const [phone, setPhone] = useState('5493764000000');
  // El secreto NO va hardcodeado: este archivo se commitea, y el valor es el
  // mismo `N8N_WEBHOOK_SECRET` que protege el webhook real. Se pega a mano
  // cada vez. Para conversar como el empleado logueado no hace falta ningún
  // secreto — para eso está la pestaña "Chat con el Asistente" (usa JWT).
  const [secret, setSecret] = useState('');
  const [text, setText] = useState('Hola, quiero consultar por un producto');
  const [status, setStatus] = useState('');
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  async function findConversationByPhone() {
    const res = await getConversations(token, { channel: 'WEB', limit: 100 });
    return res.data.find((c) => c.externalId === phone) ?? null;
  }

  async function pollForReply(conversationId, previousMessageCount, tries = 0) {
    if (tries >= POLL_MAX_TRIES) {
      setStatus('No llegó respuesta del agente a tiempo (¿n8n está corriendo?). Revisá el panel del supervisor.');
      return;
    }
    try {
      const conv = await getConversation(token, conversationId);
      setConversation(conv);
      const hasNewAssistantMsg = conv.messages.length > previousMessageCount &&
        conv.messages.slice(previousMessageCount).some((m) => m.role === 'ASSISTANT');
      if (hasNewAssistantMsg) {
        setStatus('Respuesta recibida.');
        return;
      }
    } catch (err) {
      setStatus(`Error consultando conversación: ${err.message}`);
      return;
    }
    pollRef.current = setTimeout(
      () => pollForReply(conversationId, previousMessageCount, tries + 1),
      POLL_INTERVAL_MS,
    );
  }

  async function handleSend(e) {
    e.preventDefault();
    clearTimeout(pollRef.current);
    setSending(true);
    setStatus('Encolando mensaje...');
    try {
      await sendWebhookMessage(secret, { phone, message: text, channel: 'WEB' });
      setStatus('Encolado. Buscando la conversación...');

      let previousMessageCount = conversation?.messages?.length ?? 0;
      if (conversation?.externalId !== phone) previousMessageCount = 0;

      let conv = await findConversationByPhone();
      let tries = 0;
      while (!conv && tries < 5) {
        await new Promise((r) => setTimeout(r, 1000));
        conv = await findConversationByPhone();
        tries += 1;
      }
      if (!conv) {
        setStatus('No se encontró la conversación todavía. Probá refrescar el Panel del Supervisor.');
        return;
      }
      setStatus('Esperando respuesta del agente (polling)...');
      pollForReply(conv.id, previousMessageCount);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="hint">
        No existe endpoint de chat síncrono todavía. Esto manda el mensaje por
        POST /messaging/webhook (queda encolado en BullMQ) y hace polling de
        GET /supervisor/conversations/:id esperando la respuesta del agente.
        Si n8n no está corriendo localmente, el mensaje del usuario y los
        eventos de orquestación igual van a quedar persistidos y visibles,
        pero la respuesta puede no llegar nunca.
      </div>
      <div className="card">
        <form onSubmit={handleSend}>
          <div className="field-row">
            <div className="field">
              <label>Teléfono (externalId)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>x-n8n-secret</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="pegalo desde .env (N8N_WEBHOOK_SECRET)"
              />
            </div>
          </div>
          <div className="field">
            <label>Mensaje</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
          <button type="submit" disabled={sending}>
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>

        {status && <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>{status}</p>}
      </div>

      {conversation && (
        <div className="card">
          <h4>Conversación {conversation.externalId} ({conversation.status})</h4>
          <ul className="msg-list">
            {conversation.messages.map((m) => (
              <li key={m.id}>
                <b>{m.role}{m.agentType ? ` (${m.agentType})` : ''}:</b> {m.content}
                <div className="msg-time">{new Date(m.createdAt).toLocaleTimeString()}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
