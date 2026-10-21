import { useEffect, useRef, useState } from 'react';
import InfoNotes, { InfoToggle } from './InfoNotes';

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

const FILTROS = [
  ['PENDING_ADMIN_REVIEW', 'Pendientes'],
  ['APPROVED', 'Aprobadas'],
  ['REJECTED', 'Rechazadas'],
  ['ALL', 'Todas'],
];

const ESTADO = {
  PENDING_ADMIN_REVIEW: { texto: 'Pendiente', clase: 'status-warning' },
  APPROVED: { texto: 'Aprobada', clase: 'status-active' },
  REJECTED: { texto: 'Rechazada', clase: 'status-error' },
};

const INFO = [
  ['Cómo revisar.',
    'Hacé clic en «Revisar» para analizar los antecedentes crediticios y las fotos del comercio.'],
  ['Pre-evaluación.',
    'Cada solicitud llega pre-evaluada por el bot con el scoring de Riesgo Online y el '
    + 'historial de Paljet.'],
  ['Decisión.',
    'Al aprobar se notifica al vendedor y se asienta en el sistema. Al rechazar se registra '
    + 'el motivo, si lo indicás.'],
];

/** El score viene como texto ("SCORE: 780 / 1000 — …"); se extrae solo para el medidor. */
function scoreDe(texto) {
  const m = /SCORE:\s*(\d+)\s*\/\s*(\d+)/i.exec(texto ?? '');
  return m ? Number(m[1]) / Number(m[2]) : null;
}

export default function AdminFinancingPanel({ token, me }) {
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [selectedId, setSelectedId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [filtro, setFiltro] = useState('PENDING_ADMIN_REVIEW');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const detalleRef = useRef(null);

  // En pantallas medianas el detalle se abre debajo de la lista: sin esto,
  // «Revisar» parece no hacer nada.
  useEffect(() => {
    if (selectedId) detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const selectedRequest = requests.find((r) => r.id === selectedId) ?? null;
  const conteos = {
    ALL: requests.length,
    PENDING_ADMIN_REVIEW: requests.filter((r) => r.status === 'PENDING_ADMIN_REVIEW').length,
    APPROVED: requests.filter((r) => r.status === 'APPROVED').length,
    REJECTED: requests.filter((r) => r.status === 'REJECTED').length,
  };
  const visibles = filtro === 'ALL' ? requests : requests.filter((r) => r.status === filtro);

  function abrir(id) {
    setSelectedId(id);
    setRechazando(false);
    setMotivo('');
  }

  function handleDecision(id, decision) {
    const reason = decision === 'REJECTED' ? motivo.trim() : '';

    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: decision, rejectionReason: reason } : r)),
    );
    setSelectedId(null);
    setRechazando(false);
    setMotivo('');
    setActionFeedback(
      decision === 'APPROVED'
        ? `Solicitud ${id} aprobada con éxito. Se notifica al vendedor y se asienta en el sistema.`
        : `Solicitud ${id} rechazada (${reason || 'Sin motivo especificado'}).`,
    );
    setTimeout(() => setActionFeedback(''), 5000);
  }

  const score = scoreDe(selectedRequest?.riskScore);

  return (
    <div className="knowledge-page financing-page">
      <section className="knowledge-hero">
        <div className="knowledge-hero-layout">
          <div>
            <span className="knowledge-hero-kicker">Riesgo y aprobación</span>
            <h2 className="knowledge-hero-title">Aprobación de Venta Financiada</h2>
            <p className="knowledge-hero-description">
              Revisión administrativa de solicitudes pre-evaluadas por el bot con scoring de Riesgo
              Online y Paljet.
            </p>
          </div>
          <div className="employees-hero-stats">
            <div>
              <strong>{conteos.PENDING_ADMIN_REVIEW}</strong>
              <span>pendientes</span>
            </div>
            <div>
              <strong>{conteos.APPROVED}</strong>
              <span>aprobadas</span>
            </div>
          </div>
        </div>
      </section>

      <div className="submenu-bar">
        <nav className="submenu-pills" aria-label="Filtrar solicitudes">
          {FILTROS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`submenu-pill${filtro === id ? ' active' : ''}`}
              aria-current={filtro === id ? 'page' : undefined}
              onClick={() => setFiltro(id)}
            >
              {label} <span className="employees-tab-count">{conteos[id]}</span>
            </button>
          ))}
        </nav>
        <div className="info-bar-actions">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
        </div>
      </div>

      {mostrarInfo && (
        <InfoNotes
          title="Aprobación de venta financiada"
          notes={INFO}
          onClose={() => setMostrarInfo(false)}
        />
      )}

      {actionFeedback && <p className="success-msg financing-feedback">{actionFeedback}</p>}

      <div className={`financing-layout${selectedRequest ? ' has-detail' : ''}`}>
        {/* Lista de solicitudes */}
        <section className="knowledge-panel">
          <header className="knowledge-panel-heading">
            <div>
              <span className="knowledge-kicker">Bandeja</span>
              <h3>Solicitudes de crédito</h3>
            </div>
            <span className="knowledge-panel-count">{visibles.length} solicitudes</span>
          </header>

          <div className="knowledge-table-wrap">
            <table className="knowledge-table financing-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Comercio</th>
                  <th>Producto / Monto</th>
                  <th>Dictamen IA</th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr className="knowledge-table-empty">
                    <td colSpan={6}>No hay solicitudes en esta vista.</td>
                  </tr>
                )}
                {visibles.map((r) => (
                  <tr key={r.id} className={r.id === selectedId ? 'is-selected' : undefined}>
                    <td className="knowledge-doc-cell">
                      <strong className="knowledge-doc-title">{r.clientName}</strong>
                      <span className="knowledge-doc-summary">DNI {r.dni} · {r.submittedAt}</span>
                    </td>
                    <td data-label="Comercio">
                      <span className="financing-cell-main">{r.businessName}</span>
                      <span className="knowledge-doc-summary">{r.businessAddress}</span>
                    </td>
                    <td data-label="Producto / Monto">
                      <span className="financing-cell-main">{r.productRequested}</span>
                      <span className="financing-amount">{r.totalAmount}</span>
                    </td>
                    <td data-label="Dictamen IA">
                      <span className="financing-verdict" title={r.agentPreApproval}>
                        {r.agentPreApproval}
                      </span>
                    </td>
                    <td data-label="Estado">
                      <span className={`badge ${ESTADO[r.status].clase}`}>{ESTADO[r.status].texto}</span>
                    </td>
                    <td className="knowledge-row-action">
                      <button type="button" className="secondary" onClick={() => abrir(r.id)}>
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detalle y Aprobación */}
        {selectedRequest && (
          <section className="knowledge-panel financing-detail" ref={detalleRef}>
            <header className="knowledge-panel-heading">
              <div>
                <span className="knowledge-kicker">Solicitud #{selectedRequest.id}</span>
                <h3>{selectedRequest.clientName}</h3>
              </div>
              <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
                ✕ Cerrar
              </button>
            </header>

            <dl className="financing-facts">
              <div>
                <dt>DNI</dt>
                <dd>{selectedRequest.dni}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{selectedRequest.phone}</dd>
              </div>
              <div>
                <dt>Negocio</dt>
                <dd>{selectedRequest.businessName}<small>{selectedRequest.businessAddress}</small></dd>
              </div>
              <div>
                <dt>Producto</dt>
                <dd>{selectedRequest.productRequested}</dd>
              </div>
              <div>
                <dt>Monto</dt>
                <dd className="financing-amount">{selectedRequest.totalAmount}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>{selectedRequest.requestedPlan}</dd>
              </div>
            </dl>

            <div className="financing-risk">
              <h4 className="knowledge-section-title">Evaluación de riesgo</h4>
              <div className="financing-risk-row">
                <span className="financing-risk-label">Riesgo Online</span>
                <div className="financing-risk-value">
                  <strong>{selectedRequest.riskScore}</strong>
                  {score !== null && (
                    <div className="knowledge-result-score-track financing-score-track" aria-hidden="true">
                      <div style={{ width: `${score * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="financing-risk-row">
                <span className="financing-risk-label">Historial Paljet</span>
                <p>{selectedRequest.paljetHistory}</p>
              </div>
              <div className="financing-risk-row">
                <span className="financing-risk-label">Agente IA</span>
                <p>{selectedRequest.agentPreApproval}</p>
              </div>
            </div>

            <div>
              <h4 className="knowledge-section-title">Fotos y videos del local</h4>
              <div className="financing-photos">
                {selectedRequest.photos.map((ph, idx) => (
                  <figure key={idx}>
                    <img src={ph.url} alt={ph.label} />
                    <figcaption>{ph.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            {selectedRequest.status === 'PENDING_ADMIN_REVIEW' ? (
              <div className="financing-decision">
                {rechazando && (
                  <div className="knowledge-filter">
                    <label>Motivo del rechazo (opcional)</label>
                    <textarea
                      rows={3}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ej: score insuficiente para el monto solicitado"
                      autoFocus
                    />
                  </div>
                )}
                <div className="knowledge-form-actions">
                  {rechazando ? (
                    <>
                      <button type="button" className="secondary" onClick={() => setRechazando(false)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="secondary knowledge-danger-button"
                        onClick={() => handleDecision(selectedRequest.id, 'REJECTED')}
                      >
                        Confirmar rechazo
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary knowledge-danger-button"
                        onClick={() => setRechazando(true)}
                      >
                        ✕ Rechazar venta
                      </button>
                      <button
                        type="button"
                        className="knowledge-primary-button financing-approve"
                        onClick={() => handleDecision(selectedRequest.id, 'APPROVED')}
                      >
                        ✓ Aprobar venta financiada
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="financing-decision">
                <span className={`badge ${ESTADO[selectedRequest.status].clase}`}>
                  {ESTADO[selectedRequest.status].texto}
                </span>
                {selectedRequest.rejectionReason && (
                  <p className="knowledge-side-copy">
                    Motivo de rechazo: {selectedRequest.rejectionReason}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
