import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CommercialOrdersPanel from './CommercialOrdersPanel';
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
  listCommercialOrders,
} from '../api';
import './commercialFlow.css';

const INFO_POR_SUBTAB = {
  prospects: [
    [
      'Clientes por contactar (CRM).',
      'Listado de prospectos generados por el bot en WhatsApp y registrados en el CRM con los 17 campos canónicos.',
    ],
  ],
  stock: [
    [
      'Catálogo Paljet.',
      'Existencias según la última actualización de la fuente de prueba. Si un producto no tiene stock, se sugieren hasta 2 sustitutos con stock (RF09).',
    ],
  ],
  credit_check: [
    [
      '🛡️ Principio de Secreto Comercial (OE-10).',
      'Este panel muestra únicamente el dictamen comercial aplicable. El informe financiero confidencial y las deudas detalladas del BCRA permanecen bajo resguardo de Administración.',
    ],
  ],
  commercial_orders: [
    [
      'Cierres de venta.',
      'Ficha completa con datos del cliente, entrega, cuotas y conversación.',
    ],
  ],
  close_sale: [
    [
      'Cierre manual (Tarea 6.9).',
      'Asentá en TrimIA la venta acordada y facturada manualmente en Paljet. Referencia: Tarea 6.9.',
    ],
  ],
  new_client: [
    [
      'Alta de cliente.',
      'Al cerrar una venta financiada, se da de alta el cliente con su plan de cuotas.',
    ],
  ],
};

const PROSPECT_STATUS_META = {
  NUEVO: { label: 'Nuevo', tone: 'is-new' },
  EN_CONTACTO: { label: 'En contacto', tone: 'is-contact' },
  CALIFICA: { label: 'Califica', tone: 'is-qualified' },
  COTIZADO: { label: 'Cotizado', tone: 'is-quoted' },
  PENDIENTE_CREDITO: { label: 'Crédito pendiente', tone: 'is-pending' },
  NO_CALIFICA: { label: 'No califica', tone: 'is-rejected' },
};

function getProspectStatusMeta(status) {
  const key = (status || 'NUEVO').toUpperCase();
  if (PROSPECT_STATUS_META[key]) return PROSPECT_STATUS_META[key];
  return {
    label: key.replace(/_/g, ' '),
    tone: 'is-default',
  };
}

const CREDIT_VERDICT_META = {
  APPROVED: {
    label: 'Aprobado para financiación',
    badge: 'Aprobado',
    tone: 'is-approved',
  },
  APPROVED_WITH_CONDITIONS: {
    label: 'Aprobado con condiciones comerciales',
    badge: 'Condicionado',
    tone: 'is-conditions',
  },
  REJECTED: {
    label: 'No califica para financiación',
    badge: 'Rechazado',
    tone: 'is-rejected',
  },
};

function formatCategoryLabel(category) {
  if (!category) return 'General';
  if (category === 'SMART_TV') return 'Smart TV';
  return category.replace(/_/g, ' ');
}

function getInitials(name) {
  const parts = String(name || 'CL')
    .replace(/\[[^\]]*\]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0] || 'CL').slice(0, 2).toUpperCase();
}

export default function SalesPanel({ token, me }) {
  const [activeSubtab, setActiveSubtab] = useState('prospects');
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [contactProspect, setContactProspect] = useState(null);
  const [banner, setBanner] = useState(null);
  const [ordersCount, setOrdersCount] = useState(null);
  const legacyMenuRef = useRef(null);

  // 1. Estado para Prospects (CRM)
  const [prospects, setProspects] = useState([]);
  const [loadingProspects, setLoadingProspects] = useState(false);
  const [prospectsError, setProspectsError] = useState('');
  const [prospectSearch, setProspectSearch] = useState('');
  const [prospectStatusFilter, setProspectStatusFilter] = useState('ALL');
  const [followUpTargetId, setFollowUpTargetId] = useState(null);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [takingProspectId, setTakingProspectId] = useState(null);

  // 2. Estado para Stock (Paljet)
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategory, setStockCategory] = useState('');
  const [stockAvailability, setStockAvailability] = useState('ALL');
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState('');
  const [stockCategories, setStockCategories] = useState([]);

  // 3. Estado para Consulta Crediticia (OE-10)
  const [creditDni, setCreditDni] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditResult, setCreditResult] = useState(null);
  const [creditLastQuery, setCreditLastQuery] = useState(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState('');

  // 4. Estado para Cierre Manual de Venta (Otras operaciones — legado intacto)
  const [closeProspectId, setCloseProspectId] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeModality, setCloseModality] = useState('CASH');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeSuccess, setCloseSuccess] = useState('');
  const [closeError, setCloseError] = useState('');

  const stockSearchRef = useRef('');
  stockSearchRef.current = stockSearch;

  const loadProspects = useCallback(async () => {
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
  }, [token]);

  const loadStock = useCallback(
    async (overrideQuery) => {
      setLoadingStock(true);
      setStockError('');
      const queryValue =
        overrideQuery !== undefined ? overrideQuery : stockSearchRef.current;
      try {
        const data = await getSalesStock(token, {
          query: queryValue,
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
    },
    [token, stockCategory],
  );

  useEffect(() => {
    if (activeSubtab === 'prospects') {
      loadProspects();
    }
  }, [activeSubtab, loadProspects]);

  useEffect(() => {
    if (activeSubtab === 'stock') {
      loadStock();
    }
  }, [activeSubtab, loadStock]);

  useEffect(() => {
    let current = true;
    getSalesStock(token)
      .then((items) => {
        if (current && Array.isArray(items)) {
          setStockCategories(
            [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
          );
        }
      })
      .catch(() => {});

    listCommercialOrders(token)
      .then((orders) => {
        if (current && Array.isArray(orders)) {
          setOrdersCount(orders.length);
        }
      })
      .catch(() => {});

    return () => {
      current = false;
    };
  }, [token]);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (
        legacyMenuRef.current?.open &&
        !legacyMenuRef.current.contains(e.target)
      ) {
        legacyMenuRef.current.open = false;
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  async function handleCreditCheck(e) {
    e.preventDefault();
    setCreditError('');
    setCreditResult(null);
    if (!creditDni.trim()) {
      setCreditError('Por favor ingresá el DNI o CUIT a consultar.');
      return;
    }

    const queriedDni = creditDni.trim();
    const queriedAmount = creditAmount ? Number(creditAmount) : undefined;

    setCreditBusy(true);
    try {
      const res = await checkCreditCommercial(token, {
        dni: queriedDni,
        amount: queriedAmount,
      });
      setCreditLastQuery({ dni: queriedDni, amount: queriedAmount });
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
    if (!p.conversationId) {
      setBanner({
        tone: 'warn',
        text: 'Este prospecto fue registrado sin hilo de conversación vinculado en TrimIA.',
      });
      return;
    }
    setTakingProspectId(p.id);
    try {
      await salesProspectAction(token, p.id, 'takeover');
      setContactProspect(p);
    } catch (err) {
      setBanner({ tone: 'error', text: err.message });
    } finally {
      setTakingProspectId(null);
    }
  }

  async function submitFollowUp(e, prospect) {
    e.preventDefault();
    if (!followUpText.trim()) return;
    setFollowUpBusy(true);
    try {
      const updated = await salesProspectAction(
        token,
        prospect.id,
        'followup',
        followUpText.trim(),
      );
      setBanner({
        tone: 'success',
        text:
          updated?.syncStatus === 'PENDING'
            ? 'Seguimiento guardado en TrimIA (pendiente de sincronización con CRM).'
            : 'Seguimiento comercial registrado correctamente.',
      });
      setFollowUpTargetId(null);
      setFollowUpText('');
      await loadProspects();
    } catch (err) {
      setBanner({ tone: 'error', text: err.message });
    } finally {
      setFollowUpBusy(false);
    }
  }

  useEffect(() => {
    if (!mostrarInfo) return undefined;

    function handleInfoKeyDown(e) {
      if (e.key === 'Escape') setMostrarInfo(false);
    }

    document.addEventListener('keydown', handleInfoKeyDown);
    return () => document.removeEventListener('keydown', handleInfoKeyDown);
  }, [mostrarInfo]);

  // Métricas y filtros de prospectos
  const prospectSummary = useMemo(() => {
    const counts = {
      ALL: prospects.length,
      NUEVO: 0,
      EN_CONTACTO: 0,
      CALIFICA: 0,
      HANDOFF: 0,
    };
    for (const p of prospects) {
      const st = (p.status || 'NUEVO').toUpperCase();
      counts[st] = (counts[st] || 0) + 1;
      if (p.handoff) counts.HANDOFF += 1;
    }
    return counts;
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    const q = prospectSearch.trim().toLowerCase();
    return prospects.filter((p) => {
      const st = (p.status || 'NUEVO').toUpperCase();
      if (prospectStatusFilter !== 'ALL' && st !== prospectStatusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        p.name,
        p.nombreApellido,
        p.phone,
        p.telefono,
        p.comercio,
        p.productInterest,
        p.productoInteres,
        p.notes,
        p.notasSeguimiento,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [prospects, prospectStatusFilter, prospectSearch]);

  // Métricas y filtro rápido de stock
  const stockSummary = useMemo(() => {
    let available = 0;
    let low = 0;
    let out = 0;
    for (const item of stockItems) {
      if (item.stock <= 0) out += 1;
      else if (item.stock === 1) {
        available += 1;
        low += 1;
      } else {
        available += 1;
      }
    }
    return {
      total: stockItems.length,
      available,
      low,
      out,
    };
  }, [stockItems]);

  const visibleStockItems = useMemo(() => {
    if (stockAvailability === 'AVAILABLE') {
      return stockItems.filter((i) => i.stock > 0);
    }
    if (stockAvailability === 'LOW') {
      return stockItems.filter((i) => i.stock === 1);
    }
    if (stockAvailability === 'OUT') {
      return stockItems.filter((i) => i.stock <= 0);
    }
    return stockItems;
  }, [stockItems, stockAvailability]);

  const isLegacyTab = activeSubtab === 'close_sale' || activeSubtab === 'new_client';

  function selectLegacySubtab(tab) {
    setActiveSubtab(tab);
    if (legacyMenuRef.current) {
      legacyMenuRef.current.open = false;
    }
  }

  return (
    <div className="sales-panel">
      {contactProspect && (
        <SalesConversationModal
          token={token}
          me={me}
          prospect={contactProspect}
          onClose={() => {
            setContactProspect(null);
            loadProspects();
          }}
        />
      )}

      <PageHero
        kicker="Operaciones comerciales"
        title="Panel de Ventas"
        description="Atención comercial de clientes derivados del bot, consulta de stock según su última actualización y alta de ventas."
      />

      <div className="submenu-bar sales-submenu-bar">
        <div className="sales-nav-left">
          <div className="submenu-pills">
            <button
              type="button"
              className={`submenu-pill${activeSubtab === 'prospects' ? ' active' : ''}`}
              onClick={() => setActiveSubtab('prospects')}
            >
              <span>👥 Clientes por contactar</span>
              <span className="fin-tab-count">{prospects.length}</span>
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
              className={`submenu-pill${activeSubtab === 'commercial_orders' ? ' active' : ''}`}
              onClick={() => setActiveSubtab('commercial_orders')}
            >
              <span>🧾 Cierres de venta</span>
              {ordersCount !== null && (
                <span className="fin-tab-count">{ordersCount}</span>
              )}
            </button>
          </div>

          <details
            ref={legacyMenuRef}
            className={`commerce-legacy${isLegacyTab ? ' is-active' : ''}`}
          >
            <summary>Otras operaciones</summary>
            <div className="commerce-legacy-menu">
              <button
                type="button"
                className={`submenu-pill${activeSubtab === 'close_sale' ? ' active' : ''}`}
                onClick={() => selectLegacySubtab('close_sale')}
              >
                Cierre manual anterior
              </button>
              <button
                type="button"
                className={`submenu-pill${activeSubtab === 'new_client' ? ' active' : ''}`}
                onClick={() => selectLegacySubtab('new_client')}
              >
                Alta de cuotas anterior
              </button>
            </div>
          </details>
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
              <h3 id="sales-info-title">
                {INFO_POR_SUBTAB[activeSubtab][0][0].replace(/\.$/, '')}
              </h3>
              <p>{INFO_POR_SUBTAB[activeSubtab][0][1]}</p>
            </section>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`fin-banner is-${banner.tone || 'success'}`}
          role="status"
          style={{ marginBottom: 16 }}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            className="fin-banner-dismiss"
            onClick={() => setBanner(null)}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Subtab 1: Clientes por contactar */}
      {activeSubtab === 'prospects' && (
        <section className="card sales-section-card">
          <header className="sales-section-header">
            <div>
              <h3>Prospectos comerciales derivados por el Asistente</h3>
              <p className="sales-section-subtitle">
                Sincronizados con el CRM en Google Sheets y auditados en PostgreSQL.
              </p>
            </div>
            <button
              type="button"
              className="btn-pill-action"
              onClick={loadProspects}
              disabled={loadingProspects}
            >
              {loadingProspects ? 'Actualizando…' : '↻ Actualizar'}
            </button>
          </header>

          {prospects.length > 0 && (
            <div className="sales-kpi-strip">
              <div className="sales-kpi-item">
                <span className="sales-kpi-label">Total activos</span>
                <strong className="sales-kpi-val">{prospectSummary.ALL}</strong>
              </div>
              <div className="sales-kpi-item is-blue">
                <span className="sales-kpi-label">Nuevos por atender</span>
                <strong className="sales-kpi-val">{prospectSummary.NUEVO || 0}</strong>
              </div>
              <div className="sales-kpi-item is-amber">
                <span className="sales-kpi-label">En contacto</span>
                <strong className="sales-kpi-val">{prospectSummary.EN_CONTACTO || 0}</strong>
              </div>
              <div className="sales-kpi-item is-emerald">
                <span className="sales-kpi-label">Califican</span>
                <strong className="sales-kpi-val">{prospectSummary.CALIFICA || 0}</strong>
              </div>
            </div>
          )}

          <div className="sales-toolbar-row">
            <div className="sales-filter-chips" role="tablist" aria-label="Filtrar prospectos por estado">
              {[
                { id: 'ALL', label: 'Todos', count: prospectSummary.ALL },
                { id: 'NUEVO', label: 'Nuevos', count: prospectSummary.NUEVO || 0 },
                {
                  id: 'EN_CONTACTO',
                  label: 'En contacto',
                  count: prospectSummary.EN_CONTACTO || 0,
                },
                { id: 'CALIFICA', label: 'Califica', count: prospectSummary.CALIFICA || 0 },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`sales-filter-chip${
                    prospectStatusFilter === chip.id ? ' is-active' : ''
                  }`}
                  onClick={() => setProspectStatusFilter(chip.id)}
                >
                  <span>{chip.label}</span>
                  <span className="sales-chip-count">{chip.count}</span>
                </button>
              ))}
            </div>

            <div className="sales-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Buscar cliente, teléfono, negocio o producto…"
                value={prospectSearch}
                onChange={(e) => setProspectSearch(e.target.value)}
              />
              {prospectSearch && (
                <button
                  type="button"
                  className="sup-search-clear"
                  onClick={() => setProspectSearch('')}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {prospectsError && (
            <p className="error" role="alert">
              {prospectsError}
            </p>
          )}

          {loadingProspects && prospects.length === 0 ? (
            <div className="sales-empty-box">
              <span className="fin-inline-spinner" aria-hidden="true" />
              <p>Cargando prospectos comerciales…</p>
            </div>
          ) : filteredProspects.length === 0 ? (
            <div className="sales-empty-box">
              <div className="sales-empty-icon" aria-hidden="true">👥</div>
              <strong>
                {prospects.length === 0
                  ? 'No hay clientes pendientes por contactar'
                  : 'Ningún prospecto coincide con tu búsqueda'}
              </strong>
              <p>
                {prospects.length === 0
                  ? 'Cuando el asistente derive oportunidades comerciales aparecerán en esta bandeja.'
                  : 'Probá seleccionando "Todos" o limpiando el filtro de búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="sales-prospects-grid">
              {filteredProspects.map((p) => {
                const name = p.name || p.nombreApellido || 'Cliente';
                const phone = p.phone || p.telefono || '';
                const product =
                  p.productInterest || p.productoInteres || 'Maquinaria gastronómica';
                const notes = p.notes || p.notasSeguimiento || '';
                const statusMeta = getProspectStatusMeta(p.status);
                const isFollowUpOpen = followUpTargetId === p.id;
                const isTaking = takingProspectId === p.id;

                return (
                  <article key={p.id} className="sales-prospect-card">
                    <div className="sales-prospect-body">
                      <header className="sales-prospect-top">
                        <div className="sales-prospect-person">
                          <div className="sales-prospect-avatar" aria-hidden="true">
                            {getInitials(name)}
                          </div>
                          <div className="sales-prospect-title-wrap">
                            <strong className="sales-prospect-name">{name}</strong>
                            <div className="sales-prospect-chips">
                              {phone && (
                                <span className="sales-phone-chip">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                  </svg>
                                  {phone}
                                </span>
                              )}
                              {p.syncStatus === 'PENDING' && (
                                <span className="sales-sync-chip" title="Pendiente de sincronizar con Google Sheets">
                                  CRM pendiente
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className={`sales-status-pill ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                      </header>

                      <div className="sales-prospect-details">
                        {p.comercio && (
                          <div className="sales-detail-row">
                            <span className="sales-detail-key">Negocio</span>
                            <span className="sales-detail-val">{p.comercio}</span>
                          </div>
                        )}
                        <div className="sales-detail-row">
                          <span className="sales-detail-key">Interés</span>
                          <span className="sales-detail-val is-product">{product}</span>
                        </div>
                      </div>

                      {p.handoff && (
                        <div className="sales-handoff-box">
                          <span className="sales-handoff-kicker">Resumen de derivación IA</span>
                          <dl className="sales-handoff-grid">
                            <div>
                              <dt>Producto</dt>
                              <dd>{p.handoff.producto}</dd>
                            </div>
                            {p.handoff.precioEstimado != null && (
                              <div>
                                <dt>Precio consultado</dt>
                                <dd>${p.handoff.precioEstimado.toLocaleString('es-AR')}</dd>
                              </div>
                            )}
                            {p.handoff.modalidad && (
                              <div>
                                <dt>Modalidad</dt>
                                <dd>
                                  {p.handoff.modalidad === 'CASH'
                                    ? 'Contado'
                                    : 'Financiado'}
                                </dd>
                              </div>
                            )}
                            {p.handoff.estadoCredito && (
                              <div>
                                <dt>Dictamen comercial</dt>
                                <dd>{p.handoff.estadoCredito}</dd>
                              </div>
                            )}
                            <div className="is-wide">
                              <dt>Motivo de derivación</dt>
                              <dd>{p.handoff.motivoAlerta}</dd>
                            </div>
                            {p.handoff.observaciones && (
                              <div className="is-wide">
                                <dt>Observaciones</dt>
                                <dd>{p.handoff.observaciones}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      <div className={`sales-prospect-notes${notes ? '' : ' is-empty'}`}>
                        {notes || 'Sin observaciones adicionales registradas.'}
                      </div>

                      {isFollowUpOpen && (
                        <form
                          className="sales-followup-box"
                          onSubmit={(e) => submitFollowUp(e, p)}
                        >
                          <label htmlFor={`followup-${p.id}`}>
                            Nuevo seguimiento comercial para CRM
                          </label>
                          <textarea
                            id={`followup-${p.id}`}
                            rows={2}
                            required
                            placeholder="Ej. Se envió cotización actualizada; coordinamos llamada mañana. (No incluyas informes crediticios internos)"
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                          />
                          <div className="sales-followup-actions">
                            <button
                              type="submit"
                              className="fin-btn-sm"
                              disabled={followUpBusy || !followUpText.trim()}
                            >
                              {followUpBusy ? 'Guardando…' : 'Guardar nota'}
                            </button>
                            <button
                              type="button"
                              className="secondary fin-btn-sm"
                              onClick={() => {
                                setFollowUpTargetId(null);
                                setFollowUpText('');
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    <footer className="sales-prospect-foot">
                      <div className="sales-prospect-foot-meta">
                        <span className="sales-prospect-date">
                          {p.createdAt
                            ? new Date(p.createdAt).toLocaleDateString('es-AR')
                            : 'Reciente'}
                        </span>
                        <button
                          type="button"
                          className="sales-link-btn"
                          onClick={() => {
                            setCloseProspectId(p.id);
                            setActiveSubtab('close_sale');
                          }}
                        >
                          Cerrar venta manual →
                        </button>
                      </div>

                      <div className="sales-prospect-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            if (isFollowUpOpen) {
                              setFollowUpTargetId(null);
                              setFollowUpText('');
                            } else {
                              setFollowUpTargetId(p.id);
                              setFollowUpText('');
                            }
                          }}
                        >
                          Seguimiento
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          disabled={isTaking}
                          title={
                            p.conversationId
                              ? 'Tomar control y abrir conversación en TrimIA'
                              : 'Este prospecto no tiene una conversación vinculada en TrimIA'
                          }
                          onClick={() => handleTakeProspect(p)}
                        >
                          {isTaking ? 'Abriendo…' : 'Retomar en TrimIA'}
                        </button>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Subtab 2: Consultar stock */}
      {activeSubtab === 'stock' && (
        <section className="card sales-section-card">
          <header className="sales-section-header">
            <div>
              <div className="sales-header-badges-row">
                <h3>Inventario y disponibilidad en Paljet</h3>
                {stockItems.some((item) => item.source === 'SIMULATED') && (
                  <span className="sales-source-pill">
                    Catálogo simulado de prueba
                  </span>
                )}
              </div>
              <p className="sales-section-subtitle">
                {stockItems.some((item) => item.source === 'SIMULATED')
                  ? 'Fuente de prueba sincronizada con reglas de sustitutos (RF09). No representa existencias comerciales reales.'
                  : 'Disponibilidad informada según la última sincronización con Paljet.'}
                {stockItems.length > 0 && stockItems[0].lastUpdated && (
                  <span className="sales-updated-inline">
                    {' '}
                    · Actualizado:{' '}
                    {new Date(stockItems[0].lastUpdated).toLocaleString('es-AR')}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn-pill-action"
              onClick={() => loadStock()}
              disabled={loadingStock}
            >
              {loadingStock ? 'Consultando…' : '↻ Actualizar catálogo'}
            </button>
          </header>

          <div className="sales-kpi-strip is-clickable">
            <button
              type="button"
              className={`sales-kpi-card-btn${stockAvailability === 'ALL' ? ' is-active' : ''}`}
              onClick={() => setStockAvailability('ALL')}
            >
              <span className="sales-kpi-label">Total referencias</span>
              <strong className="sales-kpi-val">{stockSummary.total}</strong>
            </button>
            <button
              type="button"
              className={`sales-kpi-card-btn is-emerald${
                stockAvailability === 'AVAILABLE' ? ' is-active' : ''
              }`}
              onClick={() => setStockAvailability('AVAILABLE')}
            >
              <span className="sales-kpi-label">Con stock disponible</span>
              <strong className="sales-kpi-val">{stockSummary.available}</strong>
            </button>
            <button
              type="button"
              className={`sales-kpi-card-btn is-amber${
                stockAvailability === 'LOW' ? ' is-active' : ''
              }`}
              onClick={() => setStockAvailability('LOW')}
            >
              <span className="sales-kpi-label">Bajo stock (1 unidad)</span>
              <strong className="sales-kpi-val">{stockSummary.low}</strong>
            </button>
            <button
              type="button"
              className={`sales-kpi-card-btn is-red${
                stockAvailability === 'OUT' ? ' is-active' : ''
              }`}
              onClick={() => setStockAvailability('OUT')}
            >
              <span className="sales-kpi-label">Sin stock (con sustitutos)</span>
              <strong className="sales-kpi-val">{stockSummary.out}</strong>
            </button>
          </div>

          <div className="sales-stock-toolbar">
            <div className="sales-search-box is-grow">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre del equipo o código SKU…"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadStock();
                }}
              />
              {stockSearch && (
                <button
                  type="button"
                  className="sup-search-clear"
                  onClick={() => {
                    setStockSearch('');
                    loadStock('');
                  }}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              className="sales-category-select"
              value={stockCategory}
              onChange={(e) => setStockCategory(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {stockCategories.map((category) => (
                <option key={category} value={category}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="button primary"
              onClick={() => loadStock()}
              disabled={loadingStock}
            >
              Buscar
            </button>
          </div>

          {stockError && (
            <p className="error" role="alert">
              {stockError}
            </p>
          )}

          {loadingStock && stockItems.length === 0 ? (
            <div className="sales-empty-box">
              <span className="fin-inline-spinner" aria-hidden="true" />
              <p>Consultando catálogo en Paljet…</p>
            </div>
          ) : visibleStockItems.length === 0 ? (
            <div className="sales-empty-box">
              <div className="sales-empty-icon" aria-hidden="true">📦</div>
              <strong>No se encontraron artículos con estos filtros</strong>
              <p>Probá limpiando la búsqueda o cambiando la categoría y disponibilidad.</p>
            </div>
          ) : (
            <div className="sales-table-wrap">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Precio contado</th>
                    <th>Precio lista (cuotas)</th>
                    <th>Disponibilidad</th>
                    <th className="sales-col-action">Enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStockItems.map((item) => (
                    <tr key={item.sku}>
                      <td>
                        <code className="sales-sku-code">{item.sku}</code>
                      </td>
                      <td>
                        <div className="sales-cell-primary">{item.name}</div>
                        {item.stock === 0 &&
                          item.substituteSkus &&
                          item.substituteSkus.length > 0 && (
                            <div className="sales-substitutes-row">
                              <span>Sustitutos con stock:</span>
                              {item.substituteSkus.map((subSku) => (
                                <button
                                  key={subSku}
                                  type="button"
                                  className="sales-sub-sku-chip"
                                  onClick={() => {
                                    setStockAvailability('ALL');
                                    setStockSearch(subSku);
                                    loadStock(subSku);
                                  }}
                                  title={`Filtrar sustituto ${subSku}`}
                                >
                                  {subSku}
                                </button>
                              ))}
                            </div>
                          )}
                      </td>
                      <td>
                        <span className="sales-category-tag">
                          {formatCategoryLabel(item.category)}
                        </span>
                      </td>
                      <td className="sales-cell-money">
                        {item.cashPrice == null ? (
                          <span className="sales-muted-dash">No informado</span>
                        ) : (
                          `$${Number(item.cashPrice).toLocaleString('es-AR')}`
                        )}
                      </td>
                      <td className="sales-cell-money">
                        {item.listPrice == null ? (
                          <span className="sales-muted-dash">No informado</span>
                        ) : (
                          `$${Number(item.listPrice).toLocaleString('es-AR')}`
                        )}
                      </td>
                      <td>
                        {item.stock > 0 ? (
                          <span
                            className={`sales-stock-pill ${
                              item.stock === 1 ? 'is-low' : 'is-ok'
                            }`}
                          >
                            {item.stock === 1
                              ? '1 unidad · Bajo stock'
                              : `${item.stock} unidades · Disponible`}
                          </span>
                        ) : (
                          <span className="sales-stock-pill is-out">
                            Sin stock (0 u.)
                          </span>
                        )}
                      </td>
                      <td className="sales-col-action">
                        {item.urlCredimision ? (
                          <a
                            href={item.urlCredimision}
                            target="_blank"
                            rel="noreferrer"
                            className="sales-ext-link"
                          >
                            Ver ficha ↗
                          </a>
                        ) : (
                          <span className="sales-muted-dash">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Subtab 3: Simulación Crediticia Confidencial */}
      {activeSubtab === 'credit_check' && (
        <div className="sales-credit-workspace">
          <section
            className="card sales-credit-form-card"
            aria-labelledby="credit-check-title"
          >
            <header className="credit-check-heading">
              <span className="credit-check-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3.5 19 6v5.2c0 4.5-2.9 7.7-7 9.3-4.1-1.6-7-4.8-7-9.3V6l7-2.5Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <h3 id="credit-check-title">Consulta de Aptitud Crediticia Comercial</h3>
                <p>
                  Verificá si el cliente califica para venta financiada antes de comprometer cuotas.
                </p>
              </div>
            </header>

            <form className="sales-credit-form" onSubmit={handleCreditCheck}>
              <div className="sales-credit-field">
                <label htmlFor="credit-check-dni">
                  DNI o CUIT del cliente <span aria-hidden="true">*</span>
                </label>
                <input
                  id="credit-check-dni"
                  type="text"
                  placeholder="Ej. 32123458 (sin puntos ni guiones)"
                  value={creditDni}
                  onChange={(e) => setCreditDni(e.target.value)}
                  required
                />
                <div className="sales-qa-dni-bar">
                  <span>Perfiles de prueba QA:</span>
                  <button
                    type="button"
                    className="sales-filter-chip"
                    onClick={() => setCreditDni('32123458')}
                  >
                    ...8 Aprobado
                  </button>
                  <button
                    type="button"
                    className="sales-filter-chip"
                    onClick={() => setCreditDni('32123454')}
                  >
                    ...4 Condicionado
                  </button>
                  <button
                    type="button"
                    className="sales-filter-chip"
                    onClick={() => setCreditDni('32123459')}
                  >
                    ...9 Rechazado
                  </button>
                </div>
              </div>

              <div className="sales-credit-field">
                <label htmlFor="credit-check-amount">
                  Monto estimado solicitado <span className="sales-opt-tag">Opcional</span>
                </label>
                <div className="sales-currency-field">
                  <span aria-hidden="true">$</span>
                  <input
                    id="credit-check-amount"
                    type="number"
                    min="0"
                    placeholder="Ej. 450000"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                  />
                </div>
              </div>

              {creditError && (
                <p className="error" role="alert">
                  {creditError}
                </p>
              )}

              <button
                type="submit"
                className="button primary credit-check-submit"
                disabled={creditBusy}
              >
                {creditBusy ? (
                  <>
                    <span className="fin-inline-spinner" aria-hidden="true" />
                    Consultando riesgo online…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                      <path d="M3.5 10h17" />
                    </svg>
                    Verificar Dictamen Crediticio
                  </>
                )}
              </button>
            </form>

            <div className="sales-confidentiality-note">
              <strong>🛡️ Resguardo de Secreto Comercial (OE-10):</strong> Ventas visualiza únicamente la aptitud y condición comercial aplicable. El scoring y detalle bancario permanecen reservados para Administración.
            </div>
          </section>

          <section className="card sales-credit-result-panel" aria-live="polite">
            {creditBusy ? (
              <div className="sales-credit-loading">
                <div className="fin-eval-spinner-wrap" aria-hidden="true">
                  <span className="fin-eval-spinner" />
                </div>
                <strong>Verificando aptitud comercial en línea…</strong>
                <p>
                  Consultando antecedentes crediticios para el documento{' '}
                  <code>{creditDni}</code> y aplicando reglas comerciales vigentes.
                </p>
                <div className="fin-eval-progress-track">
                  <div className="fin-eval-progress-bar" />
                </div>
              </div>
            ) : creditResult ? (
              (() => {
                const vMeta = CREDIT_VERDICT_META[creditResult.verdict] || {
                  label: creditResult.verdict,
                  badge: creditResult.verdict,
                  tone: 'is-conditions',
                };
                return (
                  <div className="sales-credit-verdict-wrap">
                    <div className={`fin-verdict-card ${vMeta.tone}`}>
                      <div className="fin-verdict-top">
                        <span className="sales-verdict-title">{vMeta.label}</span>
                        <span className={`sales-verdict-pill ${vMeta.tone}`}>
                          {vMeta.badge}
                        </span>
                      </div>
                      <div className="fin-verdict-condition">
                        <strong>Condición comercial aplicable:</strong>{' '}
                        {creditResult.commercialCondition}
                      </div>
                    </div>

                    <dl className="sales-credit-meta-grid">
                      <div>
                        <dt>Documento evaluado</dt>
                        <dd>{creditLastQuery?.dni || creditDni}</dd>
                      </div>
                      <div>
                        <dt>Monto estimado</dt>
                        <dd>
                          {creditLastQuery?.amount != null
                            ? `$${Number(creditLastQuery.amount).toLocaleString('es-AR')}`
                            : 'No especificado'}
                        </dd>
                      </div>
                      <div className="is-wide">
                        <dt>Fecha y hora de evaluación</dt>
                        <dd>
                          {new Date(creditResult.evaluatedAt).toLocaleString('es-AR')}
                        </dd>
                      </div>
                    </dl>

                    <div className="sales-credit-reset-row">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setCreditResult(null);
                          setCreditLastQuery(null);
                          setCreditDni('');
                          setCreditAmount('');
                        }}
                      >
                        Nueva consulta
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="sales-credit-idle">
                <div className="sales-empty-icon" aria-hidden="true">💳</div>
                <h4>Dictamen comercial instantáneo</h4>
                <p>
                  Ingresá el DNI o CUIT del cliente a la izquierda para conocer qué modalidad de pago podés ofrecerle antes de iniciar el cierre.
                </p>
                <ul className="sales-credit-guide-list">
                  <li>
                    <span className="sales-guide-dot is-ok" />
                    <div>
                      <strong>Aprobado:</strong> habilitado para planes en cuotas semanales según catálogo.
                    </div>
                  </li>
                  <li>
                    <span className="sales-guide-dot is-warn" />
                    <div>
                      <strong>Condicionado:</strong> requiere anticipo o revisión puntual de Administración.
                    </div>
                  </li>
                  <li>
                    <span className="sales-guide-dot is-err" />
                    <div>
                      <strong>Rechazado:</strong> operar únicamente al contado / transferencia.
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {activeSubtab === 'commercial_orders' && (
        <CommercialOrdersPanel
          token={token}
          me={me}
          onCountChange={setOrdersCount}
        />
      )}

      {/* Otras operaciones (legado intacto según indicación del usuario) */}
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
