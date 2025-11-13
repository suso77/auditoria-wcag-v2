/// <reference types="cypress" />

/**
 * ♿ Auditoría de Accesibilidad – Interactiva IAAP PRO v6.5
 * ---------------------------------------------------------------------
 * 🔹 Evalúa comportamientos dinámicos, foco, menús, formularios y overlays
 * 🔹 Ejecuta SOLO Pa11y (con fallback a axe-core si Pa11y falla)
 * 🔹 Añade origen "interactiva" para merge IAAP PRO
 * 🔹 Genera capturas de evidencia tras interacciones simuladas
 * 🔹 Compatible con Node 24+, Cypress 15+, GitHub Actions
 */

import { CONFIG } from "../../config/audit-config.mjs";

describe("🧠 Auditoría de Accesibilidad – Interactiva (IAAP PRO v6.5)", () => {
  const auditoriaDir = "auditorias/auditoria-interactiva";
  const urlsFile = CONFIG.interactiva.urlsFile || "scripts/urls-interactiva.json";

  let resumenGlobal = [];
  let resultadosCompletos = [];

  before(() => {
    cy.task("log", "🧠 Iniciando auditoría IAAP PRO Interactiva (Pa11y + fallback axe-core)...");
    cy.task("createFolder", auditoriaDir);
  });

  it("🎬 Ejecuta Pa11y sobre URLs con interacciones simuladas (fallback: axe-core)", () => {
    cy.task("readUrls", urlsFile).then((urls) => {
      if (!urls || urls.length === 0) {
        cy.task("log", `⚠️ No se encontraron URLs en ${urlsFile}`);
        return;
      }

      cy.task("log", `🌍 Total de URLs interactivas cargadas: ${urls.length}`);
      cy.wrap(urls).each(({ url, title }, index) => {
        cy.task("log", `\n🎬 [${index + 1}/${urls.length}] Simulando interacciones en ${url}`);
        cy.task("clearCaptures");

        cy.visit(url, { timeout: 120000, failOnStatusCode: false });
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(4000);

        // 🔹 Simular interacciones reales
        cy.get("button, [role='button']").first().then(($btn) => {
          if ($btn.length) {
            cy.wrap($btn).click({ force: true });
            cy.task("log", "🖱️ Click ejecutado en botón principal.");
          }
        });

        cy.get("input, textarea, select").first().then(($field) => {
          if ($field.length) {
            cy.wrap($field).focus().type("Prueba de accesibilidad", { delay: 50 });
            cy.task("log", "⌨️ Campo de formulario probado.");
          }
        });

        cy.get("nav button, nav [role='button']").first().then(($menu) => {
          if ($menu.length) {
            cy.wrap($menu).click({ force: true });
            cy.task("log", "📂 Menú principal abierto.");
          }
        });

        cy.wait(1000);

        // --- Auditoría Pa11y (motor principal) ---
        cy.task("pa11yAudit", url).then(async (pa11yResults = []) => {
          let issues = [];

          if (Array.isArray(pa11yResults) && pa11yResults.length > 0) {
            cy.task("log", `♿ Pa11y completado — ${pa11yResults.length} issues detectados.`);
            issues = pa11yResults.map((i) => ({
              engine: "pa11y",
              id: i.code,
              impact: i.type || "notice",
              description: i.message,
              selector: i.selector,
              context: i.context,
              pageUrl: url,
              title: title || "",
              source: "interactiva",
            }));
          } else {
            // --- Fallback a axe-core si Pa11y no devuelve resultados ---
            cy.task("log", "⚠️ Pa11y no devolvió resultados. Activando fallback axe-core...");
            try {
              const win = await cy.window();
              const axe = await import("axe-core");
              win.eval(axe.source);

              const results = await win.axe.run(win.document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                },
                resultTypes: ["violations"],
                reporter: "v2",
              });

              issues = results.violations.map((v) => ({
                engine: "axe-core",
                id: v.id,
                impact: v.impact || "unknown",
                description: v.description,
                helpUrl: v.helpUrl,
                selector: v.nodes?.[0]?.target?.[0] || "",
                pageUrl: url,
                title: title || "",
                source: "interactiva",
              }));

              cy.task("log", `✅ Fallback axe-core completado — ${issues.length} issues detectados.`);
            } catch (err) {
              cy.task("log", `❌ Error en fallback axe-core: ${err.message}`);
            }
          }

          resultadosCompletos.push(...issues);

          // --- Guardar resultados individuales ---
          const slug = url
            .replace(/^https?:\/\//, "")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 90);
          const individualPath = `${auditoriaDir}/${slug}.json`;
          cy.writeFile(individualPath, JSON.stringify(issues, null, 2), { log: false });

          // --- Captura de evidencia del estado interactivo ---
          const screenshotName = `${index + 1}-${slug}-interactivo`;
          cy.screenshot(`${auditoriaDir}/${screenshotName}`, { capture: "viewport" });

          resumenGlobal.push({
            index: index + 1,
            url,
            title: title || "",
            motor: issues[0]?.engine || "unknown",
            total: issues.length,
          });

          // Guardado parcial
          cy.task("writeResults", {
            dir: auditoriaDir,
            data: resumenGlobal,
            filename: "results-interactiva-temp.json",
          });
        });
      });
    });
  });

  after(() => {
    cy.task("log", "\n🧾 Finalizando auditoría IAAP PRO Interactiva v6.5...");
    const resumenPath = `${auditoriaDir}/resumen-final.json`;
    const markdownPath = `${auditoriaDir}/resumen-final.md`;
    const resultsJson = `${auditoriaDir}/results.json`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // --- Guardar resumen JSON ---
    cy.writeFile(resumenPath, JSON.stringify(resumenGlobal, null, 2), { log: false });

    // --- Resumen Markdown ---
    const markdownResumen = [
      "# 📊 Resumen final de auditoría IAAP PRO Interactiva v6.5",
      "",
      "| Nº | URL | Motor usado | Total |",
      "|----|-----|-------------|--------|",
      ...resumenGlobal.map(
        (r) =>
          `| ${r.index} | [${r.url}](${r.url}) | ${r.motor} | **${r.total}** |`
      ),
      "",
      `**Total de páginas auditadas:** ${resumenGlobal.length}`,
      `**Fecha:** ${new Date().toLocaleString("es-ES")}`,
    ].join("\n");

    cy.writeFile(markdownPath, markdownResumen, { log: false });

    // --- Deduplicación final ---
    const unique = Object.values(
      resultadosCompletos.reduce((acc, r) => {
        const key = `${r.engine}-${r.id}-${r.pageUrl}-${r.selector}`;
        if (!acc[key]) acc[key] = r;
        return acc;
      }, {})
    );

    cy.writeFile(resultsJson, JSON.stringify(unique, null, 2), { log: false });
    cy.writeFile(
      `${auditoriaDir}/results-interactiva-${timestamp}.json`,
      JSON.stringify(unique, null, 2),
      { log: false }
    );

    cy.task("log", `✅ Resultados exportados → ${resultsJson}`);
    cy.task("log", `📊 Total final: ${unique.length} issues deduplicados`);

    // --- Verificación final ---
    cy.readFile(resultsJson, { log: false }).then((data) => {
      if (!Array.isArray(data) || data.length === 0) {
        cy.task("log", "⚠️ results.json vacío o no válido");
      } else {
        cy.task("log", `🧩 Verificación OK — ${data.length} registros IAAP PRO exportados`);
      }
    });
  });
});
