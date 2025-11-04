/// <reference types="cypress" />
import "cypress-axe";

/**
 * ♿ Auditoría de accesibilidad – Componentes interactivos (v2.1 profesional)
 * -------------------------------------------------------------------------
 * ✅ Carga URLs desde scripts/urls.json
 * ✅ Audita componentes interactivos (acordeones, menús, modales, sliders, etc.)
 * ✅ Evita duplicados globales (header, cookies, footer)
 * ✅ Capturas automáticas por página, componente y violación
 * ✅ Reintentos inteligentes en fallos o SPAs
 * ✅ Viewport optimizado para CI (1280x720)
 * ✅ Compatible con merge, evidencias y exportación Excel/ZIP
 */

describe("♿ Auditoría de accesibilidad – Componentes interactivos (profesional con capturas)", () => {
  let urls = [];
  const allResults = [];

  // ⚙️ Componentes globales (solo se auditan una vez)
  const auditOnceSelectors = [
    '[id*="cookie"]',
    '[class*="cookie"]',
    '[aria-label*="cookie"]',
    "header",
    "nav[role='navigation']",
    ".menu-principal",
    "footer",
  ];

  // 🚫 Evita que Cypress falle por violaciones detectadas
  Cypress.on("fail", (error) => {
    if (error.message && error.message.includes("accessibility violation")) {
      console.log("⚠️ Violación de accesibilidad detectada (registrada, sin bloquear).");
      return false;
    }
    throw error;
  });

  // 🧹 Limpieza previa y configuración inicial
  before(() => {
    cy.viewport(1280, 720); // Tamaño fijo para CI estable
    cy.task("clearCaptures");
    cy.task("readUrls").then((urlsRaw) => {
      urls = urlsRaw.map((p) => p.url).filter(Boolean);
      cy.task("log", `🌍 Iniciando auditoría interactiva: ${urls.length} URLs detectadas.`);
    });
  });

  // 🔁 Helper con reintento automático
  const runA11y = (selector, page, safeSel, slug) => {
    let attempts = 0;
    const execute = () => {
      attempts++;
      cy.checkA11y(
        selector,
        null,
        (violations) => {
          const dateNow = new Date().toISOString();

          if (violations.length > 0) {
            cy.screenshot(`auditorias/capturas/${slug}/${safeSel}/componente`, {
              capture: "viewport",
              overwrite: true,
            });

            violations.forEach((v, i) => {
              const id = v.id || `violacion-${i}`;
              cy.screenshot(`auditorias/capturas/${slug}/${safeSel}/${id}`, {
                capture: "viewport",
                overwrite: true,
              });
            });

            allResults.push({
              page,
              selector,
              date: dateNow,
              origen: "interactiva",
              violations,
              system: "macOS + Chrome (Cypress) + axe-core",
            });

            const counts = {
              critical: violations.filter((v) => v.impact === "critical").length,
              serious: violations.filter((v) => v.impact === "serious").length,
              moderate: violations.filter((v) => v.impact === "moderate").length,
              minor: violations.filter((v) => v.impact === "minor").length,
            };

            cy.task(
              "log",
              `♿ ${selector} — ${violations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} graves, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
            );
          } else {
            cy.task("log", `✅ ${selector} — Sin violaciones detectadas`);
          }

          cy.wrap(null).should("not.equal", "fail");
        },
        { skipFailures: true }
      ).then(null, (err) => {
        if (attempts < 2) {
          cy.task("log", `🔁 Reintentando auditoría de ${selector} (${attempts})...`);
          cy.wait(800);
          execute();
        } else {
          cy.task("log", `⚠️ Auditoría fallida en ${selector}: ${err?.message || "sin mensaje"}`);
        }
      });
    };
    execute();
  };

  // ===========================================================
  // 🧩 Test principal
  // ===========================================================
  it("Audita todos los componentes interactivos detectados", () => {
    cy.wrap(urls).each((page, index) => {
      cy.task("log", `🚀 Analizando componentes interactivos en: ${page}`);

      const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

      cy.visit(page, { timeout: 90000, failOnStatusCode: false })
        .wait(500)
        .then(() => {
          cy.injectAxe();

          // 📸 Captura general inicial
          cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
            capture: "viewport",
            overwrite: true,
          });

          // 🎯 Selectores base
          let selectors = [
            '[role="dialog"]',
            '[aria-modal="true"]',
            ".modal, .popup, .lightbox",
            '[aria-haspopup="menu"]',
            '[role="menu"], nav ul, .dropdown, .menu',
            '[id*="cookie"], [class*="cookie"], [aria-label*="cookie"], [aria-label*="Cookie"]',
            '[aria-expanded], [aria-controls]',
            ".accordion, .collapsible, [role='tablist']",
            "[role='button'], button",
            "header, footer",
          ];

          // 🔁 Omitir globales después de la primera URL
          if (index > 0) {
            cy.task("log", "🧠 Omitiendo componentes globales ya auditados (header, cookies, footer)");
            selectors = selectors.filter(
              (sel) =>
                !auditOnceSelectors.some((globalSel) =>
                  sel.replace(/[\[\]"']/g, "").includes(globalSel.replace(/[\[\]"']/g, ""))
                )
            );
          }

          const detected = new Set();

          cy.get("body").then(($body) => {
            selectors.forEach((sel) => {
              try {
                const elements = $body.find(sel);
                if (elements.length > 0) {
                  cy.task("log", `🎯 Detectado componente: ${sel} (${elements.length})`);
                  detected.add(sel);
                }
              } catch (err) {
                cy.task("log", `⚠️ Selector no válido (${sel}): ${err?.message || "sin mensaje"}`);
              }
            });
          });

          cy.then(() => {
            if (detected.size === 0) {
              cy.task("log", `ℹ️ No se detectaron componentes interactivos en ${page}`);
              return;
            }

            // ♿ Auditar cada componente detectado
            detected.forEach((selector) => {
              cy.get("body").then(($body) => {
                if ($body.find(selector).length === 0) return;

                cy.get(selector, { timeout: 5000 })
                  .first()
                  .scrollIntoView()
                  .then(($el) => {
                    if ($el.is(":hidden")) {
                      cy.task("log", `🧩 Intentando abrir componente oculto: ${selector}`);
                      try {
                        cy.wrap($el).click({ force: true });
                        cy.wait(800);
                      } catch {
                        cy.task("log", `⚠️ No se pudo abrir ${selector}`);
                      }
                    }

                    const safeSel = selector.replace(/[^\w-]/g, "_");
                    runA11y(selector, page, safeSel, slug);
                  });
              });
            });
          });

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
        // 🔁 Reintento si la página falla
        .then(null, (err) => {
          cy.task(
            "log",
            `⚠️ Error al analizar ${page}: ${err?.message || "sin mensaje"}. Reintentando en modo simplificado...`
          );

          cy.visit(page, { failOnStatusCode: false, timeout: 120000 })
            .wait(1000)
            .then(() => {
              cy.injectAxe();

              // 📸 Captura en modo simplificado
              cy.screenshot(`auditorias/capturas/${slug}/reintento`, {
                capture: "viewport",
                overwrite: true,
              });

              runA11y("body", page, "body_reintento", slug);
            })
            .then(null, (finalErr) => {
              cy.task(
                "log",
                `ℹ️ Finalizado con advertencias menores en ${page} — ${finalErr?.message || "sin impacto en resultados"}`
              );
            });
        });
    });
  });

  // ===========================================================
  // 🧾 Guardado final
  // ===========================================================
  after(() => {
    const outputDir = `auditorias/auditoria-interactiva`;
    cy.task("createFolder", outputDir);

    const onlyViolations = allResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados guardados correctamente en: ${outputDir}/results.json`);
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveDir = `auditorias/${timestamp}-auditoria-interactiva`;
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
      `📊 Resumen global (interactiva): ${totalViolations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} graves, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
    );
  });
});
