import { useEffect, useRef, useState } from 'react';
import {
  getAudioStreamUrl,
  getEmployeePill,
  getPillAudioScript,
  reportPlaybackProgress,
  verifyPillQuiz,
} from '../api';

export default function PillStudyModal({ token, pillId, onClose, onProgressUpdated }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pill, setPill] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState(null);

  // Audio Podcast Player State
  const audioRef = useRef(null);
  const lastReportedTimeRef = useRef(0);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isAudioCompleted, setIsAudioCompleted] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [scriptDialogue, setScriptDialogue] = useState(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [voices, setVoices] = useState([]);
  const isPlayingRef = useRef(false);
  const currentLineIndexRef = useRef(0);

  // Pre-cargar voces nativas del navegador
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) setVoices(v);
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Pre-cargar el guión de diálogo en cuanto se abre el modal para que esté listo al pulsar Play
  useEffect(() => {
    let active = true;
    if (pillId && token) {
      getPillAudioScript(token, pillId)
        .then((res) => {
          if (active && res && res.dialogue) {
            setScriptDialogue(res.dialogue);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [token, pillId]);

  // Detener la síntesis de voz del navegador si se desmonta o cierra el modal
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const getSpeakerVoices = () => {
    const list =
      voices.length > 0
        ? voices
        : 'speechSynthesis' in window
        ? window.speechSynthesis.getVoices()
        : [];
    const es = list.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
    let v1 = es[0] || list[0] || null;
    let v2 = es.length > 1 ? es[1] : list.length > 1 ? list[1] : v1;
    if (v1 && v2 && v1.name === v2.name && list.length > 1) {
      const other = list.find((v) => v.name !== v1.name);
      if (other) v2 = other;
    }
    return { voice1: v1, voice2: v2 };
  };

  const stopNarration = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speakLineAt = (index, lines) => {
    if (!('speechSynthesis' in window)) return;
    if (!isPlayingRef.current) return;
    if (!lines || lines.length === 0) return;

    if (index >= lines.length) {
      currentLineIndexRef.current = 0;
      setActiveLineIndex(-1);
      return;
    }

    currentLineIndexRef.current = index;
    setActiveLineIndex(index);

    const item = lines[index];
    const isSpk1 = item.speaker === 'SPEAKER_1';
    const { voice1, voice2 } = getSpeakerVoices();

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = isSpk1 ? 0.95 : 1.25; // Tono diferenciado para cada locutor
    if (isSpk1 && voice1) utterance.voice = voice1;
    if (!isSpk1 && voice2) utterance.voice = voice2;

    utterance.onend = () => {
      if (!isPlayingRef.current) return;
      speakLineAt(index + 1, lines);
    };

    utterance.onerror = () => {
      if (!isPlayingRef.current) return;
      speakLineAt(index + 1, lines);
    };

    window.speechSynthesis.speak(utterance);
  };

  const startNarration = async (fromIndex = null) => {
    if (!('speechSynthesis' in window)) {
      alert('Tu navegador no soporta síntesis de voz nativa.');
      return;
    }

    window.speechSynthesis.cancel();
    isPlayingRef.current = true;
    setIsPlaying(true);

    let lines = scriptDialogue;
    if (!lines || lines.length === 0) {
      try {
        const res = await getPillAudioScript(token, pillId);
        lines = res?.dialogue || [];
        setScriptDialogue(lines);
      } catch {
        lines = [];
      }
    }

    if (!lines || lines.length === 0) {
      stopNarration();
      return;
    }

    let idx = fromIndex !== null ? fromIndex : currentLineIndexRef.current;
    if (idx < 0 || idx >= lines.length) {
      idx = 0;
    }

    speakLineAt(idx, lines);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      stopNarration();
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    } else {
      if (audioRef.current) {
        audioRef.current.volume = 0;
        audioRef.current.play().catch(() => {});
      }
      startNarration();
    }
  };

  const handleAudioPlay = () => {
    if (!isPlayingRef.current) {
      if (audioRef.current) {
        audioRef.current.volume = 0;
      }
      startNarration();
    }
  };

  const handleAudioPause = () => {
    if (isPlayingRef.current) {
      stopNarration();
    }
  };

  const handleAudioSeeked = () => {
    if (audioRef.current && totalDuration > 0 && scriptDialogue?.length) {
      const frac = audioRef.current.currentTime / totalDuration;
      const targetIdx = Math.min(
        scriptDialogue.length - 1,
        Math.floor(frac * scriptDialogue.length),
      );
      currentLineIndexRef.current = targetIdx;
      if (isPlayingRef.current) {
        window.speechSynthesis.cancel();
        speakLineAt(targetIdx, scriptDialogue);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    getEmployeePill(token, pillId)
      .then((data) => {
        if (!mounted) return;
        setPill(data);
        setIsAudioCompleted(Boolean(data.isAudioCompleted));
        setPlaybackSeconds(data.playbackProgressSeconds || 0);
        lastReportedTimeRef.current = data.playbackProgressSeconds || 0;
        setTotalDuration(data.audioDurationSeconds || 0);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Error al cargar la píldora formativa');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token, pillId]);

  // Carga diferida del guion / transcripción cuando el usuario expande la vista
  const handleToggleScript = async () => {
    if (!showScript && scriptDialogue === null) {
      setLoadingScript(true);
      try {
        const res = await getPillAudioScript(token, pillId);
        setScriptDialogue(res?.dialogue || []);
      } catch {
        setScriptDialogue([]);
      } finally {
        setLoadingScript(false);
      }
    }
    setShowScript(!showScript);
  };

  // Manejo de eventos de reproducción de audio
  const handleTimeUpdate = async () => {
    if (!audioRef.current) return;
    const current = Math.floor(audioRef.current.currentTime);
    const duration = Math.floor(audioRef.current.duration) || totalDuration;
    if (duration > 0 && totalDuration === 0) {
      setTotalDuration(duration);
    }

    setPlaybackSeconds(current);

    // Reportar avance cada 5 segundos de reproducción efectiva
    if (Math.abs(current - lastReportedTimeRef.current) >= 5) {
      lastReportedTimeRef.current = current;
      try {
        const res = await reportPlaybackProgress(token, pillId, current);
        if (res?.isAudioCompleted && !isAudioCompleted) {
          setIsAudioCompleted(true);
          if (onProgressUpdated) onProgressUpdated();
        }
      } catch (err) {
        // Silencioso o log en consola para no interrumpir el flujo de audio
        console.warn('Error reportando progreso de audio:', err);
      }
    }
  };

  const handleAudioEnded = async () => {
    if (!audioRef.current) return;
    const finalTime = Math.floor(audioRef.current.currentTime);
    try {
      const res = await reportPlaybackProgress(token, pillId, finalTime);
      if (res?.isAudioCompleted) {
        setIsAudioCompleted(true);
        if (onProgressUpdated) onProgressUpdated();
      }
    } catch (err) {
      console.warn('Error reportando finalización de audio:', err);
    }
  };

  const handleSelectOption = (qIdx, optIdx) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIdx]: optIdx,
    }));
  };

  const handleVerify = async () => {
    const quiz = pill?.quiz || [];
    if (quiz.length === 0 || submitting) return;

    const answersArray = quiz.map((_, idx) => selectedAnswers[idx]);
    if (answersArray.some((a) => a === undefined)) {
      alert('Por favor responde todas las preguntas antes de verificar.');
      return;
    }

    setSubmitting(true);
    setQuizResult(null);
    try {
      const res = await verifyPillQuiz(token, pillId, answersArray);
      setQuizResult(res);
      if (res.passed && onProgressUpdated) {
        onProgressUpdated();
      }
    } catch (err) {
      alert(err.message || 'Error al verificar respuestas');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const hasAudio = pill?.hasAudio || pill?.audioStatus === 'AUDIO_READY';
  const progressPercent = totalDuration > 0
    ? Math.min(100, Math.round((playbackSeconds / totalDuration) * 100))
    : 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 740, maxHeight: '90vh', overflowY: 'auto' }}>
        {loading && <p style={{ textAlign: 'center', padding: 30 }}>Cargando píldora formativa...</p>}

        {error && (
          <div>
            <h3>Error</h3>
            <p className="error">{error}</p>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}

        {!loading && !error && pill && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{pill.title}</h3>
                <p className="hint" style={{ margin: 0 }}>Objetivo: {pill.objective}</p>
              </div>
              <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>
                ✕
              </button>
            </div>

            {/* Badges de Estado */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pill.isExempted ? (
                <div
                  style={{
                    backgroundColor: 'var(--success-bg)',
                    border: '1px solid var(--success)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                  }}
                >
                  <span style={{ fontSize: 18 }}>🌟</span>
                  <div>
                    <strong style={{ color: 'var(--success)' }}>Eximido por diagnóstico</strong>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                      Aprobaste esta lección en la evaluación inicial. Puedes repasar su contenido y audio libremente.
                    </div>
                  </div>
                </div>
              ) : pill.isCompleted ? (
                <div
                  style={{
                    backgroundColor: 'var(--success-bg)',
                    border: '1px solid var(--success)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    color: 'var(--success)',
                    fontWeight: 600,
                  }}
                >
                  ✓ Lección Completada
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--border)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  📖 Lección en Curso
                </div>
              )}

              {/* Badge de progreso de audio */}
              {hasAudio && (
                <div
                  style={{
                    backgroundColor: isAudioCompleted ? 'rgba(5, 150, 105, 0.1)' : 'rgba(79, 70, 229, 0.08)',
                    border: `1px solid ${isAudioCompleted ? 'var(--success)' : '#6366f1'}`,
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: isAudioCompleted ? 'var(--success)' : '#4338ca',
                    fontWeight: isAudioCompleted ? 600 : 500,
                  }}
                >
                  <span>{isAudioCompleted ? '🎧 Audio Completado (80% superado)' : '🎙️ Podcast Formativo Disponible'}</span>
                </div>
              )}
            </div>

            {/* SECCIÓN PODCAST / REPRODUCTOR DE AUDIO (US2 / US3) */}
            {hasAudio && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(99, 102, 241, 0.03) 100%)',
                  border: '1px solid #c7d2fe',
                  borderRadius: 10,
                  padding: '16px 18px',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>🎙️</span>
                    <div>
                      <strong style={{ fontSize: 14, color: '#312e81' }}>Episodio de Podcast Formativo</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Conversación guiada a 2 voces sobre los conceptos clave de esta píldora.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleToggleScript}
                      className="secondary"
                      style={{ fontSize: 11, padding: '5px 10px' }}
                    >
                      {showScript ? 'Ocultar Transcripción' : '📜 Ver Transcripción'}
                    </button>
                  </div>
                </div>

                {/* Control Unificado de Reproducción a 2 Voces */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 10,
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    borderRadius: 8,
                    border: '1px solid #e0e7ff',
                  }}
                >
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      backgroundColor: isPlaying ? '#dc2626' : '#4f46e5',
                      borderColor: isPlaying ? '#dc2626' : '#4f46e5',
                      color: '#fff',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={isPlaying ? 'Pausar el audio a 2 voces' : 'Reproducir el diálogo a 2 voces'}
                  >
                    <span>{isPlaying ? '⏸ Pausar Audio' : '▶ Reproducir Audio'}</span>
                  </button>
                  <div style={{ fontSize: 12, color: isPlaying ? '#4338ca' : 'var(--text-muted)', fontWeight: 500 }}>
                    {isPlaying
                      ? '🔊 Narrando a 2 voces (Locutor 1 y Locutor 2)...'
                      : '🎙️ Diálogo a 2 voces sobre los conceptos clave de esta píldora.'}
                  </div>
                </div>

                {/* HTML5 Audio Player */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <audio
                    ref={audioRef}
                    controls
                    preload="metadata"
                    src={getAudioStreamUrl(pill.id, token)}
                    onPlay={handleAudioPlay}
                    onPause={handleAudioPause}
                    onSeeked={handleAudioSeeked}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleAudioEnded}
                    style={{ width: '100%', height: 42, borderRadius: 6 }}
                  />

                  {/* Barra de Progreso de Escucha */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 6, backgroundColor: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          height: '100%',
                          backgroundColor: isAudioCompleted ? 'var(--success)' : '#4f46e5',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>
                      {formatSeconds(playbackSeconds)} / {formatSeconds(totalDuration)} ({progressPercent}%)
                    </span>
                  </div>

                  {/* Meta de 80% */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>
                      {isAudioCompleted
                        ? '✅ Requisito de escucha cumplido (80% alcanzado).'
                        : '💡 Escucha al menos el 80% para registrar el aprendizaje completo.'}
                    </span>
                    <span>Umbral requerido: 80%</span>
                  </div>
                </div>

                {/* Transcripción Desplegable */}
                {showScript && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px dashed #c7d2fe',
                    }}
                  >
                    <h5 style={{ margin: '0 0 10px', fontSize: 13, color: '#312e81' }}>
                      Transcripción del Diálogo a 2 Voces:
                    </h5>

                    {loadingScript ? (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando guion...</p>
                    ) : scriptDialogue && scriptDialogue.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                        {scriptDialogue.map((item, idx) => {
                          const isSpk1 = item.speaker === 'SPEAKER_1';
                          const isCurrentActive = idx === activeLineIndex;
                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                backgroundColor: isCurrentActive
                                  ? 'rgba(79, 70, 229, 0.15)'
                                  : isSpk1
                                  ? 'rgba(79, 70, 229, 0.05)'
                                  : 'rgba(16, 185, 129, 0.05)',
                                borderLeft: `3px solid ${
                                  isCurrentActive ? '#6366f1' : isSpk1 ? '#4f46e5' : '#10b981'
                                }`,
                                fontSize: 12,
                                lineHeight: 1.4,
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <strong style={{ color: isSpk1 ? '#4338ca' : '#047857', marginRight: 6 }}>
                                {isCurrentActive && '🔊 '}
                                {isSpk1 ? 'Locutor 1:' : 'Locutor 2:'}
                              </strong>
                              <span>{item.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        No hay transcripción disponible para este episodio.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Contenido Teórico */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg)',
                lineHeight: 1.6,
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              {(pill.content || '').split('\n\n').map((block, bIdx) => {
                const trimmed = block.trim();
                if (trimmed.startsWith('### ')) {
                  return (
                    <h4
                      key={bIdx}
                      style={{
                        margin: bIdx === 0 ? '0 0 8px' : '16px 0 8px',
                        color: 'var(--text)',
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      {trimmed.replace(/^###\s+/, '')}
                    </h4>
                  );
                }
                if (trimmed.startsWith('## ')) {
                  return (
                    <h3
                      key={bIdx}
                      style={{
                        margin: bIdx === 0 ? '0 0 8px' : '18px 0 8px',
                        color: 'var(--text)',
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      {trimmed.replace(/^##\s+/, '')}
                    </h3>
                  );
                }
                return (
                  <p key={bIdx} style={{ margin: '0 0 10px', whiteSpace: 'pre-line' }}>
                    {trimmed}
                  </p>
                );
              })}
            </div>

            {/* Cuestionario de Verificación */}
            {pill.quiz && pill.quiz.length > 0 && !pill.isExempted && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: 15, marginBottom: 12 }}>Cuestionario de Verificación</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {pill.quiz.map((q, idx) => {
                    const isFailed = quizResult && quizResult.failedIndices?.includes(idx);

                    return (
                      <div
                        key={idx}
                        style={{
                          border: '1px solid var(--border)',
                          borderColor: isFailed ? 'var(--danger)' : 'var(--border)',
                          borderRadius: 8,
                          padding: 14,
                          backgroundColor: isFailed ? 'var(--danger-bg)' : 'var(--surface)',
                        }}
                      >
                        <p style={{ fontWeight: 600, margin: '0 0 10px', fontSize: 14 }}>
                          {idx + 1}. {q.question}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {q.options?.map((opt, oIdx) => (
                            <label
                              key={oIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '4px 6px',
                                borderRadius: 4,
                                backgroundColor: selectedAnswers[idx] === oIdx ? 'var(--bg)' : 'transparent',
                              }}
                            >
                              <input
                                type="radio"
                                name={`quiz-q-${idx}`}
                                value={oIdx}
                                checked={selectedAnswers[idx] === oIdx}
                                onChange={() => handleSelectOption(idx, oIdx)}
                                style={{ width: 'auto', marginRight: 8 }}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>

                        {quizResult && quizResult.explanations && quizResult.explanations[idx] && (
                          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                            💡 {quizResult.explanations[idx]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {quizResult && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '10px 14px',
                      borderRadius: 6,
                      backgroundColor: quizResult.passed ? 'var(--success-bg)' : 'var(--danger-bg)',
                      border: `1px solid ${quizResult.passed ? 'var(--success)' : 'var(--danger)'}`,
                    }}
                  >
                    <strong>{quizResult.passed ? '¡Felicitaciones!' : 'Respuestas incorrectas'}</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                      {quizResult.passed
                        ? 'Has aprobado el cuestionario de esta píldora. La siguiente lección ha sido desbloqueada.'
                        : 'Revisa el contenido y las explicaciones didácticas e inténtalo de nuevo.'}
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <button
                    onClick={handleVerify}
                    disabled={submitting || pill.quiz.some((_, i) => selectedAnswers[i] === undefined)}
                  >
                    {submitting ? 'Verificando...' : 'Verificar Respuestas'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
