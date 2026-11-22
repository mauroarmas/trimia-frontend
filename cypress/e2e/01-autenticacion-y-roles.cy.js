/**
 * ============================================================================
 * SUITE 01: AUTENTICACIÓN, MATRIZ DE ROLES/SECTORES Y GESTIÓN DE PERSONAL
 * ============================================================================
 * Plan de Testing PT-TrimIA-2026-01 — Módulos Autenticación y Administración:
 *   - CU-AUTH-01 (Iniciar sesión), CU-AUTH-02 (Cerrar sesión), CU-GER-01 (ABM empleados)
 *   - Requisitos: RF-07, RF-12, RNF-02
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RF12-01  Login válido y redirección al panel/subpestaña por rol
 *   - TC-TRIMIA-RNF02-01 Rechazo de inicio de sesión con contraseña inválida
 *   - TC-TRIMIA-RNF02-02 Protección de rutas internas sin sesión (/panel/*)
 *   - TC-TRIMIA-RNF02-03 Matriz de permisos visuales (Supervisor General, Sup. Área, Ventas, Admin)
 *   - TC-TRIMIA-RF07-02  Acceso transversal de empleados a "Chat con el Asistente" (DM-TRIMIA-005)
 *   - TC-TRIMIA-RNF02-04 Cierre de sesión UI + revocación real del JWT en backend
 *   - TC-TRIMIA-RF12-02/03/04 Ciclo completo ABM: alta → rechazo duplicado → baja → bloqueo de login
 * ============================================================================
 */

describe('Módulo 01 — Autenticación, Roles y Gestión de Empleados (CU-AUTH-01, CU-AUTH-02, CU-GER-01)', () => {
  let datos;
  const apiUrl = Cypress.expose('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RF12-01: Debe iniciar sesión con credenciales válidas y abrir el panel inicial del Cobrador en Mis Clientes', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.loginUI(cobrador.email, datos.passwordDefault);

    cy.get('aside.app-sidebar').should('be.visible');
    cy.get('.user-profile-pill .user-name').should('contain.text', cobrador.nombre);
    cy.get('.user-profile-pill .user-role-badge').should('contain.text', 'EMPLEADO (Cobranzas)');
    cy.get('.sidebar-nav-item.active').should('contain.text', 'Mi Panel de Cobranzas');

    // Regresión de enrutamiento: un Cobrador debe aterrizar directamente en su cartera ("Mis Clientes")
    cy.location('pathname').should('include', '/panel/cobranzas/clientes');
    cy.get('section.collection-portfolio').should('be.visible');
  });

  it('TC-TRIMIA-RNF02-01: Debe rechazar el inicio de sesión con contraseña incorrecta sin exponer el panel', () => {
    const cobrador = datos.usuarios.cobrador;

    cy.loginUI(cobrador.email, datos.passwordInvalida);

    cy.get('p.error.login-error').should('be.visible').and('not.be.empty');
    cy.get('aside.app-sidebar').should('not.exist');
  });

  it('TC-TRIMIA-RNF02-02: Debe bloquear acceso directo a rutas internas (/panel/supervisor, /panel/empleados) sin autenticación', () => {
    cy.clearLocalStorage();
    ['/panel/supervisor', '/panel/empleados', '/panel/financiacion'].forEach((ruta) => {
      cy.visit(ruta);
      cy.get('main.login-page').should('be.visible');
      cy.contains('h2', 'Iniciar sesión').should('be.visible');
      cy.get('aside.app-sidebar').should('not.exist');
      cy.get('main.app-main').should('not.exist');
    });
  });

  it('TC-TRIMIA-RNF02-03 y RF07-02: Debe respetar la matriz de permisos por rol y sector (Supervisor General, Cobranzas, Ventas y Administración)', () => {
    const perfiles = [
      datos.usuarios.supervisorGeneral,
      datos.usuarios.supervisoraCobranzas,
      datos.usuarios.vendedora,
      datos.usuarios.administrativa,
    ];

    perfiles.forEach((perfil) => {
      cy.loginUI(perfil.email, datos.passwordDefault);
      cy.get('aside.app-sidebar').should('be.visible');
      cy.get('.user-profile-pill .user-name').should('contain.text', perfil.nombre);

      perfil.pestanasEsperadas.forEach((pestana) => {
        cy.get('aside.app-sidebar .sidebar-nav').should('contain.text', pestana);
      });

      (perfil.pestanasProhibidas || []).forEach((prohibida) => {
        cy.get('aside.app-sidebar .sidebar-nav').should('not.contain.text', prohibida);
      });

      cy.get('button.btn-logout-icon[title="Cerrar sesión"]').click();
      cy.get('main.login-page').should('be.visible');
    });
  });

  it('TC-TRIMIA-RNF02-04: Debe cerrar sesión limpiando el navegador y revocando el JWT en el servidor', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);
    cy.get('aside.app-sidebar').should('be.visible');

    // Capturamos el token activo antes de cerrar sesión para verificar revocación real en backend
    cy.window().then((win) => {
      const tokenPrevio = win.localStorage.getItem('trimia_token') || win.localStorage.getItem('token');

      cy.intercept('POST', '**/auth/logout').as('logoutReq');
      cy.get('button.btn-logout-icon[title="Cerrar sesión"]').should('be.visible').click();
      cy.wait('@logoutReq').its('response.statusCode').should('be.oneOf', [200, 204]);

      cy.get('main.login-page').should('be.visible');
      cy.get('aside.app-sidebar').should('not.exist');

      if (tokenPrevio) {
        cy.request({
          method: 'GET',
          url: `${apiUrl}/auth/me`,
          headers: { Authorization: `Bearer ${tokenPrevio}` },
          failOnStatusCode: false,
        })
          .its('status')
          .should('eq', 401);
      }
    });
  });

  it('TC-TRIMIA-RF12-02, RF12-03 y RF12-04: Ciclo completo de empleado (alta → rechazo duplicado → desactivación → bloqueo de acceso)', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    const sufijo = Date.now().toString().slice(-6);
    const nombreNuevo = `${datos.nuevoEmpleadoAlta.nombre} ${sufijo}`;
    const emailNuevo = `cypress.abm.${sufijo}@credimision.com`;
    const telefonoNuevo = `5493818${sufijo}`;

    cy.loginUI(supGeneral.email, datos.passwordDefault);
    cy.navegarMenu('Empleados y Áreas');
    cy.contains('h1, h2', 'Empleados y áreas').should('be.visible');

    // 1. Alta válida (TC-TRIMIA-RF12-02)
    cy.contains('button', 'Nuevo empleado').click();
    cy.get('#employee-name').clear().type(nombreNuevo);
    cy.get('#employee-email').clear().type(emailNuevo);
    cy.get('#employee-phone').clear().type(telefonoNuevo);
    cy.get('#employee-password').clear().type(datos.nuevoEmpleadoAlta.password);
    cy.get('#employee-role').select('EMPLEADO');
    cy.get('#employee-sector')
      .find('option')
      .eq(1)
      .then(($opt) => {
        cy.get('#employee-sector').select($opt.val());
      });
    cy.contains('button[type="submit"]', 'Guardar empleado').click();

    cy.get('table.employees-table').should('contain.text', emailNuevo);

    // 2. Rechazo por email duplicado (TC-TRIMIA-RF12-03)
    cy.contains('button', 'Nuevo empleado').click();
    cy.get('#employee-name').clear().type('Intento Correo Duplicado');
    cy.get('#employee-email').clear().type(emailNuevo);
    cy.get('#employee-phone').clear().type(`5493817${sufijo}`);
    cy.get('#employee-password').clear().type(datos.nuevoEmpleadoAlta.password);
    cy.contains('button[type="submit"]', 'Guardar empleado').click();
    cy.get('p.error[role="alert"]').should('be.visible');
    cy.contains('button', 'Cancelar').click();

    // 3. Desactivación del mismo empleado recién creado (TC-TRIMIA-RF12-04)
    cy.on('window:confirm', () => true);
    cy.contains('table.employees-table tr', emailNuevo).within(() => {
      cy.get('button.emp-dropdown-trigger').click();
    });
    cy.contains('button[role="menuitem"]', 'Desactivar empleado').click();

    // Al desactivarse, desaparece de los activos o queda marcado como dado de baja
    cy.get('button.btn-logout-icon[title="Cerrar sesión"]').click();
    cy.get('main.login-page').should('be.visible');

    // 4. Intento de login con el empleado dado de baja → debe rechazarse (UI y API)
    cy.loginUI(emailNuevo, datos.nuevoEmpleadoAlta.password);
    cy.get('p.error.login-error').should('be.visible');
    cy.get('aside.app-sidebar').should('not.exist');

    cy.loginAPI(emailNuevo, datos.nuevoEmpleadoAlta.password)
      .its('status')
      .should('eq', 401);
  });
});
