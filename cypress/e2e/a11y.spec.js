/**
 * ♿ Auditoría completa de accesibilidad – Modo resiliente
 * -----------------------------------------------------
 * ✅ Audita todas las URLs (aunque haya errores HTTP o JS)
 * ✅ No se corta por fallos o timeouts
 * ✅ Guarda todas las violaciones por URL
 * ✅ Compatible con merge-results y export-to-xlsx
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
  `${format(new Date(), "yyyy-MM-dd-HHmmss")}-auditoria`
);

fs.mkdirSync(outputDir, { recursive: true });

const results = [];

describe("♿ Auditoría completa de accesibilidad (modo tolerante)", () => {
  // ⚙️ No interrumpir la ejecución ante errores
  Cypress.on("uncaught:exception", () => false);

  urls.forEach((url, index) => {
    it(`(${index + 1}/${urls.length}) Audita: ${url}`, () => {
      cy.visit(url, {
        failOnStatusCode: false,
        timeout: 60000, // 1 minuto máximo por página
      });

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

        results.push({
          url,
          status: violations.length === 0 ? "✅ Sin violaciones" : `❌ ${violations.length} violaciones`,
          violations: formatted,
        });

        const screenshotName = url
          .replace(/https?:\/\//, "")
          .replace(/[^\w.-]/g, "_");

        cy.screenshot(`${screenshotName}-audit`, { capture: "fullPage" });

        cy.task(
          "log",
          `♿ ${url} — ${violations.length} violaciones detectadas`
        );
      });
    });
  });

  after(() => {
    const outputFile = path.join(outputDir, "results.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`✅ Resultados guardados en ${outputFile}`);
  });
});
