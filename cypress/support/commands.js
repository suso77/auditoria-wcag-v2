import "cypress-axe";
import { annotateViolation, clearHighlights } from "./highlight.js";

Cypress.Commands.add("inicializarAxe", () => {
  cy.injectAxe();
});

Cypress.Commands.add("auditarAccesibilidad", (context = null, options = null) => {
  cy.checkA11y(context, options, (violations) => {
    cy.task("saveA11yResults", { url: cy.url(), violations });
  });
});

Cypress.Commands.add("axeHighlight", (violations = []) => {
  return cy.window().then((win) => {
    clearHighlights(win);

    if (!Array.isArray(violations) || violations.length === 0) {
      return [];
    }

    const annotated = [];

    violations.forEach((violation, index) => {
      const annotation = annotateViolation(win, violation, index + 1);
      if (annotation) {
        annotated.push({
          ...violation,
          annotation,
        });
      }
    });

    return annotated;
  });
});
