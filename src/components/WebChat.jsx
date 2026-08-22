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

/**
 * Dónde se recuerda la conversación entre recargas.
 *
 * Sin esto, recargar la página perdía el `convId` y no había forma de volver a
 * engancharse al hilo: el backend no expone "dame mi conversación actual", el id
 * solo sale al enviar un mensaje. Y justamente el caso que más importa demostrar
 * —que la respuesta de un supervisor llega sola— pide tener el chat abierto sin
 * escribir nada.
 */
/**
 * La clave lleva el id de la persona.
 *
 * Con una clave única para todo el panel, cambiar de usuario en el mismo navegador
 * dejaba el `convId` del anterior: la pantalla arrancaba pidiendo una conversación
 * ajena y el backend contestaba 403 —correctamente— con un cartel de error apenas
 * entrabas. Se recupera solo, pero es un susto gratis y ensucia la consola.
 */
const claveDeConversacion = (employeeId) =>
  `trimia:webchat:conversacion:${employeeId ?? 'anon'}`;

/** Espera creciente entre reintentos de reconexión, con techo. */
const esperaDeReintento = (intentos) => Math.min(1000 * 2 ** intentos, 15000);

/**
 * ¿Este mensaje es el aviso de baja confianza que recibe un responsable?
 *
 * ⚠️ **Se reconoce por el texto, y eso es una limitación conocida.** El aviso viaja
 * como un mensaje del asistente igual que cualquier otro —el backend no marca los
 * mensajes con un tipo—, así que no hay nada más firme para engancharse. Lo que sí
 * está elegido es el **modo de fallar**: si el texto del backend cambia, esto deja
 * de coincidir y el mensaje se muestra como un mensaje normal, sin acciones. Nunca
 * al revés. Un aviso sin botones es un inconveniente; un mensaje cualquiera
 * disfrazado de informe sería mentira.
 *
 * Lo robusto sería que el backend marcara el mensaje; queda anotado por si el aviso
 * pasa de banco de pruebas a algo que alguien usa en serio.
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
export default function WebChat({ token, me }) {
  const [text, setText] = useState('');
  const claveConv = claveDeConversacion(me?.id);
  const [convId, setConvId] = useState(() => localStorage.getItem(claveConv));
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

  /**
   * De qué áreas es responsable quien está logueado, y cuántas existen.
   *
   * Sale de `GET /employees/:id`, **no del token**: las áreas no viajan en la
   * sesión a propósito. Solo se usa para habilitar o deshabilitar un botón con el
   * motivo a la vista — quien decide de verdad sigue siendo el backend.
   */
  const [misAreas, setMisAreas] = useState(null);
  const [totalAreas, setTotalAreas] = useState(0);

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

  // `useCallback` porque el efecto del stream la usa: sin una referencia estable,
  // cada render reabriría la conexión. `claveConv` no cambia dentro de una sesión.
  const olvidarConversacion = useCallback(() => {
    localStorage.removeItem(claveConv);
    ultimoIdRef.current = null;
    setConvId(null);
    setMessages([]);
    setConversation(null);
    setEsperandoRespuesta(false);
  }, [claveConv]);

  useEffect(() => {
    // Solo un responsable recibe el aviso de baja confianza y solo él puede
    // derivar o escribir conocimiento; para un empleado común no hace falta.
    if (!me || me.role !== 'SUPERVISOR') return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, sectores]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
        setTotalAreas(sectores.length);
      })
      // Que falle no puede romper el chat: sin esto simplemente no se ofrecen
      // las acciones, y el chat sigue funcionando igual.
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token, me]);

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
  }, [convId, token, olvidarConversacion]);

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
        localStorage.setItem(claveConv, res.conversationId);
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
  const ultimoMensaje = messages.at(-1);
  const ultimoEsInforme =
    !!ultimoMensaje && !enManosDeUnaPersona && esInformeDeBajaConfianza(ultimoMensaje);

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
              {/* El aviso de baja confianza se muestra distinto porque ES distinto:
                  no es un error ni una escalación, es información para decidir. Va
                  con el salto de línea respetado —la lista de documentos con su
                  score se lee como lista— y en tono neutro. Un cartel rojo de fallo
                  lograría que se lo saltee, que es justo lo contrario de para lo
                  que existe. */}
              {esInformeDeBajaConfianza(m) ? (
                <div className="hint" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {m.content}
                </div>
              ) : (
                m.content
              )}
              <div className="msg-time">{new Date(m.createdAt).toLocaleTimeString()}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Las dos acciones que corresponden después del aviso (US4, CL-2). Se
          ofrecen solo cuando el último mensaje ES el aviso: sueltas en cualquier
          momento serían ruido. */}
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

/**
 * Qué se puede hacer después del aviso de baja confianza (spec 005, US4/US5).
 *
 * Dos caminos, y cuál corresponde depende de **de quién es el tema**:
 *
 * - si el área del agente que respondió es una de las propias → cargar o corregir
 *   el documento acá mismo;
 * - si es de otra → derivarle la consulta a quien sí la maneja.
 *
 * El que no corresponde queda **deshabilitado con el motivo a la vista**, no
 * escondido: el backend lo va a rechazar igual, y enterarse por un error después de
 * escribir un documento entero es peor que verlo de entrada.
 */
function AccionesDelInforme({ token, convId, me, agentType, misAreas, totalAreas, onHecho }) {
  const [abierto, setAbierto] = useState(null); // null | 'cargar' | 'derivar'

  // Mientras las áreas no cargaron no se afirma nada: ni habilitado ni el motivo.
  if (misAreas === null) return null;

  const puedeEscribir = puedeEscribirEn(misAreas, totalAreas, agentType);
  const motivo = motivoDeBloqueo(misAreas, totalAreas, agentType);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="hint">
        El asistente no llegó al umbral. Lo que sigue lo decidís vos: si el dato
        falta, cargalo; si está y quedó corto, corregilo; si el tema no es tuyo,
        pasáselo a quien lo maneja.
      </p>

      <button
        onClick={() => setAbierto(abierto === 'cargar' ? null : 'cargar')}
        disabled={!puedeEscribir}
        title={puedeEscribir ? undefined : motivo}
      >
        Cargar o corregir el conocimiento
      </button>
      <button
        className="secondary"
        onClick={() => setAbierto(abierto === 'derivar' ? null : 'derivar')}
        style={{ marginLeft: 8 }}
      >
        Derivar a otra persona
      </button>

      {/* El motivo se muestra, no solo se pone en un title: un botón gris sin
          explicación se lee como que la pantalla está rota. */}
      {!puedeEscribir && (
        <p className="hint" style={{ marginTop: 8 }}>{motivo}</p>
      )}

      {abierto === 'cargar' && (
        <FormularioDeCarga
          token={token}
          agentType={agentType}
          onHecho={() => {
            setAbierto(null);
            onHecho('Documento cargado. Volvé a preguntar para ver si ahora alcanza el umbral.');
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
            onHecho(`Consulta derivada a ${nombre}. Le llega el caso con lo que preguntaste.`);
          }}
        />
      )}
    </div>
  );
}

/** Alta de un documento en el área del agente que respondió. */
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
      await ingestKnowledge(token, { title, content, category, audience, agentType });
      onHecho();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ marginTop: 12 }}>
      <p className="hint">
        Se carga en el área <strong>{agentType ?? 'transversal'}</strong>, que es la
        del agente que intentó responder.
      </p>
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
      <div className="field">
        <label>Contenido</label>
        <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={guardando || !title || !category || !content}>
        {guardando ? 'Guardando…' : 'Guardar documento'}
      </button>
    </form>
  );
}

/** Derivación a otro responsable. El texto de la consulta lo saca el backend. */
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
        // Solo supervisores activos, y nunca uno mismo: el backend rechaza las
        // dos cosas con 409, y derivarse el caso a uno mismo es exactamente el
        // problema que esta parte del sistema vino a sacar.
        const elegibles = todos.filter(
          (e) => e.role === 'SUPERVISOR' && e.isActive && e.id !== me?.id,
        );
        // Primero quien maneja el área del caso. Ordena, no filtra: responder no
        // está restringido por área, y filtrar dejaría sin salida a un caso de un
        // área sin supervisor activo.
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
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        La consulta la atendió <strong>{agentType ?? 'el asistente'}</strong>. Le
        llega el caso con lo que preguntaste, tal cual. La conversación queda
        esperando a que esa persona responda.
      </p>
      <div className="field">
        <label>¿A quién?</label>
        <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
          <option value="">Elegir…</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaDeCandidato(c, agentType)}
            </option>
          ))}
        </select>
      </div>

      {/* Se puede derivar fuera del área —responder no está restringido— pero
          conviene saberlo: esa persona va a poder contestar y NO va a poder dejar
          la respuesta como conocimiento del área, que suele ser la mitad que
          importa de un caso así. */}
      {elegidoFueraDelArea && (
        <p className="hint">
          Esa persona no es responsable de {agentType}: va a poder responder, pero
          no va a poder dejar la respuesta como conocimiento de esa área. El ★ marca
          a quienes sí la manejan.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button onClick={derivar} disabled={enviando || !elegido}>
        {enviando ? 'Derivando…' : 'Derivar'}
      </button>
    </div>
  );
}
