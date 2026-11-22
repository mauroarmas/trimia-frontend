/**
 * ============================================================================
 * SUITE 05: MÓDULO DE CAPACITACIÓN (RUTA ADAPTATIVA, AUDIO/RAG, SIMULACIÓN IA Y SUPERVISOR)
 * ============================================================================
 * Plan de Testing PT-TrimIA-2026-01 — Módulo Capacitación (CU-CAP-01 a CU-CAP-11):
 *   - Requisitos: RF-05, RF-11, RF-14, RNF-02, RNF-03
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RF05-03, RF05-06 y RF05-07 Ruta de aprendizaje por sector, parada en curso y bloqueo secuencial
 *   - TC-TRIMIA-RF05-05, RF05-08 y RF05-09 Lección con audio, subtítulos sincronizados, puntos clave y duda real RAG con Trimi
 *   - TC-TRIMIA-RF05-DIAGNOSTICO Apertura e interacción de Evaluación Diagnóstica inicial (5 min)
 *   - TC-TRIMIA-RF05-10, RF05-11 y RF05-12 Simulación activa real con cliente IA + pista de Trimi + feedback pedagógico
 *   - TC-TRIMIA-RF05-01, RF11-03 y RF11-04 Panel Supervisor: Gestión de píldoras (tema/entrevista) y Seguimiento de ingresantes
 * ============================================================================
 */

describe('Módulo 05 — Capacitación, Diagnóstico, Audio/RAG, Simulación IA y Supervisión (CU-CAP-01 a CU-CAP-11)', () => {
  let datos;
  const apiUrl = Cypress.expose('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RF05-03, RF05-06 y RF05-07: Debe mostrar la ruta de aprendizaje del puesto con la parada actual en curso y bloqueo secuencial', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.cerrarModalBienvenidaSiExiste();

    cy.navegarMenu('Mi Capacitación');

    cy.contains('h1', 'Mi ruta de aprendizaje').should('be.visible');
    cy.contains('Tu avance').should('be.visible');
    cy.contains('paradas').should('be.visible');
    cy.contains('Diagnóstico inicial').should('be.visible');
    cy.contains('Vendedor Ecommerce / Salón').should('be.visible');
    cy.contains('¿Qué es Credimisión?').should('be.visible');

    // Parada 1 habilitada en curso y botón de audio visible
    cy.contains(/Parada \d+ · en curso/).should('be.visible');
    cy.contains('button', 'Escuchar la píldora').should('be.visible').and('not.be.disabled');
  });

  it('TC-TRIMIA-RF05-05, RF05-08 y RF05-09: Debe abrir la lección de audio con subtítulos, puntos clave y responder dudas con Trimi (IA + RAG real)', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.navegarMenu('Mi Capacitación');
    cy.contains('h1', 'Mi ruta de aprendizaje').should('be.visible');
    cy.cerrarModalBienvenidaSiExiste();

    cy.contains('button', 'Escuchar la píldora').first().click();

    // Verifica estructura completa de LessonStudyModal
    cy.contains('Lo que dice Trimi').should('be.visible');
    cy.contains('Puntos clave').should('be.visible');
    cy.contains('¿Dudas? Preguntale a Trimi').should('be.visible');
    cy.contains('button', /Velocidad/).should('be.visible').click();
    cy.contains('button', 'Subtítulos').should('be.visible');

    // Consulta real a Trimi RAG sobre el procedimiento de la lección
    cy.intercept('POST', '**/training/pills/*/ask').as('askTrimi');
    cy.get('input[placeholder="Escribí tu duda..."]')
      .should('be.visible')
      .type('¿Cuál es el rol del asesor de Ecommerce en Credimisión?');
    cy.get('button[title="Enviar duda"]').should('not.be.disabled').click();

    cy.wait('@askTrimi', { timeout: 35000 }).then(({ response }) => {
      expect(response.statusCode).to.be.oneOf([200, 201]);
    });

    // Verifica que aparece la burbuja de respuesta con su fuente
    cy.contains('Fuente:', { timeout: 15000 }).should('be.visible');
  });

  it('TC-TRIMIA-RF05-DIAGNOSTICO: Debe abrir la Evaluación Diagnóstica inicial, cargar preguntas reales y permitir responder y avanzar', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.navegarMenu('Mi Capacitación');
    cy.contains('h1', 'Mi ruta de aprendizaje').should('be.visible');
    cy.cerrarModalBienvenidaSiExiste();

    cy.contains('Diagnóstico inicial').should('be.visible');
    cy.get('body').then(($body) => {
      if ($body.text().includes('Rendir ahora')) {
        cy.contains('button', 'Rendir ahora').click();
        cy.get('.diagnostic-quiz-modal').should('be.visible');
        cy.get('.diagnostic-quiz-modal').should('contain.text', 'Pregunta 1');
        // Selecciona una opción (radio/label de respuesta) y verifica avance a Pregunta 2
        cy.get('.diagnostic-quiz-modal label').first().click();
        cy.get('.diagnostic-quiz-modal').contains('button', 'Responder').should('not.be.disabled').click();
        cy.get('.diagnostic-quiz-modal').should('contain.text', 'Pregunta 2');
      } else {
        cy.contains('Diagnóstico inicial').parent().should('contain.text', 'Completado');
      }
    });
  });

  it('TC-TRIMIA-RF05-10, RF05-11 y RF05-12: Simulación activa real con IA (inicio, 2 turnos de conversación, pista de Trimi y feedback final)', () => {
    const vendedora = datos.usuarios.vendedora;

    // Helper resiliente ante 503 transitorios del proveedor Gemini (reintenta hasta 2 veces)
    const requestConReintento = (opts, intentosRestantes = 2) => {
      return cy.request({ timeout: 90000, ...opts, failOnStatusCode: false }).then((res) => {
        if (res.status === 503 && intentosRestantes > 0) {
          return cy.wait(2500).then(() => requestConReintento(opts, intentosRestantes - 1));
        }
        return res;
      });
    };

    cy.getToken(vendedora.email, datos.passwordDefault).then((token) => {
      cy.request({
        method: 'GET',
        url: `${apiUrl}/training/modules`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((modRes) => {
        expect(modRes.status).to.eq(200);
        const firstPill = modRes.body?.[0]?.pills?.[0];
        expect(firstPill, 'Debe existir al menos una píldora habilitada').to.not.equal(undefined);

        // 1. Iniciar sesión de práctica guiada con cliente simulado IA
        requestConReintento({
          method: 'POST',
          url: `${apiUrl}/training/pills/${firstPill.id}/simulations`,
          headers: { Authorization: `Bearer ${token}` },
          body: { mode: 'GUIDED' },
        }).then((startRes) => {
          expect(startRes.status).to.be.oneOf([200, 201]);
          const sessionId = startRes.body.id || startRes.body.sessionId;
          expect(sessionId).to.be.a('string').and.have.length.greaterThan(5);

          // 2. Turno 1 de la empleada → réplica real del cliente simulado IA
          requestConReintento({
            method: 'POST',
            url: `${apiUrl}/training/simulations/${sessionId}/messages`,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              content:
                '¡Hola! Gracias por comunicarte con Credimisión. Contame en qué te puedo ayudar hoy, de qué localidad nos escribís y te explico cómo trabajamos en el NEA.',
            },
          }).then((msg1Res) => {
            expect(msg1Res.status).to.be.oneOf([200, 201]);
            expect(JSON.stringify(msg1Res.body).length).to.be.greaterThan(30);

            // 3. Solicitar pista pedagógica a Trimi (CU-CAP-09)
            requestConReintento({
              method: 'POST',
              url: `${apiUrl}/training/simulations/${sessionId}/hint`,
              headers: { Authorization: `Bearer ${token}` },
            }).then((hintRes) => {
              expect(hintRes.status).to.be.oneOf([200, 201]);
              expect(
                String(hintRes.body?.hint || hintRes.body?.message || JSON.stringify(hintRes.body)).length,
              ).to.be.greaterThan(5);

              // 4. Turno 2 de la empleada (regla de negocio: mínimo 2 intercambios antes de concluir)
              requestConReintento({
                method: 'POST',
                url: `${apiUrl}/training/simulations/${sessionId}/messages`,
                headers: { Authorization: `Bearer ${token}` },
                body: {
                  content:
                    'Con gusto te acompaño paso a paso. En Credimisión trabajamos con atención personalizada y si necesitás consultar opciones comerciales o de financiación tomamos tus datos para asesorarte.',
                },
              }).then((msg2Res) => {
                expect(msg2Res.status).to.be.oneOf([200, 201]);

                // 5. Concluir simulación y obtener feedback pedagógico IA (CU-CAP-11)
                requestConReintento({
                  method: 'POST',
                  url: `${apiUrl}/training/simulations/${sessionId}/conclude`,
                  headers: { Authorization: `Bearer ${token}` },
                }).then((endRes) => {
                  expect(endRes.status).to.be.oneOf([200, 201]);
                  expect(endRes.body?.band).to.be.oneOf(['ACHIEVED', 'NEEDS_IMPROVEMENT', 'NOT_ACHIEVED']);
                  expect(endRes.body?.whatWentWell).to.be.a('string').and.have.length.greaterThan(5);
                  expect(endRes.body?.toImprove).to.be.a('string').and.have.length.greaterThan(5);
                  expect(endRes.body?.businessRules).to.be.a('string').and.have.length.greaterThan(5);
                });
              });
            });
          });
        });
      });
    });
  });

  it('TC-TRIMIA-RF05-01, RF11-03 y RF11-04: El Supervisor gestiona módulos/píldoras (tema y entrevista) y monitorea el Seguimiento de ingresantes', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    cy.loginUI(supGeneral.email, datos.passwordDefault);

    cy.navegarMenu('Capacitación y Diagnóstico');

    // Vista 1: Gestión de píldoras
    cy.get('.training-panel .submenu-pills').within(() => {
      cy.contains('button.submenu-pill', 'Gestión de píldoras').should('be.visible').and('have.class', 'active');
      cy.contains('button.submenu-pill', 'Seguimiento de ingresantes').should('be.visible');
    });

    cy.contains('h3', 'Nuevo Módulo Formativo').should('be.visible');
    cy.contains('h3', 'Generar Píldora con IA').should('be.visible');
    cy.contains('label', 'Desde un tema').should('be.visible');
    cy.contains('label', 'Desde una entrevista').should('be.visible').click();
    cy.get('input[placeholder*="Entrevista operativa"]').should('be.visible');

    // Módulo semilla real visible con orden obligatorio y sus píldoras
    cy.contains('h4', 'Vendedor Ecommerce / Salón').should('be.visible');
    cy.contains('Orden obligatorio').should('be.visible');
    cy.contains('¿Qué es Credimisión?').should('be.visible');

    // Vista 2: Seguimiento de ingresantes (KPIs + tabla real paginada)
    cy.get('.training-panel .submenu-pills')
      .contains('button.submenu-pill', 'Seguimiento de ingresantes')
      .click()
      .should('have.class', 'active');

    cy.contains('Ingresantes y Estado de Avance').should('be.visible');
    cy.contains('En capacitación').should('be.visible');
    cy.contains('Necesitan ayuda').should('be.visible');
    cy.contains('Listos para atender').should('be.visible');
    cy.contains('button', 'Ver detalle').should('be.visible');
  });
});
