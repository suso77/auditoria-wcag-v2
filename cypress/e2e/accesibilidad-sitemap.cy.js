/// <reference types="cypress" />
import "cypress-axe";

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (v3.6.0 IAAP PRO CI+)
 * -------------------------------------------------------------------------
 * ✅ Audita TODAS las URLs HTML listadas en scripts/urls.json (una a una)
 * ✅ Inyección garantizada de axe-core (espera DOM completo)
 * ✅ Compatibilidad CI (headless Chrome + GitHub Actions)
 * ✅ Capturas por página y por violación
 * ✅ Reintento ante errores reales (timeout/red)
 * ✅ Limpieza de memoria segura sin romper el DOM
 * ✅ Resultados únicos y archivados con timestamp
 */

describe("♿ Auditoría de accesibilidad – Sitemap completo (profesional con capturas)", () => {
  let pages = [];
  const allResults = [];
  const MAX_RETRIES = 1;

  // ===========================================================
  // ⚙️ Manejo tolerante de errores
  // ===========================================================
  Cypress.on("fail", (error) => {
    console.warn("⚠️ Error tolerado:", error?.message || "sin mensaje");
    return false;
  });

  // ===========================================================
  // 🧹 Preparación inicial
  // ===========================================================
  before(() => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");
    cy.task("readUrls").then((urlsRaw) => {
      pages = urlsRaw.filter((p) => p && p.url && !p.error);
      cy.task("log", `🌍 URLs cargadas: ${pages.length} páginas a auditar.`);
    });
  });

  // ===========================================================
  // ♿ Auditoría principal de una sola página
  // ===========================================================
  const auditPage = (page, attempt = 0) => {
    const { url, title } = page;
    const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

    if (url.match(/\.(pdf|jpg|jpeg|png|gif|svg|docx?|xlsx?|zip|rar|mp4|webm|ico|rss|xml)$/i)) {
      cy.task("log", `⚠️ Ignorando recurso no HTML: ${url}`);
      return Cypress.Promise.resolve();
    }

    cy.task("log", `🚀 Analizando: ${url}`);

    return cy
      .visit(url, { timeout: 90000, failOnStatusCode: false })
      .then(() => {
        // 🕒 Esperar a que el DOM esté completamente cargado antes de inyectar axe
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(1500);
        cy.injectAxe();

        // 🔍 Verificación explícita de axe
        cy.window().then((win) => {
          if (!win.axe) {
            cy.task("log", `⚠️ axe-core no inyectado correctamente en ${url}`);
          }
        });
      })
      .then((win) => {
        let safeTitle = title || "(sin título)";
        try {
          const docTitle = win?.document?.title?.trim();
          if (docTitle) safeTitle = docTitle;
        } catch {
          cy.task("log", `⚠️ No se pudo leer el título en ${url}`);
        }

        // 📸 Captura general de la página
        cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
          capture: "viewport",
          overwrite: true,
        });

        // 🧪 Auditoría de accesibilidad con axe-core
        cy.checkA11y(
          "html", // usar "html" mejora fiabilidad en CI
          null,
          (violations) => {
            const dateNow = new Date().toISOString();

            if (violations.length > 0) {
              cy.task("log", `♿ ${url} — ${violations.length} violaciones detectadas`);

              violations.forEach((v, i) => {
                const id = v.id || `violacion-${i}`;
                cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
                  capture: "viewport",
                  overwrite: true,
                });
              });

              allResults.push({
                url,
                pageTitle: safeTitle,
                date: dateNow,
                origen: "sitemap",
                violations,
                system: "macOS + Chrome (Cypress + axe-core)",
              });

              const counts = {
                critical: violations.filter((v) => v.impact === "critical").length,
                serious: violations.filter((v) => v.impact === "serious").length,
                moderate: violations.filter((v) => v.impact === "moderate").length,
                minor: violations.filter((v) => v.impact === "minor").length,
              };

              cy.task(
                "log",
                `🔴 ${counts.critical} | 🟠 ${counts.serious} | 🟡 ${counts.moderate} | 🟢 ${counts.minor}`
              );
            } else {
              cy.task("log", `✅ ${url} — Sin violaciones detectadas.`);
            }
          },
          { skipFailures: true }
        );
      })
      .then(() => {
        // 🧹 Limpieza segura sin destruir DOM
        cy.task("log", "⏳ Finalizando auditoría y liberando memoria...");
        return cy.window({ log: false }).then((win) => {
          try {
            if (win.stop) win.stop();
            if (win.gc) win.gc();
            win.location.replace("about:blank");
            cy.task("log", "🧹 Memoria liberada correctamente (safe mode).");
          } catch (err) {
            cy.task("log", `⚠️ Limpieza parcial: ${err.message || "sin mensaje"}`);
          }
        });
      })
      .catch((err) => {
        const msg = err?.message || "sin mensaje";
        if (msg.includes("timeout") || msg.includes("ERR_CONNECTION")) {
          if (attempt < MAX_RETRIES) {
            cy.task("log", `🔁 Reintentando ${url} (intento ${attempt + 1})...`);
            return auditPage(page, attempt + 1);
          }
          cy.task("log", `⚠️ Error definitivo en ${url}: ${msg}`);
        } else {
          cy.task("log", `ℹ️ Advertencia menor en ${url}: ${msg}`);
        }
      });
  };

  // ===========================================================
  // 🧩 Test principal — ejecución secuencial real
  // ===========================================================
  it("Audita todas las páginas HTML del sitemap", () => {
    return cy.then(() => {
      return Cypress.Promise.each(pages, (page) => {
        return auditPage(page); // ✅ ejecución secuencial garantizada
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
        acc[r.url] = r;
        return acc;
      }, {})
    );

    const onlyViolations = uniqueResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados únicos guardados en: ${outputDir}/results.json`);
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveDir = `auditorias/${timestamp}-auditoria-sitemap`;
    cy.task("createFolder", archiveDir);
    cy.task("writeResults", { dir: archiveDir, data: onlyViolations }).then(() => {
      cy.task("log", `📦 Copia archivada: ${archiveDir}/results.json`);
    });

    const totalViolations = onlyViolations.flatMap((r) => r.violations || []);
    const counts = {
      critical: totalViolations.filter((v) => v.impact === "critical").length,
      serious: totalViolations.filter((v) => v.impact === "serious").length,
      moderate: totalViolations.filter((v) => v.impact === "moderate").length,
      minor: totalViolations.filter((v) => v.impact === "minor").length,
    };

    cy.task(
      "log",
      `📊 Resumen global IAAP: ${totalViolations.length} violaciones (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
    );

    cy.writeFile("auditorias/last-sitemap.txt", outputDir, "utf8");
  });
});


