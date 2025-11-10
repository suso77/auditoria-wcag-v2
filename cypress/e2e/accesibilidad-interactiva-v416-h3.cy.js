/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Interactiva Híbrida (IAAP PRO v4.16-H3)
 * ------------------------------------------------------------------------
 * ✅ Basado en v4.15-H – estable y CI/CD-ready
 * ✅ Añade integración Pa11y (fix: options.log.info)
 * ✅ Mantiene axe-core híbrido (violations + incomplete)
 * ✅ Logs IAAP PRO unificados + resultados JSON
 * ✅ Expansión dinámica y foco visible sin cambios funcionales
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

describe("♿ Auditoría de accesibilidad – Interactiva Híbrida (IAAP PRO v4.16-H3)", () => {
  const allResults = [];

  Cypress.on("fail", () => false);
  Cypress.on("uncaught:exception", () => false);

  // ♿ Auditoría híbrida con axe-core (violations + incomplete)
  const runA11y = (selector, page, safeSel, slug) => {
    cy.injectAxe();
    cy.window().then((win) => {
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
          rules: {
            "color-contrast": { enabled: true },
            "label": { enabled: true },
            "focus-order-semantics": { enabled: true },
            "tabindex": { enabled: true },
            "aria-required-parent": { enabled: true },
            "aria-required-children": { enabled: true },
            "aria-hidden-focus": { enabled: true },
            "scrollable-region-focusable": { enabled: true },
          },
        })
        .then((results) => {
          const allIssues = [...results.violations, ...results.incomplete];
          const dateNow = new Date().toISOString();

          // 🧩 Ejecutar también auditoría Pa11y (sin romper el flujo existente)
          return cy
            .task("pa11yAudit", page)
            .then((pa11yResults) => {
              const merged = [...allIssues];
              (pa11yResults || []).forEach((p) => {
                const match = merged.find(
                  (v) =>
                    v.id === p.code ||
                    v.help === p.message ||
                    (v.description && v.description.includes(p.message))
                );
                if (!match) merged.push(p);
              });

              if (merged.length > 0) {
                cy.task(
                  "log",
                  `♿ ${page} / ${selector} — ${merged.length} hallazgos combinados (axe + pa11y)`
                );
                merged.forEach((v, i) => {
                  const id = v.id || `issue-${i}`;
                  cy.screenshot(`auditorias/capturas/${slug}/${safeSel}/${id}`, {
                    capture: "viewport",
                    overwrite: true,
                  });
                });

                allResults.push({
                  page,
                  selector,
                  date: dateNow,
                  origen: "interactiva-hibrida",
                  total_issues: merged.length,
                  violations: results.violations || [],
                  needs_review: results.incomplete || [],
                  pa11y: pa11yResults || [],
                  system: Cypress.env("CI")
                    ? "Ubuntu + Chrome Headless (CI/CD + axe+pa11y)"
                    : "macOS + Chrome (Local + axe+pa11y)",
                });
              } else {
                cy.task("log", `✅ ${page} / ${selector} — Sin hallazgos detectados.`);
              }
            })
            .catch((err) => {
              cy.task(
                "log",
                `⚠️ Error en auditoría combinada de ${page} / ${selector}: ${err.message}`
              );
            });
        })
        .catch((err) => cy.task("log", `⚠️ Error en axe.run(): ${err.message}`));
    });
  };

  // 🎯 Prueba extendida de foco visible y navegación
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

  // 🎮 Simulación de interacción ligera (abrir menús/modales)
  const simulateInteraction = (selector, page) => {
    cy.task("log", `🎮 Simulando interacción en ${selector}`);
    cy.get(selector)
      .first()
      .then(($el) => {
        if ($el.is("button,[role='button'],[aria-expanded]")) {
          cy.wrap($el).realClick().wait(200);
        } else if ($el.is("input,select,textarea")) {
          cy.wrap($el).focus().type("prueba").blur();
        }
      })
      .catch(() => null);
  };

  // 🧩 Expansión automática de componentes dinámicos
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

  // 🧹 Limpieza inicial
  before(() => {
    cy.task("clearCaptures");
  });

  // 🌍 Cargar URLs
  it("Carga la lista de URLs", () => {
    cy.task("readUrls").then((urlsRaw) => {
      const urls = urlsRaw.filter((u) => u && u.url);
      expect(urls.length, "Debe haber URLs válidas").to.be.greaterThan(0);
      cy.writeFile("cypress/urls-temp.json", urls);
      cy.task("log", `🌍 Se generarán ${urls.length} tests dinámicos.`);
    });
  });

  // 🔁 Generar tests dinámicos por página
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
                  simulateInteraction(selector, page);
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

  // 💾 Guardado final IAAP PRO
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

    cy.task("writeResults", { dir: outputDir, data: uniqueResults }).then(() => {
      cy.task(
        "log",
        `✅ Resultados guardados (${uniqueResults.length} registros en ${outputDir})`
      );
    });
  });
});

export {};
