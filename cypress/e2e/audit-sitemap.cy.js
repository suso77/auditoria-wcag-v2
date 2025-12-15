/// <reference types="cypress" />

const urls = require("../../scripts/urls.json");

describe("IAAP PRO – Auditoría SITEMAP (estable)", () => {
  urls.forEach(({ url }, index) => {
    const id = `${index + 1}`.padStart(3, "0");

    it(`(${id}) Auditoría AXE → ${url}`, () => {
      cy.task("log", `[AXE] 🚀 Visitando → ${url}`);

      cy.visit(url, { failOnStatusCode: false });

      cy.get("body", { timeout: 8000 }).should("not.be.empty");
      cy.wait(500);

      cy.injectAxe();

      cy.checkA11y(
        null,
        {
          runOnly: ["wcag2a", "wcag2aa", "best-practice"],
          includedImpacts: ["minor", "moderate", "serious", "critical"],
        },
        (violations) => {
          cy.task("log", `[AXE] 🧪 ${violations.length} violaciones en ${url}`);

          cy.task("writeResults", {
            dir: "auditorias/sitemap",
            filename: `sitemap-${id}.json`,
            data: {
              url,
              violations,
              timestamp: new Date().toISOString(),
            },
          });
        }
      );
    });
  });
});





