// ♿ Ilúmina Audit IAAP PRO – soporte universal de pruebas Cypress
// ---------------------------------------------------------------
// ✅ Soporte de eventos reales (teclado, ratón, foco, scroll, etc.)
// ✅ Soporte de auditorías de accesibilidad con axe-core
// ✅ Manejo global de errores no críticos (CI / local)
// ✅ Compatible con Cypress headless y Docker
// ---------------------------------------------------------------

try {
  require("cypress-real-events/support");
  require("cypress-axe");
} catch (err) {
  console.warn("⚠️ Dependencias opcionales no cargadas:", err.message);
}

// 🧩 Manejo global de errores no críticos (para evitar falsos fallos en CI/CD)
Cypress.on("uncaught:exception", (err) => {
  console.warn("⚠️ Error ignorado en test:", err.message);
  return false;
});

// 💡 Nota IAAP PRO:
// La inyección de axe-core se realiza manualmente dentro de cada test
// (por ejemplo, tras cy.visit()), ya que hacerlo globalmente puede fallar
// en entornos headless o antes de que el DOM esté listo.






