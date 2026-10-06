import { useEffect, useState } from 'react';
import { getEmployeePill, verifyPillQuiz } from '../api';

export default function PillStudyModal({ token, pillId, onClose, onProgressUpdated }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pill, setPill] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState(null);

  useEffect(() => {
    let mounted = true;
    getEmployeePill(token, pillId)
      .then((data) => {
        if (!mounted) return;
        setPill(data);
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

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
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
            <div style={{ marginBottom: 16 }}>
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
                  }}
                >
                  <span style={{ fontSize: 18 }}>🌟</span>
                  <div>
                    <strong style={{ color: 'var(--success)' }}>Eximido por diagnóstico</strong>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                      Aprobaste esta lección en la evaluación inicial. Puedes repasar su contenido libremente sin necesidad de re-evaluarte.
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
            </div>

            {/* Contenido Teórico */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              {pill.content}
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
                        className="card"
                        style={{
                          border: quizResult
                            ? isFailed
                              ? '1px solid var(--danger)'
                              : '1px solid var(--success)'
                            : '1px solid var(--border)',
                          backgroundColor: quizResult
                            ? isFailed
                              ? 'var(--danger-bg)'
                              : 'var(--success-bg)'
                            : 'var(--surface)',
                        }}
                      >
                        <p style={{ fontWeight: 600, marginBottom: 10 }}>
                          {idx + 1}. {q.question}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {q.options.map((opt, oIdx) => (
                            <label
                              key={oIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 10px',
                                borderRadius: 4,
                                backgroundColor: 'var(--surface)',
                                border: selectedAnswers[idx] === oIdx ? '2px solid var(--primary)' : '1px solid var(--border)',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="radio"
                                name={`q_${idx}`}
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
                    disabled={submitting || (pill.quiz.some((_, i) => selectedAnswers[i] === undefined))}
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

