import { defineConfig } from 'cypress';

/**
 * Configuración oficial de Cypress para TrimIA (PT-TrimIA-2026-01).
 *
 * Cubre la pirámide de pruebas de negocio sobre el despliegue real:
 * 1. Pruebas E2E de Sistema sobre el panel web React (`baseUrl`: http://localhost:8080).
 * 2. Pruebas de Integración, Seguridad y Orquestación IA sobre la API REST NestJS
 *    (`expose.apiUrl`: http://localhost:3000).
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 12000,
    requestTimeout: 20000,
    responseTimeout: 45000,
    video: false,
    screenshotOnRunFailure: true,
    expose: {
      apiUrl: 'http://localhost:3000',
    },
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
