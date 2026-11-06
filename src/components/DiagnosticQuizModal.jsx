import { useEffect, useState } from 'react';
import { getDiagnosticQuiz, submitDiagnostic } from '../api';
import Trimi from './Trimi';
import TrainingIcon from './TrainingIcon';

export default function DiagnosticQuizModal({ token, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionIndex }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutos

  useEffect(() => {
    let mounted = true;
    getDiagnosticQuiz(token)
      .then((data) => {
        if (!mounted) return;
        setQuizData(data);
        setSecondsRemaining((data.estimatedMinutes || 5) * 60);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        if (err.status === 400 && err.message?.toLowerCase().includes('completado')) {
          setAlreadyCompleted(true);
        } else {
          setError(err.message || 'Error al cargar el diagnóstico');
        }
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  // Contador de 5 minutos
  useEffect(() => {
    if (loading || alreadyCompleted || result || !quizData || quizData.questions?.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, alreadyCompleted, result, quizData]);

  const questions = quizData?.questions || [];
  const currentQ = questions[currentIndex];
  const allAnswered = questions.length > 0 && questions.every((q) => selectedAnswers[q.questionId] !== undefined);

  const handleSelectOption = (questionId, optionIndex) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleNextOrSubmit = async () => {
    if (selectedAnswers[currentQ.questionId] === undefined) return;

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Enviar diagnóstico
      setSubmitting(true);
      setError(null);
      try {
        const answers = questions.map((q) => ({
          pillId: q.pillId,
          questionId: q.questionId,
          // 999 se usa para "Todavía no lo sé" (no rompe @Min(0) del backend y computa como incorrecto)
          selectedOptionIndex: selectedAnswers[q.questionId] !== undefined ? selectedAnswers[q.questionId] : 999,
        }));
        const res = await submitDiagnostic(token, answers);
        setResult(res);
        if (onComplete) onComplete(res);
      } catch (err) {
        setError(err.message || 'Error al calificar el diagnóstico');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  // Mapeo de módulos para la barra inferior "Cómo vas por tema" (Captura 2)
  const uniqueModules = [];
  if (questions.length > 0) {
    const seen = new Set();
    questions.forEach((q) => {
      if (!seen.has(q.moduleId)) {
        seen.add(q.moduleId);
        const moduleQuestions = questions.filter((item) => item.moduleId === q.moduleId);
        const answeredCount = moduleQuestions.filter((item) => selectedAnswers[item.questionId] !== undefined).length;
        uniqueModules.push({
          id: q.moduleId,
          title: q.moduleTitle,
          total: moduleQuestions.length,
          answered: answeredCount,
        });
      }
    });
  }

  return (
    <div className="modal-overlay diagnostic-quiz-overlay" style={{ background: 'rgba(23, 48, 90, 0.45)', backdropFilter: 'blur(3px)' }}>
      <div
        className="modal-content diagnostic-quiz-modal"
        style={{
          maxWidth: result ? 780 : 880,
          width: '94vw',
          borderRadius: 16,
          padding: 0,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 20px 45px rgba(23, 48, 90, 0.16)',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <p style={{ color: '#64748B' }}>Cargando evaluación diagnóstica inicial...</p>
          </div>
        )}

        {alreadyCompleted && (
          <div style={{ padding: 32 }}>
            <h3 style={{ margin: '0 0 10px', color: '#17305A' }}>Evaluación diagnóstica ya realizada</h3>
            <p className="hint" style={{ margin: 0 }}>
              Ya completaste tu evaluación diagnóstica inicial. Tu ruta de aprendizaje ya está configurada según tus respuestas y exenciones.
            </p>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button type="button" onClick={onClose} style={{ background: '#2B6FC0', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: 'pointer' }}>
                Ir a mi ruta
              </button>
            </div>
          </div>
        )}

        {!loading && !alreadyCompleted && error && !result && (
          <div style={{ padding: 32 }}>
            <h3 style={{ margin: '0 0 10px', color: '#17305A' }}>Atención</h3>
            <p className="error" style={{ margin: '14px 0' }}>{error}</p>
            <div style={{ textAlign: 'right' }}>
              <button type="button" className="secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* CUESTIONARIO CONVERSADO (Captura 2) */}
        {!loading && !alreadyCompleted && !result && quizData && questions.length > 0 && currentQ && (
          <div>
            {/* Header: Diagnóstico inicial, título, timer y contador */}
            <div
              style={{
                padding: '24px 30px 18px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#2B6FC0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Diagnóstico Inicial
                </span>
                <h2
                  style={{
                    margin: '3px 0 0',
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#17305A',
                    fontFamily: 'var(--font-title, "Lexend", sans-serif)',
                  }}
                >
                  Veamos qué ya sabés
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 20,
                    background: secondsRemaining < 60 ? '#FEF2F2' : '#F8FAFC',
                    border: `1px solid ${secondsRemaining < 60 ? '#FECACA' : '#E2E8F0'}`,
                    color: secondsRemaining < 60 ? '#DC2626' : '#64748B',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <TrainingIcon type="clock" size={14} />
                  <span>Quedan {formatTimer(secondsRemaining)}</span>
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 14px',
                    borderRadius: 20,
                    background: '#EEF5FC',
                    color: '#2B6FC0',
                    border: '1px solid #CFE0F3',
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  Pregunta {currentIndex + 1} de {questions.length}
                </span>
              </div>
            </div>

            {/* Cuerpo de 2 Columnas (Trimi piensa a la izquierda, Pregunta a la derecha) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 260px) 1fr',
                gap: 28,
                padding: '24px 30px',
                background: '#FAFCFE',
              }}
            >
              {/* Columna Izquierda: Trimi en "piensa" con globo de diálogo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    background: '#EEF5FC',
                    borderRadius: 14,
                    padding: '22px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #CFE0F3',
                  }}
                >
                  <Trimi mood="piensa" size={110} />
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #CFE0F3',
                    borderRadius: 12,
                    padding: '16px 18px',
                    boxShadow: '0 2px 6px rgba(43, 111, 192, 0.04)',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: '#17305A',
                      textAlign: 'justify',
                      hyphens: 'auto',
                    }}
                  >
                    Tomate tu tiempo, esto no es un examen. Me sirve para no hacerte repetir lo que ya sabés. Si no sabés una respuesta, elegí «Todavía no lo sé» y lo vemos juntos en tu ruta.
                  </p>
                </div>
              </div>

              {/* Columna Derecha: Tarjeta de Pregunta y Opciones */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: '22px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                {/* Chip de Área / Módulo */}
                <div style={{ marginBottom: 12 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    {currentQ.moduleTitle} · {currentQ.pillTitle}
                  </span>
                </div>

                {/* Pregunta */}
                <h3
                  style={{
                    margin: '0 0 18px',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#17305A',
                    lineHeight: 1.45,
                  }}
                >
                  {currentQ.question}
                </h3>

                {/* Opciones con radio button real */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {currentQ.options.map((option, idx) => {
                    const isSelected = selectedAnswers[currentQ.questionId] === idx;
                    return (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '11px 14px',
                          borderRadius: 8,
                          border: `1.5px solid ${isSelected ? '#2B6FC0' : '#E2E8F0'}`,
                          background: isSelected ? '#EEF5FC' : '#ffffff',
                          color: isSelected ? '#17305A' : '#334155',
                          fontSize: 13.5,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQ.questionId}`}
                          checked={isSelected}
                          onChange={() => handleSelectOption(currentQ.questionId, idx)}
                          style={{ margin: 0, accentColor: '#2B6FC0', width: 17, height: 17 }}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}

                  {/* Opción "Todavía no lo sé" (Captura 2) */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${selectedAnswers[currentQ.questionId] === 999 ? '#2B6FC0' : '#E2E8F0'}`,
                      background: selectedAnswers[currentQ.questionId] === 999 ? '#EEF5FC' : '#F8FAFC',
                      color: selectedAnswers[currentQ.questionId] === 999 ? '#17305A' : '#64748B',
                      fontSize: 13.5,
                      cursor: 'pointer',
                      fontStyle: 'italic',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name={`q_${currentQ.questionId}`}
                      checked={selectedAnswers[currentQ.questionId] === 999}
                      onChange={() => handleSelectOption(currentQ.questionId, 999)}
                      style={{ margin: 0, accentColor: '#2B6FC0', width: 17, height: 17 }}
                    />
                    <span>Todavía no lo sé</span>
                  </label>
                </div>

                {/* Botón Responder */}
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  {currentIndex > 0 && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setCurrentIndex((prev) => prev - 1)}
                      style={{ padding: '9px 18px', fontSize: 13, minHeight: 44 }}
                    >
                      Anterior
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleNextOrSubmit}
                    disabled={selectedAnswers[currentQ.questionId] === undefined || submitting}
                    style={{
                      background: '#2B6FC0',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 24px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {submitting
                      ? 'Evaluando...'
                      : currentIndex === questions.length - 1
                      ? 'Finalizar y Calificar'
                      : 'Responder'}
                  </button>
                </div>
              </div>
            </div>

            {/* Barra Inferior: "Cómo vas por tema" (Captura 2) */}
            <div
              style={{
                padding: '16px 30px',
                borderTop: '1px solid #E2E8F0',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#17305A' }}>
                  Cómo vas por tema:
                </span>
                {uniqueModules.map((m) => (
                  <span
                    key={m.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: m.answered === m.total ? '#05968D' : '#64748B',
                      fontWeight: 500,
                    }}
                  >
                    <TrainingIcon
                      type={m.answered === m.total ? 'check' : 'clock'}
                      size={13}
                      style={{ color: m.answered === m.total ? '#05968D' : '#94A3B8' }}
                    />
                    <span>{m.title}: {m.answered} de {m.total}</span>
                  </span>
                ))}
              </div>

              <span style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                Con todo bien en un tema, esa parada queda eximida.
              </span>
            </div>
          </div>
        )}

        {/* Modal de Resultados */}
        {result && (
          <div style={{ padding: '36px 36px 28px', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <Trimi mood={result.exemptedModules?.length > 0 ? 'festeja' : 'saluda'} size={90} />
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: 22, color: '#17305A', fontFamily: 'var(--font-title, "Lexend", sans-serif)' }}>
              ¡Diagnóstico completado!
            </h3>
            <p className="hint" style={{ margin: '0 auto 20px', maxWidth: 540 }}>
              Evaluamos tus conocimientos previos para optimizar tu ruta formativa y eximirte de las paradas que ya dominás.
            </p>

            <div
              style={{
                display: 'inline-flex',
                gap: 20,
                alignItems: 'center',
                padding: '14px 28px',
                borderRadius: 12,
                backgroundColor: '#EEF5FC',
                border: '1px solid #CFE0F3',
                marginBottom: 24,
              }}
            >
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#2B6FC0' }}>Aciertos</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#17305A' }}>
                  {result.correctAnswers} / {result.totalQuestions}
                </div>
              </div>
              <div style={{ width: 1, height: 32, background: '#CFE0F3' }} />
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#2B6FC0' }}>Puntaje global</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2B6FC0' }}>
                  {result.score}%
                </div>
              </div>
            </div>

            {/* Paradas Eximidas */}
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#17305A', fontWeight: 700 }}>
                Paradas eximidas (100% de aciertos)
              </h4>
              {result.exemptedModules?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.exemptedModules.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3EE',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#05968D', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrainingIcon type="check" size={15} style={{ color: '#05968D' }} />
                        <span>{m.title}</span>
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: '#05968D',
                          color: '#ffffff',
                        }}
                      >
                        Eximida
                      </span>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: '#05968D', margin: '4px 0 0' }}>
                    Demostraste dominio de estos temas. Te quedan habilitadas para libre repaso.
                  </p>
                </div>
              ) : (
                <p className="hint" style={{ margin: 0 }}>
                  No alcanzaste el 100% en ningún módulo completo para exención directa; vas a poder cursar cada parada a tu ritmo.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                background: '#2B6FC0',
                color: '#ffffff',
                border: 'none',
                padding: '12px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Comenzar mi ruta de aprendizaje →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
