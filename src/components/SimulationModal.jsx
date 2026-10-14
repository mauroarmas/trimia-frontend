import { useState, useEffect, useRef } from 'react';
import {
  startSimulation,
  sendSimulationMessage,
  concludeSimulation,
} from '../api';

export default function SimulationModal({
  token,
  pill,
  pillId,
  pillTitle,
  mode = 'GUIDED',
  onClose,
  onCompleted,
}) {
  const currentPillId = pill?.id || pillId;
  const currentPillTitle = pill?.title || pillTitle || 'Práctica Pedagógica';
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [goals, setGoals] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll al final del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Inicializar la sesión al abrir el modal
  useEffect(() => {
    let isMounted = true;
    async function init() {
      setLoading(true);
      setError('');
      try {
        if (!currentPillId) {
          if (isMounted) setError('No se especificó la lección formativa.');
          return;
        }
        const data = await startSimulation(token, currentPillId, mode);
        if (isMounted) {
          setSession(data);
          setMessages(data.messages || []);
          setGoals(data.goals || []);
          if (data.feedback) setFeedback(data.feedback);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Error al iniciar la simulación');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => { isMounted = false; };
  }, [token, currentPillId, mode]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || sending || !session || feedback) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setError('');

    // Agregar mensaje localmente para feedback inmediato
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender: 'EMPLOYEE',
      content: userText,
      turnIndex: messages.length,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await sendSimulationMessage(token, session.id, userText);
      // Reemplazar o actualizar con la respuesta real del servidor
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        res.employeeMessage,
        res.clientMessage,
      ]);
      if (res.updatedGoals) {
        setGoals(res.updatedGoals);
      }
    } catch (err) {
      setError(err.message || 'Error al enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  const handleConclude = async () => {
    const employeeMsgsCount = messages.filter((m) => m.sender === 'EMPLOYEE').length;
    if (employeeMsgsCount < 2) {
      alert('Debes interactuar al menos 2 turnos con el cliente antes de finalizar la simulación.');
      return;
    }
    if (!confirm('¿Deseas finalizar la simulación y recibir tu devolución pedagógica?')) return;

    setConcluding(true);
    setError('');
    try {
      const fb = await concludeSimulation(token, session.id);
      setFeedback(fb);
      if (onCompleted) onCompleted();
    } catch (err) {
      setError(err.message || 'Error al concluir la simulación');
    } finally {
      setConcluding(false);
    }
  };

  const getBandBadge = (band) => {
    switch (band) {
      case 'ACHIEVED':
        return { label: 'LOGRADO', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
      case 'NEEDS_IMPROVEMENT':
        return { label: 'A MEJORAR', bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
      case 'NOT_ACHIEVED':
        return { label: 'NO LOGRADO', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      default:
        return { label: band, bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{
          maxWidth: feedback ? 850 : mode === 'GUIDED' ? 1000 : 750,
          width: '95vw',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>
                {mode === 'GUIDED' ? '🧭' : '🎭'}
              </span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                {mode === 'GUIDED' ? 'Práctica Guiada' : 'Simulación Libre'} — {currentPillTitle}
              </h3>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: mode === 'GUIDED' ? '#ede9fe' : '#e0f2fe',
                  color: mode === 'GUIDED' ? '#4f46e5' : '#0284c7',
                }}
              >
                {mode === 'GUIDED' ? 'Checklist en vivo' : 'Sin asistencias'}
              </span>
            </div>
            {session && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Cliente: <b>{session.customerName}</b> · Caso: {session.scenarioTitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {!feedback && session && (
              <button
                type="button"
                onClick={handleConclude}
                disabled={concluding || messages.filter((m) => m.sender === 'EMPLOYEE').length < 2}
                style={{
                  background: '#4f46e5',
                  color: '#ffffff',
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {concluding ? 'Evaluando...' : '🏁 Finalizar Simulación'}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ fontSize: 32 }}>🤖</div>
            <p style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              Preparando al cliente simulado y el escenario de práctica...
            </p>
          </div>
        ) : error && !session ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p className="error">{error}</p>
            <button className="secondary" onClick={onClose} style={{ marginTop: 12 }}>Cerrar</button>
          </div>
        ) : feedback ? (
          /* PANTALLA DE DEVOLUCIÓN EN 3 TARJETAS */
          <div style={{ flex: 1, overflowY: 'auto', padding: 32, background: '#f8fafc' }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {/* Tarjeta de Banda Global */}
              <div
                style={{
                  background: '#ffffff',
                  border: `1px solid ${getBandBadge(feedback.band).border}`,
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 24,
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Resultado de la Evaluación Cualitativa
                </div>
                <div style={{ marginTop: 8 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 16,
                      fontWeight: 700,
                      padding: '6px 20px',
                      borderRadius: 20,
                      background: getBandBadge(feedback.band).bg,
                      color: getBandBadge(feedback.band).color,
                      border: `1px solid ${getBandBadge(feedback.band).border}`,
                    }}
                  >
                    Banda: {getBandBadge(feedback.band).label}
                  </span>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 14.5, color: '#334155', lineHeight: 1.6 }}>
                  {feedback.summary}
                </p>
              </div>

              {/* 3 Tarjetas Cualitativas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* 1. Qué hizo bien */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #bbf7d0',
                    borderLeft: '5px solid #10b981',
                    borderRadius: 10,
                    padding: '18px 22px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🌟</span> Qué hiciste bien
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {feedback.whatWentWell}
                  </p>
                </div>

                {/* 2. A mejorar */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fde68a',
                    borderLeft: '5px solid #f59e0b',
                    borderRadius: 10,
                    padding: '18px 22px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>💡</span> Aspectos a mejorar
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {feedback.toImprove}
                  </p>
                </div>

                {/* 3. Reglas del negocio */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #c7d2fe',
                    borderLeft: '5px solid #6366f1',
                    borderRadius: 10,
                    padding: '18px 22px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#3730a3', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>⚖️</span> Reglas del negocio y políticas
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {feedback.businessRules}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 28, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#4f46e5',
                    color: '#ffffff',
                    padding: '10px 24px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Entendido, volver a las píldoras
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PANTALLA PRINCIPAL DE SIMULACIÓN Y CHAT */
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Columna Izquierda: Chat interactivo */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', borderRight: mode === 'GUIDED' ? '1px solid #e2e8f0' : 'none' }}>
              {/* Mensajes del chat */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {messages.map((m, idx) => {
                  const isUser = m.sender === 'EMPLOYEE';
                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: 500 }}>
                        {isUser ? 'Tú (Empleado)' : `${session?.customerName || 'Cliente'}${m.emotion ? ` · [${m.emotion}]` : ''}`}
                      </span>
                      <div
                        style={{
                          background: isUser ? '#4f46e5' : '#ffffff',
                          color: isUser ? '#ffffff' : '#0f172a',
                          padding: '11px 16px',
                          borderRadius: isUser ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          fontSize: 14,
                          lineHeight: 1.5,
                          border: isUser ? 'none' : '1px solid #e2e8f0',
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}

                {sending && (
                  <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {session?.customerName || 'El cliente'} está escribiendo...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <form
                onSubmit={handleSendMessage}
                style={{
                  padding: '14px 20px',
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder="Escribe tu respuesta como empleado..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={sending}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  style={{
                    background: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {sending ? '...' : 'Enviar'}
                </button>
              </form>
            </div>

            {/* Columna Derecha: Checklist en vivo (solo en modo GUIDED) */}
            {mode === 'GUIDED' && (
              <div
                style={{
                  width: 340,
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  padding: '20px',
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    📋 Objetivos de la Práctica
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    Se tildan automáticamente conforme avanzas en el diálogo:
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {goals.map((g, idx) => (
                    <div
                      key={g.id || idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: g.isCompleted ? '#ecfdf5' : '#f8fafc',
                        border: g.isCompleted ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 16, lineHeight: 1 }}>
                          {g.isCompleted ? '✅' : '⏳'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: g.isCompleted ? '#065f46' : '#334155',
                              lineHeight: 1.4,
                            }}
                          >
                            {g.description}
                          </div>
                          {g.evidence && (
                            <div style={{ fontSize: 11, color: '#059669', marginTop: 4, fontStyle: 'italic' }}>
                              "{g.evidence}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Perfil del caso para referencia */}
                <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
                  <h5 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Perfil del Caso
                  </h5>
                  <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                    {session?.customerProfile}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

