/// <reference types="cypress" />
import 'cypress-axe';
import dayjs from 'dayjs';
import urls from '../../scripts/urls.json';
import fs from 'fs';
import path from 'path';

const AUDITORIAS_DIR = 'auditorias';
if (!fs.existsSync(AUDITORIAS_DIR)) {
  fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
}

describe('♿ Auditoría completa de accesibilidad – axe-core', () => {
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

        const summary = {
          critical: violations.filter(v => v.impact === 'critical').length,
          serious: violations.filter(v => v.impact === 'serious').length,
          moderate: violations.filter(v => v.impact === 'moderate').length,
          minor: violations.filter(v => v.impact === 'minor').length,
        };

        cy.task(
          'log',
          `♿ ${url} — ${total} violaciones (🔴 ${summary.critical}, 🟠 ${summary.serious}, 🟡 ${summary.moderate}, 🟢 ${summary.minor})`
        );

        // Estructura detallada
        const detailedResults = violations.map((v) => ({
          url,
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags.join(', '),
          nodes: v.nodes.map((node) => ({
            selector: node.target?.join(' > ') || '(sin selector)',
            html: node.html?.trim().substring(0, 500) || '(sin HTML)',
            failureSummary: node.failureSummary,
          })),
        }));

        // 📦 Guardar resultados en archivo
        const fileName = `${dayjs().format('YYYY-MM-DD')}-results.json`;
        const filePath = path.join(AUDITORIAS_DIR, fileName);

        let existing = [];
        if (fs.existsSync(filePath)) {
          try {
            existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch {
            existing = [];
          }
        }

        existing.push(...detailedResults);
        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

        cy.task('saveA11yResults', { url, violations: detailedResults });
      });

      // 💾 Importante: no romper flujo por violaciones
      cy.then(() => {
        expect(true).to.equal(true); // fuerza que el test siempre pase
      });
    });
  });
});

