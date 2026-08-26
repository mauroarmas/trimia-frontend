import { useEffect, useRef, useState } from 'react';
import {
  startHygieneScan,
  getLatestHygieneScan,
  discardHygienePair,
  previewMerge,
  applyMerge,
} from '../api';

const POLL_MS = 3000;

/**
 * Higiene del corpus (spec 008, US1/US2): un barrido bajo demanda encuentra
 * parejas de documentos activos que se solapan y ofrece fusionarlas con
 * aprobación humana.
 *
 * `NEVER_RUN`, `RUNNING` y una lista vacía en `READY` son los tres resultados
 * normales, no errores — el corpus sano (`pairsFound: 0`) es exactamente lo
 * que se espera la mayoría de las veces.
 */
export default function KnowledgeHygiene({ token }) {
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  // Parejas que se fusionaron o descartaron EN ESTA SESIÓN de pantalla. No hay
  // estado "resuelta" en HygienePair (data-model.md §5): la corrida ya
  // calculada no se recalcula sola, así que sin este filtro local la tarjeta
  // seguiría en la lista hasta el próximo análisis, como si no hubiera pasado
  // nada.
  const [resueltas, setResueltas] = useState(() => new Set());

  function ocultarPareja(pairId) {
    setResueltas((prev) => new Set(prev).add(pairId));
  }

  async function loadLatest() {
    try {
      const data = await getLatestHygieneScan(token);
      setScan(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // ⚠️ Si al entrar YA hay un barrido corriendo (lo lanzó otra persona, o
    // esta misma antes de irse), hay que encuestar igual. Sin esto la pantalla
    // se queda congelada en "Analizando…" hasta que alguien recargue: se
    // pintaba el estado una vez y nadie volvía a preguntar.
    loadLatest().then((data) => {
      if (data?.status === 'RUNNING') pollUntilDone();
    });
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pollUntilDone() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const data = await loadLatest();
      if (data && data.status !== 'RUNNING') clearInterval(pollRef.current);
    }, POLL_MS);
  }

  async function handleStartScan() {
    setError('');
    try {
      const started = await startHygieneScan(token);
      // El 201 ya trae RUNNING: se pinta de una y se sigue consultando solo.
      setScan((prev) => ({ ...prev, ...started, pairs: prev?.pairs ?? [] }));
      setResueltas(new Set()); // corrida nueva: los pairId anteriores ni existen
      pollUntilDone();
    } catch (err) {
      // 409 SCAN_ALREADY_RUNNING: ya hay uno corriendo, alguien más lo lanzó.
      // Es información, no un fallo — se engancha al polling igual.
      if (err.status === 409) {
        pollUntilDone();
      } else {
        setError(err.message);
      }
    }
  }

  if (loading) return <p className="hint">Cargando…</p>;

  const status = scan?.status ?? 'NEVER_RUN';
  const corriendo = status === 'RUNNING';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>Limpiar base de conocimiento</h3>
          <p className="hint" style={{ margin: 0 }}>
            Busca documentos activos que se solapan entre sí (misma área y
            audiencia) para ofrecer fusionarlos. Tarda alrededor de un minuto:
            no hace falta esperar en esta pantalla, se puede volver más tarde.
          </p>
        </div>
        <button onClick={handleStartScan} disabled={corriendo}>
          {corriendo ? 'Analizando…' : 'Limpiar base de conocimiento'}
        </button>
      </div>

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 16 }}>
        {status === 'NEVER_RUN' && (
          <p className="hint">Todavía no se corrió ningún análisis.</p>
        )}

        {corriendo && (
          <p className="hint">
            Analizando el corpus (~{scan?.documentsToScan ?? ''} documentos)…
            se actualiza solo cuando termina.
            {scan?.pairs?.length > 0 && ' Mientras tanto, se muestra el resultado de la corrida anterior.'}
          </p>
        )}

        {status === 'FAILED' && (
          <p className="error">
            El último análisis no terminó: {scan.failureReason}.
            {scan?.pairs?.length > 0 && ' Se muestra el resultado de la corrida anterior.'}
          </p>
        )}

        {status === 'READY' && (
          <p className="hint">
            Última corrida: {scan.documentsScanned} documentos analizados,{' '}
            {scan.pairsFound} pareja(s) encontrada(s)
            {scan.finishedAt && ` · ${new Date(scan.finishedAt).toLocaleString()}`}.
          </p>
        )}

        {(() => {
          const pairs = scan?.pairs ?? [];
          const visibles = pairs.filter((p) => !resueltas.has(p.pairId));

          if (status === 'NEVER_RUN' || corriendo) return null;

          // Dos mensajes distintos a propósito: "corpus sano" es un dato del
          // backend (pairsFound: 0, esta corrida no encontró nada). Si lo que
          // vació la lista fue resolver las de acá, decirlo aparte — no es lo
          // mismo que el corpus esté sano a que ya no quede nada por MIRAR.
          if (pairs.length === 0) {
            return (
              <p className="success-msg">
                No se encontraron documentos que compitan entre sí. Corpus sano.
              </p>
            );
          }
          if (visibles.length === 0) {
            return (
              <p className="success-msg">
                Ya revisaste las {pairs.length} pareja(s) de esta corrida. Corré
                un análisis nuevo para confirmar que no quedan pendientes.
              </p>
            );
          }
          return null;
        })()}

        {(scan?.pairs ?? [])
          .filter((p) => !resueltas.has(p.pairId))
          .map((pair) => (
            <HygienePairCard
              key={pair.pairId}
              token={token}
              pair={pair}
              onResolved={ocultarPareja}
            />
          ))}
      </div>
    </div>
  );
}

/**
 * Una pareja candidata, completa y comparable (FR-006): una propuesta que no
 * se puede leer lado a lado convierte la aprobación en trámite, que es
 * justo el riesgo que esta feature existe para evitar.
 *
 * Reusable: la misma tarjeta se usa acá (US1, la lista completa) y en el
 * aviso reactivo dentro de un caso escalado (US3) — no hay una segunda
 * implementación del flujo de fusión.
 */
export function HygienePairCard({ token, pair, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [keepId, setKeepId] = useState(
    (pair.documentA.retrievedCount ?? 0) >= (pair.documentB.retrievedCount ?? 0)
      ? pair.documentA.id
      : pair.documentB.id,
  );
  const [proposal, setProposal] = useState(null);
  const [editedContent, setEditedContent] = useState('');
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discardReason, setDiscardReason] = useState('');
  const [discarding, setDiscarding] = useState(false);
  // No hay un estado "resuelta" en HygienePair (data-model.md §5): la corrida
  // ya calculada no se recalcula sola. La lista de la pantalla la saca por su
  // cuenta apenas se resuelve; este mensaje es lo que se ve en el instante
  // antes de que `onResolved` la quite de la vista del padre.
  const [resultMsg, setResultMsg] = useState(null);
  const cierreRef = useRef(null);

  useEffect(() => () => clearTimeout(cierreRef.current), []);

  function cerrarTrasUnRato() {
    cierreRef.current = setTimeout(() => onResolved(pair.pairId), 1800);
  }

  const docs = { [pair.documentA.id]: pair.documentA, [pair.documentB.id]: pair.documentB };
  const absorbId = keepId === pair.documentA.id ? pair.documentB.id : pair.documentA.id;

  async function handlePreview() {
    setBusy(true);
    setError('');
    setConflict(null);
    setProposal(null);
    try {
      const p = await previewMerge(token, pair.pairId, keepId);
      setProposal(p);
      setEditedContent(p.proposedContent);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    setBusy(true);
    setError('');
    setConflict(null);
    try {
      const result = await applyMerge(token, pair.pairId, {
        keepDocumentId: keepId,
        baseVersion: proposal.baseVersion,
        content: editedContent,
      });
      setProposal(null);
      setResultMsg(
        `Fusión aplicada: «${docs[result.keptDocumentId]?.title ?? 'el documento'}» subió a la ` +
          `versión ${result.newVersion}. El otro quedó desactivado, no borrado.`,
      );
      cerrarTrasUnRato();
    } catch (err) {
      if (err.status === 409) setConflict(err.body);
      else if (err.status === 404) {
        setError('Uno de los dos documentos ya no está activo: otra fusión lo absorbió mientras tanto.');
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    setError('');
    try {
      await discardHygienePair(token, pair.pairId, discardReason || undefined);
      setResultMsg(
        'Descartada: no se va a volver a proponer mientras ninguno de los dos documentos cambie.',
      );
      cerrarTrasUnRato();
    } catch (err) {
      setError(err.message);
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div className="panel-section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <strong>{pair.documentA.title}</strong> ↔ <strong>{pair.documentB.title}</strong>
          <div className="hint">
            se solapan {pair.similarity.toFixed(1)}%
            {/* escalatedTurns: 0 es normal, no "sin datos" — se muestra tal cual */}
            {' · '}{pair.escalatedTurns} turno(s) escalado(s) en común
          </div>
        </div>
        <button type="button" className="secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Colapsar' : 'Revisar'}
        </button>
      </div>

      {!pair.fusionable && (
        <p className="hint" style={{ marginTop: 8 }} title={pair.motivoSiNo}>
          Solo lectura para vos — {pair.motivoSiNo}
        </p>
      )}

      {resultMsg && <p className="success-msg" style={{ marginTop: 8 }}>{resultMsg}</p>}

      {expanded && !resultMsg && (
        <>
          <div className="field-row" style={{ marginTop: 12 }}>
            {[pair.documentA, pair.documentB].map((d) => (
              <div className="field" key={d.id}>
                <label>
                  <input
                    type="radio"
                    name={`keep-${pair.pairId}`}
                    checked={keepId === d.id}
                    disabled={!pair.fusionable}
                    onChange={() => { setKeepId(d.id); setProposal(null); }}
                  />{' '}
                  {d.title} sobrevive
                </label>
                <div className="hint">
                  {d.category} · {d.agentType ?? 'general'} · {d.audience} · versión {d.version}
                  <br />
                  {!d.hasData ? 'sin datos de uso todavía' : `consultado ${d.retrievedCount} vez/veces`}
                </div>
                <textarea
                  rows={8}
                  readOnly
                  value={d.content}
                  style={{ marginTop: 6, background: d.id === absorbId ? '#fef2f2' : undefined }}
                />
              </div>
            ))}
          </div>

          {pair.fusionable && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={handlePreview} disabled={busy}>
                {busy && !proposal ? 'Redactando…' : 'Proponer fusión'}
              </button>
              <span className="hint" style={{ marginLeft: 8 }}>
                No se guarda nada todavía: el documento que sobrevive queda
                intacto hasta que apruebes.
              </span>

              <div className="field" style={{ marginTop: 8 }}>
                <label>Motivo del descarte (opcional)</label>
                <input
                  value={discardReason}
                  onChange={(e) => setDiscardReason(e.target.value)}
                  placeholder="ej. son casos distintos aunque se parezcan"
                />
              </div>
              <button type="button" className="secondary" onClick={handleDiscard} disabled={discarding}>
                {discarding ? 'Descartando…' : 'Son distintos a propósito — descartar'}
              </button>
            </div>
          )}

          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

          {conflict && (
            <div className="error" style={{ marginTop: 12 }}>
              <p>{conflict.message}</p>
              <button type="button" className="secondary" onClick={handlePreview}>
                Regenerar sobre la versión {conflict.currentVersion}
              </button>
            </div>
          )}

          {proposal && !proposal.confident && (
            <div className="error" style={{ marginTop: 12 }}>
              <p><strong>No se pudo fusionar con criterio.</strong> {proposal.summary}</p>
              <p className="hint">
                El documento que sobrevive quedó intacto. Si de verdad son
                duplicados, se puede aprobar igual con el texto tal cual está
                abajo — no hace falta que cambie nada para que la fusión
                absorba al otro.
              </p>
              <div className="field">
                <label>Texto (sin cambios propuestos)</label>
                <textarea rows={8} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} />
              </div>
              <button type="button" onClick={handleApply} disabled={busy}>
                {busy ? 'Aplicando…' : 'Aprobar igual y fusionar'}
              </button>
            </div>
          )}

          {proposal && proposal.confident && (
            <div style={{ marginTop: 12 }}>
              <p className="success-msg">{proposal.summary}</p>

              {proposal.changedSections.length > 0 && (
                <table>
                  <thead><tr><th>Antes</th><th>Después</th></tr></thead>
                  <tbody>
                    {proposal.changedSections.map((s, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--danger)' }}>{s.before}</td>
                        <td style={{ color: 'var(--success)' }}>{s.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="field" style={{ marginTop: 12 }}>
                <label>Texto fusionado (editable antes de aprobar)</label>
                <textarea rows={10} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} />
              </div>

              <button type="button" onClick={handleApply} disabled={busy}>
                {busy ? 'Aplicando…' : 'Aprobar y fusionar'}
              </button>
              <button
                type="button"
                className="secondary"
                style={{ marginLeft: 8 }}
                onClick={() => setProposal(null)}
              >
                Descartar propuesta
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
