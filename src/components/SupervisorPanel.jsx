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

function AgentIllustration({ agentType }) {
  switch (agentType) {
    case 'SALES':
      return (
        <svg viewBox="0 0 48 48" className="sup-agent-svg" aria-hidden="true">
          <rect width="48" height="48" rx="14" fill="url(#gradSales)" />
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
        <svg viewBox="0 0 48 48" className="sup-agent-svg" aria-hidden="true">
          <rect width="48" height="48" rx="14" fill="url(#gradCol)" />
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
        <svg viewBox="0 0 48 48" className="sup-agent-svg" aria-hidden="true">
          <rect width="48" height="48" rx="14" fill="url(#gradAdmin)" />
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
        <svg viewBox="0 0 48 48" className="sup-agent-svg" aria-hidden="true">
          <rect width="48" height="48" rx="14" fill="url(#gradLog)" />
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
        <svg viewBox="0 0 48 48" className="sup-agent-svg" aria-hidden="true">
          <rect width="48" height="48" rx="14" fill="url(#gradDep)" />
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

export default function SupervisorPanel({ token, me, onOpenFinancing }) {
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
              <span>Consumo y Costos IA</span>
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

            <button
              type="button"
              className="sup-kpi-chip sup-kpi-chip-button"
              onClick={() => setShowEconomicsModal(true)}
            >
              <span className="sup-kpi-chip-label">Inversión IA acumulada</span>
              <div className="sup-kpi-chip-main">
                <strong>{formatUsd(econ.totalCostUsd)}</strong>
              </div>
              <span className="sup-kpi-chip-link">Ver modelo y detalle económico →</span>
            </button>
          </div>
        </div>

        {/* Tarjetas modernas e ilustradas de los agentes */}
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
            const coveragePct =
              agent.hasData && agent.coverage != null
                ? Math.round(agent.coverage * 100)
                : null;
            const samplePct =
              !agent.hasData && agent.minimumSample > 0
                ? Math.min(100, Math.round((agent.sampleSize / agent.minimumSample) * 100))
                : 0;

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
                <div className="sup-agent-card-head">
                  <AgentIllustration agentType={agent.agentType} />
                  <span className={`sup-agent-status${isActive ? ' is-active' : ''}`}>
                    <span className="sup-agent-status-dot" />
                    {isActive ? 'Activo' : 'En espera'}
                  </span>
                </div>

                <div className="sup-agent-identity">
                  <h4>{meta.name}</h4>
                  <p>{meta.subtitle}</p>
                </div>

                <div className="sup-agent-conv-box">
                  <div>
                    <span className="sup-agent-stat-num">{agent.totalConversations}</span>
                    <span className="sup-agent-stat-lbl">conversaciones</span>
                  </div>
                  <div className="sup-agent-conv-divider" />
                  <div>
                    <span className="sup-agent-stat-num is-accent">
                      {agent.activeConversations}
                    </span>
                    <span className="sup-agent-stat-lbl">en curso</span>
                  </div>
                </div>

                {/* Cobertura / Muestra (Spec 009 respetada estrictamente) */}
                <div className="sup-agent-quality">
                  {agent.hasData ? (
                    <>
                      <div className="sup-agent-quality-row">
                        <span>Cobertura documental</span>
                        <strong>{coveragePct}%</strong>
                      </div>
                      <div className="sup-progress-track">
                        <div
                          className={`sup-progress-fill${
                            coveragePct >= 75
                              ? ' is-good'
                              : coveragePct >= 50
                                ? ' is-warn'
                                : ' is-low'
                          }`}
                          style={{ width: `${coveragePct}%` }}
                        />
                      </div>
                      <div className="sup-agent-footer-meta">
                        <span>
                          {agent.marginPoints != null
                            ? `${agent.marginPoints > 0 ? '+' : ''}${agent.marginPoints.toFixed(1)} pts s/meta`
                            : 'En meta'}
                        </span>
                        <span>{agent.escalations} escaladas</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="sup-agent-quality-row">
                        <span className="sup-muted">Reuniendo muestra</span>
                        <span className="sup-sample-pill">
                          {agent.sampleSize} de {agent.minimumSample}
                        </span>
                      </div>
                      <div className="sup-progress-track is-sample">
                        <div
                          className="sup-progress-fill is-sample"
                          style={{ width: `${samplePct}%` }}
                        />
                      </div>
                      <div className="sup-agent-footer-meta">
                        <span>{formatRelativeTime(agent.lastActivityAt)}</span>
                        <span>{agent.escalations} escaladas</span>
                      </div>
                    </>
                  )}
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
                  const displayName = c.client?.name || c.externalId;
                  const secondaryId = c.client?.name ? c.externalId : null;

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
                                {lastMsg.role === 'USER' ? 'Cliente: ' : 'IA: '}
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
                          {c.userType === 'EMPLEADO' ? 'Empleado' : 'Cliente'}
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
                            {agentMeta.name}
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

      {/* Modal de Consumo e Impacto Económico de IA */}
      {showEconomicsModal && (
        <TokenEconomicsModal
          metrics={metrics}
          onClose={() => setShowEconomicsModal(false)}
        />
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
  const isEmployee = conversation.userType === 'EMPLEADO';
  const displayName = conversation.client?.name || conversation.externalId;

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
              {agentMeta ? `Área ${agentMeta.name}` : 'Sin agente asignado'} ·{' '}
              {isEmployee ? 'Perfil Empleado' : 'Perfil Cliente'}
            </span>
            <h2>Conversación con {displayName}</h2>
            <p>
              {conversation.client?.name ? `ID/Tel: ${conversation.externalId} · ` : ''}
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
