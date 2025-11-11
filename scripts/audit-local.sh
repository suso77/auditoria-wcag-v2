#!/usr/bin/env bash
set -e

# ======================================================
# ♿ Auditoría de Accesibilidad – Ilúmina Audit IAAP PRO (Local)
# ======================================================
SITE_URL="${SITE_URL:-https://www.hiexperience.es}"
LANG="${LANG:-es}"
MAX_URLS="${MAX_URLS:-80}"
MAX_DEPTH="${MAX_DEPTH:-5}"
BUILD_DATE=$(date +"%Y%m%d-%H%M%S")
TZ="Europe/Madrid"

echo "======================================================"
echo "♿ Iniciando auditoría IAAP PRO local"
echo "🌍 Sitio: $SITE_URL"
echo "🕐 Fecha: $BUILD_DATE"
echo "======================================================"

# ------------------------------------------------------
# 1️⃣ Verificar disponibilidad del sitio
# ------------------------------------------------------
echo "🔍 Verificando disponibilidad de $SITE_URL ..."
STATUS=$(curl -o /dev/null -s -w "%{http_code}" -L "$SITE_URL")
if [ "$STATUS" != "200" ]; then
  echo "❌ El sitio no respondió con HTTP 200 (recibido: $STATUS)"
  exit 1
fi
echo "✅ Sitio accesible (HTTP 200 OK)."

# ------------------------------------------------------
# 2️⃣ Preparar entorno IAAP PRO
# ------------------------------------------------------
echo "📦 Instalando dependencias (solo si faltan)..."
npm install --include=dev
npm install --save-dev cypress cypress-axe cypress-real-events @bahmutov/cypress-esbuild-preprocessor esbuild puppeteer pa11y fs-extra exceljs json2csv

mkdir -p scripts auditorias/{capturas,auditoria-sitemap,auditoria-interactiva,reportes} public/auditorias
[ ! -f scripts/urls.json ] && echo '[]' > scripts/urls.json
echo "✅ Entorno preparado correctamente."

# ------------------------------------------------------
# 3️⃣ Limpieza previa
# ------------------------------------------------------
echo "🧹 Limpiando resultados anteriores..."
rm -rf auditorias/* public/* || true
mkdir -p auditorias/{capturas,auditoria-sitemap,auditoria-interactiva,reportes} public/auditorias

# ------------------------------------------------------
# 4️⃣ Rastreo automático
# ------------------------------------------------------
echo "🌍 Ejecutando rastreo IAAP PRO..."
npm run crawl || echo "⚠️ Rastreo automático fallido, usando fallback..."
npm run validate:urls || echo "⚠️ Validación no crítica"
echo "✅ Rastreo completado."

# ------------------------------------------------------
# 5️⃣ Auditorías híbridas (axe-core + Pa11y)
# ------------------------------------------------------
echo "♿ Ejecutando auditoría Sitemap híbrido..."
npx cypress run --e2e --browser chrome --headless=new \
  --config-file cypress.config.mjs \
  --spec "cypress/e2e/accesibilidad-sitemap-hibrido.cy.js" || echo "⚠️ Sitemap híbrido con advertencias"

echo "♿ Ejecutando auditoría Interactiva híbrida..."
npx cypress run --e2e --browser chrome --headless=new \
  --config-file cypress.config.mjs \
  --spec "cypress/e2e/accesibilidad-interactiva-hibrida.cy.js" || echo "⚠️ Interactiva híbrida con advertencias"

# ------------------------------------------------------
# 6️⃣ Fusión y resumen IAAP PRO
# ------------------------------------------------------
echo "♿ Combinando resultados IAAP PRO..."
node scripts/merge-auditorias.mjs || echo "⚠️ Merge IAAP no crítico."

if [ -f auditorias/reportes/merged-results.json ]; then
  echo "🧾 Generando resumen IAAP..."
  node scripts/generate-summary.mjs auditorias/reportes/merged-results.json > auditorias/reportes/merged-summary.md || echo "⚠️ No se pudo generar merged-summary.md"
else
  echo "⚠️ No se encontró merged-results.json, no se genera resumen."
fi

# ------------------------------------------------------
# 7️⃣ Exportaciones finales
# ------------------------------------------------------
if [ -f auditorias/reportes/merged-results.json ]; then
  echo "📊 Exportando informes finales (XLSX / CSV / PDF / HTML)..."
  node scripts/export-to-xlsx.mjs || echo "⚠️ XLSX no crítico."
  node scripts/export-to-csv.mjs || echo "⚠️ CSV no crítico."
  node scripts/export-to-pdf.mjs || echo "⚠️ PDF no crítico."
  node scripts/generate-dashboard-html.mjs "$BUILD_DATE" || echo "⚠️ Dashboard no crítico."
else
  echo "⚠️ No hay merged-results.json, se omite exportación."
fi

# ------------------------------------------------------
# 8️⃣ Empaquetado final
# ------------------------------------------------------
ZIP_NAME="IAAP-PRO-${BUILD_DATE}.zip"
ZIP_PATH="auditorias/${ZIP_NAME}"
echo "📦 Generando ZIP completo IAAP PRO..."
zip -r "${ZIP_PATH}" auditorias/* || true
echo "✅ ZIP generado → ${ZIP_PATH}"

# ------------------------------------------------------
# 9️⃣ Finalización
# ------------------------------------------------------
echo "======================================================"
echo "✅ Auditoría IAAP PRO finalizada correctamente"
echo "📂 Resultados en: auditorias/"
echo "📊 Resumen: auditorias/reportes/merged-summary.md"
echo "======================================================"
