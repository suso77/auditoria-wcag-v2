/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad – Interactiva IAAP PRO v5.2
 * ---------------------------------------------------------------------------
 * ✅ Ejecuta axe-core + Pa11y SIEMPRE (no como fallback)
 * ✅ Espera correctamente el DOM (asincronía controlada)
 * ✅ Guarda resultados individuales, globales y resumen
 * ✅ Exporta results.json compatible con merge-auditorias.mjs
 * ✅ Verificación automática de integridad (results.json no vacío)
 * ✅ Compatible con Node 24+, Cypress 15+, GitHub Actions
 */

describe("♿ Auditoría de accesibilidad – Interactiva (IAAP PRO v5.2)", () => {
  const auditoriaDir = "auditorias/auditoria-interactiva";
  let resumenGlobal = [];
  let resultadosCompletos = [];

  before(() => {
    cy.task("clearCaptures");
    cy.task("createFolder", auditoriaDir);
  });

  it("Ejecuta auditoría interactiva completa (axe-core + Pa11y híbrido)", () => {
    cy.task("readUrls").then((urls) => {
      if (!urls || urls.length === 0) {
        cy.task("log", "⚠️ No se encontraron URLs en scripts/urls.json");
        return;
      }

      cy.task("log", `🌍 Cargadas ${urls.length} URLs desde scripts/urls.json`);
      cy.task("log", "🧠 Iniciando ejecución IAAP PRO Interactiva...");

      cy.wrap(urls).each(({ url, title }, index) => {
        cy.task("log", `🧭 [${index + 1}/${urls.length}] Auditando ${url}`);
        cy.task("clearCaptures");

        // --- Carga y espera extendida para entorno CI ---
        cy.visit(url, { timeout: 120000, failOnStatusCode: false });
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(4000);

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
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
              },
              resultTypes: ["violations"],
              reporter: "v2",
            });

            axeIssues = results.violations.map((v) => ({
              engine: "axe-core",
              id: v.id,
              impact: v.impact || "unknown",
              description: v.description,
              helpUrl: v.helpUrl,
              selector: v.nodes?.[0]?.target?.[0] || "",
              pageUrl: url,
              title: title || "",
            }));

            cy.task("log", `✅ axe.run() completado: ${axeIssues.length} violaciones`);
          } catch (err) {
            cy.task("log", `❌ Error ejecutando axe-core: ${err.message}`);
          }

          // --- Pa11y ---
          return cy.task("pa11yAudit", url).then((pa11yResults = []) => {
            if (Array.isArray(pa11yResults)) {
              pa11yIssues = pa11yResults.map((i) => ({
                engine: "pa11y",
                id: i.code,
                impact: i.type || "notice",
                description: i.message,
                selector: i.selector,
                context: i.context,
                pageUrl: url,
                title: title || "",
              }));
            }

            cy.task("log", `[IAAP] ♿ Pa11y completado (${url}) — ${pa11yIssues.length} issues`);

            // --- Unificar resultados ---
            const combined = [...axeIssues, ...pa11yIssues];
            resultadosCompletos.push(...combined);
            cy.task("log", `[IAAP] 🌍 Total combinado: ${combined.length} issues en ${url}`);

            // --- Guardar resultados individuales ---
            const slug = url
              .replace(/^https?:\/\//, "")
              .replace(/[^\w\-]+/g, "_")
              .replace(/_+$/, "");
            const individualPath = `${auditoriaDir}/${slug}.json`;
            cy.writeFile(individualPath, JSON.stringify(combined, null, 2), { log: false });
            cy.task("log", `💾 Guardado OK (${combined.length}) → ${individualPath}`);

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

            // --- Guardado parcial ---
            return cy.task("writeResults", {
              dir: auditoriaDir,
              data: resumenGlobal,
              filename: "results-interactiva-temp.json",
            });
          });
        });
      });
    });
  });

  after(() => {
    cy.task("log", `[IAAP] 🌍 Guardando resumen final IAAP PRO Interactiva...`);

    const resumenPath = `${auditoriaDir}/resumen-final.json`;
    const markdownPath = `${auditoriaDir}/resumen-final.md`;
    const resultsJson = `${auditoriaDir}/results.json`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const timestamped = `${auditoriaDir}/results-interactiva-${timestamp}.json`;

    // --- Guardar resumen JSON ---
    cy.writeFile(resumenPath, JSON.stringify(resumenGlobal, null, 2), { log: false });
    cy.task("log", `💾 Resumen guardado en ${resumenPath}`);

    // --- Guardar resumen Markdown ---
    const markdownResumen = [
      "# 📊 Resumen final de auditoría IAAP PRO Interactiva",
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

    cy.writeFile(markdownPath, markdownResumen, { log: false });
    cy.task("log", `📊 Resumen Markdown creado correctamente.`);

    // --- Unificar resultados (sin duplicados) ---
    const unique = Object.values(
      resultadosCompletos.reduce((acc, r) => {
        const key = `${r.engine}-${r.id}-${r.pageUrl}-${r.selector}`;
        if (!acc[key]) acc[key] = r;
        return acc;
      }, {})
    );

    // --- Guardar principal y con timestamp ---
    cy.writeFile(resultsJson, JSON.stringify(unique, null, 2), { log: false });
    cy.writeFile(timestamped, JSON.stringify(unique, null, 2), { log: false });

    cy.task("log", `✅ Resultados exportados → ${resultsJson}`);
    cy.task("log", `🕒 Copia con timestamp → ${timestamped}`);

    // --- Resumen global numérico ---
    const totalAxe = resumenGlobal.reduce((a, r) => a + r.axe, 0);
    const totalPa11y = resumenGlobal.reduce((a, r) => a + r.pa11y, 0);
    const totalCombined = resumenGlobal.reduce((a, r) => a + r.total, 0);

    cy.task(
      "log",
      `\n📈 RESULTADOS GLOBALES INTERACTIVA\n------------------------------------\n` +
        `🔹 Páginas auditadas: ${resumenGlobal.length}\n` +
        `🔸 Total axe-core: ${totalAxe}\n` +
        `🔸 Total Pa11y: ${totalPa11y}\n` +
        `✅ Total combinado: ${totalCombined}\n`
    );

    // --- Verificación automática ---
    cy.readFile(resultsJson, { log: false }).then(
      (data) => {
        if (!Array.isArray(data) || data.length === 0) {
          cy.task("log", "⚠️ Archivo results.json vacío o no válido");
        } else {
          cy.task("log", `🧾 Verificación OK — ${data.length} registros IAAP PRO exportados`);
        }
      },
      (err) => {
        cy.task("log", `⚠️ Error leyendo results.json: ${err.message}`);
      }
    );
  });
});

