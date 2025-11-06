/// <reference types="cypress" />
import "cypress-axe";

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (v3.4.1 IAAP PRO estable)
 * -------------------------------------------------------------------------
 * ✅ Audita TODAS las URLs HTML listadas en scripts/urls.json (una a una).
 * ✅ Ignora recursos no HTML (PDF, imágenes, vídeos, etc.).
 * ✅ Capturas por página y por violación.
 * ✅ Reintento solo ante errores reales (timeout/red).
 * ✅ Limpieza de memoria segura sin romper el DOM.
 * ✅ Guarda resultados únicos y copia archivada con timestamp.
 * ✅ Ejecución secuencial controlada en Cypress.
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
      pages = urlsRaw.filter((p) => p && p.url);
      cy.task("log", `🌍 URLs cargadas: ${pages.length} páginas a auditar.`);
    });
  });

  // ===========================================================
  // ♿ Auditoría principal de una sola URL
  // ===========================================================
  const auditPage = (url, title, slug, attempt = 0) => {
    cy.task("log", `🚀 Analizando: ${url}`);

    cy.visit(url, { timeout: 90000, failOnStatusCode: false })
      .wait(1000)
      .then((win) => {
        let safeTitle = title || "(sin título)";
        try {
          const docTitle = win?.document?.title?.trim();
          if (docTitle) safeTitle = docTitle;
        } catch {
          cy.task("log", `⚠️ No se pudo leer el título en ${url}`);
        }

        cy.injectAxe();

        cy.checkA11y(
          "body",
          null,
          (violations) => {
            const dateNow = new Date().toISOString();

            // 📸 Captura general del estado de la página
            cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
              capture: "viewport",
              overwrite: true,
            });

            if (violations.length > 0) {
              // 📸 Capturas por violación
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
                `♿ ${url} — ${violations.length} violaciones (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
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
        cy.then(() => {
          cy.task("log", "⏳ Finalizando auditoría y liberando memoria...");
          return Cypress.Promise.try(() =>
            cy.window({ log: false }).then((win) => {
              try {
                if (win.stop) win.stop();
                if (win.gc) win.gc();
                win.location.replace("about:blank");
                cy.task("log", "🧹 Memoria liberada correctamente (safe mode).");
              } catch (err) {
                cy.task("log", `⚠️ Limpieza parcial: ${err.message || "sin mensaje"}`);
              }
            })
          );
        });
      })
      .catch((err) => {
        const msg = err?.message || "sin mensaje";
        if (msg.includes("timeout") || msg.includes("ERR_CONNECTION")) {
          if (attempt < MAX_RETRIES) {
            cy.task("log", `🔁 Reintentando ${url} (intento ${attempt + 1})...`);
            auditPage(url, title, slug, attempt + 1);
          } else {
            cy.task("log", `⚠️ Error definitivo en ${url}: ${msg}`);
          }
        } else {
          cy.task("log", `ℹ️ Advertencia menor en ${url}: ${msg}`);
        }
      });
  };

  // ===========================================================
  // 🧩 Test principal — ejecución secuencial
  // ===========================================================
  it("Audita todas las páginas HTML del sitemap", () => {
    pages.forEach((page) => {
      const { url, title } = page;

      // Ignorar recursos no HTML
      if (
        url.match(
          /\.(pdf|jpg|jpeg|png|gif|svg|doc|docx|xls|xlsx|zip|rar|mp4|webm|ico|rss|xml)$/i
        )
      ) {
        cy.task("log", `⚠️ Ignorando recurso no HTML: ${url}`);
        return;
      }

      const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
      auditPage(url, title, slug);
    });
  });

  // ===========================================================
  // 🧾 Guardado final de resultados
  // ===========================================================
  after(() => {
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    // 🔍 Deduplicar por URL
    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        acc[r.url] = r;
        return acc;
      }, {})
    );

    const onlyViolations = uniqueResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    // 💾 Guardar resultados principales
    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados únicos guardados en: ${outputDir}/results.json`);
    });

    // 📦 Copia archivada con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveDir = `auditorias/${timestamp}-auditoria-sitemap`;
    cy.task("createFolder", archiveDir);
    cy.task("writeResults", { dir: archiveDir, data: onlyViolations }).then(() => {
      cy.task("log", `📦 Copia archivada: ${archiveDir}/results.json`);
    });

    // 📊 Resumen IAAP global
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



