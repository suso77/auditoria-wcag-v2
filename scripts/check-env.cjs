/**
 * ✅ check-env.cjs
 * Verifica que existan los archivos y carpetas mínimos antes de ejecutar el workflow.
 */

const fs = require("fs");

function check(path, message) {
  if (!fs.existsSync(path)) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

// Archivos y carpetas críticos
check("cypress.config.js", "Falta el archivo cypress.config.js");
check("scripts", "Falta la carpeta scripts/");
check("cypress/e2e", "Falta la carpeta cypress/e2e/");
check("cypress/e2e/accesibilidad-sitemap.cy.js", "Falta el test accesibilidad-sitemap.cy.js");

// ⚙️ El archivo de URLs puede no existir aún (lo genera el crawler)
if (fs.existsSync("scripts/urls.json")) {
  console.log("✅ scripts/urls.json detectado correctamente.");
} else {
  console.warn("⚠️ No se encontró scripts/urls.json — se generará durante el rastreo.");
}

console.log("✅ Entorno validado correctamente. Todo listo para la auditoría WCAG.");

