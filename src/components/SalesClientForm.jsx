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
    <section className="card sales-client-card" aria-labelledby="sales-client-title">
      <header className="sales-form-heading">
        <h3 id="sales-client-title">Alta de cliente</h3>
      </header>

      {error && <p className="error sales-form-feedback" role="alert">{error}</p>}

      {created && (
        <div className="success-msg sales-form-feedback" role="status">
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

      <form className="sales-client-form" onSubmit={handleSubmit}>
        <section className="sales-form-section" aria-labelledby="sales-client-data-title">
          <h4 id="sales-client-data-title" className="sales-form-section-title">Datos del cliente</h4>
          <div className="field-row sales-client-fields">
            <div className="field">
              <label htmlFor="sales-client-name">Nombre <span aria-hidden="true">*</span></label>
              <input id="sales-client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comercio Don Pedro" required />
            </div>
            <div className="field">
              <label htmlFor="sales-client-phone">Teléfono <span aria-hidden="true">*</span></label>
              <input id="sales-client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3865505362" required />
            </div>
            <div className="field">
              <label htmlFor="sales-client-dni">DNI <span className="sales-optional-label">Opcional</span></label>
              <input id="sales-client-dni" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="30111222" />
            </div>
          </div>
          <p className="sales-form-hint">
            El teléfono se normaliza en el backend: podés escribirlo con o sin +54, 9 o 15.
          </p>
        </section>

        <section className="sales-form-section sales-quotas-section" aria-labelledby="sales-quotas-title">
          <h4 id="sales-quotas-title" className="sales-form-section-title">Plan de cuotas</h4>
          <div className="sales-quotas-table-wrap">
            <table className="sales-quotas-table">
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Vencimiento</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {quotas.map((q, i) => (
                  <tr key={i}>
                    <td data-label="Cuota">
                      <span className="sales-quota-number">{i + 1}</span>
                    </td>
                    <td data-label="Monto">
                      <div className="sales-currency-field">
                        <span aria-hidden="true">$</span>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={q.amount}
                          onChange={(e) => updateQuota(i, 'amount', e.target.value)}
                          placeholder="15000"
                          aria-label={`Monto de la cuota ${i + 1}`}
                          required
                        />
                      </div>
                    </td>
                    <td data-label="Vencimiento">
                      <input
                        type="date"
                        value={q.dueDate}
                        onChange={(e) => updateQuota(i, 'dueDate', e.target.value)}
                        aria-label={`Vencimiento de la cuota ${i + 1}`}
                        required
                      />
                    </td>
                    <td data-label="Acciones">
                      {quotas.length > 1 && (
                        <button
                          type="button"
                          className="sales-quota-remove"
                          onClick={() => removeQuota(i)}
                          aria-label={`Quitar cuota ${i + 1}`}
                          title={`Quitar cuota ${i + 1}`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sales-quotas-toolbar">
              <button type="button" className="secondary sales-add-quota" onClick={addQuota}>
                <span aria-hidden="true">+</span> Agregar cuota
              </button>
              <div className="sales-quotas-total">
                <span>{quotas.length} {quotas.length === 1 ? 'cuota' : 'cuotas'}</span>
                <strong>Total del plan <b>${total.toLocaleString('es-AR')}</b></strong>
              </div>
            </div>
          </div>
        </section>

        <footer className="sales-form-actions sales-client-actions">
          <button type="submit" className="button primary sales-form-submit" disabled={busy}>
            {!busy && (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m5 12 4 4L19 6" />
              </svg>
            )}
            {busy ? 'Dando de alta...' : 'Dar de alta cliente'}
          </button>
        </footer>
      </form>
    </section>
  );
}
