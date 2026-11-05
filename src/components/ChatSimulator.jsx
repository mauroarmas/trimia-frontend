import { useCallback, useEffect, useRef, useState } from 'react';
import {
  simulateMessage,
  getConversation,
  getConversations,
  openConversationStream,
} from '../api';
import { AGENT_META, buildConversationFeed } from '../conversationHelpers';
import { MessageActorAvatar } from './ConversationThread';
import InfoNotes, { InfoToggle } from './InfoNotes';
import PageHero from './PageHero';

const esperaDeReintento = (intentos) => Math.min(1000 * 2 ** intentos, 15000);

const QUICK_PROMPTS = [
  'Hola, quiero consultar por un producto',
  '¿Cuáles son los requisitos para financiar?',
  '¿Cómo informo un comprobante de pago?',
];

function generarTelefonoPrueba() {
  const sufijo = String(Math.floor(100000 + Math.random() * 900000));
  return `5493764${sufijo}`;
}

function normalizarDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function claveSesionSimulador(userId) {
  return `trimia:simulator:active:${userId ?? 'default'}`;
}

function leerSesionGuardada(userId) {
  try {
    const raw = sessionStorage.getItem(claveSesionSimulador(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.phone === 'string') {
      return {
        phone: parsed.phone,
        convId: typeof parsed.convId === 'string' ? parsed.convId : null,
      };
    }
  } catch {
    // Ignorar errores de sessionStorage
  }
  return null;
}

/**
 * Simulador de Chat en tiempo real (spec 004, US3).
 *
 * Permite probar la experiencia conversacional escribiendo desde cualquier
 * número de teléfono (clientes fuera de whitelist o empleados registrados) y
 * recibir respuestas del Agente IA o de un supervisor en vivo por SSE.
 */
export default function ChatSimulator({ token, me }) {
  const sesionInicial = leerSesionGuardada(me?.id);

  const [phone, setPhone] = useState(() => sesionInicial?.phone ?? generarTelefonoPrueba());
  const [convId, setConvId] = useState(sesionInicial?.convId ?? null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const [waitingReply, setWaitingReply] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [corte, setCorte] = useState(null);
  const [avisoCierre, setAvisoCierre] = useState('');

  const ultimoIdRef = useRef(null);
  const activePhoneRef = useRef(phone);
  const sendingRef = useRef(false);
  const viewportRef = useRef(null);
  const textareaRef = useRef(null);

  // Persistir teléfono y conversación activa para no perder el hilo al cambiar de pestaña
  useEffect(() => {
    try {
      sessionStorage.setItem(
        claveSesionSimulador(me?.id),
        JSON.stringify({ phone, convId }),
      );
    } catch {
      // Ignorar si sessionStorage no está disponible
    }
  }, [phone, convId, me?.id]);

  const agregarMensajes = useCallback((nuevos) => {
    if (!nuevos || nuevos.length === 0) return;

    setMessages((previos) => {
      const porId = new Map(previos.map((m) => [m.id, m]));
      for (const m of nuevos) {
        if (m?.id) porId.set(m.id, m);
      }
      const todos = [...porId.values()].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );
      ultimoIdRef.current = todos.at(-1)?.id ?? null;
      return todos;
    });

    // Limpiar mensajes optimistas que ya llegaron persistidos desde el servidor
    const userContents = nuevos
      .filter((m) => m.role === 'USER')
      .map((m) => (m.content ?? '').trim());

    if (userContents.length > 0) {
      setOptimisticMessages((prevOpt) => {
        if (prevOpt.length === 0) return prevOpt;
        const remaining = [...prevOpt];
        for (const content of userContents) {
          const idx = remaining.findIndex((o) => o.content.trim() === content);
          if (idx !== -1) remaining.splice(idx, 1);
        }
        return remaining;
      });
    }
  }, []);

  const limpiarHiloActual = useCallback(() => {
    ultimoIdRef.current = null;
    setConvId(null);
    setMessages([]);
    setOptimisticMessages([]);
    setConversation(null);
    setWaitingReply(false);
    setStreamConnected(false);
    setCorte(null);
    setAvisoCierre('');
  }, []);

  // Si el usuario escribe un teléfono que ya tiene conversación WEB activa, cargarla sola
  useEffect(() => {
    const trimmed = phone.trim();
    const norm = normalizarDigitos(trimmed);
    if (convId || norm.length < 7 || sendingRef.current) return undefined;

    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const res = await getConversations(token, {
          search: trimmed,
          channel: 'WEB',
          limit: 8,
        });
        if (cancelado || sendingRef.current) return;
        const match = (res?.data ?? []).find(
          (c) =>
            c.channel === 'WEB' &&
            c.status !== 'CLOSED' &&
            normalizarDigitos(c.externalId) === norm,
        );
        if (match) {
          activePhoneRef.current = trimmed;
          setConvId(match.id);
        }
      } catch {
        // Silencioso: si no hay conversación previa o falla la búsqueda, arranca limpio al enviar
      }
    }, 380);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [phone, convId, token]);

  // Conexión en tiempo real vía SSE sobre la conversación activa
  useEffect(() => {
    if (!convId) {
      setStreamConnected(false);
      return undefined;
    }

    let cancelado = false;
    let stream = null;
    let reintento = null;
    let intentos = 0;
    let historialCargado = false;

    async function refrescarDetalleSilencioso() {
      try {
        const conv = await getConversation(token, convId);
        if (cancelado || !conv) return;
        agregarMensajes(conv.messages ?? []);
        setConversation(conv);
      } catch {
        // Ignorar fallos transitorios de refresco auxiliar
      }
    }

    async function conectar() {
      try {
        if (!historialCargado) {
          setLoadingConv(true);
          const conv = await getConversation(token, convId);
          if (cancelado) return;
          setLoadingConv(false);

          if (conv) {
            agregarMensajes(conv.messages ?? []);
            setConversation(conv);
            if (conv.status !== 'ACTIVE') {
              setWaitingReply(false);
            } else if ((conv.messages ?? []).at(-1)?.role === 'ASSISTANT') {
              setWaitingReply(false);
            }
          }
          historialCargado = true;
        }

        if (cancelado) return;

        stream = await openConversationStream(
          token,
          `/supervisor/conversations/${convId}/stream`,
          {
            after: ultimoIdRef.current ?? undefined,
            onMessage: (m) => {
              if (cancelado) return;
              agregarMensajes([m]);
              if (m.role === 'ASSISTANT') {
                setWaitingReply(false);
                if (m.agentType) {
                  setConversation((prev) =>
                    prev ? { ...prev, currentAgent: m.agentType } : prev,
                  );
                }
              }
            },
            onStatus: (s) => {
              if (cancelado) return;
              setConversation((prev) => (prev ? { ...prev, ...s } : s));
              if (s.status && s.status !== 'ACTIVE') {
                setWaitingReply(false);
              }
              refrescarDetalleSilencioso();
            },
            onClose: ({ conversacionTerminada, abortado }) => {
              if (cancelado || abortado) return;
              setStreamConnected(false);
              if (conversacionTerminada) {
                setWaitingReply(false);
                setAvisoCierre(
                  'Esta conversación se cerró. Escribí un nuevo mensaje para iniciar otra.',
                );
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
        setStreamConnected(true);
        setCorte(null);
      } catch (err) {
        if (cancelado) return;
        setLoadingConv(false);
        setStreamConnected(false);

        if (err.status === 401) {
          setCorte('Tu sesión venció. Volvé a iniciar sesión.');
          return;
        }
        if (err.status === 403) {
          setCorte('Necesitás rol SUPERVISOR para ver esta conversación en vivo.');
          return;
        }
        if (err.status === 404) {
          limpiarHiloActual();
          return;
        }

        setCorte('Reconectando en tiempo real…');
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
  }, [convId, token, agregarMensajes, limpiarHiloActual]);

  // Tope de seguridad para el indicador de escritura ("escribiendo...")
  useEffect(() => {
    if (!waitingReply) return undefined;
    const timer = setTimeout(() => setWaitingReply(false), 45000);
    return () => clearTimeout(timer);
  }, [waitingReply]);

  // Auto-scroll suave al fondo cuando entran mensajes o cambia el indicador de escritura
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, optimisticMessages.length, waitingReply, conversation?.status]);

  // Ajustar altura del textarea automáticamente
  function syncTextareaHeight(target) {
    const el = target ?? textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handlePhoneChange(e) {
    const nuevo = e.target.value;
    setPhone(nuevo);
    if (normalizarDigitos(nuevo) !== normalizarDigitos(activePhoneRef.current)) {
      activePhoneRef.current = nuevo.trim();
      limpiarHiloActual();
    }
  }

  function handleNuevoNumero() {
    const nuevo = generarTelefonoPrueba();
    activePhoneRef.current = nuevo;
    setPhone(nuevo);
    limpiarHiloActual();
    textareaRef.current?.focus();
  }

  async function enviarMensaje(contenidoRaw) {
    const trimmedPhone = phone.trim();
    const msgText = (contenidoRaw ?? text).trim();
    if (!trimmedPhone || !msgText || sendingRef.current) return;

    // Si la conversación anterior estaba cerrada, arrancamos visualmente un hilo limpio
    if (conversation?.status === 'CLOSED') {
      limpiarHiloActual();
    }

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const estabaEnManosHumanas =
      conversation?.status === 'WAITING_HUMAN' ||
      conversation?.status === 'HUMAN_HANDLING';

    sendingRef.current = true;
    setSending(true);
    setCorte(null);
    setAvisoCierre('');
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: 'USER',
        content: msgText,
        createdAt: new Date().toISOString(),
      },
    ]);

    if (!estabaEnManosHumanas) {
      setWaitingReply(true);
    }

    try {
      const res = await simulateMessage(token, {
        phone: trimmedPhone,
        message: msgText,
      });
      activePhoneRef.current = trimmedPhone;

      if (res.conversationId !== convId) {
        ultimoIdRef.current = null;
        setMessages([]);
        setConversation(null);
        setConvId(res.conversationId);
      }
    } catch (err) {
      setWaitingReply(false);
      setOptimisticMessages((prev) => prev.filter((o) => o.id !== tempId));
      setText(msgText);
      setCorte(
        err.status === 403
          ? 'El simulador está disponible únicamente para supervisores.'
          : `No se pudo enviar el mensaje: ${err.message}`,
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    enviarMensaje();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  }

  const feedItems = buildConversationFeed(
    conversation ? { ...conversation, messages } : { messages },
    me,
  );

  const estado = conversation?.status;
  const esEmpleado = conversation?.userType === 'EMPLEADO';
  const areaActual = conversation?.currentAgent
    ? AGENT_META[conversation.currentAgent]
    : null;
  const hayContenido = feedItems.length > 0 || optimisticMessages.length > 0;

  return (
    <div className="sim-page">
      <PageHero
        kicker="Canal conversacional"
        title="Simulador de Chat"
        description="Probá respuestas y derivaciones en tiempo real simulando una conversación desde cualquier número de cliente o empleado."
        action={<InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />}
      />

      {mostrarInfo && (
        <InfoNotes
          title="Simulador de chat en tiempo real"
          onClose={() => setMostrarInfo(false)}
          notes={[
            [
              'Número de cliente vs. empleado.',
              <>
                Si ingresás un número que <strong>no</strong> figura en la nómina de
                empleados, el sistema conversa como con un <strong>cliente</strong> (usa
                solo conocimiento público). Si ingresás el teléfono de un empleado, lo
                reconoce como personal interno.
              </>,
            ],
            [
              'Conexión en vivo.',
              'Las respuestas del asistente y las intervenciones manuales de supervisores aparecen al instante sin recargar.',
            ],
            [
              'Conversación real.',
              'Los mensajes se guardan sobre el hilo Web real de ese número para que puedas verificar todo el flujo en el Panel del Supervisor o en Casos Escalados.',
            ],
          ]}
        />
      )}

      <section className="sim-chat-window" aria-label="Ventana de chat en tiempo real">
        {/* Barra superior: identidad simulada + estado en vivo */}
        <header className="sim-chat-topbar">
          <div className="sim-identity-bar">
            <div
              className={`sim-contact-avatar ${esEmpleado ? 'is-employee' : 'is-client'}`}
              aria-hidden="true"
            >
              {esEmpleado ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              )}
            </div>

            <div className="sim-phone-field">
              <label htmlFor="sim-phone-input" className="sim-phone-label">
                Simulando desde teléfono
              </label>
              <div className="sim-phone-controls">
                <input
                  id="sim-phone-input"
                  type="tel"
                  className="sim-phone-input"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="Ej. 5493764000000"
                  aria-label="Teléfono simulado"
                />
                <button
                  type="button"
                  className="sim-new-phone-btn"
                  onClick={handleNuevoNumero}
                  title="Generar un número de prueba nuevo y empezar una conversación limpia"
                >
                  ↻ Nuevo número
                </button>
              </div>
            </div>
          </div>

          <div className="sim-status-group">
            {conversation?.userType && (
              <span className={`sim-meta-pill ${esEmpleado ? 'is-employee' : 'is-client'}`}>
                {esEmpleado ? 'Empleado' : 'Cliente'}
              </span>
            )}

            {estado === 'WAITING_HUMAN' && (
              <span className="sim-meta-pill is-waiting">Esperando supervisor</span>
            )}
            {estado === 'HUMAN_HANDLING' && (
              <span className="sim-meta-pill is-human">Atendido por supervisor</span>
            )}
            {(!estado || estado === 'ACTIVE') && areaActual && (
              <span className="sim-meta-pill is-agent">Agente · {areaActual.name}</span>
            )}

            <span
              className={`sim-live-badge ${
                streamConnected ? 'is-live' : convId ? 'is-connecting' : 'is-ready'
              }`}
            >
              <span className="sim-live-dot" aria-hidden="true" />
              {streamConnected
                ? 'En vivo'
                : convId
                  ? 'Conectando…'
                  : 'Listo'}
            </span>
          </div>
        </header>

        {corte && (
          <div className="sim-alert-banner" role="status">
            {corte}
          </div>
        )}

        {/* Área central de mensajes */}
        <div className="sim-chat-viewport" ref={viewportRef}>
          {loadingConv && !hayContenido ? (
            <div className="sim-empty-state">
              <p className="sim-empty-subtitle">Cargando conversación…</p>
            </div>
          ) : !hayContenido ? (
            <div className="sim-empty-state">
              <div className="sim-empty-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="sim-empty-title">Iniciá una conversación en vivo</h3>
              <p className="sim-empty-subtitle">
                Escribí abajo como <strong>{phone.trim() || 'un contacto'}</strong> o elegí un mensaje rápido para probar la respuesta del asistente:
              </p>
              <div className="sim-quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="sim-prompt-chip"
                    disabled={!phone.trim() || sending}
                    onClick={() => enviarMensaje(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="sim-messages-feed">
              {feedItems.map((item) => {
                if (item.kind === 'milestone') {
                  return (
                    <div key={item.id} className="sim-milestone-row">
                      <span className={`sim-milestone-pill is-${item.variant}`}>
                        {item.variant === 'takeover' && '🛡️ '}
                        {item.variant === 'release' && '🤖 '}
                        {item.variant === 'escalated' && '⚠️ '}
                        {item.label} ·{' '}
                        {new Date(item.createdAt).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  );
                }

                const { message: m, actor } = item;
                const isUser = m.role === 'USER';

                if (isUser) {
                  return (
                    <div key={item.id} className="sim-msg-row is-outgoing">
                      <div className="sim-bubble is-outgoing">
                        <p className="sim-bubble-text">{m.content}</p>
                        <div className="sim-bubble-foot">
                          <time>
                            {new Date(m.createdAt).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          <span className="sim-msg-check" title="Entregado" aria-hidden="true">
                            ✓✓
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={item.id} className="sim-msg-row is-incoming">
                    <MessageActorAvatar
                      actorType={actor.actorType}
                      accent={actor.accent}
                      bg={actor.bg}
                      border={actor.border}
                    />
                    <div
                      className={`sim-bubble is-incoming ${
                        actor.actorType === 'SUPERVISOR' ? 'is-supervisor' : ''
                      }`}
                    >
                      <div className="sim-bubble-author">
                        <strong>{actor.title}</strong>
                        {actor.actorType === 'SUPERVISOR' && (
                          <span className="sim-author-tag">Intervención humana</span>
                        )}
                      </div>
                      <p className="sim-bubble-text">{m.content}</p>
                      <div className="sim-bubble-foot">
                        <time>
                          {new Date(m.createdAt).toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mensajes salientes optimistas mientras se confirman en el servidor */}
              {optimisticMessages.map((opt) => (
                <div key={opt.id} className="sim-msg-row is-outgoing is-optimistic">
                  <div className="sim-bubble is-outgoing">
                    <p className="sim-bubble-text">{opt.content}</p>
                    <div className="sim-bubble-foot">
                      <time>
                        {new Date(opt.createdAt).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <span className="sim-msg-check is-pending" title="Enviando…" aria-hidden="true">
                        ✓
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Indicador en tiempo real mientras el Agente IA elabora la respuesta */}
              {waitingReply && (
                <div className="sim-msg-row is-incoming" aria-live="polite">
                  <MessageActorAvatar
                    actorType="AGENT"
                    accent={areaActual?.accent ?? '#2563eb'}
                    bg={areaActual?.bgSoft ?? '#eff6ff'}
                    border={areaActual?.borderSoft ?? '#bfdbfe'}
                  />
                  <div className="sim-bubble is-incoming is-typing">
                    <div className="sim-typing-dots" aria-label="El asistente está escribiendo">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="sim-typing-label">
                      {areaActual ? `Agente ${areaActual.name} escribiendo…` : 'Asistente escribiendo…'}
                    </span>
                  </div>
                </div>
              )}

              {estado === 'WAITING_HUMAN' && (
                <div className="sim-human-notice">
                  La consulta quedó derivada a un supervisor. Podés responderla desde{' '}
                  <strong>Casos escalados</strong> y verás llegar el mensaje acá en vivo.
                </div>
              )}

              {estado === 'HUMAN_HANDLING' && (
                <div className="sim-human-notice is-active">
                  Un supervisor tiene tomado el control de esta conversación. Sus respuestas manuales aparecen acá en tiempo real.
                </div>
              )}

              {avisoCierre && (
                <div className="sim-human-notice">{avisoCierre}</div>
              )}
            </div>
          )}
        </div>

        {/* Barra inferior de escritura tipo mensajería instantánea */}
        <footer className="sim-chat-footer">
          <form className="sim-composer-form" onSubmit={handleFormSubmit}>
            <textarea
              ref={textareaRef}
              rows={1}
              className="sim-composer-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                syncTextareaHeight(e.target);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                phone.trim()
                  ? 'Escribí un mensaje… (Enter para enviar)'
                  : 'Ingresá un número de teléfono arriba para empezar…'
              }
              disabled={!phone.trim()}
            />
            <button
              type="submit"
              className="sim-send-btn"
              disabled={sending || !phone.trim() || !text.trim()}
              title="Enviar mensaje"
              aria-label="Enviar mensaje"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="22" y1="2" x2="11" y2="13" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          <p className="sim-composer-hint">
            Canal Web simulado · Los mensajes se registran en el historial real del número{' '}
            <strong>{phone.trim() || 'indicado'}</strong>.
          </p>
        </footer>
      </section>
    </div>
  );
}
