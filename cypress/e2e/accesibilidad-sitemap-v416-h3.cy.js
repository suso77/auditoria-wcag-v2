// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Sitemap combinado (IAAP PRO v4.16-H3)
 * -----------------------------------------------------------------
 * ✅ Combina axe-core + Pa11y (HTML_CodeSniffer)
 * ✅ Auditoría secuencial bloqueante (sin interrupciones)
 * ✅ Logs, capturas y resultados IAAP PRO unificados
 * ✅ Compatible con Cypress ≥ 15.x y Node ≥ 20
 * ✅ Manejo robusto de errores y aislamiento por URL
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

// 🔧 Fusión de resultados axe + Pa11y
function mergeResults(axeViolations = [], pa11yResults = []) {
  const merged = [...axeViolations];
  for (const issue of pa11yResults) {
    const match = merged.find(
      (v) =>
        v.id === issue.code ||
        v.help === issue.message ||
        (v.description && v.description.includes(issue.message))
    );
    if (!match) merged.push(issue);
  }
  return merged;
}

describe("♿ Auditoría de accesibilidad – Sitemap combinado (IAAP PRO v4.16-H3)", () => {
  const allResults = [];

  // 👁️ Comprobación de foco visible
  const checkInitialFocus = (pageUrl) => {
    return cy.realPress("Tab").then(() => {
      cy.focused().then(($f) => {
        const visible =
          $f && ($f.css("outline-style") !== "none" || $f.css("box-shadow") !== "none");
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
      });
    });
  };

  // 🔄 Interacciones ligeras para contenido dinámico
  const simulateLightInteraction = () => {
    const selectors = [
      "[aria-expanded='false']",
      "[data-toggle]",
      "[data-accordion]",
      "[role='tab']",
      ".accordion button",
      ".dropdown-toggle",
    ];
    return cy.get("body").then(($body) => {
      selectors.forEach((sel) => {
        if ($body.find(sel).length > 0) {
          cy.get(sel).click({ multiple: true, force: true }).wait(200);
        }
      });
    });
  };

  // 🧩 Auditoría individual de página
  const auditPage = (page) => {
    const { url, title } = page;
    if (!url) return cy.task("log", "⚠️ URL vacía omitida.");

    const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
    cy.task("log", `🚀 Visitando: ${url}`);

    return cy
      .visit(url, { timeout: 120000, failOnStatusCode: false })
      .then(() => cy.document().its("readyState").should("eq", "complete"))
      .then(() => cy.injectAxe())
      .then(() => simulateLightInteraction())
      .then(() => checkInitialFocus(url))
      .then(() =>
        cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
          capture: "viewport",
          overwrite: true,
        })
      )
      .then(() =>
        cy.window().then((win) => {
          if (!win.axe) {
            cy.task("log", `⚠️ axe-core no detectado en ${url}`);
            return;
          }

          return win.axe
            .run(win.document, {
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
            .then((axeResults) => {
              const allIssues = [...axeResults.violations, ...axeResults.incomplete];
              cy.task("log", `♿ ${url} — ${allIssues.length} hallazgos (axe-core)`);

              return cy
                .task("pa11yAudit", url)
                .then((pa11yResults) => {
                  const merged = mergeResults(
                    axeResults.violations || [],
                    pa11yResults || []
                  );

                  const dateNow = new Date().toISOString();
                  allResults.push({
                    page: url,
                    title,
                    date: dateNow,
                    origen: "sitemap-combinado",
                    total_issues: merged.length,
                    violations: merged,
                    needs_review: axeResults.incomplete || [],
                  });

                  if (merged.length === 0) {
                    cy.task("log", `✅ ${url} — Sin hallazgos detectados.`);
                  } else {
                    merged.forEach((v, i) => {
                      cy.screenshot(`auditorias/capturas/${slug}/${v.id || i}`, {
                        capture: "viewport",
                        overwrite: true,
                      });
                    });
                  }
                });
            })
            .catch((err) => {
              cy.task("log", `⚠️ Error en axe.run() en ${url}: ${err.message}`);
            });
        })
      )
      .then(() => cy.wait(2000))
      .then(() => cy.task("log", `✅ Página finalizada: ${url}`))
      .then(null, (err) => {
        cy.task("log", `⚠️ Error controlado en ${url}: ${err.message}`);
      });
  };

  // 🔁 Auditoría secuencial bloqueante (una página tras otra)
  it("Audita todas las páginas del sitemap (modo combinado)", () => {
    cy.viewport(1366, 768);
    cy.task("clearCaptures");

    return cy.task("readUrls").then((pages) => {
      if (!pages?.length) {
        cy.task("log", "⚠️ No hay URLs válidas para auditar.");
        return;
      }

      cy.task("log", `🌍 URLs cargadas correctamente (${pages.length})`);

      let chain = cy.wrap(null);
      pages.forEach((page, i) => {
        chain = chain.then(() => {
          cy.task("log", `🧭 Auditando página ${i + 1}/${pages.length}: ${page.url}`);
          return auditPage(page);
        });
      });

      return chain.then(() => {
        cy.task("log", "🏁 Auditoría completada para todas las páginas del sitemap.");
      });
    });
  });

  // 💾 Guardado final + resumen Markdown
  after(() => {
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        acc[r.page] = r;
        return acc;
      }, {})
    );

    cy.task("writeResults", { dir: outputDir, data: uniqueResults }).then(() =>
      cy.task("log", `💾 Resultados guardados en ${outputDir}/results.json`)
    );

    const total = uniqueResults.flatMap(
      (r) => [...(r.violations || []), ...(r.needs_review || [])]
    );
    const counts = {
      critical: total.filter((v) => v.impact === "critical").length,
      serious: total.filter((v) => v.impact === "serious").length,
      moderate: total.filter((v) => v.impact === "moderate").length,
      minor: total.filter((v) => v.impact === "minor").length,
    };

    cy.task(
      "log",
      `📊 Resumen global IAAP combinado: ${total.length} hallazgos (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor})`
    );

    const markdown = `
# ♿ Informe de Accesibilidad IAAP PRO – Resumen global
**Fecha:** ${new Date().toLocaleString()}

| Nivel | Descripción | Total |
|:------|:-------------|------:|
| 🔴 Crítico | Errores graves que bloquean el acceso | ${counts.critical} |
| 🟠 Grave | Problemas severos de accesibilidad | ${counts.serious} |
| 🟡 Moderado | Impacto medio o situacional | ${counts.moderate} |
| 🟢 Menor | Errores leves o cosméticos | ${counts.minor} |
| **Total** | **Hallazgos combinados** | **${total.length}** |

Generado automáticamente con IAAP PRO (axe-core + Pa11y).
`;
    cy.writeFile(`${outputDir}/resumen.md`, markdown);
  });
});

export {};
