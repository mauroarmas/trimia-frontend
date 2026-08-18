import { useEffect, useRef, useState } from 'react';
import { sendWebMessage, getWebMessages } from '../api';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TRIES = 25; // ~50s

/**
 * Chat web del panel (US4).
 *
 * A diferencia del Simulador de Chat, acá no hay secreto ni teléfono a mano:
 * la conversación es la del **empleado logueado**, y el backend la identifica
 * por el teléfono de su perfil a partir del JWT. Por eso alcanza con estar
 * autenticado — no hace falta ser SUPERVISOR.
 */
export default function WebChat({ token }) {
  const [text, setText] = useState('');
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  async function poll(id, previousCount, tries = 0) {
    try {
      const res = await getWebMessages(token, id, { limit: 100 });
      setMessages(res.data);
      setConversation(res.conversation);

      // Se espera a que aparezca algo nuevo del asistente. Si la conversación
      // está esperando a una persona, el agente NO va a contestar: cortar el
      // polling ahí evita quedar girando 50 segundos al pedo.
      const llegoRespuesta = res.data.length > previousCount;
      const esperandoHumano = res.conversation?.status === 'WAITING_HUMAN';
      if (!llegoRespuesta && !esperandoHumano && tries < POLL_MAX_TRIES) {
        pollRef.current = setTimeout(() => poll(id, previousCount, tries + 1), POLL_INTERVAL_MS);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendWebMessage(token, text);
      setText('');
      setConvId(res.conversationId);
      clearTimeout(pollRef.current);
      // +1 porque el mensaje propio ya quedó persistido antes de encolar.
      poll(res.conversationId, messages.length + 1);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  const esperandoHumano = conversation?.status === 'WAITING_HUMAN';

  return (
    <div className="card">
      <h3>Chat con el asistente</h3>
      <p className="hint">
        Conversás como vos mismo: el asistente te reconoce como empleado y puede
        usar conocimiento interno. Es un hilo aparte del de WhatsApp, aunque los
        dos sean tuyos.
      </p>

      {/* 409: el backend no puede resolver la identidad conversacional sin
          teléfono. El mensaje viene accionable desde el backend. */}
      {error?.status === 409 && (
        <div className="error" style={{ marginTop: 12 }}>{error.message}</div>
      )}
      {error && error.status !== 409 && (
        <p className="error" style={{ marginTop: 12 }}>{error.message}</p>
      )}

      {messages.length > 0 && (
        <ul className="msg-list" style={{ marginTop: 12 }}>
          {messages.map((m) => (
            <li key={m.id}>
              <strong>{m.role === 'USER' ? 'Vos' : `Asistente${m.agentType ? ` (${m.agentType})` : ''}`}:</strong>{' '}
              {m.content}
              <div className="msg-time">{new Date(m.createdAt).toLocaleTimeString()}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Sin este aviso, una conversación pausada parece que se colgó: el
          mensaje se guardó y respondió 202, pero el agente no va a contestar
          hasta que un supervisor libere el caso. */}
      {esperandoHumano && (
        <div className="success-msg" style={{ marginTop: 12 }}>
          Tu consulta pasó a un responsable. El asistente no va a contestar por
          ahora — podés seguir escribiendo y queda registrado.
        </div>
      )}

      <form onSubmit={handleSend} style={{ marginTop: 12 }}>
        <div className="field">
          <label>Mensaje</label>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ej. ¿cuál es el procedimiento para dar de baja un plan?"
          />
        </div>
        <button type="submit" disabled={sending || !text.trim()}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
        {convId && sending === false && messages.length > 0 && (
          <span className="hint" style={{ marginLeft: 8 }}>
            {conversation?.currentAgent && `Agente actual: ${conversation.currentAgent}`}
          </span>
        )}
      </form>
    </div>
  );
}
