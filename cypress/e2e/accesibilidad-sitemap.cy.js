/// <reference types="cypress" />
import 'cypress-axe';

/**
 * ♿ Auditoría de accesibilidad - axe-core (detallada y robusta)
 * ------------------------------------------------------------
 * - Audita todas las URLs HTML extraídas del crawler (scripts/urls.json).
 * - Ignora recursos no HTML (PDF, imágenes, vídeos...).
 * - Controla errores de carga, redirecciones y timeouts sin romper la ejecución.
 * - Filtra falsos positivos de “sin mensaje de error”.
 * - Registra número de violaciones por severidad.
 * - Guarda resultados completos en /auditorias/[timestamp]-auditoria/results.json
 * - Compatible con merge automático (campo "origen": "sitemap").
 */

describe('♿ Auditoría de accesibilidad - axe-core (detallada)', () => {
  let pages = [];
  const allResults = [];

  before(() => {
    // 📥 Cargar URLs y títulos desde la task "readUrls"
    cy.task('readUrls').then((urlsRaw) => {
      pages = urlsRaw.filter((p) => p && p.url);
      cy.task('log', `🌐 Total de páginas únicas a auditar: ${pages.length}`);
    });
  });

  it('Audita todas las páginas del sitio', () => {
    cy.wrap(pages).each((page) => {
      const { url, title } = page;

      // ⚠️ Ignorar URLs no HTML (PDF, imágenes, vídeos, etc.)
      if (
        url.match(
          /\.(pdf|jpg|jpeg|png|gif|svg|doc|docx|xls|xlsx|zip|rar|mp4|webm|ico|rss|xml)$/i
        )
      ) {
        cy.task('log', `⚠️ Ignorando URL no HTML: ${url}`);
        return;
      }

      cy.task('log', `🚀 Analizando: ${url} (${title || 'sin título'})`);

      cy.visit(url, { timeout: 90000, failOnStatusCode: false })
        .then((win) => {
          let safeTitle = title || '(sin título)';
          try {
            if (win?.document?.title) {
              const docTitle = win.document.title.trim();
              if (docTitle) safeTitle = docTitle;
            }
          } catch {
            cy.task('log', `⚠️ No se pudo leer el título del documento en ${url}`);
          }

          cy.task('log', `📄 Título final: ${safeTitle}`);

          cy.wait(1000);
          cy.injectAxe();

          cy.checkA11y(
            null,
            null,
            (violations) => {
              const dateNow = new Date().toISOString();

              if (violations.length > 0) {
                const safeName = url.replace(/https?:\/\//, '').replace(/[^\w-]/g, '_');
                cy.screenshot(`${safeName}-a11y`);
              }

              allResults.push({
                url,
                pageTitle: safeTitle,
                date: dateNow,
                origen: 'sitemap',
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
                `♿ ${url} — ${violations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} serias, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
              );
            },
            { skipFailures: true }
          );
        })
        // 🧠 Manejo de errores real, sin falsos positivos
        .then(null, (err) => {
          if (err && err.message) {
            cy.task(
              'log',
              `⚠️ Error real al analizar ${url}: ${err.message || 'Error desconocido'}`
            );
            allResults.push({
              url,
              pageTitle: title || '(sin título)',
              date: new Date().toISOString(),
              origen: 'sitemap',
              error: true,
              errorMessage: err.message,
            });
          } else {
            cy.task('log', `ℹ️ Auditoría completada correctamente en: ${url}`);
          }
        });
    });
  });

  after(() => {
    // 📁 Crear carpeta de resultados con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `auditorias/${timestamp}-auditoria`;

    cy.task('createFolder', outputDir);

    // 💾 Guardar resultados en formato JSON
    cy.task('writeResults', { dir: outputDir, data: allResults }).then(() => {
      cy.task('log', `✅ Resultados guardados correctamente en: ${outputDir}/results.json`);

      // 📊 Resumen global
      const totalViolations = allResults.flatMap((r) => r.violations || []);
      const counts = {
        critical: totalViolations.filter((v) => v.impact === 'critical').length,
        serious: totalViolations.filter((v) => v.impact === 'serious').length,
        moderate: totalViolations.filter((v) => v.impact === 'moderate').length,
        minor: totalViolations.filter((v) => v.impact === 'minor').length,
      };
      cy.task(
        'log',
        `📊 Resumen global: ${totalViolations.length} violaciones (🔴 ${counts.critical} críticas, 🟠 ${counts.serious} serias, 🟡 ${counts.moderate} moderadas, 🟢 ${counts.minor} menores)`
      );
    });
  });
});


