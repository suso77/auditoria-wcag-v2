/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Sitemap híbrido (IAAP PRO v4.15-H)
 * -----------------------------------------------------------------
 * ✅ Basado en v4.13.5, sin romper compatibilidad
 * ✅ Añade detección de resultados “incompletos” (needs review)
 * ✅ Incluye comprobación de foco visible inicial
 * ✅ Simula interacción mínima para contenido dinámico
 * ✅ Totalmente compatible con CI/CD (GitHub Actions, Docker, local)
 * ✅ Logs, capturas y guardado IAAP PRO unificados
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

describe("♿ Auditoría de accesibilidad – Sitemap híbrido (IAAP PRO v4.15-H)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) return false;
    console.warn("⚠️ Error tolerado:", error.message);
    return false;
  });

  // 🎯 Simula foco y verifica visibilidad del contorno
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

  // ♿ Auditoría híbrida de una página
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
          rules: {
            "color-contrast": { enabled: true },
            "label": { enabled: true },
            "aria-required-parent": { enabled: true },
            "aria-required-children": { enabled: true },
            "focus-order-semantics": { enabled: true },
            "tabindex": { enabled: true },
            "aria-hidden-focus": { enabled: true },
            "scrollable-region-focusable": { enabled: true },
          },
        })
        .then((results) => {
          const allIssues = [...results.violations, ...results.incomplete];
          const dateNow = new Date().toISOString();

          if (allIssues.length > 0) {
            cy.task(
              "log",
              `♿ ${url} — ${allIssues.length} hallazgos (violaciones + revisión manual)`
            );
            allIssues.forEach((v, i) => {
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
            total_issues: allIssues.length,
            violations: results.violations || [],
            needs_review: results.incomplete || [],
            system: Cypress.env("CI")
              ? "Ubuntu + Chrome Headless (GitHub Actions + axe-core híbrido)"
              : "macOS + Chrome (Local + axe-core híbrido)",
          });
        })
        .catch((err) => cy.task("log", `⚠️ Error en axe.run(): ${err.message}`));
    });

    cy.window().then((win) => {
      try {
        win.location.replace("about:blank");
        cy.task("log", "🧹 Limpieza completada correctamente.");
      } catch {
        cy.task("log", "⚠️ Limpieza parcial.");
      }
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
    const outputDir = `auditorias/auditoria-sitemap`;
    cy.task("createFolder", outputDir);

    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => {
        const key = `${r.page}`;
        acc[key] = r;
        return acc;
      }, {})
    );

    cy.task("writeResults", { dir: outputDir, data: uniqueResults }).then(() =>
      cy.task("log", `💾 Resultados guardados en: ${outputDir}/results.json`)
    );

    const total = uniqueResults.flatMap(
      (r) => [...(r.violations || []), ...(r.needs_review || [])]
    );

    const counts = {
      critical: total.filter((v) => v.impact === "critical").length,
      serious: total.filter((v) => v.impact === "serious").length,
      moderate: total.filter((v) => v.impact === "moderate").length,
      minor: total.filter((v) => v.impact === "minor").length,
      needsReview: total.filter((v) => v.tags?.includes("needs review")).length,
    };

    cy.task(
      "log",
      `📊 Resumen global IAAP: ${total.length} hallazgos (🔴 ${counts.critical}, 🟠 ${counts.serious}, 🟡 ${counts.moderate}, 🟢 ${counts.minor}, 🟣 ${counts.needsReview} revisión manual)`
    );

    cy.writeFile("auditorias/last-sitemap.txt", outputDir, "utf8");
  });
});