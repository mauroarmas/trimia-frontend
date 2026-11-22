/**
 * ============================================================================
 * SUITE 02: MÓDULO DE COBRANZAS (CARTERA, COMPROBANTES, IMPACTO Y RECORDATORIOS)
 * ============================================================================
 * Plan de Testing PT-TrimIA-2026-01 — Módulo Cobranzas (CU-COB-01 a CU-COB-10):
 *   - Requisitos: RF-04, RNF-02, RI-04
 *   - Regresiones: DM-TRIMIA-001, 002, 003, 004, 007
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RF04-01 / RNF02-08 / RNF02-09 KPIs y restricción de subpestañas para Cobrador común
 *   - TC-TRIMIA-RF04-04 (DM-TRIMIA-001) Bloqueo de aceptación para comprobante con monto $0
 *   - TC-TRIMIA-RF04-02 y RF04-03 (DM-TRIMIA-002/003/007) Aceptar y rechazar comprobantes con confirmación y estados en español
 *   - TC-TRIMIA-RF04-06, RF04-10 y RF04-11 (DM-TRIMIA-004) Cuenta corriente del cliente, cuotas vencidas y protección de cuotas pagadas
 *   - TC-TRIMIA-RF04-12 y RF04-13 Consulta de Recordatorios Enviados y Registro de Actividad
 *   - TC-TRIMIA-RF04-14, RF04-19 y RF04-20 Rol Controladora: Verificar Impacto bancario y Configuración de recordatorios (valores límite -1, 31, 7/3/0)
 * ============================================================================
 */

describe('Módulo 02 — Panel de Cobranzas, Comprobantes, Cuotas, Impacto y Recordatorios (CU-COB-01 a CU-COB-10)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RF04-01, RNF02-08 y RNF02-09: Debe mostrar los KPIs y pestañas del Cobrador común ocultando Verificar Impacto y Configuración', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    cy.contains('h1, h2', 'Mi Panel de Cobranzas').should('be.visible');
    cy.get('.collection-metrics').within(() => {
      cy.contains('Cuotas pendientes').should('be.visible');
      cy.contains('Comprobantes para revisar').should('be.visible');
      cy.contains('Pagos confirmados esta semana').should('be.visible');
    });

    cy.get('.collections-tabs').within(() => {
      cy.contains('button.submenu-pill', 'Mis Comprobantes').should('be.visible');
      cy.contains('button.submenu-pill', 'Mis Clientes').should('be.visible').and('have.class', 'active');
      cy.contains('button.submenu-pill', 'Recordatorios Enviados').should('be.visible');
      cy.contains('button.submenu-pill', 'Registro de Actividad').should('be.visible');

      // RNF-02: exclusivas de Cobradora Controladora / Supervisor
      cy.contains('button.submenu-pill', 'Verificar Impacto').should('not.exist');
      cy.contains('button.submenu-pill', 'Configuración de recordatorios').should('not.exist');
    });
  });

  it('TC-TRIMIA-RF04-04 (Regresión DM-TRIMIA-001): Debe impedir aceptar un comprobante de pago cuyo monto sea $0', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.intercept('GET', '**/collections/proofs*status=PENDING_REVIEW*', {
      statusCode: 200,
      body: [
        {
          id: 'proof-monto-cero-001',
          status: 'PENDING_REVIEW',
          extractedAmount: 0,
          extractedDate: '2026-07-31T15:00:00.000Z',
          extractedBank: 'Galicia',
          quota: {
            id: 'quota-001',
            amount: 120000,
            client: { id: 'client-credisur', name: 'Credisur' },
          },
        },
      ],
    }).as('getProofsMontoCero');

    cy.loginUI(cobrador.email, datos.passwordDefault);
    cy.contains('.collections-tabs button.submenu-pill', 'Mis Comprobantes').click();
    cy.wait('@getProofsMontoCero');

    cy.contains('tr', 'Credisur').within(() => {
      cy.contains('button', 'Ver').click();
    });

    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.contains('p.error', 'El monto debe ser válido y mayor a cero para aceptar el comprobante').should('be.visible');
      cy.contains('button', 'Aceptar').should('be.disabled');
    });
  });

  it('TC-TRIMIA-RF04-02 y RF04-03 (Regresión DM-TRIMIA-002, 003, 007): Debe aceptar y rechazar comprobantes con estados en español y confirmación explícita', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.intercept('GET', '**/collections/proofs*status=PENDING_REVIEW*', {
      statusCode: 200,
      body: [
        {
          id: 'proof-don-pedro-accept',
          status: 'PENDING_REVIEW',
          extractedAmount: 120000,
          extractedDate: '2026-07-31T12:00:00.000Z',
          extractedBank: 'Galicia',
          quota: {
            id: 'quota-dp-01',
            amount: 120000,
            client: { id: 'client-don-pedro', name: 'Comercio Don Pedro' },
          },
        },
        {
          id: 'proof-monto-bajo-reject',
          status: 'PENDING_REVIEW',
          extractedAmount: 45000,
          extractedDate: '2026-07-31T12:00:00.000Z',
          extractedBank: 'Macro',
          quota: {
            id: 'quota-dp-02',
            amount: 120000,
            client: { id: 'client-almacen-norte', name: 'Almacén Norte' },
          },
        },
      ],
    }).as('getProofsValidos');

    cy.intercept('POST', '**/collections/proofs/proof-don-pedro-accept/accept', {
      statusCode: 200,
      body: { id: 'proof-don-pedro-accept', status: 'ACCEPTED' },
    }).as('acceptProof');

    cy.intercept('POST', '**/collections/proofs/proof-monto-bajo-reject/reject', {
      statusCode: 200,
      body: { id: 'proof-monto-bajo-reject', status: 'REJECTED', rejectionReason: 'AMOUNT_TOO_LOW' },
    }).as('rejectProof');

    cy.loginUI(cobrador.email, datos.passwordDefault);
    cy.contains('.collections-tabs button.submenu-pill', 'Mis Comprobantes').click();
    cy.wait('@getProofsValidos');

    let confirmCount = 0;
    cy.on('window:confirm', () => {
      confirmCount += 1;
      return true;
    });

    // 1. Aceptación con confirmación (TC-TRIMIA-RF04-02)
    cy.contains('tr', 'Comercio Don Pedro').within(() => {
      cy.contains('.badge', 'Pendiente de revisión').should('be.visible');
      cy.contains('PENDING_REVIEW').should('not.exist');
      cy.contains('button', 'Ver').click();
    });

    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.contains('Comprobante: Comercio Don Pedro').should('be.visible');
      cy.contains('T12:00:00').should('not.exist');
      cy.contains('button', 'Aceptar')
        .should('not.be.disabled')
        .click()
        .then(() => {
          expect(confirmCount).to.eq(1);
        });
    });
    cy.wait('@acceptProof');

    // 2. Rechazo por motivo "Monto insuficiente" con confirmación (TC-TRIMIA-RF04-03)
    cy.contains('tr', 'Almacén Norte').within(() => {
      cy.contains('button', 'Ver').click();
    });

    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.get('select')
        .select('AMOUNT_TOO_LOW')
        .then(() => {
          expect(confirmCount).to.eq(2);
        });
    });

    cy.wait('@rejectProof').its('request.body').should('deep.include', { reason: 'AMOUNT_TOO_LOW' });
  });

  it('TC-TRIMIA-RF04-06, RF04-10, RF04-11, RF04-12 y RF04-13: Debe mostrar cuenta corriente completa, proteger cuotas pagadas y listar recordatorios/actividad', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    // Buscador y cartera del cobrador (CU-COB-03)
    cy.get('section.collection-portfolio').should('be.visible');
    cy.contains('button', 'Ver cuenta →').first().click();

    cy.get('[role="dialog"]').within(() => {
      // DM-TRIMIA-004: los 3 indicadores obligatorios de RF-04
      cy.get('.collection-account-totals').within(() => {
        cy.contains('span', 'Total adeudado').should('be.visible');
        cy.contains('span', 'Cuotas vencidas').should('be.visible');
        cy.contains('span', 'Estado de cuenta').should('be.visible');
      });

      // Cuotas pendientes/vencidas ofrecen gestión; cuotas pagadas NO (TC-TRIMIA-RF04-10)
      cy.get('#collection-quota-filter').select('all');
      cy.get('tbody').then(($tbody) => {
        const text = $tbody.text();
        if (text.includes('Pendiente') || text.includes('Vencida')) {
          cy.contains('tr', /Pendiente|Vencida/).first().within(() => {
            cy.contains('button', 'Pedir comprobante').should('be.visible');
            cy.contains('button', 'Manejo manual').should('be.visible');
          });
        }
        if (text.includes('Pagada')) {
          cy.contains('tr', 'Pagada').first().within(() => {
            cy.contains('button', 'Pedir comprobante').should('not.exist');
            cy.contains('button', 'Manejo manual').should('not.exist');
          });
        }
      });

      cy.contains('button', 'Cerrar').click();
    });

    // CU-COB-05: Recordatorios Enviados
    cy.contains('.collections-tabs button.submenu-pill', 'Recordatorios Enviados').click().should('have.class', 'active');
    // CU-COB-06: Registro de Actividad
    cy.contains('.collections-tabs button.submenu-pill', 'Registro de Actividad').click().should('have.class', 'active');
  });

  it('TC-TRIMIA-RF04-14, RF04-19 y RF04-20: La Cobradora Controladora verifica impacto bancario y valida valores límite en recordatorios (-1, 31 vs 7, 3, 0)', () => {
    const controladora = datos.usuarios.cobradoraControladora;

    // Interceptamos solo el listado/confirmación de impacto bancario para probar el flujo sin mutar cuotas reales
    cy.intercept('GET', '**/collections/proofs/accepted*', {
      statusCode: 200,
      body: [
        {
          id: 'proof-impact-sim-01',
          status: 'ACCEPTED',
          impactStatus: 'PENDING',
          extractedAmount: 120000,
          extractedDate: '2026-11-20T12:00:00.000Z',
          extractedBank: 'Galicia',
          acceptedBy: { name: 'Roberto Sosa' },
          quota: {
            id: 'quota-imp-01',
            amount: 120000,
            client: { id: 'client-dp', name: 'Comercio Don Pedro' },
          },
        },
      ],
    }).as('getAcceptedProofs');

    cy.intercept('POST', '**/collections/proofs/proof-impact-sim-01/verify-impact', {
      statusCode: 200,
      body: { id: 'proof-impact-sim-01', impactStatus: 'CONFIRMED' },
    }).as('verifyImpact');

    cy.loginUI(controladora.email, datos.passwordDefault);

    // Verifica las 6 subpestañas habilitadas para Controladora
    controladora.subpestanasEsperadasCobranzas.forEach((subpestana) => {
      cy.contains('.collections-tabs button.submenu-pill', subpestana).should('be.visible');
    });

    // 1. Verificar Impacto Bancario (CU-COB-07)
    cy.contains('.collections-tabs button.submenu-pill', 'Verificar Impacto').click();
    cy.wait('@getAcceptedProofs');
    cy.contains('h3', 'Verificar Impacto Bancario').should('be.visible');
    cy.contains('tr', 'Comercio Don Pedro').within(() => {
      cy.contains('.badge', 'Por verificar').should('be.visible');
      cy.contains('button', 'Verificar').click();
    });

    let impactConfirmCount = 0;
    cy.on('window:confirm', () => {
      impactConfirmCount += 1;
      return true;
    });
    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.contains('button', 'Confirmado')
        .click()
        .then(() => {
          expect(impactConfirmCount).to.eq(1);
        });
    });
    cy.wait('@verifyImpact').its('request.body').should('deep.include', { impactStatus: 'CONFIRMED' });

    // 2. Configuración de recordatorios + Valores límite reales contra el backend (TC-TRIMIA-RF04-19 y RF04-20)
    cy.contains('.collections-tabs button.submenu-pill', 'Configuración de recordatorios').click();
    cy.contains('h3', 'Configurar recordatorios').should('be.visible');
    cy.get('#reminder-days').should('be.visible').invoke('val').then((valorOriginal) => {
      // Valores límite inválidos (-1 y 31) deben ser bloqueados
      datos.valoresLimiteRecordatorios.diasInvalidos.forEach((invalido) => {
        cy.get('#reminder-days').clear().type(String(invalido));
        cy.contains('button[type="submit"]', 'Guardar configuración').click();
        cy.get('p.error[role="alert"]')
          .should('be.visible')
          .and('contain.text', 'entre 0 y 30');
      });

      // Valores límite válidos (7, 3, 0) guardan correctamente en el backend real
      cy.intercept('PUT', '**/collections/reminder-config').as('saveReminderConfig');
      cy.get('#reminder-days').clear().type('7, 3, 0');
      cy.contains('button[type="submit"]', 'Guardar configuración').click();
      cy.wait('@saveReminderConfig').its('response.statusCode').should('eq', 200);
      cy.contains('p.success-msg', 'Configuración guardada.').should('be.visible');

      // Restauramos el valor original si era diferente
      if (valorOriginal && String(valorOriginal).trim() !== '7, 3, 0') {
        cy.get('#reminder-days').clear().type(String(valorOriginal));
        cy.contains('button[type="submit"]', 'Guardar configuración').click();
        cy.wait('@saveReminderConfig').its('response.statusCode').should('eq', 200);
      }
    });
  });
});
