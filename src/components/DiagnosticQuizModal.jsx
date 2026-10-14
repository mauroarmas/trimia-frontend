import { useEffect, useState } from 'react';
import { getDiagnosticQuiz, submitDiagnostic } from '../api';

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

  // Timer countdown
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

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const answers = questions.map((q) => ({
        pillId: q.pillId,
        questionId: q.questionId,
        selectedOptionIndex: selectedAnswers[q.questionId],
      }));
      const res = await submitDiagnostic(token, answers);
      setResult(res);
      if (onComplete) onComplete(res);
    } catch (err) {
      setError(err.message || 'Error al calificar el diagnóstico');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="modal-overlay diagnostic-quiz-overlay">
      <div className="modal-content diagnostic-quiz-modal">
        {loading && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p>Cargando evaluación diagnóstica inicial...</p>
          </div>
        )}

        {alreadyCompleted && (
          <div>
            <h3>Evaluación Diagnóstica ya Realizada</h3>
            <p className="hint" style={{ marginTop: 8 }}>
              Ya has completado previamente tu evaluación diagnóstica inicial.
              Si necesitas volver a rendirla por algún cambio de área o solicitud especial, consulta con tu supervisor para que realice un reinicio de tu diagnóstico.
            </p>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}

        {!loading && !alreadyCompleted && error && !result && (
          <div>
            <h3>Atención</h3>
            <p className="error" style={{ margin: '16px 0' }}>{error}</p>
            <div style={{ textAlign: 'right' }}>
              <button onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}

        {!loading && !alreadyCompleted && !result && quizData && (
          <div>
            {questions.length === 0 ? (
              <div>
                <h3>Diagnóstico Inicial</h3>
                <p className="hint">No hay preguntas de diagnóstico disponibles actualmente para tu sector.</p>
                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button onClick={onClose}>Cerrar</button>
                </div>
              </div>
            ) : (
              <div className="diagnostic-quiz-content">
                <div className="diagnostic-quiz-header">
                  <div>
                    <h3>Evaluación Diagnóstica Inicial</h3>
                    <span className="diagnostic-quiz-counter">Pregunta {currentIndex + 1} de {questions.length}</span>
                  </div>
                  <div
                    className={`diagnostic-quiz-timer${secondsRemaining < 60 ? ' is-warning' : ''}`}
                  >
                    ⏱ {formatTimer(secondsRemaining)}
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="diagnostic-quiz-progress">
                  <div
                    style={{
                      width: `${((currentIndex + 1) / questions.length) * 100}%`,
                      height: '100%',
                      backgroundColor: 'var(--primary)',
                      borderRadius: 3,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>

                {/* Pregunta Actual */}
                <div className="card diagnostic-question-card">
                  <div className="diagnostic-question-meta">
                    <span className="badge">{currentQ.moduleTitle}</span>
                    <span className="diagnostic-question-pill">{currentQ.pillTitle}</span>
                  </div>
                  <h4 className="diagnostic-question-title">{currentQ.question}</h4>

                  <div className="diagnostic-options">
                    {currentQ.options.map((option, idx) => {
                      const isSelected = selectedAnswers[currentQ.questionId] === idx;
                      return (
                        <label
                          key={idx}
                          className={`diagnostic-option${isSelected ? ' is-selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`q_${currentQ.questionId}`}
                            checked={isSelected}
                            onChange={() => handleSelectOption(currentQ.questionId, idx)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Navegación y Finalización */}
                <div className="diagnostic-quiz-navigation">
                  <button
                    className="secondary"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => prev - 1)}
                  >
                    ← Anterior
                  </button>

                  <div>
                    {currentIndex < questions.length - 1 ? (
                      <button
                        onClick={() => setCurrentIndex((prev) => prev + 1)}
                        disabled={selectedAnswers[currentQ.questionId] === undefined}
                      >
                        Siguiente →
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={!allAnswered || submitting}
                        style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                      >
                        {submitting ? 'Evaluando...' : 'Finalizar y Calificar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal de Resultados */}
        {result && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🎯</div>
            <h3 style={{ margin: '0 0 8px' }}>¡Diagnóstico Completado!</h3>
            <p className="hint">Tus respuestas fueron evaluadas automáticamente.</p>

            <div
              style={{
                display: 'inline-block',
                margin: '16px auto',
                padding: '16px 28px',
                borderRadius: 12,
                backgroundColor: result.score >= 80 ? 'var(--success-bg)' : 'var(--bg)',
                border: `1px solid ${result.score >= 80 ? 'var(--success)' : 'var(--border)'}`,
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 700, color: result.score >= 80 ? 'var(--success)' : 'var(--primary)' }}>
                {result.score}%
              </div>
              <div className="hint">
                {result.correctAnswers} de {result.totalQuestions} aciertos
              </div>
            </div>

            {/* Módulos Eximidos */}
            <div style={{ textAlign: 'left', marginTop: 16 }}>
              <h4>Módulos Eximidos (100% de Aciertos)</h4>
              {result.exemptedModules?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.exemptedModules.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--success-bg)',
                        border: '1px solid var(--success)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>✓ {m.title}</span>
                      <span className="badge" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>
                        Eximido
                      </span>
                    </div>
                  ))}
                  <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>
                    🌟 Has demostrado dominio total de estos módulos. Sus lecciones quedan aprobadas automáticamente para desbloquear temas avanzados, con acceso libre de lectura.
                  </p>
                </div>
              ) : (
                <p className="hint">No alcanzaste el 100% en ningún módulo completo para exención directa.</p>
              )}
            </div>

            {/* Módulos Pendientes */}
            {result.pendingModules?.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: 16 }}>
                <h4>Módulos a Cursar</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.pendingModules.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                      }}
                    >
                      <span>• {m.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button onClick={onClose} style={{ width: '100%' }}>
                Ir a mi Ruta de Capacitación
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
