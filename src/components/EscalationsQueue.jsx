import { useEffect, useState } from 'react';
import {
  listEscalations,
  getEscalation,
  getConversation,
  resolveEscalation,
  delegateEscalation,
  listEmployees,
} from '../api';
import ConversationControls from './ConversationControls';

export default function EscalationsQueue({ token, me }) {
  const [status, setStatus] = useState('PENDING');
  const [escalations, setEscalations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [conversation, setConversation] = useState(null);

  const [replyMessage, setReplyMessage] = useState('');
  const [teachAgent, setTeachAgent] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeCategory, setKnowledgeCategory] = useState('');
  const [knowledgeAudience, setKnowledgeAudience] = useState('');
  const [knowledgeAgentType, setKnowledgeAgentType] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function loadQueue() {
    setLoading(true);
    setError('');
    try {
      const [escRes, empRes] = await Promise.all([
        listEscalations(token, { status, limit: 100 }),
        listEmployees(token),
      ]);
      setEscalations(escRes.data);
      setEmployees(empRes.filter((e) => e.role === 'SUPERVISOR' && e.isActive));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function openCase(escalation) {
    setSelected(escalation);
    setConversation(null);
    setActionError('');
    setReplyMessage('');
    setTeachAgent(false);
    setKnowledgeTitle('');
    setKnowledgeCategory('');
    setKnowledgeAudience('');
    setKnowledgeAgentType('');
    setDelegateTo('');
    try {
      const [escDetail, conv] = await Promise.all([
        getEscalation(token, escalation.id),
        getConversation(token, escalation.conversationId),
      ]);
      setSelected(escDetail);
      setConversation(conv);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function refreshConversation() {
    const conv = await getConversation(token, selected.conversationId);
    setConversation(conv);
  }

  async function handleResolve(e) {
    e.preventDefault();
    if (teachAgent && (!knowledgeTitle.trim() || !knowledgeCategory.trim())) {
      setActionError('Título y categoría del conocimiento son obligatorios.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await resolveEscalation(token, selected.id, {
        message: replyMessage,
        teachAgent,
        title: knowledgeTitle,
        category: knowledgeCategory,
        audience: knowledgeAudience || undefined,
        agentType: knowledgeAgentType || undefined,
      });
      setSelected(null);
      setConversation(null);
      await loadQueue();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelegate(e) {
    e.preventDefault();
    if (!delegateTo) return;
    setActionBusy(true);
    setActionError('');
    try {
      await delegateEscalation(token, selected.id, delegateTo);
      const escDetail = await getEscalation(token, selected.id);
      setSelected(escDetail);
      await loadQueue();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button
          className={`tab${status === 'PENDING' ? ' active' : ''}`}
          onClick={() => setStatus('PENDING')}
        >
          Pendientes
        </button>
        <button
          className={`tab${status === 'RESOLVED' ? ' active' : ''}`}
          onClick={() => setStatus('RESOLVED')}
        >
          Resueltos
        </button>
      </div>

      <button className="secondary" onClick={loadQueue} disabled={loading} style={{ marginBottom: 12 }}>
        {loading ? 'Cargando...' : 'Refrescar'}
      </button>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Motivo</th><th>Cliente</th><th>Canal</th><th>Agente</th><th>Creado</th>
              {status === 'PENDING' && <th>Delegado a</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {escalations.length === 0 && (
              <tr><td colSpan={6}>Sin casos {status === 'PENDING' ? 'pendientes' : 'resueltos'}.</td></tr>
            )}
            {escalations.map((e) => (
              <tr key={e.id}>
                <td>{e.reason}</td>
                <td>{e.conversation?.externalId}</td>
                <td>{e.conversation?.channel}</td>
                <td>{e.conversation?.currentAgent ?? '—'}</td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                {status === 'PENDING' && (
                  <td>{e.delegatedToId ? employees.find((emp) => emp.id === e.delegatedToId)?.name ?? e.delegatedToId : '—'}</td>
                )}
                <td><button className="secondary" onClick={() => openCase(e)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Caso: {selected.reason}</h3>
            <button className="secondary" onClick={() => { setSelected(null); setConversation(null); }}>Cerrar</button>
          </div>

          {actionError && <p className="error" style={{ marginTop: 8 }}>{actionError}</p>}

          {conversation && (
            <>
              <h4 style={{ marginTop: 12 }}>Conversación ({conversation.externalId})</h4>
              <ul className="msg-list">
                {conversation.messages.slice(-8).map((m) => (
                  <li key={m.id}>
                    <b>{m.role}{m.agentType ? ` (${m.agentType})` : ''}:</b> {m.content}
                    <div className="msg-time">{new Date(m.createdAt).toLocaleTimeString()}</div>
                  </li>
                ))}
              </ul>

              <ConversationControls
                token={token}
                conversation={conversation}
                me={me}
                onRefresh={refreshConversation}
              />
            </>
          )}

          {selected.status === 'PENDING' && (
            <div className="panel-section">
              <h4>Resolver caso</h4>
              <form onSubmit={handleResolve}>
                <div className="field">
                  <label>Mensaje de respuesta al cliente</label>
                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="teachAgent"
                    checked={teachAgent}
                    onChange={(e) => setTeachAgent(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="teachAgent" style={{ margin: 0 }}>
                    Enseñar esta respuesta al RAG (queda como conocimiento reutilizable)
                  </label>
                </div>

                {teachAgent && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 12, marginTop: 12 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0 }}>
                      Campos para ingestar como conocimiento en el RAG:
                    </p>
                    <div className="field">
                      <label>Título del documento <span style={{ color: 'var(--error)' }}>*</span></label>
                      <input
                        value={knowledgeTitle}
                        onChange={(e) => setKnowledgeTitle(e.target.value)}
                        placeholder="ej. Financiación de heladeras exhibidoras en cuotas"
                      />
                    </div>
                    <div className="field">
                      <label>Categoría <span style={{ color: 'var(--error)' }}>*</span></label>
                      <input
                        value={knowledgeCategory}
                        onChange={(e) => setKnowledgeCategory(e.target.value)}
                        placeholder="ej. productos, financiación, politicas"
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Audiencia (opcional)</label>
                        <select value={knowledgeAudience} onChange={(e) => setKnowledgeAudience(e.target.value)}>
                          <option value="">— sin especificar —</option>
                          <option value="PUBLICO">Público (para clientes)</option>
                          <option value="INTERNO">Interno (solo equipo)</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Agente (opcional)</label>
                        <select value={knowledgeAgentType} onChange={(e) => setKnowledgeAgentType(e.target.value)}>
                          <option value="">— sin especificar —</option>
                          <option value="SALES">Ventas</option>
                          <option value="COLLECTIONS">Cobranzas</option>
                          <option value="LOGISTICS">Logística</option>
                          <option value="DEPOSITS">Depósito</option>
                          <option value="ADMIN">Administración</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={actionBusy} style={{ marginTop: teachAgent ? 12 : 0 }}>
                  Resolver y responder
                </button>
              </form>

              <h4 style={{ marginTop: 16 }}>Delegar a otro supervisor</h4>
              <form onSubmit={handleDelegate}>
                <div className="field-row">
                  <div className="field">
                    <select value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
                      <option value="">— elegir supervisor —</option>
                      {employees.filter((e) => e.id !== me.id).map((e) => (
                        <option key={e.id} value={e.id}>{e.name} ({e.email})</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="secondary" disabled={actionBusy || !delegateTo}>
                    Delegar
                  </button>
                </div>
                {employees.length <= 1 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    No hay otros supervisores activos para delegar.
                  </p>
                )}
              </form>
            </div>
          )}

          {selected.status === 'RESOLVED' && (
            <div className="panel-section">
              <p className="success-msg">
                Resuelto {selected.resolvedAt ? `el ${new Date(selected.resolvedAt).toLocaleString()}` : ''}.
              </p>
              <p><b>Respuesta enviada:</b> {selected.resolution}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
