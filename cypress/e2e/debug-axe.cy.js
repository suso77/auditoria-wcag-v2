import 'cypress-axe';

describe('Debug axe', () => {
  it('verifica que axe se inyecta', () => {
    cy.visit('https://example.cypress.io');
    cy.injectAxe();
    cy.window().then((win) => {
      if (win.axe) {
        cy.log('✅ axe-core cargado correctamente');
      } else {
        cy.log('❌ axe-core NO está disponible');
      }
    });
  });
});
