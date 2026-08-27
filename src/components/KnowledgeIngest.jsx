import { useCallback, useEffect, useState } from 'react';
import {
  ingestKnowledge,
  searchKnowledge,
  getAgentsStatus,
  listKnowledge,
  getEmployee,
  listSectors,
} from '../api';
import KnowledgeUpload from './KnowledgeUpload';
import KnowledgeDetail from './KnowledgeDetail';
import KnowledgeHygiene from './KnowledgeHygiene';
import { motivoDeBloqueo, puedeEscribirEn } from '../areas';

const AGENT_TYPES = ['ORCHESTRATOR', 'SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];
const PAGE_SIZE = 15;

export default function KnowledgeIngest({ token, me }) {
  const [view, setView] = useState('lista'); // lista | subir | alta | buscar
  const [selectedId, setSelectedId] = useState(null);

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

  if (selectedId) {
    return (
      <KnowledgeDetail
        token={token}
        id={selectedId}
        alcance={alcance}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          ['lista', 'Documentos'],
          ['subir', 'Subir archivo'],
          ['alta', 'Cargar texto'],
          ['buscar', 'Probar búsqueda'],
          ['higiene', 'Limpiar base de conocimiento'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'lista' && (
        <KnowledgeList token={token} alcance={alcance} onSelect={setSelectedId} />
      )}
      {view === 'higiene' && <KnowledgeHygiene token={token} />}
      {view === 'subir' && <KnowledgeUpload token={token} alcance={alcance} />}
      {view === 'alta' && <TextIngestForm token={token} alcance={alcance} />}
      {view === 'buscar' && <SearchForm token={token} />}
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

  return (
    <div className="card">
      <h3>Documentos de la base de conocimiento</h3>

      <div className="field">
        <label>Buscar</label>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Por título o contenido…"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Área</label>
          <select value={agentType} onChange={(e) => { setPage(1); setAgentType(e.target.value); }}>
            <option value="">— todas —</option>
            {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Categoría</label>
          <input
            value={category}
            onChange={(e) => { setPage(1); setCategory(e.target.value); }}
            placeholder="— todas —"
          />
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={isActive} onChange={(e) => { setPage(1); setIsActive(e.target.value); }}>
            <option value="">— todos —</option>
            <option value="true">Activos</option>
            <option value="false">Desactivados</option>
          </select>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Cargando…</p>}

      {data && (
        <>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Título</th><th>Área</th><th>Audiencia</th>
                <th>Estado</th><th>Uso</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.length === 0 && (
                <tr><td colSpan={6}>No hay documentos con esos filtros.</td></tr>
              )}
              {data.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.title}
                    <div className="hint">{d.summary?.slice(0, 90)}…</div>
                  </td>
                  <td>
                    {d.agentType ?? 'general'}
                    {/* Se marca, no se esconde: ver no es editar (FR-013). Saber
                        de entrada cuáles no vas a poder tocar evita abrir el
                        detalle para descubrirlo. */}
                    {alcance?.misAreas &&
                      !puedeEscribirEn(alcance.misAreas, alcance.totalAreas, d.agentType) && (
                        <div className="hint" title="Podés verlo, no modificarlo">
                          solo lectura
                        </div>
                      )}
                  </td>
                  <td>
                    <span className={`badge ${d.audience === 'INTERNO' ? 'status-warning' : 'status-idle'}`}>
                      {d.audience}
                    </span>
                  </td>
                  <td><EstadoDoc doc={d} /></td>
                  <td><UsoCorto usage={d.usage} /></td>
                  <td>
                    <button type="button" className="secondary" onClick={() => onSelect(d.id)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button type="button" className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              ← Anterior
            </button>
            <span className="hint">Página {data.page} · {data.total} documentos</span>
            <button type="button" className="secondary" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
              Siguiente →
            </button>
          </div>
        </>
      )}
    </div>
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
  if (!usage?.hasData) return <span className="hint">sin datos</span>;
  return (
    <span className="hint">
      {usage.answeredCount}/{usage.retrievedCount} · {usage.avgScore}
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
    <tr>
      <td style={alcanza === false ? { color: 'var(--text-muted)' } : undefined}>
        {r.score.toFixed(3)}
      </td>
      <td>
        {alcanza === null && <span className="hint">—</span>}
        {alcanza === true && <span className="badge status-active">sí</span>}
        {alcanza === false && (
          // No es un error del sistema: es el corte funcionando. Por eso va en
          // gris/aviso y no en rojo de error.
          <span className="badge status-idle" title="Por debajo del umbral: en una conversación real esto habría derivado a una persona">
            derivaría
          </span>
        )}
      </td>
      <td>
        {/* El título CON EL QUE SE VECTORIZÓ, no el vigente. Cuando difieren,
            se muestran los dos: ver solo el vigente taparía el desfase. */}
        {r.title}
        {r.desincronizado === 'DESFASADO' && r.vigente?.title !== r.title && (
          <div className="hint" style={{ color: '#b45309' }}>
            hoy se llama «{r.vigente.title}»
          </div>
        )}
      </td>
      <td>
        {estado && (
          <span className={`badge ${estado.clase}`} title={estado.title}>
            {estado.texto}
          </span>
        )}
        {r.version !== undefined && (
          <div className="hint">
            v{r.version}
            {r.vigente && r.vigente.version !== r.version && ` · doc v${r.vigente.version}`}
          </div>
        )}
      </td>
      <td>
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {abierto || !largo ? r.content : `${r.content.slice(0, 140)}…`}
        </div>
        {largo && (
          <button
            type="button"
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 11, marginTop: 4 }}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? 'Ver menos' : 'Ver el fragmento completo'}
          </button>
        )}
      </td>
    </tr>
  );
}

function SearchForm({ token }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('PUBLICO');
  const [agentType, setAgentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  // Umbral vigente (spec 006). No hace falta endpoint nuevo: `agents/status` ya
  // lo devuelve y el Panel del Supervisor ya lo pinta.
  const [umbral, setUmbral] = useState(null);

  useEffect(() => {
    let vivo = true;
    getAgentsStatus(token)
      .then((d) => { if (vivo) setUmbral(d?.confidenceThreshold ?? null); })
      // Si falla, la tabla se muestra igual pero sin la marca de umbral: es
      // información de más, no un requisito para buscar.
      .catch(() => {});
    return () => { vivo = false; };
  }, [token]);

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
    <div className="card">
      <h3>Probar búsqueda (RAG)</h3>
      <p className="hint">
        Sirve para comprobar la confidencialidad: la misma consulta con
        audiencia PUBLICO no debería recuperar documentos INTERNO.
      </p>
      {/*
        Spec 006. Este buscador NO aplica el umbral a propósito: muestra lo
        crudo que devuelve el RAG para poder inspeccionarlo. Sin decirlo, cinco
        resultados en 53% se leen como «encontró esto» cuando en una
        conversación real esos mismos habrían derivado a un humano — que es
        justo lo que hizo pensar que había un bug donde no lo había.
      */}
      <p className="hint">
        <strong>Muestra todo lo que recupera, sin filtrar.</strong> En una
        conversación real el asistente solo responde si el mejor resultado
        alcanza el umbral
        {umbral !== null && <> de <strong>{(umbral * 100).toFixed(0)}%</strong></>};
        por debajo deriva a una persona. Acá no se aplica ese corte a propósito,
        para poder ver lo crudo.
      </p>
      <p className="hint">
        La columna <strong>Vector</strong> dice si lo que el agente busca está al
        día. <strong>Desfasado</strong> significa que el documento se editó y el
        vector quedó atrás: la búsqueda sigue corriendo contra el texto viejo
        aunque el panel muestre el nuevo. Se arregla reindexando el documento
        desde su ficha.
      </p>
      <form onSubmit={handleSearch}>
        <div className="field">
          <label>Consulta</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Audiencia</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="PUBLICO">PUBLICO</option>
              <option value="INTERNO">INTERNO</option>
            </select>
          </div>
          <div className="field">
            <label>Agente (opcional)</label>
            <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
              <option value="">— cualquiera —</option>
              {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={busy} className="secondary">
          {busy ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      {results && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Score</th>
              <th>¿Alcanza?</th>
              <th>Título</th>
              <th>Vector</th>
              <th>Contenido</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && <tr><td colSpan={5}>Sin resultados.</td></tr>}
            {results.map((r) => {
              // `null` mientras no se conozca el umbral: sin dato no se opina.
              const alcanza = umbral === null ? null : r.score >= umbral;
              return (
                <ResultRow key={r.documentId + r.content.slice(0, 10)} r={r} alcanza={alcanza} />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
