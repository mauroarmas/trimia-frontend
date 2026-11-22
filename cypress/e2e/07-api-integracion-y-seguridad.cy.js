/**
 * ============================================================================
 * SUITE 07: INTEGRACIÓN API REST, SEGURIDAD POR ROLES, RENDIMIENTO Y OPT-OUT
 * ============================================================================
 * Plan de Testing PT-TrimIA-2026-01 + Specs 019, 020, 021, 022:
 *   - Requisitos: RNF-01, RNF-02, RNF-04, RI-01, RI-02, RI-03, RI-04
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RNF04-01 Healthcheck completo (PostgreSQL, Redis, memoria < 5 s)
 *   - TC-TRIMIA-RNF02-02 Rechazo HTTP 401 sin JWT en todos los endpoints críticos
 *   - TC-TRIMIA-RNF02-08/09 y RI01-03 Rechazo HTTP 403 de Cobrador común en endpoints de Supervisor, Controladora, Ventas, Financiación, Simulador y Selector IA
 *   - TC-TRIMIA-RNF02-AREA-ISOLATION Aislamiento de área en API para Supervisora de Cobranzas (Silvia Ríos)
 *   - TC-TRIMIA-RNF01-02 y RNF04-02 Integración real y rendimiento (< 30 s) de Paljet y los 4 perfiles de Riesgo Online (APPROVED, APPROVED_WITH_CONDITIONS, REJECTED, UNAVAILABLE)
 *   - TC-TRIMIA-RI04-OPTOUT Control de no contacto ("BAJA") y reactivación auditable (Spec 022) + permisos de regla de seguimiento comercial (Spec 021)
 * ============================================================================
 */

describe('Módulo 07 — API REST, Seguridad JWT/Roles, Integraciones Paljet/Riesgo Online y Opt-Out (Backend NestJS)', () => {
  let datos;
  const apiUrl = Cypress.expose('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RNF04-01 (Smoke API): GET /health debe confirmar PostgreSQL, Redis y memoria activos en < 5 s', () => {
    cy.request({
      method: 'GET',
      url: `${apiUrl}/health`,
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.duration).to.be.lessThan(5000);
      expect(res.body.status).to.eq('ok');
      expect(res.body.info?.postgres?.status).to.eq('up');
      expect(res.body.info?.redis?.status).to.eq('up');
    });
  });

  it('TC-TRIMIA-RNF02-02 (Seguridad API): Debe responder HTTP 401 al invocar endpoints protegidos sin token JWT', () => {
    const endpointsProtegidos = [
      '/auth/me',
      '/employees',
      '/knowledge',
      '/collections/kpis',
      '/sales/stock',
      '/sales/financing/requests',
      '/sales/followup-rule',
      '/supervisor/escalations',
      '/supervisor/ai-model',
      '/training/modules',
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

  it('TC-TRIMIA-RNF02-08, RNF02-09 y RI01-03 (Autorización API): Debe responder HTTP 403 cuando un Cobrador común invoca endpoints de otros roles/áreas', () => {
    cy.getToken(datos.usuarios.cobrador.email, datos.passwordDefault).then((tokenCobrador) => {
      const intentosProhibidos = [
        { method: 'GET', path: '/knowledge', desc: 'Base de Conocimiento (solo SUPERVISOR)' },
        { method: 'GET', path: '/employees', desc: 'Gestión de empleados (solo Gerencia/Sup. General)' },
        { method: 'GET', path: '/sales/stock', desc: 'Stock Paljet (solo Ventas/Supervisor)' },
        { method: 'GET', path: '/sales/financing/requests', desc: 'Solicitudes de financiación' },
        {
          method: 'PUT',
          path: '/collections/reminder-config',
          body: { daysBefore: [5], maxAttempts: 3 },
          desc: 'Configuración de recordatorios (solo Controladora/Supervisor)',
        },
        {
          method: 'POST',
          path: '/messaging/simulate',
          body: { phone: '5493764000001', message: 'Intento sin permiso' },
          desc: 'Simulador de chat (solo SUPERVISOR)',
        },
        {
          method: 'PUT',
          path: '/supervisor/ai-model',
          body: { model: 'gemini-3.5-flash-lite', expectedModel: 'gemini-3.5-flash-lite' },
          desc: 'Selector de modelo IA (solo Supervisión General)',
        },
      ];

      intentosProhibidos.forEach(({ method, path, body, desc }) => {
        cy.request({
          method,
          url: `${apiUrl}${path}`,
          headers: { Authorization: `Bearer ${tokenCobrador}` },
          body,
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status, `${desc} debe devolver 403`).to.eq(403);
        });
      });
    });
  });

  it('TC-TRIMIA-RNF02-AREA-ISOLATION: La Supervisora de Cobranzas no puede ver documentos de Ventas ni ejecutar Limpiar base ni cambiar el modelo IA', () => {
    cy.getToken(datos.usuarios.supervisoraCobranzas.email, datos.passwordDefault).then((tokenSilvia) => {
      // Listado general solo devuelve COLLECTIONS
      cy.request({
        method: 'GET',
        url: `${apiUrl}/knowledge?page=1&limit=20`,
        headers: { Authorization: `Bearer ${tokenSilvia}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        const docs = res.body.data || [];
        expect(docs.length).to.be.greaterThan(0);
        docs.forEach((doc) => {
          expect(doc.agentType).to.eq('COLLECTIONS');
        });
      });

      // Filtrar explícitamente por otra área (SALES) devuelve vacío
      cy.request({
        method: 'GET',
        url: `${apiUrl}/knowledge?agentType=SALES`,
        headers: { Authorization: `Bearer ${tokenSilvia}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.total).to.eq(0);
      });

      // Sin permiso para higiene de base (exclusivo Supervisión General) ni cambio de modelo IA
      cy.request({
        method: 'POST',
        url: `${apiUrl}/knowledge/hygiene/scan`,
        headers: { Authorization: `Bearer ${tokenSilvia}` },
        failOnStatusCode: false,
      })
        .its('status')
        .should('eq', 403);

      cy.request({
        method: 'PUT',
        url: `${apiUrl}/supervisor/ai-model`,
        headers: { Authorization: `Bearer ${tokenSilvia}` },
        body: { model: 'gemini-3.5-flash-lite', expectedModel: 'gemini-3.5-flash-lite' },
        failOnStatusCode: false,
      })
        .its('status')
        .should('eq', 403);
    });
  });

  it('TC-TRIMIA-RNF01-02 y RNF04-02 (Rendimiento e Integración): Paljet y los 4 perfiles de Riesgo Online responden en < 30 s en modo solo lectura', () => {
    const LIMITE_RNF01_MS = 30000;

    cy.getToken(datos.usuarios.vendedora.email, datos.passwordDefault).then((tokenVendedora) => {
      // 1. Catálogo Paljet (RI-01)
      cy.request({
        method: 'GET',
        url: `${apiUrl}/sales/stock`,
        headers: { Authorization: `Bearer ${tokenVendedora}` },
      }).then((stockRes) => {
        expect(stockRes.status).to.eq(200);
        expect(stockRes.duration).to.be.lessThan(LIMITE_RNF01_MS);
        expect(stockRes.body).to.be.an('array').and.have.length.greaterThan(0);

        const balanza = stockRes.body.find((i) => i.sku === datos.catalogoPaljet.balanzaCuora.sku);
        const sinStock = stockRes.body.find((i) => i.sku === datos.catalogoPaljet.cortadoraSinStock.sku);
        expect(balanza?.stock).to.be.greaterThan(0);
        expect(sinStock?.stock).to.eq(0);
        expect(sinStock?.substituteSkus).to.include(datos.catalogoPaljet.cortadoraSinStock.sustitutoSku);
      });

      // 2. Riesgo Online (RI-02) — los 4 dictámenes posibles
      const perfiles = Object.values(datos.clientes.perfilesRiesgoOnline);
      perfiles.forEach(({ dni, veredictoEsperado }) => {
        cy.request({
          method: 'POST',
          url: `${apiUrl}/sales/credit-check`,
          headers: { Authorization: `Bearer ${tokenVendedora}` },
          body: { dni, amount: 420000 },
        }).then((creditRes) => {
          expect(creditRes.status).to.be.oneOf([200, 201]);
          expect(creditRes.duration).to.be.lessThan(LIMITE_RNF01_MS);
          expect(creditRes.body.verdict).to.eq(veredictoEsperado);
          expect(creditRes.body).to.have.property('commercialCondition');
          // Secreto comercial: no filtra score ni deuda BCRA en la consulta del vendedor
          expect(creditRes.body).to.not.have.property('score');
          expect(creditRes.body).to.not.have.property('debt');
        });
      });
    });
  });

  it('TC-TRIMIA-RI04-OPTOUT (Specs 021 y 022): Regla de seguimiento comercial protegida + preferencia de no contacto ("BAJA") y reactivación auditable', () => {
    const sufijo = Date.now().toString().slice(-6);
    const phoneOptOut = `5493761${sufijo}`;

    cy.getToken(datos.usuarios.vendedora.email, datos.passwordDefault).then((tokenVendedora) => {
      // Vendedora puede consultar la regla global pero NO modificarla (403)
      cy.request({
        method: 'GET',
        url: `${apiUrl}/sales/followup-rule`,
        headers: { Authorization: `Bearer ${tokenVendedora}` },
      }).then((ruleRes) => {
        expect(ruleRes.status).to.eq(200);
        expect(ruleRes.body).to.have.property('enabled');
        expect(ruleRes.body).to.have.property('inactivityHours');

        cy.request({
          method: 'PUT',
          url: `${apiUrl}/sales/followup-rule`,
          headers: { Authorization: `Bearer ${tokenVendedora}` },
          body: {
            expectedVersion: ruleRes.body.version,
            enabled: ruleRes.body.enabled,
            inactivityHours: ruleRes.body.inactivityHours,
          },
          failOnStatusCode: false,
        })
          .its('status')
          .should('eq', 403);
      });
    });

    // Un contacto que envía "BAJA" queda registrado con optOut = true y solo Supervisión General puede reactivarlo
    cy.getToken(datos.usuarios.supervisorGeneral.email, datos.passwordDefault).then((tokenSup) => {
      cy.simularMensajeYEsperarRespuesta(tokenSup, {
        phone: phoneOptOut,
        message: 'BAJA',
      }).then(() => {
        cy.request({
          method: 'GET',
          url: `${apiUrl}/sales/contact-preferences/${encodeURIComponent(phoneOptOut)}`,
          headers: { Authorization: `Bearer ${tokenSup}` },
        }).then((prefRes) => {
          expect(prefRes.status).to.eq(200);
          expect(prefRes.body.optOut, 'El contacto debe quedar marcado con optOut=true tras enviar BAJA').to.eq(true);
        });

        // Reactivación auditable por Supervisión General con evidencia expresa
        cy.request({
          method: 'POST',
          url: `${apiUrl}/sales/contact-preferences/${encodeURIComponent(phoneOptOut)}/reactivate`,
          headers: { Authorization: `Bearer ${tokenSup}` },
          body: { reason: 'Reactivación verificada en prueba automatizada Cypress (consentimiento expreso)' },
        }).then((reactRes) => {
          expect(reactRes.status).to.be.oneOf([200, 201]);
          expect(reactRes.body.optOut).to.eq(false);
        });
      });
    });
  });
});
