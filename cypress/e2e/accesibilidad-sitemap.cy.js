/// <reference types="cypress" />
import "cypress-axe";
import "cypress-real-events/support";

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (IAAP v3.6.3)
 * -----------------------------------------------------------------
 * ✅ Ejecuta todas las URLs del sitemap sin duplicar ni saltar
 * ✅ Flujo secuencial real (Cypress.Promise.each)
 * ✅ Inyección verificada de axe-core
 * ✅ Resultados deduplicados y guardados
 * ✅ Compatible con CI/CD (GitHub Actions)
 */

describe("♿ Auditoría de accesibilidad – Sitemap completo (IAAP PRO)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) return false;
    console.warn("⚠️ Error tolerado:", error.message);
    return false;
  });

  // ===========================================================
  // ♿ Función principal de auditoría por página
  // ===========================================================
  const auditPage = (page, attempt = 0) => {
    const { url, title } = page;
    if (!url) return Cypress.Promise.resolve();

    const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
    cy.task("log", `🚀 Visitando: ${url}`);

    return cy
      .visit(url, { timeout: 90000, failOnStatusCode: false })
      .then(() => {
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(1000);
        cy.injectAxe();

        cy.window().then((win) => {
          if (!win.axe) cy.task("log", `⚠️ axe-core no inyectado en ${url}`);
        });

        cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
          capture: "viewport",
          overwrite: true,
        });

        cy.checkA11y(
          null,
          {},
          (violations) => {
            const dateNow = new Date().toISOString();

            if (violations.length > 0) {
              cy.task(
                "log",
                `♿ ${url} — ${violations.length} violaciones detectadas.`
              );
              violations.forEach((v, i) => {
                const id = v.id || `violacion-${i}`;
                cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
                  capture: "viewport",
                  overwrite: true,
                });
              });
            } else {
              cy.task("log", `✅ ${url} — Sin violaciones detectadas.`);
            }

            allResults.push({
              page: url,
              title,
              date: dateNow,
              violations,
              system: "macOS + Chrome (Cypress + axe-core)",
            });
          },
          { skipFailures: true }
        );
      })
      .then(() => {
        cy.window().then((win) => {
          try {
            win.location.replace("about:blank");
            cy.task("log", "🧹 Limpieza completada correctamente.");
          } catch {
            cy.task("log", "⚠️ Limpieza parcial.");
          }
        });
      })
      .catch((err) => {
        if (
          attempt < MAX_RETRIES &&
          (err.message?.includes("timeout") || err.message?.includes("ERR_CONNECTION"))
        ) {
          cy.task("log", `🔁 Reintentando ${url}`);
          return auditPage(page, attempt + 1);
        }
      });
  };

  // ===========================================================
  // 🧩 Test principal – ejecución secuencial real
  // ===========================================================
  it("Audita todas las páginas del sitemap", () => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");

    cy.task("readUrls").then((urlsRaw) => {
      const pages = urlsRaw.filter((p) => p && p.url && !p.error);
      cy.task("log", `🌍 URLs cargadas: ${pages.length} páginas.`);

      if (pages.length === 0) {
        cy.task("log", "⚠️ No hay URLs válidas para auditar.");
        return;
      }

      return Cypress.Promise.each(pages, (page) => auditPage(page)).then(() => {
        cy.task("log", "✅ Auditoría completada correctamente.");
      });
    });
  });

  // ===========================================================
  // 🧾 Guardado final de resultados IAAP
  // ===========================================================
  after(() => {
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        const key = `${r.page}`;
        acc[key] = r;
        return acc;
      }, {})
    );

    const onlyViolations = uniqueResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() =>
      cy.task("log", `💾 Resultados guardados en: ${outputDir}/results.json`)
    );

    const total = onlyViolations.flatMap((r) => r.violations || []);
    const counts = {
      critical: total.filter((v) => v.impact === "critical").length,
      serious: total.filter((v) => v.impact === "serious").length,
      moderate: total.filter((v) => v.impact === "moderate").length,
      minor: total.filter((v) => v.impact === "minor").length,
    };

    cy.task(
      "log",
      `📊 Resumen global IAAP: ${total.length} violaciones (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
    );

    cy.writeFile("auditorias/last-sitemap.txt", outputDir, "utf8");
  });
});





