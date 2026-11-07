import { useEffect, useState } from 'react';
import { getFinancingDraft, completeFinancingDraft } from '../api';

const STAGES = {
  COLLECTING: 'Reuniendo datos',
  AWAITING_CONFIRMATION: 'Esperando confirmación del cliente',
  SUBMITTED: 'Presentada para revisión',
  CANCELLED: 'Cancelada',
  IDENTITY_CONFLICT: 'Identidad a revisar',
};

const STAGE_TONES = {
  COLLECTING: 'is-collecting',
  AWAITING_CONFIRMATION: 'is-awaiting',
  SUBMITTED: 'is-submitted',
  CANCELLED: 'is-cancelled',
  IDENTITY_CONFLICT: 'is-conflict',
};

const FIELDS = {
  business: 'comercio',
  locality: 'localidad',
  name: 'nombre',
  dni: 'DNI',
  product: 'producto',
  confirmedAmount: 'importe confirmado',
  customerConfirmation: 'confirmación del cliente',
};

function formatCurrency(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return 'Sin confirmar';
  }
  return Number(value).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
  });
}

export default function FinancingDraftEditor({ token, me, conversation, onOpenFinancing }) {
  const [draft, setDraft] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const allowed =
    (me?.role === 'SUPERVISOR' && (me?.sectorName ?? me?.sector?.name) === 'Ventas') ||
    me?.isGeneralSupervisor ||
    ['Administración', 'Admin'].includes(me?.sectorName ?? me?.sector?.name);

  const convId = conversation?.id;
  const channel = conversation?.channel;

  useEffect(() => {
    let mounted = true;
    setDraft(null);
    setError('');
    setSavedNotice('');

    if (allowed && convId && ['WHATSAPP', 'WEB'].includes(channel)) {
      getFinancingDraft(token, convId)
        .then((d) => {
          if (mounted) {
            setDraft(d);
            setAmount(d.confirmedAmount ?? '');
          }
        })
        .catch((e) => {
          if (mounted && e.status !== 404) {
            setError(e.message);
          }
        });
    }

    return () => {
      mounted = false;
    };
  }, [token, convId, channel, allowed]);

  if (!allowed || (!draft && !error)) return null;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSavedNotice('');
    try {
      const next = await completeFinancingDraft(token, convId, {
        expectedVersion: draft.version,
        confirmedAmount: Number(amount).toFixed(2),
        note,
      });
      setDraft(next);
      setNote('');
      setSavedNotice('Importe guardado correctamente.');
    } catch (e) {
      setError(
        e.status === 409
          ? 'Los datos cambiaron. Volvé a revisarlos antes de confirmar.'
          : e.message,
      );
      if (e.status === 409) {
        setDraft(await getFinancingDraft(token, convId));
      }
    } finally {
      setBusy(false);
    }
  }

  const missingList = draft
    ? (draft.missingFields ?? []).map((f) => FIELDS[f] ?? f).join(', ')
    : '';

  const missingLabel = draft
    ? missingList ||
      (draft.stage === 'SUBMITTED'
        ? 'ningún dato (solicitud ya presentada)'
        : draft.stage === 'CANCELLED'
          ? 'sin acciones pendientes'
          : 'confirmación del cliente')
    : '';

  const canEditAmount =
    draft &&
    me?.role === 'SUPERVISOR' &&
    !['SUBMITTED', 'CANCELLED'].includes(draft.stage);

  const request = draft?.request;
  const requestLabel = request?.financing ? 'Plan de cuotas registrado' : request?.closedAt ? 'Venta cerrada' : ({ APPROVED: 'Financiación aprobada', PENDING_REVIEW: 'Pendiente de revisión', REJECTED: 'Solicitud rechazada', CANCELLED: 'Solicitud cancelada' }[request?.status]);
  const canReview = me?.isGeneralSupervisor || ['Administración', 'Admin'].includes(me?.sectorName ?? me?.sector?.name);

  return (
    <section className="fin-draft-card">
      <header className="fin-draft-head">
        <div className="fin-draft-title-group">
          <span className="fin-draft-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </span>
          <div>
            <h4>{request?.financing ? 'Financiación registrada' : request?.closedAt ? 'Venta financiada registrada' : request?.status === 'APPROVED' ? 'Financiación aprobada' : draft?.stage === 'SUBMITTED' ? 'Solicitud de financiación presentada' : 'Solicitud de financiación en preparación'}</h4>
            <p>Datos recopilados durante la conversación con el cliente</p>
          </div>
        </div>

        {draft && (
          <span className={`fin-stage-pill ${STAGE_TONES[draft.stage] ?? ''}`}>
            {requestLabel ?? STAGES[draft.stage] ?? draft.stage}
          </span>
        )}
      </header>

      {error && (
        <p role="alert" className="error fin-draft-alert">
          {error}
        </p>
      )}

      {savedNotice && (
        <p role="status" className="fin-draft-saved">
          {savedNotice}
        </p>
      )}

      {draft && (
        <>
          <div className="fin-draft-summary-grid">
            <div className="fin-draft-datum">
              <span>Cliente</span>
              <strong className={!draft.name ? 'is-pending' : ''}>
                {draft.name || 'Pendiente'}
              </strong>
            </div>
            <div className="fin-draft-datum">
              <span>DNI</span>
              <strong className={!draft.dni ? 'is-pending' : ''}>
                {draft.dni || 'Pendiente'}
              </strong>
            </div>
            <div className="fin-draft-datum">
              <span>Producto</span>
              <strong className={!draft.productSummary ? 'is-pending' : ''}>
                {draft.productSummary || 'Pendiente'}
              </strong>
            </div>
            <div className="fin-draft-datum">
              <span>Importe confirmado</span>
              <strong className={!draft.confirmedAmount ? 'is-pending' : 'is-amount'}>
                {formatCurrency(draft.confirmedAmount)}
              </strong>
            </div>
          </div>

          <div className="fin-draft-status-note">
            <span>
              <strong>{request ? 'Estado:' : 'Falta completar:'}</strong> {requestLabel ?? missingLabel}.
            </span>
            {conversation.status !== 'ACTIVE' && !['SUBMITTED', 'CANCELLED'].includes(draft.stage) && (
              <span className="fin-draft-paused-warn">
                El asistente está pausado: liberá el control manual cuando quieras que el cliente confirme su resumen.
              </span>
            )}
          </div>

          {canEditAmount && (
            <form className="fin-draft-form" onSubmit={save}>
              <div className="fin-draft-fields">
                <div className="fin-draft-field is-amount-col">
                  <label htmlFor={`fin-amount-${convId}`}>
                    Importe confirmado (ARS)
                  </label>
                  <input
                    id={`fin-amount-${convId}`}
                    aria-label="Importe confirmado (ARS)"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Ej. 250000.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="fin-draft-field is-note-col">
                  <label htmlFor={`fin-note-${convId}`}>
                    Confirmación del responsable
                  </label>
                  <textarea
                    id={`fin-note-${convId}`}
                    aria-label="Confirmación del responsable"
                    rows={1}
                    placeholder="Ej. Precio de lista verificado en catálogo vigente"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    required
                  />
                </div>
              </div>

              <div className="fin-draft-foot">
                <p className="fin-draft-disclaimer">
                  Confirmar el importe no presenta ni aprueba el pedido: el cliente deberá aceptar el resumen actualizado en su próximo mensaje.
                </p>
                <button
                  type="submit"
                  disabled={busy || !note.trim() || !(Number(amount) > 0)}
                >
                  {busy ? 'Guardando…' : 'Confirmar importe'}
                </button>
              </div>
            </form>
          )}

          {!canEditAmount && <>
            <p className="fin-draft-disclaimer">
              {request?.commercialFlow ? 'El pedido continúa en Administración y en la ficha de Cierres de venta. El agente recopila la elección y la confirmación del cliente; el cierre registra las cuotas acordadas.' : request?.financing ? `Plan registrado: ${request.financing.quotaCount} cuotas. Consultá los vencimientos en Financiación o Cobranzas.` : request?.closedAt ? `Cierre registrado el ${new Date(request.closedAt).toLocaleString('es-AR')}. El plan de cuotas se registra por separado.` : request?.status === 'APPROVED' ? 'La financiación está aprobada. Ventas puede registrar el cierre cuando acuerde la compra.' : draft.stage === 'SUBMITTED' ? 'La solicitud ya está presentada; no hace falta volver a confirmar los mismos datos.' : 'El cliente debe confirmar el resumen actualizado para presentar la solicitud.'}
            </p>
            {request && canReview && onOpenFinancing && <button type="button" className="secondary" onClick={() => onOpenFinancing(request.id)}>Ver solicitud de financiación</button>}
          </>}

        </>
      )}
    </section>
  );
}
