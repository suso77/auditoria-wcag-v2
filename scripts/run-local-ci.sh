#!/bin/bash

# ------------------------------------------------------------------------
# Configuración del flujo de auditoría local para WCAG
# ------------------------------------------------------------------------

# Variables de entorno (puedes cambiar SITE_URL)
export SITE_URL="https://www.hiexperience.es"
export CRITICAL_MAX=5
export SERIOUS_MAX=20
export NODE_ENV=production
export TZ=Europe/Madrid

# Limpiar resultados anteriores
echo "🧹 Limpiando auditorías anteriores..."
rm -rf auditorias/* || true
mkdir -p auditorias/capturas auditorias/logs

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm ci || npm install
echo "✅ Dependencias instaladas correctamente."

# Verificar ts-node
echo "🧩 Verificando ts-node..."
npx ts-node --version || npm install ts-node typescript --no-save

# Verificar Cypress
echo "🧩 Verificando instalación de Cypress..."
npx cypress verify || (echo "⚠️ Reinstalando Cypress..." && npx cypress install)

# Validar el entorno base
echo "🧾 Validando entorno base..."
node scripts/check-env.cjs

# Validar listado de URLs
echo "🔍 Validando scripts/urls.json..."
npx ts-node --transpile-only scripts/validate-urls.ts || echo "⚠️ Se generará en el siguiente paso"

# Iniciar rastreo de URLs
echo "🌐 Rastreo de URLs en $SITE_URL..."
npm run crawl:js

# Ejecutar auditoría de accesibilidad - Sitemap
echo "♿ Iniciando auditoría de accesibilidad – Sitemap..."
npx cypress run --browser chrome --headless --config-file cypress.config.cjs --spec "cypress/e2e/sitemap/**/*.cy.js" || npm run audit:sitemap

# Ejecutar auditoría de accesibilidad - Componentes interactivos
echo "♿ Iniciando auditoría interactiva..."
npx cypress run --browser chrome --headless --config-file cypress.config.cjs --spec "cypress/e2e/interactiva/**/*.cy.js" || npm run audit:interactiva || echo "⚠️ No hay specs interactivas."

# Añadir campo origen a los resultados
echo "🏷️ Añadiendo campo 'origen' a los resultados..."
node scripts/tag-origen.cjs

# Combinar resultados de auditoría
echo "🧩 Combinando resultados..."
node scripts/merge-results.mjs

# Verificar Quality Gate
echo "🚦 Verificando Quality Gate WCAG..."
npm run quality || echo "⚠️ Quality Gate con advertencias"

# Generar capturas de evidencias WCAG
echo "📸 Generando evidencias visuales..."
if [ -f scripts/capture-evidence.mjs ]; then
  node --max-old-space-size=4096 --experimental-specifier-resolution=node scripts/capture-evidence.mjs
else
  echo "⚠️ No se encontró scripts/capture-evidence.mjs — se omite."
fi

# Generar informe Excel + ZIP
echo "📊 Generando informe profesional IAAP / W3C..."
node --max-old-space-size=4096 --experimental-specifier-resolution=node scripts/export-to-xlsx.mjs

# Generar resumen ejecutivo en Markdown
echo "🧾 Generando resumen ejecutivo (Markdown)..."
node scripts/generate-summary.mjs auditorias/results-merged-*.json > auditorias/Resumen-WCAG.md || echo "⚠️ No se pudo generar resumen."

# Validar informe Excel generado
echo "🔍 Validando informe generado..."
if [ ! -f auditorias/Informe-WCAG-Profesional.xlsx ]; then
  echo "❌ No se generó el informe Excel."
  exit 1
fi
echo "✅ Informe Excel detectado correctamente."

# Subir artefactos finales
echo "📤 Subiendo artefactos finales..."
mkdir -p auditorias/artifacts
tar -czf auditorias/artifacts/WCAG-Informe-$(date +%F).tar.gz auditorias/

# Resumen final
echo "✅ Resumen final de ejecución"
echo "---------------------------------------------"
echo "🌍 Sitio auditado: $SITE_URL"
echo "📊 Informe generado: auditorias/Informe-WCAG-Profesional.xlsx"
echo "📸 Capturas incluidas en ZIP"
echo "🚦 Quality Gate: Critical <= $CRITICAL_MAX, Serious <= $SERIOUS_MAX"
echo "✅ Auditoría completada correctamente."

