import AiModelSelector from './AiModelSelector';
import FinancingDraftEditor from './FinancingDraftEditor';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getAgentsStatus,
  getMetrics,
  getConversations,
  getConversation,
  getContactTimeline,
} from '../api';
import ConversationControls from './ConversationControls';
import ConversationThread, { MessageActorAvatar } from './ConversationThread';
import ChatExportMenu from './ChatExportMenu';
import { buildConversationMarkdown, buildTimelineMarkdown } from '../chatExport';
import {
  AGENT_META,
  STATUS_LABELS,
  formatRelativeTime,
  contactInitials,
  resolveMessageActor,
} from '../conversationHelpers';
import { statusBadgeClass } from '../statusBadge';
import PageHero from './PageHero';
import TokenEconomicsModal from './TokenEconomicsModal';
import { estimateMetricsEconomics, formatUsd } from '../tokenEconomics';

const STATUS_FILTER_PILLS = [
  ['', 'Todas'],
  ['ACTIVE', 'Activas'],
  ['WAITING_HUMAN', 'Esperando humano'],
  ['HUMAN_HANDLING', 'Control manual'],
  ['CLOSED', 'Cerradas'],
];

const ROBOT_PALETTES = {
  SALES: {
    shell: '#eff6ff',
    shellBorder: '#93c5fd',
    accent: '#2563eb',
    eye: '#60a5fa',
  },
  COLLECTIONS: {
    shell: '#f0fdfa',
    shellBorder: '#99f6e4',
    accent: '#0d9488',
    eye: '#2dd4bf',
  },
  ADMIN: {
    shell: '#f5f3ff',
    shellBorder: '#c4b5fd',
    accent: '#7c3aed',
    eye: '#a78bfa',
  },
  LOGISTICS: {
    shell: '#fffbeb',
    shellBorder: '#fcd34d',
    accent: '#d97706',
    eye: '#fbbf24',
  },
  DEPOSITS: {
    shell: '#f0f9ff',
    shellBorder: '#7dd3fc',
    accent: '#0284c7',
    eye: '#38bdf8',
  },
};

function AgentRobotAvatar({ agentType, size = 'sm' }) {
  const p = ROBOT_PALETTES[agentType] || ROBOT_PALETTES.SALES;
  return (
    <svg
      viewBox="0 0 40 40"
      className={`sup-agent-robot-svg${size === 'lg' ? ' is-lg' : ''}`}
      aria-hidden="true"
    >
      {/* Antena */}
      <line
        x1="20"
        y1="11"
        x2="20"
        y2="6.5"
        stroke={p.accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="5.5" r="2.2" fill={p.accent} />
      {/* Orejeras laterales */}
      <rect x="4" y="17.5" width="3.5" height="7" rx="1.75" fill={p.accent} opacity="0.85" />
      <rect x="32.5" y="17.5" width="3.5" height="7" rx="1.75" fill={p.accent} opacity="0.85" />
      {/* Cabeza del agente robot */}
      <rect
        x="7.5"
        y="11"
        width="25"
        height="20.5"
        rx="7"
        fill={p.shell}
        stroke={p.shellBorder}
        strokeWidth="1.6"
      />
      {/* Visor */}
      <rect x="11" y="15.5" width="18" height="10.5" rx="4.2" fill="#0f172a" />
      {/* Ojos luminosos */}
      <circle cx="16.2" cy="20.4" r="2" fill={p.eye} />
      <circle cx="23.8" cy="20.4" r="2" fill={p.eye} />
      <circle cx="16.8" cy="19.8" r="0.65" fill="#ffffff" opacity="0.9" />
      <circle cx="24.4" cy="19.8" r="0.65" fill="#ffffff" opacity="0.9" />
      {/* Indicador de voz/sonrisa sutil */}
      <path
        d="M17.4 23.4c.7.7 1.6 1 2.6 1s1.9-.3 2.6-1"
        fill="none"
        stroke={p.eye}
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Cuello / base discreta */}
      <rect x="14.5" y="33.2" width="11" height="2.6" rx="1.3" fill={p.accent} opacity="0.35" />
    </svg>
  );
}

function AgentAreaIcon({ agentType }) {
  switch (agentType) {
    case 'SALES':
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-area-svg" aria-hidden="true">
          <rect width="48" height="48" rx="13" fill="url(#gradSales)" />
          <defs>
            <linearGradient id="gradSales" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="100%" stopColor="#eff6ff" />
            </linearGradient>
          </defs>
          <circle cx="37" cy="12" r="7" fill="#93c5fd" opacity="0.35" />
          <path
            d="M15 19h18l-1.6 15.2a2 2 0 01-2 1.8H18.6a2 2 0 01-2-1.8L15 19z"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M19.5 19v-2.5a4.5 4.5 0 019 0V19"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M19.5 29l3.2-3.2 2.4 2.2 4-4.2"
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="29.1" cy="23.8" r="1.6" fill="#2563eb" />
        </svg>
      );
    case 'COLLECTIONS':
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-area-svg" aria-hidden="true">
          <rect width="48" height="48" rx="13" fill="url(#gradCol)" />
          <defs>
            <linearGradient id="gradCol" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ccfbf1" />
              <stop offset="100%" stopColor="#f0fdfa" />
            </linearGradient>
          </defs>
          <rect
            x="12"
            y="15"
            width="21"
            height="17"
            rx="3.5"
            fill="#ffffff"
            stroke="#0d9488"
            strokeWidth="2"
          />
          <path d="M12 20.5h21" stroke="#0d9488" strokeWidth="2" />
          <path d="M16 26h6" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32.5" cy="30.5" r="6.5" fill="#0d9488" />
          <path
            d="M29.8 30.6l1.9 1.9 3.6-3.8"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'ADMIN':
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-area-svg" aria-hidden="true">
          <rect width="48" height="48" rx="13" fill="url(#gradAdmin)" />
          <defs>
            <linearGradient id="gradAdmin" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ede9fe" />
              <stop offset="100%" stopColor="#f5f3ff" />
            </linearGradient>
          </defs>
          <path
            d="M24 12l12 6v2H12v-2l12-6z"
            fill="#ffffff"
            stroke="#7c3aed"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M16 20v11M21.3 20v11M26.7 20v11M32 20v11"
            stroke="#7c3aed"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M13 33h22"
            stroke="#6d28d9"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="24" cy="16.3" r="1.4" fill="#7c3aed" />
        </svg>
      );
    case 'LOGISTICS':
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-area-svg" aria-hidden="true">
          <rect width="48" height="48" rx="13" fill="url(#gradLog)" />
          <defs>
            <linearGradient id="gradLog" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="100%" stopColor="#fffbeb" />
            </linearGradient>
          </defs>
          <rect
            x="10"
            y="17"
            width="17"
            height="13"
            rx="2.5"
            fill="#ffffff"
            stroke="#d97706"
            strokeWidth="2"
          />
          <path
            d="M27 21h6.2l3.8 4.4V30H27v-9z"
            fill="#fde68a"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="16.5" cy="31.5" r="3" fill="#ffffff" stroke="#b45309" strokeWidth="2" />
          <circle cx="31.5" cy="31.5" r="3" fill="#ffffff" stroke="#b45309" strokeWidth="2" />
          <path d="M14 22h7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'DEPOSITS':
    default:
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-area-svg" aria-hidden="true">
          <rect width="48" height="48" rx="13" fill="url(#gradDep)" />
          <defs>
            <linearGradient id="gradDep" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="100%" stopColor="#f0f9ff" />
            </linearGradient>
          </defs>
          <path
            d="M24 13l11 6v10l-11 6-11-6V19l11-6z"
            fill="#ffffff"
            stroke="#0284c7"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M13 19l11 6 11-6M24 25v10"
            stroke="#0284c7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 16l11 6"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export default function SupervisorPanel({
  token,
  me,
  onOpenFinancing,
  onOpenKnowledge,
  onOpenEscalations,
}) {
  const canSelectAiModel = Boolean(me?.isGeneralSupervisor || me?.email === 'diego.bazan@credimision.com');
  const [agents, setAgents] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // Estado de la sección de conversaciones (búsqueda, filtros y paginación)
  const [convData, setConvData] = useState({
    rows: [],
    total: 0,
    page: 1,
    limit: 10,
  });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [error, setError] = useState('');

  // Modales
  const [showEconomicsModal, setShowEconomicsModal] = useState(false);
  const [infoAgentType, setInfoAgentType] = useState(null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [timeline, setTimeline] = useState(null);
  // Debounce del texto de búsqueda (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError('');
    try {
      const [agentsRes, metricsRes] = await Promise.all([
        getAgentsStatus(token),
        getMetrics(token),
      ]);
      setAgents(agentsRes);
      setMetrics(metricsRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOverview(false);
    }
  }, [token]);

  const loadConversationsList = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await getConversations(token, {
        status: statusFilter || undefined,
        agentType: agentFilter || undefined,
        channel: channelFilter || undefined,
        userType: userTypeFilter || undefined,
        search: debouncedSearch || undefined,
        page,
        limit: pageSize,
      });
      setConvData({
        rows: res.data ?? [],
        total: res.total ?? 0,
        page: res.page ?? page,
        limit: res.limit ?? pageSize,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingConvs(false);
    }
  }, [
    token,
    statusFilter,
    agentFilter,
    channelFilter,
    userTypeFilter,
    debouncedSearch,
    page,
    pageSize,
  ]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadConversationsList();
  }, [loadConversationsList]);

  async function refreshAll() {
    await Promise.all([loadOverview(), loadConversationsList()]);
  }

  async function openConversation(id) {
    setTimeline(null);
    setError('');
    try {
      const conv = await getConversation(token, id);
      setSelectedConv(conv);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshSelectedConversation() {
    if (!selectedConv) return;
    const conv = await getConversation(token, selectedConv.id);
    setSelectedConv(conv);
    loadConversationsList();
    loadOverview();
  }

  function clearAllFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('');
    setAgentFilter('');
    setChannelFilter('');
    setUserTypeFilter('');
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    searchInput || statusFilter || agentFilter || channelFilter || userTypeFilter,
  );

  // Cálculos resumidos del panorama general
  const econ = estimateMetricsEconomics(metrics);
  const totalConvs = metrics?.conversations?.total ?? 0;
  const activeConvs = metrics?.conversations?.active ?? 0;
  const waitingHumanConvs = metrics?.conversations?.waitingHuman ?? 0;
  const humanHandlingConvs = metrics?.conversations?.humanHandling ?? 0;
  const unassignedConvs = metrics?.conversations?.byAgent?.['sin asignar'] ?? 0;

  const agentList = agents?.agents ?? [];
  const totalRouted = agentList.reduce((acc, a) => acc + (a.routedTurns || 0), 0);
  const totalEscalations = agentList.reduce((acc, a) => acc + (a.escalations || 0), 0);
  const autonomousRate =
    totalRouted > 0
      ? Math.round(((totalRouted - totalEscalations) / totalRouted) * 100)
      : null;

  const totalPages = Math.max(1, Math.ceil(convData.total / pageSize));
  const fromIdx = convData.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, convData.total);

  return (
    <div className="supervisor-panel">
      <PageHero
        kicker="Gobernanza y control"
        title="Panel del Supervisor"
        description="Panorama resumido de atención en vivo, desempeño de los agentes especializados y explorador de conversaciones."
        action={
          <>
            <button
              type="button"
              className="knowledge-hero-action sup-hero-econ-btn"
              onClick={() => setShowEconomicsModal(true)}
            >
              <span aria-hidden="true">✦</span>
              <span>Métricas y Costos de IA</span>
              <span className="sup-hero-econ-pill">
                {formatUsd(econ.totalCostUsd, { compact: true })}
              </span>
            </button>
            <button
              type="button"
              className="knowledge-hero-action"
              onClick={refreshAll}
              disabled={loadingOverview || loadingConvs}
            >
              <span aria-hidden="true">↻</span>
              <span>{loadingOverview || loadingConvs ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
          </>
        }
      />

      {error && (
        <p className="error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* BLOQUE UNIFICADO: Conversaciones + Equipo de Agentes Ilustrados */}
      <section className="sup-unified-overview" aria-labelledby="sup-overview-heading">
        <div className="sup-overview-top">
          <div className="sup-overview-title-block">
            <h3 id="sup-overview-heading">Actividad y Equipo de Agentes IA</h3>
            <p>
              Resumen de conversaciones distribuidas por especialidad. Hacé clic en un agente para filtrar sus charlas.
            </p>
          </div>

          <div className="sup-kpi-strip">
            <div className="sup-kpi-chip">
              <span className="sup-kpi-chip-label">Conversaciones</span>
              <div className="sup-kpi-chip-main">
                <strong>{totalConvs}</strong>
                <span className="sup-live-pill">
                  <span className="sup-live-dot" />
                  {activeConvs} activas
                </span>
              </div>
              {(waitingHumanConvs > 0 || humanHandlingConvs > 0) && (
                <span className="sup-kpi-chip-sub">
                  {waitingHumanConvs > 0 ? `${waitingHumanConvs} esperando humano` : ''}
                  {waitingHumanConvs > 0 && humanHandlingConvs > 0 ? ' · ' : ''}
                  {humanHandlingConvs > 0 ? `${humanHandlingConvs} manual` : ''}
                </span>
              )}
            </div>

            <div className="sup-kpi-chip">
              <span className="sup-kpi-chip-label">Resolución autónoma</span>
              <div className="sup-kpi-chip-main">
                <strong>{autonomousRate != null ? `${autonomousRate}%` : '—'}</strong>
              </div>
              <span className="sup-kpi-chip-sub">
                {totalRouted > 0
                  ? `${totalRouted - totalEscalations} de ${totalRouted} turnos sin derivar`
                  : 'Sin turnos en ventana'}
              </span>
            </div>

            <div className="sup-kpi-chip">
              <span className="sup-kpi-chip-label">Meta de seguridad</span>
              <div className="sup-kpi-chip-main">
                <strong>
                  {agents?.confidenceThreshold != null
                    ? `${Math.round(agents.confidenceThreshold * 100)}%`
                    : '—'}
                </strong>
              </div>
              <span className="sup-kpi-chip-sub">Confianza mínima exigida</span>
            </div>
          </div>
        </div>

        {/* Tarjetas compactas de agentes robots */}
        <div className="sup-agents-grid">
          {agentList.map((agent) => {
            const meta = AGENT_META[agent.agentType] || {
              name: agent.agentType,
              subtitle: 'Agente especializado',
              accent: '#2563eb',
              bgSoft: '#eff6ff',
              borderSoft: '#bfdbfe',
            };
            const isSelected = agentFilter === agent.agentType;
            const isActive = agent.status === 'active';

            return (
              <article
                key={agent.agentType}
                className={`sup-agent-card${isSelected ? ' is-selected' : ''}`}
                style={{ '--agent-accent': meta.accent }}
                onClick={() => {
                  setAgentFilter((prev) => (prev === agent.agentType ? '' : agent.agentType));
                  setPage(1);
                }}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setAgentFilter((prev) => (prev === agent.agentType ? '' : agent.agentType));
                    setPage(1);
                  }
                }}
              >
                <div className="sup-agent-compact-main">
                  <div
                    className="sup-agent-robot-wrap"
                    title={isActive ? 'Agente activo' : 'Agente en espera'}
                  >
                    <AgentRobotAvatar agentType={agent.agentType} size="sm" />
                    <span
                      className={`sup-agent-robot-dot${isActive ? ' is-active' : ''}`}
                      aria-label={isActive ? 'Activo' : 'En espera'}
                    />
                  </div>

                  <div className="sup-agent-identity">
                    <h4>{meta.name}</h4>
                    <div
                      className="sup-agent-compact-convs"
                      title={`${agent.totalConversations} conversaciones totales (${agent.activeConversations} en curso)`}
                    >
                      <span className="sup-agent-conv-total">
                        <strong>{agent.totalConversations}</strong> conv.
                      </span>
                      <span className="sup-agent-conv-active">
                        <strong>{agent.activeConversations}</strong> en curso
                      </span>
                    </div>
                  </div>

                  <div className="sup-agent-area-badge" aria-hidden="true">
                    <AgentAreaIcon agentType={agent.agentType} />
                  </div>
                </div>

                <div className="sup-agent-compact-footer">
                  <button
                    type="button"
                    className="sup-agent-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoAgentType(agent.agentType);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={`Más información sobre ${meta.name}`}
                  >
                    <span className="sup-agent-info-btn-left">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      <span>Más información</span>
                    </span>
                    <span className="sup-agent-info-arrow" aria-hidden="true">›</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {(unassignedConvs > 0 || agentFilter) && (
          <div className="sup-overview-footnote">
            {unassignedConvs > 0 ? (
              <span>
                Recepción inicial: <strong>{unassignedConvs}</strong>{' '}
                {unassignedConvs === 1
                  ? 'conversación aún sin derivar a un agente.'
                  : 'conversaciones aún sin derivar a un agente.'}
              </span>
            ) : (
              <span />
            )}
            {agentFilter && (
              <button
                type="button"
                className="sup-clear-agent-btn"
                onClick={() => {
                  setAgentFilter('');
                  setPage(1);
                }}
              >
                Filtrando por {AGENT_META[agentFilter]?.name ?? agentFilter} ✕
              </button>
            )}
          </div>
        )}
      </section>

      {/* EXPLORADOR DE CONVERSACIONES CON BÚSQUEDA, FILTROS Y PAGINACIÓN */}
      <section className="sup-conv-section" aria-labelledby="sup-conv-heading">
        <div className="sup-conv-header">
          <div>
            <h3 id="sup-conv-heading">
              Conversaciones{' '}
              <span className="sup-count-pill">{convData.total}</span>
            </h3>
            <p>Buscá por cliente, teléfono o contenido y auditá cualquier interacción en tiempo real.</p>
          </div>
          {hasActiveFilters && (
            <button type="button" className="secondary sup-reset-btn" onClick={clearAllFilters}>
              Limpiar filtros ✕
            </button>
          )}
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="sup-conv-toolbar">
          <div className="sup-search-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar cliente, teléfono, ID o palabra clave del mensaje…"
              aria-label="Buscar conversaciones"
            />
            {searchInput && (
              <button
                type="button"
                className="sup-search-clear"
                onClick={() => setSearchInput('')}
                aria-label="Borrar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          <div className="sup-filter-selects">
            <select
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por agente"
            >
              <option value="">Todas las áreas</option>
              <option value="SALES">Ventas</option>
              <option value="COLLECTIONS">Cobranzas</option>
              <option value="ADMIN">Administración</option>
              <option value="LOGISTICS">Logística</option>
              <option value="DEPOSITS">Depósito</option>
            </select>

            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por canal"
            >
              <option value="">Todos los canales</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WEB">Chat Web</option>
            </select>

            <select
              value={userTypeFilter}
              onChange={(e) => {
                setUserTypeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por tipo de contacto"
            >
              <option value="">Clientes y empleados</option>
              <option value="CLIENTE">Solo clientes</option>
              <option value="EMPLEADO">Solo empleados</option>
            </select>
          </div>
        </div>

        {/* Píldoras rápidas de estado */}
        <div className="sup-status-pills-row">
          <div className="submenu-pills">
            {STATUS_FILTER_PILLS.map(([val, label]) => (
              <button
                key={val || 'all'}
                type="button"
                className={`submenu-pill${statusFilter === val ? ' active' : ''}`}
                onClick={() => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="sup-results-summary">
            {loadingConvs
              ? 'Cargando conversaciones…'
              : convData.total === 0
                ? 'Sin resultados'
                : `Mostrando ${fromIdx}–${toIdx} de ${convData.total}`}
          </span>
        </div>

        {/* Tabla resumida y moderna */}
        <div className="sup-table-wrap">
          <table className="sup-modern-table">
            <thead>
              <tr>
                <th>Contacto y último mensaje</th>
                <th>Canal</th>
                <th>Perfil</th>
                <th>Área asignada</th>
                <th>Estado</th>
                <th>Actividad</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {convData.rows.length === 0 && !loadingConvs ? (
                <tr>
                  <td colSpan={7} className="sup-empty-cell">
                    No se encontraron conversaciones con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                convData.rows.map((c) => {
                  const agentMeta = c.currentAgent ? AGENT_META[c.currentAgent] : null;
                  const lastMsg = c.messages?.[0];
                  const isEmp = c.userType === 'EMPLEADO' || Boolean(c.employee);
                  const displayName = c.employee?.name || c.client?.name || c.externalId;
                  const secondaryId = displayName !== c.externalId ? c.externalId : null;
                  const empSector = c.employee?.sector?.name;

                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="sup-contact-cell">
                          <div className="sup-contact-avatar" aria-hidden="true">
                            {contactInitials(displayName)}
                          </div>
                          <div className="sup-contact-texts">
                            <div className="sup-contact-name-row">
                              <strong>{displayName}</strong>
                              {secondaryId && (
                                <span className="sup-contact-ext">{secondaryId}</span>
                              )}
                            </div>
                            {lastMsg ? (
                              <p className="sup-last-msg" title={lastMsg.content}>
                                {lastMsg.role === 'USER'
                                  ? isEmp
                                    ? 'Empleado: '
                                    : 'Cliente: '
                                  : 'IA: '}
                                {lastMsg.content}
                              </p>
                            ) : (
                              <p className="sup-last-msg is-empty">Sin mensajes registrados</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`sup-channel-badge ${
                            c.channel === 'WHATSAPP' ? 'is-wa' : 'is-web'
                          }`}
                        >
                          {c.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web'}
                        </span>
                      </td>
                      <td>
                        <span className="sup-profile-label">
                          {isEmp
                            ? empSector
                              ? `Empleado (${empSector})`
                            : 'Empleado'
                            : 'Cliente'}
                        </span>
                      </td>
                      <td>
                        {agentMeta ? (
                          <span
                            className="sup-agent-pill"
                            style={{
                              backgroundColor: agentMeta.bgSoft,
                              color: agentMeta.accent,
                              borderColor: agentMeta.borderSoft,
                            }}
                          >
                            <span
                              className="sup-agent-pill-dot"
                              style={{ backgroundColor: agentMeta.accent }}
                            />
                            {isEmp ? `Tema: ${agentMeta.name}` : agentMeta.name}
                          </span>
                        ) : (
                          <span className="sup-unassigned-label">Sin asignar</span>
                        )}
                      </td>
                      <td>
                        <span className={statusBadgeClass(c.status)}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td>
                        <div className="sup-activity-cell">
                          <strong>{c._count?.messages ?? 0} msjs</strong>
                          <span>{formatRelativeTime(c.updatedAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="sup-row-actions">
                          <button
                            type="button"
                            className="secondary sup-action-btn"
                            onClick={() => openConversation(c.id)}
                          >
                            Ver charla
                          </button>
                          <button
                            type="button"
                            className="secondary sup-action-btn is-subtle"
                            title="Ver línea de tiempo unificada de WhatsApp y Web para este contacto"
                            onClick={async () => {
                              setSelectedConv(null);
                              setError('');
                              try {
                                setTimeline(await getContactTimeline(token, c.externalId));
                              } catch (err) {
                                setError(err.message);
                              }
                            }}
                          >
                            Multicanal
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="sup-pagination-bar">
          <label className="sup-pagesize-label">
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>por página</span>
          </label>

          <div className="sup-page-controls">
            <button
              type="button"
              className="secondary"
              disabled={page <= 1 || loadingConvs}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>
            <span className="sup-page-indicator">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              className="secondary"
              disabled={page >= totalPages || loadingConvs}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </section>

      {/* Modal de Información y Mejora de Agente */}
      {infoAgentType && (() => {
        const selectedAgent = agentList.find((a) => a.agentType === infoAgentType);
        if (!selectedAgent) return null;
        return (
          <AgentInfoModal
            agent={selectedAgent}
            confidenceThreshold={agents?.confidenceThreshold ?? 0.65}
            onClose={() => setInfoAgentType(null)}
            onOpenKnowledge={onOpenKnowledge}
            onOpenEscalations={onOpenEscalations}
          />
        );
      })()}

      {/* Modal de Consumo e Impacto Económico de IA */}
      {showEconomicsModal && (
        <TokenEconomicsModal
          metrics={metrics}
          onClose={() => setShowEconomicsModal(false)}
        >
          {canSelectAiModel && <AiModelSelector token={token} onChanged={loadOverview} />}
        </TokenEconomicsModal>
      )}

      {/* Modal de Detalle de Conversación */}
      {selectedConv && (
        <ConversationDetailModal
          onOpenFinancing={onOpenFinancing}
          token={token}
          me={me}
          conversation={selectedConv}
          onRefresh={refreshSelectedConversation}
          onClose={() => setSelectedConv(null)}
        />
      )}

      {/* Modal de Historial Unificado Multicanal */}
      {timeline && (
        <ContactTimelineModal data={timeline} onClose={() => setTimeline(null)} />
      )}
    </div>
  );
}

function ConversationDetailModal({ token, me, conversation, onRefresh, onClose, onOpenFinancing }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const agentMeta = conversation.currentAgent
    ? AGENT_META[conversation.currentAgent]
    : null;
  const isEmployee = conversation.userType === 'EMPLEADO' || Boolean(conversation.employee);
  const empSector = conversation.employee?.sector?.name;
  const displayName =
    conversation.employee?.name || conversation.client?.name || conversation.externalId;

  return createPortal(
    <div
      className="econ-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="econ-modal sup-conv-modal" role="dialog" aria-modal="true">
        <header className="econ-modal-header">
          <div>
            <span className="econ-modal-kicker">
              {conversation.channel === 'WHATSAPP' ? 'Canal WhatsApp' : 'Canal Web'} ·{' '}
              {isEmployee
                ? empSector
                  ? `Empleado de ${empSector}`
                  : 'Perfil Empleado'
                : 'Perfil Cliente'}{' '}
              · {agentMeta ? `Tema consultado: ${agentMeta.name}` : 'Sin agente asignado'}
            </span>
            <h2>Conversación con {displayName}</h2>
            <p>
              {displayName !== conversation.externalId
                ? `ID/Tel: ${conversation.externalId} · `
                : ''}
              Estado actual: {STATUS_LABELS[conversation.status] ?? conversation.status} ·{' '}
              {conversation.messages?.length ?? 0} mensajes registrados
            </p>
          </div>
          <div className="econ-modal-actions">
            <ChatExportMenu
              variant="inverse"
              filename={`conversacion-${displayName}`}
              disabled={(conversation.messages?.length ?? 0) === 0}
              getMarkdown={() =>
                buildConversationMarkdown({
                  title: `Conversación con ${displayName}`,
                  contactLabel: displayName,
                  conversation,
                  me,
                })
              }
            />
            <button
              type="button"
              className="econ-modal-close"
              onClick={onClose}
              aria-label="Cerrar conversación"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="econ-modal-body sup-conv-modal-body">
          <ConversationThread conversation={conversation} me={me} />

          <div className="sup-conv-controls-wrap">
            <FinancingDraftEditor token={token} me={me} conversation={conversation} onOpenFinancing={onOpenFinancing} />
            <ConversationControls
              token={token}
              conversation={conversation}
              me={me}
              onRefresh={onRefresh}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Vista unificada de lectura de un contacto (FR-018).
 */
function ContactTimelineModal({ data, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isEmployee = Boolean(data.contact?.employee);

  return createPortal(
    <div
      className="econ-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="econ-modal sup-conv-modal" role="dialog" aria-modal="true">
        <header className="econ-modal-header">
          <div>
            <span className="econ-modal-kicker">Vista multicanal de lectura</span>
            <h2>
              {data.contact.externalId}
              {data.contact.employee ? ` · ${data.contact.employee.name}` : ''}
            </h2>
            <p>
              {data.conversations.length} hilo(s) combinados cronológicamente (
              {data.conversations
                .map(
                  (c) =>
                    `${c.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web'} · ${
                      AGENT_META[c.currentAgent]?.name ?? 'Sin área'
                    }`,
                )
                .join(' / ')}
              ).
            </p>
          </div>
          <div className="econ-modal-actions">
            <ChatExportMenu
              variant="inverse"
              filename={`historial-${data.contact.externalId}`}
              disabled={(data.timeline?.length ?? 0) === 0}
              getMarkdown={() => buildTimelineMarkdown({ data })}
            />
            <button
              type="button"
              className="econ-modal-close"
              onClick={onClose}
              aria-label="Cerrar línea de tiempo"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="econ-modal-body sup-conv-modal-body">
          <div className="sup-chat-thread">
            {data.timeline.map((m, i) => {
              const fakeConv = {
                userType: isEmployee ? 'EMPLEADO' : 'CLIENTE',
                currentAgent: m.agentType,
              };
              const actor = resolveMessageActor(m, fakeConv, null);
              const isLeft = actor.side === 'left';

              return (
                <div
                  key={`${m.conversationId}-${i}`}
                  className={`sup-chat-bubble-row ${isLeft ? 'is-user' : 'is-assistant'} actor-${actor.actorType.toLowerCase()}`}
                >
                  <MessageActorAvatar
                    actorType={actor.actorType}
                    accent={actor.accent}
                    bg={actor.bg}
                    border={actor.border}
                  />
                  <div className="sup-chat-bubble">
                    <div className="sup-chat-meta">
                      <div className="sup-chat-author-group">
                        <span
                          className={`sup-channel-badge ${
                            m.channel === 'WHATSAPP' ? 'is-wa' : 'is-web'
                          }`}
                        >
                          {m.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web'}
                        </span>
                        <strong>{actor.title}</strong>
                        <span
                          className={`sup-chat-role-tag is-${actor.actorType.toLowerCase()}`}
                        >
                          {actor.badge}
                        </span>
                      </div>
                      <time className="sup-chat-time">
                        {new Date(m.createdAt).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    <p>{m.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AgentInfoModal({
  agent,
  confidenceThreshold,
  onClose,
  onOpenKnowledge,
  onOpenEscalations,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = AGENT_META[agent.agentType] || {
    name: agent.agentType,
    subtitle: 'Agente especializado',
    accent: '#2563eb',
    bgSoft: '#eff6ff',
    borderSoft: '#bfdbfe',
  };
  const isActive = agent.status === 'active';
  const thresholdPct = Math.round((confidenceThreshold ?? 0.65) * 100);
  const coveragePct =
    agent.hasData && agent.coverage != null ? Math.round(agent.coverage * 100) : null;
  const samplePct =
    !agent.hasData && agent.minimumSample > 0
      ? Math.min(100, Math.round((agent.sampleSize / agent.minimumSample) * 100))
      : 0;

  let healthLabel = 'Reuniendo consultas';
  let healthTone = 'is-sample';
  if (coveragePct != null) {
    if (coveragePct >= 85) {
      healthLabel = 'Excelente respaldo';
      healthTone = 'is-good';
    } else if (coveragePct >= 75) {
      healthLabel = 'Buen respaldo';
      healthTone = 'is-good';
    } else if (coveragePct >= 50) {
      healthLabel = 'Para reforzar';
      healthTone = 'is-warn';
    } else {
      healthLabel = 'Necesita documentación';
      healthTone = 'is-low';
    }
  }

  const margin = agent.marginPoints;
  const marginLabel =
    margin == null
      ? 'Sin datos suficientes'
      : margin > 0
        ? `+${margin.toFixed(1)} pts por encima de la meta`
        : margin < 0
          ? `${margin.toFixed(1)} pts por debajo de la meta`
          : 'Justo en la meta';

  return createPortal(
    <div
      className="econ-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="econ-modal agent-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-info-modal-title"
        style={{ '--agent-accent': meta.accent }}
      >
        <header className="econ-modal-header agent-info-header">
          <div className="agent-info-header-main">
            <AgentRobotAvatar agentType={agent.agentType} size="lg" />
            <div>
              <div className="agent-info-kicker-row">
                <span className="econ-modal-kicker">Agente virtual especializado</span>
                <span className={`agent-info-status-pill${isActive ? ' is-active' : ''}`}>
                  <span className="sup-agent-status-dot" />
                  {isActive ? 'Activo' : 'En espera'}
                </span>
              </div>
              <h2 id="agent-info-modal-title">Agente de {meta.name}</h2>
              <p>
                {meta.subtitle} · Última actividad: {formatRelativeTime(agent.lastActivityAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="econ-modal-close"
            onClick={onClose}
            aria-label="Cerrar información del agente"
          >
            ✕
          </button>
        </header>

        <div className="econ-modal-body agent-info-body">
          {/* Resumen de actividad */}
          <div className="agent-info-stats-row">
            <div className="agent-info-stat-tile">
              <span>Conversaciones totales</span>
              <strong>{agent.totalConversations}</strong>
            </div>
            <div className="agent-info-stat-tile">
              <span>Conversaciones en curso</span>
              <strong className="is-accent">{agent.activeConversations}</strong>
            </div>
            <div className="agent-info-stat-tile">
              <span>Consultas evaluadas (30 días)</span>
              <strong>{agent.sampleSize}</strong>
            </div>
          </div>

          {/* Qué significan sus métricas en lenguaje cotidiano */}
          <section className="econ-section-card agent-info-section">
            <div className="agent-info-section-head">
              <h3>¿Cómo está respondiendo este agente?</h3>
              <span className={`agent-info-health-badge ${healthTone}`}>{healthLabel}</span>
            </div>

            {agent.hasData ? (
              <div className="agent-info-metrics-list">
                <div className="agent-info-metric-item">
                  <div className="agent-info-metric-top">
                    <span className="agent-info-metric-title">Respuestas con respaldo documental</span>
                    <strong>{coveragePct}%</strong>
                  </div>
                  <div className="sup-progress-track">
                    <div
                      className={`sup-progress-fill ${healthTone}`}
                      style={{ width: `${coveragePct}%` }}
                    />
                  </div>
                  <p>
                    De cada 100 consultas recientes, en <strong>{coveragePct}</strong> el agente
                    encontró información clara en tus documentos para responder por sí solo con
                    seguridad.
                  </p>
                </div>

                <div className="agent-info-metric-item">
                  <div className="agent-info-metric-top">
                    <span className="agent-info-metric-title">Margen respecto a la meta mínima</span>
                    <strong>{marginLabel}</strong>
                  </div>
                  <p>
                    Para evitar respuestas inventadas, el asistente exige al menos un{' '}
                    <strong>{thresholdPct}%</strong> de coincidencia con tus documentos.{' '}
                    {margin != null && margin >= 0
                      ? 'Un margen positivo indica que el agente encuentra respuestas claras y con holgura.'
                      : 'Un margen bajo indica que conviene aclarar o completar los documentos de esta área.'}
                  </p>
                </div>

                <div className="agent-info-metric-item">
                  <div className="agent-info-metric-top">
                    <span className="agent-info-metric-title">Consultas derivadas a una persona</span>
                    <strong>
                      {agent.escalations}{' '}
                      {agent.escalations === 1 ? 'derivación' : 'derivaciones'}
                    </strong>
                  </div>
                  <p>
                    Son las consultas de los últimos 30 días en las que el agente prefirió avisar a
                    un responsable humano porque faltaba información o era necesaria una decisión
                    manual.
                  </p>
                </div>
              </div>
            ) : (
              <div className="agent-info-metrics-list">
                <div className="agent-info-metric-item">
                  <div className="agent-info-metric-top">
                    <span className="agent-info-metric-title">Reuniendo consultas iniciales</span>
                    <strong>
                      {agent.sampleSize} de {agent.minimumSample}
                    </strong>
                  </div>
                  <div className="sup-progress-track is-sample">
                    <div
                      className="sup-progress-fill is-sample"
                      style={{ width: `${samplePct}%` }}
                    />
                  </div>
                  <p>
                    El sistema necesita al menos <strong>{agent.minimumSample} consultas</strong> en
                    los últimos 30 días para calcular un porcentaje confiable. Así evitamos mostrar
                    notas engañosas cuando todavía hubo pocas conversaciones.
                  </p>
                </div>

                <div className="agent-info-metric-item">
                  <div className="agent-info-metric-top">
                    <span className="agent-info-metric-title">Consultas derivadas a una persona</span>
                    <strong>
                      {agent.escalations}{' '}
                      {agent.escalations === 1 ? 'derivación' : 'derivaciones'}
                    </strong>
                  </div>
                  <p>
                    Consultas recientes que pasaron a un responsable humano para ser respondidas.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Consejos accionables en lenguaje no técnico */}
          <section className="econ-section-card agent-info-section">
            <div className="agent-info-section-head">
              <h3>¿Cómo mejorar este agente?</h3>
            </div>
            <ol className="agent-info-tips">
              <li>
                <strong>Sumá o actualizá documentos de {meta.name}:</strong> cargá guías, políticas,
                precios o preguntas frecuentes en la Base de Conocimiento. Si un documento ya existe
                y quedó incompleto, conviene editarlo en lugar de crear uno repetido.
              </li>
              <li>
                <strong>Guardá las respuestas de los casos derivados:</strong> cada vez que un
                responsable responde una consulta derivada, podés incorporar esa respuesta a la base
                para que el agente la resuelva solo la próxima vez.
              </li>
              <li>
                <strong>Usá “Mejorar conocimiento”:</strong> revisá los temas donde el agente dudó
                y completalos con una entrevista guiada
                {!agent.hasData
                  ? ', o hacé consultas frecuentes del área para terminar de reunir muestra y medir su rendimiento.'
                  : '.'}
              </li>
            </ol>
          </section>

          {/* Enlaces directos */}
          <footer className="agent-info-footer">
            {onOpenKnowledge && (
              <button
                type="button"
                className="agent-info-primary-btn"
                onClick={() => {
                  onClose();
                  onOpenKnowledge({ agentType: agent.agentType, view: 'lista' });
                }}
              >
                <span>Ir a Base de Conocimiento ({meta.name})</span>
                <span aria-hidden="true">↗</span>
              </button>
            )}
            {onOpenKnowledge && (
              <button
                type="button"
                className="secondary agent-info-secondary-btn"
                onClick={() => {
                  onClose();
                  onOpenKnowledge({ agentType: agent.agentType, view: 'mejorar' });
                }}
              >
                Ver qué falta mejorar
              </button>
            )}
            {agent.escalations > 0 && onOpenEscalations && (
              <button
                type="button"
                className="secondary agent-info-secondary-btn"
                onClick={() => {
                  onClose();
                  onOpenEscalations();
                }}
              >
                Ver casos derivados ({agent.escalations})
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
