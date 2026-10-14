import { useCallback, useEffect, useState } from 'react';
import { getEmployeeSimulations } from '../api';

export default function SupervisorSimulationsModal({ token, employeeId, employeeName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [simulations, setSimulations] = useState([]);
  const [selectedSimulation, setSelectedSimulation] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getEmployeeSimulations(token, employeeId)
      .then((res) => {
        setSimulations(res || []);
        if (res && res.length > 0) {
          setSelectedSimulation(res[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Error al cargar historial de simulaciones');
        setLoading(false);
      });
  }, [token, employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const getBandBadge = (band) => {
    switch (band) {
      case 'ACHIEVED':
        return { label: 'Logrado', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
      case 'NEEDS_IMPROVEMENT':
        return { label: 'A mejorar', bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
      case 'NOT_ACHIEVED':
        return { label: 'No alcanzado', bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
      default:
        return { label: 'Sin evaluar', bg: 'var(--bg)', color: 'var(--text-muted)', border: 'var(--border)' };
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 960, width: '95vw', height: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0 }}>Historial de Simulaciones y Prácticas</h3>
            <span className="hint">Auditoría pedagógica de: <strong>{employeeName}</strong></span>
          </div>
          <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {loading && <p style={{ textAlign: 'center', padding: 40 }}>Cargando registros de simulación...</p>}
        {error && <p className="error" style={{ margin: 20 }}>{error}</p>}

        {!loading && !error && simulations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 40 }}>🎭</span>
            <p style={{ marginTop: 12 }}>El empleado aún no ha realizado simulaciones ni prácticas guiadas.</p>
          </div>
        )}

        {!loading && !error && simulations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, flex: 1, minHeight: 0, marginTop: 14 }}>
            {/* Lista Lateral de Sesiones */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--border)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {simulations.map((sim) => {
                const isSelected = selectedSimulation?.id === sim.id;
                const bandStyle = getBandBadge(sim.feedback?.band || sim.feedback?.overallBand);

                return (
                  <div
                    key={sim.id}
                    onClick={() => setSelectedSimulation(sim)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.05)' : 'var(--surface)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="badge" style={{ fontSize: 10 }}>
                        {sim.mode === 'GUIDED' ? '🧭 Guiada' : '🎭 Libre'}
                      </span>
                      <span className="msg-time" style={{ fontSize: 11 }}>
                        {new Date(sim.startedAt).toLocaleDateString()} {new Date(sim.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <strong style={{ fontSize: 13, display: 'block', color: 'var(--text)', marginBottom: 4 }}>
                      {sim.pill?.title || 'Píldora Formativa'}
                    </strong>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {sim.messages?.length || 0} mensajes
                      </span>
                      {sim.feedback ? (
                        <span
                          className="badge"
                          style={{
                            fontSize: 10,
                            backgroundColor: bandStyle.bg,
                            color: bandStyle.color,
                            border: `1px solid ${bandStyle.border}`,
                          }}
                        >
                          {bandStyle.label}
                        </span>
                      ) : (
                        <span className="badge" style={{ fontSize: 10 }}>En progreso</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detalle de la Sesión Seleccionada */}
            {selectedSimulation && (
              <div style={{ overflowY: 'auto', paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Meta de la simulación */}
                <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: 15 }}>
                        {selectedSimulation.pill?.title || 'Práctica Pedagógica'}
                      </h4>
                      <span className="hint">
                        Modalidad: <strong>{selectedSimulation.mode === 'GUIDED' ? 'Práctica Guiada' : 'Simulación Libre'}</strong> · Estado: <strong>{selectedSimulation.status}</strong>
                      </span>
                    </div>

                    {selectedSimulation.feedback && (
                      <div>
                        {(() => {
                          const b = getBandBadge(selectedSimulation.feedback.band || selectedSimulation.feedback.overallBand);
                          return (
                            <span
                              className="badge"
                              style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                backgroundColor: b.bg,
                                color: b.color,
                                border: `1px solid ${b.border}`,
                                fontWeight: 700,
                              }}
                            >
                              Banda: {b.label}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Devolución Cualitativa (3 Tarjetas) si está concluida */}
                {selectedSimulation.feedback && (
                  <div>
                    <h5 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                      Devolución Cualitativa en 3 Dimensiones
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <div className="card" style={{ borderLeft: '4px solid #16a34a', margin: 0, padding: 12 }}>
                        <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 13, marginBottom: 4 }}>
                          ✨ Qué hizo bien
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>
                          {selectedSimulation.feedback.whatWentWell}
                        </p>
                      </div>

                      <div className="card" style={{ borderLeft: '4px solid #ea580c', margin: 0, padding: 12 }}>
                        <div style={{ fontWeight: 600, color: '#ea580c', fontSize: 13, marginBottom: 4 }}>
                          💡 Oportunidades de mejora
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>
                          {selectedSimulation.feedback.toImprove || selectedSimulation.feedback.whatToImprove}
                        </p>
                      </div>

                      <div className="card" style={{ borderLeft: '4px solid #2563eb', margin: 0, padding: 12 }}>
                        <div style={{ fontWeight: 600, color: '#2563eb', fontSize: 13, marginBottom: 4 }}>
                          📋 Reglas del negocio
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>
                          {selectedSimulation.feedback.businessRules || selectedSimulation.feedback.businessRulesCompliance}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Checklist de Objetivos (si era guiada) */}
                {selectedSimulation.goals && selectedSimulation.goals.length > 0 && (
                  <div className="card" style={{ margin: 0, padding: 12 }}>
                    <h5 style={{ margin: '0 0 8px', fontSize: 13 }}>Objetivos Pedagógicos Evaluados</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedSimulation.goals.map((g) => (
                        <div
                          key={g.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 4,
                            backgroundColor: (g.isCompleted !== undefined ? g.isCompleted : g.isAchieved) ? '#f0fdf4' : 'var(--bg)',
                            border: (g.isCompleted !== undefined ? g.isCompleted : g.isAchieved) ? '1px solid #bbf7d0' : '1px solid var(--border)',
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{(g.isCompleted !== undefined ? g.isCompleted : g.isAchieved) ? '✅' : '⏳'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: (g.isCompleted !== undefined ? g.isCompleted : g.isAchieved) ? 600 : 400, color: (g.isCompleted !== undefined ? g.isCompleted : g.isAchieved) ? '#166534' : 'var(--text)' }}>
                              {g.description || g.objective}
                            </div>
                            {g.evaluationNotes && (
                              <div style={{ fontSize: 11, color: '#65a30d', fontStyle: 'italic', marginTop: 2 }}>
                                Evidencia: {g.evaluationNotes}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcripción Completa */}
                <div className="card" style={{ margin: 0, padding: 12, flex: 1 }}>
                  <h5 style={{ margin: '0 0 10px', fontSize: 13 }}>Transcripción de la Conversación</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedSimulation.messages?.map((msg) => {
                      const isEmployee = msg.sender === 'USER';
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isEmployee ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              backgroundColor: isEmployee ? 'var(--primary)' : 'var(--bg)',
                              color: isEmployee ? '#fff' : 'var(--text)',
                              border: isEmployee ? 'none' : '1px solid var(--border)',
                              fontSize: 13,
                              lineHeight: 1.45,
                            }}
                          >
                            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, opacity: 0.85 }}>
                              {isEmployee ? 'Empleado' : 'Cliente Simulado (IA)'}
                            </div>
                            {msg.content}
                          </div>
                          <span className="msg-time" style={{ fontSize: 10, marginTop: 2 }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

