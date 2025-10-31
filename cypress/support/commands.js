import 'cypress-axe';

Cypress.Commands.add('inicializarAxe', () => {
  cy.injectAxe();
});

Cypress.Commands.add('auditarAccesibilidad', (context = null, options = null) => {
  cy.checkA11y(context, options, (violations) => {
    cy.task('saveA11yResults', { url: cy.url(), violations });
  });
});
