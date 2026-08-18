import { useState } from 'react';
import Login from './components/Login';
import SupervisorPanel from './components/SupervisorPanel';
import ChatSimulator from './components/ChatSimulator';
import KnowledgeIngest from './components/KnowledgeIngest';
import WebChat from './components/WebChat';
import EscalationsQueue from './components/EscalationsQueue';
import CollectionsPanel from './components/CollectionsPanel';
import SalesClientForm from './components/SalesClientForm';

const SUPERVISOR_TABS = [
  { id: 'escalations', label: 'Casos Escalados' },
  { id: 'supervisor', label: 'Panel del Supervisor' },
  { id: 'chat', label: 'Simulador de Chat' },
  { id: 'knowledge', label: 'Base de Conocimiento' },
];

// El chat web solo exige JWT: cualquier empleado autenticado puede usarlo.
// Por eso no vive en SUPERVISOR_TABS.
const COMMON_TABS = [
  { id: 'webchat', label: 'Chat con el Asistente' },
];

const COLLECTOR_TABS = [
  { id: 'collections', label: 'Mi Panel de Cobranzas' },
];

const SALES_TABS = [
  { id: 'sales', label: 'Alta de Cliente' },
];

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('escalations');

  if (!token) {
    return <Login onLogin={(t, u) => { setToken(t); setUser(u); }} />;
  }

  // El backend no tiene un rol COLLECTIONS ni SALES: EmployeeRole es solo
  // EMPLEADO | SUPERVISOR, y el sector es lo que habilita cada pantalla —
  // /sales/clients compara req.user.sectorName contra 'Ventas', igual que
  // acá. El alcance de los datos lo resuelve el backend con isController.
  const isSupervisor = user.role === 'SUPERVISOR';
  const isCollector = user.sectorName === 'Cobranzas';
  const isSales = user.sectorName === 'Ventas';

  if (!isSupervisor && !isCollector && !isSales) {
    return (
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="card">
          <p>Logueado como {user.email} ({user.role}).</p>
          <p>El acceso requiere rol SUPERVISOR, o sector Cobranzas o Ventas.</p>
          <button onClick={() => { setToken(null); setUser(null); }}>Salir</button>
        </div>
      </div>
    );
  }

  // Un SUPERVISOR de Ventas (como Diego en el seed) ve ambos conjuntos.
  const visibleTabs = [
    ...(isSupervisor ? SUPERVISOR_TABS : []),
    ...COMMON_TABS,
    ...(isCollector ? COLLECTOR_TABS : []),
    ...(isSales ? SALES_TABS : []),
  ];
  const defaultTab = visibleTabs[0]?.id;
  const currentTab = visibleTabs.some((t) => t.id === tab) ? tab : defaultTab;

  return (
    <div className="container">
      <div className="topbar">
        <h1>TrimIA — Frontend de pruebas</h1>
        <div>
          <span className="who">
            {user.email} · {user.role}
            {user.sectorName && ` (${user.sectorName})`}
            {user.isController && ' [Controlador]'}
          </span>
          <button className="secondary" onClick={() => { setToken(null); setUser(null); }}>Salir</button>
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={`tab${currentTab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {currentTab === 'webchat' && <WebChat token={token} />}
      {currentTab === 'collections' && <CollectionsPanel token={token} me={user} isCollector={isCollector} />}
      {currentTab === 'sales' && <SalesClientForm token={token} />}
      {isSupervisor && currentTab === 'escalations' && <EscalationsQueue token={token} me={user} />}
      {isSupervisor && currentTab === 'supervisor' && <SupervisorPanel token={token} me={user} />}
      {isSupervisor && currentTab === 'chat' && <ChatSimulator token={token} />}
      {isSupervisor && currentTab === 'knowledge' && <KnowledgeIngest token={token} />}
    </div>
  );
}
