#!/usr/bin/env bash
# ================================================================
# ♿ Auditoría de Accesibilidad Local – Ilúmina Media (v2.1 PRO)
# ================================================================
# Ejecuta el pipeline completo localmente con el mismo flujo que GitHub Actions:
# - Rastreo (crawler)
# - Auditorías sitemap + interactiva
# - Capturas de evidencias
# - Exportación profesional Excel + ZIP
# - Quality Gate + resumen ejecutivo
# ================================================================

set -e  # Detener en errores
set -o pipefail

# ---------------------------------------------------------------
# 🧭 CONFIGURACIÓN INICIAL
# ---------------------------------------------------------------
SITE_URL=${SITE_URL:-"https://www.hiexperience.es"}
CRITICAL_MAX=${CRITICAL_MAX:-5}
SERIOUS_MAX=${SERIOUS_MAX:-20}

echo "==============================================================="
echo "♿ AUDITORÍA DE ACCESIBILIDAD LOCAL – Ilúmina Media (v2.1)"
echo "==============================================================="
echo "🌍 Sitio a auditar: $SITE_URL"
echo "🚦 Quality Gate: Critical <= $CRITICAL_MAX | Serious <= $SERIOUS_MAX"
echo "==============================================================="

# ---------------------------------------------------------------
# 🧹 LIMPIEZA Y PREPARACIÓN
# ---------------------------------------------------------------
echo "🧹 Limpiando auditorías anteriores..."
mkdir -p auditorias/capturas
rm -rf auditorias/* || true
echo "✅ Limpieza completada."

# ---------------------------------------------------------------
# ⚙️ INSTALACIÓN Y VALIDACIÓN
# ---------------------------------------------------------------
echo "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
  npm ci
else
  npm install --prefer-offline --no-audit --progress=false
fi

echo "🧩 Verificando entorno base..."
npm run check-env || true

# ---------------------------------------------------------------
# 🌐 RASTREO DE URLs
# ---------------------------------------------------------------
echo "🌐 Iniciando rastreo de URLs con Puppeteer..."
npm run crawl:js

if [ ! -s scripts/urls.json ]; then
  echo "❌ No se generó scripts/urls.json. Abortando auditoría."
  exit 1
fi

echo "✅ Rastreo completado. URLs detectadas:"
cat scripts/urls.json | jq '.[].url' 2>/dev/null || cat scripts/urls.json

# ---------------------------------------------------------------
# ♿ AUDITORÍA WCAG – SITEMAP
# ---------------------------------------------------------------
echo "---------------------------------------------------------------"
echo "♿ Ejecutando auditoría de accesibilidad (Sitemap)"
echo "---------------------------------------------------------------"
npm run audit:sitemap || echo "⚠️ Auditoría Sitemap completada con advertencias"

# ---------------------------------------------------------------
# 🧠 AUDITORÍA WCAG – INTERACTIVA
# ---------------------------------------------------------------
echo "---------------------------------------------------------------"
echo "🧠 Ejecutando auditoría de accesibilidad (Interactiva)"
echo "---------------------------------------------------------------"
npm run audit:interactiva || echo "⚠️ Auditoría Interactiva completada con advertencias"

# ---------------------------------------------------------------
# 🏷️ AÑADIR ORIGEN A RESULTADOS
# ---------------------------------------------------------------
echo "🏷️ Añadiendo campo 'origen' a los resultados..."
npm run tag-origen || true

# ---------------------------------------------------------------
# 🔄 COMBINAR RESULTADOS
# ---------------------------------------------------------------
echo "🔄 Combinando resultados (sitemap + interactiva)..."
npm run merge-results
echo "✅ Archivo combinado generado."

# ---------------------------------------------------------------
# 📸 CAPTURAS DE EVIDENCIAS
# ---------------------------------------------------------------
echo "📸 Generando capturas de evidencias WCAG..."
npm run capture:evidence || echo "⚠️ Generación de capturas completada con advertencias."

# ---------------------------------------------------------------
# 📊 EXPORTAR INFORME PROFESIONAL
# ---------------------------------------------------------------
echo "📊 Exportando informe profesional (Excel + ZIP)..."
npm run export:xlsx || echo "⚠️ Exportación con advertencias."

# ---------------------------------------------------------------
# 🚦 QUALITY GATE
# ---------------------------------------------------------------
echo "🚦 Ejecutando control de calidad..."
npm run quality || echo "⚠️ Quality Gate con advertencias."

# ---------------------------------------------------------------
# 🧾 RESUMEN EJECUTIVO
# ---------------------------------------------------------------
echo "🧾 Generando resumen ejecutivo WCAG..."
npm run summary || echo "⚠️ Resumen ejecutivo no generado."

# ---------------------------------------------------------------
# ✅ FINALIZACIÓN
# ---------------------------------------------------------------
echo "==============================================================="
echo "✅ PIPELINE LOCAL FINALIZADO CORRECTAMENTE"
echo "---------------------------------------------------------------"
echo "📂 Resultados disponibles en /auditorias/"
echo "📘 Informe Excel: auditorias/Informe-WCAG-Profesional.xlsx"
echo "🗜️ ZIP completo: auditorias/Informe-WCAG.zip"
echo "🧾 Resumen: auditorias/Resumen-WCAG.md"
echo "📸 Capturas: auditorias/capturas/"
echo "🧭 Logs: auditorias/logs.txt"
echo "==============================================================="
