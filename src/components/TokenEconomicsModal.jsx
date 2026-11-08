import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { estimateMetricsEconomics, formatUsd } from '../tokenEconomics';

const VOLUME_SCENARIOS = [500, 1500, 5000, 15000];

export default function TokenEconomicsModal({ metrics, onClose, children }) {
  const [monthlyQueries, setMonthlyQueries] = useState(1500);
  const [arsRate, setArsRate] = useState(1200);
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const econ = estimateMetricsEconomics(metrics);

  // Si aún no hay llamadas registradas, estimamos una consulta típica (~1.800 tokens entrada + ~90 salida)
  const unitCostForProjection =
    econ.costPerCallUsd > 0
      ? econ.costPerCallUsd
      : (1800 / 1_000_000) * econ.primaryPricing.inputPer1M +
        (90 / 1_000_000) * econ.primaryPricing.outputPer1M;

  const projectedMonthlyUsd = monthlyQueries * unitCostForProjection;
  const projectedMonthlyArs =
    Number.isFinite(Number(arsRate)) && Number(arsRate) > 0
      ? projectedMonthlyUsd * Number(arsRate)
      : null;

  const avgSeconds =
    econ.avgDurationMs != null ? (econ.avgDurationMs / 1000).toFixed(1) : null;

  return createPortal(
    <div
      className="econ-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="econ-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="econ-modal-title"
      >
        <header className="econ-modal-header">
          <div>
            <span className="econ-modal-kicker">Eficiencia e impacto económico</span>
            <h2 id="econ-modal-title">Métricas y Costos de IA</h2>
            <p>
              Traducción del uso real del asistente virtual a costos operativos estimados y
              capacidad de atención para el negocio.
            </p>
          </div>
          <button
            type="button"
            className="econ-modal-close"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            ✕
          </button>
        </header>

        <div className="econ-modal-body">
          {children}
          {/* KPIs ejecutivos en lenguaje no técnico */}
          <div className="econ-kpi-grid">
            <article className="econ-kpi-card is-highlight">
              <span className="econ-kpi-label">Inversión acumulada estimada</span>
              <strong className="econ-kpi-value">{formatUsd(econ.totalCostUsd)}</strong>
              <span className="econ-kpi-sub">
                {econ.totalCalls > 0
                  ? `En ${econ.totalCalls.toLocaleString('es-AR')} intervenciones de IA`
                  : 'Sin intervenciones registradas aún'}
              </span>
            </article>

            <article className="econ-kpi-card">
              <span className="econ-kpi-label">Rendimiento por dólar</span>
              <strong className="econ-kpi-value">
                {econ.responsesPerDollar
                  ? `~${econ.responsesPerDollar.toLocaleString('es-AR')}`
                  : '~1.300'}
              </strong>
              <span className="econ-kpi-sub">
                respuestas completas por cada USD $1,00
              </span>
            </article>

            <article className="econ-kpi-card">
              <span className="econ-kpi-label">Volumen leído y redactado</span>
              <strong className="econ-kpi-value">
                ~{econ.equivalentPages.toLocaleString('es-AR')} págs.
              </strong>
              <span className="econ-kpi-sub">
                ~{econ.equivalentWords.toLocaleString('es-AR')} palabras procesadas de manuales y chats
              </span>
            </article>

            <article className="econ-kpi-card">
              <span className="econ-kpi-label">Tiempo medio de respuesta</span>
              <strong className="econ-kpi-value">
                {avgSeconds ? `${avgSeconds} s` : '—'}
              </strong>
              <span className="econ-kpi-sub">
                Promedio observado; sujeto a latencia y límites de Google
              </span>
            </article>
          </div>

          {/* Motor de IA activo */}
          <section className="econ-section-card">
            <div className="econ-model-row">
              <div className="econ-model-info">
                <div className="econ-model-title-group">
                  <span className="econ-model-icon" aria-hidden="true">✦</span>
                  <div>
                    <div className="econ-model-name-row">
                      <h3>{econ.primaryPricing.label}</h3>
                      <span className="econ-pill-badge">{econ.primaryPricing.badge}</span>
                    </div>
                    <p className="econ-model-desc">{econ.primaryPricing.summary}</p>
                  </div>
                </div>
              </div>
              <div className="econ-model-rates">
                <div className="econ-rate-item">
                  <span>Lectura de contexto</span>
                  <strong>USD ${econ.primaryPricing.inputPer1M.toFixed(2)} / 1M</strong>
                </div>
                <div className="econ-rate-item">
                  <span>Redacción de respuesta</span>
                  <strong>USD ${econ.primaryPricing.outputPer1M.toFixed(2)} / 1M</strong>
                </div>
              </div>
            </div>
          </section>

          {/* Proyección de escala para toma de decisiones */}
          <section className="econ-section-card econ-projection-card">
            <div className="econ-section-head">
              <div>
                <h3>Proyección mensual para planificación</h3>
                <p>
                  Simulá cuánto costaría operar el asistente según la cantidad de consultas mensuales que reciba Credimisión.
                </p>
              </div>
            </div>

            <div className="econ-projection-controls">
              <div className="econ-scenario-pills" role="group" aria-label="Consultas por mes">
                {VOLUME_SCENARIOS.map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    className={`econ-scenario-btn${monthlyQueries === qty ? ' active' : ''}`}
                    onClick={() => setMonthlyQueries(qty)}
                  >
                    {qty.toLocaleString('es-AR')} consultas/mes
                  </button>
                ))}
              </div>

              <label className="econ-ars-input">
                <span>Cotización USD (ARS opcional)</span>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={arsRate}
                  onChange={(e) => setArsRate(e.target.value)}
                />
              </label>
            </div>

            <div className="econ-projection-result">
              <div>
                <span className="econ-proj-caption">
                  Costo mensual estimado para {monthlyQueries.toLocaleString('es-AR')} consultas:
                </span>
                <div className="econ-proj-numbers">
                  <strong>{formatUsd(projectedMonthlyUsd, { compact: true })} / mes</strong>
                  {projectedMonthlyArs != null && (
                    <span className="econ-proj-ars">
                      ≈ ARS ${Math.round(projectedMonthlyArs).toLocaleString('es-AR')} / mes
                    </span>
                  )}
                </div>
              </div>
              <span className="econ-proj-hint">
                Calculado según el promedio real actual ({formatUsd(unitCostForProjection)} por consulta)
              </span>
            </div>
          </section>

          {/* Distribución por área */}
          <section className="econ-section-card">
            <div className="econ-section-head">
              <div>
                <h3>Distribución del uso por sector</h3>
                <p>En qué áreas de atención se concentra el trabajo del asistente.</p>
              </div>
            </div>

            {econ.agentRows.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Todavía no hay consumo registrado por sector.
              </p>
            ) : (
              <div className="econ-agent-list">
                {econ.agentRows.map((row) => {
                  const sharePct =
                    econ.totalCostUsd > 0
                      ? Math.round((row.usd / econ.totalCostUsd) * 100)
                      : econ.totalTokens > 0
                        ? Math.round((row.total / econ.totalTokens) * 100)
                        : 0;
                  return (
                    <div className="econ-agent-row" key={row.agentKey}>
                      <div className="econ-agent-row-top">
                        <div className="econ-agent-title">
                          <span
                            className="econ-agent-dot"
                            style={{ backgroundColor: row.color }}
                          />
                          <strong>{row.name}</strong>
                          <span className="econ-agent-role">{row.role}</span>
                        </div>
                        <div className="econ-agent-figures">
                          {row.calls != null && (
                            <span className="econ-agent-calls">
                              {row.calls} {row.calls === 1 ? 'intervención' : 'intervenciones'}
                            </span>
                          )}
                          <strong>{formatUsd(row.usd)}</strong>
                          <span className="econ-agent-pct">{sharePct}%</span>
                        </div>
                      </div>
                      <div className="econ-agent-bar-track">
                        <div
                          className="econ-agent-bar-fill"
                          style={{
                            width: `${Math.max(sharePct, 3)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Detalle técnico opcional colapsable */}
          <div className="econ-tech-toggle-wrap">
            <button
              type="button"
              className="secondary econ-tech-toggle"
              onClick={() => setShowTechnical((v) => !v)}
            >
              {showTechnical ? 'Ocultar detalle técnico de tokens ▲' : 'Ver detalle técnico de tokens y modelos ▼'}
            </button>

            {showTechnical && (
              <div className="econ-tech-box">
                <div className="econ-tech-grid">
                  <div>
                    <span>Tokens de lectura (Input)</span>
                    <strong>{econ.totalInput.toLocaleString('es-AR')}</strong>
                  </div>
                  <div>
                    <span>Tokens de escritura (Output)</span>
                    <strong>{econ.totalOutput.toLocaleString('es-AR')}</strong>
                  </div>
                  <div>
                    <span>Modelo conversacional configurado</span>
                    <code>{econ.configuredModel}</code>
                  </div>
                  <div>
                    <span>Modelo de búsqueda vectorial (Embeddings)</span>
                    <code>{econ.embeddingModel}</code>
                  </div>
                  {econ.ttsModel && (
                    <div>
                      <span>Modelo de voz (Capacitación TTS)</span>
                      <code>{econ.ttsModel}</code>
                    </div>
                  )}
                </div>
                <p className="econ-methodology-note">
                  <strong>Nota metodológica:</strong> Un <em>token</em> equivale aproximadamente a tres cuartas partes de una palabra.
                  La estimación económica aplica el cuadro tarifario público <em>Pay-as-you-go</em> de Google AI Studio sobre cada llamada registrada en la base de datos. Si la cuenta utiliza cuota gratuita de desarrollo, el importe facturado por el proveedor puede ser menor o nulo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
