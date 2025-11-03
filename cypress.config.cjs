/**
 * ♿ Configuración universal de Cypress (versión profesional optimizada)
 * --------------------------------------------------------------------
 * - Totalmente compatible con el flujo de auditorías WCAG + capturas + exportación XLSX.
 * - Guarda automáticamente capturas en /auditorias/capturas.
 * - Limpia auditorías y capturas antiguas antes de ejecutar.
 * - Define tareas personalizadas para lectura de URLs, escritura de resultados, logs, etc.
 * - Optimizada para Chrome Headless y auditorías largas.
 * --------------------------------------------------------------------
 */

const { defineConfig } = require("cypress");
const fs = require("fs-extra");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://www.hiexperience.es",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.js",

    // 📸 Capturas automáticas
    screenshotsFolder: "auditorias/capturas",
    screenshotOnRunFailure: true,

    // 🎥 Videos opcionales (recomendado desactivar para evitar crashes)
    video: false,

    // ⚙️ Estabilidad y rendimiento
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 90000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    viewportWidth: 1366,
    viewportHeight: 768,
    retries: { runMode: 1, openMode: 0 },

    setupNodeEvents(on, config) {
      // =====================================================
      // 🧩 TAREAS PERSONALIZADAS WCAG
      // =====================================================
      on("task", {
        log(message) {
          console.log("🧠 [CYPRESS LOG]", message);
          return null;
        },

        // 📁 Crear carpetas de salida
        createFolder(dirPath) {
          fs.mkdirpSync(dirPath);
          console.log(`📁 Carpeta creada: ${dirPath}`);
          return null;
        },

        // 🧾 Guardar resultados de violaciones Axe/WCAG
        writeResults({ dir, data }) {
          const filePath = path.join(dir, "results.json");
          let existing = [];

          if (fs.existsSync(filePath)) {
            try {
              existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
            } catch {
              console.warn(`⚠️ Archivo JSON corrupto: ${filePath}, se recreará.`);
            }
          }

          if (Array.isArray(data)) existing = existing.concat(data);
          else existing.push(data);

          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          console.log(`🧩 Resultados guardados en ${filePath}`);
          return null;
        },

        // 🧹 Limpiar resultados antiguos
        cleanOldResults() {
          const auditoriasDir = path.join(__dirname, "auditorias");
          if (!fs.existsSync(auditoriasDir)) return null;

          const files = fs.readdirSync(auditoriasDir);
          for (const file of files) {
            if (file.includes("auditoria") || file.startsWith("results-")) {
              fs.rmSync(path.join(auditoriasDir, file), { recursive: true, force: true });
              console.log(`🧹 Eliminado: ${file}`);
            }
          }
          return null;
        },

        // 🌐 Leer URLs desde scripts/urls.json
        readUrls() {
          const urlsPath = path.join(__dirname, "scripts", "urls.json");
          if (!fs.existsSync(urlsPath)) throw new Error(`❌ No se encontró ${urlsPath}`);

          const raw = fs.readFileSync(urlsPath, "utf8");
          const parsed = JSON.parse(raw);

          const urls = parsed
            .filter((u) => u && u.url)
            .map((u) => ({
              url: u.url.trim(),
              title: u.title?.trim() || "(sin título)",
            }));

          console.log(`🌐 URLs cargadas (${urls.length}) desde ${urlsPath}`);
          return urls;
        },

        // 🧹 Limpiar capturas anteriores
        clearCaptures() {
          const capturesDir = path.join(__dirname, "auditorias", "capturas");
          fs.rmSync(capturesDir, { recursive: true, force: true });
          fs.mkdirpSync(capturesDir);
          console.log("🧹 Capturas anteriores eliminadas");
          return null;
        },
      });

      return config;
    },
  },

  // =====================================================
  // 📊 REPORTER LIMPIO EN CONSOLA
  // =====================================================
  reporter: "spec",
  reporterOptions: {
    toConsole: true,
  },

  // =====================================================
  // 🌍 VARIABLES DE ENTORNO
  // =====================================================
  env: {
    SITE_URL: process.env.SITE_URL || "https://www.hiexperience.es",
  },
});
