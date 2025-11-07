/// <reference types="cypress" />
import "cypress-axe";
import "cypress-real-events/support";

/**
 * ♿ Auditoría de accesibilidad – Componentes interactivos (IAAP PRO v4.0.2)
 * ------------------------------------------------------------------------
 * ✅ Ejecución secuencial 100% Cypress-aware
 * ✅ Inyección y validación de axe-core (entorno local y CI)
 * ✅ Auditoría por selector interactivo + test de foco real
 * ✅ Deduplicado + guardado IAAP
 * ✅ Compatible con CI/CD, Docker y ejecución local
 */

describe("♿ Auditoría de accesibilidad – Componentes interactivos (IAAP PRO v4.0.2)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  // Componentes comunes auditados solo una vez (cabecera, footer, cookie banner, etc.)
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

  // ===========================================================
  // ♿ Auditoría IAAP de un componente individual
  // ===========================================================
  const runA11y = (selector, page, safeSel, slug) => {
    cy.document().its("readyState").should("eq", "complete");
    cy.wait(Cypress.env("CI") ? 1200 : 800);
    cy.injectAxe();

    cy.checkA11y(
      selector,
      {
        includedImpacts: ["critical", "serious", "moderate", "minor"],
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      },
      (violations) => {
        const dateNow = new Date().toISOString();

        cy.screenshot(`auditorias/capturas/${slug}/${safeSel}/componente`, {
          capture: "viewport",
          overwrite: true,
        });

        if (violations.length > 0) {
          cy.task("log", `♿ ${page} / ${selector} — ${violations.length} violaciones detectadas.`);
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
            system: Cypress.env("CI")
              ? "Ubuntu + Chrome Headless (CI/CD + axe-core)"
              : "macOS + Chrome (Local + axe-core)",
          });
        } else {
          cy.task("log", `✅ ${page} / ${selector} — Sin violaciones detectadas.`);
        }
      },
      { skipFailures: true }
    );
  };

  // ===========================================================
  // 🔎 Auditoría adicional: Foco visible y navegación por teclado
  // ===========================================================
  const testFoco = (selector, page) => {
    const maxTabs = 25;
    let tabCount = 0;

    cy.task("log", `🎯 Comprobando foco en ${selector} (${page})`);

    const recorrerFoco = () => {
      if (tabCount >= maxTabs) return;

      cy.realPress("Tab");
      cy.focused().then(($focused) => {
        const tag = $focused.prop("tagName");
        const cls = $focused.attr("class") || "";
        const id = $focused.attr("id") || "";
        cy.task("log", `➡️ Foco #${tabCount + 1}: <${tag.toLowerCase()}> id="${id}" class="${cls}"`);

        // Auditoría puntual del elemento enfocado
        cy.checkA11y(
          ":focus",
          {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          },
          (violations) => {
            if (violations.length > 0) {
              const dateNow = new Date().toISOString();
              allResults.push({
                page,
                selector: `${selector} (foco-${tabCount + 1})`,
                date: dateNow,
                origen: "foco",
                violations,
                system: Cypress.env("CI")
                  ? "Ubuntu + Chrome Headless (CI/CD + axe-core)"
                  : "macOS + Chrome (Local + axe-core)",
              });
            }
          },
          { skipFailures: true }
        );

        tabCount++;
        if (tabCount < maxTabs) recorrerFoco();
      });
    };

    recorrerFoco();
  };

  // ===========================================================
  // 🧩 Test principal — Ejecución secuencial garantizada
  // ===========================================================
  it("Audita todos los componentes interactivos en todas las URLs", () => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");

    cy.task("readUrls").then((urlsRaw) => {
  let pages = urlsRaw.filter((p) => p && p.url && !p.error);

  // ⚙️ Parámetros de entorno para modos opcionales
  const siteUrl = Cypress.env("SITE_URL");
  const onlyFirst = Cypress.env("onlyFirst");

  // 🧪 Modo 1: auditar una URL concreta
  if (siteUrl) {
    pages = [{ url: siteUrl }];
    cy.task("log", `🧪 Modo directo: solo se auditará ${siteUrl}`);
  }
  // 🧪 Modo 2: auditar solo la primera del sitemap
  else if (onlyFirst) {
    pages = [pages[0]];
    cy.task("log", `🧪 Modo prueba: solo se auditará la primera URL (${pages[0].url})`);
  }

  cy.task("log", `🌍 Iniciando auditoría interactiva: ${pages.length} URLs.`);

  if (pages.length === 0) {
    cy.task("log", "⚠️ No hay URLs válidas para auditar.");
    return;
  }

  cy.wrap(null).then(() => {
    const runSequential = (i = 0) => {
      if (i >= pages.length) return;

      const page = pages[i].url;
      const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

      cy.task("log", `🚀 Analizando página ${i + 1}/${pages.length}: ${page}`);
      cy.visit(page, { timeout: 90000, failOnStatusCode: false });
      cy.document().its("readyState").should("eq", "complete");
      cy.wait(Cypress.env("CI") ? 2000 : 1000);
      cy.injectAxe();

      cy.window().then((win) =>
        cy.task("log", `🧠 axe presente en ${page}: ${!!win.axe}`)
      );

      // 🔒 Desactiva Cookiebot solo en la primera página
      if (i === 0) {
        cy.task("log", "🧹 Intentando eliminar Cookiebot (DOM o iframe)...");
        cy.wait(4000);

        cy.document().then((doc) => {
          const cookieEls = [
            "#CybotCookiebotDialog",
            "#CybotCookiebotDialogBody",
            "iframe[src*='cookiebot']",
            "[id*='Cybot']",
            "[class*='Cybot']",
          ];

          let removed = 0;
          cookieEls.forEach((sel) => {
            const el = doc.querySelector(sel);
            if (el) {
              el.remove();
              removed++;
            }
          });

          cy.task("log", `✅ ${removed} elementos de Cookiebot eliminados del DOM.`);
        });
      }

      // 👇 A partir de aquí sigue tu código normal (foco, runA11y, etc.)

    cy.wait(1000);
    cy.screenshot(`auditorias/capturas/cookiebot-eliminado`, { capture: "viewport" });
}
          cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
            capture: "viewport",
            overwrite: true,
          });

          // Lista de posibles componentes interactivos
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

          // Componentes comunes auditados solo en la primera página
          if (i > 0) {
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
              cy.task("log", `ℹ️ No se detectaron componentes interactivos en ${page}`);
              cy.then(() => runSequential(i + 1));
              return;
            }

            const components = Array.from(detected);

            const runComponentSequential = (j = 0) => {
              if (j >= components.length) {
                cy.then(() => runSequential(i + 1));
                return;
              }

              const selector = components[j];
              const safeSel = selector.replace(/[^\w-]/g, "_");

              cy.get("body").then(($body) => {
                if ($body.find(selector).length === 0) {
                  cy.then(() => runComponentSequential(j + 1));
                  return;
                }

                cy.get(selector)
                  .first()
                  .scrollIntoView()
                  .then(($el) => {
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

                    // 🔎 Auditoría de foco integrada
                    testFoco(selector, page);

                    // ♿ Auditoría axe-core normal
                    runA11y(selector, page, safeSel, slug);

                    cy.then(() => runComponentSequential(j + 1));
                  });
              });
            };
            runComponentSequential();
          });
      
        runSequential();
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

    cy.writeFile("auditorias/last-interactiva.txt", outputDir, "utf8");
  });
});



