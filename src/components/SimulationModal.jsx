import { useState, useEffect, useRef } from 'react';
import {
  startSimulation,
  sendSimulationMessage,
  concludeSimulation,
  requestSimulationHint,
} from '../api';
import TrainingIcon from './TrainingIcon';
import Trimi from './Trimi';

export default function SimulationModal({
  token,
  pill,
  pillId,
  pillTitle,
  mode = 'GUIDED',
  onClose,
  onCompleted,
  onOpenPill,
}) {
  const currentPillId = pill?.id || pillId;
  const currentPillTitle = pill?.title || pillTitle || 'Práctica Pedagógica';
  const isGuided = mode === 'GUIDED';

  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [goals, setGoals] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState('');

  // Intro states (Captura 5 & 7)
  const introStorageKey = `trimia_hide_intro_${mode}`;
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(introStorageKey));
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Trimi interactive state in guided panel
  const [trimiMood, setTrimiMood] = useState('habla');
  const [trimiSpeech, setTrimiSpeech] = useState(
    '¡Mucho éxito! Seguí los objetivos a tu ritmo. Si te trabás, acá tenés el botón para pedir pista.'
  );
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll al final del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Inicializar o reiniciar la sesión de simulación
  const initSimulation = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setHintsUsed(0);
    setTrimiMood('habla');
    setTrimiSpeech(
      '¡Mucho éxito! Seguí los objetivos a tu ritmo. Si te trabás, acá tenés el botón para pedir pista.'
    );
    try {
      if (!currentPillId) {
        setError('No se especificó la lección formativa.');
        return;
      }
      const data = await startSimulation(token, currentPillId, mode);
      setSession(data);
      setMessages(data.messages || []);
      setGoals(data.goals || []);
      if (data.feedback) setFeedback(data.feedback);
    } catch (err) {
      setError(err.message || 'Error al iniciar la simulación');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initSimulation();
  }, [token, currentPillId, mode]);

  const handleStartFromIntro = () => {
    if (dontShowAgain) {
      localStorage.setItem(introStorageKey, 'true');
    }
    setShowIntro(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || sending || !session || feedback) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setError('');

    // Mensaje temporal de empleado para respuesta inmediata
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
      const newMessages = [
        res.employeeMessage,
        res.clientMessage,
      ].filter(Boolean);

      // Chequear objetivos cumplidos en este turno para festejar y alertar en el chat
      if (res.updatedGoals && isGuided) {
        const newlyAchieved = res.updatedGoals.filter(
          (newG) => newG.isCompleted && !goals.some((oldG) => oldG.id === newG.id && oldG.isCompleted)
        );

        if (newlyAchieved.length > 0) {
          setTrimiMood('festeja');
          setTrimiSpeech(
            `¡Excelente! Cumpliste: «${newlyAchieved[0].description}». ¡Seguí así!`
          );

          // Aviso de hito en el stream de chat
          const milestoneItems = newlyAchieved.map((g) => ({
            id: `milestone-${g.id}-${Date.now()}`,
            isMilestone: true,
            content: `Objetivo cumplido: ${g.description}`,
            createdAt: new Date().toISOString(),
          }));

          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            ...newMessages,
            ...milestoneItems,
          ]);

          setTimeout(() => {
            setTrimiMood('habla');
          }, 4500);
        } else {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            ...newMessages,
          ]);
        }
        setGoals(res.updatedGoals);
      } else {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          ...newMessages,
        ]);
        if (res.updatedGoals) {
          setGoals(res.updatedGoals);
        }
      }
    } catch (err) {
      setError(err.message || 'Error al enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  const handleRequestHint = async () => {
    if (hintLoading || !session) return;
    const pendingGoal = goals.find((g) => !g.isCompleted);
    setHintLoading(true);
    setTrimiMood('piensa');
    setTrimiSpeech('Dejame pensar una sugerencia que te oriente...');

    try {
      const res = await requestSimulationHint(token, session.id, pendingGoal?.description);
      setHintsUsed((prev) => prev + 1);
      setTrimiMood('habla');
      setTrimiSpeech(
        res.hint ||
          'Recordá consultar si el cliente tiene alguna duda con el valor de la cuota antes de cerrar la operación.'
      );
    } catch (err) {
      setTrimiMood('habla');
      setTrimiSpeech(
        'Verificá que el cliente esté registrado en el sistema y confirmá qué producto busca financiar.'
      );
    } finally {
      setHintLoading(false);
    }
  };

  const handleConclude = async () => {
    const employeeMsgsCount = messages.filter((m) => m.sender === 'EMPLOYEE').length;
    if (employeeMsgsCount < 2) {
      alert(
        isGuided
          ? 'Tenés que interactuar al menos 2 turnos con el cliente antes de finalizar la práctica.'
          : 'Tenés que interactuar al menos 2 turnos con el cliente antes de finalizar la simulación.'
      );
      return;
    }
    const confirmMsg = isGuided
      ? '¿Deseás finalizar la práctica y recibir tu devolución pedagógica?'
      : '¿Deseás finalizar la simulación y recibir tu devolución pedagógica?';
    if (!confirm(confirmMsg)) return;

    setConcluding(true);
    setError('');
    try {
      const fb = await concludeSimulation(token, session.id);
      setFeedback(fb);
      if (onCompleted) onCompleted();
    } catch (err) {
      setError(err.message || (isGuided ? 'Error al concluir la práctica' : 'Error al concluir la simulación'));
    } finally {
      setConcluding(false);
    }
  };

  const getBandBadge = (band) => {
    switch (band) {
      case 'ACHIEVED':
        return { label: 'Logrado', bg: '#ecfdf5', color: '#05968d', border: '#a7f3ee' };
      case 'NEEDS_IMPROVEMENT':
        return { label: 'A mejorar', bg: '#eef5fc', color: '#2b6fc0', border: '#cfe0f3' };
      case 'NOT_ACHIEVED':
        return { label: 'No logrado', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
      default:
        return { label: band || 'Completado', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    }
  };

  const getInitials = (name) => {
    if (!name) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatEmotion = (emotion) => {
    if (!emotion || emotion.toLowerCase() === 'neutral') return 'calma';
    return emotion.toLowerCase();
  };

  const completedGoalsCount = goals.filter((g) => g.isCompleted).length;
  const missedGoals = goals.filter((g) => !g.isCompleted);
  const lastCustomerMessage = [...messages].reverse().find((m) => m.sender === 'CLIENT');
  const finalEmotion = formatEmotion(lastCustomerMessage?.emotion);

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{
          maxWidth: feedback ? 920 : isGuided ? 1040 : 780,
          width: '95vw',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Encabezado del Modal */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            flexWrap: 'nowrap',
            gap: 16,
            minHeight: 68,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
              <TrainingIcon
                type={isGuided ? 'compass' : 'simulation'}
                size={20}
                style={{ color: '#2b6fc0' }}
              />
              <h3
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  fontFamily: 'Lexend, sans-serif',
                  color: '#0f172a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isGuided ? 'Práctica Guiada' : 'Simulación Libre'} — {currentPillTitle}
              </h3>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: isGuided ? '#eef5fc' : '#f1f5f9',
                  color: isGuided ? '#2b6fc0' : '#475569',
                  border: isGuided ? '1px solid #cfe0f3' : '1px solid #cbd5e1',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {isGuided ? 'Checklist en vivo' : 'Sin asistencias'}
              </span>
            </div>
            {session && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Cliente: <b>{session.customerName}</b> · Caso: {session.scenarioTitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {/* Botón de ayuda '?' para ver la presentación del modo */}
            {!feedback && (
              <button
                type="button"
                onClick={() => setShowIntro(true)}
                title="Ver presentación del modo"
                aria-label="Ver presentación del modo"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                  transition: 'all 0.15s ease',
                }}
              >
                <TrainingIcon type="help" size={16} />
              </button>
            )}

            {!feedback && !showIntro && session && (
              <button
                type="button"
                onClick={handleConclude}
                disabled={concluding || messages.filter((m) => m.sender === 'EMPLOYEE').length < 2}
                style={{
                  background: '#2b6fc0',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  minHeight: 40,
                }}
              >
                <TrainingIcon type="flag" size={15} />
                <span>
                  {concluding
                    ? 'Evaluando...'
                    : isGuided
                    ? 'Finalizar práctica'
                    : 'Finalizar simulación'}
                </span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Cerrar modal"
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 6,
                minWidth: 44,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Cuerpo del Modal */}
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 32 }}>🤖</div>
            <p style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              Preparando al cliente simulado y el escenario de práctica...
            </p>
          </div>
        ) : error && !session ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p className="error">{error}</p>
            <button className="secondary" onClick={onClose} style={{ marginTop: 12 }}>
              Cerrar
            </button>
          </div>
        ) : showIntro && !feedback ? (
          /* ========================================================================
             1. INTRO DE CADA MODO (Capturas 5 y 7)
             ======================================================================== */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              padding: '28px 36px',
              overflowY: 'auto',
            }}
          >
            <div style={{ flex: 1, display: 'flex', gap: 32, alignItems: 'center' }}>
              {/* Tarjeta izquierda con Trimi */}
              <div
                style={{
                  width: 260,
                  height: 290,
                  background: '#eef5fc',
                  border: '1px solid #cfe0f3',
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trimi outfit="capacitacion" size={130} />
              </div>

              {/* Contenido derecho de la intro */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#2b6fc0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    Trimi
                  </div>
                  {/* Globo de diálogo */}
                  <div
                    style={{
                      background: '#eef5fc',
                      border: '1px solid #cfe0f3',
                      borderRadius: 12,
                      padding: '16px 20px',
                      fontSize: 14.5,
                      color: '#17305a',
                      lineHeight: 1.6,
                      textAlign: 'justify',
                      hyphens: 'auto',
                    }}
                  >
                    {isGuided ? (
                      <>
                        ¡Te doy la bienvenida a la práctica guiada! Vas a atender a{' '}
                        <b>{session?.customerName || 'un cliente'}</b>, un caso real de atención
                        comercial. A la derecha vas a tener los objetivos: se tildan solos a medida que los
                        cumplís. Si te trabás, tocá «Pedir pista» y te oriento.
                      </>
                    ) : (
                      <>
                        ¡Llegó la hora de demostrar lo aprendido! Vas a interactuar con{' '}
                        <b>{session?.customerName || 'el cliente'}</b> en una conversación realista,
                        exactamente como en tu puesto de trabajo. Esta vez no vas a tener pistas ni objetivos
                        a la vista. Al terminar, te voy a dar una devolución completa con lo que hiciste bien y
                        lo que podés ajustar.
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h4
                    style={{
                      margin: '10px 0 8px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#0f172a',
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    {isGuided ? 'Lo que vas a practicar' : 'Competencias que se evaluarán'}
                  </h4>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {goals.length > 0 ? (
                      goals.map((g, idx) => (
                        <div
                          key={g.id || idx}
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 13,
                            color: '#334155',
                            fontWeight: 500,
                            lineHeight: 1.4,
                          }}
                        >
                          {g.description}
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          padding: '10px 14px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          fontSize: 13,
                          color: '#334155',
                        }}
                      >
                        Identificar necesidades y registrar datos del cliente
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Barra inferior de la intro */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 18,
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: '#64748b',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                No volver a mostrar esta presentación
              </label>

              <button
                type="button"
                onClick={handleStartFromIntro}
                style={{
                  background: '#2b6fc0',
                  color: '#ffffff',
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: 44,
                  boxShadow: '0 2px 4px rgba(43, 111, 192, 0.2)',
                }}
              >
                {isGuided ? 'Empezar práctica' : 'Empezar simulación'}
              </button>
            </div>
          </div>
        ) : feedback ? (
          /* ========================================================================
             4. DEVOLUCIÓN DE TRIMI AL TERMINAR (Captura 8)
             ======================================================================== */
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8fafc' }}>
            <div style={{ maxWidth: 840, margin: '0 auto' }}>
              {/* Tarjeta de bienvenida / Trimi Feedback Hero */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cfe0f3',
                  borderRadius: 14,
                  padding: '24px',
                  marginBottom: 20,
                  display: 'flex',
                  gap: 24,
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <Trimi
                    mood={feedback.band === 'ACHIEVED' ? 'festeja' : 'habla'}
                    size={105}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 14,
                        fontWeight: 700,
                        padding: '4px 14px',
                        borderRadius: 16,
                        background: getBandBadge(feedback.band).bg,
                        color: getBandBadge(feedback.band).color,
                        border: `1px solid ${getBandBadge(feedback.band).border}`,
                      }}
                    >
                      Banda: {getBandBadge(feedback.band).label}
                    </span>

                    <span className="customer-mood-chip" style={{ fontSize: 12.5 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#cbd5e1',
                          color: '#1e293b',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {getInitials(session?.customerName)}
                      </span>
                      Ánimo final del cliente: <b>{finalEmotion}</b>
                    </span>
                  </div>

                  <div
                    style={{
                      background: '#eef5fc',
                      border: '1px solid #cfe0f3',
                      borderRadius: 10,
                      padding: '14px 18px',
                      fontSize: 14,
                      color: '#17305a',
                      lineHeight: 1.5,
                      textAlign: 'justify',
                      hyphens: 'auto',
                    }}
                  >
                    {feedback.summary ||
                      '¡Buen trabajo! Practicar con clientes simulados te prepara para resolver situaciones reales con soltura y seguridad.'}
                  </div>
                </div>
              </div>

              {/* Métricas de objetivos: cumplidos y qué faltó */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '18px 22px',
                  marginBottom: 20,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#0f172a',
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    Objetivos cumplidos: {completedGoalsCount} de {goals.length}
                  </h4>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {goals.length > 0
                      ? `${Math.round((completedGoalsCount / goals.length) * 100)}% de logro`
                      : ''}
                  </span>
                </div>

                {/* Lista de objetivos con estado */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {goals.map((g, idx) => (
                    <div
                      key={g.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: g.isCompleted ? '#065f5a' : '#475569',
                      }}
                    >
                      <TrainingIcon
                        type={g.isCompleted ? 'check' : 'clock'}
                        size={15}
                        style={{ color: g.isCompleted ? '#05968d' : '#94a3b8' }}
                      />
                      <span
                        style={{
                          textDecoration: g.isCompleted ? 'none' : 'none',
                          fontWeight: g.isCompleted ? 600 : 400,
                        }}
                      >
                        {g.description}
                      </span>
                    </div>
                  ))}
                </div>

                {missedGoals.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: '#92400e',
                    }}
                  >
                    <b>Qué faltó:</b> No se registraron evidencias completas para{' '}
                    {missedGoals.map((mg) => `«${mg.description}»`).join(', ')}.
                  </div>
                )}
              </div>

              {/* 3 Tarjetas Cualitativas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. Qué hizo bien */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #bbf7f3',
                    borderLeft: '5px solid #10b9af',
                    borderRadius: 10,
                    padding: '16px 20px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px',
                      fontSize: 14.5,
                      color: '#065f5a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    <TrainingIcon type="star" size={16} style={{ color: '#10b9af' }} /> Qué hiciste
                    bien
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: '#1e293b',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {feedback.whatWentWell}
                  </p>
                </div>

                {/* 2. A mejorar */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cfe0f3',
                    borderLeft: '5px solid #2b6fc0',
                    borderRadius: 10,
                    padding: '16px 20px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px',
                      fontSize: 14.5,
                      color: '#17305a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    <TrainingIcon type="lightbulb" size={16} style={{ color: '#2b6fc0' }} /> Aspectos
                    a mejorar
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: '#1e293b',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {feedback.toImprove}
                  </p>
                </div>

                {/* 3. Reglas del negocio */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '5px solid #64748b',
                    borderRadius: 10,
                    padding: '16px 20px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px',
                      fontSize: 14.5,
                      color: '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    <TrainingIcon type="scale" size={16} style={{ color: '#64748b' }} /> Reglas del
                    negocio y políticas
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: '#1e293b',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {feedback.businessRules}
                  </p>
                </div>
              </div>

              {/* Botón para repasar la píldora si lo necesita */}
              {onOpenPill && (
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onOpenPill(pill)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2b6fc0',
                      fontSize: 13.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <TrainingIcon type="book" size={15} />
                    <span>Repasar píldora: {currentPillTitle}</span>
                  </button>
                </div>
              )}

              {/* Botones de acción inferiores */}
              <div
                style={{
                  marginTop: 24,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 14,
                }}
              >
                <button
                  type="button"
                  onClick={initSimulation}
                  style={{
                    background: '#ffffff',
                    color: '#2b6fc0',
                    border: '1px solid #2b6fc0',
                    padding: '10px 22px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <TrainingIcon type="refresh" size={16} />
                  <span>Repetir simulación</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#2b6fc0',
                    color: '#ffffff',
                    padding: '10px 24px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    border: 'none',
                    cursor: 'pointer',
                    minHeight: 44,
                    boxShadow: '0 2px 4px rgba(43, 111, 192, 0.2)',
                  }}
                >
                  Volver a mi ruta
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================
             2. PANTALLA PRINCIPAL DE SIMULACIÓN Y CHAT (Captura 6)
             ======================================================================== */
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Columna Izquierda: Chat interactivo */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: '#f8fafc',
                borderRight: isGuided ? '1px solid #e2e8f0' : 'none',
              }}
            >
              {/* Mensajes del chat */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {messages.map((m, idx) => {
                  if (m.isMilestone) {
                    return (
                      <div
                        key={m.id || idx}
                        style={{
                          alignSelf: 'center',
                          margin: '6px 0',
                          padding: '6px 16px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3ee',
                          borderRadius: 20,
                          color: '#065f5a',
                          fontSize: 12.5,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <TrainingIcon type="check" size={15} style={{ color: '#05968d' }} />
                        <span>{m.content}</span>
                      </div>
                    );
                  }

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
                      {isUser ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#64748b',
                            marginBottom: 3,
                            fontWeight: 500,
                          }}
                        >
                          Vos (Empleado)
                        </span>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: '#e2e8f0',
                              color: '#1e293b',
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                            aria-hidden="true"
                          >
                            {getInitials(session?.customerName)}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                            {session?.customerName || 'Cliente'}
                          </span>
                          <span className="customer-mood-chip">
                            Ánimo: {formatEmotion(m.emotion)}
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          background: isUser ? '#2b6fc0' : '#ffffff',
                          color: isUser ? '#ffffff' : '#0f172a',
                          padding: '11px 16px',
                          borderRadius: isUser ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          fontSize: 14,
                          lineHeight: 1.5,
                          border: isUser ? 'none' : '1px solid #e2e8f0',
                          textAlign: isUser ? 'left' : 'justify',
                          hyphens: 'auto',
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}

                {sending && (
                  <div
                    style={{
                      alignSelf: 'flex-start',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      background: '#ffffff',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {session?.customerName || 'El cliente'} está escribiendo...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Barra de input del chat */}
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
                  placeholder="Escribí tu respuesta…"
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
                    minHeight: 44,
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  style={{
                    background: '#2b6fc0',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    minHeight: 44,
                    minWidth: 80,
                  }}
                >
                  {sending ? '...' : 'Enviar'}
                </button>
              </form>
            </div>

            {/* Columna Derecha: Checklist en vivo + Trimi y Pistas (solo en modo GUIDED) */}
            {isGuided && (
              <div
                style={{
                  width: 350,
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  padding: '20px',
                }}
              >
                {/* Trimi Card con mensaje dinámico */}
                <div
                  style={{
                    background: '#eef5fc',
                    border: '1px solid #cfe0f3',
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Trimi mood={trimiMood} size={62} />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      fontSize: 12.5,
                      color: '#17305a',
                      lineHeight: 1.45,
                      textAlign: 'justify',
                      hyphens: 'auto',
                    }}
                  >
                    {trimiSpeech}
                  </div>
                </div>

                {/* Botón Pedir pista */}
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={handleRequestHint}
                    disabled={hintLoading || goals.every((g) => g.isCompleted)}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      background: '#ffffff',
                      border: '1px solid #2b6fc0',
                      borderRadius: 8,
                      color: '#2b6fc0',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      minHeight: 44,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <TrainingIcon type="lightbulb" size={16} />
                    <span>{hintLoading ? 'Pensando pista...' : 'Pedir pista'}</span>
                    {hintsUsed > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          background: '#eef5fc',
                          color: '#2b6fc0',
                          padding: '2px 7px',
                          borderRadius: 10,
                          fontWeight: 700,
                        }}
                      >
                        {hintsUsed}
                      </span>
                    )}
                  </button>
                </div>

                {/* Encabezado de objetivos */}
                <div style={{ marginBottom: 12 }}>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#0f172a',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
                    <TrainingIcon type="clipboard" size={15} style={{ color: '#2b6fc0' }} /> Objetivos
                    de la práctica
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    Se tildan automáticamente conforme avanzás:
                  </p>
                </div>

                {/* Lista de objetivos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {goals.map((g, idx) => (
                    <div
                      key={g.id || idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: g.isCompleted ? '#ecfdf5' : '#f8fafc',
                        border: g.isCompleted ? '1px solid #a7f3ee' : '1px solid #e2e8f0',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>
                          {g.isCompleted ? (
                            <TrainingIcon type="check" size={16} style={{ color: '#05968d' }} />
                          ) : (
                            <TrainingIcon type="clock" size={16} style={{ color: '#94a3b8' }} />
                          )}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: g.isCompleted ? '#065f5a' : '#334155',
                              lineHeight: 1.4,
                            }}
                          >
                            {g.description}
                          </div>
                          {g.evidence && (
                            <div
                              style={{
                                fontSize: 11,
                                color: '#05968d',
                                marginTop: 4,
                                fontStyle: 'italic',
                              }}
                            >
                              "{g.evidence}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Perfil del caso para referencia */}
                <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                  <h5
                    style={{
                      margin: '0 0 6px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      fontFamily: 'Lexend, sans-serif',
                    }}
                  >
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
