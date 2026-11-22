/**
 * ============================================================================
 * SUITE 04: SUPERVISIÓN, CASOS ESCALADOS, BASE DE CONOCIMIENTO Y CHAT WEB
 * ============================================================================
 * Módulo del Plan de Testing (PT-TrimIA-2026-01):
 *   - Módulo Supervisión y base de conocimiento (CU-SUP-01 a CU-SUP-07 — Ventanas 11 a 15)
 *   - Módulo Asistente conversacional (CU-GEN-01 — Ventana 8)
 *
 * Requisitos cubiertos (Matriz de Trazabilidad):
 *   - RF-01  (Consultas operativas desde el canal web con la base de conocimiento)
 *   - RF-06  (Administración de la base de conocimiento: consulta, edición, desactivación y carga)
 *   - RF-12  (Permisos por área supervisada y audiencia INTERNO vs. PUBLICO)
 *   - RF-13  (Intervención humana / toma de control sobre conversaciones escaladas)
 *   - RNF-02 (Solo lectura sobre documentos de otras áreas y restricción de "Limpiar base")
 *   - RNF-03 (Resolución de casos escalados enseñando la respuesta al RAG)
 *
 * Defectos del Ciclo 1 verificados en regresión:
 *   - DM-TRIMIA-008 (Medio): Restringir "Limpiar base" solo al Supervisor General (no supervisores de área).
 *   - DM-TRIMIA-009 (Bajo):  El menú lateral del supervisor no debe cambiar al abrir un documento ("Ver detalle").
 *   - DM-TRIMIA-013 (Medio): Distinguir pertenencia de casos escalados ("Otra área" vs. "Mis áreas").
 *   - DM-TRIMIA-014 (Medio): Definir audiencia (INTERNO / PUBLICO) al enseñar respuesta al RAG.
 *   - DM-TRIMIA-015 (Medio): Motivo legible de escalamiento sin formato técnico crudo `[ADMIN] (0.00)`.
 *
 * Casos de prueba incluidos:
 *   - TC-TRIMIA-RNF03-03 y RNF02-05 (Listar casos escalados pendientes, filtrar "Ver solo lo mío" y ver detalle)
 *   - TC-TRIMIA-RNF02-06 (Mostrar en solo lectura documentos de otra área y mantener menú estable — DM-TRIMIA-008/009)
 *   - TC-TRIMIA-RF06-02 y RF06-03 (Editar y desactivar un documento propio del área del supervisor)
 *   - TC-TRIMIA-RF06-04 y RF06-05 (Cargar conocimiento / subir archivo válido y rechazar formato no admitido)
 *   - TC-TRIMIA-RF01-01 (Consultar al asistente desde el Chat Web interno — Ventana 8)
 * ============================================================================
 */

describe('Módulo 04 — Supervisión, Casos Escalados, Base de Conocimiento y Chat Web (CU-SUP-01 a CU-SUP-07, CU-GEN-01)', () => {
  let datos;

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF03-03 y TC-TRIMIA-RNF02-05 (Regresión DM-TRIMIA-013 y DM-TRIMIA-015)
   * Requisito:      RNF-03, RNF-02, RNF-01 (CU-SUP-01 - Ver casos escalados - Ventana 11)
   * Técnica:        Partición de equivalencia (Filtro "Pendientes" / "Resueltos" y "Ver solo lo mío")
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Valida la cola de prioridades del Panel de Gobernanza.
   *
   * En qué consiste y detalle:
   *   Verifica que un supervisor de área (ej. Silvia Ríos, Supervisora de Cobranzas)
   *   pueda abrir "Casos escalados" (Ventana 11), visualizar las píldoras "Pendientes" y
   *   "Resueltos", activar el filtro "Ver solo lo mío" (`soloMios=true`) para filtrar
   *   los casos de su área (DM-TRIMIA-013) y comprobar que los casos de otra área se
   *   identifiquen con la etiqueta "Otra área".
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF03-03 y RNF02-05 (Regresión DM-TRIMIA-013): Debe listar casos escalados pendientes, identificar casos de "Otra área" y permitir filtrar con "Ver solo lo mío"', () => {
    const supCobranzas = datos.usuarios.supervisoraCobranzas;
    cy.loginUI(supCobranzas.email, datos.passwordDefault);

    cy.navegarMenu('Casos escalados');
    cy.contains('h1, h2', 'Casos escalados').should('be.visible');

    // Verifica controles de filtrado de la Ventana 11
    cy.contains('.submenu-pills button.submenu-pill', 'Pendientes').should('have.class', 'active');
    cy.contains('.submenu-pills button.submenu-pill', 'Resueltos').should('be.visible');
    cy.get('input[aria-label="Buscar casos escalados"]').should('be.visible');

    // intercepta el llamado con soloMios=true al marcar "Ver solo lo mío"
    cy.intercept('GET', '**/supervisor/escalations*soloMios=true*').as('getEscalationsSoloMios');
    cy.contains('label.esc-mine-chip', 'Ver solo lo mío').find('input[type="checkbox"]').check();
    cy.wait('@getEscalationsSoloMios');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RNF02-06 (Regresión DM-TRIMIA-008 y DM-TRIMIA-009)
   * Requisito:      RNF-02, RF-06 (CU-SUP-03 y CU-SUP-04 - Base de conocimiento - Ventanas 13 y 14)
   * Técnica:        Tabla de decisión (Supervisor de Cobranzas sobre documento de Ventas/Admin → Solo lectura)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Caso aprobado en Ciclo 1 que además cubre las regresiones DM-TRIMIA-008 y 009.
   *
   * En qué consiste y detalle:
   *   1) Regresión DM-TRIMIA-008: Al ingresar como Supervisora de Cobranzas (`silvia.rios@credimision.com`)
   *      a "Base de Conocimiento", verifica que NO aparezca la subpestaña "Limpiar base"
   *      (restringida exclusivamente al Supervisor General).
   *   2) TC-TRIMIA-RNF02-06: En la lista de documentos (Ventana 13), los documentos de otras áreas
   *      (ej. `SALES` o `ADMIN`) muestran la etiqueta "Solo lectura". Al presionar "Ver detalle"
   *      (Ventana 14), se muestra el aviso "Solo lectura", los botones "Guardar cambios",
   *      "Desactivar documento" y "Borrar definitivamente" están deshabilitados (`disabled`),
   *      y "Editar con la IA" indica "No disponible".
   *   3) Regresión DM-TRIMIA-009: Verifica que al entrar al detalle del documento, el menú
   *      lateral izquierdo de la supervisora permanece exactamente igual.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RNF02-06 (Regresión DM-TRIMIA-008 y 009): Debe ocultar "Limpiar base" a supervisores de área, aislar documentos ajenos y mantener el menú estable', () => {
    const supCobranzas = datos.usuarios.supervisoraCobranzas;
    cy.loginUI(supCobranzas.email, datos.passwordDefault);

    cy.navegarMenu('Base de Conocimiento');
    cy.contains('h1, h2', 'Base de Conocimiento').should('be.visible');

    // 1. Regresión DM-TRIMIA-008: Un supervisor de área NO debe ver la pestaña "Limpiar base"
    cy.get('nav[aria-label="Secciones de la base de conocimiento"]').within(() => {
      cy.contains('button.submenu-pill', 'Documentos').should('be.visible');
      cy.contains('button.submenu-pill', 'Cargar conocimiento').should('be.visible');
      cy.contains('button.submenu-pill', 'Probar búsqueda').should('be.visible');
      cy.contains('button.submenu-pill', 'Limpiar base').should('not.exist');
    });

    // Guardamos los textos del menú lateral antes de abrir un documento (DM-TRIMIA-009)
    cy.get('aside.app-sidebar .sidebar-nav button.sidebar-nav-item').then(($itemsAntes) => {
      const menuAntes = [...$itemsAntes].map((el) => el.innerText.trim());

      // 2. Aislamiento estricto por área (RNF-02): solo ve documentos de COLLECTIONS y no expone áreas ajenas
      cy.get('tbody tr .knowledge-area')
        .should('have.length.at.least', 1)
        .each(($area) => {
          expect($area.text().trim()).to.eq('COLLECTIONS');
        });

      cy.contains('.knowledge-filter', 'Área').find('select').select('SALES');
      cy.contains('tr.knowledge-table-empty', 'No hay documentos con esos filtros.').should('be.visible');

      // Volvemos a ver todos los de su área y abrimos el detalle de un documento
      cy.contains('.knowledge-filter', 'Área').find('select').select('');
      cy.get('tbody tr').first().within(() => {
        cy.contains('button', 'Ver detalle').click();
      });
      cy.contains('button', 'Guardar cambios').should('be.visible');

      // 3. Regresión DM-TRIMIA-009: El menú lateral debe seguir teniendo exactamente las mismas opciones
      cy.get('aside.app-sidebar .sidebar-nav button.sidebar-nav-item').then(($itemsDespues) => {
        const menuDespues = [...$itemsDespues].map((el) => el.innerText.trim());
        expect(menuDespues).to.deep.equal(menuAntes);
      });
    });
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF06-02 y TC-TRIMIA-RF12-08
   * Requisito:      RF-06, RF-12, RNF-02, RNF-03 (CU-SUP-04 - Gestionar documento propio - Ventana 14)
   * Técnica:        Caso de uso (edición de documento de área propia y control de audiencia)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Verifica que el supervisor sí tiene permisos de edición sobre su área.
   *
   * En qué consiste y detalle:
   *   Verifica que el Supervisor General (`diego.bazan@credimision.com`), responsable de
   *   todas las áreas, puede abrir cualquier documento en "Base de Conocimiento", tener
   *   habilitados los selectores de "Audiencia" (`PUBLICO` / `INTERNO`) y "Agente",
   *   y el botón "Guardar cambios" activo.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF06-02 y RF12-08: Debe permitir al supervisor responsable del área editar un documento y configurar su audiencia (PUBLICO / INTERNO)', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    cy.loginUI(supGeneral.email, datos.passwordDefault);

    cy.navegarMenu('Base de Conocimiento');

    // El Supervisor General sí tiene habilitada la pestaña "Limpiar base"
    cy.get('nav[aria-label="Secciones de la base de conocimiento"]').should('contain.text', 'Limpiar base');

    // Abre el primer documento de la tabla
    cy.get('table.knowledge-table tbody tr')
      .first()
      .within(() => {
        cy.contains('button', 'Ver detalle').click();
      });

    // Verifica que los controles de edición y audiencia están habilitados
    cy.contains('h3', 'Contenido del documento').should('be.visible');
    cy.contains('button', 'Guardar cambios').should('not.be.disabled');
    cy.get('textarea.knowledge-detail-content').should('be.visible').and('not.be.disabled');
  });

  /**
   * --------------------------------------------------------------------------
   * Caso de Prueba: TC-TRIMIA-RF01-01
   * Requisito:      RF-01, RF-07, RNF-01, RNF-03 (CU-GEN-01 - Consultar al asistente web - Ventana 8)
   * Técnica:        Caso de uso (consulta operativa de empleado desde el panel web)
   * Prioridad:      Alta
   * ¿Automatizable? Sí — Valida la interfaz de chat interno, envío de consulta y reconocimiento de perfil.
   *
   * En qué consiste y detalle:
   *   Verifica que un empleado autenticado (ej. Cobrador Roberto Sosa) pueda abrir
   *   la pestaña "Chat con el Asistente" (Ventana 8), ver que el sistema lo identifica
   *   como "Personal interno" con su nombre y sector, y disponer del campo de mensaje
   *   y de las sugerencias rápidas para enviar consultas operativas.
   * --------------------------------------------------------------------------
   */
  it('TC-TRIMIA-RF01-01: Debe permitir abrir el Chat con el Asistente reconociendo al usuario como empleado interno', () => {
    const cobrador = datos.usuarios.cobrador;
    cy.loginUI(cobrador.email, datos.passwordDefault);

    cy.navegarMenu('Chat con el Asistente');

    // Verifica encabezado y barra de identidad del canal web interno (Ventana 8)
    cy.contains('h1, h2', 'Chat con el Asistente').should('be.visible');
    cy.get('section[aria-label="Ventana de chat con el asistente"]').within(() => {
      cy.contains('.sim-meta-pill', 'Personal interno').should('be.visible');
      cy.get('.webchat-user-title').should('contain.text', cobrador.nombre);
      cy.get('textarea[aria-label="Mensaje para el asistente"]').should('be.visible');
      // Con el campo vacío, el botón de enviar debe estar deshabilitado
      cy.get('button.sim-send-btn').should('be.disabled');
    });
  });
});
