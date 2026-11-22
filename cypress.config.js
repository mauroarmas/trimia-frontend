import { defineConfig } from 'cypress';

/**
 * Configuración oficial de Cypress para TrimIA (TAS26 — Unidad 6 y 7).
 *
 * Cubre dos niveles de la pirámide de pruebas (Cohn, 2009):
 * 1. Pruebas E2E de Sistema sobre la interfaz web React + Vite (`baseUrl`: http://localhost:5173).
 * 2. Pruebas de Integración y Seguridad sobre la API REST NestJS (`env.apiUrl`: http://localhost:3000).
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 30000,
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
