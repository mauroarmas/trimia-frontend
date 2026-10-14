import { useCallback, useEffect, useState } from 'react';
import {
  createTrainingModule,
  enqueueAudioGeneration,
  generatePill,
  getEmployeeModules,
  getPillAudioStatus,
  getSupervisorModules,
  publishPill,
} from '../api';
import AudioScriptModal from './AudioScriptModal';
import DiagnosticQuizModal from './DiagnosticQuizModal';
import PillStudyModal from './PillStudyModal';
import SimulationModal from './SimulationModal';

export default function TrainingPanel({ token, me }) {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modales
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [activePillId, setActivePillId] = useState(null);
  const [scriptModalPill, setScriptModalPill] = useState(null);
  const [simulationConfig, setSimulationConfig] = useState(null);

  // Sección Supervisor
  const isSupervisor = me?.role === 'SUPERVISOR';
  const [supervisorTab, setSupervisorTab] = useState(false);
  const [supervisorModules, setSupervisorModules] = useState([]);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const [creatingModule, setCreatingModule] = useState(false);
  const [retryingAudioPillId, setRetryingAudioPillId] = useState(null);

  // Generador de Píldora con IA
  const [genModuleId, setGenModuleId] = useState('');
  const [genObjective, setGenObjective] = useState('');
  const [generatingPill, setGeneratingPill] = useState(false);
  const [genNotice, setGenNotice] = useState(null);

  const loadEmployeePath = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployeeModules(token);
      setModules(data || []);
    } catch (err) {
      setError(err.message || 'Error al cargar módulos de capacitación');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadSupervisorView = useCallback(async () => {
    if (!isSupervisor) return;
    try {
      const data = await getSupervisorModules(token);
      setSupervisorModules(data || []);
      if (data?.length > 0 && !genModuleId) {
        setGenModuleId(data[0].id);
      }
    } catch {
      // Silencioso o log
    }
  }, [token, isSupervisor, genModuleId]);

  useEffect(() => {
    loadEmployeePath();
    if (isSupervisor) {
      loadSupervisorView();
    }
  }, [loadEmployeePath, loadSupervisorView, isSupervisor]);

  const handleCreateModule = async (e) => {
    e.preventDefault();
    if (!newModuleTitle.trim() || creatingModule) return;
    setCreatingModule(true);
    try {
      await createTrainingModule(token, {
        title: newModuleTitle.trim(),
        description: newModuleDesc.trim() || undefined,
        sectorId: me.sectorId || undefined,
      });
      setNewModuleTitle('');
      setNewModuleDesc('');
      loadSupervisorView();
      loadEmployeePath();
    } catch (err) {
      alert(err.message || 'Error al crear módulo');
    } finally {
      setCreatingModule(false);
    }
  };

  const handleGeneratePill = async (e) => {
    e.preventDefault();
    if (!genModuleId || !genObjective.trim() || generatingPill) return;
    setGeneratingPill(true);
    setGenNotice(null);
    try {
      const pill = await generatePill(token, {
        moduleId: genModuleId,
        topic: genObjective.trim(),
      });
      setGenObjective('');
      setGenNotice(`Píldora "${pill.title}" generada en borrador.`);
      loadSupervisorView();
    } catch (err) {
      alert(err.message || 'Error al generar píldora');
    } finally {
      setGeneratingPill(false);
    }
  };

  const handlePublishPill = async (pillId) => {
    try {
      await publishPill(token, pillId);
      loadSupervisorView();
      loadEmployeePath();
    } catch (err) {
      alert(err.message || 'Error al publicar píldora');
    }
  };

  const handleRetryAudio = async (pillId) => {
    setRetryingAudioPillId(pillId);
    try {
      await enqueueAudioGeneration(token, pillId);
      await loadSupervisorView();
    } catch (err) {
      alert(err.message || 'Error al reintentar síntesis de audio');
    } finally {
      setRetryingAudioPillId(null);
    }
  };

  // Polling automático cuando hay píldoras con síntesis en progreso
  useEffect(() => {
    if (!isSupervisor || !supervisorTab) return;

    const hasProcessingAudio = supervisorModules.some((m) =>
      m.pills?.some((p) => p.audioStatus === 'AUDIO_PENDING' || p.audioStatus === 'AUDIO_GENERATING')
    );

    if (!hasProcessingAudio) return;

    const interval = setInterval(() => {
      loadSupervisorView();
    }, 4000);

    return () => clearInterval(interval);
  }, [isSupervisor, supervisorTab, supervisorModules, loadSupervisorView]);

  // Cálculo de estadísticas de avance del empleado
  const totalPills = modules.reduce((acc, m) => acc + (m.pills?.length || 0), 0);
  const completedOrExemptedPills = modules.reduce(
    (acc, m) =>
      acc +
      (m.pills?.filter((p) => p.isCompleted || p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC').length || 0),
    0
  );
  const anyExempted = modules.some((m) =>
    m.pills?.some((p) => p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC')
  );
  const progressPercent = totalPills > 0
    ? Math.round((completedOrExemptedPills / totalPills) * 100)
    : 0;

  return (
    <div className="training-panel">
      {/* Top Banner de Diagnóstico Inicial */}
      <div className="card training-diagnostic-banner">
        <div className="training-diagnostic-layout">
          <div>
            <span className="training-diagnostic-kicker">Evaluación inicial</span>
            <h2 className="training-diagnostic-title">
              Evaluación Diagnóstica Inicial y Nivelación
            </h2>
            <p className="training-diagnostic-description">
              Evalúa tus conocimientos previos en un test dinámico de 5 minutos. Si obtienes el 100% en los temas de un módulo,
              quedarás automáticamente eximido para avanzar más rápido en tu ruta formativa.
            </p>
          </div>
          <div>
            <button
              onClick={() => setShowDiagnostic(true)}
              className="training-diagnostic-action"
            >
              Rendir Diagnóstico Inicial <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subnavegación si es Supervisor */}
      {isSupervisor && (
        <div className="submenu-bar" style={{ marginBottom: 20 }}>
          <div className="submenu-pills">
            <button
              className={`submenu-pill${!supervisorTab ? ' active' : ''}`}
              onClick={() => setSupervisorTab(false)}
            >
              Mi Ruta de Aprendizaje (Empleado)
            </button>
            <button
              className={`submenu-pill${supervisorTab ? ' active' : ''}`}
              onClick={() => setSupervisorTab(true)}
            >
              Gestión y Generación de Píldoras (Supervisor)
            </button>
          </div>
        </div>
      )}

      {/* VISTA 1: Ruta de Aprendizaje del Empleado */}
      {!supervisorTab && (
        <div className="training-path">
          {/* Barra de progreso global */}
          <div className="card training-progress-card" style={{ marginBottom: 18 }}>
            <div className="training-progress-heading">
              <span style={{ fontWeight: 600 }}>Progreso General de Capacitación</span>
              <span className="hint training-progress-stat">
                {completedOrExemptedPills} de {totalPills} lecciones completadas
                {totalPills > 0 && <strong>{progressPercent}%</strong>}
              </span>
            </div>
            <div className="training-progress-track">
              <div
                className="training-progress-fill"
                style={{
                  width: totalPills > 0 ? `${(completedOrExemptedPills / totalPills) * 100}%` : '0%',
                }}
              />
            </div>
            {anyExempted && (
              <p className="hint" style={{ marginTop: 8, fontSize: 12, color: 'var(--success)' }}>
                🌟 Tienes lecciones eximidas por tu diagnóstico inicial habilitadas para libre repaso.
              </p>
            )}
          </div>

          {loading && <p style={{ textAlign: 'center', padding: 20 }}>Cargando ruta formativa...</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !error && modules.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p className="hint">No hay módulos de capacitación asignados a tu sector por el momento.</p>
            </div>
          )}

          {/* Módulos */}
          <div className="training-module-list">
            {modules.map((m, mIdx) => (
              <div key={m.id} className="card training-module-card">
                <div className="training-module-heading">
                  <div className="training-module-title-row">
                    <div className="training-module-title-copy">
                      <span className="training-module-kicker">Módulo {mIdx + 1}</span>
                      <h3>{m.title}</h3>
                    </div>
                    <span className="training-module-count">{m.pills?.length || 0} temas</span>
                  </div>
                  {m.description && <p className="hint training-module-description">{m.description}</p>}
                </div>

                {/* Lista de Píldoras del Módulo */}
                <div className="training-lesson-list">
                  {m.pills?.map((p, pIdx) => {
                    const isExempt = p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC';
                    const isLocked = p.isLocked;
                    const lessonClassName = [
                      'training-lesson-card',
                      isLocked && 'is-locked',
                      isExempt && 'is-exempt',
                      !isExempt && p.isCompleted && 'is-completed',
                    ].filter(Boolean).join(' ');

                    return (
                      <div
                        key={p.id}
                        className={lessonClassName}
                      >
                        <div className="training-lesson-info">
                          <span className="training-lesson-icon">
                            {isLocked ? '🔒' : isExempt ? '🌟' : p.isCompleted ? '✅' : '📖'}
                          </span>
                          <div className="training-lesson-copy">
                            <span className={`training-lesson-status${isExempt || p.isCompleted ? ' is-complete' : isLocked ? ' is-locked' : ''}`}>
                              {isLocked ? 'Bloqueada' : isExempt ? 'Eximido por diagnóstico' : p.isCompleted ? 'Completado' : 'Pendiente'}
                            </span>
                            <strong className="training-lesson-title">
                              {pIdx + 1}. {p.title}
                            </strong>
                            <div className="msg-time training-lesson-objective">{p.objective}</div>
                          </div>
                        </div>

                        <div className="training-lesson-actions">
                          {isLocked ? (
                            <button className="secondary" disabled style={{ padding: '4px 10px', fontSize: 12 }}>
                              Bloqueada
                            </button>
                          ) : (
                            <>
                              <button
                                className={`training-lesson-primary${isExempt || p.isCompleted ? ' is-review' : ''}`}
                                onClick={() => setActivePillId(p.id)}
                              >
                                {isExempt ? 'Repasar Lección' : p.isCompleted ? 'Revisar' : 'Comenzar'}
                              </button>
                              <button
                                type="button"
                                className="secondary training-simulation-button"
                                onClick={() => setSimulationConfig({ pill: p, mode: 'GUIDED' })}
                                title="Iniciar práctica guiada con cliente simulado y objetivos pedagógicos en vivo"
                              >
                                🧭 Práctica Guiada
                              </button>
                              <button
                                type="button"
                                className="secondary training-simulation-button"
                                onClick={() => setSimulationConfig({ pill: p, mode: 'FREE' })}
                                title="Iniciar simulación libre de interacción real sin ayudas en vivo"
                              >
                                🎭 Simulación Libre
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISTA 2: Panel del Supervisor (Creación y Publicación de Módulos) */}
      {isSupervisor && supervisorTab && (
        <div className="training-supervisor-view">
          <div className="training-supervisor-forms">
            <section className="card training-admin-card training-create-card">
              <h3 className="training-admin-title">Nuevo Módulo Formativo</h3>
              <form onSubmit={handleCreateModule} className="training-admin-form">
                <div className="training-admin-field">
                <label>Título del Módulo</label>
                <input
                  type="text"
                  placeholder="Ej: Políticas de Recupero en Mora Tardía"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  required
                />
                </div>
                <div className="training-admin-field">
                <label>Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Descripción de los contenidos del módulo..."
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                />
                </div>
                <div className="training-form-actions">
                  <button type="submit" disabled={creatingModule || !newModuleTitle.trim()}>
                  {creatingModule ? 'Creando...' : 'Crear Módulo'}
                  </button>
                </div>
              </form>
            </section>

            <section className="card training-admin-card training-generate-card">
              <div className="training-admin-heading">
                <div>
                  <h3 className="training-admin-title">Generar Píldora con IA</h3>
                  <span className="training-admin-subtitle">(ElevenLabs / Gemini)</span>
                </div>
                <span className="training-ai-mark" aria-hidden="true">✣</span>
              </div>
              <p className="hint training-generation-note">
                TrimIA utiliza la base de conocimiento y los casos reales del sector para redactar el contenido teórico y su cuestionario pedagógico.
              </p>
              {genNotice && (
                <div className="training-generation-notice">✓ {genNotice}</div>
              )}
              <form onSubmit={handleGeneratePill} className="training-admin-form">
                <div className="training-admin-field">
                  <label>Módulo de Destino</label>
                  <select value={genModuleId} onChange={(e) => setGenModuleId(e.target.value)}>
                    {supervisorModules.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>
                <div className="training-admin-field">
                  <label>Objetivo Pedagógico / Tema</label>
                  <input
                    type="text"
                    placeholder="Ej: Explicar cómo negociar un plan de cuotas escalonado cuando el cliente aduce desempleo temporal"
                    value={genObjective}
                    onChange={(e) => setGenObjective(e.target.value)}
                    required
                  />
                </div>
                <div className="training-form-actions">
                  <button type="submit" disabled={generatingPill || !genObjective.trim()}>
                    {generatingPill ? 'Generando con IA...' : '✨ Generar Píldora con IA'}
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Listado de Módulos y Píldoras del Supervisor */}
          <section className="training-supervisor-modules">
            <h3 className="training-supervisor-section-title">Módulos de tu Sector y Estado de Píldoras</h3>
            <div className="training-supervisor-module-list">
              {supervisorModules.map((m) => (
                <article key={m.id} className="card training-supervisor-module">
                  <div className="training-supervisor-module-heading">
                    <div>
                      <span className="training-module-kicker">Módulo de capacitación</span>
                      <h4>{m.title}</h4>
                    </div>
                    <span className="training-supervisor-module-count">{m.pills?.length || 0} píldoras</span>
                  </div>

                  <div className="training-supervisor-pill-list">
                    {m.pills?.map((p) => (
                      <div key={p.id} className="training-supervisor-pill">
                        <span className="training-supervisor-pill-icon" aria-hidden="true">
                          {p.audioStatus === 'AUDIO_READY' ? '♬' : '▤'}
                        </span>
                        <div className="training-supervisor-pill-info">
                          <strong className="training-supervisor-pill-title">{p.title}</strong>
                          <div className="training-supervisor-pill-statuses">
                            <span className={`training-admin-status${p.status === 'PUBLISHED' ? ' is-published' : ''}`}>
                              {p.status}
                            </span>

                            {/* Audio Status Badge */}
                            {p.audioStatus && p.audioStatus !== 'NOT_REQUESTED' && (
                              <span
                                className={`training-admin-audio-status is-${p.audioStatus.toLowerCase().replaceAll('_', '-')}`}
                                title={p.audioError || undefined}
                              >
                                {p.audioStatus === 'AUDIO_READY' && '🎧 Audio Listo'}
                                {p.audioStatus === 'AUDIO_GENERATING' && '⏳ Sintetizando...'}
                                {p.audioStatus === 'AUDIO_PENDING' && '⏱️ En Cola'}
                                {p.audioStatus === 'AUDIO_FAILED' && '⚠️ Audio Falló'}
                                {p.audioStatus === 'SCRIPT_GENERATED' && '📝 Guion Creado'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="training-supervisor-pill-actions">
                          {/* Botón Reintentar si falló la síntesis */}
                          {p.audioStatus === 'AUDIO_FAILED' && (
                            <button
                              onClick={() => handleRetryAudio(p.id)}
                              disabled={retryingAudioPillId === p.id}
                              className="training-audio-retry"
                              title="Reintentar síntesis de voz en BullMQ"
                            >
                              {retryingAudioPillId === p.id ? 'Reintentando...' : '🔄 Reintentar Audio'}
                            </button>
                          )}

                          {/* Botón Abrir Guion / Síntesis */}
                          <button
                            onClick={() => setScriptModalPill(p)}
                            className="secondary training-script-button"
                            title="Ver o editar guion a 2 voces y sintetizar audio"
                          >
                            🎙️ Guion & Audio
                          </button>

                          {p.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePublishPill(p.id)}
                              className="training-publish-button"
                            >
                              Publicar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Modales */}
      {scriptModalPill && (
        <AudioScriptModal
          token={token}
          pill={scriptModalPill}
          onClose={() => setScriptModalPill(null)}
          onScriptUpdated={() => {
            loadSupervisorView();
            loadEmployeePath();
          }}
        />
      )}
      {showDiagnostic && (
        <DiagnosticQuizModal
          token={token}
          onClose={() => setShowDiagnostic(false)}
          onComplete={() => {
            loadEmployeePath();
          }}
        />
      )}

      {activePillId && (
        <PillStudyModal
          token={token}
          pillId={activePillId}
          onClose={() => setActivePillId(null)}
          onProgressUpdated={() => {
            loadEmployeePath();
          }}
        />
      )}

      {simulationConfig && (
        <SimulationModal
          token={token}
          pill={simulationConfig.pill}
          pillId={simulationConfig.pill?.id}
          pillTitle={simulationConfig.pill?.title}
          mode={simulationConfig.mode}
          onClose={() => setSimulationConfig(null)}
          onCompleted={() => {
            loadEmployeePath();
          }}
        />
      )}
    </div>
  );
}
