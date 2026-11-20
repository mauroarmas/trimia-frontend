/**
 * ============================================================================
 * SUITE 06: PRUEBAS DE API, SEGURIDAD DE ENDPOINTS Y RENDIMIENTO (BACKEND NESTJS)
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Requisitos no funcionales y de integración transversales (RNF-01, RNF-02, RNF-04, RI-01, RI-02)
 *   - Estrategia de Automatización TAS26 (Sección 5.10 — Capa Integración / API de la Pirámide)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RNF-01 (Tiempo de respuesta: consultas frecuentes < 30 segundos)
 *   - RNF-02 (Control de acceso y confidencialidad a nivel de API REST con Guards JWT y Roles)
 *   - RNF-04 (Arquitectura desacoplada y disponibilidad del backend)
 *   - RI-01  (Integración con adaptador de Paljet — consulta de stock)
 *   - RI-02  (Integración con adaptador de Riesgo Online — verificación crediticia)
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RNF01-02 (Medir tiempo de respuesta de endpoints de salud, stock y crédito < 30 s)
 *   - TC-TRIMIA-RNF02-02 (API: Rechazar peticiones a endpoints protegidos sin token JWT con HTTP 401)
 *   - TC-TRIMIA-RNF02-08 y RNF02-09 (API: Rechazar con HTTP 403 acceso de Cobrador común a endpoints de Controladora/Supervisor)
 *   - TC-TRIMIA-RI01-03  (API: Bloquear consulta de stock `/sales/stock` a usuarios de sectores no autorizados)
 *   - TC-TRIMIA-RNF04-02 (API: Verificar que los adaptadores de Paljet y Riesgo Online operan en modo consulta/solo lectura)
 * ============================================================================
 */

describe('Módulo 06 — Pruebas de Integración, Seguridad y Rendimiento sobre la API REST (Backend NestJS)', () => {
  let datos;
  const apiUrl = Cypress.env('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF04-01 / Healthcheck de Disponibilidad
   * Requisito:      RNF-04, RNF-01
   * Técnica:        Prueba de humo de API (`GET /health`)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verificación instantánea de que el backend y la base de datos responden.
   *
   * En qué consiste y detalle:
   *   Realiza una petición directa `GET /health` al backend NestJS mediante `cy.request()`
   *   y verifica que responda con código HTTP 200 y un tiempo de respuesta inferior a 5 segundos.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF04-01 (Smoke API): El endpoint GET /health del backend debe responder HTTP 200 OK', () => {
    cy.request({
      method: 'GET',
      url: `${apiUrl}/health`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.duration).to.be.lessThan(5000);
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-02 (Nivel API)
   * Requisito:      RNF-02 (Control de acceso y autenticación JWT en todos los módulos)
   * Técnica:        Partición de equivalencia (Peticiones HTTP sin cabecera Authorization)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Garantiza que ningún endpoint interno quede expuesto públicamente.
   *
   * En qué consiste y detalle:
   *   Verifica que al invocar los endpoints críticos del backend (`/auth/me`, `/employees`,
   *   `/knowledge`, `/collections/kpis`, `/sales/stock`, `/supervisor/escalations`) sin enviar
   *   un token JWT válido, el backend rechace todas las solicitudes con código HTTP 401 (Unauthorized).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-02 (Seguridad API): Debe responder HTTP 401 Unauthorized al invocar endpoints internos sin token JWT', () => {
    const endpointsProtegidos = [
      '/auth/me',
      '/employees',
      '/knowledge',
      '/collections/kpis',
      '/sales/stock',
      '/supervisor/escalations',
    ];

    endpointsProtegidos.forEach((ruta) => {
      cy.request({
        method: 'GET',
        url: `${apiUrl}${ruta}`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, `El endpoint ${ruta} debe exigir JWT`).to.eq(401);
      });
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-08, TC-TRIMIA-RNF02-09 y TC-TRIMIA-RI01-03 (Nivel API)
   * Requisito:      RNF-02, RF-12, RI-01 (Permisos de rol y sector en el backend)
   * Técnica:        Tabla de decisión (Token de Cobrador común contra endpoints de Supervisor / Ventas)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica que la seguridad no sea solo visual (ocultar botones) sino aplicada en el servidor.
   *
   * En qué consiste y detalle:
   *   Obtiene un token JWT válido del Cobrador común (`roberto.sosa@credimision.com`) e intenta:
   *   1) Acceder a la gestión de empleados (`GET /employees`) o Base de Conocimiento (`GET /knowledge`),
   *      exclusivas del rol SUPERVISOR.
   *   2) Modificar la configuración de recordatorios (`PUT /collections/reminder-config`), exclusiva
   *      de Controladora / Supervisor (TC-TRIMIA-RNF02-09).
   *   3) Consultar el stock comercial de Paljet (`GET /sales/stock`), exclusivo de Ventas/Supervisor (TC-TRIMIA-RI01-03).
   *   En todos los casos el servidor debe responder con HTTP 403 (Forbidden).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-08, RNF02-09 y RI01-03 (Autorización API): Debe responder HTTP 403 Forbidden cuando un Cobrador común invoca endpoints de Supervisor, Controladora o Ventas', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.loginAPI(cobrador.email, datos.passwordDefault).then((loginRes) => {
      expect(loginRes.status).to.eq(200);
      const tokenCobrador = loginRes.body.accessToken;
      expect(tokenCobrador).to.be.a('string').and.not.be.empty;

      // 1. Intento de acceso a Base de Conocimiento (solo SUPERVISOR)
      cy.request({
        method: 'GET',
        url: `${apiUrl}/knowledge`,
        headers: { Authorization: `Bearer ${tokenCobrador}` },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
      });

      // 2. Intento de modificar Configuración de Recordatorios como Cobrador común (TC-TRIMIA-RNF02-09)
      cy.request({
        method: 'PUT',
        url: `${apiUrl}/collections/reminder-config`,
        headers: { Authorization: `Bearer ${tokenCobrador}` },
        body: { daysBeforeDue: 5, isActive: true },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
      });

      // 3. Intento de consultar Stock de Paljet desde un usuario del sector Cobranzas (TC-TRIMIA-RI01-03)
      cy.request({
        method: 'GET',
        url: `${apiUrl}/sales/stock`,
        headers: { Authorization: `Bearer ${tokenCobrador}` },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
      });
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF01-02 y TC-TRIMIA-RNF04-02 (Nivel API)
   * Requisito:      RNF-01, RNF-04, RI-01, RI-02, RF-09, RF-10
   * Técnica:        Prueba de rendimiento e integración por API (< 30.000 ms según RNF-01)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Mide con precisión en milisegundos (`response.duration`) el SLA de RNF-01.
   *
   * En qué consiste y detalle:
   *   Autenticado como Vendedora (`laura.gomez@credimision.com`), consulta el catálogo de stock
   *   de Paljet (`GET /sales/stock`) y la verificación crediticia de Riesgo Online
   *   (`POST /sales/credit-check`), comprobando que:
   *   1) Ambas integraciones respondan con HTTP 200/201 en mucho menos del límite de 30 segundos (RNF-01).
   *   2) Devuelvan estructuras JSON válidas en modo solo lectura sin mutar sistemas externos (RNF-04).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF01-02 y RNF04-02 (Rendimiento e Integración API): Las consultas de stock (Paljet) y crédito (Riesgo Online) deben responder en menos de 30 segundos', () => {
    const vendedora = datos.usuarios.vendedora;
    const LIMITE_RNF01_MS = 30000;

    cy.loginAPI(vendedora.email, datos.passwordDefault).then((loginRes) => {
      expect(loginRes.status).to.eq(200);
      const tokenVendedora = loginRes.body.accessToken;

      // 1. Consulta de Stock en Paljet (RI-01 + RNF-01)
      cy.request({
        method: 'GET',
        url: `${apiUrl}/sales/stock`,
        headers: { Authorization: `Bearer ${tokenVendedora}` },
      }).then((stockRes) => {
        expect(stockRes.status).to.eq(200);
        expect(stockRes.duration, 'Tiempo de respuesta de stock < 30s (RNF-01)').to.be.lessThan(LIMITE_RNF01_MS);
        expect(stockRes.body).to.be.an('array');
      });

      // 2. Verificación Crediticia en Riesgo Online (RI-02 + RNF-01)
      cy.request({
        method: 'POST',
        url: `${apiUrl}/sales/credit-check`,
        headers: { Authorization: `Bearer ${tokenVendedora}` },
        body: {
          dni: datos.clientes.clienteNuevo.dniNormal,
          amount: 500000,
        },
      }).then((creditRes) => {
        expect(creditRes.status).to.be.oneOf([200, 201]);
        expect(creditRes.duration, 'Tiempo de respuesta de crédito < 30s (RNF-01)').to.be.lessThan(LIMITE_RNF01_MS);
        expect(creditRes.body).to.have.property('verdict');
      });
    });
  });
});
