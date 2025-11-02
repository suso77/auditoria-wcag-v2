/// <reference types="cypress" />

/**
 * ♿ Auditoría de accesibilidad - axe-core (modo resiliente)
 * ------------------------------------------------------------
 * ✅ Audita todas las URLs del sitio sin detenerse
 * ✅ Ignora errores de red, JS o 404
 * ✅ Guarda TODAS las violaciones encontradas
 * ✅ Compatible con merge-results.cjs y export-to-xlsx.cjs
 */

import "cypress-axe";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import urls from "../../scripts/urls.json";

const outputDir = path.join("auditorias");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const timestamp = dayjs().format("YYYY-MM-DD-HHmmss");
const resultsFile = path.join(outputDir, `${timestamp}-results.json`);
const results = [];

// 🔧 Evitar que Cypress se corte por errores de JS o red
Cypress.on("uncaught:exception", () => false);

describe("♿ Auditoría de accesibilidad (resiliente)", () => {
  urls.forEach((url, index) => {
    it(`(${index + 1}/${urls.length}) Audita: ${url}`, () => {
      cy.visit(url, {
        failOnStatusCode: false,
        timeout: 60000, // 1 minuto por página
      });

      cy.injectAxe();

      cy.checkA11y(null, null, (violations) => {
        const total = violations.length;
        const critical = violations.filter(v => v.impact === "critical").length;
        const serious = violations.filter(v => v.impact === "serious").length;
        const moderate = violations.filter(v => v.impact === "moderate").length;
        const minor = violations.filter(v => v.impact === "minor").length;

        cy.task(
          "log",
          `♿ ${url} — ${total} violaciones (critical: ${critical}, serious: ${serious}, moderate: ${moderate}, minor: ${minor})`
        );

        const formatted = violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map(node => ({
            html: node.html?.trim().substring(0, 1000) || "(sin HTML)",
            target: node.target || [],
            failureSummary: node.failureSummary || "",
          })),
        }));

        results.push({
          url,
          total,
          critical,
          serious,
          moderate,
          minor,
          violations: formatted,
        });

        const screenshotName = url
          .replace(/https?:\/\//, "")
          .replace(/[^\w.-]/g, "_");

        cy.screenshot(`${screenshotName}-audit`, { capture: "fullPage" });
      });
    });
  });

  after(() => {
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`✅ Resultados guardados en ${resultsFile}`);
  });
});
