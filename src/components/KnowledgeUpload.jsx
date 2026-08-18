import { useEffect, useRef, useState } from 'react';
import { uploadKnowledgeFile, listKnowledgeFiles } from '../api';

const AGENT_TYPES = ['SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];

// Mismo criterio que ChatSimulator: intervalo corto y tope de intentos, para
// no dejar un loop infinito si un archivo queda trabado.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 40; // ~2 min

const FILE_STATUS_CLASS = {
  READY: 'badge status-active',
  PROCESSING: 'badge status-info',
  FAILED: 'badge status-error',
};

/**
 * Subida de archivos a la base de conocimiento (US1).
 *
 * El backend responde **202 sin esperar la extracción**, así que la pantalla
 * no puede quedarse colgada: muestra el archivo en `PROCESSING` y hace polling
 * hasta que el worker lo resuelve.
 */
export default function KnowledgeUpload({ token, onIngested }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('INTERNO');
  const [agentType, setAgentType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

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
      /* el listado es informativo: un fallo acá no rompe la pantalla */
    }
  }

  async function handleUpload(e, force = false) {
    e?.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadKnowledgeFile(
        token,
        { file, title, category, audience, agentType: agentType || undefined },
        force,
      );
      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      clearTimeout(pollRef.current);
      refreshFiles();
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <h3>Subir un archivo</h3>
      <p className="hint">
        PDF, Word (.docx), imágenes (JPG/PNG/WEBP) o audio (MP3, WAV, OGG, AAC,
        FLAC). El texto se extrae en segundo plano: la carga responde al toque y
        el archivo aparece abajo como “procesando”.
      </p>

      <form onSubmit={handleUpload}>
        <div className="field">
          <label>Archivo</label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Título (opcional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Si se omite, se usa el nombre del archivo"
            />
          </div>
          <div className="field">
            <label>Categoría</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Audiencia</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="INTERNO">INTERNO (solo empleados)</option>
              <option value="PUBLICO">PUBLICO (clientes y empleados)</option>
            </select>
          </div>
          <div className="field">
            <label>Agente (opcional)</label>
            <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
              <option value="">— documento general —</option>
              {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={uploading || !file}>
          {uploading ? 'Subiendo...' : 'Subir'}
        </button>
      </form>

      {error && <UploadError error={error} onForce={(e) => handleUpload(e, true)} />}

      <h4 style={{ marginTop: 24 }}>Cargas recientes</h4>
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
                  {/* `failureReason` viene redactado en castellano y sin jerga
                      a propósito: se muestra tal cual, no se reemplaza por un
                      "Error al procesar" genérico. */}
                  {f.status === 'FAILED' && <span className="error">{f.failureReason}</span>}
                  {f.status === 'READY' && <span className="hint">Listo para consultar</span>}
                  {f.status === 'PROCESSING' && <span className="hint">Extrayendo el texto…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Los errores de subida no son intercambiables: cada uno le pide al supervisor
 * una acción distinta, así que se leen por `reason` y no por el texto.
 */
function UploadError({ error, onForce }) {
  if (error.status === 409 && error.body?.existing) {
    const previo = error.body.existing;
    return (
      <div className="error" style={{ marginTop: 12 }}>
        <p>
          Ese archivo ya se había subido como <strong>{previo.filename}</strong>
          {previo.createdAt && ` el ${new Date(previo.createdAt).toLocaleDateString()}`}.
        </p>
        {/* El 409 es detección, no prohibición: el supervisor puede insistir. */}
        <button type="button" className="secondary" onClick={onForce}>
          Subirlo igual
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
            ? 'Las imágenes y audios se procesan con un modelo de IA, que tiene un tope más bajo. Un PDF grande, en cambio, se extrae acá y sí entraría.'
            : 'Dividí el material en partes más chicas y subilas por separado.'}
        </p>
      </div>
    );
  }

  return <p className="error" style={{ marginTop: 12 }}>{error.message}</p>;
}
