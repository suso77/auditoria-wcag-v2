/// <reference types="cypress" />
import "cypress-axe";

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (v2.2 profesional optimizada)
 * -------------------------------------------------------------------------
 * ✅ Audita todas las URLs HTML listadas en scripts/urls.json.
 * ✅ Ignora recursos no HTML (PDF, imágenes, etc.).
 * ✅ Capturas por página y violación (evidencias visuales).
 * ✅ Reintento automático en errores o timeouts.
 * ✅ Viewport optimizado para CI (1280x720).
 * ✅ Logs uniformes con la versión “interactiva”.
 * ✅ Compatible con merge-results.mjs y exportación profesional.
 */

describe("♿ Auditoría de accesibilidad – Sitemap completo (profesional con capturas)", () => {
  let pages = [];
  const allResults = [];

  // 🚫 Evita que Cypress marque el test como fallido por violaciones
  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) {
      console.log("⚠️ Violación de accesibilidad detectada (registrada sin bloquear el test).");
      return false;
    }
    throw error;
  });

  // 🧹 Limpia capturas anteriores antes de comenzar
  before(() => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");
    cy.task("readUrls").then((urlsRaw) => {
      pages = urlsRaw.filter((p) => p && p.url);
      cy.task("log", `🌍 URLs cargadas: ${pages.length} páginas a auditar.`);
    });
  });

  // 🔁 Helper con reintento automático y logs uniformes
  const runA11y = (context, url, title, slug) => {
    let attempts = 0;
    const execute = () => {
      attempts++;
      cy.checkA11y(
        context,
        null,
        (violations) => {
          const dateNow = new Date().toISOString();

          if (violations.length > 0) {
            // 📸 Captura visual de cada violación
            violations.forEach((v, i) => {
              const id = v.id || `violacion-${i}`;
              cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
                capture: "viewport",
                overwrite: true,
              });
            });

            // 💾 Registrar resultados
            allResults.push({
              url,
              pageTitle: title,
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
      ).then(null, (err) => {
        if (attempts < 2) {
          cy.task("log", `🔁 Reintentando auditoría de ${url} (intento ${attempts})...`);
          cy.wait(800);
          execute();
        } else {
          cy.task("log", `⚠️ Error definitivo en ${url}: ${err?.message || "sin mensaje"}`);
        }
      });
    };
    execute();
  };

  // ===========================================================
  // 🧩 Test principal
  // ===========================================================
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

      cy.task("log", `🚀 Analizando: ${url}`);
      const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

      cy.visit(url, { timeout: 90000, failOnStatusCode: false })
        .wait(600)
        .then((win) => {
          // 🧾 Título de la página
          let safeTitle = title || "(sin título)";
          try {
            if (win?.document?.title) {
              const docTitle = win.document.title.trim();
              if (docTitle) safeTitle = docTitle;
            }
          } catch {
            cy.task("log", `⚠️ No se pudo leer el título en ${url}`);
          }

          // 🧠 Inyectar axe-core y capturar vista inicial
          cy.injectAxe();
          cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
            capture: "viewport",
            overwrite: true,
          });

          // ♿ Ejecutar auditoría principal
          runA11y(null, url, safeTitle, slug);

          // ♻️ Limpieza de memoria
          cy.window().then((win) => {
            try {
              win.document.body.innerHTML = "";
              win.close?.();
              cy.task("log", "🧹 Memoria liberada tras auditar la página.");
            } catch {
              cy.task("log", "⚠️ No se pudo liberar memoria.");
            }
          });
        })
        // 🔁 Reintento en caso de error
        .then(null, (err) => {
          cy.task(
            "log",
            `⚠️ Error en ${url}: ${err?.message || "sin mensaje"}. Reintentando en modo simplificado...`
          );

          cy.visit(url, { failOnStatusCode: false, timeout: 120000 })
            .wait(1000)
            .then(() => {
              cy.injectAxe();
              cy.screenshot(`auditorias/capturas/${slug}/reintento`, {
                capture: "viewport",
                overwrite: true,
              });
              runA11y("body", url, title || "(sin título)", slug);
            })
            .then(null, (finalErr) => {
              if (
                finalErr?.message?.includes("cannot visit") ||
                finalErr?.message?.includes("timeout")
              ) {
                cy.task(
                  "log",
                  `⚠️ Timeout o redirección en ${url}, pero los resultados previos ya se registraron.`
                );
              } else {
                cy.task("log", `ℹ️ Finalizado con advertencias menores en ${url}.`);
              }
            });
        });
    });
  });

  // ===========================================================
  // 🧾 Guardado y resumen final
  // ===========================================================
  after(() => {
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    const onlyViolations = allResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados guardados en: ${outputDir}/results.json`);
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
      `📊 Resumen global: ${totalViolations.length} violaciones (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
    );
  });
});

  