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

export default function KnowledgeIngestForm({ token, alcance, onIngested }) {
  const [mode, setMode] = useState('text'); // 'text' | 'file'
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

  async function refreshFiles(tries = 0) {
    try {
      const res = await listKnowledgeFiles(token, { limit: 8 });
      setFiles(res.data);
      const procesando = res.data.some((f) => f.status === 'PROCESSING');
      if (procesando && tries < POLL_MAX_TRIES) {
        pollRef.current = setTimeout(() => refreshFiles(tries + 1), POLL_INTERVAL_MS);
      } else if (!procesando) {
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

    if (mode === 'text') {
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
      // mode === 'file'
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
        refreshFiles();
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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3>Cargar conocimiento</h3>
          <p className="hint">
            Agregá información a la base de conocimiento redactando texto directo o subiendo documentos (PDF, Word, imagen o audio).
          </p>
        </div>
      </div>

      {/* Selector de modo unificado */}
      <div className="submenu-pills" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`submenu-pill${mode === 'text' ? ' active' : ''}`}
          onClick={() => { setMode('text'); setError(null); setResultMsg(''); }}
        >
          ✍️ Escribir o pegar texto
        </button>
        <button
          type="button"
          className={`submenu-pill${mode === 'file' ? ' active' : ''}`}
          onClick={() => { setMode('file'); setError(null); setResultMsg(''); }}
        >
          📄 Subir archivo (PDF, Word, imágenes, audio)
        </button>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)}>
        <div className="field-row">
          <div className="field">
            <label>Título {mode === 'file' ? '(opcional)' : '(obligatorio)'}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === 'file' ? 'Si se omite, se usa el nombre del archivo' : 'Ej: Política de entregas'}
              required={mode === 'text'}
            />
          </div>
          <div className="field">
            <label>Categoría</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej: Cobranzas, Planes, FAQs"
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Audiencia</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="PUBLICO">PUBLICO (clientes y empleados)</option>
              <option value="INTERNO">INTERNO (solo empleados)</option>
            </select>
          </div>
          <div className="field">
            <label>Área / Agente asignado</label>
            <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
              {alcance?.misAreas && alcance.misAreas.length === alcance.totalAreas && (
                <option value="">— documento general (todas las áreas) —</option>
              )}
              {availableAgents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {mode === 'text' ? (
          <div className="field">
            <label>Contenido del documento</label>
            <textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribí o pegá acá el texto completo para responder dudas sobre este tema..."
              required
            />
          </div>
        ) : (
          <div className="field">
            <label>Seleccionar archivo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.aac,.flac"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            <p className="hint" style={{ marginTop: 4 }}>
              Formatos aceptados: PDF, Word (.docx), texto (.txt), imágenes (JPG/PNG/WEBP) o audio (MP3/WAV/OGG).
            </p>
          </div>
        )}

        {bloqueo && <p className="hint" style={{ color: 'var(--error)' }}>{bloqueo}</p>}

        <button
          type="submit"
          disabled={busy || !!bloqueo || (mode === 'file' && !file)}
          style={{ marginTop: 12 }}
        >
          {busy
            ? (mode === 'text' ? 'Guardando...' : 'Subiendo archivo...')
            : (mode === 'text' ? 'Guardar texto en base de conocimiento' : 'Subir y procesar archivo')}
        </button>
      </form>

      {error && <FormError error={error} onForce={(e) => handleSubmit(e, true)} />}
      {resultMsg && <p className="success-msg" style={{ marginTop: 12 }}>{resultMsg}</p>}

      {/* Historial de archivos subidos recientemente */}
      <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <h4>Archivos procesados recientemente</h4>
        {files.length === 0 && <p className="hint">Todavía no se subió ningún archivo.</p>}
        {files.length > 0 && (
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Archivo</th><th>Estado</th><th>Detalle</th></tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{f.filename}</td>
                  <td>
                    <span className={FILE_STATUS_CLASS[f.status] ?? 'badge'}>
                      {f.status === 'PROCESSING' ? 'PROCESANDO' : f.status}
                    </span>
                  </td>
                  <td>
                    {f.status === 'FAILED' && <span className="error">{f.failureReason}</span>}
                    {f.status === 'READY' && <span className="hint">Listo para consultar</span>}
                    {f.status === 'PROCESSING' && <span className="hint">Extrayendo texto y vectorizando…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

