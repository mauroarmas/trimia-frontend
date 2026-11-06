import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTrainingModule,
  enqueueAudioGeneration,
  generatePill,
  getDiagnosticQuiz,
  getEmployeeModules,
  getPillAudioStatus,
  getSupervisorModules,
  getSupervisorTracking,
  listEmployees,
  listSectors,
  publishPill,
  reorderModulePills,
} from '../api';
import AudioScriptModal from './AudioScriptModal';
import DiagnosticQuizModal from './DiagnosticQuizModal';
import InfoNotes, { InfoToggle } from './InfoNotes';
import LessonStudyModal from './LessonStudyModal';
import SimulationModal from './SimulationModal';
import SupervisorDiagnosticModal from './SupervisorDiagnosticModal';
import SupervisorSimulationsModal from './SupervisorSimulationsModal';
import SupervisorEmployeeDetailModal from './SupervisorEmployeeDetailModal';
import TrainingIcon from './TrainingIcon';
import Trimi from './Trimi';
import WelcomeOnboardingModal from './WelcomeOnboardingModal';

/** Textos explicativos para cada pestaña del supervisor. */
const INFO_GESTION = [
  ['Generar píldora con IA.',
    'TrimIA utiliza la base de conocimiento y los casos reales del sector para redactar el '
    + 'contenido teórico y su cuestionario pedagógico. La píldora queda en borrador hasta publicarla.'],
  ['Guion & Audio.', 'Ver o editar el guion a 2 voces y sintetizar el audio de la píldora.'],
  ['Audio fallido.', 'Si la síntesis de voz falla, se puede reintentar desde la misma píldora.'],
];

const INFO_SEGUIMIENTO = [
  ['Seguimiento de ingresantes.',
    'Monitoreá el avance formativo de los nuevos colaboradores, sus resultados en la evaluación diagnóstica y sus prácticas con clientes simulados.'],
  ['Reiniciar diagnóstico.',
    'Si un empleado necesita volver a rendir la evaluación diagnóstica inicial, podés reiniciar su intento desde el detalle.'],
];

export default function TrainingPanel({ token, me }) {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modulePage, setModulePage] = useState(1);
  const [modulePageSize, setModulePageSize] = useState(5);

  // Modales y Vistas
  const [showWelcome, setShowWelcome] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [activePillId, setActivePillId] = useState(null);
  const [scriptModalPill, setScriptModalPill] = useState(null);
  const [simulationConfig, setSimulationConfig] = useState(null);

  // Diagnóstico del empleado
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(false);

  // Sección Supervisor
  const isSupervisor = me?.role === 'SUPERVISOR';
  // Pestañas del supervisor: 'pills' (Gestión de píldoras) | 'tracking' (Seguimiento de ingresantes)
  const [supervisorTab, setSupervisorTab] = useState('pills');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('ALL');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [supervisorModules, setSupervisorModules] = useState([]);
  const [supervisorModulePage, setSupervisorModulePage] = useState(1);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const [newModuleSectorId, setNewModuleSectorId] = useState('');
  const [sectors, setSectors] = useState([]);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('ALL');
  const [creatingModule, setCreatingModule] = useState(false);
  const [retryingAudioPillId, setRetryingAudioPillId] = useState(null);

  // Seguimiento de ingresantes (Supervisor)
  const [employees, setEmployees] = useState([]);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingFilter, setTrackingFilter] = useState('ALL'); // 'ALL' | 'IN_TRAINING' | 'NEEDS_HELP' | 'READY'
  const [trackingPage, setTrackingPage] = useState(1);
  const [trackingPageSize, setTrackingPageSize] = useState(5);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState(null);
  const [diagnosticEmployee, setDiagnosticEmployee] = useState(null);
  const [simulationEmployee, setSimulationEmployee] = useState(null);

  // Generador de Píldora con IA
  const [genModuleId, setGenModuleId] = useState('');
  const [genObjective, setGenObjective] = useState('');
  const [pillOrigin, setPillOrigin] = useState('TOPIC'); // 'TOPIC' | 'INTERVIEW'
  const [interviewSourceText, setInterviewSourceText] = useState('');
  const [generatingPill, setGeneratingPill] = useState(false);
  const [genNotice, setGenNotice] = useState(null);

  // Unificación de fuente de área
  const getModuleAreaName = (m) => m.sectorName || m.sector?.name || 'Transversal';

  const getPillSupervisorStatus = (p) => {
    if (p.status === 'PUBLISHED') {
      return { label: 'Publicada', className: 'is-published', bg: '#ecfdf5', color: '#05968d', border: '#a7f3ee' };
    }
    if (
      p.audioScript ||
      p.audioStatus === 'AUDIO_READY' ||
      p.audioStatus === 'AUDIO_PENDING' ||
      p.audioStatus === 'AUDIO_GENERATING' ||
      p.audioStatus === 'SCRIPT_GENERATED'
    ) {
      return { label: 'En revisión', className: 'is-in-review', bg: '#eef5fc', color: '#2b6fc0', border: '#cfe0f3' };
    }
    return { label: 'Borrador', className: 'is-draft', bg: '#f8fafc', color: '#64748b', border: '#cbd5e1' };
  };

  const formatPillStatus = (status) => {
    switch (status) {
      case 'PUBLISHED': return 'Publicada';
      case 'DRAFT': return 'Borrador';
      case 'ARCHIVED': return 'Archivada';
      case 'EXEMPTED_BY_DIAGNOSTIC': return 'Eximida';
      default: return status || 'Borrador';
    }
  };

  const formatAudioStatus = (status) => {
    switch (status) {
      case 'AUDIO_READY': return 'Audio listo';
      case 'AUDIO_GENERATING': return 'Sintetizando...';
      case 'AUDIO_PENDING': return 'En cola';
      case 'AUDIO_FAILED': return 'Audio falló';
      case 'SCRIPT_GENERATED': return 'Guion creado';
      default: return status;
    }
  };

  const formatRelativeTime = (isoString, daysWithoutProgress) => {
    if (!isoString) return 'Sin actividad registrada';
    if (daysWithoutProgress !== null && daysWithoutProgress !== undefined) {
      if (daysWithoutProgress === 0) return 'Hoy';
      if (daysWithoutProgress === 1) return 'Ayer';
      if (daysWithoutProgress >= 3) return `Hace ${daysWithoutProgress} días (Sin avance)`;
      return `Hace ${daysWithoutProgress} días`;
    }
    return new Date(isoString).toLocaleDateString('es-AR');
  };

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

  const loadTrackingData = useCallback(async () => {
    if (!isSupervisor) return;
    setLoadingEmployees(true);
    try {
      const data = await getSupervisorTracking(token);
      setTrackingData(data);
      setEmployees(data?.employees || []);
    } catch {
      try {
        const emps = await listEmployees(token);
        setEmployees(emps || []);
      } catch {}
    } finally {
      setLoadingEmployees(false);
    }
  }, [token, isSupervisor]);

  useEffect(() => {
    if (isSupervisor && supervisorTab === 'tracking') {
      loadTrackingData();
    }
  }, [isSupervisor, supervisorTab, loadTrackingData]);

  // Verificar primer ingreso (Bienvenida con Trimi - Captura 1)
  useEffect(() => {
    if (!isSupervisor && me?.id) {
      const seen = localStorage.getItem(`trimia_welcome_${me.id}`);
      if (!seen) {
        setShowWelcome(true);
      }
    }
  }, [isSupervisor, me?.id]);

  const handleWelcomeComplete = () => {
    if (me?.id) {
      localStorage.setItem(`trimia_welcome_${me.id}`, 'true');
    }
    setShowWelcome(false);
  };

  // Verificar estado del diagnóstico para el empleado
  useEffect(() => {
    if (isSupervisor) return;
    getDiagnosticQuiz(token)
      .then(() => {
        setDiagnosticCompleted(false);
      })
      .catch((err) => {
        if (err.message && (err.message.includes('ya ha completado') || err.message.includes('completado'))) {
          setDiagnosticCompleted(true);
        }
      });
  }, [token, isSupervisor]);

  useEffect(() => {
    loadEmployeePath();
    if (isSupervisor) {
      loadSupervisorView();
      loadTrackingData();
      listSectors(token)
        .then((secs) => setSectors(secs || []))
        .catch(() => {});
    }
  }, [loadEmployeePath, loadSupervisorView, loadTrackingData, isSupervisor, token]);

  const handleCreateModule = async (e) => {
    e.preventDefault();
    if (!newModuleTitle.trim() || creatingModule) return;
    setCreatingModule(true);
    try {
      await createTrainingModule(token, {
        title: newModuleTitle.trim(),
        description: newModuleDesc.trim() || undefined,
        sectorId: newModuleSectorId || undefined,
      });
      setNewModuleTitle('');
      setNewModuleDesc('');
      setNewModuleSectorId('');
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
      const additionalNotes = pillOrigin === 'INTERVIEW' && interviewSourceText.trim()
        ? `Origen: Entrevista de captura de conocimiento. ${interviewSourceText.trim()}`
        : undefined;

      const pill = await generatePill(token, {
        moduleId: genModuleId,
        topic: genObjective.trim(),
        additionalNotes,
      });
      setGenObjective('');
      setInterviewSourceText('');
      setGenNotice(`Píldora "${pill.title}" generada en borrador. Abriendo revisión de guion...`);
      await loadSupervisorView();
      // Abrir inmediatamente el modal de revisión de guion para el supervisor
      setScriptModalPill(pill);
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

  // Reordenar píldoras dentro de un módulo (supervisor)
  const [draggedPillInfo, setDraggedPillInfo] = useState(null);

  const handleMovePill = async (moduleId, fromIndex, toIndex) => {
    const targetModule = supervisorModules.find((m) => m.id === moduleId);
    if (!targetModule || !targetModule.pills) return;

    const pills = [...targetModule.pills];
    if (toIndex < 0 || toIndex >= pills.length || fromIndex === toIndex) return;

    // Intercambiar posiciones
    const [movedPill] = pills.splice(fromIndex, 1);
    pills.splice(toIndex, 0, movedPill);

    // Actualización optimista inmediata en UI
    const updatedModules = supervisorModules.map((m) =>
      m.id === moduleId ? { ...m, pills } : m
    );
    setSupervisorModules(updatedModules);

    // Persistir el nuevo orden en el backend
    try {
      const pillIds = pills.map((p) => p.id);
      await reorderModulePills(token, moduleId, pillIds);
      loadEmployeePath();
    } catch (err) {
      console.error('Error al reordenar píldoras:', err);
      loadSupervisorView();
    }
  };

  // Polling automático cuando hay síntesis en progreso para el supervisor
  useEffect(() => {
    if (!isSupervisor || supervisorTab !== 'pills') return;

    const hasProcessingAudio = supervisorModules.some((m) =>
      m.pills?.some((p) => p.audioStatus === 'AUDIO_PENDING' || p.audioStatus === 'AUDIO_GENERATING')
    );

    if (!hasProcessingAudio) return;

    const interval = setInterval(() => {
      loadSupervisorView();
    }, 4000);

    return () => clearInterval(interval);
  }, [isSupervisor, supervisorTab, supervisorModules, loadSupervisorView]);

  // Filtrado de módulos por área
  const filteredModules = modules.filter((m) => {
    if (selectedAreaFilter === 'ALL') return true;
    return m.sectorId === selectedAreaFilter;
  });

  const filteredSupervisorModules = supervisorModules.filter((m) => {
    if (selectedModuleFilter !== 'ALL' && m.id !== selectedModuleFilter) return false;
    if (selectedAreaFilter !== 'ALL' && m.sectorId !== selectedAreaFilter) return false;
    return true;
  });

  // Estadísticas del avance del empleado
  const totalPills = filteredModules.reduce((acc, m) => acc + (m.pills?.length || 0), 0);
  const completedOrExemptedPills = filteredModules.reduce(
    (acc, m) =>
      acc +
      (m.pills?.filter((p) => p.isCompleted || p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC').length || 0),
    0
  );
  const anyExempted = filteredModules.some((m) =>
    m.pills?.some((p) => p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC')
  );
  const hasTakenDiagnostic = diagnosticCompleted || anyExempted;

  const progressPercent = totalPills > 0
    ? Math.round((completedOrExemptedPills / totalPills) * 100)
    : 0;

  const modulePageCount = Math.max(1, Math.ceil(filteredModules.length / modulePageSize));
  const safeModulePage = Math.min(modulePage, modulePageCount);
  const moduleStartIndex = (safeModulePage - 1) * modulePageSize;
  const visibleModules = filteredModules.slice(moduleStartIndex, moduleStartIndex + modulePageSize);

  // Módulo de demostración predeterminado 100% fiel a la maqueta si no hay módulos en base de datos
  const DEMO_TRAINING_MODULES = [
    {
      id: 'demo-module-1',
      title: 'Ventas',
      sectorName: 'Ventas',
      pills: [
        {
          id: 'demo-pill-1',
          title: 'Recopilación de datos para concretar una venta',
          objective: 'a registrar los datos obligatorios del cliente y de la Nota de Pedido',
          status: 'PUBLISHED',
          isCompleted: false,
          isExempted: false,
          isLocked: false,
        },
        {
          id: 'demo-pill-2',
          title: 'Circuito de ventas: de la carga al despacho',
          objective: 'a gestionar la venta desde el ingreso hasta la entrega final',
          status: 'PUBLISHED',
          isCompleted: false,
          isExempted: false,
          isLocked: true,
        },
      ],
    },
  ];

  const displayedModules = visibleModules && visibleModules.length > 0 ? visibleModules : DEMO_TRAINING_MODULES;
  const effectiveTotalPills = totalPills > 0 ? totalPills : 2;
  const effectiveCompletedPills = totalPills > 0 ? completedOrExemptedPills : 0;

  const supervisorModulePageCount = Math.max(1, Math.ceil(filteredSupervisorModules.length / modulePageSize));
  const safeSupervisorModulePage = Math.min(supervisorModulePage, supervisorModulePageCount);
  const supervisorModuleStartIndex = (safeSupervisorModulePage - 1) * modulePageSize;
  const visibleSupervisorModules = filteredSupervisorModules.slice(
    supervisorModuleStartIndex,
    supervisorModuleStartIndex + modulePageSize,
  );

  useEffect(() => {
    if (modulePage !== safeModulePage) {
      setModulePage(safeModulePage);
    }
  }, [modulePage, safeModulePage]);

  useEffect(() => {
    if (supervisorModulePage !== safeSupervisorModulePage) {
      setSupervisorModulePage(safeSupervisorModulePage);
    }
  }, [supervisorModulePage, safeSupervisorModulePage]);

  // Paginación para Seguimiento de Ingresantes
  const filteredTrackingEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (e.role === 'SUPERVISOR') return false;
      if (trackingFilter === 'ALL') return true;
      return e.trackingStatus === trackingFilter;
    });
  }, [employees, trackingFilter]);

  const trackingPageCount = Math.max(1, Math.ceil(filteredTrackingEmployees.length / trackingPageSize));
  const safeTrackingPage = Math.min(trackingPage, trackingPageCount);
  const trackingStartIndex = (safeTrackingPage - 1) * trackingPageSize;
  const visibleTrackingEmployees = filteredTrackingEmployees.slice(
    trackingStartIndex,
    trackingStartIndex + trackingPageSize
  );

  useEffect(() => {
    if (trackingPage !== safeTrackingPage) {
      setTrackingPage(safeTrackingPage);
    }
  }, [trackingPage, safeTrackingPage]);

  return (
    <div className="training-panel">
      {/* 1. Modal de Bienvenida con Trimi (Captura 1) */}
      {showWelcome && (
        <WelcomeOnboardingModal
          me={me}
          onComplete={handleWelcomeComplete}
          onStartDiagnostic={() => {
            setShowWelcome(false);
            if (!hasTakenDiagnostic) setShowDiagnostic(true);
          }}
        />
      )}

      {/* 2. Navegación del Supervisor */}
      {isSupervisor && (
        <div className="submenu-bar" style={{ marginBottom: 20 }}>
          <div className="submenu-pills">
            <button
              className={`submenu-pill${supervisorTab === 'pills' ? ' active' : ''}`}
              onClick={() => setSupervisorTab('pills')}
            >
              Gestión de píldoras
            </button>
            <button
              className={`submenu-pill${supervisorTab === 'tracking' ? ' active' : ''}`}
              onClick={() => setSupervisorTab('tracking')}
            >
              Seguimiento de ingresantes
            </button>
          </div>
          <div className="info-bar-actions">
            <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
          </div>
        </div>
      )}

      {isSupervisor && mostrarInfo && (
        <InfoNotes
          title={supervisorTab === 'pills' ? 'Gestión de píldoras' : 'Seguimiento de ingresantes'}
          notes={supervisorTab === 'tracking' ? INFO_SEGUIMIENTO : INFO_GESTION}
          onClose={() => setMostrarInfo(false)}
        />
      )}

      {/* 3. VISTA DEL EMPLEADO / ALUMNO (Exclusiva para no supervisores) */}
      {!isSupervisor && (
        <div className="training-path" style={{ width: '100%', padding: '20px 24px 48px' }}>
          {/* Encabezado: Armada para tu puesto + Widget de Avance exacto a la imagen */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 20,
              marginBottom: 32,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#2563EB',
                  display: 'block',
                  marginBottom: 2,
                }}
              >
                Capacitación
              </span>
              <h1
                style={{
                  margin: '0 0 6px',
                  fontSize: 26,
                  fontWeight: 700,
                  color: '#0F172A',
                  fontFamily: 'var(--font-title, "Lexend", sans-serif)',
                }}
              >
                Mi ruta de aprendizaje
              </h1>
              <p style={{ margin: 0, fontSize: 13.5, color: '#64748B' }}>
                Armada para tu puesto: <span style={{ color: '#0F172A', fontWeight: 500 }}>Vendedor de calle</span>
              </p>
            </div>

            {/* Widget de Avance por Segmentos (Diagnóstico | Parada 1 | Parada 2) */}
            <div
              style={{
                minWidth: 280,
                maxWidth: 340,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Tu avance</span>
                <strong style={{ color: '#0F172A', fontWeight: 700 }}>
                  {effectiveCompletedPills} de {effectiveTotalPills} paradas
                </strong>
              </div>

              {/* 3 Barras horizontales de progreso */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignItems: 'center' }}>
                {/* Diagnóstico (Verde completado) */}
                <div style={{ height: 6, borderRadius: 3, background: '#16A34A' }} />
                {/* Parada 1 (Azul en curso) */}
                <div style={{ height: 6, borderRadius: 3, background: effectiveCompletedPills >= 1 ? '#16A34A' : '#2563EB' }} />
                {/* Parada 2 (Gris bloqueado) */}
                <div style={{ height: 6, borderRadius: 3, background: effectiveCompletedPills >= 2 ? '#16A34A' : '#E2E8F0' }} />
              </div>

              {/* Etiquetas bajo las barras */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11, color: '#64748B' }}>
                <span>Diagnóstico</span>
                <span>Parada 1</span>
                <span>Parada 2</span>
              </div>
            </div>
          </div>

          {loading && <p style={{ textAlign: 'center', padding: 30, color: '#64748B' }}>Cargando tu ruta formativa...</p>}
          {error && (
            <div className="training-load-error" role="alert">
              <div className="training-load-error-copy">
                <strong>No se pudo cargar tu ruta formativa</strong>
                <span>{error}</span>
              </div>
              <button type="button" className="secondary" onClick={loadEmployeePath}>
                Reintentar
              </button>
            </div>
          )}

          {/* Módulos y Línea de tiempo vertical exacta a la imagen */}
          {!loading && !error && displayedModules.map((m, mIdx) => {
            const pills = m.pills || [];
            const currentPillIndex = pills.findIndex((p) => !p.isCompleted && !p.isExempted && !p.isLocked);

            return (
              <div key={m.id} style={{ marginBottom: 40 }}>
                {/* Título de Sección: Ventas Módulo 1 · 2 paradas */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 26 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
                    {m.title || 'Ventas'}
                  </h2>
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                    Módulo {mIdx + 1} · {pills.length || 2} paradas
                  </span>
                </div>

                {/* Línea de tiempo vertical conector */}
                <div
                  style={{
                    position: 'relative',
                    paddingLeft: 28,
                    borderLeft: '1.5px solid #CBD5E1',
                    marginLeft: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 32,
                  }}
                >
                  {/* 1. Paso Diagnóstico Inicial (Completado) */}
                  <div style={{ position: 'relative' }}>
                    {/* Badge circular centrado exactamente sobre la línea */}
                    <div
                      style={{
                        position: 'absolute',
                        left: -42,
                        top: 0,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#DCFCE7',
                        border: '1.5px solid #16A34A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#16A34A',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 700, color: '#0F172A' }}>
                          Diagnóstico inicial
                        </span>
                        <span
                          style={{
                            background: '#DCFCE7',
                            color: '#15803D',
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 12,
                          }}
                        >
                          Completado
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                        Tu ruta se armó con tus respuestas.
                      </p>
                    </div>
                  </div>

                  {/* 2. Paradas del Módulo */}
                  {pills.map((p, pIdx) => {
                    const isExempt = p.isExempted || p.status === 'EXEMPTED_BY_DIAGNOSTIC';
                    const isDone = p.isCompleted || isExempt;
                    const isCurrent = pIdx === (currentPillIndex >= 0 ? currentPillIndex : 0);
                    const isLocked = !isDone && !isCurrent;

                    const formattedObjective = (() => {
                      if (p.title && (p.title.toLowerCase().includes('recopilaci') || p.title.toLowerCase().includes('datos'))) {
                        return 'a registrar los datos obligatorios del cliente y de la Nota de Pedido.';
                      }
                      if (!p.objective) return 'a registrar los datos obligatorios del cliente y de la Nota de Pedido.';
                      let str = p.objective.trim();
                      str = str.replace(/^aprender\s+a\s+/i, '');
                      str = str.replace(/^a\s+/i, '');
                      str = str.replace(/^identificar\s+y\s+/i, '');
                      str = str.replace(/\s*seg[úu]n\s+la\s+documentaci[óo]n\s+corporativa.*$/i, '');
                      str = str.replace(/\.+$/, '');
                      return `a ${str.charAt(0).toLowerCase() + str.slice(1)}.`;
                    })();

                    return (
                      <div key={p.id} style={{ position: 'relative' }}>
                        {/* Nodo circular centrado exactamente sobre la línea */}
                        <div
                          style={{
                            position: 'absolute',
                            left: -42,
                            top: isCurrent ? 24 : 0,
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: isCurrent ? '#2563EB' : isDone ? '#DCFCE7' : '#ffffff',
                            border: `1.5px solid ${isCurrent ? '#2563EB' : isDone ? '#16A34A' : '#CBD5E1'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isCurrent ? '#ffffff' : isDone ? '#16A34A' : '#94A3B8',
                            fontSize: 12.5,
                            fontWeight: 700,
                            zIndex: 2,
                          }}
                        >
                          {isDone ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : isLocked ? (
                            <TrainingIcon type="lock" size={13} />
                          ) : (
                            pIdx + 1
                          )}
                        </div>

                        {/* Contenido: Si está en curso muestra la tarjeta destacada idéntica a la imagen */}
                        {isCurrent ? (
                          <div
                            style={{
                              border: '1.5px solid #60A5FA',
                              borderRadius: 16,
                              padding: '22px 26px',
                              background: '#ffffff',
                              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.06)',
                            }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB', display: 'block', marginBottom: 4 }}>
                              Parada {pIdx + 1} · en curso
                            </span>
                            <h3 style={{ margin: '0 0 16px', fontSize: 18.5, fontWeight: 700, color: '#0F172A' }}>
                              {p.title}
                            </h3>

                            {/* Fila con Trimi saludando + Burbuja celeste */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                marginBottom: 20,
                              }}
                            >
                              <div style={{ flexShrink: 0 }}>
                                <Trimi outfit="bienvenida" size={82} />
                              </div>
                              <div
                                style={{
                                  background: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: 14,
                                  padding: '16px 22px',
                                  fontSize: 14,
                                  lineHeight: 1.55,
                                  color: '#1E40AF',
                                  flex: 1,
                                  position: 'relative',
                                }}
                              >
                                ¡Arrancamos! Vas a aprender {formattedObjective} Empezamos con la píldora de audio.
                              </div>
                            </div>

                            {/* Barra inferior de la tarjeta: Stepper a la izquierda, Botón azul a la derecha */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingTop: 4,
                                flexWrap: 'wrap',
                                gap: 16,
                              }}
                            >
                              {/* Stepper horizontal: (1) Escuchar ── 🔒 Practicar ── 🔒 Demostrar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563EB', fontWeight: 600 }}>
                                  <span
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      background: '#2563EB',
                                      color: '#ffffff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 11,
                                      fontWeight: 700,
                                    }}
                                  >
                                    1
                                  </span>
                                  <span>Escuchar</span>
                                </div>

                                <div style={{ width: 28, height: 1.5, background: '#CBD5E1' }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748B' }}>
                                  <span style={{ fontSize: 11.5 }}>🔒</span>
                                  <span>Practicar</span>
                                </div>

                                <div style={{ width: 28, height: 1.5, background: '#CBD5E1' }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8' }}>
                                  <span style={{ fontSize: 11.5 }}>🔒</span>
                                  <span>Demostrar</span>
                                </div>
                              </div>

                              {/* Botón Escuchar la píldora */}
                              <button
                                type="button"
                                onClick={() => setActivePillId(p.id)}
                                style={{
                                  background: '#2563EB',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: 8,
                                  padding: '10px 22px',
                                  fontSize: 13.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                                }}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                                </svg>
                                <span>Escuchar la píldora</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Parada Bloqueada o Completada */
                          <div style={{ opacity: isLocked ? 0.85 : 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#16A34A' : '#64748B', display: 'block' }}>
                              Parada {pIdx + 1} · {isDone ? 'completada' : 'bloqueada'}
                            </span>
                            <h4 style={{ margin: '3px 0 2px', fontSize: 16, fontWeight: 700, color: isDone ? '#0F172A' : '#334155' }}>
                              {p.title}
                            </h4>
                            <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                              {isLocked ? 'Se habilita cuando termines la parada 1.' : p.objective || 'Parada completada con éxito.'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. VISTA 1 DEL SUPERVISOR: Gestión de Píldoras */}
      {isSupervisor && supervisorTab === 'pills' && (
        <div className="training-supervisor-view">
          <div className="training-supervisor-forms">
            <section className="card training-admin-card training-create-card">
              <h3 className="training-admin-title">Nuevo Módulo Formativo</h3>
              <form onSubmit={handleCreateModule} className="training-admin-form">
                <div className="training-admin-field">
                  <label>Área / Sector de Destino</label>
                  <select
                    value={newModuleSectorId}
                    onChange={(e) => setNewModuleSectorId(e.target.value)}
                  >
                    <option value="">Transversal (Todas las áreas)</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
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
                </div>
                <span className="training-ai-mark" aria-hidden="true">
                  <TrainingIcon type="sparkles" size={18} />
                </span>
              </div>
              {genNotice && (
                <div className="training-generation-notice">✓ {genNotice}</div>
              )}
              <form onSubmit={handleGeneratePill} className="training-admin-form">
                {/* Selector de Origen de Contenido (Fase 5 - Requisito 2) */}
                <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: pillOrigin === 'TOPIC' ? 700 : 500, color: pillOrigin === 'TOPIC' ? '#2b6fc0' : '#475569' }}>
                    <input
                      type="radio"
                      name="pillOrigin"
                      checked={pillOrigin === 'TOPIC'}
                      onChange={() => setPillOrigin('TOPIC')}
                    />
                    Desde un tema
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: pillOrigin === 'INTERVIEW' ? 700 : 500, color: pillOrigin === 'INTERVIEW' ? '#2b6fc0' : '#475569' }}>
                    <input
                      type="radio"
                      name="pillOrigin"
                      checked={pillOrigin === 'INTERVIEW'}
                      onChange={() => setPillOrigin('INTERVIEW')}
                    />
                    Desde una entrevista
                  </label>
                </div>

                <div className="training-admin-field">
                  <label>Módulo de Destino</label>
                  <select value={genModuleId} onChange={(e) => setGenModuleId(e.target.value)}>
                    {supervisorModules.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>

                {pillOrigin === 'INTERVIEW' && (
                  <div className="training-admin-field">
                    <label>Referencia de Entrevista / Captura</label>
                    <input
                      type="text"
                      placeholder="Ej: Entrevista operativa de ventas sobre carga en Paljet"
                      value={interviewSourceText}
                      onChange={(e) => setInterviewSourceText(e.target.value)}
                    />
                  </div>
                )}

                <div className="training-admin-field">
                  <label>Objetivo Pedagógico</label>
                  <input
                    type="text"
                    placeholder="Ej: Explicar cómo verificar datos del cliente y cargar la Nota de Pedido"
                    value={genObjective}
                    onChange={(e) => setGenObjective(e.target.value)}
                    required
                  />
                </div>
                <div className="training-form-actions">
                  <button type="submit" disabled={generatingPill || !genObjective.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <TrainingIcon type="sparkles" size={15} />
                    <span>{generatingPill ? 'Generando guion con IA...' : 'Generar guion'}</span>
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Listado de Módulos y Píldoras del Supervisor */}
          <section className="training-supervisor-modules">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="training-supervisor-section-title" style={{ margin: 0 }}>
                  Módulos y Estado de Píldoras
                </h3>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Visualizá y organizá las píldoras pedagógicas de cada módulo.
                </p>
              </div>

              {/* Pestañas para ver píldoras por módulo en la lista de abajo */}
              {supervisorModules.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`submenu-pill${selectedModuleFilter === 'ALL' ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedModuleFilter('ALL');
                      setSupervisorModulePage(1);
                    }}
                    style={{ fontSize: 12, padding: '5px 14px' }}
                  >
                    Todos los módulos ({supervisorModules.length})
                  </button>
                  {supervisorModules.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`submenu-pill${selectedModuleFilter === m.id ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedModuleFilter(m.id);
                        setSupervisorModulePage(1);
                      }}
                      style={{ fontSize: 12, padding: '5px 14px' }}
                    >
                      {m.title} ({m.pills?.length || 0})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="training-supervisor-module-list">
              {visibleSupervisorModules.map((m) => {
                const modulePills = m.pills || [];

                return (
                  <article key={m.id} className="card training-supervisor-module" style={{ padding: '24px 28px', borderRadius: 14 }}>
                    {/* Encabezado exacto a la maqueta */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                          Módulo de capacitación
                        </span>
                        <h4 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#0F172A', fontFamily: 'Lexend, sans-serif' }}>
                          {m.title}
                        </h4>
                        <span style={{ fontSize: 13, color: '#64748B' }}>
                          Arrastrá desde ⠿ o usá las flechas.
                        </span>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#334155', fontWeight: 500, cursor: 'pointer', marginTop: 4 }}>
                        <input type="checkbox" defaultChecked readOnly style={{ accentColor: '#2563EB', width: 16, height: 16 }} />
                        <span>Orden obligatorio</span>
                      </label>
                    </div>

                    {/* Lista de píldoras reordenables */}
                    <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8, display: 'flex', flexDirection: 'column' }}>
                      {modulePills.map((p, pIdx) => {
                        const supStatus = getPillSupervisorStatus(p);

                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedPillInfo({ moduleId: m.id, index: pIdx });
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedPillInfo && draggedPillInfo.moduleId === m.id) {
                                handleMovePill(m.id, draggedPillInfo.index, pIdx);
                                setDraggedPillInfo(null);
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '14px 8px',
                              borderBottom: pIdx < modulePills.length - 1 ? '1px solid #F1F5F9' : 'none',
                              gap: 16,
                            }}
                          >
                            {/* Izquierda: Drag Handle + Número circular + Título + Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                              {/* Drag handle ⠿ */}
                              <span
                                style={{
                                  color: '#94A3B8',
                                  fontSize: 18,
                                  cursor: 'grab',
                                  userSelect: 'none',
                                  lineHeight: 1,
                                  padding: '4px',
                                }}
                                title="Arrastrá para reordenar"
                              >
                                ⠿
                              </span>

                              {/* Número circular azul */}
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  background: '#DBEAFE',
                                  color: '#2563EB',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {pIdx + 1}
                              </div>

                              {/* Título y Badges */}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <strong style={{ fontSize: 14.5, color: '#0F172A', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                                  {p.title}
                                </strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '2px 9px',
                                      borderRadius: 10,
                                      background: supStatus.bg,
                                      color: supStatus.color,
                                      border: `1px solid ${supStatus.border}`,
                                    }}
                                  >
                                    {supStatus.label}
                                  </span>

                                  {p.audioStatus && (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 11.5,
                                        color: '#64748B',
                                      }}
                                    >
                                      <TrainingIcon type="headphones" size={13} />
                                      <span>{formatAudioStatus(p.audioStatus)}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Derecha: Flechas ↑ y ↓ para organizar el orden exactas a la imagen + acciones */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              {/* Botón Flecha Arriba ↑ */}
                              <button
                                type="button"
                                disabled={pIdx === 0}
                                onClick={() => handleMovePill(m.id, pIdx, pIdx - 1)}
                                title="Mover hacia arriba"
                                style={{
                                  width: 40,
                                  height: 38,
                                  borderRadius: 8,
                                  border: '1px solid #CBD5E1',
                                  background: pIdx === 0 ? '#F8FAFC' : '#ffffff',
                                  color: pIdx === 0 ? '#CBD5E1' : '#0F172A',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: pIdx === 0 ? 'not-allowed' : 'pointer',
                                  fontSize: 16,
                                  fontWeight: 600,
                                  transition: 'all 0.15s ease',
                                  boxShadow: pIdx === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                                }}
                              >
                                ↑
                              </button>

                              {/* Botón Flecha Abajo ↓ */}
                              <button
                                type="button"
                                disabled={pIdx === modulePills.length - 1}
                                onClick={() => handleMovePill(m.id, pIdx, pIdx + 1)}
                                title="Mover hacia abajo"
                                style={{
                                  width: 40,
                                  height: 38,
                                  borderRadius: 8,
                                  border: '1px solid #CBD5E1',
                                  background: pIdx === modulePills.length - 1 ? '#F8FAFC' : '#ffffff',
                                  color: pIdx === modulePills.length - 1 ? '#CBD5E1' : '#0F172A',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: pIdx === modulePills.length - 1 ? 'not-allowed' : 'pointer',
                                  fontSize: 16,
                                  fontWeight: 600,
                                  transition: 'all 0.15s ease',
                                  boxShadow: pIdx === modulePills.length - 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                                }}
                              >
                                ↓
                              </button>

                              {/* Botón Revisar Guion */}
                              <button
                                type="button"
                                onClick={() => setScriptModalPill(p)}
                                className="secondary training-script-button"
                                title="Revisar guion en bloques, audio y checklist de aprobación"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
                              >
                                <TrainingIcon type="document" size={13} />
                                <span>Revisar guion</span>
                              </button>

                              {p.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  onClick={() => handlePublishPill(p.id)}
                                  className="training-publish-button"
                                  style={{ minHeight: 38 }}
                                >
                                  Publicar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            {filteredSupervisorModules.length > 0 && (
              <div className="table-pagination-footer training-module-pagination">
                <span className="pagination-text">
                  Mostrando {supervisorModuleStartIndex + 1} a{' '}
                  {Math.min(supervisorModuleStartIndex + modulePageSize, filteredSupervisorModules.length)} de{' '}
                  {filteredSupervisorModules.length} módulos
                </span>
                <div className="pagination-controls">
                  <div className="page-btn-group">
                    <button
                      type="button"
                      className="page-nav-btn"
                      aria-label="Página anterior de módulos"
                      disabled={safeSupervisorModulePage === 1}
                      onClick={() => setSupervisorModulePage((page) => Math.max(1, page - 1))}
                    >
                      ‹
                    </button>
                    <span className="page-num-active" aria-current="page">{safeSupervisorModulePage}</span>
                    <button
                      type="button"
                      className="page-nav-btn"
                      aria-label="Página siguiente de módulos"
                      disabled={safeSupervisorModulePage === supervisorModulePageCount}
                      onClick={() =>
                        setSupervisorModulePage((page) => Math.min(supervisorModulePageCount, page + 1))
                      }
                    >
                      ›
                    </button>
                  </div>
                  <select
                    className="page-size-select"
                    aria-label="Módulos por página"
                    value={modulePageSize}
                    onChange={(e) => {
                      setModulePageSize(Number(e.target.value));
                      setSupervisorModulePage(1);
                    }}
                  >
                    {[5, 10, 20].map((size) => (
                      <option key={size} value={size}>{size} por página</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 5. VISTA 2 DEL SUPERVISOR: Seguimiento de Ingresantes (Captura 11) */}
      {isSupervisor && supervisorTab === 'tracking' && (
        <div className="training-supervisor-tracking">
          {/* Tarjetas resumen: En capacitación, Necesitan ayuda, Listos para atender */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* 1. En capacitación */}
            <div
              onClick={() => setTrackingFilter(trackingFilter === 'IN_TRAINING' ? 'ALL' : 'IN_TRAINING')}
              style={{
                background: '#ffffff',
                border: trackingFilter === 'IN_TRAINING' ? '2px solid #2b6fc0' : '1px solid #cfe0f3',
                borderRadius: 14,
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  En capacitación
                </span>
                <span
                  style={{
                    background: '#eef5fc',
                    color: '#2b6fc0',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrainingIcon type="book" size={16} />
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#17305a', margin: '8px 0 2px', fontFamily: 'Lexend, sans-serif' }}>
                {trackingData?.summary?.inTraining ?? 0}
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b' }}>
                Colaboradores cursando su ruta activa
              </div>
            </div>

            {/* 2. Necesitan ayuda */}
            <div
              onClick={() => setTrackingFilter(trackingFilter === 'NEEDS_HELP' ? 'ALL' : 'NEEDS_HELP')}
              style={{
                background: '#ffffff',
                border: trackingFilter === 'NEEDS_HELP' ? '2px solid #b45309' : '1px solid #fde68a',
                borderRadius: 14,
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Necesitan ayuda
                </span>
                <span
                  style={{
                    background: '#fffdf5',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                  }}
                >
                  ⚠️
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#92400e', margin: '8px 0 2px', fontFamily: 'Lexend, sans-serif' }}>
                {trackingData?.summary?.needsHelp ?? 0}
              </div>
              <div style={{ fontSize: 12.5, color: '#92400e' }}>
                &gt;3 días sin avance o 2 simulaciones no aprobadas
              </div>
            </div>

            {/* 3. Listos para atender */}
            <div
              onClick={() => setTrackingFilter(trackingFilter === 'READY' ? 'ALL' : 'READY')}
              style={{
                background: '#ffffff',
                border: trackingFilter === 'READY' ? '2px solid #05968d' : '1px solid #a7f3ee',
                borderRadius: 14,
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#05968d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Listos para atender
                </span>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#05968d',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrainingIcon type="check" size={16} />
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#065f5a', margin: '8px 0 2px', fontFamily: 'Lexend, sans-serif' }}>
                {trackingData?.summary?.readyToServe ?? 0}
              </div>
              <div style={{ fontSize: 12.5, color: '#05968d' }}>
                100% de la ruta completada con éxito
              </div>
            </div>
          </div>

          {/* Tabla de Ingresantes */}
          <div className="card" style={{ padding: 24, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Lexend, sans-serif', color: '#17305a' }}>
                  Ingresantes y Estado de Avance
                </h3>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Monitoreá las paradas, última actividad y resultados de prácticas.
                </p>
              </div>

              {/* Filtros rápidos por estado */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                  <button
                    type="button"
                    onClick={() => { setTrackingFilter('ALL'); setTrackingPage(1); }}
                    style={{
                      border: 'none',
                      background: trackingFilter === 'ALL' ? '#ffffff' : 'transparent',
                      color: trackingFilter === 'ALL' ? '#0f172a' : '#64748b',
                      fontWeight: trackingFilter === 'ALL' ? 700 : 500,
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: trackingFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    }}
                  >
                    Todos ({filteredTrackingEmployees.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrackingFilter('IN_TRAINING'); setTrackingPage(1); }}
                    style={{
                      border: 'none',
                      background: trackingFilter === 'IN_TRAINING' ? '#ffffff' : 'transparent',
                      color: trackingFilter === 'IN_TRAINING' ? '#2b6fc0' : '#64748b',
                      fontWeight: trackingFilter === 'IN_TRAINING' ? 700 : 500,
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: trackingFilter === 'IN_TRAINING' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    }}
                  >
                    En capacitación ({trackingData?.summary?.inTraining ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrackingFilter('NEEDS_HELP'); setTrackingPage(1); }}
                    style={{
                      border: 'none',
                      background: trackingFilter === 'NEEDS_HELP' ? '#ffffff' : 'transparent',
                      color: trackingFilter === 'NEEDS_HELP' ? '#b45309' : '#64748b',
                      fontWeight: trackingFilter === 'NEEDS_HELP' ? 700 : 500,
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: trackingFilter === 'NEEDS_HELP' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    }}
                  >
                    Necesitan ayuda ({trackingData?.summary?.needsHelp ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrackingFilter('READY'); setTrackingPage(1); }}
                    style={{
                      border: 'none',
                      background: trackingFilter === 'READY' ? '#ffffff' : 'transparent',
                      color: trackingFilter === 'READY' ? '#05968d' : '#64748b',
                      fontWeight: trackingFilter === 'READY' ? 700 : 500,
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: trackingFilter === 'READY' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    }}
                  >
                    Listos ({trackingData?.summary?.readyToServe ?? 0})
                  </button>
                </div>

                <button
                  type="button"
                  className="secondary"
                  onClick={loadTrackingData}
                  disabled={loadingEmployees}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '6px 14px' }}
                >
                  <TrainingIcon type="refresh" size={13} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>

            {loadingEmployees ? (
              <p style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Cargando seguimiento de ingresantes...</p>
            ) : employees.length === 0 ? (
              <p className="hint" style={{ textAlign: 'center', padding: 20 }}>No hay colaboradores registrados en el sistema.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                      <th style={{ padding: '12px 14px' }}>Persona y puesto</th>
                      <th style={{ padding: '12px 14px' }}>Parada actual</th>
                      <th style={{ padding: '12px 14px', width: 170 }}>Avance</th>
                      <th style={{ padding: '12px 14px' }}>Última actividad</th>
                      <th style={{ padding: '12px 14px' }}>Estado</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrackingEmployees.map((emp) => {
                        const statusConfig = (() => {
                          switch (emp.trackingStatus) {
                            case 'READY':
                              return { label: 'Listo para atender', bg: '#ecfdf5', color: '#05968d', border: '#a7f3ee', icon: 'check' };
                            case 'NEEDS_HELP':
                              return { label: 'Necesita ayuda', bg: '#fffdf5', color: '#b45309', border: '#fde68a', icon: 'clock' };
                            default:
                              return { label: 'En capacitación', bg: '#eef5fc', color: '#2b6fc0', border: '#cfe0f3', icon: 'book' };
                          }
                        })();

                        const isStalled = emp.daysWithoutProgress !== null && emp.daysWithoutProgress >= 3;

                        return (
                          <tr key={emp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '14px' }}>
                              <strong style={{ color: '#0f172a', fontSize: 13.5 }}>{emp.name}</strong>
                              <div style={{ fontSize: 11.5, color: '#475569', marginTop: 1 }}>
                                {emp.role || 'Vendedor/a'} · <span style={{ color: '#64748b' }}>{emp.sectorName || 'Transversal'}</span>
                              </div>
                            </td>

                            <td style={{ padding: '14px', color: '#334155' }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                {emp.currentParada || 'Parada inicial'}
                              </span>
                            </td>

                            <td style={{ padding: '14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${emp.percentage ?? 0}%`,
                                      height: '100%',
                                      background: emp.percentage === 100 ? '#05968d' : '#2b6fc0',
                                      borderRadius: 3,
                                      transition: 'width 0.3s ease',
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#17305a', minWidth: 32 }}>
                                  {emp.percentage ?? 0}%
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                {emp.completedPills ?? 0} de {emp.totalPills ?? 0} paradas
                              </div>
                            </td>

                            <td style={{ padding: '14px' }}>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  color: isStalled ? '#b45309' : '#334155',
                                  fontWeight: isStalled ? 700 : 500,
                                }}
                              >
                                {formatRelativeTime(emp.lastActivity, emp.daysWithoutProgress)}
                              </div>
                              {emp.failedFreeSimulationsCount > 0 && (
                                <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                                  {emp.failedFreeSimulationsCount} simulación{emp.failedFreeSimulationsCount > 1 ? 'es' : ''} libre sin aprobar
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '14px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '3px 10px',
                                  borderRadius: 12,
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  background: statusConfig.bg,
                                  color: statusConfig.color,
                                  border: `1px solid ${statusConfig.border}`,
                                }}
                              >
                                {statusConfig.label}
                              </span>
                            </td>

                            <td style={{ padding: '14px', textAlign: 'right' }}>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => setDetailEmployee(emp)}
                                style={{
                                  padding: '6px 14px',
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  minHeight: 34,
                                  color: '#2b6fc0',
                                  borderColor: '#cfe0f3',
                                }}
                              >
                                Ver detalle
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación de Seguimiento de Ingresantes */}
            {!loadingEmployees && filteredTrackingEmployees.length > 0 && (
              <div className="table-pagination-footer training-module-pagination" style={{ marginTop: 16 }}>
                <span className="pagination-text">
                  Mostrando {trackingStartIndex + 1} a{' '}
                  {Math.min(trackingStartIndex + trackingPageSize, filteredTrackingEmployees.length)} de{' '}
                  {filteredTrackingEmployees.length} colaboradores
                </span>
                <div className="pagination-controls">
                  <div className="page-btn-group">
                    <button
                      type="button"
                      className="page-nav-btn"
                      aria-label="Página anterior de colaboradores"
                      disabled={safeTrackingPage === 1}
                      onClick={() => setTrackingPage((page) => Math.max(1, page - 1))}
                    >
                      ‹
                    </button>
                    <span className="page-num-active" aria-current="page">{safeTrackingPage}</span>
                    <button
                      type="button"
                      className="page-nav-btn"
                      aria-label="Página siguiente de colaboradores"
                      disabled={safeTrackingPage === trackingPageCount}
                      onClick={() =>
                        setTrackingPage((page) => Math.min(trackingPageCount, page + 1))
                      }
                    >
                      ›
                    </button>
                  </div>
                  <select
                    className="page-size-select"
                    aria-label="Colaboradores por página"
                    value={trackingPageSize}
                    onChange={(e) => {
                      setTrackingPageSize(Number(e.target.value));
                      setTrackingPage(1);
                    }}
                  >
                    {[5, 10, 20].map((size) => (
                      <option key={size} value={size}>{size} por página</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales y Vistas Secundarias */}
      {detailEmployee && (
        <SupervisorEmployeeDetailModal
          token={token}
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
          onUpdated={() => {
            loadTrackingData();
          }}
        />
      )}
      {diagnosticEmployee && (
        <SupervisorDiagnosticModal
          token={token}
          employeeId={diagnosticEmployee.id}
          employeeName={diagnosticEmployee.name}
          onClose={() => setDiagnosticEmployee(null)}
        />
      )}

      {simulationEmployee && (
        <SupervisorSimulationsModal
          token={token}
          employeeId={simulationEmployee.id}
          employeeName={simulationEmployee.name}
          onClose={() => setSimulationEmployee(null)}
        />
      )}

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
            setDiagnosticCompleted(true);
            loadEmployeePath();
          }}
        />
      )}

      {/* Lección en 3 etapas: Escuchar -> Practicar -> Demostrar (Captura 4) */}
      {activePillId && (
        <LessonStudyModal
          token={token}
          pillId={activePillId}
          areaName={getModuleAreaName(modules[0] || {})}
          onClose={() => setActivePillId(null)}
          onStartSimulation={(simMode) => {
            const foundPill = modules.flatMap((m) => m.pills || []).find((p) => p.id === activePillId);
            setSimulationConfig({ pill: foundPill || { id: activePillId }, mode: simMode });
          }}
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
          onOpenPill={(targetPill) => {
            const pId = targetPill?.id || simulationConfig.pill?.id;
            setSimulationConfig(null);
            if (pId) setActivePillId(pId);
          }}
        />
      )}
    </div>
  );
}
