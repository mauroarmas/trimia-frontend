import { useEffect, useRef, useState } from 'react';
import { simulateMessage, getConversation, openConversationStream } from '../api';

const esperaDeReintento = (intentos) => Math.min(1000 * 2 ** intentos, 15000);

/**
 * Simulador de Chat.
 *
 * Sirve para probar el sistema escribiendo como **cualquier teléfono**, en
 * particular uno que NO está en la whitelist de empleados: ese es el camino del
 * cliente, y es el motivo por el que el simulador existe.
 *
 * Dos cambios grandes respecto de la versión anterior (spec 004):
 *
 * - **Ya no se pega ningún secreto.** Antes mandaba el mensaje por
 *   `POST /messaging/webhook`, que exige el `x-n8n-secret` — el MISMO valor que
 *   protege el canal real de WhatsApp en producción—, así que había que pegarlo
 *   a mano en un input y quedaba expuesto a las devtools y a cualquier demo con
 *   pantalla compartida. Ahora usa `POST /messaging/simulate`, que va con la
 *   sesión del panel (rol SUPERVISOR).
 * - **Ya no hay polling.** La respuesta llega por el stream de la conversación.
 */
export default function ChatSimulator({ token }) {
  const [phone, setPhone] = useState('5493764000000');
  const [text, setText] = useState('Hola, quiero consultar por un producto');
  const [status, setStatus] = useState('');
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const [corte, setCorte] = useState(null);

  const ultimoIdRef = useRef(null);

  function agregarMensajes(nuevos) {
    setMessages((previos) => {
      const porId = new Map(previos.map((m) => [m.id, m]));
      for (const m of nuevos) porId.set(m.id, m);
      const todos = [...porId.values()].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );
      ultimoIdRef.current = todos.at(-1)?.id ?? null;
      return todos;
    });
  }

  useEffect(() => {
    if (!convId) return undefined;

    let cancelado = false;
    let stream = null;
    let reintento = null;
    let intentos = 0;
    let historialCargado = false;

    async function conectar() {
      try {
        if (!historialCargado) {
          const conv = await getConversation(token, convId);
          if (cancelado) return;
          agregarMensajes(conv.messages ?? []);
          setConversation(conv);
          historialCargado = true;
        }

        stream = await openConversationStream(
          token,
          `/supervisor/conversations/${convId}/stream`,
          {
            after: ultimoIdRef.current ?? undefined,
            onMessage: (m) => !cancelado && agregarMensajes([m]),
            onStatus: (s) =>
              !cancelado && setConversation((c) => ({ ...c, ...s })),
            onClose: ({ conversacionTerminada, abortado }) => {
              if (cancelado || abortado) return;
              if (conversacionTerminada) {
                setStatus('La conversación se cerró.');
                return;
              }
              reintento = setTimeout(conectar, esperaDeReintento(intentos));
              intentos += 1;
            },
          },
        );

        if (cancelado) {
          stream.close();
          return;
        }
        intentos = 0;
        setCorte(null);
      } catch (err) {
        if (cancelado) return;

        // Los dos códigos piden acciones opuestas al ABRIR el stream.
        if (err.status === 401) {
          setCorte('Tu sesión venció. Volvé a entrar.');
          return;
        }
        // Este endpoint es de supervisores. Sin el rol, reintentar no va a
        // funcionar nunca: un bucle contra un 403 es el polling reinventado.
        if (err.status === 403) {
          setCorte('Necesitás rol SUPERVISOR para ver esta conversación en vivo.');
          return;
        }
        if (err.status === 404) {
          setCorte('La conversación ya no existe.');
          return;
        }

        setCorte('Sin conexión con el servidor. Reintentando…');
        reintento = setTimeout(conectar, esperaDeReintento(intentos));
        intentos += 1;
      }
    }

    conectar();

    return () => {
      cancelado = true;
      clearTimeout(reintento);
      stream?.close();
    };
  }, [convId, token]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;

    // Se advierte, no se impide: escribir en la conversación real de ese
    // teléfono es EXACTAMENTE lo que hace útil al simulador —prueba el sistema
    // de verdad, no una copia— y es la razón por la que es de supervisores.
    const ok = window.confirm(
      `Vas a escribir en la conversación REAL de ${phone}.\n\n` +
        'Si ese teléfono es de un cliente o de un compañero, el mensaje queda en ' +
        'su hilo y el sistema le va a responder como si lo hubiera escrito él.\n\n' +
        '¿Seguro?',
    );
    if (!ok) return;

    setSending(true);
    setCorte(null);
    setStatus('Encolando…');
    try {
      const res = await simulateMessage(token, { phone, message: text });
      setStatus('Encolado. La respuesta aparece sola.');
      // El id viene en la respuesta, así que ya no hace falta buscar la
      // conversación por teléfono en la lista del panel: eso existía solo
      // porque el webhook no devolvía nada útil.
      if (res.conversationId !== convId) {
        ultimoIdRef.current = null;
        setMessages([]);
        setConversation(null);
        setConvId(res.conversationId);
      }
    } catch (err) {
      setStatus('');
      setCorte(
        err.status === 403
          ? 'El simulador es solo para supervisores.'
          : `Error: ${err.message}`,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="hint">
        Escribe como el teléfono que pongas abajo y muestra la respuesta en vivo.
        Con un número que <b>no</b> esté en la whitelist de empleados, el sistema
        lo trata como <b>cliente</b>: solo llega a los agentes de ventas y
        cobranzas, y solo se le recupera conocimiento público. Ese es el camino
        que este simulador existe para probar.
      </div>

      <div className="card">
        <form onSubmit={handleSend}>
          <div className="field">
            <label>Teléfono (externalId)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>Mensaje</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
          <button type="submit" disabled={sending || !text.trim()}>
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>

        {status && (
          <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>{status}</p>
        )}
        {corte && <p className="error" style={{ marginTop: 12 }}>{corte}</p>}
      </div>

      {conversation && (
        <div className="card">
          <h4>
            Conversación {conversation.externalId ?? phone} ({conversation.status})
            {conversation.userType && ` · ${conversation.userType}`}
          </h4>
          <ul className="msg-list">
            {messages.map((m) => (
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
