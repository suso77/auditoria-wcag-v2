import 'cypress-axe';

// Inicializa axe en cada test
Cypress.on('uncaught:exception', (err) => {
  console.warn('⚠️ Error ignorado en test:', err.message);
  return false;
});

// Inyecta axe solo si el comando está disponible
if (typeof cy !== 'undefined' && typeof cy.injectAxe === 'function') {
  beforeEach(() => {
    cy.injectAxe();
  });
}

