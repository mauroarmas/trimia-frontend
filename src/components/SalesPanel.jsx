import { useState, useEffect } from 'react';
import SalesConversationModal from './SalesConversationModal';
import SalesClientForm from './SalesClientForm';
import { InfoToggle } from './InfoNotes';
import PageHero from './PageHero';
import {
  getSalesStock,
  getSalesProspects,
  checkCreditCommercial,
  closeSale,
  salesProspectAction,
} from '../api';

const INFO_POR_SUBTAB = {
  prospects: [
    ['Clientes por contactar (CRM).',
      'Listado de prospectos generados por el bot en WhatsApp y registrados en el CRM con los 17 campos canónicos.'],
  ],
  stock: [
    ['Catálogo Paljet.',
      'Existencias según la última actualización de la fuente de prueba. Si un producto no tiene stock, se sugieren hasta 2 sustitutos con stock (RF09).'],
  ],
  credit_check: [
    [
      '🛡️ Principio de Secreto Comercial (OE-10).',
      'Este panel muestra únicamente el dictamen comercial aplicable. El informe financiero confidencial y las deudas detalladas del BCRA permanecen bajo resguardo de Administración.',
    ],
  ],
  close_sale: [
    ['Cierre manual (Tarea 6.9).',
      'Asentá en TrimIA la venta acordada y facturada manualmente en Paljet. Referencia: Tarea 6.9.'],
  ],
  new_client: [
    ['Alta de cliente.',
      'Al cerrar una venta financiada, se da de alta el cliente con su plan de cuotas.'],
  ],
};

export default function SalesPanel({ token, me }) {
  const [activeSubtab, setActiveSubtab] = useState('prospects');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [contactProspect, setContactProspect] = useState(null);
  const [contactedMsg, setContactedMsg] = useState('');

  // 1. Estado para Prospects (CRM)
  const [prospects, setProspects] = useState([]);
  const [loadingProspects, setLoadingProspects] = useState(false);
  const [prospectsError, setProspectsError] = useState('');

  // 2. Estado para Stock (Paljet)
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategory, setStockCategory] = useState('');
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState('');
  const [stockCategories, setStockCategories] = useState([]);

  // 3. Estado para Consulta Crediticia (OE-10)
  const [creditDni, setCreditDni] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditResult, setCreditResult] = useState(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState('');

  // 4. Estado para Cierre Manual de Venta
  const [closeProspectId, setCloseProspectId] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeModality, setCloseModality] = useState('CASH');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeSuccess, setCloseSuccess] = useState('');
  const [closeError, setCloseError] = useState('');

  // Cargar prospectos
  useEffect(() => {
    if (activeSubtab === 'prospects') {
      loadProspects();
    }
  }, [activeSubtab, token]);

  // Cargar stock
  useEffect(() => {
    if (activeSubtab === 'stock') {
      loadStock();
    }
  }, [activeSubtab, stockCategory, token]);

  useEffect(() => {
    let current = true;
    getSalesStock(token)
      .then((items) => {
        if (current) setStockCategories([...new Set(items.map((item) => item.category))].sort());
      })
      .catch(() => {});
    return () => { current = false; };
  }, [token]);

  async function loadProspects() {
    setLoadingProspects(true);
    setProspectsError('');
    try {
      const data = await getSalesProspects(token);
      setProspects(Array.isArray(data) ? data : []);
    } catch (err) {
      setProspects([]);
      setProspectsError(err.message);
    } finally {
      setLoadingProspects(false);
    }
  }

  async function loadStock() {
    setLoadingStock(true);
    setStockError('');
    try {
      const data = await getSalesStock(token, {
        query: stockSearch,
        category: stockCategory || undefined,
      });
      if (Array.isArray(data)) {
        setStockItems(data);
      }
    } catch (err) {
      setStockItems([]);
      setStockError(err.message);
    } finally {
      setLoadingStock(false);
    }
  }

  async function handleCreditCheck(e) {
    e.preventDefault();
    setCreditError('');
    setCreditResult(null);
    if (!creditDni.trim()) {
      setCreditError('Por favor ingresá el DNI a consultar.');
      return;
    }

    setCreditBusy(true);
    try {
      const res = await checkCreditCommercial(token, {
        dni: creditDni.trim(),
        amount: creditAmount ? Number(creditAmount) : undefined,
      });
      setCreditResult(res);
    } catch (err) {
      setCreditError(err.message || 'Error al consultar aptitud crediticia.');
    } finally {
      setCreditBusy(false);
    }
  }

  async function handleCloseSale(e) {
    e.preventDefault();
    setCloseError('');
    setCloseSuccess('');
    if (!closeProspectId.trim() || Number(closeAmount) <= 0 || !closeNotes.trim()) {
      setCloseError('Indicá un prospecto, monto positivo y comprobante para registrar el cierre.');
      return;
    }

    setCloseBusy(true);
    try {
      await closeSale(token, {
        prospectId: closeProspectId || undefined,
        finalAmount: Number(closeAmount),
        modality: closeModality,
        notes: closeNotes,
      });
      setCloseSuccess('¡Venta registrada y auditada correctamente en TrimIA!');
      setCloseAmount('');
      setCloseNotes('');
      setCloseProspectId('');
      if (activeSubtab === 'prospects') loadProspects();
    } catch (err) {
      setCloseError(err.message || 'Error al asentar cierre de venta.');
    } finally {
      setCloseBusy(false);
    }
  }

  async function handleTakeProspect(p) {
    if (!p.conversationId) { setContactedMsg('Este prospecto todavía no tiene una conversación en TrimIA.'); return; }
    try { await salesProspectAction(token,p.id,'takeover'); setContactProspect(p); }
    catch (err) { setContactedMsg(err.message); }
  }
  async function handleFollowUp(p) {
    const message = prompt('Seguimiento comercial para CRM (no incluyas informes de crédito ni notas internas):');
    if (!message?.trim()) return;
    try { const updated = await salesProspectAction(token,p.id,'followup',message.trim()); setContactedMsg(updated.syncStatus === 'PENDING' ? 'Seguimiento guardado en TrimIA; pendiente de sincronización.' : 'Seguimiento guardado.'); await loadProspects(); }
    catch (err) { setContactedMsg(err.message); }
  }

  useEffect(() => {
    if (!mostrarInfo) return undefined;

    function handleInfoKeyDown(e) {
      if (e.key === 'Escape') setMostrarInfo(false);
    }

    document.addEventListener('keydown', handleInfoKeyDown);
    return () => document.removeEventListener('keydown', handleInfoKeyDown);
  }, [mostrarInfo]);

  return (
    <div className="sales-panel">
      {contactProspect && <SalesConversationModal token={token} me={me} prospect={contactProspect} onClose={() => { setContactProspect(null); loadProspects(); }} />}
      <PageHero
        kicker="Operaciones comerciales"
        title="Panel de Ventas"
        description="Atención comercial de clientes derivados del bot, consulta de stock según su última actualización y alta de ventas."
      />

      <div className="submenu-bar sales-submenu-bar">
        <div className="submenu-pills">
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'prospects' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('prospects')}
          >
            👥 Clientes por contactar ({prospects.length})
          </button>
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'stock' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('stock')}
          >
            📦 Consultar stock (Paljet)
          </button>
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'credit_check' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('credit_check')}
          >
            💳 Simulación de crédito
          </button>
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'close_sale' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('close_sale')}
          >
            ✅ Cierre de venta (Manual)
          </button>
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'new_client' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('new_client')}
          >
            📝 Alta de cuotas
          </button>
        </div>
        <div className="sales-info-anchor">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
          {mostrarInfo && (
            <section
              className="sales-info-popover"
              role="dialog"
              aria-labelledby="sales-info-title"
            >
              <button
                type="button"
                className="sales-info-close"
                aria-label="Cerrar información"
                onClick={() => setMostrarInfo(false)}
              >
                ×
              </button>
              <span className="sales-info-kicker">Ayuda de esta sección</span>
              <h3 id="sales-info-title">{INFO_POR_SUBTAB[activeSubtab][0][0].replace(/\.$/, '')}</h3>
              <p>{INFO_POR_SUBTAB[activeSubtab][0][1]}</p>
            </section>
          )}
        </div>
      </div>

      {contactedMsg && <p className="success-msg" style={{ marginBottom: 16 }}>{contactedMsg}</p>}

      {/* Subtab 1: Clientes por contactar */}
      {activeSubtab === 'prospects' && (
        <div className="card">
          {prospectsError && <p className="error" role="alert">{prospectsError}</p>}
          {!loadingProspects && !prospectsError && prospects.length === 0 && <p className="hint">No hay clientes por contactar.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3>Prospectos comerciales derivados por el Asistente</h3>
              <p className="hint">Sincronizados con el CRM en Google Sheets y auditados en PostgreSQL.</p>
            </div>
            <button type="button" className="button secondary" onClick={loadProspects} disabled={loadingProspects}>
              🔄 {loadingProspects ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {prospects.map((p) => {
              const name = p.name || p.nombreApellido || 'Cliente';
              const phone = p.phone || p.telefono || '';
              const product = p.productInterest || p.productoInteres || 'Maquinaria gastronómica';
              const notes = p.notes || p.notasSeguimiento || 'Sin observaciones adicionales';

              return (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: 'var(--card-bg, #fff)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <strong style={{ fontSize: 16 }}>{name}</strong>
                        <div className="hint" style={{ fontSize: 12 }}>📞 {phone}</div>
                      </div>
                      <span className="badge status-active" style={{ fontSize: 11 }}>{p.status || 'NUEVO'}</span>
                    </div>

                    <div style={{ margin: '8px 0', fontSize: 13 }}>
                      {p.comercio && <div><strong>🏢 Negocio:</strong> {p.comercio}</div>}
                      <div><strong>🔍 Interés:</strong> {product}</div>
                      <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                        <em>"{notes}"</em>
                        {p.handoff && <dl>
                          <dt>Producto</dt><dd>{p.handoff.producto}</dd>
                          {p.handoff.precioEstimado != null && <><dt>Precio consultado</dt><dd>${p.handoff.precioEstimado.toLocaleString('es-AR')}</dd></>}
                          {p.handoff.modalidad && <><dt>Modalidad</dt><dd>{p.handoff.modalidad === 'CASH' ? 'Contado' : 'Financiado'}</dd></>}
                          {p.handoff.estadoCredito && <><dt>Dictamen comercial</dt><dd>{p.handoff.estadoCredito}</dd></>}
                          <dt>Motivo de derivación</dt><dd>{p.handoff.motivoAlerta}</dd>
                          {p.handoff.observaciones && <><dt>Observaciones</dt><dd>{p.handoff.observaciones}</dd></>}
                        </dl>}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="msg-time">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Reciente'}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => {
                          setCloseProspectId(p.id);
                          setActiveSubtab('close_sale');
                        }}
                      >
                        Cerrar venta
                      </button>
                      <button type="button" className="button secondary" onClick={() => handleFollowUp(p)}>Seguimiento</button>
                      <button type="button" className="button primary" onClick={() => handleTakeProspect(p)}>Retomar en TrimIA</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtab 2: Consultar stock */}
      {activeSubtab === 'stock' && (
        <div className="card">
          {stockError && <p className="error" role="alert">{stockError}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3>Inventario y Disponibilidad en Paljet</h3>
              <p className="hint">{stockItems.some((item) => item.source === 'SIMULATED') ? 'Catálogo simulado de Paljet para pruebas. No representa existencias comerciales reales.' : 'Disponibilidad informada por Paljet.'}</p>
              {stockItems.length > 0 && <p className="hint">Última actualización: {new Date(stockItems[0].lastUpdated).toLocaleString('es-AR')}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Buscar por nombre o SKU..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadStock(); }}
                style={{ maxWidth: 220 }}
              />
              <select
                value={stockCategory}
                onChange={(e) => setStockCategory(e.target.value)}
                style={{ maxWidth: 160 }}
              >
                <option value="">Todas las categorías</option>
                {stockCategories.map((category) => <option key={category} value={category}>{category === 'SMART_TV' ? 'Smart TV' : category}</option>)}
              </select>
              <button type="button" className="button secondary" onClick={loadStock} disabled={loadingStock}>
                🔍 Buscar
              </button>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio Contado</th>
                <th>Precio Lista (Cuotas)</th>
                <th>Stock disponible</th>
                <th>Enlace Web</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item) => (
                <tr key={item.sku}>
                  <td><code>{item.sku}</code></td>
                  <td>
                    <strong>{item.name}</strong>
                    {item.stock === 0 && item.substituteSkus && item.substituteSkus.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-warning, #d97706)', marginTop: 2 }}>
                        ⚠️ Sustitutos sugeridos: {item.substituteSkus.join(', ')}
                      </div>
                    )}
                  </td>
                  <td>{item.category === 'SMART_TV' ? 'Smart TV' : item.category}</td>
                  <td>{item.cashPrice == null ? 'No informado' : `$${Number(item.cashPrice).toLocaleString('es-AR')}`}</td>
                  <td>{item.listPrice == null ? 'No informado' : `$${Number(item.listPrice).toLocaleString('es-AR')}`}</td>
                  <td>
                    {item.stock > 0 ? (
                      <span className={`badge ${item.stock === 1 ? 'status-warning' : 'status-active'}`}>{item.stock} {item.stock === 1 ? 'unidad · Bajo stock' : 'unidades · Disponible'}</span>
                    ) : (
                      <span className="badge status-error">0 unidades · Sin stock</span>
                    )}
                  </td>
                  <td>
                    {item.urlCredimision ? <a href={item.urlCredimision} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      🌐 Ver en página
                    </a> : 'No informado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subtab 3: Simulación Crediticia Confidencial */}
      {activeSubtab === 'credit_check' && (
        <section className="card credit-check-card" aria-labelledby="credit-check-title">
          <header className="credit-check-heading">
            <span className="credit-check-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5 19 6v5.2c0 4.5-2.9 7.7-7 9.3-4.1-1.6-7-4.8-7-9.3V6l7-2.5Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <div>
              <h3 id="credit-check-title">Consulta de Aptitud Crediticia Comercial</h3>
              <p>Verificá si el cliente califica para venta financiada antes de comprometer cuotas.</p>
            </div>
          </header>

          <form className="credit-check-form" onSubmit={handleCreditCheck}>
            <div className="credit-check-field">
              <label htmlFor="credit-check-dni">DNI o CUIT del Cliente <span aria-hidden="true">*</span></label>
              <input
                id="credit-check-dni"
                type="text"
                placeholder="Ej. 32123458 (sin puntos)"
                value={creditDni}
                onChange={(e) => setCreditDni(e.target.value)}
                required
              />
              <span className="hint credit-check-hint">
                Tip para pruebas: Terminación 8/0 = Aprobado, 4/6 = Condicionado 20%, 1/9 = Rechazado.
              </span>
            </div>

            <div className="credit-check-field">
              <label htmlFor="credit-check-amount">Monto Estimado Solicitado ($)</label>
              <input
                id="credit-check-amount"
                type="number"
                placeholder="Ej. 250000"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>

            {creditError && (
              <p className="error-msg credit-check-error" role="alert">
                {creditError}
              </p>
            )}

            <button type="submit" className="button primary credit-check-submit" disabled={creditBusy}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                <path d="M3.5 10h17" />
              </svg>
              {creditBusy ? 'Consultando Riesgo Online...' : 'Verificar Dictamen Crediticio'}
            </button>
          </form>

          {creditResult && (
            <div
              className="credit-check-result"
              style={{
                border: '1px solid',
                borderColor:
                  creditResult.verdict === 'APPROVED'
                    ? '#16a34a'
                    : creditResult.verdict === 'APPROVED_WITH_CONDITIONS'
                    ? '#d97706'
                    : '#dc2626',
                backgroundColor: 'var(--card-bg, #fff)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 16 }}>Dictamen Comercial:</strong>
                <span
                  className={
                    creditResult.verdict === 'APPROVED'
                      ? 'badge status-active'
                      : creditResult.verdict === 'APPROVED_WITH_CONDITIONS'
                      ? 'badge status-warning'
                      : 'badge status-error'
                  }
                  style={{ fontSize: 13, padding: '4px 10px' }}
                >
                  {creditResult.verdict}
                </span>
              </div>
              <p style={{ margin: '8px 0', fontSize: 14 }}>
                <strong>Condición Comercial:</strong> {creditResult.commercialCondition}
              </p>
              <span className="hint" style={{ fontSize: 12 }}>
                Evaluado el: {new Date(creditResult.evaluatedAt).toLocaleString()}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Subtab 4: Cierre Manual de Venta */}
      {activeSubtab === 'close_sale' && (
        <section className="card sales-close-card" aria-labelledby="sales-close-title">
          <header className="sales-form-heading">
            <div>
              <span className="sales-form-eyebrow">Registro y auditoría</span>
              <h3 id="sales-close-title">Cierre de venta</h3>
            </div>
          </header>

          <form className="sales-close-form" onSubmit={handleCloseSale}>
            <section className="sales-form-section" aria-labelledby="sales-operation-title">
              <h4 id="sales-operation-title" className="sales-form-section-title">Datos de la operación</h4>
              <div className="sales-close-fields">
                <div>
                  <label htmlFor="sales-close-prospect">ID del prospecto <span aria-hidden="true">*</span></label>
                  <input
                    id="sales-close-prospect"
                    type="text"
                    placeholder="Seleccioná el prospecto desde Clientes por contactar"
                    required
                    value={closeProspectId}
                    onChange={(e) => setCloseProspectId(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="sales-close-amount">Monto final de la operación <span aria-hidden="true">*</span></label>
                  <div className="sales-currency-field">
                    <span aria-hidden="true">$</span>
                    <input
                      id="sales-close-amount"
                      type="number"
                      placeholder="420000"
                      value={closeAmount}
                      onChange={(e) => setCloseAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="sales-close-modality">
                  <label htmlFor="sales-close-modality">Modalidad de pago <span aria-hidden="true">*</span></label>
                  <select
                    id="sales-close-modality"
                    value={closeModality}
                    onChange={(e) => setCloseModality(e.target.value)}
                  >
                    <option value="CASH">Contado efectivo / Transferencia</option>
                    <option value="FINANCED">Venta financiada (Cuotas semanales)</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="sales-form-section sales-proof-section" aria-labelledby="sales-proof-title">
              <h4 id="sales-proof-title" className="sales-form-section-title">Comprobante en Paljet</h4>
              <label htmlFor="sales-close-notes">Comprobante y observaciones <span aria-hidden="true">*</span></label>
              <textarea
                id="sales-close-notes"
                rows={3}
                placeholder="Ej. Factura A-0001-00049281 emitida en Paljet. Se coordinó entrega para el jueves."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                required
              />
            </section>

            {closeError && <p className="error-msg sales-form-feedback" role="alert">{closeError}</p>}
            {closeSuccess && <p className="success-msg sales-form-feedback" role="status">{closeSuccess}</p>}

            <footer className="sales-form-actions">
              <span><span aria-hidden="true">*</span> Campos obligatorios</span>
              <button type="submit" className="button primary sales-form-submit" disabled={closeBusy}>
                {!closeBusy && (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                )}
                {closeBusy ? 'Guardando cierre...' : 'Confirmar cierre de venta'}
              </button>
            </footer>
          </form>
        </section>
      )}

      {/* Subtab 5: Alta de cliente en cuotas */}
      {activeSubtab === 'new_client' && (
        <SalesClientForm token={token} />
      )}
    </div>
  );
}
