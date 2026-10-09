import { useState } from 'react';
import Login from './components/Login';
import SupervisorPanel from './components/SupervisorPanel';
import ChatSimulator from './components/ChatSimulator';
import KnowledgeIngest from './components/KnowledgeIngest';
import Interview from './components/Interview';
import Improvements from './components/Improvements';
import WebChat from './components/WebChat';
import EscalationsQueue from './components/EscalationsQueue';
import CollectionsPanel from './components/CollectionsPanel';
import SalesClientForm from './components/SalesClientForm';
import EmployeesPanel from './components/EmployeesPanel';
import TrainingPanel from './components/TrainingPanel';

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconEscalations() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function IconKnowledge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconImprovements() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconEmployees() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconChatSim() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function IconTraining() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function IconWebChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconCollections() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function IconSales() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const SUPERVISOR_TABS = [
  { id: 'supervisor', label: 'Panel del Supervisor', icon: <IconHome /> },
  { id: 'escalations', label: 'Casos escalados', icon: <IconEscalations /> },
  { id: 'knowledge', label: 'Base de Conocimiento', icon: <IconKnowledge /> },
  { id: 'improvements', label: 'Mejorar el conocimiento', icon: <IconImprovements /> },
  { id: 'employees', label: 'Empleados y Áreas', icon: <IconEmployees /> },
  { id: 'chat', label: 'Simulador de Chat', icon: <IconChatSim /> },
];

const COMMON_TABS = [
  { id: 'training', label: 'Capacitación y Diagnóstico', icon: <IconTraining /> },
  { id: 'webchat', label: 'Chat con el Asistente', icon: <IconWebChat /> },
];

const COLLECTOR_TABS = [
  { id: 'collections', label: 'Mi Panel de Cobranzas', icon: <IconCollections /> },
];

const SALES_TABS = [
  { id: 'sales', label: 'Alta de Cliente', icon: <IconSales /> },
];

function formatUserName(user) {
  if (user?.name) return user.name;
  if (!user?.email) return 'Usuario';
  const prefix = user.email.split('@')[0];
  return prefix
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('escalations');
  const [interviewStart, setInterviewStart] = useState(null);

  if (!token) {
    return <Login onLogin={(t, u) => { setToken(t); setUser(u); }} />;
  }

  const isSupervisor = user.role === 'SUPERVISOR';
  const isCollector = user.sectorName === 'Cobranzas';
  const isSales = user.sectorName === 'Ventas';

  if (!isSupervisor && !isCollector && !isSales) {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: 60 }}>
        <div className="card">
          <p>Logueado como {user.email} ({user.role}).</p>
          <p>El acceso requiere rol SUPERVISOR, o sector Cobranzas o Ventas.</p>
          <button onClick={() => { setToken(null); setUser(null); }}>Salir</button>
        </div>
      </div>
    );
  }

  const visibleTabs = [
    ...(isSupervisor ? SUPERVISOR_TABS : []),
    ...COMMON_TABS,
    ...(isCollector ? COLLECTOR_TABS : []),
    ...(isSales ? SALES_TABS : []),
  ];
  const defaultTab = visibleTabs[0]?.id;
  const currentTab = visibleTabs.some((t) => t.id === tab) ? tab : defaultTab;

  return (
    <div className="app-layout">
      {/* Sidebar de navegación corporativa */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="TrimIA" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              className={`nav-item${currentTab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Perfil del usuario en la parte inferior */}
        <div className="sidebar-footer">
          <div className="user-profile-card">
            <div className="user-avatar">
              <IconUser />
            </div>
            <div className="user-info">
              <div className="user-name">{formatUserName(user)}</div>
              <div className="user-role">
                {user.role}
                {user.sectorName && ` (${user.sectorName})`}
              </div>
            </div>
            <button
              className="user-logout-btn"
              title="Cerrar sesión"
              onClick={() => { setToken(null); setUser(null); }}
            >
              <IconChevronRight />
            </button>
          </div>
        </div>
      </aside>

      {/* Área principal del contenido */}
      <main className="app-main">
        {currentTab === 'training' && <TrainingPanel token={token} me={user} />}
        {currentTab === 'webchat' && <WebChat token={token} me={user} />}
        {currentTab === 'collections' && <CollectionsPanel token={token} me={user} isCollector={isCollector} />}
        {currentTab === 'sales' && <SalesClientForm token={token} />}
        {isSupervisor && currentTab === 'escalations' && <EscalationsQueue token={token} me={user} />}
        {isSupervisor && currentTab === 'supervisor' && <SupervisorPanel token={token} me={user} />}
        {isSupervisor && currentTab === 'chat' && <ChatSimulator token={token} />}
        {isSupervisor && currentTab === 'knowledge' && (
          <KnowledgeIngest token={token} me={user} />
        )}
        {isSupervisor && currentTab === 'improvements' && (
          interviewStart ? (
            <Interview
              token={token}
              me={user}
              start={interviewStart}
              onSalir={() => setInterviewStart(null)}
            />
          ) : (
            <Improvements
              token={token}
              me={user}
              onEntrevistar={(sectorId, itemId) => setInterviewStart({ sectorId, itemId })}
              onRetomar={(sectorId) => setInterviewStart({ sectorId })}
            />
          )
        )}
        {isSupervisor && currentTab === 'employees' && <EmployeesPanel token={token} />}
      </main>
    </div>
  );
}
