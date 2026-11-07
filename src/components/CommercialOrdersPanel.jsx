import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listCommercialOrders } from '../api';
import CommercialOrderCard, {
  commercialMoney,
  commercialStage,
  commercialStageTone,
} from './CommercialOrderCard';

const ORDER_FILTERS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'READY', label: 'Listos para cerrar' },
  { id: 'CHOOSING', label: 'Esperando cliente' },
  { id: 'REVIEW', label: 'En revisión' },
  { id: 'CLOSED', label: 'Cerrados' },
];

function matchesOrderFilter(row, filterId) {
  if (filterId === 'ALL') return true;
  if (filterId === 'CLOSED') return Boolean(row.closedAt);
  if (row.closedAt || row.status === 'CANCELLED') return false;
  if (filterId === 'READY') return row.flow?.stage === 'READY' && !row.expired;
  if (filterId === 'CHOOSING') return row.flow?.stage === 'CHOOSING';
  if (filterId === 'REVIEW') return row.flow?.stage === 'REVIEW' || row.expired;
  return true;
}

export default function CommercialOrdersPanel({ token, me, onCountChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [stageFilter, setStageFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const detailRef = useRef(null);

  const load = useCallback(() => {
    return listCommercialOrders(token)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setError('');
        onCountChange?.(list.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, onCountChange]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    return {
      ALL: rows.length,
      READY: rows.filter((r) => matchesOrderFilter(r, 'READY')).length,
      CHOOSING: rows.filter((r) => matchesOrderFilter(r, 'CHOOSING')).length,
      REVIEW: rows.filter((r) => matchesOrderFilter(r, 'REVIEW')).length,
      CLOSED: rows.filter((r) => matchesOrderFilter(r, 'CLOSED')).length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesOrderFilter(row, stageFilter)) return false;
      if (!q) return true;
      const haystack = [
        row.client?.name,
        row.client?.dni,
        row.business,
        row.locality,
        row.productSummary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, stageFilter, search]);

  function openOrder(id) {
    setSelected(id);
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  return (
    <div className="sales-orders-stack">
      <section className="card sales-section-card">
        <header className="sales-section-header">
          <div>
            <h3>Cierres de venta</h3>
            <p className="sales-section-subtitle">
              Pedidos recopilados por el agente. Revisá la ficha completa y la conversación antes de confirmar el cierre.
            </p>
          </div>
          <button type="button" className="btn-pill-action" onClick={load}>
            ↻ Actualizar
          </button>
        </header>

        <div className="sales-toolbar-row">
          <div className="sales-filter-chips" role="tablist" aria-label="Filtrar pedidos comerciales">
            {ORDER_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`sales-filter-chip${stageFilter === f.id ? ' is-active' : ''}`}
                onClick={() => setStageFilter(f.id)}
              >
                <span>{f.label}</span>
                <span className="sales-chip-count">{counts[f.id] ?? 0}</span>
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
              placeholder="Buscar por cliente, DNI, comercio o producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="sup-search-clear"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {loading && rows.length === 0 ? (
          <div className="sales-empty-box">
            <span className="fin-inline-spinner" aria-hidden="true" />
            <p>Consultando pedidos comerciales…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="sales-empty-box">
            <div className="sales-empty-icon" aria-hidden="true">🧾</div>
            <strong>
              {rows.length === 0
                ? 'Todavía no hay pedidos listos en esta bandeja'
                : 'No hay pedidos que coincidan con el filtro'}
            </strong>
            <p>
              {rows.length === 0
                ? 'Los pedidos nuevos aparecerán aquí cuando el agente complete los datos con el cliente.'
                : 'Probá cambiando el filtro de etapa o limpiando el texto de búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="sales-table-wrap">
            <table className="sales-table commerce-orders-table">
              <thead>
                <tr>
                  <th>Cliente y comercio</th>
                  <th>Producto y modalidad</th>
                  <th>Total</th>
                  <th>Próximo paso</th>
                  <th className="sales-col-action">Ficha</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const chosenOffer = row.flow?.offers?.find(
                    (o) => o.id === row.flow?.selectedOfferId,
                  );
                  const isSelected = selected === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={isSelected ? 'is-selected' : undefined}
                    >
                      <td>
                        <div className="sales-cell-primary">{row.client.name}</div>
                        <div className="sales-cell-sub">
                          DNI {row.client.dni} · {row.business} ({row.locality})
                        </div>
                      </td>
                      <td>
                        <div className="sales-cell-primary">{row.productSummary}</div>
                        <div className="sales-cell-sub">
                          {chosenOffer ? chosenOffer.label : 'Forma de pago pendiente'}
                        </div>
                      </td>
                      <td className="sales-cell-money">
                        {commercialMoney(chosenOffer?.total ?? row.amount)}
                      </td>
                      <td>
                        <span className={`commerce-stage-pill ${commercialStageTone(row)}`}>
                          {commercialStage(row)}
                        </span>
                      </td>
                      <td className="sales-col-action">
                        <button
                          type="button"
                          className={isSelected ? 'btn-pill-action' : 'secondary'}
                          onClick={() =>
                            isSelected ? setSelected(null) : openOrder(row.id)
                          }
                        >
                          {isSelected ? 'Ocultar' : 'Abrir ficha'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div ref={detailRef}>
          <CommercialOrderCard
            key={selected}
            token={token}
            me={me}
            id={selected}
            onChanged={load}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
