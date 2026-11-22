/**
 * ============================================================================
 * SUITE 04: ESCALADO DE CONSULTAS (CONTROL MANUAL + IA) Y BASE DE CONOCIMIENTO (RAG)
 * ============================================================================
 * Plan de Testing PT-TrimIA-2026-01 — Módulo Supervisión y Base de Conocimiento:
 *   - CU-GEN-06 (Escalar consulta), CU-SUP-01 (Ver escalados), CU-SUP-02 (Resolver / Tomar control)
 *   - CU-SUP-03/04/05 (Consultar, gestionar, cargar y probar búsqueda RAG en Base de Conocimiento)
 *   - Requisitos: RF-06, RF-12, RNF-01, RNF-02, RNF-03
 *   - Regresiones: DM-TRIMIA-008, 009, 013
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RNF03-03 / RNF02-05 (DM-TRIMIA-013) Cola de escalados y filtro "Ver solo lo mío"
 *   - TC-TRIMIA-RNF03-E2E-RESOLVER Escalado real de cliente → notificación < 2 min → "Sugerir con IA" (Gemini) → "Enviar respuesta y resolver caso" → respuesta recibida por el cliente
 *   - TC-TRIMIA-SUP02-E2E-TAKEOVER Escalado real → "Tomar control" en vivo (IA pausada) → nota interna → mensaje manual → "Liberar control" → oferta post-liberación de generar doc con IA → retorno a estado ACTIVE
 *   - TC-TRIMIA-RNF02-06 (DM-TRIMIA-008 y 009) Aislamiento estricto por área en Base de Conocimiento
 *   - TC-TRIMIA-RF06-E2E-RAG Ciclo completo de documento (Alta INTERNO → Edición v2 → Desactivar/Reactivar → Diagnóstico RAG INTERNO recupera vs PUBLICO bloqueado → Borrado definitivo)
 * ============================================================================
 */

describe('Módulo 04 — Escalado de Consultas y Base de Conocimiento / RAG (CU-GEN-06, CU-SUP-01 a CU-SUP-05)', () => {
  let datos;
  const apiUrl = Cypress.expose('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RNF03-03 y RNF02-05 (Regresión DM-TRIMIA-013): Debe listar escalados y permitir filtrar por estado y "Ver solo lo mío"', () => {
    const supCobranzas = datos.usuarios.supervisoraCobranzas;
    cy.loginUI(supCobranzas.email, datos.passwordDefault);

    cy.navegarMenu('Casos escalados');
    cy.contains('h1, h2', 'Casos escalados').should('be.visible');

    cy.contains('button.submenu-pill', 'Pendientes').should('have.class', 'active');
    cy.contains('button.submenu-pill', 'Resueltos').should('be.visible');

    cy.contains('label.esc-mine-chip', 'Ver solo lo mío').within(() => {
      cy.get('input[type="checkbox"]').check({ force: true }).should('be.checked');
      cy.get('input[type="checkbox"]').uncheck({ force: true }).should('not.be.checked');
    });
  });

  it('TC-TRIMIA-RNF03-E2E-RESOLVER: Escalado real → "Sugerir con IA" → resolver enviando respuesta al cliente (< 2 min RNF-01)', () => {
    const sup = datos.usuarios.supervisorGeneral;
    const sufijo = Date.now().toString().slice(-6);
    const phone = `5493767${sufijo}`;
    const respuestaSupervisor = `Hola, te confirma Diego de Credimisión (caso ${sufijo}): para cambios especiales por garantía coordinamos revisión en sucursal dentro de las 48 horas hábiles.`;

    cy.getToken(sup.email, datos.passwordDefault).then((tokenSup) => {
      // 1. Disparamos un escalado real pidiendo hablar con un asesor humano
      cy.simularMensajeYEsperarRespuesta(tokenSup, {
        phone,
        message: `Necesito hablar urgentemente con un asesor humano por una excepción de garantía especial referencia ${sufijo}`,
      }).then((res) => {
        expect(res.durationMs, 'RNF-01: derivación notificada en < 2 minutos').to.be.lessThan(120000);
        const conversationId = res.conversationId;

        return cy.esperarEscaladoPendiente(tokenSup, { phone }).then((esc) => ({
          esc,
          conversationId,
        }));
      }).then(({ esc, conversationId }) => {
        expect(esc.status).to.eq('PENDING');

        // 2. Como Supervisor General, abrimos el caso en Casos escalados
        cy.loginUI(sup.email, datos.passwordDefault);
        cy.navegarMenu('Casos escalados');

        cy.contains('table.sup-modern-table tr', phone, { timeout: 15000 }).within(() => {
          cy.contains('button', 'Ver caso →').click();
        });

        cy.get('.esc-detail-view').should('be.visible');

        // 3. Probamos "Sugerir con IA" (modelo Gemini real)
        cy.intercept('GET', `**/supervisor/escalations/${esc.id}/suggestion`).as('suggestAi');
        cy.contains('button.esc-suggest-btn', 'Sugerir con IA').click();
        cy.wait('@suggestAi', { timeout: 35000 }).then(({ response }) => {
          expect(response.statusCode).to.be.oneOf([200, 201]);
          expect(response.body).to.not.equal(undefined);
        });

        // 4. Completamos la respuesta (sin ensuciar la KB en este test) y resolvemos
        cy.get('.esc-reply-textarea').clear().type(respuestaSupervisor);
        cy.get('.esc-teach-checkbox input[type="checkbox"]').then(($chk) => {
          if ($chk.is(':checked')) cy.wrap($chk).uncheck({ force: true });
        });

        cy.intercept('POST', `**/supervisor/escalations/${esc.id}/resolve`).as('resolveEsc');
        cy.contains('button.esc-submit-primary', 'Enviar respuesta y resolver caso').click();
        cy.wait('@resolveEsc').its('response.statusCode').should('be.oneOf', [200, 201]);

        // 5. Verificamos que el cliente recibió la respuesta en su hilo y el caso quedó resuelto
        cy.request({
          method: 'GET',
          url: `${apiUrl}/supervisor/conversations/${conversationId}`,
          headers: { Authorization: `Bearer ${tokenSup}` },
        }).then((convRes) => {
          const texts = (convRes.body.messages || []).map((m) => m.content).join('\n');
          expect(texts).to.include(`caso ${sufijo}`);
        });
      });
    });
  });

  it('TC-TRIMIA-SUP02-E2E-TAKEOVER: Tomar control en vivo (pausa IA), guardar nota interna, responder manualmente y liberar control con propuesta de conocimiento IA', () => {
    const sup = datos.usuarios.supervisorGeneral;
    const sufijo = (Date.now() + 13).toString().slice(-6);
    const phone = `5493768${sufijo}`;

    cy.getToken(sup.email, datos.passwordDefault).then((tokenSup) => {
      // 1. Disparamos un escalado real solicitando atención humana
      cy.simularMensajeYEsperarRespuesta(tokenSup, {
        phone,
        message: `Por favor quiero hablar con una persona humana para coordinar un envío especial #${sufijo}`,
      }).then((res) => {
        const conversationId = res.conversationId;
        return cy.esperarEscaladoPendiente(tokenSup, { phone }).then((esc) => ({
          esc,
          conversationId,
        }));
      }).then(({ conversationId }) => {
        cy.loginUI(sup.email, datos.passwordDefault);
        cy.navegarMenu('Casos escalados');

        cy.contains('table.sup-modern-table tr', phone, { timeout: 15000 }).within(() => {
          cy.contains('button', 'Ver caso →').click();
        });

        // 2. Cambiamos al tab "Tomar control" y abrimos el modal de control en vivo
        cy.contains('button[role="tab"]', 'Tomar control').click();
        cy.intercept('POST', `**/supervisor/conversations/${conversationId}/takeover`).as('takeoverReq');
        cy.get('button.conv-ctrl-takeover-btn').click();
        cy.wait('@takeoverReq').its('response.statusCode').should('be.oneOf', [200, 201]);

        // 3. Dentro del modal de control en vivo: nota interna + mensaje manual + liberar control
        cy.get('.esc-takeover-modal[role="dialog"]').should('be.visible').within(() => {
          cy.contains('CONTROL MANUAL EN VIVO').should('be.visible');

          // Agregar nota interna privada
          cy.intercept('POST', `**/supervisor/conversations/${conversationId}/notes`).as('addInternalNote');
          cy.contains('button', '+ Nota interna').click();
          cy.get('.esc-takeover-quick-note input')
            .type(`Nota interna privada Cypress ${sufijo}: envío coordinado con Logística.`);
          cy.contains('.esc-takeover-quick-note button[type="submit"]', 'Guardar nota').click();
          cy.wait('@addInternalNote').its('response.statusCode').should('be.oneOf', [200, 201]);
          cy.contains(/\+ Nota interna \([1-9]\d*\)/, { timeout: 10000 }).should('be.visible');

          // Enviar mensaje manual en vivo al cliente
          cy.get('.esc-takeover-composer textarea')
            .type(`Hola, te atiende Diego en vivo (ref ${sufijo}). Ya dejamos agendado tu envío.`);
          cy.contains('.esc-takeover-composer button[type="submit"]', 'Enviar mensaje').click();
          cy.contains('1 mensaje enviado en esta sesión', { timeout: 10000 }).should('be.visible');

          // Liberar control → pasa a etapa post-liberación ("¿Querés generar contenido con IA...?")
          cy.contains('.esc-takeover-composer-right button', 'Liberar control').click();

          cy.contains('h2', 'Control liberado', { timeout: 15000 }).should('be.visible');
          cy.contains('¿Querés generar contenido con IA para la Base de Conocimiento?').should('be.visible');
          cy.contains('button', 'Sí, generar documento con IA').should('be.visible');

          // Cerramos sin crear documento extra para mantener limpia la base
          cy.contains('button', 'No, cerrar').click();
        });

        // 4. Confirmamos que la conversación regresó al asistente automático (ACTIVE)
        cy.request({
          method: 'GET',
          url: `${apiUrl}/supervisor/conversations/${conversationId}`,
          headers: { Authorization: `Bearer ${tokenSup}` },
        }).then((convRes) => {
          expect(convRes.body.status).to.eq('ACTIVE');
          const texts = (convRes.body.messages || []).map((m) => m.content).join('\n');
          expect(texts).to.include(`ref ${sufijo}`);
        });
      });
    });
  });

  it('TC-TRIMIA-RNF02-06 (Regresión DM-TRIMIA-008 y 009): Debe ocultar "Limpiar base" a supervisores de área, aislar documentos ajenos y mantener el menú estable', () => {
    const supCobranzas = datos.usuarios.supervisoraCobranzas;
    cy.loginUI(supCobranzas.email, datos.passwordDefault);

    cy.navegarMenu('Base de Conocimiento');
    cy.contains('h1, h2', 'Base de Conocimiento').should('be.visible');

    // DM-TRIMIA-008: Supervisor de área NO ve "Limpiar base"
    cy.get('nav[aria-label="Secciones de la base de conocimiento"]').within(() => {
      cy.contains('button.submenu-pill', 'Documentos').should('be.visible');
      cy.contains('button.submenu-pill', 'Cargar conocimiento').should('be.visible');
      cy.contains('button.submenu-pill', 'Probar búsqueda').should('be.visible');
      cy.contains('button.submenu-pill', 'Limpiar base').should('not.exist');
    });

    cy.get('aside.app-sidebar .sidebar-nav button.sidebar-nav-item').then(($itemsAntes) => {
      const menuAntes = [...$itemsAntes].map((el) => el.innerText.trim());

      // Aislamiento estricto por área (RNF-02): solo documentos de COLLECTIONS
      cy.get('tbody tr .knowledge-area')
        .should('have.length.at.least', 1)
        .each(($area) => {
          expect($area.text().trim()).to.eq('COLLECTIONS');
        });

      cy.contains('.knowledge-filter', 'Área').find('select').select('SALES');
      cy.contains('tr.knowledge-table-empty', 'No hay documentos con esos filtros.').should('be.visible');

      // Volver a sus documentos, abrir detalle y comprobar que el menú lateral no cambia (DM-TRIMIA-009)
      cy.contains('.knowledge-filter', 'Área').find('select').select('');
      cy.get('tbody tr').first().within(() => {
        cy.contains('button', 'Ver detalle').click();
      });
      cy.contains('button', 'Guardar cambios').should('be.visible');

      cy.get('aside.app-sidebar .sidebar-nav button.sidebar-nav-item').then(($itemsDespues) => {
        const menuDespues = [...$itemsDespues].map((el) => el.innerText.trim());
        expect(menuDespues).to.deep.equal(menuAntes);
      });
    });
  });

  it('TC-TRIMIA-RF06-E2E-RAG: Ciclo de vida en Base de Conocimiento (Alta INTERNO → Edición v2 → RAG INTERNO vs bloqueo PUBLICO → Borrado limpio)', () => {
    const supGeneral = datos.usuarios.supervisorGeneral;
    const sufijo = Date.now().toString().slice(-6);
    const codigoUnico = `ZETA-${sufijo}`;
    const tituloDoc = `Protocolo Interno Cypress ${sufijo}`;
    const contenidoInicial = `Procedimiento interno exclusivo para vendedores de Credimisión código ${codigoUnico}: las bonificaciones corporativas por volumen requieren visto bueno gerencial previo a emitir la nota de pedido.`;

    cy.loginUI(supGeneral.email, datos.passwordDefault);
    cy.navegarMenu('Base de Conocimiento');

    // Supervisor General sí ve "Limpiar base"
    cy.get('nav[aria-label="Secciones de la base de conocimiento"]').should('contain.text', 'Limpiar base');

    // 1. Alta de documento INTERNO en SALES (CU-SUP-05)
    cy.contains('button.submenu-pill', 'Cargar conocimiento').click();
    cy.get('.knowledge-ingest-form').within(() => {
      cy.contains('.knowledge-filter', 'Título').find('input').clear().type(tituloDoc);
      cy.contains('.knowledge-filter', 'Audiencia').find('select').select('INTERNO');
      cy.contains('.knowledge-filter', 'Área / Agente asignado').find('select').select('SALES');
      cy.get('textarea[aria-label="Contenido del documento"]').clear().type(contenidoInicial);
    });

    cy.intercept('POST', '**/knowledge').as('ingestDoc');
    cy.contains('button.knowledge-primary-button', 'Guardar conocimiento').click();
    cy.wait('@ingestDoc', { timeout: 30000 }).its('response.statusCode').should('be.oneOf', [200, 201]);

    // 2. Buscar el documento recién creado, abrir detalle, editar (v2) y probar Desactivar/Reactivar (CU-SUP-04)
    cy.get('input[placeholder*="Buscar por título o contenido"]').clear().type(codigoUnico);
    cy.contains('tbody tr', tituloDoc, { timeout: 15000 }).within(() => {
      cy.contains('INTERNO').should('be.visible');
      cy.contains('button', 'Ver detalle').click();
    });

    cy.contains('.knowledge-hero-kicker', 'versión 1').should('be.visible');
    cy.get('textarea.knowledge-detail-content')
      .type(`\nAnexo actualizado ${codigoUnico}: vigencia 72 horas hábiles.`);

    cy.intercept('PUT', '**/knowledge/*').as('updateDoc');
    cy.contains('button', 'Guardar cambios').click();
    cy.wait('@updateDoc', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
    cy.contains('.knowledge-hero-kicker', 'versión 2', { timeout: 15000 }).should('be.visible');

    // Desactivar y Reactivar
    cy.on('window:confirm', () => true);
    cy.contains('button', 'Desactivar documento').click();
    cy.contains('button', 'Reactivar documento', { timeout: 15000 }).should('be.visible').click();
    cy.contains('button', 'Desactivar documento', { timeout: 15000 }).should('be.visible');

    // 3. Diagnóstico RAG ("Probar búsqueda") — Confidencialidad INTERNO vs PUBLICO (RF-12 / RNF-02)
    cy.contains('button', '← Volver').click();
    cy.contains('button.submenu-pill', 'Probar búsqueda').click();

    // Búsqueda como INTERNO → debe recuperar nuestro documento en ChromaDB
    cy.get('.knowledge-search-form').within(() => {
      cy.get('input').clear().type(`bonificaciones corporativas código ${codigoUnico}`);
      cy.contains('.knowledge-filter', 'Audiencia').find('select').select('INTERNO');
      cy.contains('.knowledge-filter', 'Agente').find('select').select('SALES');
      cy.contains('button[type="submit"]', 'Buscar').click();
    });
    cy.get('.knowledge-results', { timeout: 25000 }).should('contain.text', tituloDoc);

    // Misma búsqueda como PUBLICO → JAMÁS debe recuperar un documento INTERNO
    cy.get('.knowledge-search-form').within(() => {
      cy.contains('.knowledge-filter', 'Audiencia').find('select').select('PUBLICO');
      cy.contains('button[type="submit"]', 'Buscar').click();
    });
    cy.get('.knowledge-results', { timeout: 25000 }).should('not.contain.text', tituloDoc);

    // 4. Limpieza: borrar definitivamente el documento de prueba
    cy.contains('button.submenu-pill', 'Documentos').click();
    cy.get('input[placeholder*="Buscar por título o contenido"]').clear().type(codigoUnico);
    cy.contains('tbody tr', tituloDoc, { timeout: 15000 }).within(() => {
      cy.contains('button', 'Ver detalle').click();
    });

    cy.intercept('DELETE', '**/knowledge/*').as('deleteDoc');
    cy.contains('button', 'Borrar definitivamente').click();
    cy.wait('@deleteDoc', { timeout: 20000 }).its('response.statusCode').should('be.oneOf', [200, 204]);
  });
});
