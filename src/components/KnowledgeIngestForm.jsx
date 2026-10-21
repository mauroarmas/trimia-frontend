import { useEffect, useRef, useState } from 'react';
import { ingestKnowledge, uploadKnowledgeFile, listKnowledgeFiles } from '../api';
import { motivoDeBloqueo } from '../areas';

const AGENT_TYPES = ['SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 40;

const FILE_STATUS_CLASS = {
  READY: 'badge status-active',
  PROCESSING: 'badge status-info',
  FAILED: 'badge status-error',
};

const FILE_STATUS_LABEL = {
  READY: 'Listo',
  PROCESSING: 'Procesando',
  FAILED: 'Falló',
};

export default function KnowledgeIngestForm({ token, alcance, onIngested, onViewAll, onSearch }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('PUBLICO');
  const [agentType, setAgentType] = useState('');

  // Texto
  const [content, setContent] = useState('');

  // Archivo
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resultMsg, setResultMsg] = useState('');

  useEffect(() => {
    refreshFiles();
    return () => clearTimeout(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshFiles(tries = 0, notifyWhenDone = false) {
    try {
      const res = await listKnowledgeFiles(token, { limit: 8 });
      setFiles(res.data);
      const procesando = res.data.some((f) => f.status === 'PROCESSING');
      if (procesando && tries < POLL_MAX_TRIES) {
        pollRef.current = setTimeout(() => refreshFiles(tries + 1, notifyWhenDone), POLL_INTERVAL_MS);
      } else if (!procesando && notifyWhenDone) {
        onIngested?.();
      }
    } catch {
      // informativo
    }
  }

  async function handleSubmit(e, force = false) {
    e?.preventDefault();
    setError(null);
    setResultMsg('');

    const hasText = Boolean(content.trim());
    const hasFile = Boolean(file);
    if (hasText && hasFile) {
      setError({ message: 'Elegí solo una opción: escribí el contenido o seleccioná un archivo.' });
      return;
    }
    if (!hasText && !hasFile) {
      setError({ message: 'Escribí el contenido o seleccioná un archivo para continuar.' });
      return;
    }

    if (hasText) {
      if (!title.trim() || !content.trim() || !category.trim()) {
        setError({ message: 'Título, categoría y contenido son obligatorios para cargar texto.' });
        return;
      }
      setBusy(true);
      try {
        const res = await ingestKnowledge(token, {
          title: title.trim(),
          content: content.trim(),
          category: category.trim(),
          audience,
          agentType: agentType || undefined,
        });
        setResultMsg(`Documento creado correctamente con ${res.chunks ?? 1} fragmento(s) en la base de conocimiento.`);
        setTitle('');
        setContent('');
        setCategory('');
        onIngested?.();
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    } else {
      // File upload branch
      if (!file) {
        setError({ message: 'Seleccioná un archivo para subir.' });
        return;
      }
      if (!category.trim()) {
        setError({ message: 'La categoría es obligatoria.' });
        return;
      }
      setBusy(true);
      try {
        await uploadKnowledgeFile(
          token,
          { file, title: title.trim() || undefined, category: category.trim(), audience, agentType: agentType || undefined },
          force,
        );
        setResultMsg('Archivo subido. El texto se está extrayendo y vectorizando en segundo plano.');
        setFile(null);
        setTitle('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        clearTimeout(pollRef.current);
        refreshFiles(0, true);
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    }
  }

  const bloqueo = alcance?.misAreas
    ? motivoDeBloqueo(alcance.misAreas, alcance.totalAreas, agentType || null)
    : '';

  // Filtrar los agentTypes visibles según las áreas supervisadas de quien está mirando
  const availableAgents = AGENT_TYPES.filter((a) => {
    if (!alcance?.misAreas) return true;
    if (alcance.misAreas.length === alcance.totalAreas) return true;
    return alcance.misAreas.some((area) => area.agentType === a);
  });

  const usandoArchivo = Boolean(file) && !content.trim();

  return (
    <div className="knowledge-ingest-layout">
      <section className="knowledge-panel knowledge-ingest-card">
        <header className="knowledge-panel-heading">
          <div>
            <span className="knowledge-kicker">Nuevo documento</span>
            <h3>Cargar conocimiento</h3>
            <p className="knowledge-panel-description">
              Redactá el texto directamente o subí un documento (PDF, Word, imagen o audio).
            </p>
          </div>
        </header>

        <form className="knowledge-ingest-form" onSubmit={(e) => handleSubmit(e, false)}>
          <div className="knowledge-ingest-fields">
            <div className="knowledge-filter">
              <label>
                Título <span className="knowledge-label-note">{usandoArchivo ? 'opcional' : 'obligatorio'}</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={usandoArchivo ? 'Si se omite, se usa el nombre del archivo' : 'Ej: Política de entregas'}
                required={!file}
              />
            </div>
            <div className="knowledge-filter">
              <label>Categoría</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej: Cobranzas, Planes, FAQs"
                required
              />
            </div>
            <div className="knowledge-filter">
              <label>Audiencia</label>
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="PUBLICO">PUBLICO (clientes y empleados)</option>
                <option value="INTERNO">INTERNO (solo empleados)</option>
              </select>
            </div>
            <div className="knowledge-filter">
              <label>Área / Agente asignado</label>
              <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
                {alcance?.misAreas && alcance.misAreas.length === alcance.totalAreas && (
                  <option value="">Documento general (todas las áreas)</option>
                )}
                {availableAgents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <h4 className="knowledge-section-title">
            Contenido <span className="knowledge-label-note">elegí una sola opción</span>
          </h4>
          <div className="knowledge-source-options">
            <div className={`knowledge-input-option${content.trim() ? ' is-selected' : ''}${file ? ' is-dimmed' : ''}`}>
              <div className="knowledge-option-heading">
                <span className="knowledge-option-icon" aria-hidden="true">✎</span>
                <div>
                  <h4>Escribir texto</h4>
                  <p className="knowledge-option-copy">Pegá la información que el asistente debe conocer.</p>
                </div>
              </div>
              <textarea
                rows={8}
                value={content}
                aria-label="Contenido del documento"
                onChange={(e) => { setContent(e.target.value); setError(null); setResultMsg(''); }}
                placeholder="Escribí o pegá acá el texto completo para responder dudas sobre este tema…"
              />
            </div>

            <div className={`knowledge-input-option${file ? ' is-selected' : ''}${content.trim() ? ' is-dimmed' : ''}`}>
              <div className="knowledge-option-heading">
                <span className="knowledge-option-icon" aria-hidden="true">⇪</span>
                <div>
                  <h4>Subir un archivo</h4>
                  <p className="knowledge-option-copy">El texto se extrae y vectoriza automáticamente.</p>
                </div>
              </div>
              <label className={`knowledge-dropzone${file ? ' has-file' : ''}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.aac,.flac"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setResultMsg(''); }}
                />
                <span className="knowledge-dropzone-title">
                  {file ? file.name : 'Hacé clic para seleccionar un archivo'}
                </span>
                <span className="knowledge-dropzone-hint">
                  {file
                    ? 'Hacé clic para cambiarlo'
                    : 'PDF, Word (.docx), texto (.txt), imágenes (JPG/PNG/WEBP) o audio (MP3/WAV/OGG)'}
                </span>
              </label>
              {file && (
                <button
                  type="button"
                  className="knowledge-text-button"
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                >
                  Quitar archivo
                </button>
              )}
            </div>
          </div>

          {bloqueo && <p className="knowledge-block-note">{bloqueo}</p>}
          {error && <FormError error={error} onForce={(e) => handleSubmit(e, true)} />}
          {resultMsg && <p className="success-msg">{resultMsg}</p>}

          <div className="knowledge-form-actions">
            <button
              type="submit"
              disabled={busy || !!bloqueo || (!content.trim() && !file)}
              className="knowledge-primary-button"
            >
              {busy
                ? (file ? 'Subiendo archivo…' : 'Guardando texto…')
                : 'Guardar conocimiento'}
            </button>
          </div>
        </form>
      </section>

      {/* Historial de archivos subidos recientemente */}
      <aside className="knowledge-panel knowledge-recent-files">
        <header className="knowledge-recent-heading">
          <h3>Procesados recientemente</h3>
          <button type="button" className="knowledge-text-button" onClick={onViewAll}>Ver todos</button>
        </header>
        {files.length === 0 && <p className="knowledge-empty">Todavía no se subió ningún archivo.</p>}
        {files.length > 0 && (
          <ul className="knowledge-recent-list">
            {files.map((f) => (
              <li key={f.id} className="knowledge-recent-item">
                <span className="knowledge-recent-name" title={f.filename}>{f.filename}</span>
                <div className="knowledge-recent-meta">
                  <span className={FILE_STATUS_CLASS[f.status] ?? 'badge'}>
                    {FILE_STATUS_LABEL[f.status] ?? f.status}
                  </span>
                  <span className={`knowledge-recent-detail${f.status === 'FAILED' ? ' is-error' : ''}`}>
                    {f.status === 'FAILED' && f.failureReason}
                    {f.status === 'READY' && 'Listo para consultar'}
                    {f.status === 'PROCESSING' && 'Extrayendo texto y vectorizando…'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="knowledge-search-tip">
          Después de cargar, usá <button type="button" className="knowledge-text-button" onClick={onSearch}>Probar búsqueda</button> para
          revisar que el asistente encuentre el contenido.
        </div>
      </aside>
    </div>
  );
}

function FormError({ error, onForce }) {
  if (error.status === 409 && error.body?.existing) {
    const previo = error.body.existing;
    return (
      <div className="error" style={{ marginTop: 12 }}>
        <p>
          Ese archivo ya se había subido como <strong>{previo.filename}</strong>
          {previo.createdAt && ` el ${new Date(previo.createdAt).toLocaleDateString()}`}.
        </p>
        <button type="button" className="secondary" onClick={onForce} style={{ marginTop: 6 }}>
          Subirlo de todas formas
        </button>
      </div>
    );
  }

  if (error.status === 413) {
    const esMultimodal = error.reason === 'MULTIMODAL_LIMIT';
    return (
      <div className="error" style={{ marginTop: 12 }}>
        <p>{error.message}</p>
        <p className="hint">
          {esMultimodal
            ? 'Las imágenes y audios se procesan con un modelo de IA que tiene un tope más bajo.'
            : 'Dividí el material en partes más chicas y subilas por separado.'}
        </p>
      </div>
    );
  }

  return <p className="error" style={{ marginTop: 12 }}>{error.message || String(error)}</p>;
}

