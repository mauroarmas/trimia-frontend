import { useCallback, useEffect, useState } from 'react';
import { ingestKnowledge, searchKnowledge, listKnowledge } from '../api';
import KnowledgeUpload from './KnowledgeUpload';
import KnowledgeDetail from './KnowledgeDetail';

const AGENT_TYPES = ['ORCHESTRATOR', 'SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];
const PAGE_SIZE = 15;

export default function KnowledgeIngest({ token }) {
  const [view, setView] = useState('lista'); // lista | subir | alta | buscar
  const [selectedId, setSelectedId] = useState(null);

  if (selectedId) {
    return (
      <KnowledgeDetail token={token} id={selectedId} onClose={() => setSelectedId(null)} />
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

      {view === 'lista' && <KnowledgeList token={token} onSelect={setSelectedId} />}
      {view === 'subir' && <KnowledgeUpload token={token} />}
      {view === 'alta' && <TextIngestForm token={token} />}
      {view === 'buscar' && <SearchForm token={token} />}
    </div>
  );
}

/** Listado con filtros por área, categoría y estado (FR-019). */
function KnowledgeList({ token, onSelect }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [agentType, setAgentType] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (agentType) params.agentType = agentType;
      if (category) params.category = category;
      if (isActive !== '') params.isActive = isActive;
      setData(await listKnowledge(token, params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, agentType, category, isActive]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card">
      <h3>Documentos de la base de conocimiento</h3>

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
                  <td>{d.agentType ?? 'general'}</td>
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

function TextIngestForm({ token }) {
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
        <button type="submit" disabled={busy}>{busy ? 'Ingestando...' : 'Ingestar'}</button>
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

function SearchForm({ token }) {
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
    <div className="card">
      <h3>Probar búsqueda (RAG)</h3>
      <p className="hint">
        Sirve para comprobar la confidencialidad: la misma consulta con
        audiencia PUBLICO no debería recuperar documentos INTERNO.
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
          <thead><tr><th>Score</th><th>Título</th><th>Contenido</th></tr></thead>
          <tbody>
            {results.length === 0 && <tr><td colSpan={3}>Sin resultados.</td></tr>}
            {results.map((r) => (
              <tr key={r.documentId + r.content.slice(0, 10)}>
                <td>{r.score.toFixed(3)}</td>
                <td>{r.title}</td>
                <td>{r.content.slice(0, 140)}{r.content.length > 140 ? '…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
