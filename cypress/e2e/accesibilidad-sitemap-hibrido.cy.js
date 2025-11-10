/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Sitemap híbrido (IAAP PRO v4.16-H3)
 * -----------------------------------------------------------------
 * ✅ Basado en v4.15-H, con guardado IAAP PRO unificado
 * ✅ Añade integración Pa11y (opcional)
 * ✅ Conserva foco visible, interacción ligera y logs IAAP PRO
 * ✅ Totalmente compatible con CI/CD y merge automatizado
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

describe("♿ Auditoría de accesibilidad – Sitemap híbrido (IAAP PRO v4.16-H3)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  Cypress.on("fail", () => false);
  Cypress.on("uncaught:exception", () => false);

  // 🎯 Verifica foco visible inicial
  const checkInitialFocus = (pageUrl) => {
    cy.realPress("Tab").catch(() => null);
    cy.focused()
      .then(($f) => {
        if ($f && $f.prop) {
          const visible =
            $f.css("outline-style") !== "none" || $f.css("box-shadow") !== "none";
          if (!visible) {
            allResults.push({
              page: pageUrl,
              origen: "foco-visible",
              description: "Elemento inicial con foco sin indicador visible",
              wcag: "2.4.7",
              impact: "serious",
            });
            cy.task("log", `⚠️ Foco invisible detectado en ${pageUrl}`);
          } else {
            cy.task("log", `✅ Foco visible correcto en ${pageUrl}`);
          }
        }
      })
      .catch(() => null);
  };

  // 🎮 Simula interacción ligera (expande menús o acordeones)
  const simulateLightInteraction = () => {
    const selectors = [
      "[aria-expanded='false']",
      "[data-toggle]",
      "[data-accordion]",
      "[role='tab']",
      ".accordion button",
      ".dropdown-toggle",
    ];
    selectors.forEach((sel) => {
      cy.get("body").then(($body) => {
        if ($body.find(sel).length > 0) {
          cy.get(sel).click({ multiple: true, force: true }).wait(200);
        }
      });
    });
  };

  // ♿ Auditoría híbrida con axe-core + Pa11y (opcional)
  const auditPage = (page, attempt = 0) => {
    const { url, title } = page;
    if (!url) return;

    const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
    cy.task("log", `🚀 Visitando: ${url}`);

    cy.visit(url, { timeout: 90000, failOnStatusCode: false });
    cy.document().its("readyState").should("eq", "complete");
    cy.wait(Cypress.env("CI") ? 3500 : 1500);

    cy.injectAxe();

    cy.window().then((win) => {
      const axeOK = !!win.axe;
      cy.task("log", `🧠 axe-core presente en ${url}: ${axeOK}`);
      if (!axeOK && attempt < MAX_RETRIES) {
        cy.task("log", `🔁 Reintentando inyección de axe-core en ${url}`);
        auditPage(page, attempt + 1);
        return;
      }
    });

    simulateLightInteraction();
    checkInitialFocus(url);

    cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
      capture: "viewport",
      overwrite: true,
    });

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
        })
        .then((results) => {
          const allIssues = [...(results.violations || []), ...(results.incomplete || [])];
          const dateNow = new Date().toISOString();

          // 🧩 Ejecutar también auditoría Pa11y si existe la tarea
          cy.task("pa11yAudit", url)
            .then((pa11yResults = []) => {
              const merged = [...allIssues];
              pa11yResults.forEach((p) => {
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
                  `♿ ${url} — ${merged.length} hallazgos combinados (axe + pa11y)`
                );
                merged.forEach((v, i) => {
                  const id = v.id || `issue-${i}`;
                  cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
                    capture: "viewport",
                    overwrite: true,
                  });
                });
              } else {
                cy.task("log", `✅ ${url} — Sin hallazgos detectados.`);
              }

              allResults.push({
                page: url,
                title,
                date: dateNow,
                origen: "sitemap-hibrido",
                total_issues: merged.length,
                violations: results.violations || [],
                needs_review: results.incomplete || [],
                pa11y: pa11yResults || [],
                system: Cypress.env("CI")
                  ? "Ubuntu + Chrome Headless (GitHub Actions + axe+pa11y)"
                  : "macOS + Chrome (Local + axe+pa11y)",
              });
            })
            .catch((err) =>
              cy.task("log", `⚠️ Error combinando Pa11y en ${url}: ${err.message}`)
            );
        })
        .catch((err) => cy.task("log", `⚠️ Error en axe.run(): ${err.message}`));
    });
  };

  // 🔁 Auditoría secuencial del sitemap
  it("Audita todas las páginas del sitemap (modo híbrido)", () => {
    cy.viewport(1280, 720);
    cy.task("clearCaptures");

    cy.task("readUrls").then((urlsRaw) => {
      const pages = urlsRaw.filter((p) => p && p.url && !p.error);
      cy.task("log", `🌍 URLs cargadas (${pages.length}) desde scripts/urls.json`);

      if (pages.length === 0) {
        cy.task("log", "⚠️ No hay URLs válidas para auditar.");
        return;
      }

      cy.wrap(null).then(() => {
        const runSequential = (i = 0) => {
          if (i >= pages.length) return;
          const page = pages[i];
          cy.task("log", `🔎 Auditando página ${i + 1}/${pages.length}: ${page.url}`);
          auditPage(page);
          cy.then(() => runSequential(i + 1));
        };
        runSequential();
      });
    });
  });

  // 💾 Guardado final IAAP PRO
  after(() => {
    const outputDir = "auditorias/auditoria-sitemap";
    cy.task("createFolder", outputDir);
    cy.task("log", `💾 Guardando resultados Sitemap IAAP PRO...`);

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
        `✅ Resultados Sitemap guardados (${uniqueResults.length} registros en ${outputDir})`
      );
    });
  });
});

export {};
