import { useState } from 'react';
import SalesClientForm from './SalesClientForm';
import InfoNotes, { InfoToggle } from './InfoNotes';

const SUBTAB_TITULO = {
  prospects: 'Clientes por contactar',
  stock: 'Consultar stock',
  new_client: 'Alta de cliente',
};

/** Qué explica el botón «Info» en cada subpestaña. */
const INFO_POR_SUBTAB = {
  prospects: [
    ['Clientes por contactar.',
      'Derivados automáticamente por el bot de WhatsApp según turno y disponibilidad.'],
  ],
  stock: [
    ['Consultar stock.',
      'Verificá disponibilidad de productos para asesorar al cliente o derivarlo con el link '
      + 'web oficial de Credimisión.'],
  ],
  new_client: [
    ['Alta de cliente.',
      'Al cerrar una venta financiada, se da de alta el cliente con su plan de cuotas.'],
    ['Sin cobrador asignado.',
      'Si no se le asigna cobrador, queda en la cola del Cobrador Controlador.'],
  ],
};

// Datos de demostración basados en las especificaciones del documento
const INITIAL_PROSPECTS = [
  {
    id: 'pr-1',
    name: 'Martín Benítez',
    phone: '5493865123456',
    reason: 'FINANCING_REQUESTED',
    reasonLabel: 'Cliente pide financiación',
    badgeClass: 'badge status-warning',
    business: 'Panadería y Confitería Los Molinos',
    product: 'Horno Convector 4 bandejas 60x40',
    details: 'Consultó por plan financiado en 12 cuotas semanales. Envió fotos de la fachada del local.',
    timestamp: 'Hace 15 min',
  },
  {
    id: 'pr-2',
    name: 'Carolina Gómez',
    phone: '5493865987654',
    reason: 'BOT_UNABLE',
    reasonLabel: 'Bot no supo responder',
    badgeClass: 'badge status-error',
    business: 'Rotisería Sabores',
    product: 'Freidora Industrial 30 Lts automática',
    details: 'Pregunta si la conexión de gas es para envasado o natural y tiempo de entrega en Concepción.',
    timestamp: 'Hace 35 min',
  },
  {
    id: 'pr-3',
    name: 'Esteban Morales',
    phone: '5493865443322',
    reason: 'HUMAN_REQUESTED',
    reasonLabel: 'Cliente pide hablar con una persona',
    badgeClass: 'badge status-info',
    business: 'Fiambrería El Trébol',
    product: 'Cortadora de fiambre 330mm acero inox',
    details: 'Quiere coordinar una visita presencial para probar la máquina antes de señar.',
    timestamp: 'Hace 1 hora',
  },
  {
    id: 'pr-4',
    name: 'Valeria Rivas',
    phone: '5493865778899',
    reason: 'FOLLOWUP_ABANDONED',
    reasonLabel: 'Seguimiento (sin compra en web tras 2h)',
    badgeClass: 'badge status-idle',
    business: 'Bar & Café Central',
    product: 'Cafetera Espresso 2 Bocas Comercial',
    details: 'Se le envió el link de Credimisión de la cafetera, pero no avanzó con el pago.',
    timestamp: 'Hace 2 horas',
  },
];

const STOCK_ITEMS = [
  {
    sku: 'HOR-CONV-04',
    name: 'Horno Convector 4 Bandejas 60x40',
    category: 'Cocción',
    stock: 7,
    price: '$ 850.000',
    webUrl: 'https://credimision.com/productos/horno-convector-4-bandejas',
    specs: '4 bandejas 60x40 cm, control digital de temperatura, acero inox 430.',
  },
  {
    sku: 'FRE-IND-30',
    name: 'Freidora Industrial 30 Litros Gas',
    category: 'Cocción',
    stock: 3,
    price: '$ 620.000',
    webUrl: 'https://credimision.com/productos/freidora-industrial-30l',
    specs: 'Capacidad 30 Lts, bacha en acero 304, válvula de seguridad.',
  },
  {
    sku: 'COR-FIA-330',
    name: 'Cortadora de Fiambre 330 mm Hoja Italiana',
    category: 'Procesamiento',
    stock: 12,
    price: '$ 490.000',
    webUrl: 'https://credimision.com/productos/cortadora-fiambre-330mm',
    specs: 'Cuchilla de 330 mm, afilador incorporado, motor 1/3 HP.',
  },
  {
    sku: 'CAF-EXP-02',
    name: 'Cafetera Espresso 2 Grupos Automática',
    category: 'Cafetería',
    stock: 2,
    price: '$ 1.450.000',
    webUrl: 'https://credimision.com/productos/cafetera-espresso-2-grupos',
    specs: 'Caldera de cobre 11 Lts, lancetas de vapor inox, 220V.',
  },
  {
    sku: 'HEL-EXH-4P',
    name: 'Heladera Exhibidora Vertical 4 Puertas',
    category: 'Refrigeración',
    stock: 0,
    price: '$ 1.890.000',
    webUrl: 'https://credimision.com/productos/heladera-vertical-4-puertas',
    specs: 'Capacidad 1600 Lts, iluminación LED, motor 1/2 HP reforzado.',
  },
];

export default function SalesPanel({ token, me }) {
  const [activeSubtab, setActiveSubtab] = useState('prospects');
  const [prospects, setProspects] = useState(INITIAL_PROSPECTS);
  const [stockSearch, setStockSearch] = useState('');
  const [contactedMsg, setContactedMsg] = useState('');
  const [mostrarInfo, setMostrarInfo] = useState(false);

  function handleTakeProspect(p) {
    setContactedMsg(`Iniciando contacto con ${p.name} (${p.phone}). Podés contactarlo vía WhatsApp o llamarlo.`);
    setTimeout(() => setContactedMsg(''), 6000);
  }

  const filteredStock = STOCK_ITEMS.filter((item) => {
    const q = stockSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
  });

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
            📦 Consultar stock
          </button>
          <button
            type="button"
            className={`submenu-pill${activeSubtab === 'new_client' ? ' active' : ''}`}
            onClick={() => setActiveSubtab('new_client')}
          >
            📝 Alta de cliente (Cierre)
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3>Clientes que requieren atención de un vendedor</h3>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {prospects.map((p) => (
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
                      <strong style={{ fontSize: 16 }}>{p.name}</strong>
                      <div className="hint" style={{ fontSize: 12 }}>📞 {p.phone}</div>
                    </div>
                    <span className={p.badgeClass} style={{ fontSize: 11 }}>{p.reasonLabel}</span>
                  </div>

                  <div style={{ margin: '8px 0', fontSize: 13 }}>
                    <div><strong>🏢 Negocio:</strong> {p.business}</div>
                    <div><strong>🔍 Consultó por:</strong> {p.product}</div>
                    <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                      <em>"{p.details}"</em>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="msg-time">{p.timestamp}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a
                      href={`https://wa.me/${p.phone}?text=${encodeURIComponent(`¡Hola ${p.name}! Te contacto de Credimisión sobre tu consulta por el ${p.product}. ¿Cómo estás?`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="button secondary"
                      style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                      onClick={() => handleTakeProspect(p)}
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 2: Consultar stock */}
      {activeSubtab === 'stock' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3>Consulta de Stock en Catálogo</h3>
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, SKU o rubro..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Rubro</th>
                <th>Precio</th>
                <th>Stock disponible</th>
                <th>Enlace Credimisión</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.map((item) => (
                <tr key={item.sku}>
                  <td><code>{item.sku}</code></td>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="hint" style={{ fontSize: 12 }}>{item.specs}</div>
                  </td>
                  <td>{item.category}</td>
                  <td><strong>{item.price}</strong></td>
                  <td>
                    {item.stock > 0 ? (
                      <span className="badge status-active">{item.stock} unidades</span>
                    ) : (
                      <span className="badge status-error">Sin stock</span>
                    )}
                  </td>
                  <td>
                    <a href={item.webUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      🌐 Ver en página
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subtab 3: Alta de cliente (Cierre) */}
      {activeSubtab === 'new_client' && (
        <SalesClientForm token={token} />
      )}
    </div>
  );
}

