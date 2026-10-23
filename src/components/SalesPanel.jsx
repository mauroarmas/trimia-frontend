import { useState, useEffect } from 'react';
import SalesClientForm from './SalesClientForm';
import InfoNotes, { InfoToggle } from './InfoNotes';
import {
  getSalesStock,
  getSalesProspects,
  checkCreditCommercial,
  closeSale,
} from '../api';

const SUBTAB_TITULO = {
  prospects: 'Clientes por contactar',
  stock: 'Consultar stock en Paljet',
  credit_check: 'Simulación de crédito (Comercial)',
  close_sale: 'Registrar cierre de venta',
  new_client: 'Alta de cliente en cuotas',
};

const INFO_POR_SUBTAB = {
  prospects: [
    ['Clientes por contactar (CRM).',
      'Listado de prospectos generados por el bot en WhatsApp y registrados en el CRM con los 17 campos canónicos.'],
  ],
  stock: [
    ['Catálogo Paljet.',
      'Existencias en depósito en tiempo real. Si un producto no tiene stock, se sugieren hasta 2 sustitutos con stock (RF09).'],
  ],
  credit_check: [
    ['Secreto comercial (OE-10).',
      'El vendedor consulta si un cliente califica para venta en cuotas. Por confidencialidad, sólo recibe el dictamen comercial sin acceder al informe bancario detallado.'],
  ],
  close_sale: [
    ['Cierre manual (Tarea 6.9).',
      'Una vez que el vendedor emitió la factura en Paljet a mano, asienta el cierre en TrimIA para auditar fecha y responsable.'],
  ],
  new_client: [
    ['Alta de cliente.',
      'Al cerrar una venta financiada, se da de alta el cliente con su plan de cuotas.'],
  ],
};

const INITIAL_DEMO_PROSPECTS = [
  {
    id: 'pr-1',
    name: 'Martín Benítez',
    phone: '5493865123456',
    status: 'NUEVO',
    productInterest: 'Horno Convector 4 bandejas 60x40',
    notes: 'Consultó por plan financiado en 12 cuotas semanales. Envió fotos del local.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pr-2',
    name: 'Carolina Gómez',
    phone: '5493865987654',
    status: 'EN_CONTACTO',
    productInterest: 'Freidora Industrial 30 Lts automática',
    notes: 'Pregunta si la conexión de gas es para envasado o natural.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pr-3',
    name: 'Esteban Morales',
    phone: '5493865443322',
    status: 'CALIFICA',
    productInterest: 'Cortadora de fiambre 330mm acero inox',
    notes: 'Quiere coordinar una visita presencial para probar la máquina.',
    createdAt: new Date().toISOString(),
  },
];

export default function SalesPanel({ token, me }) {
  const [activeSubtab, setActiveSubtab] = useState('prospects');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [contactedMsg, setContactedMsg] = useState('');

  // 1. Estado para Prospects (CRM)
  const [prospects, setProspects] = useState([]);
  const [loadingProspects, setLoadingProspects] = useState(false);

  // 2. Estado para Stock (Paljet)
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategory, setStockCategory] = useState('');
  const [loadingStock, setLoadingStock] = useState(false);

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
  }, [activeSubtab]);

  // Cargar stock
  useEffect(() => {
    if (activeSubtab === 'stock') {
      loadStock();
    }
  }, [activeSubtab, stockCategory]);

  async function loadProspects() {
    setLoadingProspects(true);
    try {
      const data = await getSalesProspects(token);
      if (Array.isArray(data) && data.length > 0) {
        setProspects(data);
      } else {
        setProspects(INITIAL_DEMO_PROSPECTS);
      }
    } catch {
      setProspects(INITIAL_DEMO_PROSPECTS);
    } finally {
      setLoadingProspects(false);
    }
  }

  async function loadStock() {
    setLoadingStock(true);
    try {
      const data = await getSalesStock(token, {
        query: stockSearch,
        category: stockCategory || undefined,
      });
      if (Array.isArray(data)) {
        setStockItems(data);
      }
    } catch (err) {
      console.error('Error al cargar stock:', err);
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
    if (!closeAmount || !closeNotes.trim()) {
      setCloseError('Monto final y notas del comprobante son obligatorios.');
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

  function handleTakeProspect(p) {
    setContactedMsg(`Iniciando contacto con ${p.name || p.nombreApellido} (${p.phone || p.telefono}). Podés enviarle WhatsApp o llamarlo.`);
    setTimeout(() => setContactedMsg(''), 6000);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Panel de Ventas</h2>
          <p className="page-subtitle">
            Atención comercial de clientes derivados del bot, consulta de stock en tiempo real y alta de ventas.
          </p>
        </div>
      </div>

      <div className="submenu-bar" style={{ marginBottom: 20 }}>
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
        <div className="info-bar-actions">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
        </div>
      </div>

      {mostrarInfo && (
        <InfoNotes
          title={SUBTAB_TITULO[activeSubtab]}
          notes={INFO_POR_SUBTAB[activeSubtab]}
          onClose={() => setMostrarInfo(false)}
        />
      )}

      {contactedMsg && <p className="success-msg" style={{ marginBottom: 16 }}>{contactedMsg}</p>}

      {/* Subtab 1: Clientes por contactar */}
      {activeSubtab === 'prospects' && (
        <div className="card">
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
                      <a
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(`¡Hola ${name}! Te contacto de Credimisión sobre tu consulta por el ${product}. ¿Cómo estás?`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="button primary"
                        style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                        onClick={() => handleTakeProspect(p)}
                      >
                        💬 WhatsApp
                      </a>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3>Inventario y Disponibilidad en Paljet</h3>
              <p className="hint">Muestra existencias reales y enlaces oficiales de Credimisión (RF09).</p>
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
                <option value="BALANZAS">Balanzas</option>
                <option value="CORTADORAS">Cortadoras</option>
                <option value="GASTRONOMIA">Gastronomía</option>
                <option value="REFRIGERACION">Refrigeración</option>
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
                  <td>{item.category}</td>
                  <td><strong style={{ color: 'var(--success, #16a34a)' }}>${Number(item.cashPrice).toLocaleString()}</strong></td>
                  <td>${Number(item.listPrice).toLocaleString()}</td>
                  <td>
                    {item.stock > 0 ? (
                      <span className="badge status-active">{item.stock} unidades</span>
                    ) : (
                      <span className="badge status-error">Sin stock (RF09)</span>
                    )}
                  </td>
                  <td>
                    <a href={item.urlCredimision} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      🌐 Ver en página
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subtab 3: Simulación Crediticia Confidencial */}
      {activeSubtab === 'credit_check' && (
        <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
          <h3>Consulta de Aptitud Crediticia Comercial</h3>
          <p className="hint" style={{ marginBottom: 16 }}>
            Verificá si el cliente califica para venta financiada antes de comprometer cuotas.
          </p>

          <div
            style={{
              padding: 12,
              borderRadius: 6,
              backgroundColor: 'var(--bg-accent, #f0fdf4)',
              border: '1px solid var(--border-accent, #bbf7d0)',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            🛡️ <strong>Principio de Secreto Comercial (OE-10):</strong> Este panel muestra únicamente
            el dictamen comercial aplicable. El informe financiero confidencial y las deudas detalladas
            del BCRA permanecen bajo resguardo de Administración.
          </div>

          <form onSubmit={handleCreditCheck}>
            <div style={{ marginBottom: 12 }}>
              <label>DNI o CUIT del Cliente *</label>
              <input
                type="text"
                placeholder="Ej. 32123458 (sin puntos)"
                value={creditDni}
                onChange={(e) => setCreditDni(e.target.value)}
                required
              />
              <span className="hint" style={{ fontSize: 11 }}>
                Tip para pruebas: Terminación 8/0 = Aprobado, 4/6 = Condicionado 20%, 1/9 = Rechazado.
              </span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Monto Estimado Solicitado ($)</label>
              <input
                type="number"
                placeholder="Ej. 250000"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>

            {creditError && <p className="error-msg" style={{ marginBottom: 12 }}>{creditError}</p>}

            <button type="submit" className="button primary" disabled={creditBusy} style={{ width: '100%' }}>
              {creditBusy ? 'Consultando Riesgo Online...' : '💳 Verificar Dictamen Crediticio'}
            </button>
          </form>

          {creditResult && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 8,
                border: '2px solid',
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
        </div>
      )}

      {/* Subtab 4: Cierre Manual de Venta */}
      {activeSubtab === 'close_sale' && (
        <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
          <h3>Registro y Auditoría de Cierre de Venta (Tarea 6.9)</h3>
          <p className="hint" style={{ marginBottom: 16 }}>
            Asentá en TrimIA la venta acordada y facturada manualmente en Paljet.
          </p>

          <form onSubmit={handleCloseSale}>
            <div style={{ marginBottom: 12 }}>
              <label>ID del Prospecto (Opcional)</label>
              <input
                type="text"
                placeholder="ID de prospecto o dejar vacío"
                value={closeProspectId}
                onChange={(e) => setCloseProspectId(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Monto Final de la Operación ($) *</label>
              <input
                type="number"
                placeholder="Ej. 420000"
                value={closeAmount}
                onChange={(e) => setCloseAmount(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Modalidad de Pago *</label>
              <select
                value={closeModality}
                onChange={(e) => setCloseModality(e.target.value)}
              >
                <option value="CASH">Contado Efectivo / Transferencia</option>
                <option value="FINANCED">Venta Financiada (Cuotas Semanales)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Comprobante y Observaciones en Paljet *</label>
              <textarea
                rows={3}
                placeholder="Ej. Factura A-0001-00049281 emitida en Paljet. Se coordinó entrega para el jueves."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                required
              />
            </div>

            {closeError && <p className="error-msg" style={{ marginBottom: 12 }}>{closeError}</p>}
            {closeSuccess && <p className="success-msg" style={{ marginBottom: 12 }}>{closeSuccess}</p>}

            <button type="submit" className="button primary" disabled={closeBusy} style={{ width: '100%' }}>
              {closeBusy ? 'Guardando cierre...' : '✅ Confirmar Cierre de Venta'}
            </button>
          </form>
        </div>
      )}

      {/* Subtab 5: Alta de cliente en cuotas */}
      {activeSubtab === 'new_client' && (
        <SalesClientForm token={token} />
      )}
    </div>
  );
}
