/**
 * ♿ Configuración Cypress – Auditoría WCAG v2 (modo CommonJS)
 * ------------------------------------------------------------
 * ✅ Compatible con Node 20 y GitHub Actions
 * ✅ Registra tareas para logs y resultados axe-core
 * ✅ Crea carpeta de salida automática por fecha
 */

const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");

// 🗂️ Directorio de salida
const fecha = format(new Date(), "yyyy-MM-dd-HHmmss");
const outputDir = path.join(process.cwd(), "auditorias", `${fecha}-auditoria`);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Carpeta de salida creada: ${outputDir}`);
}

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://example.com",
    video: false,
    screenshotOnRunFailure: false,

    setupNodeEvents(on, config) {
      // ✅ Task de log (para imprimir mensajes en consola / GitHub Actions)
      on("task", {
        log(message) {
          console.log(message);
          return null;
        },

        // ✅ Task para guardar resultados de accesibilidad (axe-core)
        saveA11yResults({ url, violations }) {
          const filePath = path.join(outputDir, "results.json");

          let existing = [];
          if (fs.existsSync(filePath)) {
            try {
              existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
            } catch {
              existing = [];
            }
          }

          existing.push({ url, violations });

          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          console.log(`🧩 Resultados guardados en ${filePath}`);
          return null;
        },
      });

      // 📦 Exponer ruta para otros scripts (merge, export, etc.)
      config.env.outputDir = outputDir;

      return config;
    },
  },
});

