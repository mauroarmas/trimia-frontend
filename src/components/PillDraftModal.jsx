import { useState } from 'react';
import { publishPill, updatePill } from '../api';

export default function PillDraftModal({ token, pill, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => ({
    title: pill.title, objective: pill.objective, content: pill.content,
    quiz: structuredClone(Array.isArray(pill.quiz) ? pill.quiz : pill.quiz?.questions || []),
  }));
  const [indexInKnowledge, setIndexInKnowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const edit = (field, value) => setDraft((old) => ({ ...old, [field]: value }));
  const editQuestion = (index, field, value) => setDraft((old) => ({
    ...old, quiz: old.quiz.map((question, i) => i === index ? { ...question, [field]: value } : question),
  }));

  async function save(publish) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await updatePill(token, pill.id, draft);
      const published = publish ? await publishPill(token, pill.id, indexInKnowledge) : null;
      setResult(published || { saved: true });
      onSaved?.();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la píldora.');
    } finally {
      setBusy(false);
    }
  }

  const published = result?.status === 'PUBLISHED';
  const indexing = result?.indexing;
  return (
    <div className="modal-overlay">
      <section className="modal-content" role="dialog" aria-modal="true" aria-labelledby="draft-title" style={{ maxWidth: 900, width: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
        <h3 id="draft-title">Revisar píldora</h3>
        <p className="hint">Revisá el procedimiento y las dos preguntas antes de publicarlo.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {result && <p role="status">{published ? 'Píldora publicada.' : 'Borrador guardado.'}</p>}
        {indexing?.message && <p role="status">{indexing.message}</p>}
        {indexing?.status === 'INDEXED' && <p>Contenido incorporado a la base de conocimiento.</p>}
        {indexing?.existing?.title && <p>Documento existente: {indexing.existing.title}</p>}
        {indexing?.similarDocuments?.length > 0 && (
          <div><p>Revisá estos documentos parecidos para evitar contenido redundante:</p>
            <ul>{indexing.similarDocuments.map((doc) => <li key={doc.documentId}>{doc.title}</li>)}</ul>
          </div>
        )}
        <fieldset disabled={busy || published} style={{ border: 0, padding: 0 }}>
          <label>Título<input value={draft.title} onChange={(e) => edit('title', e.target.value)} /></label>
          <label>Objetivo<textarea rows={2} value={draft.objective} onChange={(e) => edit('objective', e.target.value)} /></label>
          <label>Procedimiento (3 a 6 pasos numerados)<textarea rows={10} value={draft.content} onChange={(e) => edit('content', e.target.value)} /></label>
          {draft.quiz.map((question, index) => (
            <fieldset key={question.id} style={{ margin: '12px 0' }}>
              <legend>Pregunta {index + 1}</legend>
              <label>Enunciado<input value={question.question} onChange={(e) => editQuestion(index, 'question', e.target.value)} /></label>
              {question.options.map((option, optionIndex) => (
                <label key={optionIndex} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" name={'correct-' + question.id} checked={question.correctOptionIndex === optionIndex} onChange={() => editQuestion(index, 'correctOptionIndex', optionIndex)} aria-label={'Opción correcta ' + (optionIndex + 1)} />
                  <input aria-label={'Opción ' + (optionIndex + 1)} value={option} onChange={(e) => editQuestion(index, 'options', question.options.map((v, i) => i === optionIndex ? e.target.value : v))} />
                </label>
              ))}
              {question.options.length < 4 && <button type="button" className="secondary" onClick={() => editQuestion(index, 'options', [...question.options, ''])}>Agregar opción</button>}
              {question.options.length > 3 && <button type="button" className="secondary" onClick={() => {
                editQuestion(index, 'options', question.options.slice(0, -1));
                if (question.correctOptionIndex === question.options.length - 1) editQuestion(index, 'correctOptionIndex', 0);
              }}>Quitar última opción</button>}
              <label>Explicación<textarea rows={2} value={question.explanation} onChange={(e) => editQuestion(index, 'explanation', e.target.value)} /></label>
            </fieldset>
          ))}
          <label><input type="checkbox" checked={indexInKnowledge} onChange={(e) => setIndexInKnowledge(e.target.checked)} /> Incorporar también a la base de conocimiento al publicar</label>
        </fieldset>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="secondary" disabled={busy} onClick={onClose}>Cerrar</button>
          {!published && <><button className="secondary" disabled={busy} onClick={() => save(false)}>Guardar borrador</button><button disabled={busy} onClick={() => save(true)}>{busy ? 'Guardando…' : 'Guardar y publicar'}</button></>}
        </div>
      </section>
    </div>
  );
}
