/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad detallada (diagnóstico manual)
 * ------------------------------------------------------------
 * ✅ Compatible con CommonJS y Node 20
 * ✅ Guarda resultados JSON válidos por fecha
 * ✅ Logs limpios para GitHub Actions o local
 */

require("cypress-axe");
const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");

// 🔗 Cargar URLs
const urlsPath = path.join(__dirname, "..", "..", "scripts", "urls.json");

if (!fs.existsSync(urlsPath)) {
  throw new Error("❌ No se encontró scripts/urls.json. Ejecuta primero: npm run crawl");
}

const urls = JSON.parse(fs.readFileSync(urlsPath, "utf8"));
if (!urls || !urls.length) {
  throw new Error("❌ No se encontraron URLs en scripts/urls.json");
}

// 📁 Directorio de salida
const fecha = dayjs().format("YYYY-MM-DD");
const domain = new URL(urls[0]).hostname.replace(/\W+/g, "-");
const outputDir = path.join(__dirname, "..", "..", "auditorias");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputFile = path.join(outputDir, `${fecha}-results-${domain}.json`);
console.log(`🧩 Archivo de salida: ${outputFile}`);

describe("♿ Auditoría detallada de accesibilidad (axe-core)", () => {
  urls.forEach((url) => {
    it(`Audita: ${url}`, () => {
      cy.visit(url, { failOnStatusCode: false });
      cy.injectAxe();

      cy.checkA11y(null, null, (violations) => {
        const total = violations.length;

        if (total === 0) {
          console.log(`✅ ${url} — sin violaciones detectadas`);
          return;
        }

        const summary = {
          url,
          total,
          critical: violations.filter(v => v.impact === "critical").length,
          serious: violations.filter(v => v.impact === "serious").length,
          moderate: violations.filter(v => v.impact === "moderate").length,
          minor: violations.filter(v => v.impact === "minor").length,
        };

        console.log(
          `♿ ${url} — ${total} violaciones (🔴 ${summary.critical}, 🟠 ${summary.serious}, 🟡 ${summary.moderate}, 🟢 ${summary.minor})`
        );

        const detailedResults = violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map(node => ({
            target: node.target || [],
            html: node.html?.slice(0, 500) || "(sin HTML)",
          })),
        }));

        // 🧾 Guardar resultados por URL en un JSON acumulativo
        let allResults = [];
        if (fs.existsSync(outputFile)) {
          try {
            allResults = JSON.parse(fs.readFileSync(outputFile, "utf8"));
          } catch {
            allResults = [];
          }
        }

        allResults.push({ ...summary, violations: detailedResults });
        fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

        // 📸 Captura visual
        const screenshotName = url.replace(/https?:\/\//, "").replace(/[^\w.-]/g, "_");
        cy.screenshot(`${screenshotName}-axe-report`, { capture: "fullPage" });
      });
    });
  });
});
