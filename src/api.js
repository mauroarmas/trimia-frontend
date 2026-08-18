const API_BASE = 'http://localhost:3000';

/**
 * Error de API con el cuerpo del backend adjunto.
 *
 * Los endpoints del Sprint 5A no devuelven solo un `message`: mandan datos que
 * la UI necesita para decidir QUÉ ofrecer, no solo qué texto mostrar. Un 413
 * con `reason: "MULTIMODAL_LIMIT"` pide comprimir; uno con `"FILE_LIMIT"` pide
 * partir el archivo. Un 409 de edición trae el `currentVersion` con el que se
 * puede regenerar la propuesta, y uno de subida trae el archivo previo.
 * Aplastando todo a un string se pierde eso.
 */
export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body ?? null;
    this.reason = body?.reason ?? null; // atajo: es lo que más se consulta
  }
}

async function request(path, { method = 'GET', token, secret, body } = {}) {
  const isFormData = body instanceof FormData;
  const headers = {};

  // Con FormData el Content-Type NO se pone: lo arma el browser junto con el
  // `boundary`, que es lo que el server necesita para separar las partes.
  // Forzar application/json —como hacía antes— volvía imposible la subida.
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (secret) headers['x-n8n-secret'] = secret;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const msg = data?.message || res.statusText || `Error ${res.status}`;
    throw new ApiError(Array.isArray(msg) ? msg.join(', ') : msg, {
      status: res.status,
      body: data,
    });
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

// ─────────────────────────────────────────────────────────────────────
// Sprint 5A — Base de Conocimiento, archivos, chat web y los tres cierres
//
// OJO con la autenticación: hasta el Sprint 4 `/knowledge` iba con
// `x-n8n-secret`. Ahora TODO `/knowledge/*` exige JWT + rol SUPERVISOR.
// ─────────────────────────────────────────────────────────────────────

/** Listado del panel. Trae `summary` (240 chars), no el contenido entero. */
export function listKnowledge(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/knowledge${qs ? `?${qs}` : ''}`, { token });
}

/** Detalle: contenido completo + `source` + `usage` + bitácora `changes[]`. */
export function getKnowledgeDoc(token, id) {
  return request(`/knowledge/${id}`, { token });
}

/**
 * Editar. Cambiar `content`, `audience` o `agentType` dispara reindexación
 * (el doc queda `PENDING_REINDEX` un rato); solo título o categoría, no.
 */
export function updateKnowledgeDoc(token, id, fields) {
  return request(`/knowledge/${id}`, { method: 'PUT', token, body: fields });
}

/** Desactivar no borra los vectores: solo los saca de la búsqueda. */
export function setKnowledgeActive(token, id, isActive) {
  return request(`/knowledge/${id}/active`, {
    method: 'PATCH',
    token,
    body: { isActive },
  });
}

export function deleteKnowledgeDoc(token, id) {
  return request(`/knowledge/${id}`, { method: 'DELETE', token });
}

/** Reintenta un documento que quedó en REINDEX_FAILED. Responde 202. */
export function reindexKnowledgeDoc(token, id) {
  return request(`/knowledge/${id}/reindex`, { method: 'POST', token });
}

/**
 * Subida de archivo (multipart). Responde **202**: NO espera a que se extraiga
 * el texto — hay que seguir el avance con `listKnowledgeFiles`.
 *
 * `force` reintenta un archivo que el backend ya vio (409 por checksum).
 */
export function uploadKnowledgeFile(token, { file, title, category, audience, agentType }, force = false) {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  if (title) form.append('title', title);
  if (audience) form.append('audience', audience);
  if (agentType) form.append('agentType', agentType);
  return request(`/knowledge/upload${force ? '?force=true' : ''}`, {
    method: 'POST',
    token,
    body: form,
  });
}

/** "Cargas recientes": se consulta en loop hasta que no queden PROCESSING. */
export function listKnowledgeFiles(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/knowledge/files${qs ? `?${qs}` : ''}`, { token });
}

/**
 * Descarga del original. Devuelve la Response cruda (no JSON), igual que
 * `getPaymentProofImage`. **404 si el origen fue un audio**: el binario se
 * elimina al transcribir.
 */
export function downloadKnowledgeFile(token, id) {
  return fetch(`${API_BASE}/knowledge/files/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Propuesta de edición en lenguaje natural. **No persiste nada**: el documento
 * queda intacto hasta que se llame a `applyAiEdit`.
 *
 * Con `confident: false` viene el contenido ORIGINAL sin tocar y
 * `changedSections: []` — hay que mostrar la advertencia y no ofrecer aplicar.
 */
export function previewAiEdit(token, id, instruction) {
  return request(`/knowledge/${id}/ai-edit/preview`, {
    method: 'POST',
    token,
    body: { instruction },
  });
}

/**
 * Aplica el texto aprobado. Se manda el `content` final —que puede venir
 * editado a mano— y el `baseVersion` del preview: si otro supervisor guardó
 * mientras tanto, responde 409 con `currentVersion`.
 */
export function applyAiEdit(token, id, { baseVersion, content, instruction }) {
  return request(`/knowledge/${id}/ai-edit/apply`, {
    method: 'POST',
    token,
    body: { baseVersion, content, instruction },
  });
}

// --- Los tres cierres de una escalación (US3) ---

/**
 * Propuesta de respuesta con el conocimiento cargado. NO resuelve el caso:
 * sigue PENDING. Con `hasContext: false` viene `suggestion: null` + `reason`.
 *
 * ⭐ Mirar `audienceUsed`: sale del userType de la conversación escalada, no
 * del supervisor que consulta.
 */
export function getEscalationSuggestion(token, id) {
  return request(`/supervisor/escalations/${id}/suggestion`, { token });
}

/**
 * Aprobar y guardar SIN enviar: no le llega nada al usuario, la respuesta se
 * incorpora al RAG y la conversación vuelve al asistente. `title` y `category`
 * son obligatorios acá (la ingesta es la acción entera, no un opcional).
 */
export function saveEscalationUnsent(token, id, { message, title, category, agentType }) {
  const body = { message, title, category };
  if (agentType) body.agentType = agentType;
  return request(`/supervisor/escalations/${id}/save-unsent`, {
    method: 'POST',
    token,
    body,
  });
}

/** Descartar: sin mensaje y sin ingesta. El `reason` deja el rastro auditable. */
export function discardEscalation(token, id, reason) {
  return request(`/supervisor/escalations/${id}/discard`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

// --- Chat web (US4) ---

/**
 * Mensaje al asistente desde el panel. Solo exige JWT (cualquier empleado, no
 * solo SUPERVISOR). El teléfono NO viaja: sale del token.
 *
 * Responde 202 y encola. 409 si el empleado no tiene teléfono cargado.
 */
export function sendWebMessage(token, message) {
  return request('/messaging/web', { method: 'POST', token, body: { message } });
}

/** Historial propio, cronológico ascendente. 403 sobre una conversación ajena. */
export function getWebMessages(token, convId, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/messaging/web/${convId}/messages${qs ? `?${qs}` : ''}`, { token });
}

/**
 * Vista unificada: los mensajes de WhatsApp y web de un mismo contacto en una
 * línea de tiempo. Cada entrada trae su `channel` y `conversationId`.
 */
export function getContactTimeline(token, externalId) {
  return request(`/supervisor/conversations/by-contact/${externalId}/timeline`, { token });
}
