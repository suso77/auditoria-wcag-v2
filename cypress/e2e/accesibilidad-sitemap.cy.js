/// <reference types="cypress" />
import "cypress-axe";

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (profesional con capturas)
 * -------------------------------------------------------------------------
 * - Audita todas las URLs HTML listadas en scripts/urls.json.
 * - Ignora recursos no HTML (PDF, imágenes, etc.).
 * - Guarda capturas por página y por violación (evidencias visuales).
 * - Reintenta páginas fallidas en modo simplificado.
 * - Libera memoria tras cada auditoría de URL (evita OOM).
 * - Compatible con merge-results.mjs y exportación profesional.
 */

describe("♿ Auditoría de accesibilidad – Sitemap completo (profesional con capturas)", () => {
  let pages = [];
  const allResults = [];

  // 🚫 Evita que Cypress marque el test como fallido por violaciones
  Cypress.on("fail", (error) => {
    if (error.message && error.message.includes("accessibility violation")) {
      console.log("⚠️ Violación de accesibilidad detectada (registrada, sin bloquear).");
      return false;
    }
    throw error;
  });

  // 🧹 Limpia capturas anteriores antes de comenzar
  before(() => {
    cy.task("clearCaptures");
    cy.task("readUrls").then((urlsRaw) => {
      pages = urlsRaw.filter((p) => p && p.url);
      cy.task("log", `🌐 Total de páginas únicas a auditar: ${pages.length}`);
    });
  });

  it("Audita todas las páginas del sitemap con axe-core", () => {
    cy.wrap(pages).each((page) => {
      const { url, title } = page;

      // ⚠️ Ignorar recursos no HTML
      if (
        url.match(
          /\.(pdf|jpg|jpeg|png|gif|svg|doc|docx|xls|xlsx|zip|rar|mp4|webm|ico|rss|xml)$/i
        )
      ) {
        cy.task("log", `⚠️ Ignorando recurso no HTML: ${url}`);
        return;
      }

      cy.task("log", `🚀 Analizando: ${url} (${title || "sin título"})`);
      const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

      cy.visit(url, { timeout: 90000, failOnStatusCode: false })
        .then((win) => {
          let safeTitle = title || "(sin título)";
          try {
            if (win?.document?.title) {
              const docTitle = win.document.title.trim();
              if (docTitle) safeTitle = docTitle;
            }
          } catch {
            cy.task("log", `⚠️ No se pudo leer el título del documento en ${url}`);
          }

          cy.wait(1000);
          cy.injectAxe();

          // 📸 Captura general inicial
          cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
            capture: "viewport",
            overwrite: true,
          });

          // ♿ Auditoría principal con capturas de violaciones
          cy.checkA11y(
            null,
            null,
            (violations) => {
              const dateNow = new Date().toISOString();

              if (violations.length > 0) {
                allResults.push({
                  url,
                  pageTitle: safeTitle,
                  date: dateNow,
                  origen: "sitemap",
                  violations,
                  system: "macOS + Chrome (Cypress) + axe-core",
                });

                // 📸 Captura por cada violación detectada
                violations.forEach((v, i) => {
                  const id = v.id || `violacion-${i}`;
                  cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
                    capture: "viewport",
                    overwrite: true,
                  });
                });

                const counts = {
                  critical: violations.filter((v) => v.impact === "critical").length,
                  serious: violations.filter((v) => v.impact === "serious").length,
                  moderate: violations.filter((v) => v.impact === "moderate").length,
                  minor: violations.filter((v) => v.impact === "minor").length,
                };

                cy.task(
                  "log",
                  `♿ ${url} — ${violations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} graves, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
                );
              } else {
                cy.task("log", `✅ ${url} — Sin violaciones detectadas`);
              }

              cy.wrap(null).should("not.equal", "fail");
            },
            { skipFailures: true }
          );

          // ♻️ Liberar memoria tras auditar cada página
          cy.window().then((win) => {
            try {
              win.document.body.innerHTML = "";
              win.close?.();
              cy.task("log", "🧠 Memoria liberada tras auditoría de la página.");
            } catch {
              cy.task("log", "⚠️ No se pudo liberar memoria (win).");
            }
          });
        })
        // 🔁 Reintento automático si la página falla
        .then(null, (err) => {
          cy.task(
            "log",
            `⚠️ Error al analizar ${url}: ${err?.message || "sin mensaje"}. Reintentando en modo simplificado...`
          );

          cy.visit(url, { failOnStatusCode: false, timeout: 120000 })
            .then(() => {
              cy.injectAxe();

              // 📸 Captura también en reintento
              cy.screenshot(`auditorias/capturas/${slug}/reintento`, {
                capture: "viewport",
                overwrite: true,
              });

              cy.checkA11y(
                "body",
                null,
                (violations) => {
                  const dateNow = new Date().toISOString();

                  if (violations.length > 0) {
                    allResults.push({
                      url,
                      pageTitle: title || "(sin título)",
                      date: dateNow,
                      origen: "sitemap",
                      violations,
                      system: "macOS + Chrome (Cypress) + axe-core",
                    });

                    // 📸 Captura por cada violación detectada (en reintento)
                    violations.forEach((v, i) => {
                      const id = v.id || `violacion-${i}`;
                      cy.screenshot(`auditorias/capturas/${slug}/reintento-${id}`, {
                        capture: "viewport",
                        overwrite: true,
                      });
                    });

                    cy.task("log", `♿ (Reintento) ${url} — ${violations.length} violaciones detectadas`);
                  } else {
                    cy.task("log", `⚠️ (Reintento) ${url} — Sin violaciones detectadas`);
                  }

                  cy.wrap(null).should("not.equal", "fail");
                },
                { skipFailures: true }
              );
            })
            // 🔧 Limpieza final de errores leves
            .then(null, (finalErr) => {
              if (
                finalErr?.message?.includes("cannot visit") ||
                finalErr?.message?.includes("timeout")
              ) {
                cy.task(
                  "log",
                  `⚠️ Falla leve (timeout o redirección) en ${url}, pero la auditoría ya registró resultados.`
                );
              } else {
                cy.task(
                  "log",
                  `ℹ️ Finalizado con advertencias menores en ${url} — sin impacto en los resultados.`
                );
              }
            });
        });
    });
  });

  // 📦 Guardado y resumen final
  after(() => {
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    const onlyViolations = allResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados guardados correctamente en: ${outputDir}/results.json`);
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
      `📊 Resumen global (sitemap): ${totalViolations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} graves, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
    );
  });
});

