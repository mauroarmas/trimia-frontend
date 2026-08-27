import { useEffect, useRef, useState } from 'react';
import {
  openInterview,
  getInterview,
  answerInterview,
  skipInterviewQuestion,
  finishInterview,
  listSectors,
} from '../api';
import InterviewReview from './InterviewReview';

const POLL_MS = 2000;

const KIND_LABEL = {
  PEDIR_NUEVO: 'No hay ningún documento sobre esto',
  CORREGIR: 'Hay un documento, pero quedó corto',
  GENERALIZAR: 'Un caso ya se resolvió así',
  ABIERTA: 'Nadie contestó esto todavía',
};

/**
 * "Entrevista desde el tráfico real" (spec 010, RF11): las preguntas salen
 * de lo que el agente realmente no pudo contestar, no de un cuestionario a
 * ciegas por área.
 *
 * Dos jobs enmarcan un bucle sincrónico (D4, sin stream): abrir redacta las
 * preguntas de una pasada; contestar/saltear no llaman al modelo, así que
 * el poll de `GET /interviews/:id` solo hace falta mientras `PREPARANDO` o
 * `CERRANDO`.
 */
export default function Interview({ token, me, start, onSalir }) {
  // Spec 011: ya no hace falta saber de qué áreas es responsable — el área
  // viene elegida desde la lista y el backend la verifica igual. Los sectores
  // se traen solo para poner el nombre del área en el título.
  const [sectors, setSectors] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 422: TODO_CUBIERTO / YA_ENTREVISTADO. Spec 011: SIN_CORRIDA y
  // SIN_MUESTRA_SUFICIENTE dejaron de ser motivos — las otras dos fuentes de
  // la lista no dependen del barrido de cobertura.
  const [notice, setNotice] = useState(null);
  // Spec 011: se retomó una sesión que ya estaba abierta en vez de abrir una
  // sobre el ítem elegido. Hay que DECIRLO — ver `handleOpen`.
  const [retomada, setRetomada] = useState(false);

  useEffect(() => {
    if (!me) return undefined;
    let vigente = true;
    listSectors(token)
      .then((secs) => {
        if (!vigente) return;
        setSectors(secs);
      })
      .catch((err) => setError(err.message));
    return () => {
      vigente = false;
    };
  }, [token, me]);

  // Poll solo mientras PREPARANDO/CERRANDO: son los dos únicos momentos en
  // que el job todavía puede estar trabajando (D4).
  useEffect(() => {
    if (!sessionId) return undefined;
    if (session && session.status !== 'PREPARANDO' && session.status !== 'CERRANDO') {
      return undefined;
    }
    const id = setInterval(async () => {
      try {
        const s = await getInterview(token, sessionId);
        setSession(s);
      } catch (err) {
        setError(err.message);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token, sessionId, session]);

  // Spec 011: llegada desde la lista de mejoras con el ÍTEM elegido. Ya no
  // hace falta resolver agentType→sector: el sector viene dado, y el `itemId`
  // hace que la entrevista sea sobre ESE ítem y no sobre "algo del área".
  //
  // ⚠️ El "una sola vez" se marca con un ref, NO limpiando el valor en el
  // padre: allá es lo que decide qué pantalla se monta, así que limpiarlo
  // desmontaba esta antes de que la sesión llegara a abrirse.
  const yaAbierto = useRef(false);
  useEffect(() => {
    if (!start || sessionId || yaAbierto.current) return;
    yaAbierto.current = true;
    handleOpen(start.sectorId, start.itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, sessionId]);

  async function handleOpen(sectorId, itemId) {
    setError('');
    setNotice(null);
    setLoading(true);
    try {
      const opened = await openInterview(token, sectorId, itemId);
      setSessionId(opened.id);
      setSession(opened);
    } catch (err) {
      // 409: ya hay una sesión sin cerrar para esta área — se retoma, no es
      // un error (FR-003, "se le devuelve la que ya tenía").
      //
      // ⚠️ Spec 011: acá SÍ hay que avisar. Antes se llegaba eligiendo un
      // área, y retomar "tu entrevista de Ventas" se entendía solo. Ahora se
      // llega apretando un ítem concreto, así que quien esperaba hablar de
      // "Horarios de atención" se encuentra preguntas de otra cosa. Retomar
      // sigue siendo lo correcto; callarlo, no.
      if (err.status === 409 && err.body?.session?.id) {
        setRetomada(Boolean(itemId));
        setSessionId(err.body.session.id);
        try {
          const s = await getInterview(token, err.body.session.id);
          setSession(s);
        } catch (err2) {
          setError(err2.message);
        }
      } else if (err.status === 422) {
        setNotice({ reason: err.body?.reason, message: err.body?.message || err.message });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Spec 012: `history` NO viaja en la respuesta de answer/skip — solo en
  // `GET /interviews/:id`. Y el poll está apagado durante `EN_CURSO` (D4), que
  // es justo cuando se contesta. Sin este refetch el historial se congelaría
  // en lo que había al abrir: se vería la conversación de hace tres preguntas.
  //
  // Se aplica primero lo que ya vino en la respuesta (así la pregunta cambia
  // sin esperar al GET) y después llega el historial fresco.
  async function handleAnswered(next) {
    setSession((prev) => ({
      ...prev,
      progress: next.progress,
      current: next.next,
      status: next.status,
    }));
    try {
      const s = await getInterview(token, sessionId);
      setSession(s);
    } catch (err) {
      // El historial quedó viejo, pero la respuesta se guardó: no es un error
      // que valga la pena tirarle encima a quien está contestando.
      setError(err.message);
    }
  }

  function handleReset() {
    setSessionId(null);
    setSession(null);
    setNotice(null);
    setError('');
    setRetomada(false);
    // Spec 011: volver es volver a la LISTA, no a un selector de área. No se
    // entra a una entrevista en abstracto; se entra desde un ítem concreto.
    onSalir?.();
  }

  if (sectors === null) return <p className="hint">Cargando…</p>;

  // Spec 011: acá ya no se elige área — se llega siempre desde un ítem de la
  // lista de mejoras. Lo único que puede pasar sin sesión es que el backend
  // haya dicho que no hay con qué preguntar (422).
  if (!sessionId) {
    return (
      <div className="card">
        <h3>Entrevista</h3>
        {loading && <p className="hint">Abriendo…</p>}
        {error && <p className="error">{error}</p>}
        {notice && <NoticeCard notice={notice} />}
        {!loading && (
          <button className="secondary" onClick={handleReset}>
            Volver a la lista
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <h3 style={{ margin: 0 }}>Entrevista — {session?.sector?.id ? sectorName(sectors, session.sector.id) : '…'}</h3>
        <button className="secondary" onClick={handleReset}>Volver a la lista</button>
      </div>

      {retomada && (
        <p className="hint" style={{ marginTop: 8 }}>
          Ya tenías una entrevista sin cerrar de esta área, así que seguimos con
          esa. Terminala o dejala, y después volvé por el ítem que elegiste.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {!session && <p className="hint">Cargando…</p>}

      {session?.status === 'PREPARANDO' && (
        <p className="hint">Redactando las preguntas… esto tarda unos segundos.</p>
      )}

      {session?.status === 'FALLIDA' && (
        <p className="error">No se pudo armar la entrevista: {session.failureReason}</p>
      )}

      {session?.status === 'CERRANDO' && (
        <p className="hint">Armando las fichas a partir de lo que se respondió…</p>
      )}

      {session?.status === 'ABANDONADA' && (
        <div>
          <p className="hint">
            Esta entrevista quedó sin actividad y pasó a abandonada — ya no
            admite respuestas nuevas. Lo que se alcanzó a responder se puede
            cerrar igual, para que llegue a revisión.
          </p>
          <FinishButton
            token={token}
            sessionId={sessionId}
            progress={session.progress}
            onFinished={setSession}
            onError={setError}
          />
        </div>
      )}

      {session?.status === 'EN_CURSO' && (
        <QuestionPanel
          token={token}
          sessionId={sessionId}
          session={session}
          onAnswered={handleAnswered}
          onFinished={setSession}
          onError={setError}
        />
      )}

      {(session?.status === 'EN_REVISION' || session?.status === 'CERRADA') && (
        <InterviewReview
          token={token}
          sessionId={sessionId}
          sessionStatus={session.status}
          fromCoverage={session.fromCoverage}
        />
      )}
    </div>
  );
}

function sectorName(sectors, id) {
  return sectors.find((s) => s.id === id)?.name ?? id;
}

function NoticeCard({ notice }) {
  // Spec 011: quedan DOS reason y siguen sin ser intercambiables —
  // `TODO_CUBIERTO` (no hay nada que mejorar) y `YA_ENTREVISTADO` (había, y ya
  // se preguntó todo). El backend manda el mensaje ya redactado; el panel no
  // lo arma, para que las dos se lean distinto sin duplicar el criterio acá.
  return <p className="hint">{notice.message}</p>;
}

function QuestionPanel({ token, sessionId, session, onAnswered, onFinished, onError }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryHint, setRetryHint] = useState(null);

  const current = session.current;
  const { answered, total } = session.progress;

  async function handleSend() {
    if (!current || !text.trim()) return;
    setBusy(true);
    onError('');
    try {
      const res = await answerInterview(token, sessionId, current.id, text);
      if (res.retry) {
        // FR-018: se repregunta UNA vez, sobre la MISMA pregunta — no avanza.
        setRetryHint(res.retryHint);
      } else {
        setRetryHint(null);
        setText('');
        onAnswered(res);
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (!current) return;
    setBusy(true);
    onError('');
    try {
      const res = await skipInterviewQuestion(token, sessionId, current.id);
      setRetryHint(null);
      setText('');
      onAnswered(res);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    return <p className="hint">No quedan preguntas pendientes.</p>;
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Spec 012 (FR-001): el prototipo la dibujó como una conversación —
          lo ya contestado queda a la vista "para seguir el hilo". */}
      <History history={session.history} />

      <p className="hint" style={{ margin: 0 }}>
        Pregunta {answered + 1} de {total} · {KIND_LABEL[current.kind] ?? current.kind}
      </p>

      <QuestionBody kind={current.kind} current={current} />

      {retryHint && <p className="hint">{retryHint}</p>}

      {/* FR-007/008: tocar CARGA el texto, no envía. Tocar otra reemplaza lo
          cargado; borrar el textarea devuelve la pregunta a texto libre vacío
          con las tarjetas todavía disponibles. */}
      <Options options={current.options} onPick={setText} disabled={busy} />

      <div className="field" style={{ marginTop: 12 }}>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tu respuesta…"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handleSend} disabled={busy || !text.trim()}>
          {busy ? 'Enviando…' : 'Responder'}
        </button>
        <button className="secondary" onClick={handleSkip} disabled={busy}>
          Saltear
        </button>
        <FinishButton
          token={token}
          sessionId={sessionId}
          progress={session.progress}
          onFinished={onFinished}
          onError={onError}
        />
      </div>
    </div>
  );
}

/**
 * El historial de la conversación (spec 012, FR-001/002/003).
 *
 * Sale del backend, no de lo que esta pantalla acumuló: por eso sobrevive a
 * recargar y a retomar una sesión pausada.
 *
 * ⚠️ Los tres finales NO se aplastan en "sin respuesta" (FR-003). `SALTEADA`
 * es "no quise contestar" y no tiene nada que la persona haya puesto;
 * `SIN_RESPONDER` es "contesté, se repreguntó, y tampoco alcanzó" — el texto
 * es suyo y se muestra. Mostrarlas igual tira información real.
 *
 * No se colapsa ni se recorta por longitud (T033): en una entrevista larga
 * hay que poder subir a leer lo de tres preguntas atrás, que es el punto.
 */
export function History({ history }) {
  if (!history || history.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <p className="hint" style={{ marginBottom: 4 }}>
        Lo que ya contestaste ({history.length}):
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.map((h) => (
          <div key={h.id} className="panel-section" style={{ opacity: 0.85 }}>
            <p className="hint" style={{ margin: 0, marginBottom: 4 }}>
              {h.order}. {h.text}
            </p>
            <HistoryAnswer item={h} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryAnswer({ item }) {
  if (item.status === 'SALTEADA') {
    return (
      <p style={{ margin: 0, fontStyle: 'italic', color: '#888' }}>
        Salteada — preferiste no contestarla.
      </p>
    );
  }

  if (item.status === 'SIN_RESPONDER') {
    // Contestó: el texto es suyo y se muestra. Lo que se aclara es que no
    // alcanzó, no que no haya dicho nada.
    return (
      <>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.answer}</p>
        <p className="hint" style={{ margin: 0, marginTop: 4, fontStyle: 'italic' }}>
          Quedó sin responder: no alcanzó para armar una ficha.
        </p>
      </>
    );
  }

  return <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.answer}</p>;
}

/**
 * Las opciones propuestas (spec 012, FR-004..FR-008).
 *
 * ⚠️ Tocar una CARGA el texto en el textarea, no lo envía (FR-007/008). La
 * edición previa al envío es toda la defensa contra el riesgo principal de la
 * spec: si elegir fuera más fácil que contar lo que realmente pasa, el corpus
 * se llena de respuestas plausibles que nadie dijo.
 *
 * ⚠️ `options: []` NO es un error (FR-006): es "contestá con tus palabras".
 * Por eso este componente no renderiza nada —ni hueco, ni mensaje de falla— y
 * la pregunta se ve como se veía antes de esta spec.
 */
export function Options({ options, onPick, disabled }) {
  if (!options || options.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint" style={{ marginBottom: 4 }}>
        Podés elegir una y editarla, o escribir la tuya:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="secondary"
            onClick={() => onPick(opt)}
            disabled={disabled}
            style={{ textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.35 }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * El caso escalado del que salió la pregunta.
 *
 * `quotes` sola no alcanzaba. Una consulta suelta —«y qué documentación
 * necesito?»— no dice de qué se venía hablando, y sin eso la respuesta sale
 * genérica o directamente equivocada: ahí "documentación" quiere decir una cosa
 * si el turno anterior fue sobre un crédito y otra si fue sobre una devolución.
 * Como lo que se conteste se ingesta al RAG, contestar sin contexto no produce
 * una respuesta floja: produce conocimiento malo.
 *
 * Arranca ABIERTO. Es lo que hay que leer antes de escribir, y detrás de un
 * "ver más" se lo saltea justo quien más lo necesita — el que va rápido.
 */
function EscalationContext({ caso }) {
  const [abierto, setAbierto] = useState(true);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 10,
        margin: '10px 0',
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>El caso que originó esta pregunta</strong>
        <button
          type="button"
          className="secondary"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }}>
        {caso.reason} · {caso.status}
      </p>

      {abierto && (
        <>
          {caso.messages?.length > 0 && (
            <>
              <p className="hint" style={{ marginBottom: 4, marginTop: 8 }}>
                Cómo venía la conversación:
              </p>
              <ul className="msg-list">
                {caso.messages.map((m) => (
                  <li key={m.id}>
                    {/* Quién habló, marcado: leer el ida y vuelta sin saber cuál
                        es cuál es peor que no verlo, porque invita a atribuirle
                        al cliente lo que dijo el agente. */}
                    <strong style={{ color: m.role === 'USER' ? '#1a73e8' : '#5f6368' }}>
                      {m.role === 'USER' ? 'Cliente' : 'Agente'}:
                    </strong>{' '}
                    {m.content}
                  </li>
                ))}
              </ul>
            </>
          )}

          {caso.internalNotes?.length > 0 && (
            <>
              <p className="hint" style={{ marginBottom: 4, marginTop: 8 }}>
                Notas internas ({caso.internalNotes.length}):
              </p>
              <ul className="notes-list">
                {caso.internalNotes.map((n) => (
                  <li key={n.id} className="note-item">
                    <div
                      className="note-avatar"
                      style={{ background: n.authorAgentType ? '#5f6368' : '#1a73e8' }}
                    >
                      {n.authorAgentType ? '🤖' : '👤'}
                    </div>
                    <div className="note-bubble">
                      {/* Agente y persona no dicen lo mismo: la del agente
                          explica por qué no pudo seguir, la de una persona
                          puede ser una decisión ya tomada sobre el caso. */}
                      <div className="note-author">
                        {n.authorAgentType
                          ? `${n.authorAgentType} (IA)`
                          : (n.authorName ?? 'Alguien del equipo')}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!caso.messages?.length && !caso.internalNotes?.length && (
            <p className="hint" style={{ marginTop: 8 }}>
              El caso no tiene mensajes ni notas guardadas.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Las cuatro formas son cuatro pantallas distintas (T074) — aplastarlas en
 * un textarea genérico pierde justo lo que hace útil a la pregunta: sin ver
 * el documento no se puede decir qué le falta, y sin ver la resolución no
 * hay qué confirmar.
 */
function QuestionBody({ kind, current }) {
  return (
    <div className="panel-section" style={{ marginTop: 8 }}>
      <p style={{ marginTop: 0 }}>{current.text}</p>

      {/*
        El caso del que salió la pregunta, cuando salió de uno.

        Va acá arriba y no al final: es lo que hay que leer ANTES de contestar.
        Y va fuera de las ramas por `kind` a propósito — un escalado puede
        llegar como PEDIR_NUEVO, ABIERTA o GENERALIZAR, y en las tres el
        contexto sirve igual.
      */}
      {current.escalation && <EscalationContext caso={current.escalation} />}

      {(kind === 'PEDIR_NUEVO' || kind === 'ABIERTA') && current.quotes?.length > 0 && (
        <>
          <p className="hint" style={{ marginBottom: 4 }}>Consultas reales:</p>
          <ul className="msg-list">
            {current.quotes.map((q, i) => (
              <li key={i}>«{q}»</li>
            ))}
          </ul>
        </>
      )}

      {kind === 'CORREGIR' && current.document && (
        <>
          {current.quotes?.length > 0 && (
            <>
              <p className="hint" style={{ marginBottom: 4 }}>Consultas reales:</p>
              <ul className="msg-list">
                {current.quotes.map((q, i) => (
                  <li key={i}>«{q}»</li>
                ))}
              </ul>
            </>
          )}
          {/* Sin el contenido completo a la vista no se puede decir qué le
              falta — es literalmente la pregunta (contracts/interview-api.md). */}
          <p className="hint" style={{ marginBottom: 4, marginTop: 8 }}>
            Documento actual — «{current.document.title}» (v{current.document.version}):
          </p>
          <div className="hint" style={{ background: '#fff', whiteSpace: 'pre-wrap' }}>
            {current.document.content}
          </div>
        </>
      )}

      {kind === 'GENERALIZAR' && current.resolutionText && (
        <>
          <p className="hint" style={{ marginBottom: 4 }}>Así se resolvió el caso:</p>
          <div className="hint" style={{ background: '#fff', whiteSpace: 'pre-wrap' }}>
            {current.resolutionText}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "Terminar ahora" (FR-023a/b): disponible aunque queden preguntas — pero
 * con pendientes pide confirmar diciendo CUÁNTAS quedan. En revisión ya no
 * se contesta nada, así que cerrar por error cuesta el resto de la
 * entrevista.
 */
function FinishButton({ token, sessionId, progress, onFinished, onError }) {
  const [busy, setBusy] = useState(false);
  const pendientes = progress.total - progress.answered;

  async function handleFinish() {
    if (pendientes > 0) {
      const ok = window.confirm(
        `Quedan ${pendientes} pregunta(s) sin responder. ¿Terminar igual? ` +
          'No vas a poder volver a contestarlas.',
      );
      if (!ok) return;
    }
    setBusy(true);
    onError('');
    try {
      const res = await finishInterview(token, sessionId, pendientes > 0);
      onFinished((prev) => ({ ...prev, status: res.status }));
    } catch (err) {
      onError(err.body?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="secondary" onClick={handleFinish} disabled={busy}>
      {busy ? 'Terminando…' : 'Terminar ahora'}
    </button>
  );
}
