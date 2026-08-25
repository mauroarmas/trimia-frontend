import { useEffect, useState } from 'react';
import {
  openInterview,
  getInterview,
  answerInterview,
  skipInterviewQuestion,
  finishInterview,
  getEmployee,
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
export default function Interview({ token, me, initialAgentType, onConsumedInitial }) {
  const [misAreas, setMisAreas] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // 422: SIN_CORRIDA / SIN_MUESTRA_SUFICIENTE / TODO_CUBIERTO

  useEffect(() => {
    if (!me) return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, secs]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
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

  // Llegada desde "¿Qué me falta?": el panel manda el agentType del tema y
  // acá se resuelve a sector — la entrevista se abre por área, y el tema de
  // cobertura solo conoce su agente. Se consume una sola vez: si no, volver
  // atrás con "Elegir otra área" la reabriría sola en un bucle.
  useEffect(() => {
    if (!initialAgentType || sectors.length === 0 || sessionId) return;
    const sector = sectors.find((s) => s.agentType === initialAgentType);
    onConsumedInitial?.();
    if (sector) handleOpen(sector.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgentType, sectors, sessionId]);

  async function handleOpen(sectorId) {
    setError('');
    setNotice(null);
    setLoading(true);
    try {
      const opened = await openInterview(token, sectorId);
      setSessionId(opened.id);
      setSession(opened);
    } catch (err) {
      // 409: ya hay una sesión sin cerrar para esta área — se retoma, no es
      // un error (FR-003, "se le devuelve la que ya tenía").
      if (err.status === 409 && err.body?.session?.id) {
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

  function handleAnswered(next) {
    setSession((prev) => ({
      ...prev,
      progress: next.progress,
      current: next.next,
      status: next.status,
    }));
  }

  function handleReset() {
    setSessionId(null);
    setSession(null);
    setNotice(null);
    setError('');
  }

  if (misAreas === null) return <p className="hint">Cargando…</p>;

  if (!sessionId) {
    // FR-036: rol y área son dos gates distintos — acá se elige entre las
    // áreas de las que la persona es responsable, el resto lo verifica el
    // backend igual.
    const misSectores = sectors.filter(
      (s) => s.agentType && misAreas.some((a) => a.id === s.id),
    );

    return (
      <div className="card">
        <h3>Entrevista desde el tráfico real</h3>
        <p className="hint" style={{ margin: 0, marginBottom: 12 }}>
          Las preguntas salen de lo que el agente realmente no pudo contestar
          — no es un cuestionario a ciegas. Elegí un área para empezar.
        </p>

        {error && <p className="error">{error}</p>}
        {notice && <NoticeCard notice={notice} />}

        {misSectores.length === 0 && (
          <p className="hint">No sos responsable de ningún área con agente asociado.</p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {misSectores.map((s) => (
            <button key={s.id} onClick={() => handleOpen(s.id)} disabled={loading}>
              {loading ? 'Abriendo…' : `Entrevistar ${s.name}`}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <h3 style={{ margin: 0 }}>Entrevista — {session?.sector?.id ? sectorName(sectors, session.sector.id) : '…'}</h3>
        <button className="secondary" onClick={handleReset}>Elegir otra área</button>
      </div>

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
  // Los tres reason NO son intercambiables aunque los tres impidan abrir la
  // sesión (FR-016) — mismo criterio que KnowledgeCoverage.jsx.
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
      <p className="hint" style={{ margin: 0 }}>
        Pregunta {answered + 1} de {total} · {KIND_LABEL[current.kind] ?? current.kind}
      </p>

      <QuestionBody kind={current.kind} current={current} />

      {retryHint && <p className="hint">{retryHint}</p>}

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
 * Las cuatro formas son cuatro pantallas distintas (T074) — aplastarlas en
 * un textarea genérico pierde justo lo que hace útil a la pregunta: sin ver
 * el documento no se puede decir qué le falta, y sin ver la resolución no
 * hay qué confirmar.
 */
function QuestionBody({ kind, current }) {
  return (
    <div className="panel-section" style={{ marginTop: 8 }}>
      <p style={{ marginTop: 0 }}>{current.text}</p>

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
