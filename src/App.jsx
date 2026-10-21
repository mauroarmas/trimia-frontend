import { useState } from 'react';
import Login from './components/Login';
import SupervisorPanel from './components/SupervisorPanel';
import ChatSimulator from './components/ChatSimulator';
import KnowledgeIngest from './components/KnowledgeIngest';
import Interview from './components/Interview';
import WebChat from './components/WebChat';
import EscalationsQueue from './components/EscalationsQueue';
import CollectionsPanel from './components/CollectionsPanel';
import SalesPanel from './components/SalesPanel';
import AdminFinancingPanel from './components/AdminFinancingPanel';
import EmployeesPanel from './components/EmployeesPanel';
import TrainingPanel from './components/TrainingPanel';

// Iconos SVG limpios y consistentes para cada módulo
function NavIcon({ type, className = 'sidebar-nav-icon' }) {
  switch (type) {
    case 'supervisor':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'escalations':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'knowledge':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'improvements':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case 'employees':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'training':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case 'webchat':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      );
    case 'collections':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case 'sales':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      );
    case 'chat':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
  }
}

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [showLogoutIntro, setShowLogoutIntro] = useState(false);
  // Sin pestaña elegida se abre la primera del perfil (para el supervisor, su panel).
  const [tab, setTab] = useState(null);
  const [interviewStart, setInterviewStart] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handleLogout() {
    setShowLogoutIntro(true);
    setToken(null);
    setUser(null);
    // Quien entre después arranca en su propia primera pestaña, no en la del anterior.
    setTab(null);
    setInterviewStart(null);
  }

  if (!token) {
    return (
      <Login
        showIntro={showLogoutIntro}
        onLogin={(t, u) => {
          setShowLogoutIntro(false);
          setToken(t);
          setUser(u);
        }}
      />
    );
  }

  const isSupervisor = user.role === 'SUPERVISOR';
  const isDiego =
    user.email === 'diego.bazan@credimision.com' ||
    user.isGeneralSupervisor === true;
  const isCobranzas = user.sectorName === 'Cobranzas';
  const isVentas = user.sectorName === 'Ventas';
  const isAdmin = user.sectorName === 'Administración' || user.sectorName === 'Admin';

  // Configuración estricta de pestañas según el perfil
  let visibleTabs = [];

  if (isDiego) {
    // 👑 Diego Bazán: Acceso TOTAL a todo el sistema
    visibleTabs = [
      { id: 'supervisor', label: 'Panel del Supervisor', icon: 'supervisor' },
      { id: 'escalations', label: 'Casos escalados', icon: 'escalations' },
      { id: 'knowledge', label: 'Base de Conocimiento', icon: 'knowledge' },
      { id: 'employees', label: 'Empleados y Áreas', icon: 'employees' },
      { id: 'training', label: 'Capacitación y Diagnóstico', icon: 'training' },
      { id: 'collections', label: 'Panel de Cobranzas', icon: 'collections' },
      { id: 'sales', label: 'Panel de Ventas', icon: 'sales' },
      { id: 'admin_financing', label: 'Aprobación Financiación', icon: 'sales' },
      { id: 'chat', label: 'Simulador de Chat', icon: 'chat' },
      { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
    ];
  } else if (isSupervisor) {
    // 🛡️ Supervisores de área específica (ej. Silvia Ríos en Cobranzas)
    if (isCobranzas) {
      visibleTabs = [
        { id: 'collections', label: 'Panel de Cobranzas', icon: 'collections' },
        { id: 'escalations', label: 'Casos escalados', icon: 'escalations' },
        { id: 'knowledge', label: 'Base de Conocimiento', icon: 'knowledge' },
        { id: 'training', label: 'Capacitación y Diagnóstico', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    } else if (isVentas) {
      visibleTabs = [
        { id: 'sales', label: 'Panel de Ventas', icon: 'sales' },
        { id: 'escalations', label: 'Casos escalados', icon: 'escalations' },
        { id: 'knowledge', label: 'Base de Conocimiento', icon: 'knowledge' },
        { id: 'training', label: 'Capacitación y Diagnóstico', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    } else {
      // Logística o Depósito
      visibleTabs = [
        { id: 'escalations', label: 'Casos escalados', icon: 'escalations' },
        { id: 'knowledge', label: 'Base de Conocimiento', icon: 'knowledge' },
        { id: 'training', label: 'Capacitación y Diagnóstico', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    }
  } else {
    // 👤 Empleados operativos
    if (isCobranzas) {
      visibleTabs = [
        { id: 'collections', label: 'Mi Panel de Cobranzas', icon: 'collections' },
        { id: 'training', label: 'Mi Capacitación', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    } else if (isVentas) {
      visibleTabs = [
        { id: 'sales', label: 'Panel de Ventas', icon: 'sales' },
        { id: 'training', label: 'Mi Capacitación', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    } else if (isAdmin) {
      visibleTabs = [
        { id: 'admin_financing', label: 'Aprobación Financiación', icon: 'sales' },
        { id: 'training', label: 'Mi Capacitación', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    } else {
      // Logística / Depósito u otros
      visibleTabs = [
        { id: 'training', label: 'Mi Capacitación', icon: 'training' },
        { id: 'webchat', label: 'Chat con el Asistente', icon: 'webchat' },
      ];
    }
  }

  const defaultTab = visibleTabs[0]?.id;
  const currentTab = visibleTabs.some((t) => t.id === tab) ? tab : defaultTab;

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Sidebar Fija Lateral */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <img src="/logo-sidebar.png" alt="TrimIA" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Menú</span>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              className={`sidebar-nav-item${currentTab === t.id ? ' active' : ''}`}
              title={sidebarCollapsed ? t.label : undefined}
              onClick={() => setTab(t.id)}
            >
              <NavIcon type={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <svg viewBox="0 0 26 62" fill="none" aria-hidden="true">
            <path
              className="sidebar-toggle-outline"
              d="M1 1L25 31L1 61Z"
              stroke="none"
            />
            <path
              className="sidebar-toggle-outline-edge"
              d="M1 1L25 31L1 61"
            />
            <path
              className="sidebar-toggle-arrow"
              strokeLinecap="round"
              strokeLinejoin="round"
              d={sidebarCollapsed ? 'M10 25l6 6-6 6' : 'M16 25l-6 6 6 6'}
            />
          </svg>
        </button>

        {/* Perfil de Usuario Inferior */}
        <div className="sidebar-user-card">
          <div className="user-profile-pill">
            <div className="user-avatar" aria-hidden="true">
              {(user.name || user.email.split('@')[0])
                .split(/[\s._-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0].toUpperCase())
                .join('')}
            </div>
            <div className="user-info">
              <div className="user-name" title={user.email}>
                {user.name || (user.email.includes('@') ? user.email.split('@')[0] : user.email)}
              </div>
              <div className="user-role-badge">
                {isDiego ? 'SUPERVISOR GENERAL' : `${user.role} ${user.sectorName ? `(${user.sectorName})` : ''}`}
              </div>
            </div>
            <button
              className="btn-logout-icon"
              title="Cerrar sesión"
              onClick={handleLogout}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main className="app-main">
        {currentTab === 'training' && <TrainingPanel token={token} me={user} />}
        {currentTab === 'webchat' && <WebChat token={token} me={user} />}
        {currentTab === 'collections' && <CollectionsPanel token={token} me={user} isCollector={isCobranzas} />}
        {currentTab === 'sales' && <SalesPanel token={token} me={user} />}
        {currentTab === 'admin_financing' && <AdminFinancingPanel token={token} me={user} />}
        {currentTab === 'escalations' && <EscalationsQueue token={token} me={user} />}
        {isDiego && currentTab === 'supervisor' && <SupervisorPanel token={token} me={user} />}
        {isDiego && currentTab === 'chat' && <ChatSimulator token={token} />}
        {currentTab === 'knowledge' && (
          <KnowledgeIngest
            token={token}
            me={user}
            showImprovements={isDiego}
            interviewStart={interviewStart}
            onEntrevistar={(sectorId, itemId) => setInterviewStart({ sectorId, itemId })}
            onRetomar={(sectorId) => setInterviewStart({ sectorId })}
            onSalirEntrevista={() => setInterviewStart(null)}
          />
        )}
        {isDiego && currentTab === 'employees' && <EmployeesPanel token={token} />}
      </main>
    </div>
  );
}
