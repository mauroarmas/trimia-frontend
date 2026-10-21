import { useState } from 'react';

const INITIAL_REQUESTS = [
  {
    id: 'req-101',
    clientName: 'Juan Carlos Pereyra',
    dni: '28.945.120',
    phone: '5493865667788',
    businessName: 'Carnicería El Chañar',
    businessAddress: 'Av. Mitre 450, Monteros',
    productRequested: 'Sierra Carnicera 2 HP + Picadora 32',
    totalAmount: '$ 2.400.000',
    requestedPlan: '16 cuotas semanales de $ 175.000',
    riskScore: 'SCORE: 780 / 1000 — RIESGO BAJO (Riesgo Online)',
    paljetHistory: 'Sin deudas registradas en Paljet. Cliente recurrente con 2 créditos finalizados al día.',
    agentPreApproval: 'PRE-APROBADO POR AGENTE IA (Confianza: 94%)',
    photos: [
      { label: 'Fachada del Local', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&q=80' },
      { label: 'Mostrador e Instalaciones', url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&q=80' },
    ],
    submittedAt: 'Hoy, 10:45 hs',
    status: 'PENDING_ADMIN_REVIEW',
  },
  {
    id: 'req-102',
    clientName: 'Silvina Maidana',
    dni: '34.567.890',
    phone: '5493865991122',
    businessName: 'Peluquería y Spa Glamour',
    businessAddress: 'San Martín 1230, Concepción',
    productRequested: 'Sillón Hidráulico de Peluquería x2',
    totalAmount: '$ 980.000',
    requestedPlan: '12 cuotas semanales de $ 95.000',
    riskScore: 'SCORE: 610 / 1000 — RIESGO MEDIO CON CONDICIONES',
    paljetHistory: 'Nuevo cliente en Paljet. Presenta constancia de monotributo al día.',
    agentPreApproval: 'PRE-APROBADO CON CONDICIÓN (Anticipo sugerido del 20%)',
    photos: [
      { label: 'Local Comercial', url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&q=80' },
    ],
    submittedAt: 'Ayer, 18:20 hs',
    status: 'PENDING_ADMIN_REVIEW',
  },
];

export default function AdminFinancingPanel({ token, me }) {
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionFeedback, setActionFeedback] = useState('');

  function handleDecision(id, decision) {
    const reason = decision === 'REJECTED' ? window.prompt('Motivo del rechazo de la venta financiada:', '') : '';
    if (decision === 'REJECTED' && reason === null) return;

    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: decision, rejectionReason: reason } : r)),
    );
    setSelectedRequest(null);
    setActionFeedback(
      decision === 'APPROVED'
        ? `Solicitud ${id} aprobada con éxito. Se notifica al vendedor y se asienta en el sistema.`
        : `Solicitud ${id} rechazada (${reason || 'Sin motivo especificado'}).`,
    );
    setTimeout(() => setActionFeedback(''), 5000);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Aprobación de Venta Financiada</h2>
          <p className="page-subtitle">
            Revisión administrativa de solicitudes pre-evaluadas por el bot con scoring de Riesgo Online y Paljet.
          </p>
        </div>
      </div>

      {actionFeedback && <p className="success-msg" style={{ marginBottom: 16 }}>{actionFeedback}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedRequest ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Lista de solicitudes */}
        <div className="card">
          <h3>Solicitudes de Crédito / Venta Financiada</h3>
          <p className="hint">
            Hacé clic en "Revisar" para analizar los antecedentes crediticios y las fotos del comercio.
          </p>

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Cliente / DNI</th>
                <th>Comercio</th>
                <th>Producto / Monto</th>
                <th>Dictamen IA</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.clientName}</strong>
                    <div className="hint" style={{ fontSize: 12 }}>DNI {r.dni}</div>
                  </td>
                  <td>
                    <div>{r.businessName}</div>
                    <div className="hint" style={{ fontSize: 12 }}>{r.businessAddress}</div>
                  </td>
                  <td>
                    <div>{r.productRequested}</div>
                    <div className="hint" style={{ fontSize: 12 }}>{r.totalAmount}</div>
                  </td>
                  <td>
                    <span className="badge status-active" style={{ fontSize: 11 }}>
                      {r.agentPreApproval.slice(0, 25)}...
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === 'APPROVED'
                          ? 'status-active'
                          : r.status === 'REJECTED'
                          ? 'status-error'
                          : 'status-warning'
                      }`}
                    >
                      {r.status === 'PENDING_ADMIN_REVIEW'
                        ? 'PENDIENTE'
                        : r.status === 'APPROVED'
                        ? 'APROBADO'
                        : 'RECHAZADO'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="secondary"
                      style={{ padding: '3px 8px', fontSize: 12 }}
                      onClick={() => setSelectedRequest(r)}
                    >
                      Revisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detalle y Aprobación */}
        {selectedRequest && (
          <div className="card" style={{ borderLeft: '4px solid var(--accent, #2f6ea3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Detalle de la Solicitud #{selectedRequest.id}</h3>
              <button className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setSelectedRequest(null)}>
                ✕ Cerrar
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              <div><strong>👤 Solicitante:</strong> {selectedRequest.clientName} (DNI {selectedRequest.dni}) - Tel: {selectedRequest.phone}</div>
              <div><strong>🏬 Negocio:</strong> {selectedRequest.businessName} ({selectedRequest.businessAddress})</div>
              <div><strong>📦 Producto:</strong> {selectedRequest.productRequested}</div>
              <div><strong>💰 Monto y Plan:</strong> {selectedRequest.totalAmount} — {selectedRequest.requestedPlan}</div>

              <div style={{ backgroundColor: 'var(--bg, #f8fafc)', padding: 12, borderRadius: 6, marginTop: 6 }}>
                <div><strong>📊 Riesgo Online:</strong> <span style={{ color: '#0d9488', fontWeight: 600 }}>{selectedRequest.riskScore}</span></div>
                <div style={{ marginTop: 4 }}><strong>📁 Historial Paljet:</strong> {selectedRequest.paljetHistory}</div>
                <div style={{ marginTop: 4 }}><strong>🤖 Evaluación del Agente:</strong> {selectedRequest.agentPreApproval}</div>
              </div>

              <div>
                <strong>📸 Fotos y Videos del Local:</strong>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  {selectedRequest.photos.map((ph, idx) => (
                    <div key={idx} style={{ textAlign: 'center' }}>
                      <img
                        src={ph.url}
                        alt={ph.label}
                        style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                      />
                      <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>{ph.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedRequest.status === 'PENDING_ADMIN_REVIEW' ? (
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => handleDecision(selectedRequest.id, 'APPROVED')}
                    style={{ backgroundColor: 'var(--success, #0d9488)', borderColor: 'var(--success, #0d9488)' }}
                  >
                    ✓ Aprobar Venta Financiada
                  </button>
                  <button
                    className="secondary"
                    onClick={() => handleDecision(selectedRequest.id, 'REJECTED')}
                    style={{ color: '#2f6ea3' }}
                  >
                    ✕ Rechazar Venta
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <span className={`badge ${selectedRequest.status === 'APPROVED' ? 'status-active' : 'status-error'}`}>
                    Estado: {selectedRequest.status}
                  </span>
                  {selectedRequest.rejectionReason && (
                    <p className="hint" style={{ marginTop: 6, color: '#2f6ea3' }}>
                      Motivo de rechazo: {selectedRequest.rejectionReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
