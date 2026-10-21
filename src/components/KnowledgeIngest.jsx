import { useCallback, useEffect, useState } from 'react';
import {
  ingestKnowledge,
  searchKnowledge,
  getAgentsStatus,
  listKnowledge,
  getEmployee,
  listSectors,
} from '../api';
import KnowledgeIngestForm from './KnowledgeIngestForm';
import KnowledgeDetail from './KnowledgeDetail';
import KnowledgeHygiene from './KnowledgeHygiene';
import Improvements from './Improvements';
import Interview from './Interview';
import InfoNotes, { InfoToggle } from './InfoNotes';
import { motivoDeBloqueo, puedeEscribirEn } from '../areas';

const AGENT_TYPES = ['ORCHESTRATOR', 'SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];
const PAGE_SIZE = 15;

/** Qué explica el botón «Info» en cada pestaña. */
const INFO_POR_VISTA = {
  lista: [
    ['Columna Uso.', <>
      Consultas en las que sirvió para responder / consultas que lo recuperaron · similitud
      promedio. <em>Sin datos</em> no es cero: nadie hizo todavía una consulta que lo
      recuperara, no significa que el documento no sirva.
    </>],
    ['Solo lectura.',
      'Se ven todos los documentos, de todas las áreas, para no duplicarlos y saber a quién '
      + 'derivar. Solo podés modificar los de las áreas de las que sos responsable.'],
    ['Audiencia.',
      'PUBLICO lo usa el asistente con clientes y empleados; INTERNO, solo con empleados.'],
  ],
  cargar: [
    ['Una sola opción.',
      'Escribí el contenido o subí un archivo, no las dos cosas. Con archivo el título es '
      + 'opcional: si se omite, se usa el nombre del archivo.'],
    ['Archivos.',
      'PDF, Word, texto, imagen o audio. El texto se extrae y vectoriza en segundo plano; '
      + 'el avance se ve en «Procesados recientemente».'],
    ['Documento general.',
      'Un documento sin área asignada es transversal: solo lo puede cargar quien es '
      + 'responsable de todas las áreas.'],
  ],
  buscar: [
    ['Confidencialidad.',
      'La misma consulta con audiencia PUBLICO no debería recuperar documentos INTERNO.'],
    // Spec 006. Este buscador NO aplica el umbral a propósito: muestra lo crudo
    // que devuelve el RAG. Sin decirlo, cinco resultados en 53% se leen como
    // «encontró esto» cuando en una conversación real habrían derivado a un humano.
    ['Muestra todo lo que recupera, sin filtrar.', (umbral) => <>
      En una conversación real el asistente solo responde si el mejor resultado alcanza el
      umbral{umbral !== null && <> de <strong>{(umbral * 100).toFixed(0)}%</strong></>}; por
      debajo deriva a una persona. Acá no se aplica ese corte a propósito, para poder ver lo
      crudo.
    </>],
    ['Estado del vector.', <>
      <em>Desfasado</em> significa que el documento se editó y el vector quedó atrás: la
      búsqueda sigue corriendo contra el texto viejo aunque el panel muestre el nuevo. Se
      arregla reindexando el documento desde su ficha.
    </>],
  ],
  higiene: [
    ['Qué hace.',
      'Busca documentos activos que se solapan entre sí (misma área y audiencia) para '
      + 'ofrecer fusionarlos.'],
    ['Cuánto tarda.',
      'Alrededor de un minuto. No hace falta esperar en esta pantalla: se puede volver más tarde.'],
    ['Fusionar o descartar.',
      'Al fusionar, el documento que sobrevive sube de versión y el otro queda desactivado, '
      + 'no borrado. Si son distintos a propósito, al descartarlos no se vuelven a proponer '
      + 'mientras ninguno de los dos cambie.'],
  ],
  mejorar: [
    ['Qué es.', 'Todo lo que le falta al asistente en un área, en una sola lista.'],
    ['De dónde sale.',
      'Lo que le preguntaron y no supo contestar, los casos que terminaron en una persona y '
      + 'los documentos que quedaron incompletos.'],
    ['Cómo se arregla.',
      'Cada cosa se arregla con una entrevista. Si algo está bien como está, marcalo con '
      + '«Está bien así».'],
  ],
};

export default function KnowledgeIngest({
  token,
  me,
  showImprovements = false,
  interviewStart,
  onEntrevistar,
  onRetomar,
  onSalirEntrevista,
}) {
  const [view, setView] = useState('lista'); // lista | subir | alta | buscar
  const [selectedId, setSelectedId] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  // Umbral vigente (spec 006). No hace falta endpoint nuevo: `agents/status` ya
  // lo devuelve y el Panel del Supervisor ya lo pinta. Vive acá y no en la
  // búsqueda porque también lo cita la nota de «Info».
  const [umbral, setUmbral] = useState(null);

  useEffect(() => {
    let vivo = true;
    getAgentsStatus(token)
      .then((d) => { if (vivo) setUmbral(d?.confidenceThreshold ?? null); })
      // Si falla, la búsqueda se muestra igual pero sin la marca de umbral: es
      // información de más, no un requisito para buscar.
      .catch(() => {});
    return () => { vivo = false; };
  }, [token]);

  /**
   * De qué áreas es responsable quien está mirando (spec 005).
   *
   * Se usa **solo para deshabilitar acciones de escritura con el motivo a la
   * vista**. Los documentos se siguen viendo todos, de todas las áreas: hace falta
   * ver lo ajeno para no duplicarlo y para saber a quién derivar. Ocultarlos
   * rompería justo lo que la restricción de escritura protege.
   */
  const [misAreas, setMisAreas] = useState(null);
  const [totalAreas, setTotalAreas] = useState(0);

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

  const alcance = { misAreas, totalAreas };

  if (interviewStart) {
    return (
      <div className="knowledge-page">
        <Interview token={token} me={me} start={interviewStart} onSalir={onSalirEntrevista} />
      </div>
    );
  }

  if (selectedId) {
    return (
      <div className="knowledge-page knowledge-detail-view">
        <KnowledgeDetail
          token={token}
          id={selectedId}
          alcance={alcance}
          onClose={() => setSelectedId(null)}
        />
      </div>
    );
  }

  const tabs = [
    ['lista', 'Documentos'],
    ['cargar', 'Cargar conocimiento'],
    ['buscar', 'Probar búsqueda'],
    ['higiene', 'Limpiar base'],
    ...(showImprovements ? [['mejorar', 'Mejorar conocimiento']] : []),
  ];

  return (
    <div className="knowledge-page">
      <section className="knowledge-hero">
        <div className="knowledge-hero-layout">
          <div>
            <span className="knowledge-hero-kicker">Gestión de documentos y calidad RAG</span>
            <h2 className="knowledge-hero-title">Base de Conocimiento</h2>
            <p className="knowledge-hero-description">
              Lo que cargues acá es lo que el asistente usa para responder. Mantené los documentos
              al día, probá cómo los encuentra y limpiá duplicados para que las respuestas sean precisas.
            </p>
          </div>
          {view !== 'cargar' && (
            <button type="button" className="knowledge-hero-action" onClick={() => setView('cargar')}>
              Cargar conocimiento <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </section>

      <div className="submenu-bar">
        <nav className="submenu-pills" aria-label="Secciones de la base de conocimiento">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`submenu-pill${view === id ? ' active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="info-bar-actions">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
        </div>
      </div>

      {mostrarInfo && (
        <InfoNotes
          title={tabs.find(([id]) => id === view)?.[1]}
          onClose={() => setMostrarInfo(false)}
          notes={(INFO_POR_VISTA[view] ?? []).map(([titulo, contenido]) => [
            titulo,
            typeof contenido === 'function' ? contenido(umbral) : contenido,
          ])}
        />
      )}

      {view === 'lista' && (
        <KnowledgeList token={token} alcance={alcance} onSelect={setSelectedId} />
      )}
      {view === 'higiene' && <KnowledgeHygiene token={token} />}
      {view === 'mejorar' && showImprovements && (
        <Improvements
          token={token}
          me={me}
          onEntrevistar={onEntrevistar}
          onRetomar={onRetomar}
        />
      )}
      {view === 'cargar' && (
        <KnowledgeIngestForm
          token={token}
          alcance={alcance}
          onIngested={() => setView('lista')}
          onViewAll={() => setView('lista')}
          onSearch={() => setView('buscar')}
        />
      )}
      {view === 'buscar' && <SearchForm token={token} umbral={umbral} />}
    </div>
  );
}

/** Listado con filtros por área, categoría y estado (FR-019). */
function KnowledgeList({ token, alcance, onSelect }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [agentType, setAgentType] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (agentType) params.agentType = agentType;
      if (category) params.category = category;
      if (isActive !== '') params.isActive = isActive;
      if (search) params.search = search;
      setData(await listKnowledge(token, params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, agentType, category, isActive, search]);

  // Búsqueda con debounce: no dispara un pedido por cada tecla.
  useEffect(() => {
    const id = setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => { load(); }, [load]);

  const desde = data ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const hasta = data ? desde + data.data.length - 1 : 0;

  return (
    <section className="knowledge-panel">
      <header className="knowledge-panel-heading">
        <div>
          <span className="knowledge-kicker">Biblioteca</span>
          <h3>Documentos de la base</h3>
        </div>
        {data && <span className="knowledge-panel-count">{data.total} documentos</span>}
      </header>

      <div className="knowledge-filters">
        <label className="knowledge-search-box">
          <span className="knowledge-search-icon" aria-hidden="true">⌕</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por título o contenido…"
            aria-label="Buscar documentos"
          />
        </label>
        <div className="knowledge-filter">
          <label>Área</label>
          <select value={agentType} onChange={(e) => { setPage(1); setAgentType(e.target.value); }}>
            <option value="">Todas</option>
            {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Categoría</label>
          <input
            value={category}
            onChange={(e) => { setPage(1); setCategory(e.target.value); }}
            placeholder="Todas"
          />
        </div>
        <div className="knowledge-filter">
          <label>Estado</label>
          <select value={isActive} onChange={(e) => { setPage(1); setIsActive(e.target.value); }}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Desactivados</option>
          </select>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !data && <p className="knowledge-empty">Cargando documentos…</p>}

      {data && (
        <>
          <div className={`knowledge-table-wrap${loading ? ' is-loading' : ''}`}>
            <table className="knowledge-table">
              <thead>
                <tr>
                  <th>Documento</th><th>Área</th><th>Audiencia</th>
                  <th>Estado</th><th>Uso</th><th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr className="knowledge-table-empty">
                    <td colSpan={6}>No hay documentos con esos filtros.</td>
                  </tr>
                )}
                {data.data.map((d) => (
                  <tr key={d.id}>
                    <td className="knowledge-doc-cell">
                      <strong className="knowledge-doc-title">{d.title}</strong>
                      {d.summary && (
                        <span className="knowledge-doc-summary">
                          {d.summary.length > 110 ? `${d.summary.slice(0, 110)}…` : d.summary}
                        </span>
                      )}
                    </td>
                    <td data-label="Área">
                      <span className="knowledge-area">{d.agentType ?? 'General'}</span>
                      {/* Se marca, no se esconde: ver no es editar (FR-013). Saber
                          de entrada cuáles no vas a poder tocar evita abrir el
                          detalle para descubrirlo. */}
                      {alcance?.misAreas &&
                        !puedeEscribirEn(alcance.misAreas, alcance.totalAreas, d.agentType) && (
                          <span className="knowledge-readonly" title="Podés verlo, no modificarlo">
                            Solo lectura
                          </span>
                        )}
                    </td>
                    <td data-label="Audiencia">
                      <span className={`badge ${d.audience === 'INTERNO' ? 'status-warning' : 'status-idle'}`}>
                        {d.audience}
                      </span>
                    </td>
                    <td data-label="Estado"><EstadoDoc doc={d} /></td>
                    <td data-label="Uso"><UsoCorto usage={d.usage} /></td>
                    <td className="knowledge-row-action">
                      <button type="button" className="secondary" onClick={() => onSelect(d.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.total > 0 && (
            <div className="table-pagination-footer knowledge-pagination">
              <span className="pagination-text">
                Mostrando {desde} a {hasta} de {data.total} documentos
              </span>
              <div className="page-btn-group">
                <button
                  type="button"
                  className="page-nav-btn"
                  aria-label="Página anterior"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  ‹
                </button>
                <span className="page-num-active" aria-current="page">{data.page}</span>
                <button
                  type="button"
                  className="page-nav-btn"
                  aria-label="Página siguiente"
                  disabled={!data.hasMore}
                  onClick={() => setPage(page + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EstadoDoc({ doc }) {
  if (!doc.isActive) return <span className="badge status-idle">Desactivado</span>;
  if (doc.syncStatus === 'PENDING_REINDEX') return <span className="badge status-info">Indexando…</span>;
  if (doc.syncStatus === 'REINDEX_FAILED') return <span className="badge status-error">Sin indexar</span>;
  return <span className="badge status-active">Activo</span>;
}

/**
 * ⚠️ Sin datos NO es 0: se dice "sin datos". Mostrar un promedio de 0 en un
 * documento que nadie consultó nunca invita a darlo de baja por inútil.
 */
function UsoCorto({ usage }) {
  if (!usage?.hasData) return <span className="knowledge-usage is-empty">sin datos</span>;
  return (
    <span className="knowledge-usage" title="Respondidas / recuperadas · score promedio">
      <strong>{usage.answeredCount}/{usage.retrievedCount}</strong> · {usage.avgScore}
    </span>
  );
}

function TextIngestForm({ token, alcance }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('PUBLICO');
  const [agentType, setAgentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleIngest(e) {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await ingestKnowledge(token, {
        title, content, category, audience, agentType: agentType || undefined,
      }));
      setTitle(''); setContent(''); setCategory('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // `agentType` vacío en el formulario es "sin asignar", que en el backend es un
  // documento transversal: lo escribe solo quien es responsable de todas las áreas.
  const bloqueo = alcance?.misAreas
    ? motivoDeBloqueo(alcance.misAreas, alcance.totalAreas, agentType || null)
    : '';

  return (
    <div className="card">
      <h3>Cargar conocimiento como texto</h3>
      <form onSubmit={handleIngest}>
        <div className="field-row">
          <div className="field">
            <label>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Categoría</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Contenido</label>
          <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Audiencia</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="PUBLICO">PUBLICO (cliente + empleado)</option>
              <option value="INTERNO">INTERNO (solo empleado)</option>
            </select>
          </div>
          <div className="field">
            <label>Agente (opcional)</label>
            <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
              <option value="">— sin asignar —</option>
              {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {/* Las áreas ajenas siguen en la lista a propósito: verlas y leer por qué
            no se puede enseña la regla. Sacarlas del desplegable dejaría a alguien
            pensando que el área no existe. */}
        {bloqueo && <p className="hint">{bloqueo}</p>}
        <button type="submit" disabled={busy || !!bloqueo}>
          {busy ? 'Ingestando...' : 'Ingestar'}
        </button>
      </form>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      {result && (
        <p className="success-msg" style={{ marginTop: 12 }}>
          Documento {result.documentId} creado con {result.chunks} chunk(s).
        </p>
      )}
    </div>
  );
}

/**
 * Cómo se pinta el estado del vector de un resultado.
 *
 * `DESFASADO` es el que motivó la columna: el documento cambió y el vector
 * quedó atrás, así que el agente busca contra un texto viejo aunque el panel
 * muestre el nuevo. Pasó de verdad —un renombre que no reindexaba— y no había
 * forma de verlo desde ninguna pantalla.
 *
 * `SIN_VERSION` no es un problema: son chunks anteriores al Sprint 5A, que no
 * guardaban versión. Se distingue de `AL_DIA` porque "no se sabe" no es "está
 * bien", y aplastarlos daría por sano algo que nadie comprobó.
 */
const ESTADO_VECTOR = {
  AL_DIA: { texto: 'al día', clase: 'status-active', title: 'El vector refleja lo que dice el documento hoy' },
  DESFASADO: { texto: '⚠️ desfasado', clase: 'status-warning', title: 'El documento cambió y el vector quedó atrás: el agente busca contra el texto viejo. Reindexá el documento.' },
  HUERFANO: { texto: '⚠️ huérfano', clase: 'status-warning', title: 'El vector existe pero el documento ya no está en la base: nadie puede corregirlo desde el panel' },
  SIN_VERSION: { texto: 'sin versión', clase: 'status-idle', title: 'Fragmento anterior al Sprint 5A: no guarda versión, así que no se puede comparar' },
};

function ResultRow({ r, alcanza }) {
  // El contenido arranca cortado: cinco resultados enteros no se leen. Pero
  // "cortado" tiene que poder abrirse — sin el texto completo no se puede
  // comprobar si el fragmento que recuperó el agente está actualizado, que es
  // justo para lo que sirve esta pantalla.
  const [abierto, setAbierto] = useState(false);
  const largo = r.content.length > 140;
  const estado = ESTADO_VECTOR[r.desincronizado];

  return (
    <article className={`knowledge-result${alcanza === false ? ' is-below' : ''}`}>
      <div className="knowledge-result-score">
        <span className="knowledge-result-score-value">{(r.score * 100).toFixed(1)}%</span>
        <div className="knowledge-result-score-track" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(1, r.score)) * 100}%` }} />
        </div>
        {alcanza === true && <span className="badge status-active">Alcanza</span>}
        {alcanza === false && (
          // No es un error del sistema: es el corte funcionando. Por eso va en
          // gris/aviso y no en rojo de error.
          <span className="badge status-idle" title="Por debajo del umbral: en una conversación real esto habría derivado a una persona">
            Derivaría
          </span>
        )}
      </div>

      <div className="knowledge-result-body">
        <div className="knowledge-result-heading">
          <div className="knowledge-result-title">
            {/* El título CON EL QUE SE VECTORIZÓ, no el vigente. Cuando difieren,
                se muestran los dos: ver solo el vigente taparía el desfase. */}
            <strong>{r.title}</strong>
            {r.desincronizado === 'DESFASADO' && r.vigente?.title !== r.title && (
              <span className="knowledge-result-renamed">hoy se llama «{r.vigente.title}»</span>
            )}
          </div>
          <div className="knowledge-result-vector">
            {estado && (
              <span className={`badge ${estado.clase}`} title={estado.title}>
                {estado.texto}
              </span>
            )}
            {r.version !== undefined && (
              <span className="knowledge-result-version">
                v{r.version}
                {r.vigente && r.vigente.version !== r.version && ` · doc v${r.vigente.version}`}
              </span>
            )}
          </div>
        </div>
        <p className="knowledge-result-content">
          {abierto || !largo ? r.content : `${r.content.slice(0, 140)}…`}
        </p>
        {largo && (
          <button
            type="button"
            className="knowledge-text-button"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? 'Ver menos' : 'Ver el fragmento completo'}
          </button>
        )}
      </div>
    </article>
  );
}

function SearchForm({ token, umbral }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('PUBLICO');
  const [agentType, setAgentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  async function handleSearch(e) {
    e.preventDefault();
    setBusy(true); setError(''); setResults(null);
    try {
      setResults(await searchKnowledge(token, {
        query, audience, agentType: agentType || undefined, k: 5,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="knowledge-panel">
      <header className="knowledge-panel-heading">
        <div>
          <span className="knowledge-kicker">Diagnóstico RAG</span>
          <h3>Probar búsqueda</h3>
        </div>
        {umbral !== null && (
          <span className="knowledge-panel-count">
            Umbral vigente <strong>{(umbral * 100).toFixed(0)}%</strong>
          </span>
        )}
      </header>

      <form className="knowledge-search-form" onSubmit={handleSearch}>
        <div className="knowledge-filter knowledge-search-query">
          <label>Consulta</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: ¿Cuántas cuotas puedo financiar?"
            required
          />
        </div>
        <div className="knowledge-filter">
          <label>Audiencia</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="PUBLICO">PUBLICO</option>
            <option value="INTERNO">INTERNO</option>
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Agente</label>
          <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
            <option value="">Cualquiera</option>
            {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy} className="knowledge-primary-button">
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {results && (
        <div className="knowledge-results">
          <h4 className="knowledge-section-title">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
            {/* Spec 006: el buscador muestra lo crudo, sin el corte del umbral.
                El detalle está en «Info»; acá se recuerda al lado de los números. */}
            <span className="knowledge-label-note">sin filtrar por umbral</span>
          </h4>
          {results.length === 0 && <p className="knowledge-empty">Sin resultados para esa consulta.</p>}
          {results.map((r) => {
            // `null` mientras no se conozca el umbral: sin dato no se opina.
            const alcanza = umbral === null ? null : r.score >= umbral;
            return (
              <ResultRow key={r.documentId + r.content.slice(0, 10)} r={r} alcanza={alcanza} />
            );
          })}
        </div>
      )}
    </section>
  );
}
