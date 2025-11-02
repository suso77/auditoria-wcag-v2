/// <reference types="cypress" />

import 'cypress-axe';

describe('♿ Auditoría de accesibilidad - axe-core (detallada)', () => {
  let urls = [];
  const allResults = [];

  before(() => {
    // 🔹 Cargar las URLs desde la task del config (ya no usamos fs directamente)
    cy.task('readUrls').then((urlsRaw) => {
      urls = [...new Set(urlsRaw.map((u) => u.trim()))];
      cy.task('log', `🌐 Total de URLs únicas a auditar: ${urls.length}`);
    });
  });

  it('Audita todas las páginas del sitio', () => {
    cy.wrap(urls).each((url) => {
      cy.task('log', `🚀 Analizando: ${url}`);

      // Visitar página
      cy.visit(url, { timeout: 90000 });

      // Inyectar axe-core
      cy.injectAxe();

      // Ejecutar auditoría de accesibilidad
      cy.checkA11y(
        null,
        null,
        (violations) => {
          const dateNow = new Date().toISOString();

          // 📸 Captura solo si hay violaciones
          if (violations.length > 0) {
            cy.screenshot(`${url.replace(/https?:\/\//, '').replace(/[^\w-]/g, '_')}-a11y`);
          }

          // 🧩 Guardar resultado completo de la URL
          allResults.push({
            url,
            date: dateNow,
            pageTitle: document.title || '',
            violations,
            system: 'macOS + Electron/Chrome (Cypress) + axe-core',
          });

          cy.task(
            'log',
            `♿ ${url} — ${violations.length} violaciones detectadas (${violations.filter(
              (v) => v.impact === 'critical'
            ).length} críticas)`
          );
        },
        { skipFailures: true } // ⚙️ Evita que Cypress marque el test como fallido
      );
    });
  });

  after(() => {
    const outputDir = `auditorias/${new Date().toISOString().replace(/[:.]/g, '-')}-auditoria`;

    // Crear carpeta si no existe
    cy.task('createFolder', outputDir);

    // Guardar resultados finales
    cy.task('writeResults', { dir: outputDir, data: allResults }).then(() => {
      cy.task('log', `✅ Resultados guardados correctamente en: ${outputDir}/results.json`);
    });
  });
});




