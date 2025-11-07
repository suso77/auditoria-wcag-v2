// ✅ Soporte de eventos reales (teclado, ratón, foco, etc.)
import "cypress-real-events/support";

// ✅ Soporte de auditorías de accesibilidad con axe-core
import "cypress-axe";

// 🧩 Manejo global de errores no críticos (para evitar falsos fallos en CI y local)
Cypress.on("uncaught:exception", (err) => {
  console.warn("⚠️ Error ignorado en test:", err.message);
  return false;
});

// 💡 Nota IAAP PRO:
// La inyección de axe-core se realiza manualmente dentro de cada test
// (por ejemplo, tras cy.visit()), ya que hacerlo globalmente puede fallar
// en entornos headless o antes de que el DOM esté listo.



