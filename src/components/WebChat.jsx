import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sendWebMessage,
  getWebMessages,
  openConversationStream,
  closeWebConversation,
  delegateFromChat,
  getEmployee,
  listEmployees,
  listSectors,
  ingestKnowledge,
} from '../api';
import {
  etiquetaDeCandidato,
  manejaElArea,
  motivoDeBloqueo,
  ordenarCandidatos,
  puedeEscribirEn,
} from '../areas';
import { AGENT_META, buildConversationFeed } from '../conversationHelpers';
import { MessageActorAvatar } from './ConversationThread';
import InfoNotes, { InfoToggle } from './InfoNotes';
import PageHero from './PageHero';
import { buildConversationMarkdown } from '../chatExport';
import ChatExportMenu from './ChatExportMenu';

const claveDeConversacion = (employeeId) =>
  `trimia:webchat:conversacion:${employeeId ?? 'anon'}`;

const esperaDeReintento = (intentos) => Math.min(1000 * 2 ** intentos, 15000);

const QUICK_EMPLOYEE_PROMPTS = [
  '¿Cuáles son los requisitos para aprobar una financiación?',
  '¿Cómo se valida un comprobante de pago en cobranzas?',
  '¿Cuál es el procedimiento ante una consulta sin stock?',
];

/**
 * ¿Este mensaje es el aviso de baja confianza que recibe un responsable?
 *
 * Se reconoce por el texto que envía el backend cuando ningún documento supera
 * el umbral de similitud para un supervisor.
 */
function esInformeDeBajaConfianza(m) {
  if (m.role !== 'ASSISTANT') return false;
  const t = m.content ?? '';
  return (
    t.includes('umbral de') &&
    (t.includes('Esto es lo que consulté') ||
      t.includes('no devolvió ningún documento parecido'))
  );
}

/**
 * Chat con el Asistente (canal web interno del empleado autenticado).
 */
export default function WebChat({ token, me }) {
  const [text, setText] = useState('');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const claveConv = claveDeConversacion(me?.id);
  const [convId, setConvId] = useState(() => localStorage.getItem(claveConv));
  const [messages, setMessages] = useState([]);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [esperandoRespuesta, setEsperandoRespuesta] = useState(false);
  const [error, setError] = useState(null);
  const [corte, setCorte] = useState(null);
  const [aviso, setAviso] = useState(null);

  const ultimoIdRef = useRef(null);
  const sendingRef = useRef(false);
  const viewportRef = useRef(null);
  const textareaRef = useRef(null);

  const [misAreas, setMisAreas] = useState(null);
  const [totalAreas, setTotalAreas] = useState(0);

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

  const olvidarConversacion = useCallback(() => {
    localStorage.removeItem(claveConv);
    ultimoIdRef.current = null;
    setConvId(null);
    setMessages([]);
    setOptimisticMessages([]);
    setConversation(null);
    setStreamConnected(false);
    setEsperandoRespuesta(false);
  }, [claveConv]);

  useEffect(() => {
    if (!me || me.role !== 'SUPERVISOR') return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, sectores]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
        setTotalAreas(sectores.length);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token, me]);

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

    async function conectar() {
      try {
        if (!historialCargado) {
          setLoadingConv(true);
          const res = await getWebMessages(token, convId, { limit: 100 });
          if (cancelado) return;
          setLoadingConv(false);
          agregarMensajes(res.data ?? []);
          setConversation(res.conversation);
          if (res.conversation?.status && res.conversation.status !== 'ACTIVE') {
            setEsperandoRespuesta(false);
          } else if ((res.data ?? []).at(-1)?.role === 'ASSISTANT') {
            setEsperandoRespuesta(false);
          }
          historialCargado = true;
        }

        if (cancelado) return;

        stream = await openConversationStream(
          token,
          `/messaging/web/${convId}/stream`,
          {
            after: ultimoIdRef.current ?? undefined,
            onMessage: (m) => {
              if (cancelado) return;
              agregarMensajes([m]);
              if (m.role === 'ASSISTANT') {
                setEsperandoRespuesta(false);
                if (m.agentType) {
                  setConversation((c) =>
                    c ? { ...c, currentAgent: m.agentType } : c,
                  );
                }
              }
            },
            onStatus: (s) => {
              if (cancelado) return;
              setConversation((c) => ({ ...c, ...s }));
              if (s.status !== 'ACTIVE') setEsperandoRespuesta(false);
            },
            onClose: ({ conversacionTerminada, abortado }) => {
              if (cancelado || abortado) return;
              setStreamConnected(false);

              if (conversacionTerminada) {
                setAviso(
                  'La conversación se terminó. El próximo mensaje empieza una nueva.',
                );
                olvidarConversacion();
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
          setCorte({
            tipo: 'sesion',
            texto: 'Tu sesión venció. Volvé a entrar para seguir recibiendo mensajes.',
          });
          return;
        }

        if (err.status === 403 || err.status === 404) {
          setCorte({
            tipo: 'permiso',
            texto: 'Ya no podés ver esta conversación. Empezá una nueva escribiendo un mensaje.',
          });
          olvidarConversacion();
          return;
        }

        setCorte({
          tipo: 'red',
          texto: 'Sin conexión con el servidor. Reintentando…',
        });
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
  }, [convId, token, agregarMensajes, olvidarConversacion]);

  // Tope de seguridad para el indicador de escritura
  useEffect(() => {
    if (!esperandoRespuesta) return undefined;
    const timer = setTimeout(() => setEsperandoRespuesta(false), 45000);
    return () => clearTimeout(timer);
  }, [esperandoRespuesta]);

  // Auto-scroll suave al fondo cuando llegan mensajes o cambia el estado
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [
    messages.length,
    optimisticMessages.length,
    esperandoRespuesta,
    conversation?.status,
  ]);

  function syncTextareaHeight(target) {
    const el = target ?? textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const estado = conversation?.status;
  const enManosDeUnaPersona =
    estado === 'WAITING_HUMAN' || estado === 'HUMAN_HANDLING';
  const ultimoMensaje = messages.at(-1);
  const ultimoEsInforme =
    !!ultimoMensaje &&
    !enManosDeUnaPersona &&
    esInformeDeBajaConfianza(ultimoMensaje);

  const areaActual = conversation?.currentAgent
    ? AGENT_META[conversation.currentAgent]
    : null;

  const feedItems = buildConversationFeed(
    conversation
      ? {
          ...conversation,
          userType: conversation.userType ?? 'EMPLEADO',
          messages,
        }
      : { userType: 'EMPLEADO', messages },
    me,
  );

  const hayContenido = feedItems.length > 0 || optimisticMessages.length > 0;
  const displayName = me?.name || me?.email || 'Empleado';

  async function enviarMensaje(contenidoRaw) {
    const msgText = (contenidoRaw ?? text).trim();
    if (!msgText || sendingRef.current) return;

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    sendingRef.current = true;
    setSending(true);
    setError(null);
    setAviso(null);
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

    if (!enManosDeUnaPersona) {
      setEsperandoRespuesta(true);
    }

    try {
      const res = await sendWebMessage(token, msgText);
      if (res.conversationId !== convId) {
        localStorage.setItem(claveConv, res.conversationId);
        setConvId(res.conversationId);
      }
    } catch (err) {
      setEsperandoRespuesta(false);
      setOptimisticMessages((prev) => prev.filter((o) => o.id !== tempId));
      setText(msgText);
      setError(err);
    } finally {
      sendingRef.current = false;
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleSend(e) {
    e.preventDefault();
    enviarMensaje();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
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
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="webchat-page sim-page">
      <PageHero
        kicker="Asistente virtual"
        title="Chat con el Asistente"
        description={`Conversás como ${displayName}. El asistente te reconoce como empleado y responde consultas con conocimiento interno.`}
        action={
          <InfoToggle
            open={mostrarInfo}
            onToggle={() => setMostrarInfo((v) => !v)}
          />
        }
      />

      {mostrarInfo && (
        <InfoNotes
          title="Chat con el asistente"
          onClose={() => setMostrarInfo(false)}
          notes={[
            [
              'Conversás como vos mismo.',
              'El asistente te reconoce como empleado y puede usar procedimientos, políticas y conocimiento interno.',
            ],
            [
              'Hilo independiente.',
              'Es un hilo aparte del de WhatsApp, aunque los dos estén asociados a tu perfil.',
            ],
            [
              'Mejora continua.',
              'Si sos supervisor y una consulta no supera el umbral de confianza, podés cargar conocimiento o derivarla desde el mismo chat.',
            ],
          ]}
        />
      )}

      <section
        className="sim-chat-window webchat-window"
        aria-label="Ventana de chat con el asistente"
      >
        {/* Barra superior de identidad del empleado + estado en tiempo real */}
        <header className="sim-chat-topbar">
          <div className="sim-identity-bar">
            <div
              className="sim-contact-avatar is-employee"
              aria-hidden="true"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>

            <div className="sim-phone-field">
              <span className="sim-phone-label">Canal Web interno</span>
              <div className="sim-phone-controls">
                <strong className="webchat-user-title">{displayName}</strong>
                {me?.sectorName && (
                  <span className="webchat-sector-tag">{me.sectorName}</span>
                )}
                {convId && (
                  <button
                    type="button"
                    className="sim-new-phone-btn"
                    onClick={handleClose}
                    disabled={enManosDeUnaPersona}
                    title={
                      enManosDeUnaPersona
                        ? 'No podés terminarla mientras un responsable la está atendiendo'
                        : 'Terminar la conversación actual y empezar un hilo limpio'
                    }
                  >
                    ↻ Nueva conversación
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="sim-status-group">
            <span className="sim-meta-pill is-employee">Personal interno</span>

            {estado === 'WAITING_HUMAN' && (
              <span className="sim-meta-pill is-waiting">
                Esperando responsable
              </span>
            )}
            {estado === 'HUMAN_HANDLING' && (
              <span className="sim-meta-pill is-human">
                Atendido por responsable
              </span>
            )}
            {(!estado || estado === 'ACTIVE') && areaActual && (
              <span className="sim-meta-pill is-agent">
                Agente · {areaActual.name}
              </span>
            )}

            <span
              className={`sim-live-badge ${
                streamConnected
                  ? 'is-live'
                  : convId
                    ? 'is-connecting'
                    : 'is-ready'
              }`}
            >
              <span className="sim-live-dot" aria-hidden="true" />
              {streamConnected
                ? 'En vivo'
                : convId
                  ? 'Conectando…'
                  : 'Listo'}
            </span>

            <ChatExportMenu
              filename={`asistente-${displayName}`}
              disabled={!hayContenido}
              getMarkdown={() =>
                buildConversationMarkdown({
                  title: `Chat con el Asistente — ${displayName}`,
                  contactLabel: displayName,
                  conversation: conversation
                    ? {
                        ...conversation,
                        userType: conversation.userType ?? 'EMPLEADO',
                        channel: 'WEB',
                      }
                    : { userType: 'EMPLEADO', channel: 'WEB' },
                  messages,
                  optimisticMessages,
                  me,
                })
              }
            />
          </div>
        </header>

        {/* Alertas de sesión, red, falta de teléfono (409) o avisos */}
        {error && (
          <div className="sim-alert-banner" role="alert">
            {error.message}
          </div>
        )}

        {corte && (
          <div
            className={`sim-alert-banner${
              corte.tipo === 'red' ? ' is-soft' : ''
            }`}
            role="status"
          >
            {corte.texto}
          </div>
        )}

        {aviso && (
          <div className="webchat-success-banner" role="status">
            <span>✓ {aviso}</span>
            <button
              type="button"
              className="fin-banner-dismiss"
              onClick={() => setAviso(null)}
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        )}

        {/* Área central de conversación */}
        <div className="sim-chat-viewport" ref={viewportRef}>
          {loadingConv && !hayContenido ? (
            <div className="sim-empty-state">
              <p className="sim-empty-subtitle">Cargando conversación…</p>
            </div>
          ) : !hayContenido ? (
            <div className="sim-empty-state">
              <div className="sim-empty-icon" aria-hidden="true">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="sim-empty-title">Consultá al Asistente Interno</h3>
              <p className="sim-empty-subtitle">
                Hacé preguntas sobre operatoria, reglas de negocio, cobranzas,
                stock o financiación usando la base de conocimiento interna:
              </p>
              <div className="sim-quick-prompts">
                {QUICK_EMPLOYEE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="sim-prompt-chip"
                    disabled={sending}
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
                          <span
                            className="sim-msg-check"
                            title="Entregado"
                            aria-hidden="true"
                          >
                            ✓✓
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                const esInforme = esInformeDeBajaConfianza(m);

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
                      } ${esInforme ? 'is-lowconf' : ''}`.trim()}
                    >
                      <div className="sim-bubble-author">
                        <strong>{actor.title}</strong>
                        {actor.actorType === 'SUPERVISOR' && (
                          <span className="sim-author-tag">
                            Intervención humana
                          </span>
                        )}
                        {esInforme && (
                          <span className="webchat-lowconf-tag">
                            Diagnóstico de cobertura
                          </span>
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

              {/* Mensajes salientes optimistas mientras responde el servidor */}
              {optimisticMessages.map((opt) => (
                <div
                  key={opt.id}
                  className="sim-msg-row is-outgoing is-optimistic"
                >
                  <div className="sim-bubble is-outgoing">
                    <p className="sim-bubble-text">{opt.content}</p>
                    <div className="sim-bubble-foot">
                      <time>
                        {new Date(opt.createdAt).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <span
                        className="sim-msg-check is-pending"
                        title="Enviando…"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Acciones para supervisores tras un informe de baja confianza */}
              {ultimoEsInforme && (
                <AccionesDelInforme
                  token={token}
                  convId={convId}
                  me={me}
                  agentType={conversation?.currentAgent ?? null}
                  misAreas={misAreas}
                  totalAreas={totalAreas}
                  onHecho={(texto) => setAviso(texto)}
                />
              )}

              {/* Indicador de escritura en vivo */}
              {esperandoRespuesta && !enManosDeUnaPersona && (
                <div className="sim-msg-row is-incoming" aria-live="polite">
                  <MessageActorAvatar
                    actorType="AGENT"
                    accent={areaActual?.accent ?? '#2563eb'}
                    bg={areaActual?.bgSoft ?? '#eff6ff'}
                    border={areaActual?.borderSoft ?? '#bfdbfe'}
                  />
                  <div className="sim-bubble is-incoming is-typing">
                    <div
                      className="sim-typing-dots"
                      aria-label="El asistente está preparando la respuesta"
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="sim-typing-label">
                      {areaActual
                        ? `Agente ${areaActual.name} preparando respuesta…`
                        : 'El asistente está preparando la respuesta…'}
                    </span>
                  </div>
                </div>
              )}

              {estado === 'WAITING_HUMAN' && (
                <div className="sim-human-notice">
                  Tu consulta pasó a un responsable y está esperando a que alguien
                  la tome. Podés seguir escribiendo y queda registrado en el hilo.
                </div>
              )}

              {estado === 'HUMAN_HANDLING' && (
                <div className="sim-human-notice is-active">
                  Un responsable está atendiendo tu consulta en este momento. Sus
                  respuestas aparecen acá en vivo.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barra inferior de escritura estilo mensajería moderna */}
        <footer className="sim-chat-footer">
          <form className="sim-composer-form" onSubmit={handleSend}>
            <textarea
              ref={textareaRef}
              rows={1}
              className="sim-composer-input"
              aria-label="Mensaje para el asistente"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                syncTextareaHeight(e.target);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu consulta… (Enter para enviar, Shift+Enter para salto de línea)"
            />
            <button
              type="submit"
              className="sim-send-btn"
              disabled={sending || !text.trim()}
              title="Enviar mensaje"
              aria-label="Enviar mensaje"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <line
                  x1="22"
                  y1="2"
                  x2="11"
                  y2="13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polygon
                  points="22 2 15 22 11 13 2 9 22 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
          <p className="sim-composer-hint">
            Canal Web interno · Conversación asociada a{' '}
            <strong>{displayName}</strong> con acceso a conocimiento interno.
          </p>
        </footer>
      </section>
    </div>
  );
}

/**
 * Acciones disponibles para un supervisor después del informe de baja confianza.
 */
function AccionesDelInforme({
  token,
  convId,
  me,
  agentType,
  misAreas,
  totalAreas,
  onHecho,
}) {
  const [abierto, setAbierto] = useState(null); // null | 'cargar' | 'derivar'

  if (misAreas === null) return null;

  const puedeEscribir = puedeEscribirEn(misAreas, totalAreas, agentType);
  const motivo = motivoDeBloqueo(misAreas, totalAreas, agentType);

  return (
    <div className="webchat-report-card">
      <p className="webchat-report-hint">
        El asistente no alcanzó el umbral de confianza. Podés cargar o corregir el
        conocimiento del área, o derivar la consulta a quien corresponda:
      </p>

      <div className="webchat-report-actions">
        <button
          type="button"
          onClick={() => setAbierto(abierto === 'cargar' ? null : 'cargar')}
          disabled={!puedeEscribir}
          title={puedeEscribir ? undefined : motivo}
        >
          Cargar o corregir el conocimiento
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setAbierto(abierto === 'derivar' ? null : 'derivar')}
        >
          Derivar a otra persona
        </button>
      </div>

      {!puedeEscribir && <p className="webchat-report-lock">{motivo}</p>}

      {abierto === 'cargar' && (
        <FormularioDeCarga
          token={token}
          agentType={agentType}
          onHecho={() => {
            setAbierto(null);
            onHecho(
              'Documento cargado. Volvé a preguntar para verificar si ahora alcanza el umbral.',
            );
          }}
        />
      )}
      {abierto === 'derivar' && (
        <FormularioDeDerivacion
          token={token}
          convId={convId}
          me={me}
          agentType={agentType}
          onHecho={(nombre) => {
            setAbierto(null);
            onHecho(
              `Consulta derivada a ${nombre}. Le llega el caso con lo que preguntaste.`,
            );
          }}
        />
      )}
    </div>
  );
}

/** Alta rápida de documento en el área del agente que respondió. */
function FormularioDeCarga({ token, agentType, onHecho }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState('INTERNO');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await ingestKnowledge(token, {
        title,
        content,
        category,
        audience,
        agentType,
      });
      onHecho();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="webchat-inline-form" onSubmit={guardar}>
      <p className="webchat-report-hint">
        Se cargará en el área <strong>{agentType ?? 'transversal'}</strong>, que es
        la del agente que intentó responder.
      </p>
      <div className="webchat-inline-grid">
        <div className="field">
          <label>Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Categoría</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="field">
          <label>Audiencia</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="INTERNO">INTERNO — solo empleados</option>
            <option value="PUBLICO">PUBLICO — también los clientes</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Contenido</label>
        <textarea
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button
        type="submit"
        disabled={guardando || !title || !category || !content}
      >
        {guardando ? 'Guardando…' : 'Guardar documento'}
      </button>
    </form>
  );
}

/** Derivación a otro supervisor activo. */
function FormularioDeDerivacion({ token, convId, me, agentType, onHecho }) {
  const [candidatos, setCandidatos] = useState([]);
  const [elegido, setElegido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    listEmployees(token)
      .then((todos) => {
        if (!vigente) return;
        const elegibles = todos.filter(
          (e) => e.role === 'SUPERVISOR' && e.isActive && e.id !== me?.id,
        );
        setCandidatos(ordenarCandidatos(elegibles, agentType));
      })
      .catch((err) => vigente && setError(err.message));
    return () => {
      vigente = false;
    };
  }, [token, me, agentType]);

  async function derivar() {
    setEnviando(true);
    setError('');
    try {
      await delegateFromChat(token, convId, elegido);
      onHecho(candidatos.find((c) => c.id === elegido)?.name ?? 'esa persona');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const elegidoFueraDelArea =
    !!elegido &&
    !!agentType &&
    !manejaElArea(
      candidatos.find((c) => c.id === elegido) ?? {},
      agentType,
    );

  return (
    <div className="webchat-inline-form">
      <p className="webchat-report-hint">
        La consulta fue atendida por <strong>{agentType ?? 'el asistente'}</strong>.
        La conversación quedará esperando la respuesta del responsable elegido.
      </p>
      <div className="field">
        <label>¿A quién derivar?</label>
        <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
          <option value="">Elegir…</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaDeCandidato(c, agentType)}
            </option>
          ))}
        </select>
      </div>

      {elegidoFueraDelArea && (
        <p className="webchat-report-lock">
          Esa persona no supervisa {agentType}: podrá responderte, pero no dejar la
          respuesta como conocimiento de esa área (★ marca quienes sí la manejan).
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={derivar} disabled={enviando || !elegido}>
        {enviando ? 'Derivando…' : 'Derivar consulta'}
      </button>
    </div>
  );
}
