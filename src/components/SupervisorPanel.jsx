import { useEffect, useState } from 'react';
import { getAgentsStatus, getMetrics, getConversations, getConversation } from '../api';
import ConversationControls from './ConversationControls';
import { statusBadgeClass } from '../statusBadge';

export default function SupervisorPanel({ token, me }) {
  const [agents, setAgents] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [agentsRes, metricsRes, convsRes] = await Promise.all([
        getAgentsStatus(token),
        getMetrics(token),
        getConversations(token, { limit: 50 }),
      ]);
      setAgents(agentsRes);
      setMetrics(metricsRes);
      setConversations(convsRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function openConversation(id) {
    setError('');
    try {
      const conv = await getConversation(token, id);
      setSelectedConv(conv);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshSelectedConversation() {
    const conv = await getConversation(token, selectedConv.id);
    setSelectedConv(conv);
  }

  return (
    <div>
      <button className="secondary" onClick={loadAll} disabled={loading}>
        {loading ? 'Cargando...' : 'Refrescar'}
      </button>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Agentes (umbral confianza: {agents?.confidenceThreshold ?? '?'})</h3>
        <table>
          <thead>
            <tr>
              <th>Agente</th><th>Status</th><th>Conversaciones</th><th>Activas</th>
              <th>Turnos ruteados</th><th>Confianza prom.</th><th>Escalaciones</th><th>% escalación</th>
            </tr>
          </thead>
          <tbody>
            {agents?.agents.map((a) => (
              <tr key={a.agentType}>
                <td>{a.agentType}</td>
                <td><span className={`badge status-${a.status}`}>{a.status}</span></td>
                <td>{a.totalConversations}</td>
                <td>{a.activeConversations}</td>
                <td>{a.routedTurns}</td>
                <td>{a.avgConfidence != null ? a.avgConfidence.toFixed(2) : '—'}</td>
                <td>{a.escalations}</td>
                <td>{a.escalationRate != null ? (a.escalationRate * 100).toFixed(0) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Métricas globales</h3>
        {metrics && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Conversaciones totales</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4 }}>{metrics.conversations?.total ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>activas: {metrics.conversations?.active ?? 0}</div>
              </div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tokens totales</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4 }}>
                  {(metrics.tokens?.totalInput ?? 0) + (metrics.tokens?.totalOutput ?? 0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  entrada: {metrics.tokens?.totalInput ?? 0} | salida: {metrics.tokens?.totalOutput ?? 0}
                </div>
              </div>
            </div>

            {metrics.conversations?.byAgent && Object.keys(metrics.conversations.byAgent).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Conversaciones por agente</div>
                <table>
                  <thead>
                    <tr><th>Agente</th><th>Count</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(metrics.conversations.byAgent).map(([agent, count]) => (
                      <tr key={agent}><td>{agent}</td><td>{count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {metrics.tokens?.byAgent && Object.keys(metrics.tokens.byAgent).length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Tokens por agente</div>
                <table>
                  <thead>
                    <tr><th>Agente</th><th>Input</th><th>Output</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(metrics.tokens.byAgent).map(([agent, tokens]) => (
                      <tr key={agent}>
                        <td>{agent}</td>
                        <td>{tokens.input ?? tokens}</td>
                        <td>{tokens.output ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Conversaciones ({conversations.length})</h3>
        <table>
          <thead>
            <tr>
              <th>externalId</th><th>Canal</th><th>Status</th><th>userType</th>
              <th>Agente actual</th><th>Mensajes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id}>
                <td>{c.externalId}</td>
                <td>{c.channel}</td>
                <td><span className={statusBadgeClass(c.status)}>{c.status}</span></td>
                <td>{c.userType}</td>
                <td>{c.currentAgent ?? '—'}</td>
                <td>{c._count?.messages ?? 0}</td>
                <td><button className="secondary" onClick={() => openConversation(c.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedConv && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Conversación {selectedConv.externalId}</h4>
            <button className="secondary" onClick={() => setSelectedConv(null)}>Cerrar</button>
          </div>
          <ul className="msg-list">
            {selectedConv.messages.map((m) => (
              <li key={m.id}>
                <b>{m.role}{m.agentType ? ` (${m.agentType})` : ''}:</b> {m.content}
                <div className="msg-time">{new Date(m.createdAt).toLocaleTimeString()}</div>
              </li>
            ))}
          </ul>

          <ConversationControls
            token={token}
            conversation={selectedConv}
            me={me}
            onRefresh={refreshSelectedConversation}
          />
        </div>
      )}
    </div>
  );
}
