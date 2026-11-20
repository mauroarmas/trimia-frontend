// *****************************************************************************
// Comandos personalizados de Cypress para TrimIA (TAS26 — Sección 5.10 Diseño)
// Centralizan la autenticación por UI/API y la navegación entre módulos para
// mantener los scripts limpios, legibles y fáciles de mantener.
// *****************************************************************************

/**
 * Inicia sesión desde el formulario real de la interfaz web (`Login.jsx`).
 * Configura `prefers-reduced-motion: reduce` para evitar la espera de 1.8 s
 * de la animación de bienvenida durante las pruebas automatizadas.
 *
 * @param {string} email - Correo electrónico del perfil de prueba.
 * @param {string} [password='trimia2026'] - Contraseña del usuario.
 */
Cypress.Commands.add('loginUI', (email, password = 'trimia2026') => {
  cy.visit('/', {
    onBeforeLoad(win) {
      // Acelera el ingreso desactivando la pausa de animación de entrada en Login.jsx
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
 * Obtiene un token JWT directamente contra la API del backend NestJS (`POST /auth/login`).
 * Útil para pruebas de integración/API con `cy.request()` y para preparar precondiciones.
 *
 * @param {string} email - Correo electrónico del perfil de prueba.
 * @param {string} [password='trimia2026'] - Contraseña del usuario.
 */
Cypress.Commands.add('loginAPI', (email, password = 'trimia2026') => {
  const apiUrl = Cypress.env('apiUrl') || 'http://localhost:3000';
  return cy
    .request({
      method: 'POST',
      url: `${apiUrl}/auth/login`,
      body: { email, password },
      failOnStatusCode: false,
    })
    .then((response) => response);
});

/**
 * Navega a una pestaña del menú lateral (`aside.app-sidebar`) verificando que
 * la opción exista para el rol actual y quede activa.
 *
 * @param {string} labelPestana - Texto visible del botón en el menú lateral.
 */
Cypress.Commands.add('navegarMenu', (labelPestana) => {
  cy.get('aside.app-sidebar .sidebar-nav')
    .contains('button.sidebar-nav-item', labelPestana)
    .should('be.visible')
    .click()
    .should('have.class', 'active');
});
