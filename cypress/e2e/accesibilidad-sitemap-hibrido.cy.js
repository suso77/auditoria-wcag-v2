/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Sitemap híbrido IAAP PRO v4.44 (FINAL TOTAL)
 * ---------------------------------------------------------------------------
 * ✅ axe-core + Pa11y
 * ✅ results.json global + JSON por URL
 * ✅ Captura de pantalla por cada URL
 * ✅ Resumen global con totales
 * ✅ Compatible con Cypress 15+ / Node 24+ / Chrome Headed
 */

describe("♿ Auditoría de accesibilidad – Sitemap híbrido (IAAP PRO v4.44-FINAL TOTAL)", () => {
  const auditoriaDir = "auditorias/auditoria-sitemap";
  let resumenGlobal = [];

  before(() => {
    cy.task("clearCaptures");
    cy.task("createFolder", auditoriaDir);
  });

  it("Audita todas las páginas del sitemap (modo híbrido completo con capturas y resumen)", () => {
    cy.task("readUrls").then((urls) => {
      if (!urls || urls.length === 0) {
        cy.task("log", "⚠️ No se encontraron URLs en scripts/urls.json");
        return;
      }

      cy.task("log", `🌍 URLs cargadas (${urls.length}) desde scripts/urls.json`);
      cy.task("log", "🧠 Iniciando ejecución secuencial IAAP PRO...");

      urls.forEach(({ url, title }, index) => {
        cy.task("log", `🧭 [${index + 1}/${urls.length}] Auditando ${url}`);
        cy.task("clearCaptures");

        cy.visit(url, { timeout: 90000, failOnStatusCode: false });
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(3000);

        cy.window().then(async (win) => {
          let axeIssues = [];
          let pa11yIssues = [];

          // --- axe-core ---
          try {
            const axe = await import("axe-core");
            win.eval(axe.source);
            cy.task("log", "✅ axe-core inyectado correctamente.");

            const results = await win.axe.run(win.document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
              },
            });

            axeIssues = results.violations.map((v) => ({
              engine: "axe-core",
              id: v.id,
              impact: v.impact,
              description: v.description,
              helpUrl: v.helpUrl,
              nodes: v.nodes.length,
            }));

            cy.task("log", `✅ axe.run() completado: ${axeIssues.length} violaciones`);
          } catch (err) {
            cy.task("log", `❌ Error ejecutando axe.run(): ${err.message}`);
          }

          // --- Pa11y ---
          cy.task("pa11yAudit", url).then((pa11yResults = []) => {
            pa11yIssues = pa11yResults.map((i) => ({
              engine: "pa11y",
              code: i.code,
              message: i.message,
              selector: i.selector,
              context: i.context,
              wcag: i.wcag,
            }));

            const combined = [...axeIssues, ...pa11yIssues];
            cy.task("log", `♿ Pa11y completado (${url}) — ${pa11yIssues.length} issues`);

            // --- Guardar resultados globales ---
            cy.task("writeResults", { dir: auditoriaDir, data: combined });

            // --- Guardar resultados individuales ---
            const slug = url
              .replace(/^https?:\/\//, "")
              .replace(/[^\w\-]+/g, "_")
              .replace(/_+$/, "");
            const individualPath = `${auditoriaDir}/${slug}.json`;

            cy.writeFile(individualPath, JSON.stringify(combined, null, 2), { log: false });
            cy.task("log", `💾 Guardado OK (${combined.length} issues) → ${individualPath}`);

            // --- Captura de pantalla ---
            const screenshotName = `${index + 1}-${slug}`;
            cy.screenshot(`${auditoriaDir}/${screenshotName}`, { capture: "fullPage" });
            cy.task("log", `📸 Captura guardada → ${screenshotName}.png`);

            // --- Acumular resumen global ---
            resumenGlobal.push({
              index: index + 1,
              url,
              title: title || "",
              axe: axeIssues.length,
              pa11y: pa11yIssues.length,
              total: combined.length,
            });
          });
        });
      });
    });
  });

  after(() => {
    // --- Guardar resumen global ---
    const resumenPath = `${auditoriaDir}/resumen-final.json`;
    cy.writeFile(resumenPath, JSON.stringify(resumenGlobal, null, 2), { log: false });

    // --- Crear resumen legible (Markdown) ---
    const markdownResumen = [
      "# 📊 Resumen final de auditoría IAAP PRO",
      "",
      "| Nº | URL | axe-core | Pa11y | Total |",
      "|----|-----|----------|--------|--------|",
      ...resumenGlobal.map(
        (r) =>
          `| ${r.index} | [${r.url}](${r.url}) | ${r.axe} | ${r.pa11y} | **${r.total}** |`
      ),
      "",
      `**Total de páginas auditadas:** ${resumenGlobal.length}`,
      `**Fecha:** ${new Date().toLocaleString("es-ES")}`,
    ].join("\n");

    cy.writeFile(`${auditoriaDir}/resumen-final.md`, markdownResumen, { log: false });
    cy.task("log", `📊 Resumen final guardado en JSON y Markdown en ${auditoriaDir}`);
  });
});















