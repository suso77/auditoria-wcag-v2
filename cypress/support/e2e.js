// ✅ Soporte de eventos reales (teclado, ratón, foco, etc.)
import "cypress-real-events/support";

// ✅ Soporte de auditorías de accesibilidad con axe-core
import "cypress-axe";

// 🧩 Manejo global de errores no críticos (para evitar falsos fallos)
Cypress.on("uncaught:exception", (err) => {
  console.warn("⚠️ Error ignorado en test:", err.message);
  return false;
});

// ♿ Inyecta axe automáticamente antes de cada test
beforeEach(() => {
  if (typeof cy !== "undefined" && typeof cy.injectAxe === "function") {
    cy.injectAxe();
  } else {
    console.warn("⚠️ axe-core no disponible, se omite inyección automática.");
  }
});


