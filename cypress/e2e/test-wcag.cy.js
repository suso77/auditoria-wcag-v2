// ✅ Auditoría WCAG con axe-core + eventos reales (nivel base)
import 'cypress-axe';
import 'cypress-real-events/support';

describe('🧩 Auditoría WCAG + eventos reales', () => {
  it('Ejecuta auditoría completa con axe-core en página de ejemplo', () => {
    // 1️⃣ Visita una página real o de prueba
    cy.visit('https://example.cypress.io');

    // 2️⃣ Inyecta axe-core en el DOM
    cy.injectAxe();

    // 3️⃣ Interacción mínima (simula navegación con teclado)
    cy.get('body').realPress('Tab');
    cy.wait(300);

    // 4️⃣ Ejecuta el análisis de accesibilidad
    cy.checkA11y(null, null, (violations) => {
      cy.log(`🔍 Violaciones encontradas: ${violations.length}`);

      const results = violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes,
        origen: 'interactiva',
        url: 'https://example.cypress.io',
        timestamp: new Date().toISOString(),
      }));

      // 5️⃣ Guarda los resultados para el informe profesional
      cy.writeFile('auditorias/results-interactiva.json', results);
      cy.log('💾 Resultados guardados en auditorias/results-interactiva.json');
    }, true); // 👈 evita que Cypress falle al detectar violaciones
  });
});
