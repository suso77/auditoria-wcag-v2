/// <reference types="cypress" />

/**
 * 🧪 Test de depuración – axe-core + pa11y (FINAL ESTABLE)
 * --------------------------------------------------------
 * Detecta si axe-core y pa11y funcionan correctamente sin conflictos Cypress.
 */

describe("🧪 Debug IAAP PRO – axe-core y pa11y (FINAL)", () => {
  it("verifica la inyección y ejecución en https://www.suntransfers.com/es", () => {
    const testUrl = "https://www.suntransfers.com/es";

    cy.task("log", `🔍 Iniciando prueba de inyección en ${testUrl}`);
    cy.visit(testUrl, { timeout: 90000, failOnStatusCode: false });
    cy.document().its("readyState").should("eq", "complete");
    cy.wait(3000);

    // Inyección axe-core
    cy.window().then(async (win) => {
      try {
        const axe = await import("axe-core");
        win.eval(axe.source);
        cy.task("log", "✅ axe-core inyectado manualmente.");
      } catch (err) {
        cy.task("log", `❌ Error al inyectar axe-core: ${err.message}`);
      }

      cy.task("log", win.axe ? "🧠 axe existe en window" : "🚫 axe NO existe en window");

      if (!win.axe) {
        cy.task("log", "❌ No se puede ejecutar axe.run, abortando prueba.");
        return;
      }

      // Ejecutar axe.run sin cy.wrap()
      return win.axe
        .run(win.document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
          },
        })
        .then((res) => {
          cy.task("log", `✅ axe.run() ejecutado correctamente.`);
          cy.task("log", `🔎 Violaciones detectadas: ${res.violations.length}`);
          // Guardar temporalmente el resultado
          return res;
        })
        .catch((err) => {
          cy.task("log", `❌ Error ejecutando axe.run(): ${err.message}`);
        });
    });

    // Ejecutar pa11y después, fuera del contexto .then()
    cy.then(() => {
      cy.task("pa11yAudit", testUrl).then((pr = []) => {
        cy.task("log", `📊 pa11yAudit devolvió ${pr.length} issues`);
      });
    });
  });
});

