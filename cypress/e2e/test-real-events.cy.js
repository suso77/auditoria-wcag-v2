describe("🧩 Test de cypress-real-events", () => {
  it("Debería escribir y tabular correctamente", () => {
    cy.visit("https://example.cypress.io");
    cy.get("body").realPress("Tab");
    cy.get("body").realType("Hola mundo");
  });
});
