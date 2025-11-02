/**
 * ♿ Auditoría de accesibilidad total – v2.1
 * -----------------------------------------------------
 * Lee todas las URLs desde scripts/urls.json
 * y ejecuta axe-core en cada una.
 *
 * ✔ Capturas automáticas por página
 * ✔ Resultados por página → /auditorias
 * ✔ Compatible con merge-results y export-to-xlsx
 * -----------------------------------------------------
 */

require("cypress-axe");
const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");

const urlsPath = path.join(__dirname, "..", "..", "scripts", "urls.json");

if (!fs.existsSync(urlsPath)) {
  throw new Error("❌ No se encontró scripts/urls.json. Ejecuta primero: npm run crawl");
}

// 🔗 Leer URLs rastreadas
const urls = JSON.parse(fs.readFileSync(urlsPath, "utf8"));
if (!urls || !urls.length) {
  throw new Error("❌ No se encontraron URLs en scripts/urls.json");
}

// 📁 Directorio de salida
const fecha = format(new Date(), "yyyy-MM-dd");
const dominio = new URL(urls[0]).hostname.replace(/\W+/g, "-");
const outputDir = path.join(__dirname, "..", "..", "auditorias", `${fecha}-${dominio}`);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Carpeta de auditoría creada: ${outputDir}`);
}

describe("♿ Auditoría completa de accesibilidad (axe-core)", () => {
  urls.forEach((url) => {
    it(`Audita: ${url}`, () => {
      cy.visit(url, { failOnStatusCode: false });
      cy.injectAxe();

      cy.checkA11y(null, null, (violations) => {
        const formatted = violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        }));

        // 📸 Captura de pantalla
        const screenshotName = url
          .replace(/https?:\/\//, "")
          .replace(/[^\w.-]/g, "_");
        cy.screenshot(`${screenshotName}-audit`, { capture: "fullPage" });

        // 🧩 Guardar resultados por página
        const safeName = screenshotName.substring(0, 80);
        const outputFile = path.join(
          outputDir,
          `results-${safeName}-${Date.now()}.json`
        );

        fs.writeFileSync(
          outputFile,
          JSON.stringify([{ url, violations: formatted }], null, 2)
        );

        console.log(`✅ Resultados guardados: ${outputFile}`);
      });
    });
  });
});
