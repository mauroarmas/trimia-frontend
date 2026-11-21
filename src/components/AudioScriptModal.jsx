import { useEffect, useMemo, useState } from 'react';
import {
  enqueueAudioGeneration,
  getAudioStreamUrl,
  generatePillAudioScript,
  getPillAudioScript,
  updatePillAudioScript,
  publishPill,
  getPillAudioStatus,
} from '../api';
import TrainingIcon from './TrainingIcon';

function formatSeconds(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioScriptModal({ token, pill, onClose, onScriptUpdated }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [dialogue, setDialogue] = useState([]);
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState(
    Math.round(pill?.audioDurationSeconds || 90)
  );
  const [isDirty, setIsDirty] = useState(false);

  // Audio and approval states
  const [audioStatus, setAudioStatus] = useState(pill?.audioStatus || 'NOT_REQUESTED');
  const [audioDuration, setAudioDuration] = useState(pill?.audioDurationSeconds || null);
  const [audioVersion, setAudioVersion] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const [checkedTone, setCheckedTone] = useState(false);
  const [checkedPolicies, setCheckedPolicies] = useState(false);

  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [activeTestLine, setActiveTestLine] = useState(null);

  const isPublished = pill?.status === 'PUBLISHED';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving && !generating && !synthesizing && !publishing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [onClose, saving, generating, synthesizing, publishing]);

  const stopTestAudio = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsTestingAudio(false);
    setActiveTestLine(null);
  };

  const handleTestSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isTestingAudio) {
      stopTestAudio();
      return;
    }

    if (!dialogue || dialogue.length === 0) return;

    setIsTestingAudio(true);
    window.speechSynthesis.cancel();

    const playLine = (i) => {
      if (i >= dialogue.length) {
        setIsTestingAudio(false);
        setActiveTestLine(null);
        setHasListened(true);
        return;
      }

      setActiveTestLine(i);
      const line = dialogue[i];
      const isTrimi = line.speaker === 'SPEAKER_1';

      const availableVoices = window.speechSynthesis.getVoices();
      const spVoices = availableVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
      const voice1 =
        spVoices.find((v) => v.lang === 'es-AR' || v.lang === 'es_AR') ||
        spVoices.find(
          (v) =>
            v.lang &&
            (v.lang.startsWith('es-419') || v.lang.startsWith('es-US') || v.lang.startsWith('es-MX'))
        ) ||
        spVoices[0] ||
        null;
      const voice2 = spVoices.find((v) => v.name !== voice1?.name) || voice1;

      const speakerVoice = isTrimi ? voice1 : voice2;
      const speakerPitch = isTrimi ? 1.0 : voice1?.name !== voice2?.name ? 1.0 : 0.92;

      const u = new SpeechSynthesisUtterance(line.text);
      u.lang = speakerVoice?.lang || 'es-AR';
      u.pitch = speakerPitch;
      u.rate = 1.0;
      if (speakerVoice) u.voice = speakerVoice;

      u.onend = () => {
        setTimeout(() => playLine(i + 1), 200);
      };

      u.onerror = () => {
        setTimeout(() => playLine(i + 1), 300);
      };

      window.speechSynthesis.speak(u);
    };

    playLine(0);
  };

  const loadScriptAndStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        const data = await getPillAudioScript(token, pill.id);
        if (data && Array.isArray(data.dialogue)) {
          setDialogue(data.dialogue);
          if (data.estimatedDurationSeconds) {
            setEstimatedDurationSeconds(Math.round(data.estimatedDurationSeconds));
          }
        } else {
          setDialogue([]);
        }
        setIsDirty(false);
      } catch (err) {
        if (err.status === 404 || err.message?.includes('404')) {
          setDialogue([]);
        } else {
          throw err;
        }
      }

      try {
        const statusData = await getPillAudioStatus(token, pill.id);
        if (statusData) {
          const resolvedStatus = statusData.status || statusData.audioStatus || 'NOT_REQUESTED';
          setAudioStatus(resolvedStatus);
          if (statusData.durationSeconds) {
            setAudioDuration(statusData.durationSeconds);
          }
          if (statusData.error && resolvedStatus === 'AUDIO_FAILED') {
            setError(statusData.error);
          }
        }
      } catch {
        // Ignorar si aún no hay estado de audio
      }
    } catch (err) {
      setError(err.message || 'Error al cargar guion o audio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScriptAndStatus();
  }, [pill.id]);

  // Polling mientras el audio está en cola o sintetizando
  useEffect(() => {
    if (audioStatus === 'AUDIO_PENDING' || audioStatus === 'AUDIO_GENERATING') {
      const interval = setInterval(async () => {
        try {
          const statusData = await getPillAudioStatus(token, pill.id);
          if (statusData) {
            const resolvedStatus = statusData.status || statusData.audioStatus;
            if (resolvedStatus) {
              setAudioStatus(resolvedStatus);
            }
            if (statusData.durationSeconds) {
              setAudioDuration(statusData.durationSeconds);
            }
            if (resolvedStatus === 'AUDIO_READY') {
              setAudioVersion((v) => v + 1);
              setNotice('Audio sintetizado con éxito. Ya podés escucharlo desde el panel.');
              if (onScriptUpdated) onScriptUpdated();
              clearInterval(interval);
            } else if (resolvedStatus === 'AUDIO_FAILED') {
              setError(statusData.error || 'No se pudo generar el audio. Intentá nuevamente.');
              clearInterval(interval);
            }
          }
        } catch {
          // ignore transient polling error
        }
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [audioStatus, pill.id, token]);

  const handleGenerateAIScript = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const targetSec = Math.max(30, Math.min(300, Number(estimatedDurationSeconds) || 90));
      const result = await generatePillAudioScript(token, pill.id, targetSec);
      setDialogue(result.dialogue || []);
      setEstimatedDurationSeconds(Math.round(result.estimatedDurationSeconds || targetSec));
      setIsDirty(false);
      setNotice(
        `Guion generado (${result.dialogue?.length || 0} bloques, ~${formatSeconds(result.estimatedDurationSeconds || targetSec)}).`
      );
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al generar guion con IA');
    } finally {
      setGenerating(false);
    }
  };

  const handleLineChange = (index, field, value) => {
    setDialogue((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setIsDirty(true);
  };

  const handleAddLine = () => {
    setDialogue((prev) => {
      const lastSpeaker = prev.length > 0 ? prev[prev.length - 1].speaker : 'SPEAKER_2';
      const nextSpeaker = lastSpeaker === 'SPEAKER_1' ? 'SPEAKER_2' : 'SPEAKER_1';
      return [...prev, { speaker: nextSpeaker, text: '' }];
    });
    setIsDirty(true);
  };

  const handleRemoveLine = (index) => {
    setDialogue((prev) => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const handleMoveLine = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= dialogue.length) return;
    setDialogue((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setIsDirty(true);
  };

  const handleSave = async (showToast = true) => {
    if (dialogue.length === 0) {
      setError('El guion debe tener al menos un bloque de diálogo.');
      return false;
    }
    const emptyLine = dialogue.some((d) => !d.text.trim());
    if (emptyLine) {
      setError('Completá o quitá los bloques vacíos antes de guardar.');
      return false;
    }

    setSaving(true);
    setError(null);
    if (showToast) setNotice(null);
    try {
      const updated = await updatePillAudioScript(token, pill.id, {
        dialogue,
        estimatedDurationSeconds: Math.max(30, Math.min(300, Number(estimatedDurationSeconds) || 90)),
      });
      setDialogue(updated.dialogue);
      setIsDirty(false);
      if (showToast) setNotice('Guion guardado correctamente.');
      if (onScriptUpdated) onScriptUpdated();
      return true;
    } catch (err) {
      setError(err.message || 'Error al guardar el guion');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSynthesize = async () => {
    if (dialogue.length === 0) {
      setError('Generá o redactá un guion antes de sintetizar el audio.');
      return;
    }

    const saved = await handleSave(false);
    if (!saved) return;

    if (
      !window.confirm(
        '¿Enviar este guion a la síntesis de voz? Se reemplazará el audio actual de esta píldora.'
      )
    ) {
      return;
    }

    setSynthesizing(true);
    setError(null);
    setNotice(null);
    try {
      await enqueueAudioGeneration(token, pill.id);
      setAudioStatus('AUDIO_GENERATING');
      setNotice('Generación de audio encolada. Se actualizará automáticamente al finalizar.');
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al iniciar la síntesis de audio');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (!canPublish) return;
    if (
      !window.confirm(
        '¿Confirmás la aprobación y publicación de esta píldora? Quedará disponible de inmediato para los empleados.'
      )
    ) {
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishPill(token, pill.id);
      setNotice('Píldora aprobada y publicada exitosamente.');
      if (onScriptUpdated) onScriptUpdated();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Error al aprobar y publicar la píldora');
    } finally {
      setPublishing(false);
    }
  };

  const extractBrackets = (text) => {
    if (!text) return [];
    const matches = text.match(/\[([^\]]+)\]/g);
    return matches ? matches : [];
  };

  const totalBracketCount = useMemo(
    () => dialogue.reduce((count, line) => count + extractBrackets(line.text).length, 0),
    [dialogue]
  );

  const totalWords = useMemo(
    () =>
      dialogue.reduce(
        (acc, line) => acc + (line.text || '').trim().split(/\s+/).filter(Boolean).length,
        0
      ),
    [dialogue]
  );

  const liveEstSeconds = useMemo(
    () => (totalWords > 0 ? Math.max(10, Math.round((totalWords / 140) * 60)) : 0),
    [totalWords]
  );

  const isAudioGenerating = audioStatus === 'AUDIO_GENERATING' || audioStatus === 'AUDIO_PENDING';
  const isAudioReady = audioStatus === 'AUDIO_READY';

  const canPublish =
    !isPublished &&
    totalBracketCount === 0 &&
    isAudioReady &&
    hasListened &&
    checkedTone &&
    checkedPolicies &&
    !saving &&
    !publishing &&
    dialogue.length > 0;

  const durationPresets = [
    { label: '1m', seconds: 60 },
    { label: '1.5m', seconds: 90 },
    { label: '2m', seconds: 120 },
    { label: '3m', seconds: 180 },
  ];

  const streamUrl = isAudioReady
    ? `${getAudioStreamUrl(pill.id, token)}${token ? '&' : '?'}v=${audioVersion}`
    : null;

  return (
    <div
      className="modal-overlay audio-script-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving && !generating && !synthesizing && !publishing) {
          onClose();
        }
      }}
    >
      <section className="audio-script-modal" aria-label="Editor y revisión de guion">
        {/* Header limpio y legible en modo claro y oscuro */}
        <header className="audio-script-header">
          <div className="audio-script-header-copy">
            <div className="audio-script-header-meta">
              <span className="audio-script-kicker">Guion de audio</span>
              <span
                className={`audio-script-status-pill ${
                  isPublished ? 'is-published' : isAudioReady ? 'is-review' : 'is-draft'
                }`}
              >
                {isPublished ? 'Publicada' : isAudioReady ? 'En revisión' : 'Borrador'}
              </span>
            </div>
            <h2>{pill.title}</h2>
            {pill.objective && <p>{pill.objective}</p>}
          </div>

          <button
            type="button"
            className="audio-script-close"
            onClick={onClose}
            aria-label="Cerrar editor"
            title="Cerrar (Esc)"
          >
            ×
          </button>
        </header>

        <div className="audio-script-workspace">
          {/* Panel Lateral enfocado: Audio primero, calibración IA compacta, checklist solo en borrador */}
          <aside className="audio-script-sidebar">
            <div className="audio-script-panel">
              <div className="audio-script-panel-head">
                <h4>Audio de la lección</h4>
                <span
                  className={`audio-script-audio-badge ${
                    isAudioGenerating
                      ? 'is-generating'
                      : isAudioReady
                        ? 'is-ready'
                        : 'is-empty'
                  }`}
                >
                  {isAudioGenerating
                    ? 'Generando...'
                    : isAudioReady
                      ? `Listo${audioDuration ? ` · ${formatSeconds(audioDuration)}` : ''}`
                      : 'Sin audio'}
                </span>
              </div>

              {isAudioGenerating ? (
                <div className="audio-script-generating-box">
                  <span className="audio-script-spinner" aria-hidden="true" />
                  <span>Sintetizando voces con Gemini TTS...</span>
                </div>
              ) : isAudioReady ? (
                <div className="audio-script-player-wrap">
                  <audio
                    key={audioVersion}
                    controls
                    preload="metadata"
                    src={streamUrl}
                    onPlay={() => setHasListened(true)}
                    className="audio-script-audio-el"
                  />
                </div>
              ) : (
                <p className="audio-script-panel-hint">
                  Todavía no hay audio sintetizado. Guardá el guion y presioná{' '}
                  <strong>Generar audio</strong>.
                </p>
              )}

              {dialogue.length > 0 && (
                <button
                  type="button"
                  onClick={handleTestSpeech}
                  className={`audio-script-preview-btn ${isTestingAudio ? 'is-playing' : ''}`}
                >
                  <TrainingIcon type="headphones" size={14} />
                  <span>
                    {isTestingAudio
                      ? `Detener lectura (${activeTestLine !== null ? activeTestLine + 1 : 1}/${dialogue.length})`
                      : 'Lectura rápida del navegador'}
                  </span>
                </button>
              )}
            </div>

            <div className="audio-script-panel">
              <div className="audio-script-panel-head">
                <h4>Generación con IA</h4>
                <span className="audio-script-muted-tag">2 voces</span>
              </div>

              <div className="audio-script-duration-row">
                <div className="audio-script-presets" aria-label="Duraciones sugeridas">
                  {durationPresets.map(({ label, seconds }) => (
                    <button
                      key={seconds}
                      type="button"
                      className={Number(estimatedDurationSeconds) === seconds ? 'is-selected' : ''}
                      onClick={() => setEstimatedDurationSeconds(seconds)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="audio-script-seconds-box" htmlFor="audio-script-duration">
                  <input
                    id="audio-script-duration"
                    type="number"
                    min="30"
                    max="300"
                    step="5"
                    value={estimatedDurationSeconds}
                    onChange={(e) => setEstimatedDurationSeconds(e.target.value)}
                  />
                  <span>seg</span>
                </label>
              </div>

              <button
                type="button"
                className="audio-script-generate"
                onClick={handleGenerateAIScript}
                disabled={generating || saving || synthesizing || publishing}
              >
                <TrainingIcon type="sparkles" size={15} />
                <span>{generating ? 'Generando guion...' : 'Regenerar guion con IA'}</span>
              </button>
            </div>

            {!isPublished && (
              <div className="audio-script-panel">
                <div className="audio-script-panel-head">
                  <h4>Checklist de publicación</h4>
                </div>
                <div className="audio-script-checklist">
                  <label className={totalBracketCount === 0 && dialogue.length > 0 ? 'is-done' : ''}>
                    <input
                      type="checkbox"
                      checked={totalBracketCount === 0 && dialogue.length > 0}
                      readOnly
                    />
                    <span>
                      Sin datos entre corchetes
                      {totalBracketCount > 0 ? ` (${totalBracketCount})` : ''}
                    </span>
                  </label>

                  <label className={hasListened ? 'is-done' : ''}>
                    <input
                      type="checkbox"
                      checked={hasListened}
                      onChange={(e) => setHasListened(e.target.checked)}
                    />
                    <span>Audio generado y escuchado</span>
                  </label>

                  <label className={checkedTone ? 'is-done' : ''}>
                    <input
                      type="checkbox"
                      checked={checkedTone}
                      onChange={(e) => setCheckedTone(e.target.checked)}
                    />
                    <span>Tono natural y español argentino neutro</span>
                  </label>

                  <label className={checkedPolicies ? 'is-done' : ''}>
                    <input
                      type="checkbox"
                      checked={checkedPolicies}
                      onChange={(e) => setCheckedPolicies(e.target.checked)}
                    />
                    <span>Procedimiento y reglas validadas</span>
                  </label>
                </div>
              </div>
            )}
          </aside>

          {/* Área Principal: Bloques de Diálogo amplios y limpios */}
          <main className="audio-script-main">
            <div className="audio-script-main-heading">
              <div>
                <h3>Diálogo del episodio</h3>
                <p>Hacé clic en el locutor para alternar entre Trimi y Colega, o editá el texto.</p>
              </div>
              <div className="audio-script-main-meta">
                <span className="audio-script-stat-chip">
                  {dialogue.length} bloque{dialogue.length !== 1 ? 's' : ''}
                  {totalWords > 0 ? ` · ${totalWords} palabras · ~${formatSeconds(liveEstSeconds)}` : ''}
                </span>
                <button
                  type="button"
                  className="audio-script-add-top"
                  onClick={handleAddLine}
                  disabled={loading || generating}
                >
                  + Bloque
                </button>
              </div>
            </div>

            {notice && <div className="audio-script-message is-success">{notice}</div>}
            {error && <div className="audio-script-message is-error">{error}</div>}

            {totalBracketCount > 0 && (
              <div className="audio-script-warning">
                <span>
                  Hay <strong>{totalBracketCount}</strong> dato{totalBracketCount > 1 ? 's' : ''}{' '}
                  entre corchetes <code>[ ... ]</code> pendientes de completar.
                </span>
              </div>
            )}

            {loading ? (
              <div className="audio-script-loading">Cargando guion de la píldora...</div>
            ) : dialogue.length === 0 ? (
              <div className="audio-script-empty">
                <p>Esta píldora todavía no tiene guion.</p>
                <span>
                  Usá <strong>Regenerar guion con IA</strong> en el panel izquierdo o agregá un
                  bloque manualmente.
                </span>
              </div>
            ) : (
              <div className="audio-script-lines">
                {dialogue.map((line, idx) => {
                  const isTrimi = line.speaker === 'SPEAKER_1';
                  const bracketsInLine = extractBrackets(line.text);
                  const hasMissingData = bracketsInLine.length > 0;
                  const estimatedRows = Math.max(
                    2,
                    Math.min(6, Math.ceil((line.text?.length || 0) / 105))
                  );

                  return (
                    <article
                      key={idx}
                      className={`audio-script-line ${isTrimi ? 'is-primary' : 'is-secondary'}${
                        hasMissingData ? ' has-warning' : ''
                      }${activeTestLine === idx ? ' is-active-line' : ''}`}
                    >
                      <div className="audio-script-line-heading">
                        <span className="audio-script-line-number">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div
                          className="audio-script-speaker-switch"
                          role="group"
                          aria-label={`Locutor del bloque ${idx + 1}`}
                        >
                          <button
                            type="button"
                            className={isTrimi ? 'is-active is-trimi' : ''}
                            onClick={() => handleLineChange(idx, 'speaker', 'SPEAKER_1')}
                          >
                            Trimi
                          </button>
                          <button
                            type="button"
                            className={!isTrimi ? 'is-active is-colleague' : ''}
                            onClick={() => handleLineChange(idx, 'speaker', 'SPEAKER_2')}
                          >
                            Colega
                          </button>
                        </div>

                        {hasMissingData && (
                          <span className="audio-script-bracket-tag">
                            Falta completar: {bracketsInLine.join(', ')}
                          </span>
                        )}

                        <div className="audio-script-line-actions">
                          <button
                            type="button"
                            className="audio-script-icon-btn"
                            onClick={() => handleMoveLine(idx, -1)}
                            disabled={idx === 0}
                            title="Subir bloque"
                            aria-label={`Subir bloque ${idx + 1}`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="audio-script-icon-btn"
                            onClick={() => handleMoveLine(idx, 1)}
                            disabled={idx === dialogue.length - 1}
                            title="Bajar bloque"
                            aria-label={`Bajar bloque ${idx + 1}`}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="audio-script-remove"
                            onClick={() => handleRemoveLine(idx)}
                            title="Eliminar bloque"
                            aria-label={`Eliminar bloque ${idx + 1}`}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={estimatedRows}
                        aria-label={`Texto del bloque ${idx + 1}`}
                        value={line.text}
                        onChange={(e) => handleLineChange(idx, 'text', e.target.value)}
                        placeholder="Escribí la intervención aquí..."
                      />
                    </article>
                  );
                })}

                <button
                  type="button"
                  className="audio-script-add-line"
                  onClick={handleAddLine}
                >
                  + Agregar nuevo bloque
                </button>
              </div>
            )}
          </main>
        </div>

        {/* Footer limpio con acciones claras */}
        <footer className="audio-script-footer">
          <div className="audio-script-footer-left">
            <button type="button" className="audio-script-btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            {isDirty && <span className="audio-script-dirty-dot">Cambios sin guardar</span>}
          </div>

          <div className="audio-script-footer-actions">
            <button
              type="button"
              className="audio-script-btn-secondary"
              onClick={() => handleSave(true)}
              disabled={saving || generating || loading || dialogue.length === 0}
            >
              {saving ? 'Guardando...' : 'Guardar guion'}
            </button>

            <button
              type="button"
              className={isPublished ? 'audio-script-btn-primary' : 'audio-script-btn-accent'}
              onClick={handleSynthesize}
              disabled={
                synthesizing || isAudioGenerating || saving || generating || loading || dialogue.length === 0
              }
            >
              <TrainingIcon type="headphones" size={15} />
              <span>
                {synthesizing || isAudioGenerating
                  ? 'Generando audio...'
                  : isAudioReady
                    ? 'Regenerar audio'
                    : 'Generar audio'}
              </span>
            </button>

            {!isPublished && (
              <button
                type="button"
                className="audio-script-btn-publish"
                onClick={handleApproveAndPublish}
                disabled={!canPublish}
                title={
                  !canPublish
                    ? 'Completá los datos entre corchetes, escuchá el audio generado y marcá el checklist.'
                    : 'Aprobar y publicar píldora para los colaboradores'
                }
              >
                <TrainingIcon type="check" size={15} />
                <span>{publishing ? 'Publicando...' : 'Aprobar y publicar'}</span>
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
