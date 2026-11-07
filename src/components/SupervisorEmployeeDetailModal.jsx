import { useState, useEffect } from 'react';
import {
  getSupervisorEmployeeDiagnostic,
  resetEmployeeDiagnostic,
  getEmployeeSimulations,
} from '../api';
import TrainingIcon from './TrainingIcon';

export default function SupervisorEmployeeDetailModal({
  token,
  employee,
  onClose,
  onUpdated,
}) {
  const [activeTab, setActiveTab] = useState('progress'); // 'progress' | 'diagnostic' | 'simulations'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Datos diagnósticos
  const [diagnosticData, setDiagnosticData] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(null);

  // Datos simulaciones
  const [simulations, setSimulations] = useState([]);
  const [selectedSim, setSelectedSim] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [diagRes, simRes] = await Promise.allSettled([
          getSupervisorEmployeeDiagnostic(token, employee.id),
          getEmployeeSimulations(token, employee.id),
        ]);

        if (isMounted) {
          if (diagRes.status === 'fulfilled') {
            setDiagnosticData(diagRes.value);
          }
          if (simRes.status === 'fulfilled') {
            setSimulations(simRes.value || []);
            if (simRes.value && simRes.value.length > 0) {
              setSelectedSim(simRes.value[0]);
            }
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Error al cargar detalle del colaborador');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [token, employee.id]);

  const handleResetDiagnostic = async () => {
    if (!window.confirm(`¿Confirmás el reinicio del diagnóstico para ${employee.name}? El colaborador deberá rendir nuevamente la evaluación inicial.`)) {
      return;
    }
    setResetting(true);
    setResetSuccess(null);
    try {
      await resetEmployeeDiagnostic(token, employee.id);
      setResetSuccess('Diagnóstico reiniciado exitosamente. El colaborador puede volver a rendir la evaluación.');
      const updatedDiag = await getSupervisorEmployeeDiagnostic(token, employee.id);
      setDiagnosticData(updatedDiag);
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.message || 'Error al reiniciar diagnóstico');
    } finally {
      setResetting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'READY':
        return { label: 'Listo para atender', bg: '#ecfdf5', color: '#05968d', border: '#a7f3ee' };
      case 'NEEDS_HELP':
        return { label: 'Necesita ayuda', bg: '#fffdf5', color: '#b45309', border: '#fde68a' };
      default:
        return { label: 'En capacitación', bg: '#eef5fc', color: '#2b6fc0', border: '#cfe0f3' };
    }
  };

  const getBandBadge = (band) => {
    switch (band) {
      case 'ACHIEVED':
        return { label: 'Logrado', bg: '#ecfdf5', color: '#05968d', border: '#a7f3ee' };
      case 'NEEDS_IMPROVEMENT':
        return { label: 'A mejorar', bg: '#eef5fc', color: '#2b6fc0', border: '#cfe0f3' };
      case 'NOT_ACHIEVED':
        return { label: 'No alcanzado', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default:
        return { label: 'Sin evaluar', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
    }
  };

  const badge = getStatusBadge(employee.trackingStatus);

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{
          width: 'min(900px, 95vw)',
          height: '84vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Lexend, sans-serif', color: '#0f172a' }}>
                {employee.name}
              </h3>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                }}
              >
                {badge.label}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Puesto: <b>{employee.role || 'Vendedor/a'}</b> · Área: {employee.sectorName || 'Transversal'} · {employee.email}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            padding: '0 24px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('progress')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'progress' ? '2px solid #2b6fc0' : '2px solid transparent',
              background: 'none',
              fontWeight: activeTab === 'progress' ? 700 : 500,
              color: activeTab === 'progress' ? '#2b6fc0' : '#64748b',
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            Avance en la ruta
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostic')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'diagnostic' ? '2px solid #2b6fc0' : '2px solid transparent',
              background: 'none',
              fontWeight: activeTab === 'diagnostic' ? 700 : 500,
              color: activeTab === 'diagnostic' ? '#2b6fc0' : '#64748b',
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            Evaluación diagnóstica
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('simulations')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'simulations' ? '2px solid #2b6fc0' : '2px solid transparent',
              background: 'none',
              fontWeight: activeTab === 'simulations' ? 700 : 500,
              color: activeTab === 'simulations' ? '#2b6fc0' : '#64748b',
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            Prácticas y simulaciones ({simulations.length})
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Cargando datos del colaborador...</p>
          ) : error ? (
            <div className="error">{error}</div>
          ) : activeTab === 'progress' ? (
            /* TAB 1: AVANCE GENERAL EN LA RUTA */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 20,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Parada actual
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                    {employee.currentParada || 'En curso'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Avance global
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                    {employee.percentage}% ({employee.completedPills} de {employee.totalPills} paradas)
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Última actividad
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: employee.daysWithoutProgress >= 3 ? '#b45309' : '#0f172a', marginTop: 4 }}>
                    {employee.lastActivity
                      ? new Date(employee.lastActivity).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Sin registro reciente'}
                    {employee.daysWithoutProgress >= 3 && ' (⚠️ Sin avance reciente)'}
                  </div>
                </div>
              </div>

              {employee.trackingStatus === 'NEEDS_HELP' && (
                <div
                  style={{
                    background: '#fffdf5',
                    border: '1px solid #fde68a',
                    borderRadius: 10,
                    padding: '16px 20px',
                    color: '#92400e',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 4 }}>⚠️ Motivo de atención requerida:</strong>
                  {employee.daysWithoutProgress >= 3 && (
                    <div>• El colaborador lleva {employee.daysWithoutProgress} días sin registrar avances en su ruta formativa.</div>
                  )}
                  {employee.failedFreeSimulationsCount >= 2 && (
                    <div>• Ha desaprobado {employee.failedFreeSimulationsCount} veces la simulación libre interactiva. Se sugiere reforzar los conceptos de la píldora.</div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'diagnostic' ? (
            /* TAB 2: EVALUACIÓN DIAGNÓSTICA */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {resetSuccess && (
                <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3ee', color: '#05968d', borderRadius: 8, fontSize: 13 }}>
                  {resetSuccess}
                </div>
              )}

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Estado del Diagnóstico Inicial
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                    {diagnosticData?.hasCompletedDiagnostic
                      ? `Rendido · Puntaje obtenido: ${diagnosticData.lastSession?.score ?? 0}%`
                      : 'Pendiente de realización'}
                  </div>
                  {diagnosticData?.lastSession?.isReset && (
                    <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                      ⚠️ Este diagnóstico fue reiniciado por el supervisor previamente.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleResetDiagnostic}
                  disabled={resetting || !diagnosticData?.hasCompletedDiagnostic}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#b91c1c',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: diagnosticData?.hasCompletedDiagnostic ? 'pointer' : 'not-allowed',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <TrainingIcon type="refresh" size={14} />
                  <span>{resetting ? 'Reiniciando...' : 'Reiniciar intento'}</span>
                </button>
              </div>

              {diagnosticData?.lastSession?.answers?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 10px', fontSize: 14, fontFamily: 'Lexend, sans-serif' }}>
                    Respuestas de la evaluación ({diagnosticData.lastSession.answers.length} preguntas)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {diagnosticData.lastSession.answers.map((ans, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          background: ans.isCorrect ? '#ecfdf5' : '#fef2f2',
                          border: ans.isCorrect ? '1px solid #a7f3ee' : '1px solid #fecaca',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 13,
                        }}
                      >
                        <TrainingIcon
                          type={ans.isCorrect ? 'check' : 'clock'}
                          size={15}
                          style={{ color: ans.isCorrect ? '#05968d' : '#b91c1c' }}
                        />
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          Pregunta {idx + 1}:
                        </span>
                        <span style={{ color: ans.isCorrect ? '#065f5a' : '#991b1b' }}>
                          {ans.isCorrect ? 'Correcta' : 'Incorrecta'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TAB 3: PRÁCTICAS Y SIMULACIONES */
            <div>
              {simulations.length === 0 ? (
                <p style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                  El colaborador aún no ha iniciado sesiones de práctica guiada o simulación libre.
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 20 }}>
                  {/* Lista de sesiones a la izquierda */}
                  <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                    {simulations.map((sim) => {
                      const isSel = selectedSim?.id === sim.id;
                      const band = getBandBadge(sim.feedback?.band);
                      return (
                        <div
                          key={sim.id}
                          onClick={() => setSelectedSim(sim)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: isSel ? '1.5px solid #2b6fc0' : '1px solid #e2e8f0',
                            background: isSel ? '#eef5fc' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#2b6fc0' }}>
                              {sim.mode === 'GUIDED' ? 'Práctica Guiada' : 'Simulación Libre'}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 8,
                                background: band.bg,
                                color: band.color,
                              }}
                            >
                              {band.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a', margin: '4px 0 2px' }}>
                            {sim.scenarioTitle || sim.pill?.title || 'Escenario comercial'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Cliente: {sim.customerName} ·{' '}
                            {sim.createdAt ? new Date(sim.createdAt).toLocaleDateString('es-AR') : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detalle de la sesión seleccionada */}
                  <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
                    {selectedSim ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#2b6fc0', textTransform: 'uppercase' }}>
                              {selectedSim.mode === 'GUIDED' ? 'Práctica Guiada' : 'Simulación Libre'}
                            </span>
                            <h4 style={{ margin: '2px 0 0', fontSize: 15, fontFamily: 'Lexend, sans-serif' }}>
                              {selectedSim.scenarioTitle || 'Escenario'}
                            </h4>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: 12,
                              background: getBandBadge(selectedSim.feedback?.band).bg,
                              color: getBandBadge(selectedSim.feedback?.band).color,
                              border: `1px solid ${getBandBadge(selectedSim.feedback?.band).border}`,
                            }}
                          >
                            Banda: {getBandBadge(selectedSim.feedback?.band).label}
                          </span>
                        </div>

                        {selectedSim.feedback && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                              <b>Devolución cualitativa:</b>
                              <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{selectedSim.feedback.summary}</p>
                            </div>
                            <div style={{ background: '#ecfdf5', padding: 12, borderRadius: 8, border: '1px solid #a7f3ee', fontSize: 13, color: '#065f5a' }}>
                              <b>Qué hizo bien:</b>
                              <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{selectedSim.feedback.whatWentWell}</p>
                            </div>
                            <div style={{ background: '#fffdf5', padding: 12, borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
                              <b>Aspectos a mejorar:</b>
                              <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{selectedSim.feedback.toImprove}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', color: '#64748b' }}>Seleccioná una sesión para ver el detalle.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', textAlign: 'right', background: '#ffffff' }}>
          <button type="button" className="secondary" onClick={onClose} style={{ padding: '8px 20px', minHeight: 40 }}>
            Cerrar detalle
          </button>
        </div>
      </div>
    </div>
  );
}
