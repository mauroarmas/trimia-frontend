import { useEffect, useRef, useState } from 'react';
import {
  listEscalations,
  getEscalation,
  getConversation,
  getFinancingDraft,
  completeFinancingDraft,
  resolveEscalation,
  getKnowledgeCandidates,
  getKnowledgeDoc,
  getEscalationSuggestion,
  saveEscalationUnsent,
  discardEscalation,
  delegateEscalation,
  listEmployees,
  getEmployee,
  listSectors,
  getEscalationHygieneWarning,
  getLatestHygieneScan,
  addInternalNote,
} from '../api';
import ConversationControls from './ConversationControls';
import FinancingDraftEditor from './FinancingDraftEditor';
import ConversationThread from './ConversationThread';
import {
  AGENT_META,
  contactInitials,
  formatEscalationReason,
  formatRelativeTime,
} from '../conversationHelpers';
import InfoNotes, { InfoToggle } from './InfoNotes';
import { HygienePairCard } from './KnowledgeHygiene';
import PageHero from './PageHero';
import {
  etiquetaDeCandidato,
  motivoDeBloqueo,
  ordenarCandidatos,
  puedeEscribirEn,
} from '../areas';

/**
 * Spec 013 — cómo se muestra la pertenencia de un caso.
 * `SIN_AREA` se distingue de `AJENA` para que los casos sin rutear no parezcan
 * responsabilidad de otro supervisor.
 */
function EtiquetaPertenencia({ valor }) {
  if (valor === 'PROPIA') {
    return null;
  }
  if (valor === 'SIN_AREA') {
    return (
      <span
        className="esc-belonging-pill is-sin-area"
        title="El caso no llegó a rutearse: cualquiera puede tomarlo"
      >
        Sin área
      </span>
    );
  }
  if (valor === 'AJENA') {
    return (
      <span
        className="esc-belonging-pill is-ajena"
        title="De un área que no supervisás, o derivado a otra persona"
      >
        Otra área
      </span>
    );
  }
  return null;
}

export default function EscalationsQueue({ token, me }) {
  const [status, setStatus] = useState('PENDING');
  // Spec 013 — apagado por defecto: el defecto es la cola completa, priorizada
  // pero sin filtrar.
  const [soloMios, setSoloMios] = useState(false);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [escalations, setEscalations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [conversation, setConversation] = useState(null);
  const detailRequestId = useRef(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const [replyMessage, setReplyMessage] = useState('');
  const [teachAgent, setTeachAgent] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeCategory, setKnowledgeCategory] = useState('');
  const [knowledgeAudience, setKnowledgeAudience] = useState('INTERNO');
  const [knowledgeAgentType, setKnowledgeAgentType] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [mostrarMasCierres, setMostrarMasCierres] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [priceDraft, setPriceDraft] = useState(null);
  const [confirmedPrice, setConfirmedPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const isPriceCase = selected?.reason?.startsWith('Financiación:') ?? false;
  useEffect(() => {
    let active = true;
    setPriceDraft(null); setConfirmedPrice(''); setPriceError('');
    if (isPriceCase && selected?.conversationId) {
      getFinancingDraft(token, selected.conversationId).then(d => {
        if (active) { setPriceDraft(d); setConfirmedPrice(d.confirmedAmount ?? ''); }
      }).catch(e => { if (active) setPriceError(e.message); });
    }
    return () => { active = false; };
  }, [token, selected?.id, isPriceCase]);


  /**
   * De qué áreas es responsable quien está resolviendo (spec 005).
   */
  const [misAreas, setMisAreas] = useState(null);
  const [totalAreas, setTotalAreas] = useState(0);

  // Spec 007: documentos que quedaron cortos en este caso.
  const [candidates, setCandidates] = useState(null);
  const [knowledgeMode, setKnowledgeMode] = useState('NUEVO');
  const [targetDocId, setTargetDocId] = useState('');
  const [targetDoc, setTargetDoc] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [applyMode, setApplyMode] = useState('AGREGAR');
  const [verActual, setVerActual] = useState(false);

  // Spec 008 (US3): documentos consultados en este caso que compiten entre sí.
  const [hygieneWarning, setHygieneWarning] = useState(null);

  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [discardReason, setDiscardReason] = useState('');

  async function loadQueue() {
    setLoading(true);
    setError('');
    try {
      const [escRes, empRes] = await Promise.all([
        listEscalations(token, {
          status,
          limit: 100,
          ...(soloMios ? { soloMios: true } : {}),
        }),
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
  }, [status, soloMios]);

  useEffect(() => {
    if (!me) return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, sectores]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
        setTotalAreas(sectores.length);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token, me]);

  async function openCase(escalation) {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setSuggestion(null);
    setDiscardReason('');
    setMostrarMasCierres(false);
    setSelected(escalation);
    setConversation(null);
    setInternalNote('');
    setNoteSaved(false);
    setActionError('');
    setReplyMessage('');
    setTeachAgent(false);
    setKnowledgeTitle('');
    setKnowledgeCategory('');
    setKnowledgeAudience('INTERNO');
    setKnowledgeAgentType('');
    setDelegateTo('');
    setCandidates(null);
    setKnowledgeMode('NUEVO');
    setTargetDocId('');
    setTargetDoc(null);
    setApplyMode('AGREGAR');
    setVerActual(false);
    setHygieneWarning(null);
    try {
      const [escDetail, conv] = await Promise.all([
        getEscalation(token, escalation.id),
        getConversation(token, escalation.conversationId),
      ]);
      if (requestId !== detailRequestId.current) return;
      setSelected(escDetail);
      setConversation(conv);
      try {
        const cands = await getKnowledgeCandidates(token, escalation.id);
        if (requestId !== detailRequestId.current) return;
        setCandidates(cands);
        if (cands.some((c) => c.corregible)) setKnowledgeMode('MODIFICAR');
      } catch {
        if (requestId === detailRequestId.current) setCandidates([]);
      }
      try {
        const w = await getEscalationHygieneWarning(token, escalation.id);
        if (requestId !== detailRequestId.current) return;
        if (w.pairs.length > 0) {
          const latest = await getLatestHygieneScan(token);
          if (requestId !== detailRequestId.current) return;
          const idsConAviso = new Set(w.pairs.map((p) => p.pairId));
          setHygieneWarning(
            (latest.pairs ?? []).filter((p) => idsConAviso.has(p.pairId)),
          );
        } else {
          setHygieneWarning([]);
        }
      } catch {
        if (requestId === detailRequestId.current) setHygieneWarning([]);
      }
    } catch (err) {
      if (requestId === detailRequestId.current) setActionError(err.message);
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }

  async function handleSelectTargetDoc(documentId) {
    setTargetDocId(documentId);
    setTargetDoc(null);
    setVerActual(false);
    if (!documentId) return;
    setLoadingDoc(true);
    setActionError('');
    try {
      setTargetDoc(await getKnowledgeDoc(token, documentId));
    } catch (err) {
      setActionError(err.message);
      setTargetDocId('');
    } finally {
      setLoadingDoc(false);
    }
  }

  async function refreshConversation() {
    const conv = await getConversation(token, selected.conversationId);
    setConversation(conv);
  }

  async function handleSaveInternalNote(e) {
    e.preventDefault();
    const content = internalNote.trim();
    if (!content || !selected) return;
    setActionBusy(true);
    setActionError('');
    setNoteSaved(false);
    try {
      await addInternalNote(token, selected.conversationId, content);
      setInternalNote('');
      setNoteSaved(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleResolve(e) {
    e.preventDefault();
    if (teachAgent && corrigiendo && !targetDoc) {
      setActionError('Elegí qué documento corregir, o pasá a «Documento nuevo».');
      return;
    }
    if (
      teachAgent &&
      !corrigiendo &&
      (!knowledgeTitle.trim() || !knowledgeCategory.trim())
    ) {
      setActionError('Título y categoría del conocimiento son obligatorios.');
      return;
    }
    if (isPriceCase && (!priceDraft || !(Number(confirmedPrice) > 0))) {
      setActionError('Ingresá el importe confirmado antes de resolver este caso.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    let priceSaved = false;
    try {
      if (isPriceCase) {
        const saved = await completeFinancingDraft(token, selected.conversationId, {
          expectedVersion: priceDraft.version,
          confirmedAmount: Number(confirmedPrice).toFixed(2),
          note: replyMessage.trim(),
        });
        setPriceDraft(saved);
        priceSaved = true;
      }
      await resolveEscalation(token, selected.id, {
        message: replyMessage,
        teachAgent: !isPriceCase && teachAgent && !corrigiendo,
        title: knowledgeTitle,
        category: knowledgeCategory,
        audience: knowledgeAudience || undefined,
        agentType: knowledgeAgentType || undefined,
        correctKnowledge:
          !isPriceCase && teachAgent && corrigiendo && targetDoc
            ? {
                documentId: targetDoc.id,
                baseVersion: targetDoc.version,
                content: replyMessage,
                applyMode,
              }
            : undefined,
      });
      setSelected(null);
      setConversation(null);
      await loadQueue();
    } catch (err) {
      setActionError(priceSaved ? `El importe quedó guardado, pero no se pudo resolver el caso: ${err.message}. Podés reintentar.` : err.message);
      if (isPriceCase && err.status === 409) {
        try { setPriceDraft(await getFinancingDraft(token, selected.conversationId)); } catch {}
      }
    } finally {
      setActionBusy(false);
    }
  }

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

  async function handleSaveUnsent() {
    if (!knowledgeTitle.trim() || !knowledgeCategory.trim()) {
      setActionError(
        corrigiendo
          ? 'Guardar sin enviar siempre crea un documento nuevo, así que pide título y categoría. Activá «Guardar en la Base de Conocimiento», pasá el selector a «Documento nuevo» y completalos.'
          : 'Para guardar sin enviar hacen falta título y categoría: activá «Guardar en la Base de Conocimiento» arriba para completarlos.',
      );
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

  async function handleDiscard() {
    if (
      !confirm(
        '¿Descartar el caso? El usuario no va a recibir respuesta y no se incorpora nada al conocimiento.',
      )
    ) {
      return;
    }
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

  const areaDelDocumento =
    knowledgeAgentType || conversation?.currentAgent || null;
  const puedeEnsenar =
    misAreas === null || puedeEscribirEn(misAreas, totalAreas, areaDelDocumento);
  const motivoNoEnsena =
    misAreas === null
      ? ''
      : motivoDeBloqueo(misAreas, totalAreas, areaDelDocumento);

  const corregibles = (candidates ?? []).filter((c) => c.corregible);
  const hayCorregibles = corregibles.length > 0;
  const corrigiendo = knowledgeMode === 'MODIFICAR';
  const puedeEnsenarAlgo = puedeEnsenar || hayCorregibles;

  const filteredEscalations = escalations.filter((e) => {
    if (selectedAreaFilter) {
      const matchArea =
        e.pertenencia === selectedAreaFilter ||
        e.conversation?.currentAgent === selectedAreaFilter;
      if (!matchArea) return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchReason = e.reason?.toLowerCase().includes(term);
      const matchClient = e.conversation?.externalId?.toLowerCase().includes(term);
      const matchChannel = e.conversation?.channel?.toLowerCase().includes(term);
      const areaName = e.conversation?.currentAgent
        ? AGENT_META[e.conversation.currentAgent]?.name?.toLowerCase() ?? ''
        : '';
      const matchAgent =
        e.conversation?.currentAgent?.toLowerCase().includes(term) ||
        areaName.includes(term);
      if (!matchReason && !matchClient && !matchChannel && !matchAgent) return false;
    }
    return true;
  });

  const totalCount = filteredEscalations.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalCount);
  const paginatedEscalations = filteredEscalations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const hasListFilters = Boolean(searchTerm || selectedAreaFilter || soloMios);

  function clearListFilters() {
    setSearchTerm('');
    setSelectedAreaFilter('');
    setSoloMios(false);
    setPage(1);
  }

  return (
    <div className="escalations-queue">
      {!selected && (
        <div className="escalations-list-view">
          <PageHero
            kicker="Atención humana"
            title="Casos escalados"
            description="Conversaciones derivadas por el asistente para revisión o respuesta de un supervisor."
            action={
              <>
                <InfoToggle
                  open={mostrarInfo}
                  onToggle={() => setMostrarInfo((v) => !v)}
                />
                <button
                  type="button"
                  className="knowledge-hero-action"
                  onClick={loadQueue}
                  disabled={loading}
                >
                  <span aria-hidden="true">↻</span>
                  <span>{loading ? 'Actualizando…' : 'Actualizar'}</span>
                </button>
              </>
            }
          />

          {mostrarInfo && (
            <InfoNotes
              title="Casos escalados"
              onClose={() => setMostrarInfo(false)}
              notes={[
                [
                  'Pendientes y resueltos.',
                  'Pendientes son las conversaciones que el asistente derivó y todavía esperan a una persona; resueltos, las que ya se cerraron.',
                ],
                [
                  'Solo mis áreas.',
                  'Oculta los casos de otras áreas. Los casos sin área asignada siguen apareciendo porque cualquiera puede tomarlos.',
                ],
                [
                  'Formas de cierre.',
                  'Podés enviar respuesta al contacto (enseñándole opcionalmente al asistente), guardar solo como conocimiento o descartar el caso.',
                ],
              ]}
            />
          )}

          {error && (
            <p className="error" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}

          <section className="sup-conv-section esc-queue-section">
            {/* Barra de búsqueda y selector de área */}
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
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por contacto, motivo o área…"
                  aria-label="Buscar casos escalados"
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="sup-search-clear"
                    onClick={() => {
                      setSearchTerm('');
                      setPage(1);
                    }}
                    aria-label="Borrar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="sup-filter-selects">
                <select
                  value={selectedAreaFilter}
                  onChange={(e) => {
                    setSelectedAreaFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filtrar por área o pertenencia"
                >
                  <option value="">Todas las áreas</option>
                  <option value="PROPIA">Mis áreas asignadas</option>
                  <option value="SIN_AREA">Sin área asignada</option>
                  <option value="AJENA">Otras áreas</option>
                  <option value="SALES">Ventas</option>
                  <option value="COLLECTIONS">Cobranzas</option>
                  <option value="ADMIN">Administración</option>
                  <option value="LOGISTICS">Logística</option>
                  <option value="DEPOSITS">Depósito</option>
                </select>

                {hasListFilters && (
                  <button
                    type="button"
                    className="secondary sup-reset-btn"
                    onClick={clearListFilters}
                  >
                    Limpiar ✕
                  </button>
                )}
              </div>
            </div>

            {/* Píldoras de estado + filtro "Solo mis áreas" + resumen */}
            <div className="sup-status-pills-row">
              <div className="esc-pills-left">
                <div className="submenu-pills">
                  <button
                    type="button"
                    className={`submenu-pill${status === 'PENDING' ? ' active' : ''}`}
                    onClick={() => {
                      setStatus('PENDING');
                      setPage(1);
                    }}
                  >
                    Pendientes
                  </button>
                  <button
                    type="button"
                    className={`submenu-pill${status === 'RESOLVED' ? ' active' : ''}`}
                    onClick={() => {
                      setStatus('RESOLVED');
                      setPage(1);
                    }}
                  >
                    Resueltos
                  </button>
                </div>

                <label className="esc-mine-chip">
                  <input
                    type="checkbox"
                    checked={soloMios}
                    onChange={(ev) => {
                      setSoloMios(ev.target.checked);
                      setPage(1);
                    }}
                  />
                  <span>Ver solo lo mío</span>
                </label>
              </div>

              <span className="sup-results-summary">
                {loading
                  ? 'Cargando casos…'
                  : totalCount === 0
                    ? 'Sin casos para mostrar'
                    : `Mostrando ${startIdx}–${endIdx} de ${totalCount}`}
              </span>
            </div>

            {/* Tabla limpia y silenciosa */}
            <div className="sup-table-wrap">
              <table className="sup-modern-table">
                <thead>
                  <tr>
                    <th>Contacto</th>
                    <th>Motivo de derivación</th>
                    <th>Área</th>
                    <th>Canal</th>
                    <th>Delegado a</th>
                    <th>Recibido</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEscalations.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={7} className="sup-empty-cell">
                        Sin casos {status === 'PENDING' ? 'pendientes' : 'resueltos'}
                        {soloMios ? ' asignados a tus áreas' : ''}.
                      </td>
                    </tr>
                  ) : (
                    paginatedEscalations.map((e) => {
                      const contactId = e.conversation?.externalId ?? 'Desconocido';
                      const agentKey = e.conversation?.currentAgent;
                      const agentMeta = agentKey ? AGENT_META[agentKey] : null;
                      const channel = e.conversation?.channel || 'WEB';
                      const delegatedName =
                        status === 'PENDING' && e.delegatedToId
                          ? employees.find((emp) => emp.id === e.delegatedToId)?.name ??
                            e.delegatedToId
                          : null;

                      return (
                        <tr key={e.id}>
                          <td>
                            <div className="sup-contact-cell esc-contact-compact">
                              <div className="sup-contact-avatar" aria-hidden="true">
                                {contactInitials(contactId)}
                              </div>
                              <div className="sup-contact-texts">
                                <div className="sup-contact-name-row">
                                  <strong>{contactId}</strong>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <p className="esc-reason-text" title={e.reason}>
                              {formatEscalationReason(e.reason)}
                            </p>
                          </td>
                          <td>
                            <div className="esc-area-cell">
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
                                <span className="sup-unassigned-label">Sin área</span>
                              )}
                              <EtiquetaPertenencia valor={e.pertenencia} />
                            </div>
                          </td>
                          <td>
                            <span
                              className={`sup-channel-badge ${
                                channel === 'WHATSAPP' ? 'is-wa' : 'is-web'
                              }`}
                            >
                              {channel === 'WHATSAPP' ? 'WhatsApp' : 'Web'}
                            </span>
                          </td>
                          <td>
                            {delegatedName ? (
                              <span className="esc-delegated-name">{delegatedName}</span>
                            ) : (
                              <span className="sup-unassigned-label">—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="esc-time-label"
                              title={new Date(e.createdAt).toLocaleString('es-AR')}
                            >
                              {formatRelativeTime(e.createdAt)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="secondary sup-action-btn"
                              onClick={() => openCase(e)}
                            >
                              Ver caso →
                            </button>
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
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>por página</span>
              </label>

              <div className="sup-page-controls">
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span className="sup-page-indicator">
                  Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* VISTA DE DETALLE DEL CASO — LIMPIA, CALMA Y EN 2 COLUMNAS */}
      {selected && (
        <div className="esc-detail-view">
          {/* Barra superior y resumen compacto en una sola tarjeta */}
          <header className="esc-detail-header-card">
            <div className="esc-detail-topbar">
              <button
                type="button"
                className="secondary esc-back-btn"
                onClick={() => {
                  detailRequestId.current += 1;
                  setSelected(null);
                  setConversation(null);
                  setDetailLoading(false);
                  setActionError('');
                }}
              >
                ← Volver a casos escalados
              </button>

              <div className="esc-detail-top-meta">
                <span
                  className={`esc-status-pill ${
                    selected.status === 'PENDING' ? 'is-pending' : 'is-resolved'
                  }`}
                >
                  {selected.status === 'PENDING' ? 'Pendiente de resolución' : 'Caso resuelto'}
                </span>
                <span className="esc-detail-date">
                  {new Date(selected.createdAt).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            <div className="esc-detail-summary-row">
              <div className="esc-detail-identity">
                <div className="sup-contact-avatar esc-detail-avatar" aria-hidden="true">
                  {contactInitials(
                    conversation?.client?.name ||
                      conversation?.externalId ||
                      selected.conversation?.externalId ||
                      'C',
                  )}
                </div>
                <div>
                  <h2>
                    {conversation?.client?.name ||
                      conversation?.externalId ||
                      selected.conversation?.externalId ||
                      'Contacto'}
                  </h2>
                  <p className="esc-detail-reason">
                    {formatEscalationReason(selected.reason)}
                  </p>
                </div>
              </div>

              <div className="esc-detail-chips">
                {(() => {
                  const ch =
                    conversation?.channel ?? selected.conversation?.channel ?? 'WEB';
                  return (
                    <span
                      className={`sup-channel-badge ${
                        ch === 'WHATSAPP' ? 'is-wa' : 'is-web'
                      }`}
                    >
                      {ch === 'WHATSAPP' ? 'WhatsApp' : 'Chat Web'}
                    </span>
                  );
                })()}

                {(() => {
                  const ag =
                    conversation?.currentAgent ?? selected.conversation?.currentAgent;
                  const meta = ag ? AGENT_META[ag] : null;
                  return meta ? (
                    <span
                      className="sup-agent-pill"
                      style={{
                        backgroundColor: meta.bgSoft,
                        color: meta.accent,
                        borderColor: meta.borderSoft,
                      }}
                    >
                      <span
                        className="sup-agent-pill-dot"
                        style={{ backgroundColor: meta.accent }}
                      />
                      {meta.name}
                    </span>
                  ) : (
                    <span className="esc-belonging-pill is-sin-area">Sin área</span>
                  );
                })()}

                <EtiquetaPertenencia valor={selected.pertenencia} />

                {selected.delegatedToId && (
                  <span className="esc-delegated-chip">
                    Delegado a{' '}
                    <strong>
                      {employees.find((emp) => emp.id === selected.delegatedToId)?.name ??
                        selected.delegatedToId}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </header>

          {actionError && (
            <p className="error" style={{ marginBottom: 14 }}>
              {actionError}
            </p>
          )}

          {detailLoading && !conversation && (
            <div className="esc-loading-box">Cargando conversación y contexto del caso…</div>
          )}

          {/* Grilla principal: Conversación a la izquierda, Resolución a la derecha */}
          <div className="esc-detail-grid">
            {/* Columna izquierda: Hilo único y limpio de conversación */}
            <section className="esc-card esc-thread-card">
              <div className="esc-card-head">
                <div>
                  <h3>
                    Conversación{' '}
                    {conversation?.messages && (
                      <span className="sup-count-pill">{conversation.messages.length}</span>
                    )}
                  </h3>
                  <p>Historial completo con el contacto e intervenciones previas.</p>
                </div>
                {selected.consultasPosteriores?.length > 0 && (
                  <span className="esc-waiting-badge">
                    +{selected.consultasPosteriores.length} mientras esperaba
                  </span>
                )}
              </div>

              {conversation ? (
                <>
                  <ConversationThread
                    conversation={conversation}
                    me={me}
                    className="esc-thread-scroll"
                  />
                  <ConversationControls
                    token={token}
                    conversation={conversation}
                    me={me}
                    onRefresh={refreshConversation}
                    hideReply
                  />
                  {!isPriceCase && <FinancingDraftEditor token={token} me={me} conversation={conversation} />}
                </>
              ) : (
                !detailLoading && (
                  <p className="esc-muted-text">No se pudo cargar el hilo de mensajes.</p>
                )
              )}
            </section>

            {/* Columna derecha: Panel enfocado de resolución */}
            <section className="esc-card esc-resolve-card">
              {selected.status === 'PENDING' ? (
                <>
                  <div className="esc-card-head">
                    <div>
                      <h3>Responder y resolver</h3>
                      <p>Tu respuesta se envía al contacto y cierra este caso pendiente.</p>
                    </div>
                    <button
                      type="button"
                      className="secondary esc-suggest-btn"
                      onClick={handleSuggest}
                      disabled={suggesting}
                    >
                      <span aria-hidden="true">✦</span>
                      <span>{suggesting ? 'Redactando…' : 'Sugerir con IA'}</span>
                    </button>
                  </div>

                  {suggestion && <SuggestionPanel suggestion={suggestion} />}

                  {selected.pertenencia === 'AJENA' && (
                    <div className="esc-calm-notice">
                      {selected.delegatedToId ? (
                        <>
                          Caso derivado a{' '}
                          <strong>
                            {employees.find((emp) => emp.id === selected.delegatedToId)
                              ?.name ?? 'otro supervisor'}
                          </strong>
                          {selected.delegatedById === me?.id && ' (por vos)'}. Podés
                          responderlo igual para no hacer esperar al contacto.
                        </>
                      ) : (
                        <>
                          Caso correspondiente a <strong>otra área</strong>. Podés
                          responderlo igual y quedará registrado tu cierre.
                        </>
                      )}
                    </div>
                  )}

                  <form className="esc-resolve-form" onSubmit={handleResolve}>
                    {isPriceCase && <div className="esc-field">
                      <label htmlFor="escalation-confirmed-price">Precio confirmado (ARS)</label>
                      {priceDraft && <p>{priceDraft.productSummary ?? 'Producto del formulario'}</p>}
                      <input id="escalation-confirmed-price" type="number" min="0.01" step="0.01" required
                        value={confirmedPrice} onChange={e => setConfirmedPrice(e.target.value)} disabled={!priceDraft || actionBusy} />
                      {priceError && <p role="alert">{priceError}</p>}
                      {!priceDraft && !priceError && <p>Cargando formulario de financiación…</p>}
                      <p>Al resolver se guarda este precio y se envía tu respuesta. El cliente deberá confirmar el resumen para presentar la solicitud; esto no aprueba el crédito.</p>
                    </div>}
                    <textarea
                      className="conv-ctrl-textarea esc-reply-textarea"
                      rows={4}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Escribí la respuesta para el cliente (se enviará por WhatsApp o Web)…"
                      required
                    />

                    {!isPriceCase && <label className="esc-teach-checkbox">
                      <input
                        type="checkbox"
                        checked={teachAgent && puedeEnsenarAlgo}
                        onChange={(e) => setTeachAgent(e.target.checked)}
                        disabled={isPriceCase || !puedeEnsenarAlgo}
                      />
                      <span>
                        Guardar respuesta en la Base de Conocimiento (enseñar al asistente)
                      </span>
                    </label>}

                    {!puedeEnsenarAlgo && motivoNoEnsena && (
                      <p className="esc-subtle-note">
                        {motivoNoEnsena} Podés responder al contacto normalmente.
                      </p>
                    )}

                    {teachAgent && puedeEnsenarAlgo && (
                      <div className="esc-knowledge-drawer">
                        <div className="esc-field">
                          <label>Acción en la Base de Conocimiento</label>
                          <select
                            value={knowledgeMode}
                            onChange={(e) => {
                              setKnowledgeMode(e.target.value);
                              setActionError('');
                            }}
                          >
                            <option value="MODIFICAR" disabled={!hayCorregibles}>
                              Actualizar documento existente
                              {!hayCorregibles && ' (sin candidatos editables)'}
                            </option>
                            <option value="NUEVO" disabled={!puedeEnsenar}>
                              Crear documento nuevo
                              {!puedeEnsenar && ' (sin permiso en esta área)'}
                            </option>
                          </select>
                        </div>

                        {corrigiendo ? (
                          <ModificarDocumento
                            candidates={candidates ?? []}
                            targetDocId={targetDocId}
                            targetDoc={targetDoc}
                            loadingDoc={loadingDoc}
                            applyMode={applyMode}
                            verActual={verActual}
                            onSelect={handleSelectTargetDoc}
                            onApplyMode={setApplyMode}
                            onToggleActual={() => setVerActual((v) => !v)}
                          />
                        ) : (
                          <>
                            {hayCorregibles && (
                              <div className="esc-calm-notice is-warn">
                                Hay {corregibles.length === 1 ? '1 documento relacionado' : `${corregibles.length} documentos relacionados`} que quedaron cortos. Si tratás el mismo tema, conviene actualizarlo en lugar de duplicarlo.
                              </div>
                            )}

                            <div className="esc-two-fields">
                              <div className="esc-field">
                                <label>Título del documento *</label>
                                <input
                                  value={knowledgeTitle}
                                  onChange={(e) => setKnowledgeTitle(e.target.value)}
                                  placeholder="Ej. Financiación de heladeras"
                                />
                              </div>
                              <div className="esc-field">
                                <label>Categoría *</label>
                                <input
                                  value={knowledgeCategory}
                                  onChange={(e) => setKnowledgeCategory(e.target.value)}
                                  placeholder="Ej. financiación, políticas"
                                />
                              </div>
                            </div>

                            <div className="esc-two-fields">
                              <div className="esc-field">
                                <label>Audiencia</label>
                                <select
                                  value={knowledgeAudience}
                                  onChange={(e) => setKnowledgeAudience(e.target.value)}
                                >
                                  <option value="PUBLICO">Público (clientes)</option>
                                  <option value="INTERNO">Interno (equipo)</option>
                                </select>
                              </div>
                              <div className="esc-field">
                                <label>Área</label>
                                <select
                                  value={knowledgeAgentType}
                                  onChange={(e) => setKnowledgeAgentType(e.target.value)}
                                >
                                  <option value="">
                                    {conversation?.currentAgent
                                      ? `Área del caso (${AGENT_META[conversation.currentAgent]?.name ?? conversation.currentAgent})`
                                      : 'General (transversal)'}
                                  </option>
                                  <option value="SALES">Ventas</option>
                                  <option value="COLLECTIONS">Cobranzas</option>
                                  <option value="LOGISTICS">Logística</option>
                                  <option value="DEPOSITS">Depósito</option>
                                  <option value="ADMIN">Administración</option>
                                </select>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Nota interna opcional */}
                        <div className="esc-inline-note-box">
                          <label htmlFor="escalation-internal-note">
                            Nota interna opcional (solo equipo)
                          </label>
                          <div className="conv-ctrl-note-form">
                            <input
                              id="escalation-internal-note"
                              className="conv-ctrl-note-input"
                              value={internalNote}
                              onChange={(ev) => {
                                setInternalNote(ev.target.value);
                                setNoteSaved(false);
                              }}
                              placeholder="Observación privada sobre esta resolución…"
                            />
                            <button
                              type="button"
                              className="secondary conv-ctrl-note-btn"
                              onClick={handleSaveInternalNote}
                              disabled={actionBusy || !internalNote.trim() || !conversation}
                            >
                              Guardar nota
                            </button>
                          </div>
                          {noteSaved && (
                            <span className="esc-saved-tag">✓ Nota interna guardada</span>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="esc-submit-primary"
                      disabled={actionBusy || detailLoading || (isPriceCase && (!priceDraft || !!priceError || !(Number(confirmedPrice) > 0)))}
                    >
                      {isPriceCase ? 'Confirmar precio, responder y resolver' : 'Enviar respuesta y resolver caso'}
                    </button>
                  </form>

                  {/* Pie discreto: Delegar + Otras opciones colapsables */}
                  <div className="esc-footer-blocks">
                    <form className="esc-delegate-row" onSubmit={handleDelegate}>
                      <label htmlFor="esc-delegate-select">Delegar caso:</label>
                      <select
                        id="esc-delegate-select"
                        value={delegateTo}
                        onChange={(e) => setDelegateTo(e.target.value)}
                      >
                        <option value="">Elegir otro supervisor…</option>
                        {ordenarCandidatos(
                          employees.filter((e) => e.id !== me?.id),
                          conversation?.currentAgent ?? null,
                        ).map((e) => (
                          <option key={e.id} value={e.id}>
                            {etiquetaDeCandidato(e, conversation?.currentAgent ?? null)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="secondary"
                        disabled={actionBusy || !delegateTo}
                      >
                        Delegar
                      </button>
                    </form>

                    <div className="esc-alt-closures">
                      <button
                        type="button"
                        className="esc-alt-toggle"
                        onClick={() => setMostrarMasCierres((v) => !v)}
                      >
                        <span>Otras formas de cerrar sin enviar mensaje</span>
                        <span aria-hidden="true">{mostrarMasCierres ? '▴' : '▾'}</span>
                      </button>

                      {mostrarMasCierres && (
                        <div className="esc-alt-drawer">
                          <div className="esc-alt-option">
                            <div>
                              <strong>Guardar solo como conocimiento</strong>
                              <p>
                                Útil si ya se atendió por teléfono o en sucursal. No envía mensaje al contacto.
                                {!puedeEnsenar && motivoNoEnsena ? ` (${motivoNoEnsena})` : ''}
                                {corrigiendo ? ' · Crea siempre un documento nuevo.' : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="secondary"
                              onClick={handleSaveUnsent}
                              disabled={actionBusy || !replyMessage.trim() || !puedeEnsenar}
                            >
                              Guardar sin enviar
                            </button>
                          </div>

                          <div className="esc-alt-option">
                            <div className="esc-discard-row">
                              <div>
                                <strong>Descartar caso</strong>
                                <p>Cierra el caso sin enviar respuesta ni guardar conocimiento.</p>
                              </div>
                              <div className="conv-ctrl-note-form">
                                <input
                                  className="conv-ctrl-note-input"
                                  value={discardReason}
                                  onChange={(e) => setDiscardReason(e.target.value)}
                                  placeholder="Motivo opcional (ej. resuelto en sucursal)…"
                                />
                                <button
                                  type="button"
                                  className="secondary conv-ctrl-note-btn"
                                  onClick={handleDiscard}
                                  disabled={actionBusy}
                                >
                                  Descartar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="esc-resolved-box">
                  <div className="esc-resolved-banner">
                    <strong>✓ Caso resuelto</strong>
                    {selected.resolvedAt && (
                      <span>
                        {new Date(selected.resolvedAt).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                  <div className="esc-resolved-answer">
                    <span>Resolución registrada</span>
                    <p>{selected.resolution || 'Cerrado sin mensaje al contacto.'}</p>
                  </div>
                  {selected.resolvedWithAction === 'CORRECTED' && (
                    <p className="esc-subtle-note">
                      Se actualizó el documento «{selected.resolvedWithDocument?.title}».
                    </p>
                  )}
                  {selected.resolvedWithAction === 'REUSED' && (
                    <p className="esc-subtle-note">
                      Se reutilizó el documento existente «{selected.resolvedWithDocument?.title}».
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Spec 008 (US3): Documentos en competencia */}
          {hygieneWarning && hygieneWarning.length > 0 && (
            <section className="esc-card esc-hygiene-card">
              <div className="esc-card-head">
                <div>
                  <h3>Documentos superpuestos detectados en este caso</h3>
                  <p>
                    Dos o más documentos consultados compiten entre sí. Podés revisarlos y fusionarlos para mejorar futuras respuestas.
                  </p>
                </div>
              </div>
              <div className="esc-hygiene-list">
                {hygieneWarning.map((pair) => (
                  <HygienePairCard
                    key={pair.pairId}
                    token={token}
                    pair={pair}
                    onResolved={() => openCase(selected)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ModificarDocumento({
  candidates,
  targetDocId,
  targetDoc,
  loadingDoc,
  applyMode,
  verActual,
  onSelect,
  onApplyMode,
  onToggleActual,
}) {
  return (
    <div className="esc-mod-doc">
      <div className="esc-field">
        <label>Documento a actualizar</label>
        <select value={targetDocId} onChange={(e) => onSelect(e.target.value)}>
          <option value="">Elegí un documento relacionado…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.corregible}>
              {c.score.toFixed(0)}% similitud · {c.title}
              {!c.corregible && ` — solo lectura (${c.motivoSiNo})`}
            </option>
          ))}
        </select>
      </div>

      {loadingDoc && <p className="esc-subtle-note">Cargando contenido actual…</p>}

      {targetDoc && (
        <>
          <div className="esc-mod-row">
            <div className="esc-field" style={{ flex: 1 }}>
              <label>Modo de actualización</label>
              <select value={applyMode} onChange={(e) => onApplyMode(e.target.value)}>
                <option value="AGREGAR">Sumar esta respuesta al documento actual</option>
                <option value="REEMPLAZAR">Reemplazar todo el documento</option>
              </select>
            </div>
            <button
              type="button"
              className="secondary esc-preview-btn"
              onClick={onToggleActual}
            >
              {verActual ? 'Ocultar texto actual' : 'Ver texto actual'}
            </button>
          </div>

          {applyMode === 'REEMPLAZAR' && (
            <div className="esc-calm-notice is-warn">
              Atención: se reemplazará todo el texto actual de «{targetDoc.title}» únicamente por la respuesta escrita arriba.
            </div>
          )}

          {verActual && (
            <pre className="esc-doc-preview">{targetDoc.content}</pre>
          )}

          <p className="esc-subtle-note">
            Se actualizará «{targetDoc.title}» (v{targetDoc.version}) al enviar la respuesta.
          </p>
        </>
      )}
    </div>
  );
}

function SuggestionPanel({ suggestion }) {
  if (!suggestion.hasContext) {
    return (
      <div className="esc-suggestion-box is-empty">
        <strong>Sin respaldo suficiente para redactar automáticamente</strong>
        <p>{suggestion.reason}</p>
        <span className="esc-suggestion-meta">
          Audiencia consultada: <strong>{suggestion.audienceUsed}</strong>
          {suggestion.sources?.length > 0
            ? ` · Mejor coincidencia: ${suggestion.confidence}% (${suggestion.sources[0].title})`
            : ''}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`esc-suggestion-box ${
        suggestion.respaldoDebil ? 'is-weak' : 'is-ready'
      }`}
    >
      <div className="esc-suggestion-top">
        <strong>
          {suggestion.respaldoDebil
            ? `⚠️ Propuesta con respaldo parcial (${suggestion.confidence}%)`
            : '✓ Propuesta cargada en el editor (podés editarla antes de enviar)'}
        </strong>
        <span className="esc-suggestion-aud">{suggestion.audienceUsed}</span>
      </div>
      {suggestion.respaldoDebil && <p>{suggestion.reason}</p>}
      {suggestion.sources?.length > 0 && (
        <span className="esc-suggestion-meta">
          Fuentes: {suggestion.sources.map((s) => `${s.title} (${s.score}%)`).join(' · ')}
        </span>
      )}
    </div>
  );
}
