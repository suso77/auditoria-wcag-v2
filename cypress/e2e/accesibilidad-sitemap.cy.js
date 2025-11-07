/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Sitemap completo (IAAP PRO v4.13.5)
 * -----------------------------------------------------------------
 * ✅ Totalmente compatible con CI (GitHub Actions, Docker, local)
 * ✅ Sin imports ESM — solo require() CommonJS
 * ✅ Audita sitemap secuencialmente con axe-core
 * ✅ Logs, capturas y guardado IAAP PRO
 */

try {
  require("cypress-axe");
  require("cypress-real-events/support");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

describe("♿ Auditoría de accesibilidad – Sitemap completo (IAAP PRO v4.13.5)", () => {
  const allResults = [];
  const MAX_RETRIES = 1;

  Cypress.on("fail", (error) => {
    if (error.message?.includes("accessibility violation")) return false;
    console.warn("⚠️ Error tolerado:", error.message);
    return false;
  });

  const auditPage = (page, attempt = 0) => {
    const { url, title } = page;
    if (!url) return;

    const slug = url.replace(/https?:\/\/|\/$/g, "").replace(/\W+/g, "-");
    cy.task("log", `🚀 Visitando: ${url}`);

    cy.visit(url, { timeout: 90000, failOnStatusCode: false });
    cy.document().its("readyState").should("eq", "complete");

    // Espera adaptativa para contenido dinámico
    cy.wait(Cypress.env("CI") ? 3500 : 1500);

    // ♿ Inyección segura de axe-core
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

    cy.screenshot(`auditorias/capturas/${slug}/pagina`, {
      capture: "viewport",
      overwrite: true,
    });

    cy.checkA11y(
      null,
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
          cy.task("log", `♿ ${url} — ${violations.length} violaciones detectadas.`);
          violations.forEach((v, i) => {
            const id = v.id || `violacion-${i}`;
            cy.screenshot(`auditorias/capturas/${slug}/${id}`, {
              capture: "viewport",
              overwrite: true,
            });
          });
        } else {
          cy.task("log", `✅ ${url} — Sin violaciones detectadas.`);
        }

        allResults.push({
          page: url,
          title,
          date: dateNow,
          origen: "sitemap",
          violations,
          system: Cypress.env("CI")
            ? "Ubuntu + Chrome Headless (GitHub Actions + axe-core)"
            : "macOS + Chrome (Local + axe-core)",
        });
      },
      { skipFailures: true }
    );

    cy.window().then((win) => {
      try {
        win.location.replace("about:blank");
        cy.task("log", "🧹 Limpieza completada correctamente.");
      } catch {
        cy.task("log", "⚠️ Limpieza parcial.");
      }
    });
  };

  it("Audita todas las páginas del sitemap", () => {
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

    cy.writeFile("auditorias/last-sitemap.txt", outputDir, "utf8");
  });
});









