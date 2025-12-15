console.log("🟩 IAAP: Overwrite checkA11y activado");

import { urlToFilename } from "./utils";

Cypress.Commands.overwrite(
  "checkA11y",
  (origFn, context, options, callback) => {

    const axeOptions = {
      runOnly: ["wcag2a", "wcag2aa", "best-practice"],
      includedImpacts: ["minor", "moderate", "serious", "critical"],
      ...options,
    };

    const safeCallback = (violations) => {
      const currentUrl = Cypress.config("baseUrl") + Cypress.cy.state("window").location.pathname;

      const filename = `${urlToFilename(currentUrl)}.json`;

      if (violations?.length > 0) {
        cy.task("log", `[AXE] ⚠️ Violaciones detectadas (${violations.length}) en ${currentUrl}`);

        cy.task("writeResults", {
          dir: "auditorias/sitemap",
          filename,
          data: {
            url: currentUrl,
            timestamp: new Date().toISOString(),
            violations,
          },
        });
      }

      if (callback) callback(violations);
    };

    return origFn(context || null, axeOptions, safeCallback);
  }
);


