import { useState } from 'react';
import { createSalesClient } from '../api';

const EMPTY_QUOTA = { amount: '', dueDate: '' };

/**
 * Alta de cliente al cerrar la venta (US6 / FR-001a) — POST /sales/clients.
 *
 * Sin selector de cobrador a propósito: el alta sin asignar es el camino
 * previsto por FR-001b — el cliente cae en la cola del Cobrador Controlador,
 * que le pone dueño desde el Panel de Cobranzas. Quien vende no tiene por qué
 * saber a qué cobrador corresponde. (El dato es opcional en el DTO, así que
 * agregar el selector más adelante es solo sumar el campo al body.)
 */
export default function SalesClientForm({ token }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dni, setDni] = useState('');
  const [quotas, setQuotas] = useState([{ ...EMPTY_QUOTA }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  function updateQuota(index, field, value) {
    setQuotas((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  }

  function addQuota() {
    setQuotas((prev) => [...prev, { ...EMPTY_QUOTA }]);
  }

  function removeQuota(index) {
    // El backend exige ArrayMinSize(1): nunca se puede quedar sin ninguna.
    setQuotas((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCreated(null);

    if (!name.trim() || !phone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    if (quotas.some((q) => !q.amount || !q.dueDate)) {
      setError('Cada cuota necesita monto y fecha de vencimiento.');
      return;
    }

    setBusy(true);
    try {
      const client = await createSalesClient(token, {
        name: name.trim(),
        phone: phone.trim(),
        dni: dni.trim(),
        // amount va como número (el DTO valida @IsNumber) y dueDate como
        // ISO date string (@IsDateString), que es lo que da el input date.
        quotas: quotas.map((q) => ({ amount: Number(q.amount), dueDate: q.dueDate })),
      });
      setCreated(client);
      setName('');
      setPhone('');
      setDni('');
      setQuotas([{ ...EMPTY_QUOTA }]);
    } catch (err) {
      // El 409 por teléfono duplicado se muestra tal cual lo manda la API.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const total = quotas.reduce((sum, q) => sum + (Number(q.amount) || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Alta de Cliente</h2>
          <p className="page-subtitle">Registro de clientes para ventas financiadas y programación de planes de cuotas.</p>
        </div>
      </div>

      <div className="card">
        <p style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: '0.9rem' }}>
          Si no se le asigna cobrador, queda en la cola del Cobrador Controlador.
        </p>

      {error && <p className="error">{error}</p>}

      {created && (
        <div className="success-msg" style={{ marginBottom: 12 }}>
          Cliente <b>{created.name}</b> dado de alta con {created.quotas?.length ?? 0} cuota
          {created.quotas?.length === 1 ? '' : 's'}.
          {created.recoveredProofs > 0 && (
            <div style={{ marginTop: 6 }}>
              Se imputaron <b>{created.recoveredProofs}</b> comprobante
              {created.recoveredProofs === 1 ? '' : 's'} que este cliente había enviado
              antes de estar registrado.
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Comercio Don Pedro" />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3865505362" />
          </div>
          <div className="field">
            <label>DNI (opcional)</label>
            <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="30111222" />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4 }}>
          El teléfono se normaliza en el backend: podés escribirlo con o sin +54, 9 o 15.
        </p>

        <h4 style={{ marginTop: 12 }}>Plan de cuotas</h4>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Monto</th><th>Vencimiento</th><th></th>
            </tr>
          </thead>
          <tbody>
            {quotas.map((q, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={q.amount}
                    onChange={(e) => updateQuota(i, 'amount', e.target.value)}
                    placeholder="15000"
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={q.dueDate}
                    onChange={(e) => updateQuota(i, 'dueDate', e.target.value)}
                  />
                </td>
                <td>
                  {quotas.length > 1 && (
                    <button type="button" className="secondary" onClick={() => removeQuota(i)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button type="button" className="secondary" onClick={addQuota}>+ Agregar cuota</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Total del plan: <b>${total.toLocaleString('es-AR')}</b>
          </span>
        </div>

        <button type="submit" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? 'Dando de alta...' : 'Dar de alta cliente'}
        </button>
      </form>
      </div>
    </div>
  );
}
