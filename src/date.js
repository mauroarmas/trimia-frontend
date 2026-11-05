// Cuotas y comprobantes usan días calendario guardados a medianoche UTC.
export function formatCalendarDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

export function formatProofDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' });
}
