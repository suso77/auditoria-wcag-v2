/**
 * ♿ Auditoría de accesibilidad total – v2.1 (CommonJS + CI)
 * ------------------------------------------------------------
 * 🔹 Lee todas las URLs desde scripts/urls.json
 * 🔹 Ejecuta axe-core en cada una
 * 🔹 Guarda los resultados en auditorias/YYYY-MM-DD-results.json
 * 🔹 Compatible con merge-results.cjs y export-to-xlsx.cjs
 * 🔹 Compatible con GitHub Actions y Node 20
 * ------------------------------------------------------------
 */

import "cypress-axe";
import dayjs from "dayjs";
import urls from "../../scripts/urls.json";

describe("♿ Auditoría completa de accesibilidad (axe-core)", () => {
  urls.forEach((url) => {
    it(`Audita: ${url}`, () => {
      // 🧭 Visitar la URL (aunque haya errores de estado)
      cy.visit(url, { failOnStatusCode: false });

      // Inyectar axe-core
      cy.injectAxe();

      // Ejecutar análisis de accesibilidad
      cy.checkA11y(null, null, (violations) => {
        const total = violations.length;

        if (total === 0) {
          cy.task("log", `✅ ${url} — sin violaciones detectadas`);
          return;
        }

        // 📊 Contadores
        const critical = violations.filter((v) => v.impact === "critical").length;
        const serious = violations.filter((v) => v.impact === "serious").length;
        const moderate = violations.filter((v) => v.impact === "moderate").length;
        const minor = violations.filter((v) => v.impact === "minor").length;

        cy.task(
          "log",
          `♿ ${url} — ${total} violaciones (critical: ${critical}, serious: ${serious}, moderate: ${moderate}, minor: ${minor})`
        );

        // 🧾 Estructura uniforme para exportación
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

        // 📸 Captura completa de pantalla
        const screenshotName = url
          .replace(/https?:\/\//, "")
          .replace(/[^\w.-]/g, "_");
        cy.screenshot(`${screenshotName}-audit`, { capture: "fullPage" });

        // 🧩 Guardar resultados en /auditorias
        const fileName = `${dayjs().format("YYYY-MM-DD")}-results.json`;
        cy.writeFile(`auditorias/${fileName}`, [{ url, violations: formatted }], { flag: "a+" });

        // 💾 Registrar también en GitHub Actions (task)
        cy.task("saveA11yResults", { url, violations: formatted });
      });
    });
  });
});

