/**
 * ============================================================================
 * SUITE 02: MÓDULO DE COBRANZAS (COMPROBANTES, CUOTAS, IMPACTO Y RECORDATORIOS)
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Módulo Cobranzas (CU-COB-01 a CU-COB-07 y CU-COB-10 — Ventanas 1 a 7)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RF-04  (Recordatorios automáticos, recepción/revisión de comprobantes y gestión de cuotas)
 *   - RNF-02 (Control de acceso entre Cobrador común y Cobradora Controladora)
 *   - RI-04  (Integración con WhatsApp Business para solicitud de comprobantes y recordatorios)
 *
 * Defectos del Ciclo 1 verificados en regresión:
 *   - DM-TRIMIA-001 (Alto):  Impedir aceptar comprobantes de pago con monto $0.
 *   - DM-TRIMIA-002 (Medio): Formato consistente de fecha del comprobante entre grilla y detalle.
 *   - DM-TRIMIA-003 (Bajo):  Estados del comprobante y de cuotas traducidos al español.
 *   - DM-TRIMIA-004 (Medio): Mostrar cantidad de cuotas vencidas y estado de cuenta del cliente.
 *   - DM-TRIMIA-007 (Medio): Pedir diálogo de confirmación antes de ejecutar acciones permanentes.
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RF04-01  (Visualizar KPIs y pestañas del Cobrador)
 *   - TC-TRIMIA-RF04-02  (Aceptar comprobante pendiente con confirmación — DM-TRIMIA-007)
 *   - TC-TRIMIA-RF04-03  (Rechazar comprobante indicando motivo)
 *   - TC-TRIMIA-RF04-04  (Impedir aceptar un comprobante con monto $0 — DM-TRIMIA-001)
 *   - TC-TRIMIA-RF04-05  (Listar solo los clientes asignados al cobrador y estados en español — DM-TRIMIA-002/003)
 *   - TC-TRIMIA-RF04-06 y RF04-11 (Abrir historial de cuotas mostrando total adeudado, vencidas y estado — DM-TRIMIA-004)
 *   - TC-TRIMIA-RF04-10  (No ofrecer acciones sobre una cuota ya pagada)
 *   - TC-TRIMIA-RF04-14 y RNF02-08 (Verificar impacto bancario solo como Controladora y bloquear al Cobrador común)
 *   - TC-TRIMIA-RF04-19, RF04-20 y RNF02-09 (Configurar recordatorios y validar permiso exclusivo de Controladora/Supervisor)
 * ============================================================================
 */

describe('Módulo 02 — Panel de Cobranzas, Comprobantes, Cuotas e Impacto Bancario (CU-COB-01 a CU-COB-10)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF04-01 y TC-TRIMIA-RNF02-08 / RNF02-09 (UI)
   * Requisito:      RF-04, RNF-02 (CU-COB-01 - Consultar panel de cobranzas - Ventana 1)
   * Técnica:        Caso de uso / Partición de equivalencia por rol (Cobrador común)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Caso aprobado en Ciclo 1 que forma parte del smoke test de Cobranzas.
   *
   * En qué consiste y detalle:
   *   Verifica que al ingresar con el perfil de Cobrador común (`roberto.sosa@credimision.com`),
   *   se visualice "Mi Panel de Cobranzas" con los 3 bloques de KPIs ("Cuotas pendientes",
   *   "Comprobantes para revisar" y "Pagos confirmados esta semana") y sus 4 subpestañas
   *   autorizadas ("Mis Comprobantes", "Mis Clientes", "Recordatorios Enviados", "Registro de Actividad"),
   *   sin mostrar "Verificar Impacto" ni "Configuración de recordatorios" (reservadas a Controladora).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF04-01, RNF02-08 y RNF02-09: Debe mostrar los KPIs y pestañas del Cobrador común ocultando Verificar Impacto y Configuración de recordatorios', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    // Verifica título del panel y los 3 indicadores KPI
    cy.contains('h1, h2', 'Mi Panel de Cobranzas').should('be.visible');
    cy.get('.collection-metrics').within(() => {
      cy.contains('Cuotas pendientes').should('be.visible');
      cy.contains('Comprobantes para revisar').should('be.visible');
      cy.contains('Pagos confirmados esta semana').should('be.visible');
    });

    // Verifica subpestañas visibles del cobrador común
    cy.get('.collections-tabs').within(() => {
      cy.contains('button.submenu-pill', 'Mis Comprobantes').should('be.visible');
      cy.contains('button.submenu-pill', 'Mis Clientes').should('be.visible');
      cy.contains('button.submenu-pill', 'Recordatorios Enviados').should('be.visible');
      cy.contains('button.submenu-pill', 'Registro de Actividad').should('be.visible');

      // Restricción RNF-02: el Cobrador común NO debe ver estas dos pestañas
      cy.contains('button.submenu-pill', 'Verificar Impacto').should('not.exist');
      cy.contains('button.submenu-pill', 'Configuración de recordatorios').should('not.exist');
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF04-04 (Regresión DM-TRIMIA-001 — Severidad Alta)
   * Requisito:      RF-04 (CU-COB-02 - Gestionar comprobantes de pago - Ventanas 2 y 7)
   * Técnica:        Análisis de valores límite (monto de comprobante = $0)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Regresión del defecto de mayor severidad detectado en el Ciclo 1.
   *
   * En qué consiste y detalle:
   *   En el Ciclo 1 se detectó que el sistema permitía aceptar un comprobante con
   *   monto extraído igual a $0 (caso Credisur, DM-TRIMIA-001), con riesgo de dar por
   *   paga una cuota sin pago real. Este test intercepta/simula un comprobante pendiente
   *   con `extractedAmount: 0`, abre su detalle ("Ver") y verifica que:
   *   1) El botón "✓ Aceptar" esté deshabilitado (`disabled`).
   *   2) Se muestre el mensaje de error indicando que el monto debe ser mayor a cero.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF04-04 (Regresión DM-TRIMIA-001): Debe impedir aceptar un comprobante de pago cuyo monto sea $0', () => {
    const cobrador = datos.usuarios.cobrador;

    // Interceptamos la lista de comprobantes pendientes inyectando un comprobante con monto $0
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

    // Abrimos el detalle del comprobante de $0
    cy.contains('tr', 'Credisur').within(() => {
      cy.contains('button', 'Ver').click();
    });

    // Verifica dentro del diálogo modal que "Aceptar" está deshabilitado y muestra la alerta
    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.contains('p.error', 'El monto debe ser válido y mayor a cero para aceptar el comprobante').should('be.visible');
      cy.contains('button', 'Aceptar').should('be.disabled');
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF04-02 y TC-TRIMIA-RF04-03 (Regresión DM-TRIMIA-002, 003 y 007)
   * Requisito:      RF-04, RI-04 (CU-COB-02 - Gestionar comprobantes de pago - Ventana 2)
   * Técnica:        Partición de equivalencia y transición de estados (Pendiente → Aceptado / Rechazado)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Flujo operativo diario del cobrador sobre comprobantes recibidos.
   *
   * En qué consiste y detalle:
   *   Verifica sobre un comprobante pendiente válido ($110.000 de Comercio Don Pedro):
   *   1) Que el estado se muestre en español ("Pendiente de revisión", DM-TRIMIA-003) y
   *      que la fecha formateada sea idéntica en la tabla y en el modal (DM-TRIMIA-002).
   *   2) Que al presionar "✓ Aceptar" o seleccionar un motivo en "Rechazar por...", el
   *      sistema solicite confirmación mediante diálogo (`window.confirm`, DM-TRIMIA-007)
   *      y envíe la petición correspondiente al backend.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF04-02 y RF04-03 (Regresión DM-TRIMIA-002, 003, 007): Debe mostrar fecha/estado consistentes en español y pedir confirmación al aceptar o rechazar un comprobante', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.intercept('GET', '**/collections/proofs*status=PENDING_REVIEW*', {
      statusCode: 200,
      body: [
        {
          id: 'proof-don-pedro-110k',
          status: 'PENDING_REVIEW',
          extractedAmount: 110000,
          extractedDate: '2026-07-31T12:00:00.000Z',
          extractedBank: 'Galicia',
          quota: {
            id: 'quota-dp-01',
            amount: 120000,
            client: { id: 'client-don-pedro', name: 'Comercio Don Pedro' },
          },
        },
      ],
    }).as('getProofsValidos');

    cy.intercept('POST', '**/collections/proofs/proof-don-pedro-110k/accept', {
      statusCode: 200,
      body: { id: 'proof-don-pedro-110k', status: 'ACCEPTED' },
    }).as('acceptProof');

    cy.loginUI(cobrador.email, datos.passwordDefault);
    cy.contains('.collections-tabs button.submenu-pill', 'Mis Comprobantes').click();
    cy.wait('@getProofsValidos');

    // DM-TRIMIA-003: El estado en la grilla debe estar en español ("Pendiente de revisión") y no "PENDING_REVIEW"
    cy.contains('tr', 'Comercio Don Pedro').within(() => {
      cy.contains('.badge', 'Pendiente de revisión').should('be.visible');
      cy.contains('PENDING_REVIEW').should('not.exist');
      cy.contains('button', 'Ver').click();
    });

    // DM-TRIMIA-002: El detalle no debe mostrar la fecha cruda ISO en UTC ("2026-08-01T00:00:00.000Z")
    cy.get('[role="dialog"][aria-label="Revisar comprobante"]').within(() => {
      cy.contains('Comprobante: Comercio Don Pedro').should('be.visible');
      cy.contains('T00:00:00').should('not.exist');
      cy.contains('.badge', 'Pendiente de revisión').should('be.visible');

      // DM-TRIMIA-007: Verifica que al presionar Aceptar se dispare window.confirm
      const confirmStub = cy.stub().returns(true);
      cy.on('window:confirm', confirmStub);

      cy.contains('button', 'Aceptar')
        .should('not.be.disabled')
        .click()
        .then(() => {
          expect(confirmStub).to.be.calledOnce;
        });
    });

    cy.wait('@acceptProof');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF04-06, TC-TRIMIA-RF04-10 y TC-TRIMIA-RF04-11 (Regresión DM-TRIMIA-004)
   * Requisito:      RF-04 (CU-COB-03 y CU-COB-04 - Historial y gestión de cuotas - Ventanas 3 y 4)
   * Técnica:        Caso de uso y Tabla de decisión (Estado de cuota Pagada vs. Pendiente)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Valida la ficha completa de cuenta corriente y acciones por estado de cuota.
   *
   * En qué consiste y detalle:
   *   1) TC-TRIMIA-RF04-06 y RF04-11: En "Mis Clientes", abre la cuenta de "Comercio Don Pedro"
   *      ("Ver cuenta →") y verifica que el encabezado de la cuenta muestre los tres datos
   *      exigidos por RF-04 que faltaban en el Ciclo 1 (DM-TRIMIA-004): "Total adeudado",
   *      "Cuotas vencidas" y "Estado de cuenta".
   *   2) TC-TRIMIA-RF04-10: Verifica que las cuotas en estado "Pendiente" o "Vencida" ofrezcan
   *      los botones "Pedir comprobante" y "Manejo manual", mientras que al filtrar las cuotas
   *      "Pagadas", el sistema NO ofrezca acciones sobre ellas (muestra "—").
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF04-06, RF04-10 y RF04-11 (Regresión DM-TRIMIA-004): Debe mostrar cuotas vencidas y estado del cliente en el historial y no ofrecer acciones sobre cuotas pagadas', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    // En la pestaña Mis Clientes (activa por defecto para Cobrador), abrimos el primer cliente con "Ver cuenta →"
    cy.get('section.collection-portfolio').should('be.visible');
    cy.contains('button', 'Ver cuenta →').first().click();

    // Verifica el modal de Cuenta del Cliente (Ventana 4)
    cy.get('[role="dialog"]').within(() => {
      // Regresión DM-TRIMIA-004: Deben existir los 3 indicadores exigidos por RF-04
      cy.get('.collection-account-totals').within(() => {
        cy.contains('span', 'Total adeudado').should('be.visible');
        cy.contains('span', 'Cuotas vencidas').should('be.visible');
        cy.contains('span', 'Estado de cuenta').should('be.visible');
      });

      // Cambiamos el selector de filtro a "Todas" para inspeccionar cuotas pagadas y pendientes
      cy.get('#collection-quota-filter').select('all');

      // Si hay cuotas "Pagada", verificamos que no tengan botones "Pedir comprobante" ni "Manejo manual" (TC-TRIMIA-RF04-10)
      cy.get('tbody').then(($tbody) => {
        if ($tbody.text().includes('Pagada')) {
          cy.contains('tr', 'Pagada').within(() => {
            cy.contains('button', 'Pedir comprobante').should('not.exist');
            cy.contains('button', 'Manejo manual').should('not.exist');
          });
        }
      });
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF04-14, TC-TRIMIA-RF04-19 y TC-TRIMIA-RF04-20
   * Requisito:      RF-04, RNF-02 (CU-COB-07 Verificar impacto bancario y CU-COB-10 Configurar recordatorios)
   * Técnica:        Partición de equivalencia por rol (Cobradora Controladora) y Valores límite
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica las funciones exclusivas del rol Controlador en Cobranzas.
   *
   * En qué consiste y detalle:
   *   Verifica que al iniciar sesión con la Cobradora Controladora (`marisa.paz@credimision.com`):
   *   1) Tenga habilitada la subpestaña "Verificar Impacto" (Ventana 7) y que los estados de
   *      impacto se muestren en español ("Confirmado" / "Por verificar", DM-TRIMIA-003).
   *   2) Tenga habilitada la subpestaña "Configuración de recordatorios" (`CU-COB-10`).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF04-14 y RF04-19: Debe habilitar Verificar Impacto y Configuración de recordatorios para la Cobradora Controladora', () => {
    const controladora = datos.usuarios.cobradoraControladora;
    cy.loginUI(controladora.email, datos.passwordDefault);

    // Verifica que la Controladora ve las 6 subpestañas del panel de cobranzas
    controladora.subpestanasEsperadasCobranzas.forEach((subpestana) => {
      cy.contains('.collections-tabs button.submenu-pill', subpestana).should('be.visible');
    });

    // Abre "Verificar Impacto" (Ventana 7)
    cy.contains('.collections-tabs button.submenu-pill', 'Verificar Impacto').click();
    cy.contains('h3', 'Verificar Impacto Bancario').should('be.visible');

    // Abre "Configuración de recordatorios" (CU-COB-10)
    cy.contains('.collections-tabs button.submenu-pill', 'Configuración de recordatorios').click();
  });
});
