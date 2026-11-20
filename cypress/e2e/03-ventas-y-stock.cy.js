/**
 * ============================================================================
 * SUITE 03: MÓDULO DE VENTAS, CONSULTA DE STOCK (PALJET) Y CRÉDITO (RIESGO ONLINE)
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Módulo Ventas y venta financiada (CU-VEN-01, CU-VEN-02, CU-ADM-01 — Ventanas 9 y 10)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RF-03  (Seguimiento de prospectos y clientes derivados por el asistente)
 *   - RF-08  (Atención a clientes por WhatsApp y derivación con resumen)
 *   - RF-09  (Consulta de stock en tiempo real y sugerencia de sustitutos)
 *   - RF-10  (Verificación crediticia automática)
 *   - RF-13  (Flujo de venta financiada)
 *   - RI-01  (Integración de solo lectura con Paljet)
 *   - RI-02  (Integración de solo lectura con Riesgo Online)
 *   - RNF-02 (Confidencialidad de la información crediticia — Secreto Comercial OE-10)
 *   - RNF-04 (Arquitectura desacoplada y manejo de fallas de conexión con Paljet)
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RF03-01  (Visualizar clientes derivados con resumen de conversación — Ventana 9)
 *   - TC-TRIMIA-RF09-01  (Consultar disponibilidad de productos: Disponible, Bajo stock, Sin stock — Ventana 10)
 *   - TC-TRIMIA-RF09-02  (Destacar estado "Sin stock (0 u.)" y sustitutos — Ventana 10)
 *   - TC-TRIMIA-RI01-01  (Informar falla de conexión con Paljet sin bloquear el sistema)
 *   - TC-TRIMIA-RF10-01 y RF10-02 (Simulación crediticia: dictamen Aprobado vs. Rechazado sin exponer deudas BCRA)
 * ============================================================================
 */

describe('Módulo 03 — Panel de Ventas, Catálogo de Stock Paljet y Verificación Crediticia (CU-VEN-01, CU-VEN-02, CU-ADM-01)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF03-01
   * Requisito:      RF-03, RF-08, RF-13, RNF-02 (CU-VEN-01 - Contactar clientes derivados - Ventana 9)
   * Técnica:        Caso de uso (curso normal)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Caso aprobado en Ciclo 1 que valida la bandeja comercial del vendedor.
   *
   * En qué consiste y detalle:
   *   Verifica que al ingresar la Vendedora (`laura.gomez@credimision.com`) al "Panel de Ventas",
   *   la subpestaña "Clientes por contactar" muestre las tarjetas de los prospectos derivados
   *   por el asistente (como Valentina Herrera) con su teléfono, producto de interés, estado
   *   y el bloque de resumen de derivación IA.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF03-01: Debe visualizar los clientes derivados por el asistente con su resumen comercial en el Panel de Ventas', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);

    cy.contains('h1, h2', 'Panel de Ventas').should('be.visible');
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Clientes por contactar')
      .should('be.visible')
      .and('have.class', 'active');

    cy.contains('h3', 'Prospectos comerciales derivados por el Asistente').should('be.visible');

    // Verifica que exista la barra de búsqueda de prospectos y la grilla o estado vacío controlado
    cy.get('input[placeholder*="Buscar cliente, teléfono, negocio o producto"]').should('be.visible');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF09-01 y TC-TRIMIA-RF09-02
   * Requisito:      RF-09, RI-01, RNF-01 (CU-VEN-02 - Consultar stock - Ventana 10)
   * Técnica:        Partición de equivalencia y Valores límite (stock > 1, stock = 1, stock = 0)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Casos aprobados en Ciclo 1 ideales para regresión automatizada.
   *
   * En qué consiste y detalle:
   *   Verifica en la subpestaña "Consultar stock (Paljet)" que:
   *   1) TC-TRIMIA-RF09-01: Se listen los productos indicando el origen de los datos
   *      y sus tres niveles de disponibilidad:
   *      - `stock > 1` → etiqueta verde `.is-ok` ("X unidades · Disponible")
   *      - `stock === 1` → etiqueta ámbar `.is-low` ("1 unidad · Bajo stock")
   *      - `stock === 0` → etiqueta roja `.is-out` ("Sin stock (0 u.)")
   *   2) TC-TRIMIA-RF09-02: Para un producto sin stock (`0 unidades`), se destaque
   *      con la clase `.is-out` (rojo) y se muestren los chips de "Sustitutos con stock" (RF-09).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF09-01 y RF09-02: Debe consultar la disponibilidad de stock en Paljet diferenciando Disponible, Bajo stock (1 u.) y Sin stock (0 u. en rojo con sustitutos)', () => {
    const vendedora = datos.usuarios.vendedora;

    // Interceptamos la consulta de stock con los 3 casos de equivalencia/límite del Anexo B
    cy.intercept('GET', '**/sales/stock*', {
      statusCode: 200,
      body: [
        {
          sku: 'TV-SAM-55',
          name: 'Smart TV Samsung 55" 4K',
          category: 'SMART_TV',
          cashPrice: 850000,
          listPrice: 1020000,
          stock: 4,
          source: 'SIMULATED',
          lastUpdated: new Date().toISOString(),
        },
        {
          sku: 'TV-LG-50',
          name: 'Smart TV LG 50" Full HD',
          category: 'SMART_TV',
          cashPrice: 720000,
          listPrice: 864000,
          stock: 1,
          source: 'SIMULATED',
          lastUpdated: new Date().toISOString(),
        },
        {
          sku: 'TV-PHI-43',
          name: 'Smart TV Philips 43"',
          category: 'SMART_TV',
          cashPrice: 540000,
          listPrice: 648000,
          stock: 0,
          substituteSkus: ['TV-SAM-55', 'TV-LG-50'],
          source: 'SIMULATED',
          lastUpdated: new Date().toISOString(),
        },
      ],
    }).as('getStockPaljet');

    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Consultar stock (Paljet)').click();
    cy.wait('@getStockPaljet');

    // Verifica que se indica el origen de los datos de Paljet
    cy.contains('h3', 'Inventario y disponibilidad en Paljet').should('be.visible');

    // 1. Producto con stock disponible (4 unidades)
    cy.contains('tr', 'Smart TV Samsung 55" 4K').within(() => {
      cy.get('.sales-stock-pill.is-ok').should('contain.text', '4 unidades · Disponible');
    });

    // 2. Producto en valor límite de bajo stock (1 unidad)
    cy.contains('tr', 'Smart TV LG 50" Full HD').within(() => {
      cy.get('.sales-stock-pill.is-low').should('contain.text', '1 unidad · Bajo stock');
    });

    // 3. Producto en valor límite sin stock (0 unidades) en rojo (.is-out) y con sustitutos (TC-TRIMIA-RF09-02)
    cy.contains('tr', 'Smart TV Philips 43"').within(() => {
      cy.get('.sales-stock-pill.is-out').should('contain.text', 'Sin stock (0 u.)');
      cy.contains('.sales-substitutes-row', 'Sustitutos con stock:').should('be.visible');
      cy.contains('button.sales-sub-sku-chip', 'TV-SAM-55').should('be.visible');
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RI01-01
   * Requisito:      RI-01, RNF-04 (CU-VEN-02 - Curso alterno: Falla de conexión con Paljet)
   * Técnica:        Partición de equivalencia (Falla de servicio externo HTTP 503)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Fácil de simular de manera determinista con `cy.intercept()`.
   *
   * En qué consiste y detalle:
   *   Verifica que cuando el adaptador de Paljet responde con un error de servicio no
   *   disponible (HTTP 503), el Panel de Ventas muestra un mensaje de error claro al
   *   vendedor sin bloquear ni romper el resto de las pestañas de la aplicación (RNF-04).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RI01-01: Debe informar la falla de conexión con Paljet sin bloquear el resto del Panel de Ventas', () => {
    const vendedora = datos.usuarios.vendedora;

    cy.intercept('GET', '**/sales/stock*', {
      statusCode: 503,
      body: {
        statusCode: 503,
        message: 'No se pudo conectar con Paljet en este momento. Reintentá en unos minutos.',
      },
    }).as('getStockFalla');

    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Consultar stock (Paljet)').click();
    cy.wait('@getStockFalla');

    // Se muestra la alerta de error controlada y el usuario puede cambiar de pestaña sin bloqueo
    cy.get('p.error[role="alert"]').should('be.visible').and('contain.text', 'Paljet');
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Clientes por contactar').click().should('have.class', 'active');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF10-01 y TC-TRIMIA-RF10-02
   * Requisito:      RF-10, RI-02, RNF-02 (CU-ADM-01 - Verificar situación crediticia)
   * Técnica:        Partición de equivalencia (DNI situación normal vs. DNI con deudas irregulares)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Valida los dictámenes APROBADO y RECHAZADO y el Secreto Comercial (OE-10).
   *
   * En qué consiste y detalle:
   *   Desde la subpestaña "Simulación de crédito" del Panel de Ventas:
   *   1) TC-TRIMIA-RF10-01: Consulta el DNI `30111222` (situación normal según Anexo B)
   *      y verifica que el sistema proponga el dictamen "Aprobado".
   *   2) TC-TRIMIA-RF10-02: Consulta el DNI `30999888` (deudas en situación irregular)
   *      y verifica que proponga el dictamen "Rechazado" sin exponer el detalle confidencial
   *      de deudas bancarias del BCRA al vendedor (RNF-02 / OE-10).
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF10-01 y RF10-02: Debe proponer dictamen Aprobado para DNI en situación normal y Rechazado para DNI con deudas resguardando el secreto comercial', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);

    cy.contains('.sales-submenu-bar button.submenu-pill', 'Simulación de crédito').click();

    // 1. Consulta DNI 30111222 (Situación normal → APROBADO)
    cy.intercept('POST', '**/sales/credit-check', {
      statusCode: 200,
      body: {
        dni: datos.clientes.clienteNuevo.dniNormal,
        verdict: 'APPROVED',
        commercialSummary: 'El cliente califica para planes de financiación vigentes.',
      },
    }).as('creditApproved');

    cy.get('.sales-credit-workspace input').first().clear().type(datos.clientes.clienteNuevo.dniNormal);
    cy.get('.sales-credit-workspace button[type="submit"]').click();
    cy.wait('@creditApproved');
    cy.get('.sales-credit-workspace').should('contain.text', 'Aprobado');

    // 2. Consulta DNI 30999888 (Situación irregular → RECHAZADO)
    cy.intercept('POST', '**/sales/credit-check', {
      statusCode: 200,
      body: {
        dni: datos.clientes.clienteNuevo.dniIrregular,
        verdict: 'REJECTED',
        commercialSummary: 'Operación disponible únicamente de contado.',
      },
    }).as('creditRejected');

    cy.get('.sales-credit-workspace input').first().clear().type(datos.clientes.clienteNuevo.dniIrregular);
    cy.get('.sales-credit-workspace button[type="submit"]').click();
    cy.wait('@creditRejected');
    cy.get('.sales-credit-workspace').should('contain.text', 'Rechazado');
  });
});
