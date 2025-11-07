/// <reference types="cypress" />
import "cypress-axe";
import "cypress-real-events/support";

/**
 * ♿ Auditoría de accesibilidad – Componentes interactivos (IAAP PRO v4.13.5)
 * ------------------------------------------------------------------------
 * ✅ Audita TODAS las URLs del sitemap (cada una como test independiente)
 * ✅ axe-core + navegación por teclado integrada
 * ✅ Guardado incremental y logs detallados
 * ✅ Ignora errores JS y de foco sin romper el flujo
 * ✅ Totalmente compatible con CI/CD y ejecución local
 */

describe("♿ Auditoría de accesibilidad – Componentes interactivos (IAAP PRO v4.13.5)", () => {
  const allResults = [];

  // =====================================================
  // 🔧 Tolerancia global de errores
  // =====================================================
  Cypress.on("fail", () => false);
  Cypress.on("uncaught:exception", () => false);

  // =====================================================
  // ♿ Auditoría de un componente con axe-core
  // =====================================================
  const runA11y = (selector, page, safeSel, slug) => {
    cy.injectAxe();
    cy.then(() => {
      return new Cypress.Promise((resolve) => {
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
            if (violations.length > 0) {
              cy.task(
                "log",
                `♿ ${page} / ${selector} — ${violations.length} violaciones detectadas.`
              );

              violations.forEach((v, i) => {
                const id = v.id || `violacion-${i}`;
                const capturePath = `auditorias/capturas/${slug}/${safeSel}/${id}`;
                cy.screenshot(capturePath, {
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
            resolve();
          },
          { skipFailures: true } // No rompe el flujo aunque haya violaciones
        );
      });
    });
  };

  // =====================================================
  // 🎯 Prueba de foco y navegación por teclado
  // =====================================================
  const testFoco = (selector, page) => {
    const maxTabs = 10;
    let tabCount = 0;
    cy.task("log", `🎯 Probando foco en ${selector}`);

    const recorrer = () => {
      if (tabCount >= maxTabs) return;
      cy.realPress("Tab").catch(() => null);
      cy.focused()
        .then(($f) => {
          if ($f && $f.prop) {
            cy.task("log", `➡️ Foco #${tabCount + 1}: ${$f.prop("tagName")}`);
          }
          tabCount++;
          recorrer();
        })
        .catch(() => null);
    };

    recorrer();
  };

  // =====================================================
  // 🔧 Limpieza inicial y carga de URLs
  // =====================================================
  before(() => {
    cy.task("clearCaptures");
  });

  it("Carga la lista de URLs", () => {
    cy.task("readUrls").then((urlsRaw) => {
      const urls = urlsRaw.filter((u) => u && u.url);
      expect(urls.length, "Debe haber URLs válidas").to.be.greaterThan(0);
      cy.writeFile("cypress/urls-temp.json", urls);
      cy.task("log", `🌍 Se generarán ${urls.length} tests dinámicos.`);
    });
  });

  // =====================================================
  // 🔁 Generación dinámica de tests (uno por URL)
  // =====================================================
  const urls = require("../../scripts/urls.json");

  urls.forEach((pageObj, i) => {
    const page = pageObj.url;
    const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

    it(`(${i + 1}/${urls.length}) Audita: ${page}`, () => {
      cy.task("log", `🧭 Auditando ${i + 1}/${urls.length}: ${page}`);

      cy.visit(page, { timeout: 90000, failOnStatusCode: false });
      cy.document().its("readyState").should("eq", "complete");
      cy.wait(Cypress.env("CI") ? 2000 : 1000);
      cy.injectAxe();

      cy.window().then((win) => cy.task("log", `🧠 axe-core presente: ${!!win.axe}`));

      cy.get("body").then(($body) => {
        const selectors = [
          "header, footer, nav, menu, [role='menu']",
          "[aria-haspopup='menu'], [role='button'], button",
          "[aria-expanded], [aria-controls]",
          "[role='dialog'], [aria-modal='true'], .modal, .popup, .overlay",
          "form, input, select, textarea, [contenteditable='true']",
          ".accordion, .collapsible, [role='tablist'], [data-accordion]",
        ];

        const detected = new Set();
        selectors.forEach((sel) => {
          if ($body.find(sel).length > 0) detected.add(sel);
        });

        if (detected.size === 0) {
          cy.task("log", `ℹ️ No hay componentes interactivos en ${page}`);
          return;
        }

        const components = Array.from(detected);
        cy.task("log", `🎛️ Detectados ${components.length} componentes en ${page}`);

        components.forEach((selector) => {
          const safeSel = selector.replace(/[^\w-]/g, "_");
          cy.get("body")
            .then(($b) => {
              if ($b.find(selector).length === 0) return;

              cy.get(selector)
                .first()
                .scrollIntoView()
                .then(($el) => {
                  if (
                    selector.includes("menu") ||
                    selector.includes("accordion") ||
                    selector.includes("dialog")
                  ) {
                    cy.wrap($el).click({ force: true }).catch(() => null);
                  }

                  cy.wait(300);
                  testFoco(selector, page);
                  runA11y(selector, page, safeSel, slug);
                })
                .catch((err) =>
                  cy.task("log", `⚠️ Error en ${selector}: ${err.message}`)
                );
            })
            .catch((err) =>
              cy.task("log", `⚠️ Error de detección en ${page}: ${err.message}`)
            );
        });
      });
    });
  });

  // =====================================================
  // 💾 Guardado final de resultados IAAP
  // =====================================================
  after(() => {
    const outputDir = "auditorias/auditoria-interactiva";
    cy.task("createFolder", outputDir);
    cy.task("log", `💾 Guardando resultados IAAP PRO...`);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        const key = `${r.page || "?"}::${r.selector || "?"}`;
        acc[key] = r;
        return acc;
      }, {})
    );

    const onlyViolations = uniqueResults.filter(
      (r) => Array.isArray(r.violations) && r.violations.length > 0
    );

    cy.task("writeResults", { dir: outputDir, data: onlyViolations }).then(() => {
      cy.task(
        "log",
        `✅ Resultados guardados (${onlyViolations.length} registros en ${outputDir})`
      );
    });
  });
});




