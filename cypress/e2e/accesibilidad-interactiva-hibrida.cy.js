/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Interactiva (IAAP PRO v4.44-H FINAL)
 * ------------------------------------------------------------------------
 * ✅ Ejecuta axe-core (violations + incomplete)
 * ✅ Ejecuta Pa11y por cada página
 * ✅ Expande componentes dinámicos (acordeones, menús, modales)
 * ✅ Simula interacción real y prueba de foco visible
 * ✅ Guarda capturas, resultados JSON y resumen IAAP PRO
 * ✅ Totalmente compatible con merge-auditorias.mjs v4.44
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

describe("♿ Auditoría de accesibilidad – Interactiva (IAAP PRO v4.44-H FINAL)", () => {
  const allResults = [];

  Cypress.on("fail", () => false);
  Cypress.on("uncaught:exception", () => false);

  // =====================================================
  // ♿ Auditoría híbrida con axe-core (violations + incomplete)
  // =====================================================
  const runA11y = (selector, page, safeSel, slug) => {
    cy.injectAxe();
    cy.window().then((win) => {
      if (!win.axe) {
        cy.task("log", `❌ axe-core no está disponible en ${page}`);
        return;
      }
      return win.axe
        .run(document, {
          runOnly: {
            type: "tag",
            values: [
              "wcag2a",
              "wcag2aa",
              "wcag21a",
              "wcag21aa",
              "wcag22aa",
              "best-practice",
            ],
          },
          resultTypes: ["violations", "incomplete"],
        })
        .then((results) => {
          const allIssues = [...results.violations, ...results.incomplete];
          const dateNow = new Date().toISOString();

          if (allIssues.length > 0) {
            cy.task("log", `♿ ${page} / ${selector} — ${allIssues.length} hallazgos`);
            allIssues.forEach((v, i) => {
              const id = v.id || `issue-${i}`;
              cy.screenshot(
                `auditorias/auditoria-interactiva/capturas/${slug}/${safeSel}/${id}`,
                { capture: "viewport", overwrite: true }
              );
            });

            allResults.push({
              page,
              selector,
              date: dateNow,
              origen: "interactiva",
              version: "IAAP PRO v4.44-H",
              total_issues: allIssues.length,
              violations: results.violations || [],
              needs_review: results.incomplete || [],
              system: Cypress.env("CI")
                ? "Ubuntu + Chrome Headless (CI/CD)"
                : "macOS + Chrome (Local)",
            });
          } else {
            cy.task("log", `✅ ${page} / ${selector} — Sin hallazgos detectados.`);
          }
        })
        .catch((err) => cy.task("log", `⚠️ Error en axe.run(): ${err.message}`));
    });
  };

  // =====================================================
  // 🧩 Ejecutar Pa11y (HTML_CodeSniffer)
  // =====================================================
  const runPa11y = (page) => {
    cy.task("log", `🧩 Ejecutando auditoría Pa11y para: ${page}`);
    cy.exec(`npx pa11y "${page}" --standard WCAG2AA --reporter json`, {
      failOnNonZeroExit: false,
      timeout: 120000,
    }).then((result) => {
      try {
        const parsed = JSON.parse(result.stdout || "[]");
        const pa11yIssues = Array.isArray(parsed) ? parsed : [];
        cy.task("log", `♿ Pa11y completado (${page}) — ${pa11yIssues.length} issues`);
        allResults.push({
          page,
          origen: "pa11y",
          version: "IAAP PRO v4.44-H",
          date: new Date().toISOString(),
          pa11y: pa11yIssues,
        });
      } catch {
        cy.task("log", `⚠️ No se pudo parsear el resultado de Pa11y en ${page}`);
      }
    });
  };

  // =====================================================
  // 🎯 Prueba de foco visible
  // =====================================================
  const testFoco = (selector, page) => {
    const maxTabs = 12;
    let tabCount = 0;
    cy.task("log", `🎯 Probando foco en ${selector}`);
    const recorrer = () => {
      if (tabCount >= maxTabs) return;
      cy.realPress("Tab").catch(() => null);
      cy.focused()
        .then(($f) => {
          if ($f && $f.prop) {
            const visible =
              $f.css("outline-style") !== "none" || $f.css("box-shadow") !== "none";
            cy.task(
              "log",
              `➡️ Foco #${tabCount + 1}: ${$f.prop("tagName")} (${
                visible ? "visible" : "no visible"
              })`
            );
            if (!visible) {
              allResults.push({
                page,
                selector,
                origen: "foco-visible",
                description: "Elemento con foco sin indicador visible",
                wcag: "2.4.7",
                impact: "serious",
              });
            }
          }
          tabCount++;
          recorrer();
        })
        .catch(() => null);
    };
    recorrer();
  };

  // =====================================================
  // 🎮 Interacción simulada
  // =====================================================
  const simulateInteraction = (selector, page) => {
    cy.task("log", `🎮 Simulando interacción en ${selector}`);
    cy.get(selector)
      .first()
      .then(($el) => {
        if ($el.is("button,[role='button'],[aria-expanded]")) {
          cy.wrap($el).realClick().wait(300);
        } else if ($el.is("input,select,textarea")) {
          cy.wrap($el).focus().type("prueba").blur();
        }
      })
      .catch(() => null);
  };

  // =====================================================
  // 🧩 Expansión automática de componentes dinámicos
  // =====================================================
  const expandDynamicComponents = () => {
    const expandibles = [
      "[aria-expanded='false']",
      "[role='tab']",
      "[data-accordion]",
      "[data-toggle]",
      ".accordion button",
      ".dropdown-toggle",
    ];
    expandibles.forEach((sel) => {
      cy.get("body").then(($body) => {
        if ($body.find(sel).length > 0) {
          cy.get(sel).click({ multiple: true, force: true }).wait(300);
        }
      });
    });
  };

  // =====================================================
  // 🔧 Limpieza inicial
  // =====================================================
  before(() => {
    cy.task("clearCaptures");
  });

  // =====================================================
  // 🌍 Cargar URLs
  // =====================================================
  it("Carga lista de URLs IAAP PRO", () => {
    cy.task("readUrls").then((urlsRaw) => {
      const urls = urlsRaw.filter((u) => u && u.url);
      expect(urls.length).to.be.greaterThan(0);
      cy.writeFile("cypress/urls-temp.json", urls);
      cy.task("log", `🌍 ${urls.length} URLs cargadas para auditoría interactiva`);
    });
  });

  // =====================================================
  // 🔁 Ejecutar auditoría por URL
  // =====================================================
  const urls = require("../../scripts/urls.json");

  urls.forEach((pageObj, i) => {
    const page = pageObj.url;
    const slug = page.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");

    it(`(${i + 1}/${urls.length}) Audita: ${page}`, () => {
      cy.task("log", `🧭 Auditando (interactiva) ${i + 1}/${urls.length}: ${page}`);
      cy.visit(page, { timeout: 90000, failOnStatusCode: false });
      cy.document().its("readyState").should("eq", "complete");
      cy.wait(Cypress.env("CI") ? 2000 : 1000);

      expandDynamicComponents();

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
          runPa11y(page);
          return;
        }

        const components = Array.from(detected);
        cy.task("log", `🎛️ Detectados ${components.length} componentes en ${page}`);

        components.reduce((prev, selector) => {
          return prev.then(() => {
            const safeSel = selector.replace(/[^\w-]/g, "_");
            return cy.get("body").then(($b) => {
              if ($b.find(selector).length === 0) return;
              cy.get(selector)
                .first()
                .scrollIntoView()
                .then(() => {
                  simulateInteraction(selector, page);
                  testFoco(selector, page);
                  runA11y(selector, page, safeSel, slug);
                })
                .catch(() =>
                  cy.task("log", `⚠️ Error procesando selector: ${selector}`)
                );
            });
          });
        }, Cypress.Promise.resolve()).then(() => runPa11y(page));
      });
    });
  });

  // =====================================================
  // 💾 Guardado final IAAP PRO
  // =====================================================
  after(() => {
    const outputDir = "auditorias/auditoria-interactiva";
    cy.task("createFolder", outputDir);
    cy.task("log", `💾 Guardando resultados IAAP PRO Interactiva...`);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        const key = `${r.page || "?"}::${r.selector || "?"}::${r.origen || "?"}`;
        acc[key] = r;
        return acc;
      }, {})
    );

    cy.task("writeResults", { dir: outputDir, data: uniqueResults }).then(() => {
      cy.writeFile(`${outputDir}/resumen-final.json`, {
        total: uniqueResults.length,
        fecha: new Date().toISOString(),
        version: "IAAP PRO v4.44-H",
        origen: "interactiva",
      });
      cy.task(
        "log",
        `✅ Resultados guardados (${uniqueResults.length} registros en ${outputDir})`
      );
    });
  });
});
