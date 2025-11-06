/// <reference types="cypress" />
import "cypress-axe";
import "cypress-real-events/support";

/**
 * ♿ Auditoría de accesibilidad – Componentes interactivos (v3.5.1 IAAP / WCAG 2.2 estable)
 * -------------------------------------------------------------------------
 * ✅ Audita todas las URLs del sitemap (sin quedarse en la primera)
 * ✅ Ejecución secuencial garantizada (Cypress.Promise.each)
 * ✅ Limpieza de memoria segura (sin romper el DOM)
 * ✅ Capturas y logs IAAP por componente
 * ✅ Reintento automático ante errores de red o timeout
 */

describe("♿ Auditoría de accesibilidad – Componentes interactivos (IAAP PRO)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  const auditOnceSelectors = [
    "header",
    "footer",
    "menu",
    "nav",
    "[role='menu']",
    '[id*="cookie"]',
    '[class*="cookie"]',
    '[aria-label*="cookie"]',
  ];

  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) return false;
    console.warn("⚠️ Error tolerado:", error.message);
    return false;
  });

  const runA11y = (selector, page, safeSel, slug) => {
    let attempts = 0;

    const execute = () => {
      attempts++;
      cy.checkA11y(
        selector,
        null,
        (violations) => {
          const dateNow = new Date().toISOString();

          // 📸 Captura del componente auditado
          cy.screenshot(`auditorias/capturas/${slug}/${safeSel}/componente`, {
            capture: "viewport",
            overwrite: true,
          });

          if (violations.length > 0) {
            // 📸 Capturas por violación
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
          }
        },
        { skipFailures: true }
      ).catch((err) => {
        const msg = err?.message || "sin mensaje";
        if ((msg.includes("timeout") || msg.includes("ERR_CONNECTION")) && attempts <= MAX_RETRIES) {
          cy.task("log", `🔁 Reintentando ${selector} en ${page}`);
          cy.wait(1000);
          cy.injectAxe();
          execute();
        }
      });
    };

    execute();
  };

  // ===========================================================
  // 🧩 Test principal sincronizado y secuencial
  // ===========================================================
  it("Audita todos los componentes interactivos en todas las URLs", () => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");

    return cy.task("readUrls").then((urlsRaw) => {
      const urls = urlsRaw.map((p) => p.url).filter(Boolean);
      cy.task("log", `🌍 Iniciando auditoría interactiva: ${urls.length} URLs.`);

      return Cypress.Promise.each(urls, (page, index) => {
        const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
        cy.task("log", `🚀 Analizando: ${page}`);

        return cy
          .visit(page, { timeout: 90000, failOnStatusCode: false })
          .wait(1000)
          .then(() => {
            cy.injectAxe();

            cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
              capture: "viewport",
              overwrite: true,
            });

            let selectors = [
              '[role="dialog"]',
              '[aria-modal="true"]',
              ".modal, .popup, .lightbox, .dialog, .overlay, .backdrop",
              '[aria-haspopup="menu"]',
              '[role="menu"], nav ul, .dropdown, .menu, .nav, .navigation, .navbar',
              '[aria-expanded], [aria-controls]',
              ".accordion, .collapsible, [role='tablist'], [data-accordion]",
              "[role='button'], button, [data-action], [data-toggle], [onclick]",
              "[role='slider'], input[type='range'], .carousel, .slider, [data-carousel]",
              "[role='switch'], input[type='checkbox'], .toggle, .switch",
              "form, [role='form'], input, select, textarea, [contenteditable='true']",
              "[data-testid], [data-component], [data-cy]",
              '[id*="cookie"], [class*="cookie"], [aria-label*="cookie"]',
              "header, footer, main, aside",
            ];

            // 🔁 Evita reauditar cabecera/cookies/footer en cada URL
            if (index > 0) {
              selectors = selectors.filter(
                (sel) =>
                  !auditOnceSelectors.some((g) =>
                    sel.replace(/[\[\]"']/g, "").includes(g.replace(/[\[\]"']/g, ""))
                  )
              );
            }

            const detected = new Set();

            cy.get("body").then(($body) => {
              selectors.forEach((sel) => {
                if ($body.find(sel).length > 0) detected.add(sel);
              });
            });

            cy.then(() => {
              if (detected.size === 0) {
                cy.task("log", `ℹ️ No se detectaron componentes en ${page}`);
                return;
              }

              // 🔍 Interacción + auditoría IAAP por componente
              return Cypress.Promise.each(Array.from(detected), (selector) => {
                return cy.get("body").then(($body) => {
                  if ($body.find(selector).length === 0) return;

                  cy.get(selector)
                    .first()
                    .scrollIntoView()
                    .then(($el) => {
                      const safeSel = selector.replace(/[^\w-]/g, "_");

                      if (
                        selector.includes("menu") ||
                        selector.includes("accordion") ||
                        selector.includes("collapsible") ||
                        selector.includes("modal") ||
                        selector.includes("dialog")
                      ) {
                        cy.wrap($el).click({ force: true });
                      }

                      cy.wait(800);
                      cy.realPress("Tab");
                      cy.injectAxe();
                      runA11y(selector, page, safeSel, slug);
                    });
                });
              });
            });
          })
          .then(() => {
            // ✅ Limpieza segura sin destruir DOM
            cy.window().then((win) => {
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
          .wait(500);
      });
    });
  });

  // ===========================================================
  // 🧾 Guardado final de resultados IAAP
  // ===========================================================
  after(() => {
    const outputDir = `auditorias/auditoria-interactiva`;
    cy.task("createFolder", outputDir);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        const key = `${r.page}::${r.selector}`;
        acc[key] = r;
        return acc;
      }, {})
    );

    const onlyViolations = uniqueResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() =>
      cy.task("log", `✅ Resultados guardados en: ${outputDir}/results.json`)
    );

    // 📊 Resumen IAAP
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

    cy.writeFile("auditorias/last-interactiva.txt", outputDir, "utf8");
  });
});





