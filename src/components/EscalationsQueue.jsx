import { useEffect, useRef, useState } from 'react';
import {
  listEscalations,
  getEscalation,
  getConversation,
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
import { HygienePairCard } from './KnowledgeHygiene';
import {
  etiquetaDeCandidato,
  motivoDeBloqueo,
  ordenarCandidatos,
  puedeEscribirEn,
} from '../areas';

/**
 * Spec 013 — cómo se muestra la pertenencia de un caso.
 *
 * Los **tres** estados se pintan distinto a propósito. `SIN_AREA` no es "no es
 * mío": es un caso que se escaló antes de rutearse, así que no le toca a nadie
 * en particular y cualquiera puede tomarlo. Mostrarlo igual que `AJENA` sería
 * decirle a cada supervisor que es problema de otro — y entonces no lo mira
 * nadie.
 */
const PERTENENCIA = {
  PROPIA: { texto: 'Mía', color: '#137333', title: 'De un área que supervisás, o derivado a vos' },
  SIN_AREA: { texto: 'Sin área', color: '#8a6d0b', title: 'El caso no llegó a rutearse: no le toca a nadie en particular' },
  // "Otra área" es el caso más común pero no el único: un caso de TU área
  // derivado a otra persona también cae acá (FR-011). La columna «Derivado a»
  // de al lado dice cuál de los dos es; el título lo aclara para que la
  // etiqueta no se lea como una afirmación sobre el área.
  AJENA: { texto: 'No es tuyo', color: '#5f6368', title: 'De un área que no supervisás, o derivado a otra persona. Podés verlo, responderlo o derivarlo' },
};

function EtiquetaPertenencia({ valor }) {
  if (valor === 'PROPIA') {
    return <span className="badge-belonging-mia" title="De un área que supervisás, o derivado a vos">Mía</span>;
  }
  if (valor === 'SIN_AREA') {
    return <span className="badge-belonging-sin-area" title="El caso no llegó a rutearse: no le toca a nadie en particular">Sin área</span>;
  }
  if (valor === 'AJENA') {
    return <span className="badge-belonging-ajena" title="De un área que no supervisás, o derivado a otra persona">No es tuyo</span>;
  }
  return <span>—</span>;
}

export default function EscalationsQueue({ token, me }) {
  const [status, setStatus] = useState('PENDING');
  // Spec 013 — apagado por defecto: el defecto es la cola completa, priorizada
  // pero sin filtrar. Ocultar lo ajeno dejaría sin cobertura las áreas que no
  // tienen responsable activo.
  const [soloMios, setSoloMios] = useState(false);
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

  // Spec 007: los documentos que quedaron cortos en este caso. `null` = todavía
  // no se cargó; `[]` es una respuesta normal (el caso escaló sin recuperar
  // nada, así que no hay nada que corregir).
  const [candidates, setCandidates] = useState(null);

  /**
   * Qué se hace con la respuesta al enseñarla: corregir un documento que ya
   * existe, o crear uno nuevo.
   *
   * El default es MODIFICAR **cuando hay candidatos** (se decide al abrir el
   * caso, no acá): si el caso escaló porque un documento quedó corto, crear
   * otro sobre el mismo tema hace que los dos se repartan la señal y ninguno
   * gane. El default correcto es el que evita eso; crear uno nuevo tiene que
   * ser una elección, no lo que pasa por no mirar.
   */
  const [knowledgeMode, setKnowledgeMode] = useState('NUEVO');
  const [targetDocId, setTargetDocId] = useState('');
  // El documento elegido, ya traído: de acá salen `version` (para que un cambio
  // ajeno no se pise en silencio) y `content` (para poder ver qué dice hoy
  // antes de decidir si se le suma o se lo pisa).
  const [targetDoc, setTargetDoc] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [applyMode, setApplyMode] = useState('AGREGAR');
  const [verActual, setVerActual] = useState(false);

  // Spec 008 (US3): si los documentos consultados en ESTE caso compiten entre
  // sí. `null` = todavía no se cargó; `[]` es la respuesta normal (no hay
  // nada que avisar, o nunca se corrió un barrido).
  const [hygieneWarning, setHygieneWarning] = useState(null);

  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [discardReason, setDiscardReason] = useState('');

  async function loadQueue() {
    setLoading(true);
    setError('');
    try {
      const [escRes, empRes] = await Promise.all([
        // `soloMios` solo viaja cuando está puesto: así la URL de la cola normal
        // no cambia respecto de antes de la spec 013.
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
      // Que falle no puede romper la cola: sin esto no se anticipa el bloqueo,
      // y el backend igual rechaza.
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
    setSelected(escalation);
    setConversation(null);
    setInternalNote('');
    setNoteSaved(false);
    setActionError('');
    setReplyMessage('');
    setTeachAgent(false);
    setKnowledgeTitle('');
    setKnowledgeCategory('');
    setKnowledgeAudience('');
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
      // Los candidatos se piden aparte: si fallan, el caso igual se puede
      // resolver como siempre. Es información de más, no un requisito.
      try {
        const cands = await getKnowledgeCandidates(token, escalation.id);
        if (requestId !== detailRequestId.current) return;
        setCandidates(cands);
        // El default sale del caso, no de una preferencia fija: si hay algo que
        // quedó corto, lo que conviene es corregir ESO. Solo se preselecciona
        // si además se puede tocar — ofrecer un modo que va a dar 403 es peor
        // que no ofrecerlo.
        if (cands.some((c) => c.corregible)) setKnowledgeMode('MODIFICAR');
      } catch {
        if (requestId === detailRequestId.current) setCandidates([]);
      }
      // Spec 008 (US3): mismo criterio — si falla, el caso se resuelve igual.
      //
      // El aviso solo trae títulos (`pairId`, `titleA`, `titleB`, `fusionable`);
      // para poder REVISAR y FUSIONAR sin salir del caso hace falta la pareja
      // completa, que ya está en la última corrida `READY` — no se re-detecta
      // nada, se cruza contra lo que el barrido ya calculó (FR-015).
      try {
        const w = await getEscalationHygieneWarning(token, escalation.id);
        if (requestId !== detailRequestId.current) return;
        if (w.pairs.length > 0) {
          const latest = await getLatestHygieneScan(token);
          if (requestId !== detailRequestId.current) return;
          const idsConAviso = new Set(w.pairs.map((p) => p.pairId));
          setHygieneWarning((latest.pairs ?? []).filter((p) => idsConAviso.has(p.pairId)));
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

  /**
   * Trae el documento elegido para corregir.
   *
   * Hacen falta dos cosas que la lista de candidatos no trae: `version` —para
   * que un cambio que otro guarde mientras tanto no se pise en silencio— y
   * `content`, para poder mirar qué dice hoy antes de decidir si se le suma la
   * respuesta o se lo pisa entero. Se pide al elegir y no al abrir el caso: son
   * hasta cuatro documentos y casi siempre se toca uno.
   */
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
    // Las dos ramas piden datos distintos, así que se validan por separado. Un
    // solo chequeo de "faltan campos" mandaría a completar título y categoría a
    // quien eligió corregir un documento, donde no existen.
    if (teachAgent && corrigiendo && !targetDoc) {
      setActionError('Elegí qué documento corregir, o pasá a «documento nuevo».');
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
    setActionBusy(true);
    setActionError('');
    try {
      await resolveEscalation(token, selected.id, {
        message: replyMessage,
        // Corregir y crear son excluyentes: el backend rechaza pedir las dos.
        // El checkbox dice "esto queda como conocimiento"; el selector de
        // adentro decide CÓMO, y de ahí sale cuál de los dos campos viaja.
        teachAgent: teachAgent && !corrigiendo,
        title: knowledgeTitle,
        category: knowledgeCategory,
        audience: knowledgeAudience || undefined,
        agentType: knowledgeAgentType || undefined,
        // `content` es la respuesta que el supervisor escribió. Con AGREGAR el
        // backend la suma a lo que el documento ya dice; con REEMPLAZAR la
        // pone en lugar de todo. La unión se hace allá contra el contenido
        // vigente, no acá contra el que se trajo hace un rato.
        correctKnowledge:
          teachAgent && corrigiendo && targetDoc
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
      setActionError(
        corrigiendo
          ? 'Guardar sin enviar siempre crea un documento nuevo, así que pide título y categoría. Pasá el selector a «Documento nuevo» para completarlos, o usá «Enviar y responder» si querés corregir el existente.'
          : 'Para guardar sin enviar hacen falta título y categoría: la respuesta se incorpora al conocimiento.',
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

  /**
   * Corregir y crear se autorizan por áreas DISTINTAS, y aplastarlas en un solo
   * permiso deja gente afuera de algo que sí puede hacer.
   *
   * `puedeEnsenar` mira el área donde iría un documento NUEVO —la del caso, o
   * la que se elija a mano—. Corregir mira el área DEL DOCUMENTO que se toca,
   * que la calculó el backend y viene en cada candidato como `corregible`. Un
   * caso de Cobranzas que recuperó un documento de Ventas se le puede corregir
   * a quien lleva Ventas, aunque no pueda crear nada en Cobranzas.
   *
   * Por eso el checkbox se habilita si se puede hacer CUALQUIERA de las dos, y
   * cada opción del selector se deshabilita por su cuenta.
   */
  const corregibles = (candidates ?? []).filter((c) => c.corregible);
  const hayCorregibles = corregibles.length > 0;
  const corrigiendo = knowledgeMode === 'MODIFICAR';
  const puedeEnsenarAlgo = puedeEnsenar || hayCorregibles;

  const filteredEscalations = escalations.filter((e) => {
    if (selectedAreaFilter) {
      const matchArea = (e.pertenencia === selectedAreaFilter) || (e.conversation?.currentAgent === selectedAreaFilter);
      if (!matchArea) return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchReason = e.reason?.toLowerCase().includes(term);
      const matchClient = e.conversation?.externalId?.toLowerCase().includes(term);
      const matchChannel = e.conversation?.channel?.toLowerCase().includes(term);
      const matchAgent = e.conversation?.currentAgent?.toLowerCase().includes(term);
      if (!matchReason && !matchClient && !matchChannel && !matchAgent) return false;
    }
    return true;
  });

  const totalCount = filteredEscalations.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalCount);
  const paginatedEscalations = filteredEscalations.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const originalClientMessage = selected && conversation
    ? [...conversation.messages]
      .reverse()
      .find((message) => (
        message.role === 'USER' &&
        new Date(message.createdAt) <= new Date(selected.createdAt)
      ))
    : null;

  return (
    <div className="escalations-queue">
      {!selected && (
        <div className="escalations-list-view">
      <div className="page-header">
        <div>
          <h2 className="page-title">Casos escalados</h2>
          <p className="page-subtitle">Conversaciones que el asistente derivó a una persona.</p>
        </div>
      </div>

      <div className="submenu-bar">
        <div className="submenu-left-group">
          <div className="submenu-pills">
            <button
              className={`submenu-pill${status === 'PENDING' ? ' active' : ''}`}
              onClick={() => { setStatus('PENDING'); setPage(1); }}
            >
              Pendientes
            </button>
            <button
              className={`submenu-pill${status === 'RESOLVED' ? ' active' : ''}`}
              onClick={() => { setStatus('RESOLVED'); setPage(1); }}
            >
              Resueltos
            </button>
          </div>

          <label className="filter-checkbox-label">
            <input
              type="checkbox"
              checked={soloMios}
              onChange={(ev) => setSoloMios(ev.target.checked)}
            />
            <span>Ver solo lo mío</span>
          </label>
        </div>

        <button className="btn-pill-action" onClick={loadQueue} disabled={loading}>
          <span style={{ fontSize: 14 }}>🔄</span>
          <span>{loading ? 'Cargando...' : 'Refrescar'}</span>
        </button>
      </div>

      {soloMios && (
        <div className="hint" style={{ marginBottom: 16 }}>
          Se ocultan los casos de otras áreas. Los que no tienen área siguen
          apareciendo: no le tocan a nadie en particular.
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="search-filter-card">
        <div className="search-input-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por motivo, cliente, canal, área..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
        <div className="search-divider" />
        <select
          className="area-select"
          value={selectedAreaFilter}
          onChange={(e) => { setSelectedAreaFilter(e.target.value); setPage(1); }}
        >
          <option value="">Todas las áreas</option>
          <option value="PROPIA">Áreas mías</option>
          <option value="SIN_AREA">Sin área</option>
          <option value="AJENA">Otras áreas</option>
        </select>
      </div>

      <div className="data-table-card">
        <table className="custom-data-table">
          <thead>
            <tr>
              <th>MOTIVO</th>
              <th>CLIENTE</th>
              <th>CANAL</th>
              <th>ÁREA</th>
              <th>CREADO ⌄</th>
              <th>DELEGADO A</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paginatedEscalations.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                  Sin casos {status === 'PENDING' ? 'pendientes' : 'resueltos'}{soloMios ? ' que sean tuyos' : ''}.
                </td>
              </tr>
            )}
            {paginatedEscalations.map((e) => (
              <tr key={e.id}>
                <td>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.reason}</div>
                  {e.conversation?.currentAgent && (
                    <span className="badge-role-tag">{e.conversation.currentAgent}</span>
                  )}
                </td>
                <td>{e.conversation?.externalId}</td>
                <td>{e.conversation?.channel || 'WEB'}</td>
                <td><EtiquetaPertenencia valor={e.pertenencia} /></td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                <td>
                  {status === 'PENDING' && (
                    e.delegatedToId
                      ? (employees.find((emp) => emp.id === e.delegatedToId)?.name ?? e.delegatedToId)
                      : '—'
                  )}
                  {status === 'RESOLVED' && '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-table-action" onClick={() => openCase(e)}>
                    Ver detalle →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-pagination-footer">
          <span className="pagination-text">
            Mostrando {startIdx} a {endIdx} de {totalCount} casos
          </span>
          <div className="pagination-controls">
            <div className="page-btn-group">
              <button
                className="page-nav-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <div className="page-num-active">{currentPage}</div>
              <button
                className="page-nav-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
            <select
              className="page-size-select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
          </div>
        </div>
      </div>
        </div>
      )}

      {selected && (
        <div className="escalation-detail-view">
          <button
            type="button"
            className="secondary escalation-back-button"
            onClick={() => {
              detailRequestId.current += 1;
              setSelected(null);
              setConversation(null);
              setDetailLoading(false);
              setActionError('');
            }}
          >
            ← Volver a Casos escalados
          </button>
          <div className="page-header">
            <div>
              <h2 className="page-title">Detalle del caso</h2>
              <p className="page-subtitle">{selected.reason}</p>
            </div>
          </div>

          <section className="card escalation-info-card">
            <h3>Información del caso</h3>
            <dl className="escalation-info-grid">
              <div><dt>Motivo</dt><dd>{selected.reason}</dd></div>
              <div><dt>Cliente</dt><dd>{conversation?.externalId ?? selected.conversation?.externalId ?? '—'}</dd></div>
              <div><dt>Canal</dt><dd>{conversation?.channel ?? selected.conversation?.channel ?? 'WEB'}</dd></div>
              <div><dt>Área</dt><dd>{conversation?.currentAgent ?? selected.conversation?.currentAgent ?? 'Sin área'}</dd></div>
              <div><dt>Creado</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div>
              <div>
                <dt>Delegado a</dt>
                <dd>{selected.delegatedToId
                  ? employees.find((employee) => employee.id === selected.delegatedToId)?.name ?? selected.delegatedToId
                  : '—'}</dd>
              </div>
              <div><dt>Estado</dt><dd>{selected.status === 'PENDING' ? 'Pendiente' : 'Resuelto'}</dd></div>
            </dl>
          </section>

          {actionError && <p className="error" style={{ marginTop: 8 }}>{actionError}</p>}

          {detailLoading && <p className="hint">Cargando información del caso…</p>}

          {conversation && (
            <section className="card escalation-message-card">
              <h3>Mensaje del cliente</h3>
              <div className="escalation-original-message">
                <p>{originalClientMessage?.content ?? 'No hay una consulta original disponible.'}</p>
                {originalClientMessage && (
                  <span>{new Date(originalClientMessage.createdAt).toLocaleString()}</span>
                )}
              </div>
              {selected.consultasPosteriores?.length > 0 && (
                <div className="escalation-follow-up-messages">
                  <h4>Mensajes recibidos mientras esperaba</h4>
                  {selected.consultasPosteriores.map((message, index) => (
                    <div className="escalation-follow-up-message" key={`${message.createdAt}-${index}`}>
                      <p>{message.content}</p>
                      <span>{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <h4 className="escalation-context-title">Conversación reciente</h4>
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
                hideReplyAndNotes
              />
            </section>
          )}

          {/*
            Spec 008 (US3) — el disparador reactivo. No es un mecanismo nuevo:
            la misma `HygienePairCard` de "Limpiar base de conocimiento" (US1),
            con acceso a revisar y fusionar sin salir del caso.
          */}
          {hygieneWarning && hygieneWarning.length > 0 && (
            <div className="panel-section">
              <strong>Los documentos consultados en este caso se compiten entre sí</strong>
              <p className="hint">
                Dos (o más) de los documentos que se consultaron para este turno
                se solapan por encima del umbral. Conviene revisarlos y, si
                corresponde, fusionarlos — así no vuelven a repartirse la señal
                en la próxima consulta parecida.
              </p>
              {hygieneWarning.map((pair) => (
                <HygienePairCard
                  key={pair.pairId}
                  token={token}
                  pair={pair}
                  onResolved={() => openCase(selected)}
                />
              ))}
            </div>
          )}

          {selected.status === 'PENDING' && (
            <section className="card escalation-response-section">
              <h3>Respuesta al cliente</h3>

              <div className="escalation-suggestion">
                <button type="button" className="secondary" onClick={handleSuggest} disabled={suggesting}>
                  {suggesting ? 'Redactando…' : 'Proponer respuesta con la base de conocimiento'}
                </button>
                {suggestion && <SuggestionPanel suggestion={suggestion} />}
              </div>

              <form className="escalation-response-form" onSubmit={handleResolve}>
                {/*
                  Spec 013 (FR-018) — avisar que el caso no es de tus áreas y que
                  la respuesta queda registrada como tal.

                  ⚠️ Es INFORMACIÓN, no una traba (FR-019). Nada de `confirm()`,
                  ni un checkbox que haya que tildar para enviar: eso
                  reintroduciría por la puerta de atrás el bloqueo que la spec
                  descartó a propósito —dejaría clientes esperando a un
                  responsable que no está— y nadie lo notaría, porque "avisa".

                  Solo para AJENA. Un caso SIN_AREA no le toca a nadie:
                  responderlo es lo esperado y avisar sería ruido.

                  ⚠️ AJENA tiene DOS causas y no dicen lo mismo (defecto del
                  2026-08-26): "no es tu área" y "está derivado a otra persona".
                  El texto único decía "es de otra área" sobre un caso del área
                  propia que el que estaba mirando había derivado él mismo — una
                  afirmación falsa, y encima sobre su propia acción. La regla del
                  backend está bien (FR-011: derivado a otro deja de ser tuyo);
                  lo que faltaba era decir por cuál de las dos.
                */}
                {selected.pertenencia === 'AJENA' && (
                  <p className="hint escalation-area-warning">
                    {selected.delegatedToId ? (
                      <>
                        Este caso está <strong>derivado a{' '}
                        {employees.find((emp) => emp.id === selected.delegatedToId)?.name ??
                          'otra persona'}</strong>
                        {selected.delegatedById === me?.id && ' — lo derivaste vos'}.
                        Podés responderlo igual —mejor eso que dejar al cliente
                        esperando— y va a quedar registrado que lo respondió
                        alguien que no era el destinatario.
                      </>
                    ) : (
                      <>
                        Este caso es de <strong>otra área</strong>. Podés responderlo
                        igual —mejor eso que dejar al cliente esperando— y va a quedar
                        registrado que lo respondió alguien de otra área.
                      </>
                    )}
                  </p>
                )}
                <div className="field escalation-reply-field">
                  <label>Responder manualmente al cliente</label>
                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Este mensaje se envía al usuario por WhatsApp/WEB"
                    required
                  />
                </div>
                {/*
                  El checkbox dice QUÉ se quiere (que esto quede como
                  conocimiento); el selector de adentro decide CÓMO. Antes el
                  "cómo" estaba resuelto antes de llegar acá —había que elegir
                  "Corregir este" en una tabla de arriba, y eso deshabilitaba el
                  checkbox— así que las dos opciones nunca se veían juntas y
                  crear un documento nuevo era lo que pasaba por no hacer nada.
                */}
                <div className="field escalation-teach-toggle">
                  <input
                    type="checkbox"
                    id="teachAgent"
                    checked={teachAgent && puedeEnsenarAlgo}
                    onChange={(e) => setTeachAgent(e.target.checked)}
                    disabled={!puedeEnsenarAlgo}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="teachAgent" style={{ margin: 0 }}>
                    Enseñar esta respuesta al RAG (queda como conocimiento reutilizable)
                  </label>
                </div>

                {/* La distinción que no se puede aplastar: RESPONDER no está
                    restringido por área, ESCRIBIR conocimiento sí. Quien recibe
                    un caso de otra área puede contestarlo igual; lo único que no
                    puede es dejar el documento. Deshabilitar el caso entero sería
                    quitarle algo que sí puede hacer. */}
                {!puedeEnsenarAlgo && (
                  <p className="hint" style={{ marginTop: -4 }}>
                    {motivoNoEnsena} Podés responder el caso igual — lo único que no
                    podés es dejar la respuesta como conocimiento de esa área.
                  </p>
                )}

                {teachAgent && puedeEnsenarAlgo && (
                  <div className="escalation-knowledge-fields">
                    {/*
                      La primera decisión, antes que cualquier campo: mejorar lo
                      que hay o agregar algo nuevo. Va primero porque es la que
                      cambia todo lo de abajo, y porque elegir mal acá es lo que
                      llena el corpus de documentos que se compiten entre sí.
                    */}
                    <div className="field">
                      <label>¿Qué querés hacer con esta respuesta?</label>
                      <select
                        value={knowledgeMode}
                        onChange={(e) => {
                          setKnowledgeMode(e.target.value);
                          setActionError('');
                        }}
                      >
                        <option value="MODIFICAR" disabled={!hayCorregibles}>
                          Modificar un documento existente
                          {!hayCorregibles && ' — no hay ninguno que puedas corregir en este caso'}
                        </option>
                        <option value="NUEVO" disabled={!puedeEnsenar}>
                          Documento nuevo
                          {!puedeEnsenar && ' — no podés crear en esta área'}
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
                        {/*
                          La línea que reemplaza a la tabla que estaba suelta
                          arriba. Con la tabla fuera del camino, crear un
                          documento nuevo sobre un tema que YA tiene uno corto
                          vuelve a ser fácil de hacer sin querer — y es
                          exactamente lo que hace que la próxima consulta igual
                          escale, porque los dos se reparten la señal.
                        */}
                        {hayCorregibles && (
                          <p className="hint" style={{ color: '#8a6d0b', marginTop: 0 }}>
                            ⚠️ En este caso {corregibles.length === 1
                              ? 'hay 1 documento que quedó corto'
                              : `hay ${corregibles.length} documentos que quedaron cortos`}
                            . Si el tema es alguno de ellos, conviene
                            <strong> corregir ese</strong> en vez de crear otro:
                            dos documentos parecidos se compiten entre sí y las
                            respuestas salen peor.
                          </p>
                        )}
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
                      </>
                    )}

                    <div className="escalation-internal-note">
                      <div className="field">
                        <label htmlFor="escalation-internal-note">Nota interna (opcional)</label>
                        <textarea
                          id="escalation-internal-note"
                          rows={2}
                          value={internalNote}
                          onChange={(event) => {
                            setInternalNote(event.target.value);
                            setNoteSaved(false);
                          }}
                          placeholder="Observación solo para el equipo interno"
                        />
                        <span className="escalation-note-hint">
                          Se guarda por separado; no se envía al cliente ni se incorpora al RAG.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleSaveInternalNote}
                        disabled={actionBusy || !internalNote.trim() || !conversation}
                      >
                        {actionBusy ? 'Guardando…' : 'Guardar nota interna'}
                      </button>
                      {noteSaved && <span className="success-msg escalation-note-success">Nota guardada.</span>}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={actionBusy || detailLoading} className="escalation-submit-button">
                  Enviar y responder
                </button>
              </form>

              {/* Los otros dos cierres. Van juntos y con la diferencia
                  explicada porque las tres acciones son terminales: elegir
                  mal no se deshace. */}
              <div className="escalation-close-actions">
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
                  {/*
                    Solo crea documentos: el endpoint de "guardar sin enviar" no
                    tiene rama de corrección. Decirlo acá y no dejar que falle
                    con "faltan título y categoría" —campos que en modo
                    «Modificar documento» ni siquiera se ven— que es un error
                    que no explica nada.
                  */}
                  {corrigiendo && (
                    <>
                      {' '}
                      <strong>Ojo:</strong> siempre crea un documento nuevo, aunque
                      arriba hayas elegido modificar uno. Para corregir, respondé
                      el caso con «Enviar y responder».
                    </>
                  )}
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

                <div className="escalation-delegate">
                  <h4>Delegar a otro supervisor</h4>
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
              </div>
            </section>
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
 * La rama "corregir un documento que ya existe" del panel de enseñanza.
 *
 * Dos decisiones, en este orden: **cuál** documento y **qué** hacerle. La
 * segunda no se puede tomar bien sin ver la primera, por eso el modo aparece
 * recién con un documento elegido y trae el "ver lo que dice hoy" al lado.
 *
 * Los candidatos que NO se pueden corregir se listan igual, deshabilitados y
 * con el motivo: saber que existe algo cercano es lo que evita duplicarlo, y es
 * distinto de que no haya nada. Esconderlos convertiría "es de otra área" en
 * "no existe", que manda a crear justo el documento que competiría con él.
 */
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
    <>
      <div className="field">
        <label>¿Cuál documento?</label>
        <select value={targetDocId} onChange={(e) => onSelect(e.target.value)}>
          <option value="">— elegí uno —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.corregible}>
              {c.score.toFixed(1)}% · {c.title}
              {!c.corregible && ` — solo lectura (${c.motivoSiNo})`}
            </option>
          ))}
        </select>
        <p className="hint" style={{ marginTop: 4 }}>
          El porcentaje es cuánto se pareció a la consulta que escaló: el más
          alto suele ser el que tendría que haber respondido y no le alcanzó.
        </p>
      </div>

      {loadingDoc && <p className="hint">Trayendo el documento…</p>}

      {targetDoc && (
        <>
          <div className="field">
            <label>¿Qué hacer con el documento?</label>
            <select value={applyMode} onChange={(e) => onApplyMode(e.target.value)}>
              <option value="AGREGAR">Agregar la respuesta al contenido actual</option>
              <option value="REEMPLAZAR">Reemplazar todo el contenido</option>
            </select>
            {/*
              El aviso es el mismo que en la revisión de entrevistas, y por el
              mismo motivo: el texto que se está por guardar se escribió para
              contestar UNA consulta, no para ser el documento entero. Pisar con
              él es casi siempre perder el resto.
            */}
            {applyMode === 'REEMPLAZAR' && (
              <p className="hint" style={{ color: '#b45309', marginTop: 4 }}>
                ⚠️ Se va a borrar todo lo que el documento dice hoy y va a quedar
                solo la respuesta que escribiste arriba. Como esa respuesta
                contesta una consulta puntual, es probable que no cubra el
                documento entero.
              </p>
            )}
          </div>

          <button type="button" className="secondary" onClick={onToggleActual}>
            {verActual ? 'Ocultar' : 'Ver'} lo que dice hoy
          </button>
          {verActual && (
            <p className="hint" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
              {targetDoc.content}
            </p>
          )}

          <p className="hint" style={{ marginTop: 8 }}>
            Al responder el caso se envía el mensaje al cliente <strong>y</strong>{' '}
            se guarda el cambio sobre «{targetDoc.title}» (versión{' '}
            {targetDoc.version}). Todavía no se guardó nada.
          </p>
        </>
      )}
    </>
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
 * - **`respaldoDebil`**: la propuesta se redacta desde un umbral MÁS BAJO que
 *   el del agente, así que puede venir apoyada en material que al agente no le
 *   alcanzó para contestar solo. Eso tiene que verse. Si se mostrara igual que
 *   una propuesta fundada, bajar el umbral habría sido cambiar "no redacta
 *   nunca" por "redacta y no avisa", que es peor.
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
        {/*
          Qué quedó cerca, aunque no alcanzara. "No hay nada del tema" y "lo hay
          al 48%" piden trabajo distinto: cargar de cero, o corregir el que ya
          está para que gane. Sin esto las dos situaciones se ven iguales.
        */}
        {suggestion.sources?.length > 0 && (
          <>
            <p className="hint" style={{ marginBottom: 4 }}>
              Lo más cercano que se encontró — el mejor quedó en{' '}
              <strong>{suggestion.confidence}%</strong>, demasiado lejos como
              para redactar con eso:
            </p>
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

  return (
    <div
      className={suggestion.respaldoDebil ? 'error' : 'success-msg'}
      style={{ marginTop: 12 }}
    >
      <p>
        Propuesta cargada en el mensaje de abajo. <strong>Es editable</strong>:
        se envía lo que quede escrito ahí, no la propuesta original.
      </p>
      {/*
        El aviso va ARRIBA de las fuentes y con el mismo peso visual que un
        error, no como una nota al pie: el texto ya está cargado en el textarea
        y a un clic de enviarse. Quien no lo lea acá no lo lee más.
      */}
      {suggestion.respaldoDebil && (
        <p style={{ marginTop: 8 }}>
          <strong>⚠️ Respaldo débil ({suggestion.confidence}%).</strong>{' '}
          {suggestion.reason}
        </p>
      )}
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
