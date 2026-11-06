import { useEffect, useState } from 'react';
import {
  enqueueAudioGeneration,
  generatePillAudioScript,
  getPillAudioScript,
  updatePillAudioScript,
  publishPill,
  getPillAudioStatus,
} from '../api';
import TrainingIcon from './TrainingIcon';
import Trimi from './Trimi';

export default function AudioScriptModal({ token, pill, onClose, onScriptUpdated }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [dialogue, setDialogue] = useState([]);
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState(90);

  // Audio and approval states
  const [audioStatus, setAudioStatus] = useState(pill?.audioStatus || 'NOT_REQUESTED');
  const [audioUrl, setAudioUrl] = useState(pill?.audioUrl || null);
  const [hasListened, setHasListened] = useState(false);
  const [checkedTone, setCheckedTone] = useState(false);
  const [checkedPolicies, setCheckedPolicies] = useState(false);

  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [activeTestLine, setActiveTestLine] = useState(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
      const voice1 = spVoices.find((v) => v.lang === 'es-AR' || v.lang === 'es_AR') ||
        spVoices.find((v) => v.lang && (v.lang.startsWith('es-419') || v.lang.startsWith('es-US') || v.lang.startsWith('es-MX'))) ||
        spVoices[0] || null;
      const voice2 = spVoices.find((v) => v.name !== voice1?.name) || voice1;

      const speakerVoice = isTrimi ? voice1 : voice2;
      const speakerPitch = isTrimi ? 1.0 : (voice1?.name !== voice2?.name ? 1.0 : 0.92);

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
      // 1. Cargar guion
      try {
        const data = await getPillAudioScript(token, pill.id);
        if (data && Array.isArray(data.dialogue)) {
          setDialogue(data.dialogue);
          if (data.estimatedDurationSeconds) {
            setEstimatedDurationSeconds(data.estimatedDurationSeconds);
          }
        } else {
          setDialogue([]);
        }
      } catch (err) {
        if (err.status === 404 || err.message?.includes('404')) {
          setDialogue([]);
        } else {
          throw err;
        }
      }

      // 2. Cargar estado del audio
      try {
        const statusData = await getPillAudioStatus(token, pill.id);
        if (statusData) {
          setAudioStatus(statusData.audioStatus || 'NOT_REQUESTED');
          if (statusData.audioUrl) {
            setAudioUrl(statusData.audioUrl);
          }
        }
      } catch (e) {
        // Ignorar si aún no hay audio
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

  // Polling para audio si está en progreso
  useEffect(() => {
    if (audioStatus === 'AUDIO_PENDING' || audioStatus === 'AUDIO_GENERATING') {
      const interval = setInterval(async () => {
        try {
          const statusData = await getPillAudioStatus(token, pill.id);
          if (statusData) {
            setAudioStatus(statusData.audioStatus);
            if (statusData.audioUrl) {
              setAudioUrl(statusData.audioUrl);
            }
            if (statusData.audioStatus === 'AUDIO_READY') {
              setNotice('¡Audio sintetizado con éxito! Escuchalo antes de aprobar y publicar.');
              clearInterval(interval);
            }
          }
        } catch (e) {
          // ignore transient polling error
        }
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [audioStatus, pill.id, token]);

  const handleGenerateAIScript = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const targetSec = Number(estimatedDurationSeconds) || 90;
      const result = await generatePillAudioScript(token, pill.id, targetSec);
      setDialogue(result.dialogue || []);
      setEstimatedDurationSeconds(result.estimatedDurationSeconds || targetSec);
      setNotice(
        `✓ Guion con la voz de Trimi generado exitosamente (${result.dialogue?.length || 0} bloques, ~${result.estimatedDurationSeconds || targetSec}s).`
      );
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al generar guion con IA');
    } finally {
      setGenerating(false);
    }
  };

  const handleLineChange = (index, field, value) => {
    const updated = [...dialogue];
    updated[index] = { ...updated[index], [field]: value };
    setDialogue(updated);
  };

  const handleAddLine = () => {
    const lastSpeaker = dialogue.length > 0 ? dialogue[dialogue.length - 1].speaker : 'SPEAKER_2';
    const nextSpeaker = lastSpeaker === 'SPEAKER_1' ? 'SPEAKER_2' : 'SPEAKER_1';
    setDialogue([...dialogue, { speaker: nextSpeaker, text: '' }]);
  };

  const handleRemoveLine = (index) => {
    const updated = dialogue.filter((_, idx) => idx !== index);
    setDialogue(updated);
  };

  const handleSave = async (showToast = true) => {
    if (dialogue.length === 0) {
      alert('El guion debe tener al menos un bloque de diálogo.');
      return false;
    }
    const emptyLine = dialogue.some((d) => !d.text.trim());
    if (emptyLine) {
      alert('Todos los bloques deben tener texto.');
      return false;
    }

    setSaving(true);
    setError(null);
    if (showToast) setNotice(null);
    try {
      const updated = await updatePillAudioScript(token, pill.id, {
        dialogue,
        estimatedDurationSeconds: Number(estimatedDurationSeconds) || 90,
      });
      setDialogue(updated.dialogue);
      if (showToast) setNotice('Borrador de guion guardado correctamente.');
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
      alert('Tenés que generar o redactar un guion antes de generar el audio.');
      return;
    }

    // Guardar cambios antes de sintetizar
    const saved = await handleSave(false);
    if (!saved) return;

    if (!window.confirm('¿Deseás enviar este guion a la cola de síntesis de voz? El audio se generará para esta píldora.')) {
      return;
    }

    setSynthesizing(true);
    setError(null);
    setNotice(null);
    try {
      await enqueueAudioGeneration(token, pill.id);
      setAudioStatus('AUDIO_GENERATING');
      setNotice('¡Generación de audio encolada! En unos segundos estará listo para reproducir.');
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al iniciar la síntesis de audio');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (!canPublish) return;
    if (!window.confirm('¿Confirmás la aprobación y publicación de esta píldora? Quedará disponible de inmediato para los empleados.')) {
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishPill(token, pill.id);
      setNotice('🎉 ¡Píldora aprobada y publicada exitosamente! Los empleados asignados ya pueden acceder a ella en su ruta.');
      if (onScriptUpdated) onScriptUpdated();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Error al aprobar y publicar la píldora');
    } finally {
      setPublishing(false);
    }
  };

  // Detección de datos entre corchetes [ ... ]
  const extractBrackets = (text) => {
    if (!text) return [];
    const matches = text.match(/\[([^\]]+)\]/g);
    return matches ? matches : [];
  };

  const totalBracketCount = dialogue.reduce(
    (count, line) => count + extractBrackets(line.text).length,
    0
  );

  const isAudioReady = audioStatus === 'AUDIO_READY' || Boolean(audioUrl);
  const canPublish =
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

  return (
    <div className="modal-overlay audio-script-overlay">
      <section
        className="audio-script-modal"
        aria-label="Editor y revisión de guion"
        style={{
          width: 'min(1200px, calc(100vw - 24px))',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <header className="audio-script-header" style={{ padding: '16px 24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="audio-script-kicker">Revisión de contenido</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: pill.status === 'PUBLISHED' ? '#ecfdf5' : '#eef5fc',
                  color: pill.status === 'PUBLISHED' ? '#05968d' : '#2b6fc0',
                }}
              >
                {pill.status === 'PUBLISHED' ? 'Publicada' : isAudioReady ? 'En revisión' : 'Borrador'}
              </span>
            </div>
            <h2 style={{ margin: '4px 0 2px', fontSize: 18, fontFamily: 'Lexend, sans-serif' }}>
              Guion de la Píldora: {pill.title}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Objetivo: {pill.objective || 'Capacitación contextual para el colaborador'}
            </p>
          </div>
          <button type="button" className="audio-script-close" onClick={onClose} aria-label="Cerrar modal">
            ×
          </button>
        </header>

        <div className="audio-script-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Panel Lateral: Parámetros, Checklist y Audio */}
          <aside
            className="audio-script-sidebar"
            style={{
              width: 330,
              background: '#f8fafc',
              borderRight: '1px solid #e2e8f0',
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div>
              <span className="audio-script-section-label">Configuración</span>
              <h3 style={{ margin: '4px 0 12px', fontSize: 15, fontFamily: 'Lexend, sans-serif' }}>
                Voz y Calibración
              </h3>

              <label className="audio-script-duration-label" htmlFor="audio-script-duration">
                <span aria-hidden="true">◷</span> Tiempo objetivo
              </label>
              <div className="audio-script-duration-input" style={{ marginBottom: 8 }}>
                <input
                  id="audio-script-duration"
                  type="number"
                  min="30"
                  max="600"
                  step="1"
                  value={estimatedDurationSeconds}
                  onChange={(e) => setEstimatedDurationSeconds(e.target.value)}
                />
                <span>segundos</span>
              </div>
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

              <button
                type="button"
                className="audio-script-generate"
                onClick={handleGenerateAIScript}
                disabled={generating || saving || synthesizing || publishing}
                style={{
                  marginTop: 14,
                  width: '100%',
                  background: '#2b6fc0',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                <TrainingIcon type="sparkles" size={16} />
                <span>{generating ? 'Generando con IA...' : 'Generar Guion con la voz de Trimi'}</span>
              </button>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#0f172a', fontFamily: 'Lexend, sans-serif' }}>
                Voces del Guion
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eef5fc', border: '1px solid #cfe0f3', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                <Trimi mood="saluda" size={32} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#17305a' }}>Trimi (Guía)</div>
                  <div style={{ fontSize: 11, color: '#2b6fc0' }}>Voz principal · Explicación y consejos</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                <TrainingIcon type="user" size={24} style={{ color: '#475569' }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Colega / Copresentador</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Dudas operativas y preguntas típicas</div>
                </div>
              </div>
            </div>

            {/* Reproducción y estado del audio */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#0f172a', fontFamily: 'Lexend, sans-serif' }}>
                Audio de la Lección
              </h4>

              {/* Botón de reproducción de prueba con voz sintética inmediata */}
              {dialogue.length > 0 && (
                <button
                  type="button"
                  onClick={handleTestSpeech}
                  style={{
                    width: '100%',
                    marginBottom: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isTestingAudio ? '#fef2f2' : '#ffffff',
                    border: `1px solid ${isTestingAudio ? '#ef4444' : '#2b6fc0'}`,
                    color: isTestingAudio ? '#b91c1c' : '#2b6fc0',
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <TrainingIcon type="headphones" size={14} />
                  <span>
                    {isTestingAudio
                      ? `❚❚ Detener lectura (línea ${activeTestLine !== null ? activeTestLine + 1 : 1}/${dialogue.length})`
                      : 'Escuchar lectura de prueba'}
                  </span>
                </button>
              )}

              {audioStatus === 'AUDIO_GENERATING' || audioStatus === 'AUDIO_PENDING' ? (
                <div style={{ padding: '10px 12px', background: '#eef5fc', border: '1px solid #cfe0f3', borderRadius: 8, fontSize: 12.5, color: '#2b6fc0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ animation: 'spin 1.5s linear infinite' }}>⏳</div>
                  <span>Generando audio en cola...</span>
                </div>
              ) : isAudioReady ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#05968d', fontWeight: 600 }}>
                    <TrainingIcon type="check" size={14} />
                    <span>Audio disponible</span>
                  </div>
                  <audio
                    controls
                    src={`/training/pills/${pill.id}/audio`}
                    onPlay={() => setHasListened(true)}
                    style={{ width: '100%', height: 36 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', cursor: 'pointer', marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={hasListened}
                      onChange={(e) => setHasListened(e.target.checked)}
                    />
                    <span>He escuchado el audio de la lección</span>
                  </label>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                  Aún no se ha generado el archivo de audio. Podés escuchar la lectura de prueba arriba o generar el audio abajo.
                </div>
              )}
            </div>

            {/* Checklist de aprobación del supervisor */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#0f172a', fontFamily: 'Lexend, sans-serif' }}>
                Checklist antes de aprobar
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: totalBracketCount === 0 ? '#05968d' : '#92400e', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={totalBracketCount === 0 && dialogue.length > 0}
                    readOnly
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Sin corchetes ni datos pendientes [ ... ]
                    {totalBracketCount > 0 && ` (${totalBracketCount} pendiente${totalBracketCount > 1 ? 's' : ''})`}
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: hasListened ? '#05968d' : '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasListened}
                    onChange={(e) => setHasListened(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>Audio generado y escuchado</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checkedTone}
                    onChange={(e) => setCheckedTone(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>Voz de Trimi amigable y voseo rioplatense</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checkedPolicies}
                    onChange={(e) => setCheckedPolicies(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>Procedimiento operativo y reglas de Credimisión validadas</span>
                </label>
              </div>
            </div>
          </aside>

          {/* Área Principal: Bloques de Diálogo Editables */}
          <main className="audio-script-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '20px 24px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'Lexend, sans-serif', color: '#0f172a' }}>
                  Bloques del Guion
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                  Editá cada intervención antes de generar el audio final.
                </p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                {dialogue.length} bloque{dialogue.length !== 1 ? 's' : ''}
              </span>
            </div>

            {notice && <div className="audio-script-message is-success" style={{ marginBottom: 14 }}>{notice}</div>}
            {error && <div className="audio-script-message is-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

            {/* Aviso si hay corchetes pendientes */}
            {totalBracketCount > 0 && (
              <div
                style={{
                  background: '#fffdf5',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#92400e',
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>
                  Hay <b>{totalBracketCount}</b> dato(s) entre corchetes <code>[ ... ]</code> pendientes de completar en los bloques marcados. Completalos antes de aprobar la píldora.
                </span>
              </div>
            )}

            {loading ? (
              <p className="audio-script-loading">Cargando guion de la píldora...</p>
            ) : dialogue.length === 0 ? (
              <div className="audio-script-empty" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <p style={{ fontSize: 15, color: '#475569', fontWeight: 600 }}>Esta píldora aún no tiene un guion generado.</p>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Tocá "Generar Guion con la voz de Trimi" en el panel lateral para crearlo automáticamente en base a los conocimientos del sector.
                </span>
              </div>
            ) : (
              <div className="audio-script-lines" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {dialogue.map((line, idx) => {
                  const isTrimi = line.speaker === 'SPEAKER_1';
                  const bracketsInLine = extractBrackets(line.text);
                  const hasMissingData = bracketsInLine.length > 0;

                  return (
                    <article
                      key={idx}
                      className={`audio-script-line ${isTrimi ? 'is-primary' : 'is-secondary'}`}
                      style={{
                        border: activeTestLine === idx ? '2px solid #2b6fc0' : hasMissingData ? '1.5px solid #f59e0b' : isTrimi ? '1px solid #cfe0f3' : '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: 14,
                        background: activeTestLine === idx ? '#fef9c3' : hasMissingData ? '#fffdf7' : isTrimi ? '#f7faff' : '#ffffff',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div className="audio-script-line-heading" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span className="audio-script-line-number" style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                          Bloque {String(idx + 1).padStart(2, '0')}
                        </span>

                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 12,
                            background: isTrimi ? '#eef5fc' : '#f1f5f9',
                            color: isTrimi ? '#2b6fc0' : '#475569',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {isTrimi ? 'Voz 1 (Trimi)' : 'Voz 2 (Colega)'}
                        </span>

                        <select
                          aria-label={`Voz del bloque ${idx + 1}`}
                          value={line.speaker}
                          onChange={(e) => handleLineChange(idx, 'speaker', e.target.value)}
                          style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        >
                          <option value="SPEAKER_1">Voz 1 (Trimi)</option>
                          <option value="SPEAKER_2">Voz 2 (Colega)</option>
                        </select>

                        {/* Etiqueta de falta completar si hay corchetes */}
                        {hasMissingData && (
                          <span
                            style={{
                              background: '#fffbeb',
                              border: '1px solid #fde68a',
                              color: '#b45309',
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            ⚠️ Falta completar: {bracketsInLine.join(', ')}
                          </span>
                        )}

                        <button
                          type="button"
                          className="audio-script-remove"
                          onClick={() => handleRemoveLine(idx)}
                          title="Eliminar bloque"
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                        >
                          ✕ Quitar
                        </button>
                      </div>

                      <textarea
                        rows={3}
                        aria-label={`Texto del bloque ${idx + 1}`}
                        value={line.text}
                        onChange={(e) => handleLineChange(idx, 'text', e.target.value)}
                        placeholder="Escribí el parlamento aquí... Usá [DATO] si falta definir algo."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: hasMissingData ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          outline: 'none',
                          textAlign: 'justify',
                          hyphens: 'auto',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </article>
                  );
                })}

                <button
                  type="button"
                  className="audio-script-add-line"
                  onClick={handleAddLine}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px dashed #cbd5e1',
                    background: '#f8fafc',
                    color: '#2b6fc0',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  + Agregar nuevo bloque
                </button>
              </div>
            )}
          </main>
        </div>

        {/* Footer con los botones de acción: Guardar borrador, Generar audio, Aprobar y publicar */}
        <footer
          className="audio-script-footer"
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
          }}
        >
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            style={{ minHeight: 40, padding: '8px 18px', fontSize: 13 }}
          >
            Cerrar
          </button>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || generating || loading || dialogue.length === 0}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                padding: '9px 18px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                minHeight: 42,
              }}
            >
              {saving ? 'Guardando...' : 'Guardar borrador'}
            </button>

            <button
              type="button"
              onClick={handleSynthesize}
              disabled={synthesizing || saving || generating || loading || dialogue.length === 0}
              style={{
                background: '#ffffff',
                border: '1px solid #2b6fc0',
                color: '#2b6fc0',
                padding: '9px 18px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                minHeight: 42,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TrainingIcon type="headphones" size={15} />
              <span>{synthesizing ? 'Encolando audio...' : 'Generar audio'}</span>
            </button>

            <button
              type="button"
              onClick={handleApproveAndPublish}
              disabled={!canPublish}
              title={
                !canPublish
                  ? 'Para publicar: completá los datos entre corchetes, escuchá el audio generado y marcá el checklist.'
                  : 'Aprobar y publicar píldora para los colaboradores'
              }
              style={{
                background: canPublish ? '#05968d' : '#94a3b8',
                color: '#ffffff',
                border: 'none',
                padding: '9px 22px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: canPublish ? 'pointer' : 'not-allowed',
                minHeight: 42,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: canPublish ? '0 2px 4px rgba(5, 150, 141, 0.25)' : 'none',
              }}
            >
              <TrainingIcon type="check" size={16} />
              <span>{publishing ? 'Publicando...' : 'Aprobar y publicar'}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
