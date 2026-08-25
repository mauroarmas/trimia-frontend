import { useEffect, useState } from 'react';
import {
  getInterviewCandidates,
  patchInterviewCandidate,
  approveInterviewCandidates,
  discardInterviewCandidate,
} from '../api';

const RESULT_MESSAGE = {
  AREA_AJENA: 'Se perdió la responsabilidad de esta área desde que se abrió la sesión.',
  VERSION_CAMBIO: 'El documento a corregir cambió mientras tanto — recargá y volvé a intentar.',
  DOCUMENTO_AUSENTE: 'El documento a corregir se borró o desactivó.',
  DUPLICADO_EXACTO: 'El contenido ya existe idéntico en el corpus.',
  ALREADY_RESOLVED: 'Este candidato ya se había resuelto.',
  NOT_FOUND: 'No se encontró el candidato.',
  ERROR: 'Falló al aprobar.',
};

/**
 * La revisión (spec 010, US2): una ficha por respuesta, editable, con el
 * aviso de parecido calculado ANTES de aprobar (FR-029) y "aprobar todo"
 * devolviendo un resultado por candidato, nunca un éxito global (FR-027) —
 * `VERSION_CAMBIO` y `AREA_AJENA` piden acciones distintas.
 */
export default function InterviewReview({ token, sessionId, sessionStatus, fromCoverage }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [busyAll, setBusyAll] = useState(false);

  async function load() {
    try {
      const d = await getInterviewCandidates(token, sessionId);
      setData(d);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function handleCandidateChanged(id, patch) {
    setData((prev) => ({
      ...prev,
      candidates: prev.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  async function handleApproveAll() {
    const ids = pendientes.map((c) => c.id);
    if (ids.length === 0) return;
    setBusyAll(true);
    setError('');
    setResults(null);
    try {
      const res = await approveInterviewCandidates(token, sessionId, ids);
      setResults(res.results);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAll(false);
    }
  }

  if (!data) return <p className="hint">Cargando revisión…</p>;

  const pendientes = data.candidates.filter((c) => c.status === 'PENDIENTE');

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint" style={{ margin: 0 }}>
        {sessionStatus === 'CERRADA'
          ? 'Sesión cerrada — todos los candidatos se revisaron.'
          : 'En revisión.'}{' '}
        {fromCoverage
          ? '(salió de los temas de cobertura)'
          : '(salió del respaldo — escalados)'}
      </p>

      {error && <p className="error">{error}</p>}

      {pendientes.length > 0 && (
        <button onClick={handleApproveAll} disabled={busyAll} style={{ marginTop: 8 }}>
          {busyAll ? 'Aprobando…' : `Aprobar todo (${pendientes.length})`}
        </button>
      )}

      {/* FR-027: un resultado por candidato, nunca un éxito global aplastado —
          VERSION_CAMBIO y AREA_AJENA piden acciones distintas. */}
      {results && (
        <div style={{ marginTop: 8 }}>
          {results.map((r) => (
            <p key={r.candidateId} className={r.ok ? 'success-msg' : 'error'}>
              {r.candidateId.slice(0, 8)}…:{' '}
              {r.ok ? `${r.action === 'CREATED' ? 'creado' : 'corregido'}` : RESULT_MESSAGE[r.code] ?? r.code}
              {!r.ok && r.currentVersion != null && ` (versión actual: ${r.currentVersion})`}
            </p>
          ))}
        </div>
      )}

      {data.candidates.length === 0 && (
        <p className="hint">No hay candidatos — no se produjo ninguna ficha.</p>
      )}

      {data.candidates.map((c) => (
        <CandidateCard
          key={c.id}
          token={token}
          sessionId={sessionId}
          candidate={c}
          onChanged={(patch) => handleCandidateChanged(c.id, patch)}
        />
      ))}
    </div>
  );
}

function CandidateCard({ token, sessionId, candidate, onChanged }) {
  const [title, setTitle] = useState(candidate.title);
  const [content, setContent] = useState(candidate.content);
  const [audience, setAudience] = useState(candidate.audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const editado = title !== candidate.title || content !== candidate.content;

  async function persistEdits() {
    if (!editado) return;
    await patchInterviewCandidate(token, candidate.id, { title, content });
    onChanged({ title, content, edited: true });
  }

  async function handleApprove() {
    setBusy(true);
    setError('');
    try {
      await persistEdits();
      const res = await approveInterviewCandidates(token, sessionId, [candidate.id]);
      const r = res.results[0];
      if (r.ok) {
        onChanged({ status: 'APROBADO' });
      } else {
        setError(RESULT_MESSAGE[r.code] ?? r.code);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    setBusy(true);
    setError('');
    try {
      await discardInterviewCandidate(token, candidate.id);
      onChanged({ status: 'DESCARTADO' });
    } catch (err) {
      setError(err.body?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAudienceChange(next) {
    setAudience(next);
    await patchInterviewCandidate(token, candidate.id, { audience: next });
    onChanged({ audience: next });
  }

  async function handleConvertToCorrection(documentId) {
    setBusy(true);
    setError('');
    try {
      await patchInterviewCandidate(token, candidate.id, { targetDocumentId: documentId });
      onChanged({
        candidateKind: 'CORRECCION',
        target: { documentId, changedSinceOpen: false },
        similar: [],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const resuelto = candidate.status !== 'PENDIENTE';

  return (
    <div className="panel-section" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="hint" style={{ margin: 0 }}>
          De: «{candidate.question.text}»
        </span>
        <span className={`badge ${candidate.candidateKind === 'CORRECCION' ? 'status-info' : 'status-idle'}`}>
          {candidate.candidateKind === 'CORRECCION' ? 'Corrección' : 'Nuevo'}
        </span>
      </div>

      {candidate.target && (
        <p className="hint">
          Corrige: {candidate.target.title ?? candidate.target.documentId}
          {candidate.target.changedSinceOpen && ' — ⚠️ cambió desde que se abrió la sesión'}
        </p>
      )}

      {resuelto ? (
        <>
          <p><strong>{candidate.title}</strong></p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{candidate.content}</p>
          <span className={`badge ${candidate.status === 'APROBADO' ? 'status-active' : 'status-idle'}`}>
            {candidate.status}
          </span>
        </>
      ) : (
        <>
          <div className="field">
            <label>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="field">
            <label>Contenido</label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="field">
            <label>Audiencia</label>{' '}
            <select value={audience} onChange={(e) => handleAudienceChange(e.target.value)}>
              <option value="PUBLICO">Público (para clientes)</option>
              <option value="INTERNO">Interno (solo equipo)</option>
            </select>
          </div>

          <button type="button" className="secondary" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'Ocultar' : 'Ver'} respuesta cruda
          </button>
          {showRaw && (
            <p className="hint" style={{ whiteSpace: 'pre-wrap' }}>{candidate.rawAnswer}</p>
          )}

          {/* FR-029: mostrar los parecidos sin ofrecer la conversión deja la
              decisión sin acción y devuelve la feature a fabricar duplicados. */}
          {candidate.similar?.length > 0 && (
            <div className="hint" style={{ marginTop: 8 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Documentos parecidos ya cargados:</p>
              {candidate.similar.map((s) => (
                <div key={s.documentId} style={{ marginTop: 4 }}>
                  {s.title} (score {s.score.toFixed(2)})
                  {s.audienciaDistinta && ' — audiencia distinta'}{' '}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleConvertToCorrection(s.documentId)}
                    disabled={busy}
                  >
                    Convertir en corrección de éste
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {candidate.canApprove ? (
              <button onClick={handleApprove} disabled={busy}>
                {busy ? 'Aprobando…' : 'Aprobar'}
              </button>
            ) : (
              <span className="hint" title="No sos responsable de esta área">
                No podés aprobar: no sos responsable de esta área.
              </span>
            )}
            <button className="secondary" onClick={handleDiscard} disabled={busy}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
