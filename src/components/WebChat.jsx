import { useEffect, useRef, useState } from 'react';
import {
  sendWebMessage,
  getWebMessages,
  openConversationStream,
  closeWebConversation,
} from '../api';

/**
 * Dónde se recuerda la conversación entre recargas.
 *
 * Sin esto, recargar la página perdía el `convId` y no había forma de volver a
 * engancharse al hilo: el backend no expone "dame mi conversación actual", el id
 * solo sale al enviar un mensaje. Y justamente el caso que más importa demostrar
 * —que la respuesta de un supervisor llega sola— pide tener el chat abierto sin
 * escribir nada.
 */
const CONV_STORAGE_KEY = 'trimia:webchat:conversacion';

/** Espera creciente entre reintentos de reconexión, con techo. */
const esperaDeReintento = (intentos) => Math.min(1000 * 2 ** intentos, 15000);

/**
 * Chat web del panel.
 *
 * A diferencia del Simulador de Chat, acá no hay secreto ni teléfono a mano: la
 * conversación es la del **empleado logueado**, y el backend la identifica por el
 * teléfono de su perfil a partir del JWT. Por eso alcanza con estar autenticado —
 * no hace falta ser SUPERVISOR.
 *
 * Ya no hay polling (spec 004). Los mensajes llegan por un stream, y con eso
 * desaparece el "no llegó respuesta a tiempo": un turno lento no es un error.
 */
export default function WebChat({ token }) {
  const [text, setText] = useState('');
  const [convId, setConvId] = useState(() => localStorage.getItem(CONV_STORAGE_KEY));
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const [esperandoRespuesta, setEsperandoRespuesta] = useState(false);
  const [error, setError] = useState(null);
  /** Motivo por el que la entrega dejó de funcionar, si aplica. */
  const [corte, setCorte] = useState(null);
  const [aviso, setAviso] = useState(null);

  /** Último mensaje visto: es el cursor con el que se reanuda el stream. */
  const ultimoIdRef = useRef(null);

  /** Agrega respetando RF-004/RF-005: sin duplicados y ordenado por fecha. */
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

  function olvidarConversacion() {
    localStorage.removeItem(CONV_STORAGE_KEY);
    ultimoIdRef.current = null;
    setConvId(null);
    setMessages([]);
    setConversation(null);
    setEsperandoRespuesta(false);
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
        // El historial primero, y el stream después **con `after`**: el servidor
        // reproduce lo que haya pasado entre una cosa y la otra, así que no queda
        // una ventana en la que un mensaje se caiga.
        if (!historialCargado) {
          const res = await getWebMessages(token, convId, { limit: 100 });
          if (cancelado) return;
          agregarMensajes(res.data);
          setConversation(res.conversation);
          historialCargado = true;
        }

        stream = await openConversationStream(
          token,
          `/messaging/web/${convId}/stream`,
          {
            after: ultimoIdRef.current ?? undefined,
            onMessage: (m) => {
              if (cancelado) return;
              agregarMensajes([m]);
              if (m.role === 'ASSISTANT') setEsperandoRespuesta(false);
            },
            onStatus: (s) => {
              if (cancelado) return;
              setConversation((c) => ({ ...c, ...s }));
              // Si el caso pasó a manos de una persona, el asistente no va a
              // contestar: dejar el "está escribiendo" sería mentir (CL-1).
              if (s.status !== 'ACTIVE') setEsperandoRespuesta(false);
            },
            onClose: ({ conversacionTerminada, abortado }) => {
              if (cancelado || abortado) return;

              // Único motivo que el servidor comunica explícitamente. El
              // `convId` quedó muerto: el próximo mensaje abre otro hilo.
              if (conversacionTerminada) {
                setAviso(
                  'La conversación se terminó. El próximo mensaje empieza una nueva.',
                );
                olvidarConversacion();
                return;
              }

              // Los otros tres motivos —inactividad, sesión vencida y permiso
              // perdido— cierran el stream de la misma forma y NO se distinguen
              // desde acá. Se distinguen por lo que pasa al reabrir, más abajo.
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

        // 401 — la sesión venció (el stream tampoco sobrevive al token que lo
        // abrió). Reintentar con el mismo token falla en loop: hay que renovarla.
        if (err.status === 401) {
          setCorte({
            tipo: 'sesion',
            texto: 'Tu sesión venció. Volvé a entrar para seguir recibiendo mensajes.',
          });
          return;
        }

        // 403 — esta conversación ya no es tuya. **No se reintenta nunca**: un
        // bucle contra un 403 es el polling que esta spec vino a sacar, con otra
        // cara. 404 va por el mismo camino: el hilo no existe más.
        if (err.status === 403 || err.status === 404) {
          setCorte({
            tipo: 'permiso',
            texto: 'Ya no podés ver esta conversación. Empezá una nueva escribiendo un mensaje.',
          });
          olvidarConversacion();
          return;
        }

        // Cualquier otra cosa es un problema de red: se reintenta espaciado.
        setCorte({ tipo: 'red', texto: 'Sin conexión con el servidor. Reintentando…' });
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
    setSending(true);
    setError(null);
    setAviso(null);
    try {
      const res = await sendWebMessage(token, text);
      setText('');
      setEsperandoRespuesta(true);
      if (res.conversationId !== convId) {
        localStorage.setItem(CONV_STORAGE_KEY, res.conversationId);
        setConvId(res.conversationId);
      }
    } catch (err) {
      // 409: el empleado no tiene teléfono cargado, así que no hay conversación
      // que identificar. NO se intenta abrir ningún stream — el mensaje del
      // backend ya explica qué hay que hacer (que un supervisor lo cargue).
      setError(err);
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    const ok = window.confirm(
      'Terminar la conversación.\n\n' +
        'El próximo mensaje empieza un hilo nuevo: el asistente no va a recordar ' +
        'nada de lo hablado hasta acá.\n\n¿Seguro?',
    );
    if (!ok) return;
    try {
      await closeWebConversation(token, convId);
      // No se limpia acá: llega el evento de estado CLOSED y el propio stream se
      // encarga, que es el mismo camino por el que se entera una segunda pestaña.
    } catch (err) {
      setError(err);
    }
  }

  const estado = conversation?.status;
  const enManosDeUnaPersona = estado === 'WAITING_HUMAN' || estado === 'HUMAN_HANDLING';

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

      {aviso && <div className="success-msg" style={{ marginTop: 12 }}>{aviso}</div>}

      {/* Cada motivo de corte pide algo distinto de quien lee, así que se dicen
          distinto. Un cartel genérico de "error de conexión" haría que alguien
          reintente contra un 403 para siempre. */}
      {corte && (
        <div
          className={corte.tipo === 'red' ? 'hint' : 'error'}
          style={{ marginTop: 12 }}
        >
          {corte.texto}
        </div>
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

      {/* "Esperando" solo mientras el asistente realmente puede contestar. Si el
          caso está en manos de una persona, esto no se muestra: ahí el cartel es
          el de abajo, que dice otra cosa. */}
      {esperandoRespuesta && !enManosDeUnaPersona && (
        <p className="hint" style={{ marginTop: 12 }}>
          El asistente está preparando la respuesta… puede tardar. No hace falta
          hacer nada: aparece sola.
        </p>
      )}

      {/* Dos estados distintos, dos mensajes distintos. Aplastarlos en un solo
          cartel le esconde a la persona si su caso ya lo tomó alguien o sigue en
          la fila. */}
      {estado === 'WAITING_HUMAN' && (
        <div className="success-msg" style={{ marginTop: 12 }}>
          Tu consulta pasó a un responsable y está esperando a que alguien la tome.
          El asistente no va a contestar por ahora — podés seguir escribiendo y
          queda registrado.
        </div>
      )}
      {estado === 'HUMAN_HANDLING' && (
        <div className="success-msg" style={{ marginTop: 12 }}>
          Un responsable está atendiendo tu caso ahora mismo. Lo que te conteste
          aparece acá.
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

        {convId && (
          <button
            type="button"
            onClick={handleClose}
            disabled={enManosDeUnaPersona}
            title={
              enManosDeUnaPersona
                ? 'No podés terminarla mientras un responsable la está atendiendo'
                : 'El próximo mensaje empieza un hilo nuevo'
            }
            style={{ marginLeft: 8 }}
          >
            Terminar conversación
          </button>
        )}

        {conversation?.currentAgent && (
          <span className="hint" style={{ marginLeft: 8 }}>
            Agente actual: {conversation.currentAgent}
          </span>
        )}
      </form>
    </div>
  );
}
