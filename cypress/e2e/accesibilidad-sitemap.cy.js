/// <reference types="cypress" />
import 'cypress-axe';
import dayjs from 'dayjs';
import urls from '../../scripts/urls.json';

/**
 * ♿ Auditoría de accesibilidad detallada (modo sitemap)
 * ------------------------------------------------------------
 * ✅ Usa cy.writeFile (compatible con GitHub Actions y Node 20)
 * ✅ Guarda un JSON por día en /auditorias
 * ✅ Compatible con merge-results.cjs y export-to-xlsx.cjs
 * ------------------------------------------------------------
 */

describe('♿ Auditoría de accesibilidad – sitemap mode', () => {
  urls.forEach((url) => {
    it(`Audita: ${url}`, () => {
      // 🧭 Visitar URL (aunque haya errores de estado)
      cy.visit(url, { failOnStatusCode: false });

      // Inyectar axe-core
      cy.injectAxe();

      // Ejecutar auditoría de accesibilidad
      cy.checkA11y(null, null, (violations) => {
        const total = violations.length;

        if (total === 0) {
          cy.task('log', `✅ ${url} — sin violaciones detectadas`);
          return;
        }

        // 📊 Contadores
        const critical = violations.filter(v => v.impact === 'critical').length;
        const serious = violations.filter(v => v.impact === 'serious').length;
        const moderate = violations.filter(v => v.impact === 'moderate').length;
        const minor = violations.filter(v => v.impact === 'minor').length;

        cy.task(
          'log',
          `♿ ${url} — ${total} violaciones (critical: ${critical}, serious: ${serious}, moderate: ${moderate}, minor: ${minor})`
        );

        // 📋 Estructura limpia de resultados
        const detailedResults = violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map(node => ({
            selector: node.target?.join(' > ') || '(sin selector)',
            html: node.html?.trim().substring(0, 500) || '(sin HTML)',
          })),
        }));

        // 🧩 Guardar resultados (modo append)
        const fileName = `${dayjs().format('YYYY-MM-DD')}-results.json`;
        cy.writeFile(`auditorias/${fileName}`, [{ url, violations: detailedResults }], { flag: 'a+' });

        // 💾 Log visual (para Actions)
        cy.task('saveA11yResults', { url, violations: detailedResults });
      });
    });
  });
});
