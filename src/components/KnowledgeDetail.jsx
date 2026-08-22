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

const AGENT_TYPES = ['SALES', 'COLLECTIONS', 'LOGISTICS', 'DEPOSITS', 'ADMIN'];

/**
 * Detalle de un documento (US2/US6/US7): edición manual, activar/desactivar,
 * borrado, indicador de uso, origen y el editor asistido por IA.
 */
export default function KnowledgeDetail({ token, id, alcance, onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

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

  if (error && !doc) return <p className="error">{error}</p>;
  if (!doc || !form) return <p className="hint">Cargando…</p>;

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
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>{doc.title}</h3>
          <span className="hint">
            versión {doc.version} · {doc.category} · {doc.agentType ?? 'general'}
          </span>
        </div>
        <button type="button" className="secondary" onClick={onClose}>Volver</button>
      </div>

      {soloLectura && (
        <div className="hint" style={{ marginTop: 12 }}>
          <strong>Solo lectura.</strong> {motivo} Podés leerlo entero —para no
          duplicarlo, o para saber a quién pedirle el cambio—, pero las acciones de
          edición están deshabilitadas.
        </div>
      )}

      <SyncIndicator doc={doc} onReindex={handleReindex} soloLectura={soloLectura} />

      <div className="field-row" style={{ marginTop: 16 }}>
        <UsagePanel usage={doc.usage} />
        <SourcePanel source={doc.source} token={token} />
      </div>

      <form onSubmit={handleSave} style={{ marginTop: 16 }}>
        <div className="field-row">
          <div className="field">
            <label>Título</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Categoría</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Contenido</label>
          <textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Audiencia</label>
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="PUBLICO">PUBLICO</option>
              <option value="INTERNO">INTERNO</option>
            </select>
          </div>
          <div className="field">
            <label>Agente</label>
            <select value={form.agentType} onChange={(e) => setForm({ ...form, agentType: e.target.value })}>
              <option value="">— general —</option>
              {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <p className="hint">
          Cambiar el contenido, la audiencia o el agente vuelve a indexar el
          documento. Cambiar solo el título o la categoría, no.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit" disabled={saving || soloLectura} title={motivo}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleToggleActive}
            disabled={soloLectura}
            title={motivo}
          >
            {doc.isActive ? 'Desactivar' : 'Reactivar'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleDelete}
            disabled={soloLectura}
            title={motivo}
          >
            Borrar
          </button>
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </form>

      <AiEditor
        token={token}
        doc={doc}
        soloLectura={soloLectura}
        motivo={motivo}
        onApplied={async () => { await load(); onChanged?.(); }}
      />

      <ChangeLog changes={doc.changes} />
    </div>
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
    <div className={pendiente ? 'success-msg' : 'error'} style={{ marginTop: 12 }}>
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
    <div className="field">
      <label>Uso</label>
      {!usage.hasData ? (
        <p className="hint">
          Sin datos todavía: nadie hizo una consulta que lo recuperara.
        </p>
      ) : (
        <p className="hint">
          Apareció en <strong>{usage.retrievedCount}</strong> consultas y sirvió
          para responder en <strong>{usage.answeredCount}</strong>.
          Similitud promedio: <strong>{usage.avgScore}</strong>.
          {usage.answeredCount < usage.retrievedCount && (
            <> Aparece más veces de las que alcanza para responder.</>
          )}
        </p>
      )}
    </div>
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
    <div className="field">
      <label>Origen</label>
      {source.type === 'ESCALADO' && source.escalation ? (
        <p className="hint">
          Salió de una consulta escalada: «{source.escalation.reason}»
        </p>
      ) : source.file ? (
        <p className="hint">
          Archivo <strong>{source.file.filename}</strong>{' '}
          <button
            type="button"
            className="secondary"
            onClick={() => descargar(source.file.id, source.file.filename)}
          >
            Descargar original
          </button>
        </p>
      ) : (
        // Sin `file` no hay nada que bajar: o se cargó como texto, o vino de un
        // audio, que se elimina apenas se transcribe.
        <p className="hint">Cargado como texto, o transcripto de un audio que ya se eliminó.</p>
      )}
    </div>
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
      <div className="panel-section" style={{ marginTop: 24 }}>
        <h4>Editar con la IA</h4>
        <p className="hint">No disponible: {motivo}</p>
      </div>
    );
  }

  return (
    <div className="panel-section" style={{ marginTop: 24 }}>
      <h4>Editar con la IA</h4>
      <form onSubmit={handlePreview}>
        <div className="field">
          <label>¿Qué querés cambiar?</label>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="ej. el anticipo mínimo pasó de 20% a 30%"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Preparando…' : 'Proponer cambio'}
        </button>
        <span className="hint" style={{ marginLeft: 8 }}>
          La propuesta no se aplica sola: el documento no cambia hasta que la apruebes.
        </span>
      </form>

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      {conflict && (
        <div className="error" style={{ marginTop: 12 }}>
          <p>{conflict.message}</p>
          <button type="button" className="secondary" onClick={handlePreview}>
            Regenerar sobre la versión {conflict.currentVersion}
          </button>
        </div>
      )}

      {proposal && !proposal.confident && (
        <div className="error" style={{ marginTop: 12 }}>
          <p><strong>No se pudo resolver el pedido.</strong> {proposal.summary}</p>
          <p className="hint">
            El documento quedó intacto. Probá con una instrucción más concreta,
            o editalo a mano arriba.
          </p>
        </div>
      )}

      {proposal && proposal.confident && (
        <div style={{ marginTop: 12 }}>
          <p className="success-msg">{proposal.summary}</p>

          {proposal.changedSections.length > 0 && (
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Antes</th><th>Después</th></tr></thead>
              <tbody>
                {proposal.changedSections.map((s, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--danger)' }}>{s.before}</td>
                    <td style={{ color: 'var(--success)' }}>{s.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Texto propuesto (editable antes de aplicar)</label>
            <textarea rows={10} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} />
          </div>

          <button type="button" onClick={handleApply} disabled={loading}>
            {loading ? 'Aplicando…' : 'Aprobar y aplicar'}
          </button>
          <button
            type="button"
            className="secondary"
            style={{ marginLeft: 8 }}
            onClick={() => setProposal(null)}
          >
            Descartar propuesta
          </button>
        </div>
      )}
    </div>
  );
}

function ChangeLog({ changes }) {
  if (!changes?.length) return null;
  return (
    <div className="panel-section" style={{ marginTop: 24 }}>
      <h4>Historial de cambios ({changes.length})</h4>
      <table>
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
                {c.aiInstruction && <div className="hint">«{c.aiInstruction}»</div>}
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
  );
}
