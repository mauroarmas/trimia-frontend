const STATUS_VARIANT = {
  ACTIVE: 'status-active',
  WAITING_HUMAN: 'status-warning',
  HUMAN_HANDLING: 'status-info',
  CLOSED: 'status-idle',
};

export function statusBadgeClass(status) {
  return `badge ${STATUS_VARIANT[status] ?? ''}`;
}
