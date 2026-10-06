import { useCallback, useEffect, useState } from 'react';
import {
  createTrainingModule,
  generatePill,
  getEmployeeModules,
  getSupervisorModules,
  publishPill,
} from '../api';
import DiagnosticQuizModal from './DiagnosticQuizModal';
import PillStudyModal from './PillStudyModal';

export default function TrainingPanel({ token, me }) {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modales
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [activePillId, setActivePillId] = useState(null);

  // Sección Supervisor
  const isSupervisor = me?.role === 'SUPERVISOR';
  const [supervisorTab, setSupervisorTab] = useState(false);
  const [supervisorModules, setSupervisorModules] = useState([]);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const [creatingModule, setCreatingModule] = useState(false);

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

  return (
    <div>
      {/* Top Banner de Diagnóstico Inicial */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
          color: '#ffffff',
          padding: '20px 24px',
          marginBottom: 20,
          borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ color: '#ffffff', margin: '0 0 6px', fontSize: 18 }}>
              🎯 Evaluación Diagnóstica Inicial y Nivelación
            </h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: 13, maxWidth: 640 }}>
              Evalúa tus conocimientos previos en un test dinámico de 5 minutos. Si obtienes el 100% en los temas de un módulo,
              quedarás automáticamente eximido para avanzar más rápido en tu ruta formativa.
            </p>
          </div>
          <div>
            <button
              onClick={() => setShowDiagnostic(true)}
              style={{
                backgroundColor: '#ffffff',
                color: '#4f46e5',
                border: 'none',
                fontWeight: 700,
                padding: '10px 18px',
                borderRadius: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              Rendir Diagnóstico Inicial
            </button>
          </div>
        </div>
      </div>

      {/* Subnavegación si es Supervisor */}
      {isSupervisor && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={!supervisorTab ? '' : 'secondary'}
            onClick={() => setSupervisorTab(false)}
          >
            Mi Ruta de Aprendizaje (Empleado)
          </button>
          <button
            className={supervisorTab ? '' : 'secondary'}
            onClick={() => setSupervisorTab(true)}
          >
            Gestión y Generación de Píldoras (Supervisor)
          </button>
        </div>
      )}

      {/* VISTA 1: Ruta de Aprendizaje del Empleado */}
      {!supervisorTab && (
        <div>
          {/* Barra de progreso global */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Progreso General de Capacitación</span>
              <span className="hint">
                {completedOrExemptedPills} de {totalPills} lecciones completadas
                {totalPills > 0 ? ` (${Math.round((completedOrExemptedPills / totalPills) * 100)}%)` : ''}
              </span>
            </div>
            <div style={{ width: '100%', height: 8, backgroundColor: 'var(--border)', borderRadius: 4 }}>
              <div
                style={{
                  width: totalPills > 0 ? `${(completedOrExemptedPills / totalPills) * 100}%` : '0%',
                  height: '100%',
                  backgroundColor: 'var(--success)',
                  borderRadius: 4,
                  transition: 'width 0.3s',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {modules.map((m, mIdx) => (
              <div key={m.id} className="card">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge">Módulo {mIdx + 1}</span>
                    <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>{m.title}</h3>
                  </div>
                  {m.description && <p className="hint" style={{ marginTop: 4 }}>{m.description}</p>}
                </div>

                {/* Lista de Píldoras del Módulo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {m.pills?.map((p, pIdx) => {
                    const isExempt = p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC';
                    const isLocked = p.isLocked;

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 6,
                          backgroundColor: isLocked ? 'var(--bg)' : 'var(--surface)',
                          border: isExempt
                            ? '1px solid var(--success)'
                            : isLocked
                            ? '1px solid var(--border)'
                            : '1px solid var(--primary)',
                          opacity: isLocked ? 0.65 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 18 }}>
                            {isLocked ? '🔒' : isExempt ? '🌟' : p.isCompleted ? '✅' : '📖'}
                          </span>
                          <div>
                            <strong style={{ fontSize: 14 }}>
                              {pIdx + 1}. {p.title}
                            </strong>
                            <div className="msg-time">{p.objective}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isExempt && (
                            <span
                              className="badge"
                              style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }}
                            >
                              Eximido por diagnóstico
                            </span>
                          )}
                          {!isExempt && p.isCompleted && (
                            <span className="badge" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>
                              Completado
                            </span>
                          )}

                          {isLocked ? (
                            <button className="secondary" disabled style={{ padding: '4px 10px', fontSize: 12 }}>
                              Bloqueada
                            </button>
                          ) : (
                            <button
                              onClick={() => setActivePillId(p.id)}
                              style={{
                                padding: '4px 12px',
                                fontSize: 12,
                                backgroundColor: isExempt ? 'var(--surface)' : 'var(--primary)',
                                color: isExempt ? 'var(--success)' : '#fff',
                                borderColor: isExempt ? 'var(--success)' : 'var(--primary)',
                              }}
                            >
                              {isExempt ? 'Repasar Lección' : p.isCompleted ? 'Revisar' : 'Comenzar'}
                            </button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Crear Módulo */}
          <div className="card">
            <h3>Nuevo Módulo Formativo</h3>
            <form onSubmit={handleCreateModule} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label>Título del Módulo</label>
                <input
                  type="text"
                  placeholder="Ej: Políticas de Recupero en Mora Tardía"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Descripción de los contenidos del módulo..."
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <button type="submit" disabled={creatingModule || !newModuleTitle.trim()}>
                  {creatingModule ? 'Creando...' : 'Crear Módulo'}
                </button>
              </div>
            </form>
          </div>

          {/* Generar Píldora con IA */}
          <div className="card">
            <h3>Generar Píldora con IA (ElevenLabs / Gemini)</h3>
            <p className="hint">
              TrimIA utiliza la base de conocimiento y los casos reales del sector para redactar el contenido teórico y su cuestionario pedagógico.
            </p>
            {genNotice && (
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--success-bg)', color: 'var(--success)', borderRadius: 6, marginBottom: 12 }}>
                ✓ {genNotice}
              </div>
            )}
            <form onSubmit={handleGeneratePill} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label>Módulo de Destino</label>
                <select value={genModuleId} onChange={(e) => setGenModuleId(e.target.value)}>
                  {supervisorModules.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Objetivo Pedagógico / Tema</label>
                <input
                  type="text"
                  placeholder="Ej: Explicar cómo negociar un plan de cuotas escalonado cuando el cliente aduce desempleo temporal"
                  value={genObjective}
                  onChange={(e) => setGenObjective(e.target.value)}
                  required
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <button type="submit" disabled={generatingPill || !genObjective.trim()}>
                  {generatingPill ? 'Generando con IA...' : '✨ Generar Píldora con IA'}
                </button>
              </div>
            </form>
          </div>

          {/* Listado de Módulos y Píldoras del Supervisor */}
          <div className="card">
            <h3>Módulos de tu Sector y Estado de Píldoras</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {supervisorModules.map((m) => (
                <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
                  <strong>{m.title}</strong>
                  <span className="msg-time" style={{ marginLeft: 8 }}>({m.pills?.length || 0} píldoras)</span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {m.pills?.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg)',
                          borderRadius: 4,
                        }}
                      >
                        <div>
                          <span>{p.title}</span>
                          <span
                            className="badge"
                            style={{
                              marginLeft: 8,
                              backgroundColor: p.status === 'PUBLISHED' ? 'var(--success)' : 'var(--text-muted)',
                              color: '#fff',
                            }}
                          >
                            {p.status}
                          </span>
                        </div>
                        {p.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePublishPill(p.id)}
                            style={{ padding: '3px 8px', fontSize: 11, backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                          >
                            Publicar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
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
    </div>
  );
}
