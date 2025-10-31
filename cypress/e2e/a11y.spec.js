/**
 * ♿ Auditoría de accesibilidad total – v2.0
 * -----------------------------------------------------
 * Lee todas las URLs desde scripts/urls.json
 * y ejecuta axe-core en cada una.
 *
 * ✔ Capturas automáticas por página
 * ✔ Reporte JSON con todas las violaciones
 * ✔ Compatible con merge-results y export-to-xlsx
 * -----------------------------------------------------
 */

import "cypress-axe";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const urlsPath = path.join(__dirname, "..", "..", "scripts", "urls.json");
if (!fs.existsSync(urlsPath)) {
  throw new Error("❌ No se encontró scripts/urls.json. Ejecuta primero: npm run crawl");
}

const urls = JSON.parse(fs.readFileSync(urlsPath, "utf8"));
const outputDir = path.join(
  __dirname,
  "..",
  "..",
  "auditorias",
  `${format(new Date(), "dd-MM-yyyy")}-${new URL(urls[0]).hostname}`
);

fs.mkdirSync(outputDir, { recursive: true });

const results = [];

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

        // Guardar resultado por página
        results.push({ url, violations: formatted });

        const screenshotName = url
          .replace(/https?:\/\//, "")
          .replace(/[^\w.-]/g, "_");

        cy.screenshot(`${screenshotName}-audit`, { capture: "fullPage" });
      });
    });
  });

  after(() => {
    const outputFile = path.join(outputDir, "results.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`✅ Resultados guardados en ${outputFile}`);
  });
});

