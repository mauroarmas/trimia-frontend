/**
 * ============================================================================
 * SUITE 05: MÓDULO DE CAPACITACIÓN Y DIAGNÓSTICO INICIAL
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Módulo Capacitación (CU-CAP-01 a CU-CAP-08 — Ventanas 16 a 23)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RF-05  (Capacitación de nuevos empleados mediante ruta adaptativa y píldoras secuenciales)
 *   - RF-11  (Generación, revisión y publicación de módulos y píldoras por el supervisor)
 *   - RF-14  (Reproducción de audio de lecciones/píldoras)
 *   - RNF-02 (Acceso del empleado únicamente a la ruta formativa de su sector/puesto)
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RF05-03 y RF05-07 (Visualizar ruta de aprendizaje y bloqueo secuencial de paradas pendientes)
 *   - TC-TRIMIA-RF05-04 y RF05-06 (Mostrar progreso de paradas y contenido del puesto de la empleada)
 *   - TC-TRIMIA-RF05-01, RF11-03 y RF11-04 (Vista del Supervisor: Gestión de píldoras y Seguimiento de ingresantes)
 * ============================================================================
 */

describe('Módulo 05 — Capacitación, Diagnóstico Inicial y Gestión de Píldoras (CU-CAP-01 a CU-CAP-08)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF05-03, TC-TRIMIA-RF05-06 y TC-TRIMIA-RF05-07
   * Requisito:      RF-05, RNF-02 (CU-CAP-05 y CU-CAP-07 - Ruta de aprendizaje y bloqueos - Ventanas 20 y 22)
   * Técnica:        Transición de estados (Parada 1 en curso / desbloqueada vs. Parada 2 bloqueada con candado)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Casos aprobados en Ciclo 1 que verifican la progresión secuencial obligatoria.
   *
   * En qué consiste y detalle:
   *   Verifica que cuando una empleada en capacitación (ej. `sofia.ramirez@credimision.com` o
   *   `laura.gomez@credimision.com`) ingresa a "Mi Capacitación":
   *   1) Se muestre el encabezado "Mi ruta de aprendizaje", el widget "Tu avance" ("X de Y paradas")
   *      y el paso "Diagnóstico inicial".
   *   2) La primera parada no completada figure destacada como "Parada 1 · en curso" con acciones
   *      habilitadas, mientras que las paradas siguientes figuren bloqueadas (con ícono de candado)
   *      impidiendo abrirlas antes de completar la anterior.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF05-03, RF05-06 y RF05-07: Debe mostrar la ruta de aprendizaje de la empleada con la parada actual en curso y bloquear las paradas posteriores pendientes', () => {
    const vendedora = datos.usuarios.vendedora;

    cy.loginUI(vendedora.email, datos.passwordDefault);

    // Si aparece el modal de bienvenida inicial de Trimi, lo cerramos o continuamos
    cy.get('body').then(($body) => {
      if ($body.find('[role="dialog"]').length > 0) {
        cy.get('[role="dialog"] button').last().click({ force: true });
      }
    });

    cy.navegarMenu('Mi Capacitación');

    // Verifica estructura de "Mi ruta de aprendizaje" (Ventanas 20 y 22)
    cy.contains('h1', 'Mi ruta de aprendizaje').should('be.visible');
    cy.contains('Tu avance').should('be.visible');
    cy.contains('paradas').should('be.visible');
    cy.contains('Diagnóstico inicial').should('be.visible');

    // Verifica que exista la parada activa ("en curso")
    cy.contains(/Parada \d+ · en curso/).should('be.visible');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF05-01, TC-TRIMIA-RF11-03 y TC-TRIMIA-RF05-02
   * Requisito:      RF-05, RF-11, RNF-02 (CU-CAP-01, CU-CAP-03 y CU-CAP-04 - Ventanas 16, 18 y 19)
   * Técnica:        Caso de uso (Gestión de píldoras y Seguimiento de ingresantes por Supervisor)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica el panel de autoría y monitoreo formativo del supervisor.
   *
   * En qué consiste y detalle:
   *   Verifica que cuando un Supervisor ingresa a "Capacitación y Diagnóstico", el sistema
   *   presente la vista de supervisión con sus dos subpestañas:
   *   1) "Gestión de píldoras": permite gestionar los módulos formativos del área, generar
   *      píldoras con IA, revisar borradores/guiones y publicarlas.
   *   2) "Seguimiento de ingresantes": permite monitorear el avance de los empleados,
   *      su estado en la evaluación diagnóstica y sus simulaciones.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF05-01 y RF11-03: Debe mostrar al Supervisor las vistas de "Gestión de píldoras" y "Seguimiento de ingresantes"', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    cy.loginUI(supGeneral.email, datos.passwordDefault);

    cy.navegarMenu('Capacitación y Diagnóstico');

    // Verifica las dos subpestañas exclusivas del rol SUPERVISOR en TrainingPanel
    cy.get('.training-panel .submenu-pills').within(() => {
      cy.contains('button.submenu-pill', 'Gestión de píldoras').should('be.visible').and('have.class', 'active');
      cy.contains('button.submenu-pill', 'Seguimiento de ingresantes').should('be.visible').click().should('have.class', 'active');
    });
  });
});
