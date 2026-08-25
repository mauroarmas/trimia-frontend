import { useEffect, useRef, useState } from 'react';
import {
  startCoverageScan,
  getLatestCoverageScan,
  markThemeHandled,
  unmarkThemeHandled,
} from '../api';

const POLL_MS = 3000;

const ACTION_LABEL = {
  CARGAR: 'Cargar un documento nuevo',
  CORREGIR_DOCUMENTO: 'Corregir el documento señalado',
  REVISAR_HIGIENE: 'Revisar en higiene del corpus — puede que se estén compitiendo',
  DERIVAR: 'Derivar a quien es responsable de esta área',
  NINGUNA: 'Ninguna',
};

const BAND_LABEL = {
  SIN_RESPUESTA: 'Sin respuesta',
  AL_LIMITE: 'Contestada al límite',
};

/**
 * "Qué falta para responder mejor" (spec 009, US1/US2/US3): el resumen de
 * cobertura del corpus, agrupado por tema, con causa y acción.
 *
 * `SIN_CORRIDA`, `SIN_MUESTRA_SUFICIENTE` y `TODO_CUBIERTO` son tres
 * resultados normales —no errores— y **no son intercambiables** aunque los
 * tres traigan `themes: []`: aplastarlos en un único "no hay datos" pierde
 * justo la información que esta pantalla existe para dar. Con 7-10 turnos en
 * la base real, `SIN_MUESTRA_SUFICIENTE` es el estado que más se va a ver.
 */
export default function KnowledgeCoverage({
  token,
  onOpenDocument,
  onOpenHygiene,
  onOpenAlta,
  onOpenInterview,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function loadLatest() {
    try {
      const d = await getLatestCoverageScan(token);
      setData(d);
      return d;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLatest();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pollUntilDone() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const d = await loadLatest();
      if (d?.scan && d.scan.status !== 'RUNNING') clearInterval(pollRef.current);
    }, POLL_MS);
  }

  async function handleStartScan() {
    setError('');
    try {
      const started = await startCoverageScan(token);
      setData((prev) => ({
        scan: { ...prev?.scan, ...started },
        themes: prev?.themes ?? [],
        notice: null,
      }));
      pollUntilDone();
    } catch (err) {
      // 409 SCAN_ALREADY_RUNNING: información, no un fallo — alguien más la
      // lanzó. Se engancha al polling igual, como en Limpiar base de conocimiento.
      if (err.status === 409) {
        pollUntilDone();
      } else {
        setError(err.message);
      }
    }
  }

  function handleThemeChanged(themeId, patch) {
    setData((prev) => ({
      ...prev,
      themes: prev.themes.map((t) => (t.id === themeId ? { ...t, ...patch } : t)),
    }));
  }

  if (loading) return <p className="hint">Cargando…</p>;

  const status = data?.scan?.status ?? null;
  const corriendo = status === 'RUNNING';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>¿Qué me falta para responder mejor?</h3>
          <p className="hint" style={{ margin: 0 }}>
            Agrupa por tema las consultas que el corpus no pudo contestar bien
            en los últimos 30 días, con qué le falta a cada una y qué hacer.
          </p>
        </div>
        <button onClick={handleStartScan} disabled={corriendo}>
          {corriendo ? 'Analizando…' : 'Correr el resumen'}
        </button>
      </div>

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 16 }}>
        {corriendo && (
          <p className="hint">
            Agrupando las consultas de la ventana… se actualiza solo cuando termina.
            {data?.themes?.length > 0 && ' Mientras tanto, se muestra el resultado de la corrida anterior.'}
          </p>
        )}

        {status === 'FAILED' && (
          <p className="error">
            El último resumen no terminó: {data.scan.failureReason}.
          </p>
        )}

        {!corriendo && data?.notice && <NoticeCard notice={data.notice} />}

        {!corriendo && status === 'READY' && (
          <>
            <p className="hint">
              Última corrida: {data.scan.queriesConsidered} consulta(s) consideradas,{' '}
              {data.scan.looseQueries} suelta(s), {data.scan.themesFound} tema(s)
              {data.scan.truncated && ' — se recortó al tope de volumen'}
              {data.scan.finishedAt && ` · ${new Date(data.scan.finishedAt).toLocaleString()}`}.
            </p>

            {data.themes.length === 0 && (
              <p className="success-msg">
                Todo lo que se preguntó en la ventana se contestó bien. Nada que revisar.
              </p>
            )}

            {data.themes.map((theme) => (
              <ThemeCard
                key={theme.id}
                token={token}
                theme={theme}
                onOpenDocument={onOpenDocument}
                onOpenHygiene={onOpenHygiene}
                onOpenAlta={onOpenAlta}
                onOpenInterview={onOpenInterview}
                onChanged={(patch) => handleThemeChanged(theme.id, patch)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Los tres `notice` son pantallas distintas a propósito (T048): aplastarlos
 * en un "no hay datos" pierde justo la información que hace falta para
 * saber qué hacer. `SIN_MUESTRA_SUFICIENTE` dice CUÁNTO falta, no solo que
 * falta.
 */
function NoticeCard({ notice }) {
  if (notice.code === 'SIN_CORRIDA') {
    return <p className="hint">Todavía no se corrió ningún resumen.</p>;
  }
  if (notice.code === 'SIN_MUESTRA_SUFICIENTE') {
    return (
      <p className="hint">
        Todavía no hay tráfico suficiente: {notice.queriesInWindow} de{' '}
        {notice.minimumSample} consultas necesarias en los últimos{' '}
        {notice.windowDays} días. Falta que lleguen más consultas reales —no
        hay nada que agrupar con esto todavía.
      </p>
    );
  }
  if (notice.code === 'TODO_CUBIERTO') {
    return (
      <p className="success-msg">
        La corrida encontró tráfico suficiente y no quedó ningún tema
        pendiente: todo lo que se preguntó se contestó bien.
      </p>
    );
  }
  return null;
}

function ThemeCard({
  token,
  theme,
  onOpenDocument,
  onOpenHygiene,
  onOpenAlta,
  onOpenInterview,
  onChanged,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showQuotes, setShowQuotes] = useState(false);

  async function handleMark() {
    setBusy(true);
    setError('');
    try {
      const mark = await markThemeHandled(token, theme.id);
      onChanged({ handled: { ...mark, recurring: false }, canMarkHandled: false });
    } catch (err) {
      // 403: área ajena — el body ya trae de qué áreas sí es responsable.
      setError(err.body?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnmark() {
    setBusy(true);
    setError('');
    try {
      await unmarkThemeHandled(token, theme.id);
      onChanged({ handled: null, canMarkHandled: true });
    } catch (err) {
      // 404 SIN_MARCA_PROPIA (tema reincidente sin marca propia): el mensaje
      // del backend ya explica qué hacer en su lugar.
      setError(err.body?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * `REVISAR_HIGIENE` va a higiene y NO ofrece entrevista: la entrevista
   * excluye a propósito los temas donde dos documentos compiten (spec 010,
   * FR-008) — preguntar ahí agrega un tercero al conflicto. Eso se resuelve
   * fusionando.
   *
   * `CARGAR` y `CORREGIR_DOCUMENTO` sí ofrecen entrevista: es el camino que
   * la spec 010 construyó para ellos. La carga a mano y el ver el documento
   * quedan como alternativa, no como la vía principal.
   */
  function actionButtons() {
    if (theme.action === 'REVISAR_HIGIENE' && onOpenHygiene) {
      return (
        <button type="button" className="secondary" onClick={onOpenHygiene}>
          Ir a higiene del corpus
        </button>
      );
    }

    const entrevistable =
      theme.action === 'CARGAR' || theme.action === 'CORREGIR_DOCUMENTO';

    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {entrevistable && onOpenInterview && (
          <button type="button" onClick={() => onOpenInterview(theme.agentType)}>
            Entrevistar sobre esto
          </button>
        )}
        {theme.action === 'CORREGIR_DOCUMENTO' && theme.documents[0] && onOpenDocument && (
          <button
            type="button"
            className="secondary"
            onClick={() => onOpenDocument(theme.documents[0].id)}
          >
            Ver documento
          </button>
        )}
        {theme.action === 'CARGAR' && onOpenAlta && (
          <button type="button" className="secondary" onClick={onOpenAlta}>
            Cargar a mano
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel-section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <strong>{theme.label}</strong>{' '}
          <span className="hint">
            {theme.agentType ?? 'general'} · {theme.queryCount} consulta(s) ·{' '}
            {BAND_LABEL[theme.band] ?? theme.band}
            {theme.bestScore != null && ` · mejor score ${theme.bestScore.toFixed(1)}`}
          </span>
          {theme.area && (
            <div className="hint">
              Área: {theme.area.name}
              {theme.area.responsables?.length > 0 &&
                ` (responsable: ${theme.area.responsables.map((r) => r.name).join(', ')})`}
            </div>
          )}
        </div>
      </div>

      <p style={{ marginTop: 8 }}>
        <strong>Qué hacer:</strong> {ACTION_LABEL[theme.action] ?? theme.action}
      </p>

      {actionButtons()}

      {theme.documents.length > 0 && (
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Documento</th><th>Score</th><th></th></tr></thead>
          <tbody>
            {theme.documents.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.title}
                  {!d.isActive && ' (desactivado)'}
                  {/* FR-007: un documento que cambió después de la corrida no
                      se manda a corregir a ciegas — se avisa. */}
                  {d.changedSinceScan && (
                    <span className="hint"> — cambió desde esta corrida (versión {d.version} → actual)</span>
                  )}
                </td>
                <td>{d.score.toFixed(1)}</td>
                <td>
                  {onOpenDocument && (
                    <button type="button" className="secondary" onClick={() => onOpenDocument(d.id)}>
                      Ver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(theme.quotes.length > 0 || theme.resolvedEscalations.length > 0) && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={() => setShowQuotes((v) => !v)}>
            {showQuotes ? 'Ocultar' : 'Ver'} lo que preguntaron ({theme.quotes.length})
          </button>

          {showQuotes && (
            <div style={{ marginTop: 8 }}>
              {theme.quotes.length > 0 && (
                <>
                  {/* FR-009: solo lectura. Sin identificar a quién preguntó,
                      y sin ofrecerlo como texto para copiar a un documento —
                      es material para leer, no una fuente para pegar. */}
                  <p className="hint" style={{ marginBottom: 4 }}>
                    Consultas textuales (de solo lectura, sin identificar a quién preguntó):
                  </p>
                  <ul className="msg-list">
                    {theme.quotes.map((q, i) => (
                      <li key={i} style={{ userSelect: 'none' }}>«{q}»</li>
                    ))}
                  </ul>
                </>
              )}

              {theme.resolvedEscalations.length > 0 && (
                <>
                  <p className="hint" style={{ marginBottom: 4, marginTop: 8 }}>
                    Casos ya resueltos a mano sobre este tema (FR-009a, solo lectura):
                  </p>
                  <ul className="msg-list">
                    {theme.resolvedEscalations.map((e) => (
                      <li key={e.id} style={{ userSelect: 'none' }}>
                        {e.resolution}
                        {e.resolvedAt && (
                          <div className="msg-time">{new Date(e.resolvedAt).toLocaleString()}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}

      <div style={{ marginTop: 12 }}>
        {theme.handled && !theme.handled.recurring && (
          // Marca PROPIA de este tema: acá sí corresponde desmarcar.
          <>
            <span className="hint">
              Marcado como atendido el {new Date(theme.handled.markedAt).toLocaleString()}
              {theme.handled.markedBy && ` por ${theme.handled.markedBy.name}`}
            </span>{' '}
            <button type="button" className="secondary" onClick={handleUnmark} disabled={busy}>
              {busy ? 'Desmarcando…' : 'Desmarcar'}
            </button>
          </>
        )}

        {theme.handled && theme.handled.recurring && (
          // Reincidente (FR-027): la marca que se ve es de la corrida
          // ANTERIOR, sobre un tema que ya no se muestra — este tema es
          // nuevo y no tiene marca propia para desmarcar. Lo que corresponde
          // es volver a marcarlo si ya se resolvió otra vez.
          <div>
            <p className="hint" style={{ margin: 0 }}>
              Ya se había marcado como atendido el{' '}
              {new Date(theme.handled.markedAt).toLocaleString()}
              {theme.handled.markedBy && ` por ${theme.handled.markedBy.name}`}, pero
              volvió a aparecer con consultas nuevas.
            </p>
            {theme.canMarkHandled ? (
              <button type="button" onClick={handleMark} disabled={busy} style={{ marginTop: 6 }}>
                {busy ? 'Marcando…' : 'Marcar como atendido de nuevo'}
              </button>
            ) : (
              <span className="hint" title="No sos responsable de esta área">
                No podés marcarlo de nuevo: no sos responsable de esta área.
              </span>
            )}
          </div>
        )}

        {!theme.handled && theme.canMarkHandled && (
          <button type="button" onClick={handleMark} disabled={busy}>
            {busy ? 'Marcando…' : 'Marcar como atendido'}
          </button>
        )}

        {!theme.handled && !theme.canMarkHandled && (
          // Un botón deshabilitado sin explicación es un misterio: se
          // mantiene visible el porqué en vez de ocultar la acción entera.
          <span className="hint" title="No sos responsable de esta área">
            No podés marcar este tema como atendido: no sos responsable de esta área.
          </span>
        )}
      </div>
    </div>
  );
}
