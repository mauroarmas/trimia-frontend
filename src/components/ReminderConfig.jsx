import { useEffect, useState } from 'react';
import { getReminderConfig, updateReminderConfig } from '../api';

export default function ReminderConfig({ token }) {
  const [config, setConfig] = useState(null);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let current = true;
    getReminderConfig(token).then((value) => {
      if (!current) return;
      setConfig(value);
      setDays(value.daysBefore.join(', '));
    }).catch((err) => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [token]);

  async function save(event) {
    event.preventDefault();
    setSaved(false);
    setError('');
    const values = days.split(',').map((day) => day.trim());
    if (values.some((day) => !/^\d+$/.test(day) || Number(day) > 30)) {
      setError('Ingresá días enteros entre 0 y 30 separados por comas, por ejemplo: 7, 3, 0.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateReminderConfig(token, {
        daysBefore: [...new Set(values.map(Number))],
        maxAttempts: Number(config.maxAttempts),
        templateName: config.templateName.trim(),
        templateApproved: config.templateApproved,
      });
      setConfig(updated);
      setDays(updated.daysBefore.join(', '));
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <section className="card">
    <h3>Configurar recordatorios</h3>
    {error && <p className="error" role="alert">{error}</p>}
    {saved && <p className="success-msg">Configuración guardada.</p>}
    {!config && !error && <p>Cargando configuración…</p>}
    {config && <form onSubmit={save}>
      {!config.templateApproved && <p className="error">Los envíos automáticos están bloqueados hasta que la plantilla esté aprobada en WhatsApp.</p>}
      <div className="field"><label htmlFor="reminder-days">Días antes del vencimiento (0 = mismo día)</label><input id="reminder-days" value={days} onChange={(e) => setDays(e.target.value)} required /></div>
      <div className="field"><label htmlFor="reminder-attempts">Máximo de intentos</label><input id="reminder-attempts" type="number" min="1" step="1" required value={config.maxAttempts} onChange={(e) => setConfig({ ...config, maxAttempts: e.target.value })} /></div>
      <div className="field"><label htmlFor="reminder-template">Nombre de plantilla de WhatsApp</label><input id="reminder-template" required value={config.templateName} onChange={(e) => setConfig({ ...config, templateName: e.target.value })} /></div>
      <label><input type="checkbox" checked={config.templateApproved} onChange={(e) => setConfig({ ...config, templateApproved: e.target.checked })} /> La plantilla ya está aprobada en WhatsApp</label>
      <p className="hint">La aprobación de la plantilla se realiza en WhatsApp Business.</p>
      {config.updatedAt && <p className="hint">Última actualización: {new Date(config.updatedAt).toLocaleString('es-AR')}. Se aplica desde el próximo ciclo.</p>}
      <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
    </form>}
  </section>;
}
