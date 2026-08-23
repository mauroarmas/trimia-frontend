import { useEffect, useState } from 'react';
import {
  listEscalations,
  getEscalation,
  getConversation,
  resolveEscalation,
  getKnowledgeCandidates,
  previewCorrection,
  getEscalationSuggestion,
  saveEscalationUnsent,
  discardEscalation,
  delegateEscalation,
  listEmployees,
  getEmployee,
  listSectors,
} from '../api';
import ConversationControls from './ConversationControls';
import {
  etiquetaDeCandidato,
  motivoDeBloqueo,
  ordenarCandidatos,
  puedeEscribirEn,
} from '../areas';

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

  /**
   * De qué áreas es responsable quien está resolviendo (spec 005).
   *
   * Resolver un caso "enseñándole al agente" **escribe un documento**, así que vale
   * la misma regla de área que la pantalla de conocimiento. Es la puerta que se
   * olvida: se llega por la cola de casos, no por la base de conocimiento.
   */
  const [misAreas, setMisAreas] = useState(null);
  const [totalAreas, setTotalAreas] = useState(0);

  // Propuesta de respuesta (US3). `null` = todavía no se pidió.
  // Spec 007: corregir el documento que quedó corto, en vez de crear otro que
  // compita con él. `candidates` sale del caso; `correction` es la propuesta
  // que todavía NO se guardó.
  const [candidates, setCandidates] = useState(null);
  const [correctDocId, setCorrectDocId] = useState('');
  const [correction, setCorrection] = useState(null);
  const [correcting, setCorrecting] = useState(false);

  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [discardReason, setDiscardReason] = useState('');

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

  useEffect(() => {
    if (!me) return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, sectores]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
        setTotalAreas(sectores.length);
      })
      // Que falle no puede romper la cola: sin esto no se anticipa el bloqueo,
      // y el backend igual rechaza.
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token, me]);

  async function openCase(escalation) {
    setSuggestion(null);
    setDiscardReason('');
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
    setCandidates(null);
    setCorrectDocId('');
    setCorrection(null);
    try {
      const [escDetail, conv] = await Promise.all([
        getEscalation(token, escalation.id),
        getConversation(token, escalation.conversationId),
      ]);
      setSelected(escDetail);
      setConversation(conv);
      // Los candidatos se piden aparte: si fallan, el caso igual se puede
      // resolver como siempre. Es información de más, no un requisito.
      try {
        setCandidates(await getKnowledgeCandidates(token, escalation.id));
      } catch {
        setCandidates([]);
      }
    } catch (err) {
      setActionError(err.message);
    }
  }

  /**
   * Pide la propuesta de corrección. NO guarda nada: se aprueba recién al
   * resolver, mandando el texto que quede en el editor.
   */
  async function handleCorrectionPreview(documentId) {
    if (!replyMessage.trim()) {
      setActionError('Escribí primero la respuesta: de ahí sale la corrección.');
      return;
    }
    setCorrecting(true);
    setActionError('');
    try {
      const prev = await previewCorrection(token, selected.id, {
        documentId,
        message: replyMessage,
      });
      setCorrectDocId(documentId);
      setCorrection(prev);
      // Corregir y crear son excluyentes: el backend rechaza pedir las dos.
      setTeachAgent(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setCorrecting(false);
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
        // Se manda el texto del editor, que pudo corregirse a mano después de
        // ver la propuesta: es lo que el supervisor aprueba, no lo que
        // propuso el modelo.
        correctKnowledge: correction
          ? {
              documentId: correctDocId,
              baseVersion: correction.baseVersion,
              content: correction.proposedContent,
            }
          : undefined,
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

  /**
   * Pide la propuesta y la precarga en el editor. NO resuelve el caso: sigue
   * PENDING, y lo que se envíe será siempre lo que quede en el textarea.
   */
  async function handleSuggest() {
    setSuggesting(true);
    setActionError('');
    try {
      const s = await getEscalationSuggestion(token, selected.id);
      setSuggestion(s);
      if (s.suggestion) setReplyMessage(s.suggestion);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSuggesting(false);
    }
  }

  /** Aprobar y guardar SIN enviar: no le llega nada al usuario. */
  async function handleSaveUnsent() {
    if (!knowledgeTitle.trim() || !knowledgeCategory.trim()) {
      setActionError('Para guardar sin enviar hacen falta título y categoría: la respuesta se incorpora al conocimiento.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await saveEscalationUnsent(token, selected.id, {
        message: replyMessage,
        title: knowledgeTitle,
        category: knowledgeCategory,
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

  /** Descartar: sin mensaje y sin ingesta. */
  async function handleDiscard() {
    if (!confirm('¿Descartar el caso? El usuario no va a recibir respuesta y no se incorpora nada al conocimiento.')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await discardEscalation(token, selected.id, discardReason || undefined);
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

  /**
   * En qué área va a quedar el documento si se marca "enseñar al RAG".
   *
   * Es la misma cuenta que hace el backend: el agente elegido a mano, y si no se
   * eligió ninguno, el de la conversación. Por eso "— sin especificar —" NO
   * significa "documento general": significa "el del caso".
   */
  const areaDelDocumento =
    knowledgeAgentType || conversation?.currentAgent || null;
  const puedeEnsenar =
    misAreas === null || puedeEscribirEn(misAreas, totalAreas, areaDelDocumento);
  const motivoNoEnsena =
    misAreas === null
      ? ''
      : motivoDeBloqueo(misAreas, totalAreas, areaDelDocumento);

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

              <div style={{ marginBottom: 12 }}>
                <button type="button" className="secondary" onClick={handleSuggest} disabled={suggesting}>
                  {suggesting ? 'Redactando…' : 'Proponer respuesta con la base de conocimiento'}
                </button>
                {suggestion && <SuggestionPanel suggestion={suggestion} />}
              </div>

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
                {/*
                  Spec 007 — corregir en vez de duplicar.

                  Va ARRIBA de "enseñar al RAG" a propósito: cuando el caso
                  escaló porque un documento quedó corto, crear otro sobre el
                  mismo tema hace que los dos se repartan la señal y ninguno
                  gane. El propio aviso de baja confianza ya se lo dice al
                  supervisor; hasta esta spec no había forma de hacerlo.
                */}
                {candidates && candidates.length > 0 && (
                  <div className="panel-section">
                    <strong>Documentos que quedaron cortos en este caso</strong>
                    <p className="hint">
                      Si alguno es el tema y le faltó información, conviene
                      <strong> corregir ese</strong> en vez de crear uno nuevo:
                      dos documentos parecidos se compiten entre sí y las
                      respuestas salen peor.
                    </p>
                    <table>
                      <thead>
                        <tr><th>Cercanía</th><th>Documento</th><th></th></tr>
                      </thead>
                      <tbody>
                        {candidates.map((c) => (
                          <tr key={c.id}>
                            <td>{c.score.toFixed(1)}%</td>
                            <td>
                              {c.title}
                              {/* Los de otras áreas se muestran igual: saber que
                                  existe algo cercano es lo que evita duplicarlo.
                                  Lo que se bloquea es corregirlo. */}
                              {!c.corregible && (
                                <div className="hint" title={c.motivoSiNo}>
                                  solo lectura — {c.motivoSiNo}
                                </div>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                disabled={!c.corregible || correcting}
                                onClick={() => handleCorrectionPreview(c.id)}
                              >
                                {correctDocId === c.id && correction
                                  ? 'Ver de nuevo'
                                  : 'Corregir este'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {correction && (
                      <div style={{ marginTop: 12 }}>
                        {/* `confident: false` = el modelo no pudo determinar qué
                            tocar. No hay propuesta que aprobar: conviene crear
                            un documento nuevo. */}
                        {!correction.confident ? (
                          <p className="error">{correction.summary}</p>
                        ) : (
                          <>
                            <p className="hint">
                              <strong>Propuesta:</strong> {correction.summary}
                              {' · '}versión base {correction.baseVersion}
                            </p>
                            <div className="field">
                              <label>
                                Cómo quedaría el documento (editable — se guarda
                                esto, no lo que propuso la IA)
                              </label>
                              <textarea
                                rows={8}
                                value={correction.proposedContent}
                                onChange={(e) =>
                                  setCorrection({
                                    ...correction,
                                    proposedContent: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <p className="hint">
                              Al responder el caso se envía el mensaje al cliente
                              <strong> y</strong> se guarda esta corrección.
                              Todavía no se guardó nada.
                            </p>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setCorrection(null);
                                setCorrectDocId('');
                              }}
                            >
                              Cancelar la corrección
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="teachAgent"
                    checked={teachAgent && puedeEnsenar && !correction}
                    onChange={(e) => setTeachAgent(e.target.checked)}
                    disabled={!puedeEnsenar || !!correction}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="teachAgent" style={{ margin: 0 }}>
                    Enseñar esta respuesta al RAG (queda como conocimiento reutilizable)
                    {correction && (
                      <span className="hint">
                        {' '}— deshabilitado: ya elegiste corregir un documento
                        existente. Son excluyentes.
                      </span>
                    )}
                  </label>
                </div>

                {/* La distinción que no se puede aplastar: RESPONDER no está
                    restringido por área, ESCRIBIR conocimiento sí. Quien recibe
                    un caso de otra área puede contestarlo igual; lo único que no
                    puede es dejar el documento. Deshabilitar el caso entero sería
                    quitarle algo que sí puede hacer. */}
                {!puedeEnsenar && (
                  <p className="hint" style={{ marginTop: -4 }}>
                    {motivoNoEnsena} Podés responder el caso igual — lo único que no
                    podés es dejar la respuesta como conocimiento de esa área.
                  </p>
                )}

                {teachAgent && puedeEnsenar && (
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
                        <label>Área del documento</label>
                        <select value={knowledgeAgentType} onChange={(e) => setKnowledgeAgentType(e.target.value)}>
                          <option value="">
                            {conversation?.currentAgent
                              ? `— la del caso (${conversation.currentAgent}) —`
                              : '— sin área (transversal) —'}
                          </option>
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

              {/* Los otros dos cierres. Van juntos y con la diferencia
                  explicada porque las tres acciones son terminales: elegir
                  mal no se deshace. */}
              <div className="panel-section" style={{ marginTop: 16 }}>
                <h4>Otras formas de cerrar el caso</h4>

                <p className="hint">
                  <strong>Guardar sin enviar:</strong> no le llega nada al
                  usuario, pero la respuesta queda como conocimiento para la
                  próxima vez. Sirve cuando la consulta ya se resolvió por otra
                  vía (llamó, lo atendieron en el local).
                  {!puedeEnsenar && (
                    <>
                      {' '}
                      <strong>No disponible acá:</strong> {motivoNoEnsena} Esta
                      acción es solo escritura, así que sin el área no queda nada
                      que hacer con ella.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleSaveUnsent}
                  disabled={actionBusy || !replyMessage.trim() || !puedeEnsenar}
                  title={puedeEnsenar ? undefined : motivoNoEnsena}
                >
                  Guardar sin enviar
                </button>
                <span className="hint" style={{ marginLeft: 8 }}>
                  Usa el mismo texto y los campos de título/categoría de arriba.
                </span>

                <p className="hint" style={{ marginTop: 16 }}>
                  <strong>Descartar:</strong> ni respuesta ni conocimiento. Para
                  una consulta puntual que no amerita una respuesta estándar.
                </p>
                <div className="field">
                  <label>Motivo (opcional, pero queda registrado)</label>
                  <input
                    value={discardReason}
                    onChange={(e) => setDiscardReason(e.target.value)}
                    placeholder="ej. consulta puntual, ya se resolvió en el local"
                  />
                </div>
                <button type="button" className="secondary" onClick={handleDiscard} disabled={actionBusy}>
                  Descartar caso
                </button>
              </div>

              <h4 style={{ marginTop: 16 }}>Delegar a otro supervisor</h4>
              <form onSubmit={handleDelegate}>
                <div className="field-row">
                  <div className="field">
                    <select value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
                      <option value="">— elegir supervisor —</option>
                      {/* Primero quien maneja el área del caso, con ★. Se puede
                          elegir a otro —responder no está restringido por área—
                          pero no por no saber quién correspondía. */}
                      {ordenarCandidatos(
                        employees.filter((e) => e.id !== me.id),
                        conversation?.currentAgent ?? null,
                      ).map((e) => (
                        <option key={e.id} value={e.id}>
                          {etiquetaDeCandidato(e, conversation?.currentAgent ?? null)}
                        </option>
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
              {/*
                Spec 007 — cómo se capitalizó el conocimiento, si se capitalizó.
                `resolvedWithAction` es null en el caso de siempre (se creó un
                documento nuevo con "enseñar al RAG", o no se enseñó nada): ahí
                no hay nada más que mostrar.
              */}
              {selected.resolvedWithAction === 'CORRECTED' && (
                <p className="hint">
                  Se corrigió «{selected.resolvedWithDocument?.title}» en vez de
                  crear un documento nuevo.
                </p>
              )}
              {selected.resolvedWithAction === 'REUSED' && (
                <p className="hint">
                  El contenido ya existía como «{selected.resolvedWithDocument?.title}»:
                  no se creó un documento nuevo.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Resultado de la propuesta de respuesta (US3).
 *
 * Muestra tres cosas que no son decorativas:
 *
 * - **`audienceUsed`**: la propuesta se redacta con el conocimiento que le
 *   corresponde a QUIEN VA A RECIBIRLA, no al supervisor que la pide. Verlo es
 *   lo que permite notar si algo salió mal.
 * - **las fuentes**: para poder verificar de dónde salió cada afirmación antes
 *   de mandarla, en vez de confiar en el texto porque sí.
 * - **el motivo cuando no hay contexto**: el sistema no inventa una respuesta
 *   sin respaldo; dice por qué no puede y el supervisor la escribe.
 */
function SuggestionPanel({ suggestion }) {
  if (!suggestion.hasContext) {
    return (
      <div className="error" style={{ marginTop: 12 }}>
        <p><strong>No hay con qué redactar una propuesta.</strong></p>
        <p className="hint">{suggestion.reason}</p>
        <p className="hint">
          Se buscó con audiencia <strong>{suggestion.audienceUsed}</strong>, que
          es la que le corresponde a esta conversación.
        </p>
      </div>
    );
  }

  return (
    <div className="success-msg" style={{ marginTop: 12 }}>
      <p>
        Propuesta cargada en el mensaje de abajo. <strong>Es editable</strong>:
        se envía lo que quede escrito ahí, no la propuesta original.
      </p>
      <p className="hint">
        Redactada con conocimiento{' '}
        <span className={`badge ${suggestion.audienceUsed === 'INTERNO' ? 'status-warning' : 'status-idle'}`}>
          {suggestion.audienceUsed}
        </span>{' '}
        — la audiencia de esta conversación, no la tuya.
      </p>
      {suggestion.sources?.length > 0 && (
        <>
          <p className="hint" style={{ marginBottom: 4 }}>Se usó:</p>
          <ul className="hint" style={{ marginTop: 0 }}>
            {suggestion.sources.map((s) => (
              <li key={s.documentId}>{s.title} ({s.score}%)</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
