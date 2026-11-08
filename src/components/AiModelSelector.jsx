import { useEffect, useId, useState } from 'react';
import { getAiModel, updateAiModel } from '../api';
import './AiModelSelector.css';

export default function AiModelSelector({ token, onChanged }) {
  const id = useId();
  const [settings, setSettings] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    getAiModel(token).then((data) => {
      if (live) { setSettings(data); setChoice(data.model); }
    }).catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [token]);
  async function apply() {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await updateAiModel(token, { model: choice, expectedModel: settings.model });
      setSettings(updated); setChoice(updated.model);
      setNotice('Modelo actualizado para las próximas consultas.');
      onChanged?.();
    } catch (err) {
      setError(err.message);
      try { const current = await getAiModel(token); setSettings(current); setChoice(current.model); } catch { /* El error de actualización sigue visible. */ }
    } finally { setBusy(false); }
  }
  return (
    <section className="ai-model-selector" aria-labelledby={`${id}-title`}>
      <div className="ai-model-selector-copy">
        <h3 id={`${id}-title`}>Modelo de IA del asistente</h3>
        <p>Activo: <strong>{settings?.options.find((m) => m.id === settings.model)?.label || 'Cargando…'}</strong>. El cambio se aplica a las próximas consultas de todos los agentes.</p>
        <small>Una conversación puede usar varias solicitudes. Cada modelo conserva sus límites de Google AI Studio.</small>
      </div>
      <div className="ai-model-selector-actions">
        <label htmlFor={id}>Usar modelo</label>
        <div>
          <select id={id} value={choice} disabled={!settings || busy} onChange={(e) => { setChoice(e.target.value); setNotice(''); }}>
            {!settings && <option value="">Cargando modelos…</option>}
            {settings?.options.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <button type="button" className="btn-primary" disabled={!settings || busy || choice === settings.model} onClick={apply}>{busy ? 'Aplicando…' : 'Aplicar modelo'}</button>
        </div>
      </div>
      {error && <p className="ai-model-selector-error" role="alert">{error}</p>}
      {notice && <p className="ai-model-selector-notice" role="status">{notice}</p>}
    </section>
  );
}
