/// <reference types="cypress" />
import 'cypress-axe';
import dayjs from 'dayjs';
import urls from '../../scripts/urls.json';

describe('♿ Auditoría de accesibilidad - axe-core (detallada)', () => {
  urls.forEach((url) => {
    it(`Audita: ${url}`, () => {
      cy.visit(url, { failOnStatusCode: false });
      cy.injectAxe();

      cy.checkA11y(null, null, (violations) => {
        const total = violations.length;

        if (total === 0) {
          cy.task('log', `✅ ${url} — sin violaciones detectadas`);
          return;
        }

        const critical = violations.filter(v => v.impact === 'critical').length;
        const serious = violations.filter(v => v.impact === 'serious').length;
        const moderate = violations.filter(v => v.impact === 'moderate').length;
        const minor = violations.filter(v => v.impact === 'minor').length;

        cy.task(
          'log',
          `♿ ${url} — ${total} violaciones (critical: ${critical}, serious: ${serious}, moderate: ${moderate}, minor: ${minor})`
        );

        // 📋 Estructura detallada de cada violación
        const detailedResults = violations.map(v => ({
          url,
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags.join(', '),
          nodes: v.nodes.map(node => ({
            selector: node.target?.join(' > ') || '(sin selector)',
            html: node.html?.trim().substring(0, 500) || '(sin HTML)',
          })),
        }));

        // 🧩 Guarda los resultados detallados
        cy.writeFile(
          `auditorias/${dayjs().format('YYYY-MM-DD')}-results.json`,
          detailedResults,
          { flag: 'a+' }
        );

        // 💾 También envía al task para registro global (GitHub Actions)
        cy.task('saveA11yResults', { url, violations: detailedResults });
      });
    });
  });
});
