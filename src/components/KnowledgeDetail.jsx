import { useEffect, useState } from 'react';
import {
  getKnowledgeDoc,
  updateKnowledgeDoc,
  setKnowledgeActive,
  deleteKnowledgeDoc,
  reindexKnowledgeDoc,
  previewAiEdit,
  applyAiEdit,
} from '../api';
import { motivoDeBloqueo, puedeEscribirEn } from '../areas';
import InfoNotes, { InfoToggle } from './InfoNotes';

const AGENT_TYPES = ['SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];

const INFO_DETALLE = [
  ['Reindexación.',
    'Cambiar el contenido, la audiencia o el agente vuelve a indexar el documento. '
    + 'Cambiar solo el título o la categoría, no.'],
  ['Mientras se indexa.',
    'El cambio ya está guardado, pero hasta que termine el asistente sigue respondiendo '
    + 'con el contenido anterior. No hace falta volver a guardar.'],
  ['Editar con la IA.',
    'La propuesta no se aplica sola: el documento no cambia hasta que la apruebes, y el '
    + 'texto propuesto se puede corregir antes de aplicarlo.'],
];

/**
 * Detalle de un documento (US2/US6/US7): edición manual, activar/desactivar,
 * borrado, indicador de uso, origen y el editor asistido por IA.
 */
export default function KnowledgeDetail({ token, id, alcance, onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function load() {
    try {
      const d = await getKnowledgeDoc(token, id);
      setDoc(d);
      setForm({
        title: d.title,
        content: d.content,
        category: d.category,
        audience: d.audience,
        agentType: d.agentType ?? '',
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateKnowledgeDoc(token, id, {
        ...form,
        agentType: form.agentType || undefined,
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    await setKnowledgeActive(token, id, !doc.isActive);
    await load();
    onChanged?.();
  }

  async function handleDelete() {
    if (!confirm(`¿Borrar definitivamente "${doc.title}"? No se puede deshacer.`)) return;
    await deleteKnowledgeDoc(token, id);
    onChanged?.();
    onClose();
  }

  async function handleReindex() {
    await reindexKnowledgeDoc(token, id);
    await load();
  }

  if (error && !doc) {
    return (
      <>
        <button type="button" className="knowledge-text-button knowledge-back-button" onClick={onClose}>← Volver a documentos</button>
        <p className="error">{error}</p>
      </>
    );
  }
  if (!doc || !form) return <p className="knowledge-empty">Cargando documento…</p>;

  /**
   * Spec 005: el documento se **ve** siempre; se **modifica** solo si es de un área
   * propia. Mientras el alcance no cargó no se bloquea nada — el backend sigue
   * siendo el que decide, así que en el peor caso responde 403.
   */
  const soloLectura =
    !!alcance?.misAreas &&
    !puedeEscribirEn(alcance.misAreas, alcance.totalAreas, doc.agentType);
  const motivo = soloLectura
    ? motivoDeBloqueo(alcance.misAreas, alcance.totalAreas, doc.agentType)
    : '';

  return (
    <>
      <div className="submenu-bar">
        <button type="button" className="btn-pill-action" onClick={onClose}>← Volver a documentos</button>
        <div className="info-bar-actions">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
        </div>
      </div>
      {mostrarInfo && (
        <InfoNotes
          title="Detalle del documento"
          notes={INFO_DETALLE}
          onClose={() => setMostrarInfo(false)}
        />
      )}

      <section className="knowledge-hero knowledge-detail-hero">
        <span className="knowledge-hero-kicker">Documento · versión {doc.version}</span>
        <h2 className="knowledge-hero-title">{doc.title}</h2>
        <div className="knowledge-detail-meta">
          <span className="knowledge-detail-chip">{doc.category}</span>
          <span className="knowledge-detail-chip">{doc.agentType ?? 'General'}</span>
          <span className="knowledge-detail-chip">{doc.audience}</span>
          <span className={`knowledge-detail-chip${doc.isActive ? ' is-active' : ' is-off'}`}>
            {doc.isActive ? 'Activo' : 'Desactivado'}
          </span>
          {soloLectura && <span className="knowledge-detail-chip is-off">Solo lectura</span>}
        </div>
      </section>

      {soloLectura && (
        <p className="knowledge-block-note knowledge-detail-alert">
          <strong>Solo lectura.</strong> {motivo} Podés leerlo entero —para no
          duplicarlo, o para saber a quién pedirle el cambio—, pero las acciones de
          edición están deshabilitadas.
        </p>
      )}

      <SyncIndicator doc={doc} onReindex={handleReindex} soloLectura={soloLectura} />

      <div className="knowledge-detail-layout">
        <section className="knowledge-panel knowledge-detail-main">
          <header className="knowledge-panel-heading">
            <div>
              <span className="knowledge-kicker">Edición manual</span>
              <h3>Contenido del documento</h3>
            </div>
          </header>

          <form onSubmit={handleSave}>
            <div className="knowledge-ingest-fields">
              <div className="knowledge-filter">
                <label>Título</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="knowledge-filter">
                <label>Categoría</label>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="knowledge-filter">
                <label>Audiencia</label>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  <option value="PUBLICO">PUBLICO</option>
                  <option value="INTERNO">INTERNO</option>
                </select>
              </div>
              <div className="knowledge-filter">
                <label>Agente</label>
                <select value={form.agentType} onChange={(e) => setForm({ ...form, agentType: e.target.value })}>
                  <option value="">General</option>
                  {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="knowledge-filter">
              <label>Contenido</label>
              <textarea
                className="knowledge-detail-content"
                rows={14}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="knowledge-form-actions">
              <button
                type="submit"
                className="knowledge-primary-button"
                disabled={saving || soloLectura}
                title={motivo}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </section>

        <aside className="knowledge-detail-side">
          <UsagePanel usage={doc.usage} />
          <SourcePanel source={doc.source} token={token} />

          <section className="knowledge-panel knowledge-side-card">
            <span className="knowledge-kicker">Acciones</span>
            <div className="knowledge-side-actions">
              <button
                type="button"
                className="secondary"
                onClick={handleToggleActive}
                disabled={soloLectura}
                title={motivo}
              >
                {doc.isActive ? 'Desactivar documento' : 'Reactivar documento'}
              </button>
              <button
                type="button"
                className="secondary knowledge-danger-button"
                onClick={handleDelete}
                disabled={soloLectura}
                title={motivo}
              >
                Borrar definitivamente
              </button>
            </div>
          </section>
        </aside>
      </div>

      <AiEditor
        token={token}
        doc={doc}
        soloLectura={soloLectura}
        motivo={motivo}
        onApplied={async () => { await load(); onChanged?.(); }}
      />

      <ChangeLog changes={doc.changes} />
    </>
  );
}

/**
 * Un documento en `PENDING_REINDEX` **sigue respondiendo con su contenido
 * anterior**. Decirlo importa: sin esa aclaración el estado se lee como "se
 * perdió el cambio" y alguien vuelve a guardar.
 */
function SyncIndicator({ doc, onReindex, soloLectura }) {
  if (doc.syncStatus === 'SYNCED') return null;

  const pendiente = doc.syncStatus === 'PENDING_REINDEX';
  return (
    <div className={`knowledge-detail-alert ${pendiente ? 'success-msg' : 'error'}`}>
      {pendiente ? (
        <p>
          <strong>Indexando…</strong> El cambio ya está guardado. Hasta que
          termine, el asistente sigue respondiendo con el contenido anterior.
        </p>
      ) : (
        <>
          <p><strong>No se pudo indexar.</strong> {doc.syncError}</p>
          <p className="hint">
            El asistente sigue respondiendo con el contenido anterior hasta que
            la indexación funcione.
          </p>
          {/* Reindexar también es escribir: entra por la misma regla. */}
          <button
            type="button"
            className="secondary"
            onClick={onReindex}
            disabled={soloLectura}
          >
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}

/**
 * ⚠️ `hasData: false` NO se dibuja como 0. Un documento recién cargado con
 * "score promedio 0" parece inútil, y alguien lo da de baja cuando en realidad
 * nadie preguntó nunca sobre el tema.
 */
function UsagePanel({ usage }) {
  if (!usage) return null;
  return (
    <section className="knowledge-panel knowledge-side-card">
      <span className="knowledge-kicker">Uso</span>
      {!usage.hasData ? (
        <p className="knowledge-side-copy">
          Sin datos todavía: nadie hizo una consulta que lo recuperara.
        </p>
      ) : (
        <>
          <div className="knowledge-stat-grid">
            <div>
              <strong>{usage.retrievedCount}</strong>
              <span>recuperado</span>
            </div>
            <div>
              <strong>{usage.answeredCount}</strong>
              <span>respondió</span>
            </div>
            <div>
              <strong>{usage.avgScore}</strong>
              <span>similitud</span>
            </div>
          </div>
          {usage.answeredCount < usage.retrievedCount && (
            <p className="knowledge-side-copy">
              Aparece más veces de las que alcanza para responder.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SourcePanel({ source, token }) {
  if (!source) return null;

  async function descargar(fileId, filename) {
    const res = await fetch(`http://localhost:3000/knowledge/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return alert('El original ya no está disponible.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="knowledge-panel knowledge-side-card">
      <span className="knowledge-kicker">Origen</span>
      {source.type === 'ESCALADO' && source.escalation ? (
        <p className="knowledge-side-copy">
          Salió de una consulta escalada: «{source.escalation.reason}»
        </p>
      ) : source.file ? (
        <>
          <p className="knowledge-side-copy">
            Archivo <strong className="knowledge-side-file">{source.file.filename}</strong>
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => descargar(source.file.id, source.file.filename)}
          >
            Descargar original
          </button>
        </>
      ) : (
        // Sin `file` no hay nada que bajar: o se cargó como texto, o vino de un
        // audio, que se elimina apenas se transcribe.
        <p className="knowledge-side-copy">Cargado como texto, o transcripto de un audio que ya se eliminó.</p>
      )}
    </section>
  );
}

/**
 * Editar con la IA (US6). Dos pasos separados a propósito: la propuesta no
 * toca el documento, y lo que se guarda es el texto que el supervisor confirma
 * —editable— nunca uno regenerado.
 */
function AiEditor({ token, doc, soloLectura, motivo, onApplied }) {
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState(null);
  const [editedContent, setEditedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState('');

  async function handlePreview(e) {
    e.preventDefault();
    setLoading(true);
    setError(''); setConflict(null); setProposal(null);
    try {
      const p = await previewAiEdit(token, doc.id, instruction);
      setProposal(p);
      setEditedContent(p.proposedContent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setLoading(true);
    setError(''); setConflict(null);
    try {
      await applyAiEdit(token, doc.id, {
        baseVersion: proposal.baseVersion,
        content: editedContent,
        instruction,
      });
      setProposal(null); setInstruction('');
      onApplied();
    } catch (err) {
      // 409: otro supervisor guardó mientras tanto. Se ofrece regenerar sobre
      // el texto vigente en vez de dejarlo en "falló".
      if (err.status === 409) setConflict(err.body);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // La propuesta no persiste nada, así que podría generarse igual; pero ofrecerla
  // sabiendo que el "Aplicar" va a dar 403 es hacer trabajar al modelo —y a la
  // persona— para nada.
  if (soloLectura) {
    return (
      <section className="knowledge-panel">
        <AiEditorHeading />
        <p className="knowledge-side-copy">No disponible: {motivo}</p>
      </section>
    );
  }

  return (
    <section className="knowledge-panel">
      <AiEditorHeading />
      <form className="knowledge-ai-form" onSubmit={handlePreview}>
        <div className="knowledge-filter">
          <label>¿Qué querés cambiar?</label>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ej: el anticipo mínimo pasó de 20% a 30%"
            required
          />
        </div>
        <button type="submit" className="knowledge-primary-button" disabled={loading}>
          {loading ? 'Preparando…' : '✨ Proponer cambio'}
        </button>
      </form>

      {error && <p className="error knowledge-ai-message">{error}</p>}

      {conflict && (
        <div className="error knowledge-ai-message">
          <p>{conflict.message}</p>
          <button type="button" className="secondary" onClick={handlePreview}>
            Regenerar sobre la versión {conflict.currentVersion}
          </button>
        </div>
      )}

      {proposal && !proposal.confident && (
        <div className="error knowledge-ai-message">
          <p><strong>No se pudo resolver el pedido.</strong> {proposal.summary}</p>
          <p className="hint">
            El documento quedó intacto. Probá con una instrucción más concreta,
            o editalo a mano arriba.
          </p>
        </div>
      )}

      {proposal && proposal.confident && (
        <div className="knowledge-ai-proposal">
          <p className="success-msg">{proposal.summary}</p>

          {proposal.changedSections.length > 0 && (
            <div className="knowledge-table-wrap">
              <table className="knowledge-diff-table">
                <thead><tr><th>Antes</th><th>Después</th></tr></thead>
                <tbody>
                  {proposal.changedSections.map((s, i) => (
                    <tr key={i}>
                      <td className="is-before">{s.before}</td>
                      <td className="is-after">{s.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="knowledge-filter knowledge-ai-edited">
            <label>Texto propuesto (editable antes de aplicar)</label>
            <textarea rows={10} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} />
          </div>

          <div className="knowledge-form-actions">
            <button type="button" className="secondary" onClick={() => setProposal(null)}>
              Descartar propuesta
            </button>
            <button type="button" className="knowledge-primary-button" onClick={handleApply} disabled={loading}>
              {loading ? 'Aplicando…' : 'Aprobar y aplicar'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AiEditorHeading() {
  return (
    <header className="knowledge-panel-heading">
      <div>
        <span className="knowledge-kicker">Asistido por IA</span>
        <h3>Editar con la IA</h3>
      </div>
      <span className="knowledge-option-icon" aria-hidden="true">✣</span>
    </header>
  );
}

function ChangeLog({ changes }) {
  if (!changes?.length) return null;
  return (
    <section className="knowledge-panel">
      <header className="knowledge-panel-heading">
        <div>
          <span className="knowledge-kicker">Auditoría</span>
          <h3>Historial de cambios</h3>
        </div>
        <span className="knowledge-panel-count">{changes.length} cambios</span>
      </header>
      <div className="knowledge-table-wrap">
        <table className="knowledge-history-table">
          <thead>
            <tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Origen</th></tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
                <td>{c.author?.name ?? '—'}</td>
                <td>
                  {c.changedFields.join(', ')}
                  {c.aiInstruction && <span className="knowledge-history-instruction">«{c.aiInstruction}»</span>}
                </td>
                <td>
                  <span className={`badge ${c.origin === 'AI_ACCEPTED' ? 'status-info' : 'status-idle'}`}>
                    {c.origin === 'AI_ACCEPTED' ? 'con IA' : 'manual'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
