import { useEffect, useMemo, useState } from 'react';
import { getReminderConfig, updateReminderConfig } from '../api';
import AgentRobotAvatar from './AgentRobotAvatar';
import Trimi from './Trimi';
import './ReminderConfig.css';

const PREDEFINED_DAYS = [30, 15, 10, 7, 5, 3, 2, 1, 0];

const DAY_PRESETS = [
  { id: 'standard', label: 'Estándar', hint: '7·3·0', days: [7, 3, 0] },
  { id: 'early', label: 'Anticipado', hint: '15·7·3·0', days: [15, 7, 3, 0] },
  { id: 'short', label: 'Breve', hint: '3·0', days: [3, 0] },
  { id: 'due-only', label: 'Solo hoy', hint: '0', days: [0] },
];

const ATTEMPT_OPTIONS = [1, 2, 3, 4, 5];

const WHATSAPP_TEMPLATES = [
  {
    value: 'recordatorio_cuota',
    label: 'Recordatorio de cuota (estándar)',
    description: 'Avisos preventivos y vencimiento del día.',
  },
  {
    value: 'recordatorio_cuota_proximo',
    label: 'Recordatorio preventivo de vencimiento',
    description: 'Aviso anticipado con fecha límite y datos de pago.',
  },
  {
    value: 'recordatorio_cuota_hoy',
    label: 'Aviso de vencimiento hoy',
    description: 'Mensaje directo para el mismo día de vencimiento.',
  },
  {
    value: 'recordatorio_cuota_vencida',
    label: 'Aviso de cuota vencida',
    description: 'Seguimiento cordial tras cumplirse la fecha límite.',
  },
];

function sortDaysDesc(list) {
  return [...new Set((list ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 30))].sort((a, b) => b - a);
}

function sameDays(a, b) {
  const left = sortDaysDesc(a);
  const right = sortDaysDesc(b);
  return left.length === right.length && left.every((val, idx) => val === right[idx]);
}

function normalizeSnapshot(raw) {
  return {
    daysBefore: sortDaysDesc(raw?.daysBefore ?? []),
    maxAttempts: Number(raw?.maxAttempts ?? 3),
    templateName: String(raw?.templateName ?? 'recordatorio_cuota').trim(),
    templateApproved: Boolean(raw?.templateApproved),
    updatedAt: raw?.updatedAt ?? null,
  };
}

function formatDayChip(day) {
  if (day === 0) return 'Hoy (0)';
  return `${day}d`;
}

function formatDayAria(day) {
  if (day === 0) return 'Mismo día del vencimiento (0 días antes)';
  if (day === 1) return '1 día antes del vencimiento';
  return `${day} días antes del vencimiento`;
}

function formatScheduleSummary(days) {
  if (!days.length) return 'Seleccioná al menos un día para programar envíos.';
  const parts = days.map((d) => {
    if (d === 0) return 'el mismo día del vencimiento';
    if (d === 1) return '1 día antes';
    return `${d} días antes`;
  });
  if (parts.length === 1) return `Se enviará 1 aviso: ${parts[0]}.`;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(', ');
  return `Se enviarán ${parts.length} avisos: ${rest} y ${last}.`;
}

export default function ReminderConfig({ token }) {
  const [savedConfig, setSavedConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let current = true;
    getReminderConfig(token)
      .then((value) => {
        if (!current) return;
        const normalized = normalizeSnapshot(value);
        setSavedConfig(normalized);
        setDraft(normalized);
      })
      .catch((err) => {
        if (current) setError(err.message);
      });
    return () => {
      current = false;
    };
  }, [token]);

  const isDirty = useMemo(() => {
    if (!draft || !savedConfig) return false;
    return (
      !sameDays(draft.daysBefore, savedConfig.daysBefore) ||
      Number(draft.maxAttempts) !== Number(savedConfig.maxAttempts) ||
      draft.templateName.trim() !== savedConfig.templateName.trim() ||
      Boolean(draft.templateApproved) !== Boolean(savedConfig.templateApproved)
    );
  }, [draft, savedConfig]);

  const dayOptions = useMemo(
    () => sortDaysDesc([...PREDEFINED_DAYS, ...(draft?.daysBefore ?? [])]),
    [draft?.daysBefore],
  );

  const attemptOptions = useMemo(() => {
    const currentAttempts = Number(draft?.maxAttempts);
    if (Number.isInteger(currentAttempts) && currentAttempts >= 1 && !ATTEMPT_OPTIONS.includes(currentAttempts)) {
      return [...ATTEMPT_OPTIONS, currentAttempts].sort((a, b) => a - b);
    }
    return ATTEMPT_OPTIONS;
  }, [draft?.maxAttempts]);

  const activeAttemptIndex = useMemo(() => {
    const idx = attemptOptions.findIndex((n) => n === Number(draft?.maxAttempts));
    return idx >= 0 ? idx : 0;
  }, [attemptOptions, draft?.maxAttempts]);

  const templateOptions = useMemo(() => {
    const currentTemplate = draft?.templateName?.trim();
    if (!currentTemplate || WHATSAPP_TEMPLATES.some((t) => t.value === currentTemplate)) {
      return WHATSAPP_TEMPLATES;
    }
    return [
      ...WHATSAPP_TEMPLATES,
      {
        value: currentTemplate,
        label: `${currentTemplate} (personalizada)`,
        description: 'Plantilla actualmente configurada en el servidor.',
      },
    ];
  }, [draft?.templateName]);

  const activeTemplate = useMemo(
    () => templateOptions.find((t) => t.value === draft?.templateName) ?? templateOptions[0],
    [templateOptions, draft?.templateName],
  );

  function toggleDay(day) {
    setSaved(false);
    setError('');
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.daysBefore.includes(day)) {
        if (prev.daysBefore.length === 1) return prev;
        return { ...prev, daysBefore: prev.daysBefore.filter((d) => d !== day) };
      }
      return { ...prev, daysBefore: sortDaysDesc([...prev.daysBefore, day]) };
    });
  }

  function applyPreset(days) {
    setSaved(false);
    setError('');
    setDraft((prev) => (prev ? { ...prev, daysBefore: sortDaysDesc(days) } : prev));
  }

  async function save(event) {
    event.preventDefault();
    if (!draft || !isDirty) return;
    setSaved(false);
    setError('');
    if (!draft.daysBefore.length) {
      setError('Seleccioná al menos un día antes del vencimiento.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateReminderConfig(token, {
        daysBefore: draft.daysBefore,
        maxAttempts: Number(draft.maxAttempts),
        templateName: draft.templateName.trim(),
        templateApproved: Boolean(draft.templateApproved),
      });
      const normalized = normalizeSnapshot(updated);
      setSavedConfig(normalized);
      setDraft(normalized);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card rc-card">
      {/* Cabecera con Robot animado del Agente de Cobranzas */}
      <div className="rc-header">
        <div className="rc-header-identity">
          <div className={`rc-bot-emblem ${draft && !draft.templateApproved ? 'is-paused' : 'is-active'}`}>
            <AgentRobotAvatar
              agentType="COLLECTIONS"
              size="sm"
              paused={Boolean(draft && !draft.templateApproved)}
              label={draft?.templateApproved ? 'Agente de Cobranzas activo' : 'Agente de Cobranzas en pausa'}
            />
          </div>
          <div>
            <h3>Configurar recordatorios</h3>
            <p className="rc-subtitle">
              Cadencia automática, reintentos y plantilla de WhatsApp para avisos de vencimiento.
            </p>
          </div>
        </div>
        {draft && (
          <span className={`rc-status-pill ${draft.templateApproved ? 'is-active' : 'is-paused'}`}>
            {draft.templateApproved ? 'Envíos activos' : 'Envíos pausados'}
          </span>
        )}
      </div>

      {error && (
        <p className="rc-banner is-error error" role="alert">
          <span className="rc-banner-icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      )}

      {!draft && !error && <p className="rc-subtitle">Cargando configuración…</p>}

      {draft && (
        <form className="rc-form" onSubmit={save}>
          {/* Fila 1: Días antes del vencimiento (sin sub-card anidada) */}
          <div className="rc-row" role="group" aria-labelledby="rc-days-label">
            <div className="rc-row-head">
              <span id="rc-days-label" className="rc-label">
                Días antes del vencimiento
              </span>
              <div className="rc-presets" aria-label="Combinaciones rápidas">
                {DAY_PRESETS.map((preset) => {
                  const isActive = sameDays(draft.daysBefore, preset.days);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`rc-preset ${isActive ? 'is-active' : ''}`}
                      aria-pressed={isActive}
                      title={`${preset.label} (${preset.hint})`}
                      onClick={() => applyPreset(preset.days)}
                    >
                      <span>{preset.label}</span>
                      <small>{preset.hint}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="rc-day-grid"
              id="reminder-days"
              style={{ '--rc-day-cols': dayOptions.length }}
            >
              {dayOptions.map((day) => {
                const isSelected = draft.daysBefore.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`rc-day-chip ${isSelected ? 'is-selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={formatDayAria(day)}
                    onClick={() => toggleDay(day)}
                  >
                    <span className="rc-day-dot" aria-hidden="true" />
                    <span className="rc-day-text">{formatDayChip(day)}</span>
                  </button>
                );
              })}
            </div>

            <div className={`rc-trimi-summary ${saved ? 'is-saved success-msg' : ''}`}>
              <span className="rc-trimi-badge">
                <Trimi
                  variant="avatar"
                  size={28}
                  mood={saved ? 'festeja' : 'piensa'}
                  ariaLabel="Trimi, asistente contextual"
                />
              </span>
              <p className="rc-summary-text">
                {saved ? (
                  <>
                    <strong>Configuración guardada.</strong> {formatScheduleSummary(draft.daysBefore)}
                  </>
                ) : (
                  <>
                    <strong>Cadencia activa:</strong> {formatScheduleSummary(draft.daysBefore)}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Fila 2: Máximo de intentos + Plantilla de WhatsApp */}
          <div className="rc-row rc-two-col">
            <div className="rc-col" role="radiogroup" aria-labelledby="rc-attempts-label">
              <div className="rc-col-head">
                <span id="rc-attempts-label" className="rc-label">
                  Máximo de intentos
                </span>
                <span className="rc-meta-tag">
                  Hasta {draft.maxAttempts} {Number(draft.maxAttempts) === 1 ? 'intento' : 'intentos'}
                </span>
              </div>
              <div
                className="rc-segments"
                id="reminder-attempts"
                style={{
                  '--rc-seg-count': attemptOptions.length,
                  '--rc-seg-index': activeAttemptIndex,
                }}
              >
                <span className="rc-seg-thumb" aria-hidden="true" />
                {attemptOptions.map((count) => {
                  const isSelected = Number(draft.maxAttempts) === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`rc-segment ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSaved(false);
                        setDraft({ ...draft, maxAttempts: count });
                      }}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
              <p className="rc-help">
                Reintentos automáticos por cuota ante fallos transitorios de entrega.
              </p>
            </div>

            <div className="rc-col">
              <div className="rc-col-head">
                <label htmlFor="reminder-template" className="rc-label">
                  Plantilla de WhatsApp
                </label>
                <code className="rc-template-code">{draft.templateName}</code>
              </div>
              <div className="rc-select-wrap">
                <select
                  id="reminder-template"
                  className="rc-select"
                  value={draft.templateName}
                  onChange={(e) => {
                    setSaved(false);
                    setDraft({ ...draft, templateName: e.target.value });
                  }}
                >
                  {templateOptions.map((tpl) => (
                    <option key={tpl.value} value={tpl.value}>
                      {tpl.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="rc-select-chevron"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                </svg>
              </div>
              <p className="rc-help">{activeTemplate?.description}</p>
            </div>
          </div>

          {/* Fila 3: Bloque unificado de aprobación en WhatsApp Business */}
          <div className="rc-row">
            <label className={`rc-approval-row ${draft.templateApproved ? 'is-approved' : 'is-pending'}`}>
              <span className="rc-approval-head">
                <span className="rc-approval-title-group">
                  <span className="rc-label">La plantilla ya está aprobada en WhatsApp</span>
                  <span className={`rc-inline-state ${draft.templateApproved ? 'is-ok' : 'is-warn'}`}>
                    {draft.templateApproved ? 'Habilitada en Meta' : 'Requiere aprobación en Meta'}
                  </span>
                </span>
                <span className="rc-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.templateApproved)}
                    onChange={(e) => {
                      setSaved(false);
                      setDraft({ ...draft, templateApproved: e.target.checked });
                    }}
                  />
                  <span className="rc-switch-track" aria-hidden="true" />
                </span>
              </span>
              <span className="rc-approval-desc">
                {draft.templateApproved
                  ? 'Los envíos automáticos se despacharán según la cadencia definida desde el próximo ciclo.'
                  : 'Los envíos automáticos permanecen bloqueados hasta que actives esta confirmación tras aprobar la plantilla en WhatsApp Business.'}
              </span>
            </label>
          </div>

          {/* Fila 4: Pie con estado honesto (Dirty State) y CTA único */}
          <div className="rc-footer">
            <div className="rc-footer-meta">
              <span className={`rc-dirty-indicator ${isDirty ? 'is-dirty' : 'is-clean'}`}>
                {isDirty ? '● Cambios pendientes por guardar' : '✓ Sin cambios pendientes'}
              </span>
              {draft.updatedAt && (
                <span className="rc-updated">
                  Última actualización: {new Date(draft.updatedAt).toLocaleString('es-AR')} · Próximo ciclo
                </span>
              )}
            </div>
            <button
              type="submit"
              className={`rc-save-btn ${isDirty ? 'primary is-dirty' : 'secondary is-clean'}`}
              disabled={busy || !isDirty}
            >
              {busy ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
