/// <reference types="cypress" />

import 'cypress-axe';

/**
 * 🧩 Auditoría de accesibilidad – Componentes interactivos (versión estable)
 * -------------------------------------------------------------------------
 * - Escanea modales, menús, banners, acordeones, cookies y otros elementos interactivos.
 * - Ejecuta axe-core sobre cada componente detectado.
 * - Guarda resultados en /auditorias/[timestamp]-auditoria-interactiva/results.json
 * - Controla errores de carga sin romper la ejecución (compatible con Cypress 13+).
 * - Compatible con merge automático (campo "origen": "interactiva").
 */

describe('🧩 Auditoría de accesibilidad – Componentes interactivos', () => {
  const baseUrl = Cypress.env('SITE_URL') || 'https://www.hiexperience.es';
  const allResults = [];

  // Páginas principales a auditar
  const urls = [
    baseUrl,
    `${baseUrl}/servicios-agencia-ux-ui`,
    `${baseUrl}/nosotros`,
    `${baseUrl}/proyectos`,
    `${baseUrl}/contacto`,
  ];

  before(() => {
    cy.task('log', `🌍 Iniciando auditoría interactiva en: ${baseUrl}`);
  });

  urls.forEach((page) => {
    describe(`🔎 Analizando componentes dinámicos en ${page}`, () => {
      it(`Audita elementos interactivos en ${page}`, () => {
        cy.visit(page, { timeout: 90000, failOnStatusCode: false })
          .then(() => {
            cy.injectAxe();

            // Selectores comunes de elementos interactivos
            const selectors = [
              '[role="dialog"]',
              '[aria-modal="true"]',
              '.modal, .popup, .lightbox',
              '[aria-haspopup="menu"]',
              '[role="menu"], nav ul, .dropdown, .menu',
              '[id*="cookie"], [class*="cookie"], [aria-label*="cookie"], [aria-label*="Cookie"]',
              '[aria-expanded], [aria-controls]',
              '.accordion, .collapsible, [role="tablist"]',
            ];

            const detected = new Set();

            // Buscar componentes interactivos
            cy.get('body').then(($body) => {
              selectors.forEach((sel) => {
                try {
                  const elements = $body.find(sel);
                  if (elements.length > 0) {
                    cy.task('log', `🎯 Detectado componente interactivo: ${sel} (${elements.length})`);
                    detected.add(sel);
                  }
                } catch (err) {
                  cy.task('log', `⚠️ Selector no válido (${sel}): ${err?.message || 'sin mensaje'}`);
                }
              });
            });

            cy.then(() => {
              if (detected.size === 0) {
                cy.task('log', `⚠️ No se detectaron componentes interactivos en ${page}`);
                return;
              }

              // Auditar cada componente detectado
              detected.forEach((selector) => {
                cy.get('body').then(($body) => {
                  if ($body.find(selector).length === 0) return;

                  cy.get(selector, { timeout: 5000 })
                    .first()
                    .scrollIntoView()
                    .then(($el) => {
                      // Intentar abrir si está oculto
                      if ($el.is(':hidden')) {
                        cy.task('log', `🧩 Intentando abrir componente oculto: ${selector}`);
                        try {
                          cy.wrap($el).click({ force: true });
                          cy.wait(800);
                        } catch {
                          cy.task('log', `⚠️ No se pudo abrir ${selector}`);
                        }
                      }

                      // Ejecutar la auditoría AXE sobre el componente
                      cy.checkA11y(
                        selector,
                        null,
                        (violations) => {
                          const dateNow = new Date().toISOString();

                          if (violations.length > 0) {
                            const safeName = selector.replace(/[^\w-]/g, '_');
                            cy.screenshot(`interactivo-${safeName}-a11y`);
                          }

                          allResults.push({
                            page,
                            selector,
                            date: dateNow,
                            origen: 'interactiva',
                            violations,
                            system: 'macOS + Chrome (Cypress) + axe-core',
                          });

                          const counts = {
                            critical: violations.filter((v) => v.impact === 'critical').length,
                            serious: violations.filter((v) => v.impact === 'serious').length,
                            moderate: violations.filter((v) => v.impact === 'moderate').length,
                            minor: violations.filter((v) => v.impact === 'minor').length,
                          };

                          cy.task(
                            'log',
                            `♿ ${selector} — ${violations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} serias, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
                          );
                        },
                        { skipFailures: true }
                      );
                    });
                });
              });
            });
          })
          // 🚫 Sin .catch(): Cypress no usa promesas nativas. Usamos .then(null, handler)
          .then(null, (err) => {
            cy.task('log', `⚠️ Error al analizar ${page}: ${err?.message || 'sin mensaje de error'}`);
            allResults.push({
              page,
              selector: '(error)',
              date: new Date().toISOString(),
              origen: 'interactiva',
              error: true,
              errorMessage: err?.message || 'Error desconocido durante la carga',
            });
          });
      });
    });
  });

  after(() => {
    // 📁 Crear carpeta y guardar resultados
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `auditorias/${timestamp}-auditoria-interactiva`;

    cy.task('createFolder', outputDir);
    cy.task('writeResults', { dir: outputDir, data: allResults }).then(() => {
      cy.task('log', `✅ Resultados guardados correctamente en: ${outputDir}/results.json`);
    });
  });
});
