// *****************************************************************************
// Comandos personalizados de Cypress para TrimIA (PT-TrimIA-2026-01)
// Centralizan autenticación UI/API, navegación, interacción con agentes IA
// reales (Simulador / WebChat) y esperas deterministas sobre procesos asíncronos
// (BullMQ, verificación crediticia y escalados).
// *****************************************************************************

const getApiUrl = () => Cypress.expose('apiUrl') || 'http://localhost:3000';

/**
 * Inicia sesión desde el formulario real de la interfaz web (`Login.jsx`).
 * Configura `prefers-reduced-motion: reduce` para omitir la animación de entrada.
 */
Cypress.Commands.add('loginUI', (email, password = 'trimia2026') => {
  cy.clearLocalStorage();
  cy.visit('/', {
    onBeforeLoad(win) {
      win.sessionStorage.clear();
      const origMatchMedia = win.matchMedia?.bind(win);
      win.matchMedia = (query) => {
        if (query.includes('prefers-reduced-motion')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        }
        return origMatchMedia ? origMatchMedia(query) : { matches: false, media: query };
      };
    },
  });

  cy.get('#login-email').should('be.visible').clear().type(email);
  cy.get('#login-password').should('be.visible').clear().type(password, { log: false });
  cy.get('button.login-submit').click();
});

/**
 * Obtiene la respuesta completa de `POST /auth/login`.
 */
Cypress.Commands.add('loginAPI', (email, password = 'trimia2026') => {
  return cy.request({
    method: 'POST',
    url: `${getApiUrl()}/auth/login`,
    body: { email, password },
    failOnStatusCode: false,
  });
});

/**
 * Devuelve directamente el `accessToken` JWT de un perfil válido.
 */
Cypress.Commands.add('getToken', (email, password = 'trimia2026') => {
  return cy.loginAPI(email, password).then((res) => {
    expect(res.status, `Login API exitoso para ${email}`).to.eq(200);
    expect(res.body.accessToken).to.be.a('string').and.have.length.greaterThan(10);
    return res.body.accessToken;
  });
});

/**
 * Navega a una pestaña del menú lateral (`aside.app-sidebar`) verificando que
 * la opción exista para el rol actual y quede activa.
 */
Cypress.Commands.add('navegarMenu', (labelPestana) => {
  cy.get('aside.app-sidebar .sidebar-nav')
    .contains('button.sidebar-nav-item', labelPestana)
    .should('be.visible')
    .click()
    .should('have.class', 'active');
});

/**
 * Cierra el modal de bienvenida inicial de Trimi (`WelcomeOnboardingModal`) si aparece.
 */
Cypress.Commands.add('cerrarModalBienvenidaSiExiste', () => {
  cy.get('body').then(($body) => {
    if ($body.text().includes('Saltar presentación')) {
      cy.contains('button', 'Saltar presentación').click({ force: true });
    }
  });
});

/**
 * Envía un mensaje real por el canal simulado (`POST /messaging/simulate`) que
 * recorre BullMQ → Orquestador LangGraph → Agente Especializado (Gemini + RAG/Tools)
 * y espera de forma determinista hasta que el asistente responda o derive a humano.
 *
 * Devuelve `{ conversationId, conversation, lastReply, durationMs }`.
 */
Cypress.Commands.add(
  'simularMensajeYEsperarRespuesta',
  (tokenSupervisor, { phone, message, previousAssistantCount = null, timeoutMs = 45000 }) => {
    const apiUrl = getApiUrl();
    const startedAt = Date.now();

    const getBaseline = () => {
      if (previousAssistantCount !== null) return cy.wrap(previousAssistantCount, { log: false });
      return cy
        .request({
          method: 'GET',
          url: `${apiUrl}/supervisor/conversations?search=${encodeURIComponent(phone)}&channel=WEB&limit=5`,
          headers: { Authorization: `Bearer ${tokenSupervisor}` },
        })
        .then((res) => {
          const existing = (res.body?.data || []).find(
            (c) => c.externalId === phone && c.status !== 'CLOSED',
          );
          if (!existing) return 0;
          return cy
            .request({
              method: 'GET',
              url: `${apiUrl}/supervisor/conversations/${existing.id}`,
              headers: { Authorization: `Bearer ${tokenSupervisor}` },
            })
            .then((convRes) =>
              (convRes.body?.messages || []).filter((m) => m.role === 'ASSISTANT').length,
            );
        });
    };

    return getBaseline().then((baseAssistantCount) => {
      return cy
        .request({
          method: 'POST',
          url: `${apiUrl}/messaging/simulate`,
          headers: { Authorization: `Bearer ${tokenSupervisor}` },
          body: { phone, message },
        })
        .then((simRes) => {
          expect(simRes.status).to.eq(202);
          const conversationId = simRes.body.conversationId;
          expect(conversationId).to.be.a('string').and.have.length.greaterThan(5);

          const poll = () => {
            return cy
              .request({
                method: 'GET',
                url: `${apiUrl}/supervisor/conversations/${conversationId}`,
                headers: { Authorization: `Bearer ${tokenSupervisor}` },
              })
              .then((convRes) => {
                const conv = convRes.body;
                const messages = conv.messages || [];
                const assistantMsgs = messages.filter((m) => m.role === 'ASSISTANT');
                const gotNewReply = assistantMsgs.length > baseAssistantCount;
                const escalated = conv.status === 'WAITING_HUMAN' && gotNewReply;

                if (gotNewReply || escalated) {
                  return {
                    conversationId,
                    conversation: conv,
                    lastReply: assistantMsgs.at(-1) || null,
                    assistantCount: assistantMsgs.length,
                    durationMs: Date.now() - startedAt,
                  };
                }

                if (Date.now() - startedAt > timeoutMs) {
                  throw new Error(
                    `Timeout (${timeoutMs}ms) esperando respuesta de la IA para ${phone} ("${message}"). Estado: ${conv.status}, msgs=${messages.length}`,
                  );
                }

                return cy.wait(900, { log: false }).then(poll);
              });
          };

          return poll();
        });
    });
  },
);

/**
 * Espera hasta que una solicitud de financiación creada para `phone` tenga su
 * evaluación crediticia en estado `READY` (`evaluationState === 'READY'`).
 */
Cypress.Commands.add(
  'esperarEvaluacionFinanciacion',
  (tokenSupervisor, { phone, timeoutMs = 30000 }) => {
    const apiUrl = getApiUrl();
    const startedAt = Date.now();

    const poll = () => {
      return cy
        .request({
          method: 'GET',
          url: `${apiUrl}/sales/financing/requests`,
          headers: { Authorization: `Bearer ${tokenSupervisor}` },
        })
        .then((res) => {
          const list = Array.isArray(res.body) ? res.body : res.body?.data || [];
          const match = list.find(
            (r) =>
              r.client?.phone === phone ||
              r.inputSnapshot?.phone === phone,
          );
          if (match && match.evaluationState === 'READY') {
            return match;
          }
          if (Date.now() - startedAt > timeoutMs) {
            throw new Error(
              `Timeout esperando solicitud de financiación READY para ${phone}. Encontrado: ${JSON.stringify(match || null)}`,
            );
          }
          return cy.wait(800, { log: false }).then(poll);
        });
    };

    return poll();
  },
);

/**
 * Espera hasta que exista un caso escalado PENDING asociado al teléfono indicado.
 */
Cypress.Commands.add(
  'esperarEscaladoPendiente',
  (tokenSupervisor, { phone, timeoutMs = 25000 }) => {
    const apiUrl = getApiUrl();
    const startedAt = Date.now();

    const poll = () => {
      return cy
        .request({
          method: 'GET',
          url: `${apiUrl}/supervisor/escalations?status=PENDING`,
          headers: { Authorization: `Bearer ${tokenSupervisor}` },
        })
        .then((res) => {
          const list = Array.isArray(res.body) ? res.body : res.body?.data || [];
          const match = list.find((e) => e.conversation?.externalId === phone);
          if (match) return match;
          if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`Timeout esperando escalado PENDING para ${phone}`);
          }
          return cy.wait(800, { log: false }).then(poll);
        });
    };

    return poll();
  },
);
