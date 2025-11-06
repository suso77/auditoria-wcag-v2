/// <reference types="cypress" />
import "cypress-axe";
import "cypress-real-events/support";

/**
 * ♿ Auditoría de accesibilidad – Componentes interactivos (v3.1 profesional IAAP/WCAG)
 * -------------------------------------------------------------------------
 * ✅ Detecta y audita componentes dinámicos (menús, modales, acordeones, sliders...)
 * ✅ Ejecuta interacciones reales: click, foco, tabulación, enter/escape.
 * ✅ Captura evidencias antes y después de la interacción.
 * ✅ Evita duplicados globales (header, cookies, footer).
 * ✅ CI/CD compatible con exportación Excel y merge de resultados.
 */

describe("♿ Auditoría de accesibilidad – Componentes interactivos (con interacciones reales)", () => {
  let urls = [];
  const allResults = [];

  const auditOnceSelectors = [
    "header",
    "footer",
    '[id*="cookie"]',
    '[class*="cookie"]',
    '[aria-label*="cookie"]',
  ];

  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) {
      console.log("⚠️ Violación detectada — registrada sin detener el test.");
      return false;
    }
    throw error;
  });

  before(() => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");
    cy.task("readUrls").then((urlsRaw) => {
      urls = urlsRaw.map((p) => p.url).filter(Boolean);
      cy.task("log", `🌍 Iniciando auditoría interactiva: ${urls.length} URLs.`);
    });
  });

  const runA11y = (selector, page, safeSel, slug) => {
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
            `♿ ${selector} — ${violations.length} violaciones (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
          );
        } else {
          cy.task("log", `✅ ${selector} — Sin violaciones detectadas.`);
        }
      },
      { skipFailures: true }
    );
  };

  it("Audita componentes interactivos con interacciones reales", () => {
    cy.wrap(urls).each((page, index) => {
      cy.task("log", `🚀 Analizando: ${page}`);
      const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

      cy.visit(page, { timeout: 90000, failOnStatusCode: false })
        .wait(500)
        .then(() => {
          cy.injectAxe();

          cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
            capture: "viewport",
            overwrite: true,
          });

          let selectors = [
            '[role="dialog"]',
            '[aria-modal="true"]',
            ".modal, .popup, .lightbox",
            '[aria-haspopup="menu"]',
            '[role="menu"], nav ul, .dropdown, .menu',
            '[aria-expanded], [aria-controls]',
            ".accordion, .collapsible, [role='tablist']",
            "[role='button'], button",
            "header, footer",
          ];

          // Evita duplicados globales (header, footer, cookies)
          if (index > 0) {
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
              const found = $body.find(sel);
              if (found.length > 0) detected.add(sel);
            });
          });

          cy.then(() => {
            if (detected.size === 0) {
              cy.task("log", `ℹ️ No se detectaron componentes en ${page}`);
              return;
            }

            detected.forEach((selector) => {
              cy.get("body").then(($body) => {
                if ($body.find(selector).length === 0) return;

                cy.get(selector)
                  .first()
                  .scrollIntoView()
                  .then(($el) => {
                    const safeSel = selector.replace(/[^\w-]/g, "_");

                    // 🧠 Interacción contextual mejorada (segura)
                    if (selector.includes("menu")) {
                      cy.wrap($el).then(($menu) => {
                        const isFocusable =
                          $menu.is("a, button, input, select, textarea") ||
                          $menu.attr("tabindex") !== undefined;

                        if (isFocusable) {
                          cy.wrap($menu).focus().realPress("Enter");
                          cy.wait(500);
                        } else {
                          cy.task(
                            "log",
                            `⚠️ Elemento con role="menu" no enfocable. Se omite el focus.`
                          );
                          cy.wrap($menu).click({ force: true });
                          cy.wait(500);
                        }
                      });
                    } else if (selector.includes("accordion") || selector.includes("collapsible")) {
                      cy.wrap($el).click({ force: true });
                      cy.wait(500);
                    } else if (selector.includes("modal") || selector.includes("dialog")) {
                      cy.wrap($el).click({ force: true });
                      cy.wait(1000);
                    } else if ($el.is(":hidden")) {
                      cy.wrap($el).scrollIntoView().click({ force: true });
                      cy.wait(800);
                    }

                    // 🔁 Simular navegación con teclado (versión tolerante)
                    cy.realPress("Tab");
                    cy.wait(1000);

                    cy.focused()
                      .then(($focused) => {
                        const tag = $focused.prop("tagName") || "ninguno";
                        const role = $focused.attr("role") || "sin role";
                        const id = $focused.attr("id") || "sin id";
                        const text = $focused.text().trim().slice(0, 80) || "sin texto visible";

                        cy.task(
                          "log",
                          `🧭 Foco actual: <${tag.toLowerCase()}> (role="${role}", id="${id}") — "${text}"`
                        );

                        if (!tag || /^(undefined|body|html)$/i.test(tag)) {
                          cy.task("log", "⚠️ Ningún elemento interactivo obtuvo el foco.");
                          return;
                        }

                        cy.focused().should("exist");
                      })
                      .catch((err) => {
                        cy.task(
                          "log",
                          `⚠️ No se encontró elemento enfocado o se produjo un error: ${err.message}`
                        );
                        Cypress.log({
                          name: "Focus Warning",
                          message: "El test continúa pese al fallo de foco.",
                          consoleProps: () => ({ error: err.message }),
                        });
                      });

                    // ♿ Auditoría accesibilidad post-interacción
                    cy.injectAxe();
                    runA11y(selector, page, safeSel, slug);
                  });
              });
            });
          });
        })
        .then(null, (err) => {
          cy.task("log", `⚠️ Error en ${page}: ${err?.message || "sin mensaje"}. Reintentando...`);
          cy.visit(page, { failOnStatusCode: false, timeout: 120000 })
            .wait(1000)
            .then(() => {
              cy.injectAxe();
              runA11y("body", page, "body_reintento", slug);
            });
        });
    });
  });

  after(() => {
    const outputDir = `auditorias/auditoria-interactiva`;
    cy.task("createFolder", outputDir);

    const onlyViolations = allResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task("log", `✅ Resultados guardados en: ${outputDir}/results.json`);
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
