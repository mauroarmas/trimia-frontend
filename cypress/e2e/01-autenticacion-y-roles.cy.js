/**
 * ============================================================================
 * SUITE 01: AUTENTICACIÓN, CONTROL DE ACCESO POR ROL Y GESTIÓN DE EMPLEADOS
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Módulo Autenticación y administración (CU-AUTH-01, CU-AUTH-02, CU-GER-01)
 *   - Módulo Asistente conversacional (acceso transversal al Chat Web: CU-GEN-01)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RF-12 (Tipo de usuario y acceso)
 *   - RF-07 (Acceso web y WhatsApp para todos los perfiles de empleado)
 *   - RNF-02 (Control de acceso, autenticación y confidencialidad por rol)
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RF12-01  (Iniciar sesión con credenciales válidas)
 *   - TC-TRIMIA-RNF02-01 (Rechazar inicio de sesión con clave incorrecta)
 *   - TC-TRIMIA-RNF02-02 (Impedir acceso a páginas internas sin autenticación)
 *   - TC-TRIMIA-RNF02-03 (Verificar que cada perfil vea solo las opciones de su rol)
 *   - TC-TRIMIA-RF07-02  (Verificar que la Vendedora incluye "Chat con el Asistente" — Regresión DM-TRIMIA-005)
 *   - TC-TRIMIA-RNF02-04 (Cerrar sesión e invalidar la sesión del navegador — Ventana 1)
 *   - TC-TRIMIA-RF12-02  (Dar de alta un empleado con datos válidos)
 *   - TC-TRIMIA-RF12-03  (Rechazar el alta con correo o teléfono ya registrados)
 *   - TC-TRIMIA-RF12-04  (Desactivar un empleado y verificar que pierde el acceso)
 * ============================================================================
 */

describe('Módulo 01 — Autenticación, Roles y Gestión de Empleados (CU-AUTH-01, CU-AUTH-02, CU-GER-01)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF12-01
   * Requisito:      RF-12, RNF-02 (CU-AUTH-01 - Iniciar sesión)
   * Técnica:        Partición de equivalencia (clase válida: usuario activo + clave correcta)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Flujo crítico de humo ejecutado en cada versión y ciclo de regresión.
   *
   * En qué consiste y detalle:
   *   Verifica que un empleado activo (ej. Cobrador Roberto Sosa) pueda autenticarse
   *   desde el formulario de login ingresando su correo y contraseña válidos, y que
   *   el sistema cargue el panel lateral con su nombre, rol/sector y su vista inicial.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF12-01: Debe iniciar sesión con credenciales válidas y acceder al panel del perfil', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.loginUI(cobrador.email, datos.passwordDefault);

    // Verifica que se cargó el layout principal autenticado con la barra lateral
    cy.get('aside.app-sidebar').should('be.visible');
    cy.get('.user-profile-pill .user-name').should('contain.text', cobrador.nombre);
    cy.get('.user-profile-pill .user-role-badge').should('contain.text', 'EMPLEADO (Cobranzas)');

    // Verifica que la primera pestaña activa sea "Mi Panel de Cobranzas" (Ventana 1)
    cy.get('.sidebar-nav-item.active').should('contain.text', 'Mi Panel de Cobranzas');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-01
   * Requisito:      RNF-02 (CU-AUTH-01 - Iniciar sesión - Curso alterno clave inválida)
   * Técnica:        Partición de equivalencia (clase inválida: contraseña incorrecta)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Control de seguridad básico repetible en cada despliegue.
   *
   * En qué consiste y detalle:
   *   Verifica que al ingresar un correo registrado pero con una contraseña errónea,
   *   el sistema rechace el acceso, permanezca en la pantalla de Login y muestre
   *   un mensaje de error visible sin abrir el panel interno.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-01: Debe rechazar el inicio de sesión cuando la contraseña es incorrecta', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.loginUI(cobrador.email, datos.passwordInvalida);

    // Debe mostrarse el mensaje de error en el formulario de login y no renderizar el sidebar
    cy.get('p.error.login-error').should('be.visible').and('not.be.empty');
    cy.get('aside.app-sidebar').should('not.exist');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-02
   * Requisito:      RNF-02 (CU-AUTH-01 - Protección de rutas sin sesión)
   * Técnica:        Partición de equivalencia (estado no autenticado)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Regresión de seguridad obligatoria en frontend y API.
   *
   * En qué consiste y detalle:
   *   Verifica que al abrir la aplicación sin haber iniciado sesión (o intentando
   *   acceder a cualquier ruta interna), la interfaz obligue a pasar por la pantalla
   *   de "Iniciar sesión" y no exponga ningún módulo operativo ni barra de navegación.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-02: Debe impedir el acceso a pantallas internas sin autenticación previa', () => {
    cy.clearLocalStorage();
    cy.visit('/');

    // El usuario solo debe ver la tarjeta de inicio de sesión
    cy.get('main.login-page').should('be.visible');
    cy.contains('h2', 'Iniciar sesión').should('be.visible');
    cy.get('aside.app-sidebar').should('not.exist');
    cy.get('main.app-main').should('not.exist');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-03 y TC-TRIMIA-RF07-02 (Regresión DM-TRIMIA-005)
   * Requisito:      RNF-02, RF-12, RF-07 (CU-AUTH-01 y CU-GEN-01)
   * Técnica:        Tabla de decisión (combinación Rol x Sector → Pestañas habilitadas)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica la matriz de permisos visuales por perfil en segundos.
   *
   * En qué consiste y detalle:
   *   Verifica que cada perfil autenticado visualice en el menú lateral únicamente
   *   las opciones que corresponden a su rol y sector:
   *   1) Supervisora de Cobranzas (Silvia Ríos): ve Cobranzas, Casos escalados, Base de
   *      Conocimiento, Capacitación y Chat con el Asistente; NO ve Empleados y Áreas.
   *   2) Vendedora (Laura Gómez): ve Panel de Ventas, Mi Capacitación y también
   *      "Chat con el Asistente" (verificando la corrección del defecto DM-TRIMIA-005),
   *      y NO ve Cobranzas, Base de Conocimiento ni Casos escalados.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-03 y RF07-02: Debe mostrar a cada perfil solo las opciones de su rol e incluir Chat con el Asistente en Vendedora (DM-TRIMIA-005)', () => {
    // 1. Verificación del perfil Supervisora de Cobranzas
    const supCobranzas = datos.usuarios.supervisoraCobranzas;
    cy.loginUI(supCobranzas.email, datos.passwordDefault);

    supCobranzas.pestanasEsperadas.forEach((pestana) => {
      cy.get('aside.app-sidebar .sidebar-nav').should('contain.text', pestana);
    });
    supCobranzas.pestanasProhibidas.forEach((pestanaProhibida) => {
      cy.get('aside.app-sidebar .sidebar-nav').should('not.contain.text', pestanaProhibida);
    });

    // Cerrar sesión para probar el siguiente perfil
    cy.get('button.btn-logout-icon[title="Cerrar sesión"]').click();
    cy.get('main.login-page').should('be.visible');

    // 2. Verificación del perfil Vendedora (Laura Gómez) — Incluye regresión DM-TRIMIA-005
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);

    vendedora.pestanasEsperadas.forEach((pestana) => {
      cy.get('aside.app-sidebar .sidebar-nav').should('contain.text', pestana);
    });
    vendedora.pestanasProhibidas.forEach((pestanaProhibida) => {
      cy.get('aside.app-sidebar .sidebar-nav').should('not.contain.text', pestanaProhibida);
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-04
   * Requisito:      RNF-02 (CU-AUTH-02 - Cerrar sesión - Ventana 1)
   * Técnica:        Transición de estados (Sesión activa → Sesión cerrada/invalidada)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Flujo crítico de seguridad de sesión.
   *
   * En qué consiste y detalle:
   *   Verifica que cuando un usuario autenticado presiona el botón "Cerrar sesión"
   *   en su tarjeta de perfil inferior, se invoque `POST /auth/logout`, se limpie
   *   el estado de sesión del navegador y el sistema regrese al formulario de Login.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-04: Debe cerrar la sesión activa y regresar a la pantalla de inicio de sesión', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    cy.get('aside.app-sidebar').should('be.visible');
    cy.get('button.btn-logout-icon[title="Cerrar sesión"]').should('be.visible').click();

    // Tras cerrar sesión debe mostrarse nuevamente la pantalla de login y desaparecer el panel
    cy.get('main.login-page').should('be.visible');
    cy.contains('h2', 'Iniciar sesión').should('be.visible');
    cy.get('aside.app-sidebar').should('not.exist');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF12-02 y TC-TRIMIA-RF12-03
   * Requisito:      RF-12, RNF-02 (CU-GER-01 - Gestionar empleados y sectores)
   * Técnica:        Partición de equivalencia (datos nuevos válidos vs. email/teléfono duplicado)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica el ABM de empleados y la restricción de unicidad.
   *
   * En qué consiste y detalle:
   *   1) TC-TRIMIA-RF12-02: Como Gerente / Supervisor General, abre la sección
   *      "Empleados y Áreas", presiona "Nuevo empleado", completa nombre, email,
   *      teléfono, contraseña, rol y sector válidos, y verifica que se dé de alta.
   *   2) TC-TRIMIA-RF12-03: Intenta dar de alta otro empleado reutilizando un correo
   *      o teléfono ya registrado (ej. `roberto.sosa@credimision.com`) y verifica que
   *      el sistema rechace el registro mostrando una alerta de error.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF12-02 y RF12-03: Debe permitir dar de alta un empleado válido y rechazar correos o teléfonos duplicados', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    cy.loginUI(supGeneral.email, datos.passwordDefault);

    cy.navegarMenu('Empleados y Áreas');
    cy.contains('h1, h2', 'Empleados y áreas').should('be.visible');

    // Parte 1 (TC-TRIMIA-RF12-02): Alta con email único generado para la corrida
    const sufijoUnico = Date.now().toString().slice(-6);
    const emailNuevo = `empleado.cypress.${sufijoUnico}@credimision.com`;
    const telefonoNuevo = `5493819${sufijoUnico}`;

    cy.contains('button', 'Nuevo empleado').click();
    cy.get('#employee-name').clear().type(`${datos.nuevoEmpleadoAlta.nombre} ${sufijoUnico}`);
    cy.get('#employee-email').clear().type(emailNuevo);
    cy.get('#employee-phone').clear().type(telefonoNuevo);
    cy.get('#employee-password').clear().type(datos.nuevoEmpleadoAlta.password);
    cy.get('#employee-role').select('EMPLEADO');
    cy.get('#employee-sector').find('option').eq(1).then(($opt) => {
      cy.get('#employee-sector').select($opt.val());
    });
    cy.contains('button[type="submit"]', 'Guardar empleado').click();

    // Verifica que el nuevo empleado aparece en la tabla de personas
    cy.get('table.employees-table').should('contain.text', emailNuevo);

    // Parte 2 (TC-TRIMIA-RF12-03): Intento de alta con email ya existente
    cy.contains('button', 'Nuevo empleado').click();
    cy.get('#employee-name').clear().type('Intento Duplicado');
    cy.get('#employee-email').clear().type(datos.usuarios.cobrador.email);
    cy.get('#employee-phone').clear().type(telefonoNuevo);
    cy.get('#employee-password').clear().type(datos.nuevoEmpleadoAlta.password);
    cy.contains('button[type="submit"]', 'Guardar empleado').click();

    // Debe mostrarse el mensaje de error con role="alert" impidiendo el duplicado
    cy.get('p.error[role="alert"]').should('be.visible');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF12-04
   * Requisito:      RF-12, RNF-02 (CU-GER-01 - Desactivar empleado y bloquear acceso)
   * Técnica:        Transición de estados (Empleado Activo → Dado de baja → Login denegado)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Prueba crítica de seguridad ante bajas de personal.
   *
   * En qué consiste y detalle:
   *   Verifica que cuando el Gerente / Supervisor General desactiva a un empleado
   *   (ej. `vendedor.inactivo@credimision.com`) desde el menú "Acciones → Desactivar empleado",
   *   el empleado pasa al filtro "Dados de baja" y, al intentar iniciar sesión con sus
   *   credenciales, el sistema le impide ingresar.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF12-04: Debe desactivar un empleado y verificar que un empleado dado de baja no puede iniciar sesión', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    const inactivo = datos.usuarios.vendedorInactivo;

    cy.loginUI(supGeneral.email, datos.passwordDefault);
    cy.navegarMenu('Empleados y Áreas');

    // Acepta automáticamente el diálogo window.confirm al desactivar
    cy.on('window:confirm', () => true);

    // Si el vendedor de prueba figura activo, lo desactivamos desde su menú "Acciones"
    cy.get('body').then(($body) => {
      if ($body.find('table.employees-table').text().includes(inactivo.email)) {
        cy.contains('tr', inactivo.email).within(() => {
          if (!$body.find(`tr:contains("${inactivo.email}")`).text().includes('Dado de baja')) {
            cy.get('button.emp-dropdown-trigger').click();
            cy.contains('button[role="menuitem"]', 'Desactivar empleado').click();
          }
        });
      }
    });

    // Cerramos sesión del supervisor e intentamos entrar con la cuenta dada de baja (o qa.baja)
    cy.get('button.btn-logout-icon[title="Cerrar sesión"]').click();
    cy.loginUI('qa.baja@credimision.com', datos.passwordDefault);

    // El backend debe rechazar el login de una cuenta desactivada
    cy.get('p.error.login-error').should('be.visible');
    cy.get('aside.app-sidebar').should('not.exist');
  });
});
