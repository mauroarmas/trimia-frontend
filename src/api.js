const API_BASE = 'http://localhost:3000';

async function request(path, { method = 'GET', token, secret, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (secret) headers['x-n8n-secret'] = secret;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const msg = data?.message || res.statusText || `Error ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data;
}

export function login(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}

export function getMe(token) {
  return request('/auth/me', { token });
}

export function getAgentsStatus(token) {
  return request('/supervisor/agents/status', { token });
}

export function getMetrics(token) {
  return request('/supervisor/metrics', { token });
}

export function getConversations(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/supervisor/conversations${qs ? `?${qs}` : ''}`, { token });
}

export function getConversation(token, id) {
  return request(`/supervisor/conversations/${id}`, { token });
}

export function sendWebhookMessage(secret, { phone, message, channel }) {
  return request('/messaging/webhook', {
    method: 'POST',
    secret,
    body: { phone, message, channel },
  });
}

export function checkHealth() {
  return request('/health');
}

export function ingestKnowledge(token, { title, content, category, audience, agentType }) {
  const body = { title, content, category };
  if (audience) body.audience = audience;
  if (agentType) body.agentType = agentType;
  return request('/knowledge', { method: 'POST', token, body });
}

export function searchKnowledge(token, { query, audience, agentType, k }) {
  const body = { query, audience };
  if (agentType) body.agentType = agentType;
  if (k) body.k = k;
  return request('/knowledge/search', { method: 'POST', token, body });
}

// --- Human-in-the-loop (Sprint 3): escalados y control manual ---

export function listEscalations(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/supervisor/escalations${qs ? `?${qs}` : ''}`, { token });
}

export function getEscalation(token, id) {
  return request(`/supervisor/escalations/${id}`, { token });
}

export function resolveEscalation(token, id, { message, teachAgent, title, category, audience, agentType }) {
  const body = { message, teachAgent };
  if (teachAgent) {
    body.title = title;
    body.category = category;
    if (audience) body.audience = audience;
    if (agentType) body.agentType = agentType;
  }
  return request(`/supervisor/escalations/${id}/resolve`, {
    method: 'POST',
    token,
    body,
  });
}

export function delegateEscalation(token, id, toEmployeeId) {
  return request(`/supervisor/escalations/${id}/delegate`, {
    method: 'POST',
    token,
    body: { toEmployeeId },
  });
}

export function takeoverConversation(token, id) {
  return request(`/supervisor/conversations/${id}/takeover`, { method: 'POST', token });
}

export function releaseConversation(token, id) {
  return request(`/supervisor/conversations/${id}/release`, { method: 'POST', token });
}

export function replyManually(token, id, message) {
  return request(`/supervisor/conversations/${id}/reply`, {
    method: 'POST',
    token,
    body: { message },
  });
}

export function addInternalNote(token, id, content) {
  return request(`/supervisor/conversations/${id}/notes`, {
    method: 'POST',
    token,
    body: { content },
  });
}

export function listEmployees(token) {
  return request('/employees', { token });
}

// --- Collections (Sprint 4) ---

export function listPaymentProofs(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/collections/proofs${qs ? `?${qs}` : ''}`, { token });
}

export function getPaymentProofImage(token, id) {
  return fetch(`http://localhost:3000/collections/proofs/${id}/image`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

export function acceptPaymentProof(token, id) {
  return request(`/collections/proofs/${id}/accept`, { method: 'POST', token });
}

export function rejectPaymentProof(token, id, reason) {
  return request(`/collections/proofs/${id}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export function markProofManualHandling(token, id, note) {
  return request(`/collections/proofs/${id}/manual-handling`, {
    method: 'POST',
    token,
    body: { note },
  });
}

export function listAcceptedProofs(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/collections/proofs/accepted${qs ? `?${qs}` : ''}`, { token });
}

export function verifyPaymentImpact(token, id, { impactStatus, observation }) {
  return request(`/collections/proofs/${id}/verify-impact`, {
    method: 'POST',
    token,
    body: { impactStatus, observation },
  });
}

export function getCollectionsKpis(token) {
  return request('/collections/kpis', { token });
}

export function listCollectionClients(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/collections/clients${qs ? `?${qs}` : ''}`, { token });
}

export function getClientHistory(token, clientId) {
  return request(`/collections/clients/${clientId}/history`, { token });
}

export function markQuotaManual(token, quotaId, note) {
  return request(`/collections/quotas/${quotaId}/manual`, {
    method: 'POST',
    token,
    body: { note },
  });
}

/**
 * Empleados del sector Cobranzas: [{ id, name, isController }]. Incluye a los
 * que todavía no tienen ningún cliente, que era el punto ciego de derivar la
 * lista de `clients[].assignedCollector`. Solo pide JWT.
 */
export function listCollectors(token) {
  return request('/collections/collectors', { token });
}

/**
 * Asignar cobrador a un cliente que no tiene uno (FR-001b). El backend
 * responde 403 si quien la ejecuta no es Cobrador Controlador.
 */
export function assignCollector(token, clientId, collectorId) {
  return request(`/collections/clients/${clientId}/assign-collector`, {
    method: 'POST',
    token,
    body: { collectorId },
  });
}

export function requestQuotaProof(token, quotaId) {
  return request(`/collections/quotas/${quotaId}/request-proof`, { method: 'POST', token });
}

export function escalateClient(token, clientId, reason) {
  return request(`/collections/clients/${clientId}/escalate`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export function listActivity(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/collections/activity${qs ? `?${qs}` : ''}`, { token });
}

export function getReminderConfig(token) {
  return request('/collections/reminder-config', { token });
}

export function updateReminderConfig(token, config) {
  return request('/collections/reminder-config', {
    method: 'PUT',
    token,
    body: config,
  });
}

// --- Ventas (Sprint 4 — US6) ---

/**
 * Alta de cliente con su plan de cuotas al cerrar la venta.
 * El backend exige sector "Ventas" (no un rol) y responde 409 si el teléfono
 * ya pertenece a un cliente. Devuelve el Client con sus quotas más
 * `recoveredProofs`: comprobantes que habían llegado antes de que el cliente
 * existiera y recién ahora pudieron imputarse.
 */
export function createSalesClient(token, { name, phone, dni, assignedCollectorId, quotas }) {
  const body = { name, phone, quotas };
  if (dni) body.dni = dni;
  if (assignedCollectorId) body.assignedCollectorId = assignedCollectorId;
  return request('/sales/clients', { method: 'POST', token, body });
}
