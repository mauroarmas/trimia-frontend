/**
 * ============================================================================
 * SUITE 03: VENTAS, STOCK PALJET, RIESGO ONLINE Y FLUJO COMPLETO DE VENTA FINANCIADA
 * ============================================================================
 * Fuentes de negocio:
 *   - docs/negocio/Proceso_venta_financiada_MVP.md
 *   - docs/Documentos-De-Catedra-ProyectoFinal/plandetesting.md (CU-VEN-01..04, CU-ADM-01, CU-SUP-06)
 *   - Requisitos: RF-03, RF-08, RF-09, RF-10, RF-13, RI-01, RI-02, RI-03, RNF-02, RNF-04
 *
 * Casos cubiertos:
 *   - TC-TRIMIA-RF03-01  Bandeja de clientes derivados en Panel de Ventas
 *   - TC-TRIMIA-RF09-01/02 y RI01-01 Catálogo real de Paljet (Disponible / Bajo stock / Sin stock + sustitutos) y resiliencia ante caída 503
 *   - TC-TRIMIA-RF10-01/02 Simulación crediticia real (Riesgo Online simulado) resguardando Secreto Comercial (OE-10)
 *   - TC-TRIMIA-RF13-E2E-APROBACION Flujo completo real: conversación cliente IA → pedido PENDING_REVIEW sin escalar → aprobación humana + ofertas + cobrador → elección de 12 cuotas y retiro en chat → confirmación de resumen → cierre de venta + 12 cuotas en cartera + Ficha comercial
 *   - TC-TRIMIA-RF13-E2E-RECHAZO Flujo completo real de rechazo crediticio (DNI 90000021) con alternativa de contado y validación estricta de Secreto Comercial en el mensaje al cliente
 * ============================================================================
 */

describe('Módulo 03 — Ventas, Stock Paljet, Crédito y Flujo E2E de Venta Financiada (RF-03, RF-09, RF-10, RF-13)', () => {
  let datos;
  const apiUrl = Cypress.expose('apiUrl') || 'http://localhost:3000';

  before(() => {
    cy.fixture('datos_prueba').then((fixtureData) => {
      datos = fixtureData;
    });
  });

  it('TC-TRIMIA-RF03-01: Debe visualizar los clientes derivados por el asistente y la pestaña de Cierres de venta en Panel de Ventas', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.cerrarModalBienvenidaSiExiste();

    cy.contains('h1, h2', 'Panel de Ventas').should('be.visible');
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Clientes por contactar')
      .should('be.visible')
      .and('have.class', 'active');
    cy.contains('h3', 'Prospectos comerciales derivados por el Asistente').should('be.visible');
    cy.get('input[placeholder*="Buscar cliente, teléfono, negocio o producto"]').should('be.visible');

    // Subpestaña Cierres de venta accesible para vendedora
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Cierres de venta').click();
    cy.contains('h3', 'Cierres de venta').should('be.visible');
  });

  it('TC-TRIMIA-RF09-01, RF09-02 y RI01-01: Debe consultar stock real de Paljet (Disponible, Sin stock con sustitutos) y resistir una falla HTTP 503 sin bloquear el panel', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.cerrarModalBienvenidaSiExiste();

    // 1. Consulta real contra el catálogo Paljet del backend
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Consultar stock (Paljet)').click();
    cy.contains('h3', 'Inventario y disponibilidad en Paljet').should('be.visible');

    // Producto con stock disponible del catálogo real
    cy.contains('tr', datos.catalogoPaljet.balanzaCuora.nombre).within(() => {
      cy.get('.sales-stock-pill.is-ok').should('contain.text', 'Disponible');
    });

    // Producto sin stock (0 u.) en rojo con chips de sustitutos con stock (RF-09)
    cy.contains('tr', datos.catalogoPaljet.cortadoraSinStock.nombre).within(() => {
      cy.get('.sales-stock-pill.is-out').should('contain.text', 'Sin stock (0 u.)');
      cy.contains('.sales-substitutes-row', 'Sustitutos con stock:').should('be.visible');
      cy.contains('button.sales-sub-sku-chip', datos.catalogoPaljet.cortadoraSinStock.sustitutoSku).should('be.visible');
    });

    // 2. Resiliencia ante caída HTTP 503 de Paljet (TC-TRIMIA-RI01-01 / RNF-04)
    cy.intercept('GET', '**/sales/stock*', {
      statusCode: 503,
      body: {
        statusCode: 503,
        message: 'No se pudo conectar con Paljet en este momento. Reintentá en unos minutos.',
      },
    }).as('getStockFalla');

    cy.contains('.sales-submenu-bar button.submenu-pill', 'Clientes por contactar').click();
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Consultar stock (Paljet)').click();
    cy.wait('@getStockFalla');

    cy.get('p.error[role="alert"]').should('be.visible').and('contain.text', 'Paljet');
    // El panel sigue operativo y permite cambiar de pestaña sin bloqueo
    cy.contains('.sales-submenu-bar button.submenu-pill', 'Clientes por contactar').click().should('have.class', 'active');
  });

  it('TC-TRIMIA-RF10-01 y RF10-02: Debe consultar Riesgo Online real diferenciando Aprobado vs Rechazado y resguardando Secreto Comercial (OE-10)', () => {
    const vendedora = datos.usuarios.vendedora;
    cy.loginUI(vendedora.email, datos.passwordDefault);
    cy.cerrarModalBienvenidaSiExiste();

    cy.contains('.sales-submenu-bar button.submenu-pill', 'Simulación de crédito').click();
    cy.intercept('POST', '**/sales/credit-check').as('creditCheckReal');

    // 1. DNI 90000001 → Aprobado real
    cy.get('.sales-credit-workspace input').first().clear().type(datos.clientes.perfilesRiesgoOnline.aprobado.dni);
    cy.get('.sales-credit-workspace button[type="submit"]').click();
    cy.wait('@creditCheckReal').then(({ response }) => {
      expect(response.statusCode).to.be.oneOf([200, 201]);
      expect(response.body.verdict).to.eq('APPROVED');
      // Secreto comercial (OE-10): no expone score ni deuda BCRA en la respuesta comercial
      expect(response.body).to.not.have.property('score');
      expect(response.body).to.not.have.property('debt');
    });
    cy.get('.sales-credit-workspace').should('contain.text', 'Aprobado');

    // 2. DNI 90000021 → Rechazado real sin exponer deuda ni situación BCRA
    cy.get('.sales-credit-workspace input').first().clear().type(datos.clientes.perfilesRiesgoOnline.rechazado.dni);
    cy.get('.sales-credit-workspace button[type="submit"]').click();
    cy.wait('@creditCheckReal').then(({ response }) => {
      expect(response.statusCode).to.be.oneOf([200, 201]);
      expect(response.body.verdict).to.eq('REJECTED');
      expect(JSON.stringify(response.body)).to.not.match(/850000|situaci[oó]n\s*4|score|bcra/i);
    });
    cy.get('.sales-credit-workspace').should('contain.text', 'Rechazado');
  });

  it('TC-TRIMIA-RF13-E2E-APROBACION: Flujo completo de Venta Financiada (Conversación IA → Aprobación y Ofertas → Elección y Confirmación → Cierre y Cuotas)', () => {
    const sup = datos.usuarios.supervisorGeneral;
    const sufijo = Date.now().toString().slice(-6);
    const phone = `5493765${sufijo}`;
    const clienteNombre = `Lucia Financiada ${sufijo}`;
    const producto = datos.catalogoPaljet.balanzaCuora.nombre;
    const dniAprobado = datos.clientes.perfilesRiesgoOnline.aprobado.dni;

    cy.getToken(sup.email, datos.passwordDefault).then((tokenSup) => {
      // ETAPA 1: Conversación real del cliente solicitando financiación (Agente de Ventas + Formulario 020)
      cy.simularMensajeYEsperarRespuesta(tokenSup, {
        phone,
        message: `Hola, quiero financiación para el producto ${producto}`,
      }).then((t1) => {
        expect(t1.conversation.userType).to.eq('CLIENTE');
        expect(t1.lastReply?.content).to.be.a('string').and.have.length.greaterThan(5);

        return cy.simularMensajeYEsperarRespuesta(tokenSup, {
          phone,
          message: `Nombre: ${clienteNombre}\nDNI: ${dniAprobado}\nModelo: ${producto}\nComercio: Almacen Cypress ${sufijo}\nLocalidad: Posadas`,
          previousAssistantCount: t1.assistantCount,
        });
      }).then((t2) => {
        // Regla de negocio: crea el pedido para Administración SIN prometer aprobación ni escalar
        expect(t2.conversation.status, 'La revisión normal no debe escalar a humano').to.eq('ACTIVE');
        expect(t2.lastReply?.content).to.match(/pedido|revisi[oó]n|Administraci[oó]n/i);
        expect(t2.lastReply?.content).to.not.match(/venta cerrada|cr[eé]dito aprobado/i);

        // Esperamos evaluación crediticia automática READY
        return cy.esperarEvaluacionFinanciacion(tokenSup, { phone });
      }).then((req) => {
        expect(req.status).to.eq('PENDING_REVIEW');

        // ETAPA 2: Revisión humana en UI ("Aprobación Financiación") → Aprobar y habilitar ofertas
        cy.loginUI(sup.email, datos.passwordDefault);
        cy.navegarMenu('Aprobación Financiación');

        cy.contains('table.fin-requests-table tr', clienteNombre, { timeout: 15000 }).within(() => {
          cy.contains('button', 'Revisar').click();
        });

        // Verifica dictamen crediticio interno y aviso de secreto comercial
        cy.get('.cr-verdict-card').should('contain.text', 'Favorable');
        cy.contains('.cr-verdict-foot', 'Uso interno').should('be.visible');

        // Habilita todas las ofertas (incluyendo contado y cuotas), asigna cobrador y primer vencimiento
        cy.contains('button.cr-text-btn', 'Seleccionar todas').click();
        cy.contains('label.cr-field', 'Cobrador asignado')
          .find('select')
          .select(datos.usuarios.cobrador.nombre);
        cy.contains('.cr-date-chips button', '+7 d').click();
        cy.get('.cr-decision-panel textarea')
          .clear()
          .type(`Aprobación E2E Cypress ${sufijo}: cliente con situación favorable, se habilitan planes vigentes.`);

        cy.intercept('POST', `**/sales/commercial/orders/${req.id}/review`).as('reviewApprove');
        cy.contains('button.cr-btn-approve', 'Aprobar y habilitar ofertas')
          .should('not.be.disabled')
          .click();
        cy.wait('@reviewApprove').its('response.statusCode').should('be.oneOf', [200, 201]);

        // Regla de negocio: aprobar financiación NO cierra la venta; pasa a esperar confirmación del cliente
        cy.contains('Esperando elección y confirmación del cliente').should('be.visible');
        cy.contains('button', 'Cerrar venta y enviar aviso').should('not.exist');

        // ETAPA 3: Cliente elige plan de 12 cuotas, retiro en sucursal y confirma el resumen en el chat real
        cy.simularMensajeYEsperarRespuesta(tokenSup, {
          phone,
          message: 'Elijo 12 cuotas',
        }).then((t3) => {
          expect(t3.lastReply?.content).to.be.a('string').and.have.length.greaterThan(5);
          return cy.simularMensajeYEsperarRespuesta(tokenSup, {
            phone,
            message: 'Retiro en sucursal',
            previousAssistantCount: t3.assistantCount,
          });
        }).then((t4) => {
          expect(t4.lastReply?.content).to.match(/resumen|confirm/i);
          return cy.simularMensajeYEsperarRespuesta(tokenSup, {
            phone,
            message: 'Sí, confirmo',
            previousAssistantCount: t4.assistantCount,
          });
        }).then((t5) => {
          expect(t5.lastReply?.content).to.match(/confirm|Ventas|cierre/i);

          // ETAPA 4: Cierre definitivo en UI + verificación de cuotas en cartera + Ficha comercial modal
          cy.navegarMenu('Panel del Supervisor');
          cy.navegarMenu('Aprobación Financiación');
          cy.contains('.fin-filter-bar button.submenu-pill', 'Aprobada').click();
          cy.contains('table.fin-requests-table tr', clienteNombre, { timeout: 15000 }).within(() => {
            cy.contains('button', 'Revisar').scrollIntoView().click({ force: true });
          });

          // Ahora el pedido está READY y aparece el bloque de cierre
          cy.contains('h4', 'Último paso: cerrar y avisar al cliente', { timeout: 15000 }).should('be.visible');
          cy.contains('.cr-step-badge', 'Listo para cerrar').should('be.visible');

          cy.contains('label.cr-field', 'Constancia interna del cierre')
            .find('textarea')
            .clear()
            .type(`Remito Paljet Cypress-${sufijo} · Retiro en sucursal confirmado`);

          cy.intercept('POST', `**/sales/commercial/orders/${req.id}/close`).as('closeSale');
          cy.contains('button.cr-btn-approve', 'Cerrar venta y enviar aviso')
            .should('not.be.disabled')
            .click();
          cy.wait('@closeSale').its('response.statusCode').should('be.oneOf', [200, 201]);

          // Verifica venta registrada, cuotas cargadas al cobrador y aviso separado
          cy.get('.cr-closed-card').should('be.visible');
          cy.get('.cr-closed-card').should('contain.text', 'Venta registrada');
          cy.get('.cr-closed-card').should('contain.text', '12 cuotas semanales');
          cy.get('.cr-closed-card').should('contain.text', datos.usuarios.cobrador.nombre);
          cy.get('.cr-closed-card [role="status"]').should('contain.text', 'Aviso registrado en el chat de prueba.');

          // Verifica apertura del modal "Ficha comercial y entrega"
          cy.get('button.cr-sheet-trigger').click();
          cy.get('.cr-modal[role="dialog"]').within(() => {
            cy.contains('#cr-sheet-modal-title', 'Ficha comercial y entrega').should('be.visible');
            cy.contains('.commerce-stage-pill', 'Venta cerrada').should('be.visible');
            cy.contains('.commerce-data', producto).should('be.visible');
            cy.contains('.commerce-data', 'Retiro en sucursal').should('be.visible');
            cy.contains('.commerce-success', 'Venta registrada').should('be.visible');
            cy.get('button.cr-modal-close').click();
          });
        });
      });
    });
  });

  it('TC-TRIMIA-RF13-E2E-RECHAZO: Flujo completo de rechazo crediticio (DNI 90000021) ofreciendo contado sin filtrar motivos internos ni deuda BCRA', () => {
    const sup = datos.usuarios.supervisorGeneral;
    const sufijo = (Date.now() + 7).toString().slice(-6);
    const phone = `5493766${sufijo}`;
    const clienteNombre = `Esteban Rechazo ${sufijo}`;
    const producto = datos.catalogoPaljet.balanzaCroma.nombre;
    const dniRechazado = datos.clientes.perfilesRiesgoOnline.rechazado.dni;

    cy.getToken(sup.email, datos.passwordDefault).then((tokenSup) => {
      // 1. Conversación real de cliente nuevo (compra personal) con DNI rechazado
      cy.simularMensajeYEsperarRespuesta(tokenSup, {
        phone,
        message: `Quiero financiación para ${producto}`,
      }).then((t1) => {
        return cy.simularMensajeYEsperarRespuesta(tokenSup, {
          phone,
          message: `Nombre: ${clienteNombre}\nDNI: ${dniRechazado}\nModelo: ${producto}\nEs para mi casa (compra personal)\nLocalidad: Cafayate`,
          previousAssistantCount: t1.assistantCount,
        });
      }).then((t2) => {
        const conversationId = t2.conversationId;
        expect(t2.conversation.status).to.eq('ACTIVE');

        return cy.esperarEvaluacionFinanciacion(tokenSup, { phone }).then((req) => ({
          req,
          conversationId,
        }));
      }).then(({ req, conversationId }) => {
        // 2. Revisión humana en UI → Dictamen Desfavorable → Rechazar ofreciendo contado
        cy.loginUI(sup.email, datos.passwordDefault);
        cy.navegarMenu('Aprobación Financiación');

        cy.contains('table.fin-requests-table tr', clienteNombre, { timeout: 15000 }).within(() => {
          cy.contains('button', 'Revisar').click();
        });

        cy.get('.cr-verdict-card').should('contain.text', 'Desfavorable');

        // Selecciona únicamente la alternativa Contado
        cy.get('.cr-offer-card.is-cash input[type="checkbox"]').check({ force: true });
        cy.get('.cr-decision-panel textarea')
          .clear()
          .type(`Rechazo E2E Cypress ${sufijo}: situación crediticia desfavorable, se habilita únicamente pago al contado.`);

        cy.intercept('POST', `**/sales/commercial/orders/${req.id}/review`).as('reviewReject');
        cy.contains('button.cr-btn-reject', 'Rechazar y ofrecer contado')
          .should('not.be.disabled')
          .click();
        cy.wait('@reviewReject').its('response.statusCode').should('be.oneOf', [200, 201]);

        // 3. Verifica que el aviso al cliente ofrece contado y NO filtra datos internos (RNF-02 / OE-10)
        cy.wait(1500);
        cy.request({
          method: 'GET',
          url: `${apiUrl}/supervisor/conversations/${conversationId}`,
          headers: { Authorization: `Bearer ${tokenSup}` },
        }).then((convRes) => {
          const allAssistantText = (convRes.body.messages || [])
            .filter((m) => m.role === 'ASSISTANT')
            .map((m) => m.content)
            .join('\n');

          expect(allAssistantText).to.match(/contado/i);
          expect(allAssistantText, 'No debe exponer score interno').to.not.match(/\b410\b/);
          expect(allAssistantText, 'No debe exponer deuda interna BCRA').to.not.match(/850\.?000|bcra|situaci[oó]n\s*4/i);
        });
      });
    });
  });
});
