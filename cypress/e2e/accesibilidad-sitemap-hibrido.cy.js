/// <reference types="cypress" />

/**
 * ♿ Auditoría de Accesibilidad — Sitemap Híbrido IAAP PRO v6.5
 * ---------------------------------------------------------------------
 * 🔹 Evalúa accesibilidad estructural y contenido estático (sin interacción)
 * 🔹 Ejecuta SOLO axe-core 
 * 🔹 Excluye componentes interactivos (analizados en la auditoría dinámica)
 * 🔹 Guarda resultados por URL, genera resumen y results.json deduplicado
 * 🔹 Compatible con merge-auditorias.mjs v6.5
 */

import { CONFIG } from "../../config/audit-config.mjs";

describe("♿ Auditoría Sitemap Híbrido — IAAP PRO v6.5", () => {
  const auditoriaDir = "auditorias/auditoria-sitemap";
  const urlsFile = CONFIG.sitemap.urlsFile || "scripts/urls-sitemap.json";

  let resumenGlobal = [];
  let resultadosCompletos = [];

  before(() => {
    cy.task("log", "🧩 Iniciando auditoría IAAP PRO Sitemap (solo axe-core)...");
    cy.task("createFolder", auditoriaDir);
  });

  it("🌍 Ejecuta auditoría axe-core sobre contenido estático", () => {
    cy.task("readUrls", urlsFile).then((urls) => {
      if (!urls || urls.length === 0) {
        cy.task("log", `⚠️ No se encontraron URLs en ${urlsFile}`);
        return;
      }

      cy.task("log", `🌐 Total de URLs cargadas: ${urls.length}`);

      cy.wrap(urls).each(({ url, title }, index) => {
        cy.task("log", `\n🧭 [${index + 1}/${urls.length}] Auditando ${url}`);

        cy.visit(url, { timeout: 90000, failOnStatusCode: false });
        cy.document().its("readyState").should("eq", "complete");
        cy.wait(3000);

        // 🔹 Remueve componentes interactivos (analizados en la auditoría dinámica)
        cy.window().then((win) => {
          const selectorsToRemove = [
            "nav button, nav [role='button']",
            "form, input, select, textarea, button",
            "[aria-modal='true'], [role='dialog'], .modal, .overlay",
            "[data-slider], .carousel, .swiper, .slick-slider",
          ];
          selectorsToRemove.forEach((sel) => {
            win.document.querySelectorAll(sel).forEach((el) => el.remove());
          });
        });

        cy.window().then(async (win) => {
          let axeIssues = [];

          // --- axe-core ---
          try {
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

            axeIssues = results.violations.map((v) => ({
              engine: "axe-core",
              id: v.id,
              impact: v.impact || "unknown",
              description: v.description,
              helpUrl: v.helpUrl,
              selector: v.nodes?.[0]?.target?.[0] || "",
              pageUrl: url,
              title: title || "",
              source: "sitemap",
            }));

            cy.task("log", `✅ axe-core: ${axeIssues.length} violaciones detectadas`);
          } catch (err) {
            cy.task("log", `❌ Error ejecutando axe-core: ${err.message}`);
          }

          resultadosCompletos.push(...axeIssues);

          // --- Guardar resultados individuales ---
          const slug = url
            .replace(/^https?:\/\//, "")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 90);
          const individualPath = `${auditoriaDir}/${slug}.json`;
          cy.writeFile(individualPath, JSON.stringify(axeIssues, null, 2), { log: false });

          // --- Captura de evidencia general ---
          cy.screenshot(`${auditoriaDir}/${index + 1}-${slug}`, { capture: "fullPage" });

          // --- Registro resumen global ---
          resumenGlobal.push({
            index: index + 1,
            url,
            title: title || "",
            axe: axeIssues.length,
            total: axeIssues.length,
          });

          // Guardado parcial CI/CD
          cy.task("writeResults", {
            dir: auditoriaDir,
            data: resumenGlobal,
            filename: "results-sitemap-temp.json",
          });
        });
      });
    });
  });

  after(() => {
    cy.task("log", "\n🧾 Finalizando auditoría Sitemap IAAP PRO (solo axe-core)...");
    const resumenPath = `${auditoriaDir}/resumen-final.json`;
    const markdownPath = `${auditoriaDir}/resumen-final.md`;
    const resultsJson = `${auditoriaDir}/results.json`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // --- Guardar resumen ---
    cy.writeFile(resumenPath, JSON.stringify(resumenGlobal, null, 2), { log: false });

    const markdownResumen = [
      "# 📊 Resumen final de auditoría IAAP PRO Sitemap v6.5",
      "",
      "| Nº | URL | axe-core | Total |",
      "|----|-----|----------|--------|",
      ...resumenGlobal.map(
        (r) =>
          `| ${r.index} | [${r.url}](${r.url}) | ${r.axe} | **${r.total}** |`
      ),
      "",
      `**Total de páginas auditadas:** ${resumenGlobal.length}`,
      `**Fecha:** ${new Date().toLocaleString("es-ES")}`,
    ].join("\n");
    cy.writeFile(markdownPath, markdownResumen, { log: false });

    // --- Deduplicación y export final ---
    const unique = Object.values(
      resultadosCompletos.reduce((acc, r) => {
        const key = `${r.engine}-${r.id}-${r.pageUrl}-${r.selector}`;
        if (!acc[key]) acc[key] = r;
        return acc;
      }, {})
    );

    cy.writeFile(resultsJson, JSON.stringify(unique, null, 2), { log: false });
    cy.writeFile(`${auditoriaDir}/results-sitemap-${timestamp}.json`, JSON.stringify(unique, null, 2));

    cy.task("log", `✅ Archivo principal exportado → ${resultsJson}`);
    cy.task("log", `📊 Total final: ${unique.length} issues deduplicados`);

    cy.readFile(resultsJson, { log: false }).then((data) => {
      if (!Array.isArray(data) || data.length === 0) {
        cy.task("log", "⚠️ results.json vacío o no válido");
      } else {
        cy.task("log", `🧩 Verificación OK — ${data.length} registros exportados`);
      }
    });
  });
});
