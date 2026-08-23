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

/**
 * Cliente HTTP único del panel.
 *
 * Acepta `token` y nada más: **ya no existe forma de mandar un secreto compartido
 * desde el navegador**. La soportaba para el simulador (que pegaba contra
 * `/messaging/webhook`) y para `/knowledge/*`; las dos superficies pasaron a JWT,
 * así que se quitó a propósito en vez de dejarla sin usar — dejar la cañería
 * puesta invita a volver a enchufar el `N8N_WEBHOOK_SECRET` de producción acá.
 */
async function request(path, { method = 'GET', token, body } = {}) {
  const isFormData = body instanceof FormData;
  const headers = {};

  // Con FormData el Content-Type NO se pone: lo arma el browser junto con el
  // `boundary`, que es lo que el server necesita para separar las partes.
  // Forzar application/json —como hacía antes— volvía imposible la subida.
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

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

export function resolveEscalation(token, id, { message, teachAgent, title, category, audience, agentType, correctKnowledge }) {
  const body = { message, teachAgent };
  if (teachAgent) {
    body.title = title;
    body.category = category;
    if (audience) body.audience = audience;
    if (agentType) body.agentType = agentType;
  }
  // Spec 007: corregir un documento existente en vez de crear uno nuevo.
  // Excluyente con teachAgent — el backend rechaza pedir las dos cosas.
  if (correctKnowledge) body.correctKnowledge = correctKnowledge;
  return request(`/supervisor/escalations/${id}/resolve`, {
    method: 'POST',
    token,
    body,
  });
}

/**
 * Spec 007 — qué documentos se consultaron en este caso y NO alcanzaron.
 *
 * Lista vacía es una respuesta normal: el caso escaló sin recuperar nada, así
 * que no hay nada que corregir y corresponde crear un documento nuevo.
 *
 * OJO: cada candidato trae `corregible`. Los de otras áreas vienen igual en la
 * lista —ver lo ajeno es lo que evita duplicarlo— pero con `corregible: false`
 * y el motivo en `motivoSiNo`. No filtrarlos: mostrarlos deshabilitados con el
 * motivo es justamente el punto.
 */
export function getKnowledgeCandidates(token, escalationId) {
  return request(`/supervisor/escalations/${escalationId}/knowledge-candidates`, { token });
}

/**
 * Spec 007 — cómo quedaría el documento si se le incorpora la respuesta.
 *
 * NO guarda nada: la aprobación es el `correctKnowledge` de resolveEscalation.
 * Devuelve { baseVersion, proposedContent, summary, changedSections, confident }.
 * Con `confident: false` no hay propuesta que aprobar: devuelve el contenido
 * original y conviene crear un documento nuevo.
 */
export function previewCorrection(token, escalationId, { documentId, message }) {
  return request(`/supervisor/escalations/${escalationId}/correction-preview`, {
    method: 'POST',
    token,
    body: { documentId, message },
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

// --- Áreas de las que alguien es responsable (spec 005) ---

/**
 * Detalle de un empleado, **con sus `areasSupervisadas`**.
 *
 * Es de acá —y no de `getMe()` ni del token— de donde el panel saca de qué áreas
 * es responsable quien está logueado. Las áreas **no viajan en la sesión** a
 * propósito: si viajaran, un guard del backend podría terminar ramificando por
 * ellas. Pedirlas al servidor no rompe esa garantía; guardarlas en el token sí.
 */
export function getEmployee(token, id) {
  return request(`/employees/${id}`, { token });
}

/** Las áreas que existen. Alimenta la selección múltiple de la pantalla de empleados. */
export function listSectors(token) {
  return request('/employees/sectors', { token });
}

/**
 * Define de qué áreas es responsable una persona (US3).
 *
 * La lista **reemplaza** a la anterior, así que sirve igual para asignar y para
 * quitar: mandar `[]` la deja sin ninguna. No existe ningún campo "gerente" —
 * se es gerente al tener todas, y mandarlo da 400.
 *
 * 409 si la persona no es SUPERVISOR; 404 si algún sector no existe.
 */
export function setSupervisedAreas(token, employeeId, sectorIds) {
  return request(`/employees/${employeeId}/supervised-areas`, {
    method: 'PUT',
    token,
    body: { sectorIds },
  });
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

// --- Higiene del corpus (spec 008): documentos que compiten entre sí ---

/**
 * Lanza un barrido de detección. Encola y responde en milisegundos —la
 * detección corre en un worker, no acá—; **409** si ya hay uno corriendo.
 */
export function startHygieneScan(token) {
  return request('/knowledge/hygiene/scan', { method: 'POST', token });
}

/**
 * El resultado de la última corrida. `status: "NEVER_RUN"` no es un error:
 * es el estado normal antes del primer barrido. `RUNNING`/`FAILED` vienen con
 * las parejas de la última corrida `READY` anterior, si hubo alguna.
 */
export function getLatestHygieneScan(token) {
  return request('/knowledge/hygiene/scan/latest', { token });
}

/** "Son distintos a propósito". Vuelve a proponerse si alguno de los dos cambia. */
export function discardHygienePair(token, pairId, reason) {
  return request(`/knowledge/hygiene/pairs/${pairId}/discard`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

/**
 * Propuesta de fusión. **No persiste nada.** `confident: false` cuando los
 * dos documentos se contradicen o el absorbido no aporta nada nuevo — viene
 * con el contenido del que sobrevive sin tocar.
 */
export function previewMerge(token, pairId, keepDocumentId) {
  return request(`/knowledge/hygiene/pairs/${pairId}/merge-preview`, {
    method: 'POST',
    token,
    body: { keepDocumentId },
  });
}

/**
 * Aplica la fusión aprobada. Se manda el `content` final —editable tras el
 * preview— y el `baseVersion`: si el documento cambió mientras tanto, 409.
 */
export function applyMerge(token, pairId, { keepDocumentId, baseVersion, content }) {
  return request(`/knowledge/hygiene/pairs/${pairId}/merge-apply`, {
    method: 'POST',
    token,
    body: { keepDocumentId, baseVersion, content },
  });
}

/**
 * Si los documentos consultados en ESTE caso escalado compiten entre sí
 * (US3). `pairs: []` es la respuesta normal — no hay nada que avisar, o
 * todavía no se corrió ningún barrido.
 */
export function getEscalationHygieneWarning(token, escalationId) {
  return request(`/supervisor/escalations/${escalationId}/hygiene-warning`, { token });
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

/** Termina la conversación con el asistente. 409 si un responsable la atiende. */
export function closeWebConversation(token, convId) {
  return request(`/messaging/web/${convId}/close`, { method: 'POST', token });
}

/**
 * Deriva la consulta propia a otra persona (spec 005, US4).
 *
 * Es la contracara del aviso de baja confianza: a un responsable no se le crea
 * ningún caso, así que cuando el tema no es de sus áreas necesita poder pasarlo.
 * El caso se crea recién acá.
 *
 * El texto de la consulta **no se manda**: el backend lo saca de la conversación,
 * para que el caso no pueda llegarle a otro con una pregunta distinta de la que
 * se hizo. 409 si se intenta derivar a uno mismo o a alguien que no es supervisor
 * activo; 403 sobre una conversación ajena.
 */
export function delegateFromChat(token, convId, toEmployeeId) {
  return request(`/messaging/web/${convId}/delegate`, {
    method: 'POST',
    token,
    body: { toEmployeeId },
  });
}

/**
 * Simula un mensaje entrante desde cualquier teléfono (spec 004, US3).
 *
 * Reemplaza el uso de `sendWebhookMessage` desde el simulador: aquel exigía el
 * `x-n8n-secret`, que es el MISMO secreto que protege el canal real de WhatsApp
 * en producción, y había que pegarlo a mano en un input. Acá alcanza con la
 * sesión (rol SUPERVISOR) y ninguna credencial de producción pasa por el
 * navegador. Devuelve `{ queued, conversationId }`.
 */
export function simulateMessage(token, { phone, message }) {
  return request('/messaging/simulate', {
    method: 'POST',
    token,
    body: { phone, message },
  });
}

/**
 * Abre un stream de eventos de una conversación (spec 004).
 *
 * **Con `fetch`, no con `EventSource`**, y no es una preferencia de estilo:
 * `EventSource` no admite headers, así que obligaría a mandar el JWT en la query
 * string, donde termina escrito en los logs de acceso de cualquier intermediario.
 *
 * Es `async` a propósito: espera a los headers de la respuesta, así que un `401`
 * o un `403` se lanzan como `ApiError` **antes** de que el stream arranque, y el
 * llamador puede distinguirlos con un `try/catch` normal. Resuelve con
 * `{ close }` para poder abortarlo en el cleanup del `useEffect`.
 *
 * Los callbacks reciben la carga útil ya desanidada: el evento viaja como
 * `{ type, conversationId, data }` y lo que llega a `onMessage`/`onStatus` es el
 * `data`.
 */
export async function openConversationStream(
  token,
  path,
  { after, onMessage, onStatus, onError, onClose } = {},
) {
  const controller = new AbortController();
  const qs = after ? `?after=${encodeURIComponent(after)}` : '';

  const res = await fetch(`${API_BASE}${path}${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal: controller.signal,
  });

  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : null;
    const msg = data?.message || res.statusText || `Error ${res.status}`;
    throw new ApiError(Array.isArray(msg) ? msg.join(', ') : msg, {
      status: res.status,
      body: data,
    });
  }

  // Se marca acá y se informa al cerrar: es el ÚNICO motivo de cierre que el
  // servidor comunica explícitamente. Los otros tres (inactividad, sesión
  // vencida, permiso perdido) terminan el stream de la misma forma y solo se
  // distinguen por lo que pasa al intentar reabrirlo — ver la tabla en
  // specs/004-chat-tiempo-real/contracts/messaging-web-stream.md.
  let conversacionTerminada = false;

  let evento = null;
  let datos = [];

  function despachar() {
    // Sin `data` no hay nada que despachar: es el keepalive, que solo existe
    // para que ningún intermediario corte la conexión por inactividad.
    if (datos.length === 0) {
      evento = null;
      return;
    }
    let payload;
    try {
      payload = JSON.parse(datos.join('\n'));
    } catch {
      datos = [];
      evento = null;
      return;
    }
    datos = [];
    const tipo = evento ?? payload?.type;
    evento = null;

    if (tipo === 'message') onMessage?.(payload.data);
    else if (tipo === 'status') {
      if (payload.data?.status === 'CLOSED') conversacionTerminada = true;
      onStatus?.(payload.data);
    }
  }

  async function consumir() {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let corte;
        while ((corte = buffer.indexOf('\n')) !== -1) {
          const linea = buffer.slice(0, corte).replace(/\r$/, '');
          buffer = buffer.slice(corte + 1);

          if (linea === '') {
            despachar();
          } else if (!linea.startsWith(':')) {
            const i = linea.indexOf(':');
            const campo = i === -1 ? linea : linea.slice(0, i);
            const valor = i === -1 ? '' : linea.slice(i + 1).replace(/^ /, '');
            if (campo === 'event') evento = valor;
            else if (campo === 'data') datos.push(valor);
            // `id:` se ignora a propósito: lo pone NestJS con un contador
            // propio y NO es el id del mensaje. El cursor de la reanudación
            // sale de `data.id`.
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    } finally {
      onClose?.({
        conversacionTerminada,
        abortado: controller.signal.aborted,
      });
    }
  }

  void consumir();

  return { close: () => controller.abort() };
}

/**
 * Vista unificada: los mensajes de WhatsApp y web de un mismo contacto en una
 * línea de tiempo. Cada entrada trae su `channel` y `conversationId`.
 */
export function getContactTimeline(token, externalId) {
  return request(`/supervisor/conversations/by-contact/${externalId}/timeline`, { token });
}
