import { useState } from 'react';
import { ingestKnowledge, searchKnowledge } from '../api';

const AGENT_TYPES = ['ORCHESTRATOR', 'SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];

export default function KnowledgeIngest({ token }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('PUBLICO');
  const [agentType, setAgentType] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState('');

  const [query, setQuery] = useState('');
  const [searchAudience, setSearchAudience] = useState('PUBLICO');
  const [searchAgentType, setSearchAgentType] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState('');

  async function handleIngest(e) {
    e.preventDefault();
    setIngesting(true);
    setIngestError('');
    setIngestResult(null);
    try {
      const res = await ingestKnowledge(token, {
        title,
        content,
        category,
        audience,
        agentType: agentType || undefined,
      });
      setIngestResult(res);
      setTitle('');
      setContent('');
      setCategory('');
    } catch (err) {
      setIngestError(err.message);
    } finally {
      setIngesting(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setSearching(true);
    setSearchError('');
    setResults(null);
    try {
      const res = await searchKnowledge(token, {
        query,
        audience: searchAudience,
        agentType: searchAgentType || undefined,
        k: 5,
      });
      setResults(res);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h3>Ingestar documento</h3>
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
          <button type="submit" disabled={ingesting}>
            {ingesting ? 'Ingestando...' : 'Ingestar'}
          </button>
        </form>
        {ingestError && <p className="error" style={{ marginTop: 12 }}>{ingestError}</p>}
        {ingestResult && (
          <p className="success-msg" style={{ marginTop: 12 }}>
            Documento {ingestResult.documentId} creado con {ingestResult.chunks} chunk(s).
          </p>
        )}
      </div>

      <div className="card">
        <h3>Probar búsqueda (RAG)</h3>
        <form onSubmit={handleSearch}>
          <div className="field">
            <label>Consulta</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} required />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Audiencia</label>
              <select value={searchAudience} onChange={(e) => setSearchAudience(e.target.value)}>
                <option value="PUBLICO">PUBLICO</option>
                <option value="INTERNO">INTERNO</option>
              </select>
            </div>
            <div className="field">
              <label>Agente (opcional)</label>
              <select value={searchAgentType} onChange={(e) => setSearchAgentType(e.target.value)}>
                <option value="">— cualquiera —</option>
                {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={searching} className="secondary">
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
        {searchError && <p className="error" style={{ marginTop: 12 }}>{searchError}</p>}
        {results && (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Score</th><th>Título</th><th>Contenido</th></tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr><td colSpan={3}>Sin resultados.</td></tr>
              )}
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
    </div>
  );
}
