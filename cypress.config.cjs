/**
 * ♿ Configuración universal de Cypress (versión profesional completa)
 * --------------------------------------------------------------------
 * - Compatible con flujo de auditorías WCAG + capturas + exportación XLSX.
 * - Crea y limpia automáticamente carpetas de auditorías.
 * - Incluye tareas personalizadas para lectura, escritura y logs.
 * - Optimizada para CI/CD (GitHub Actions) y auditorías largas.
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

    // 🎥 Desactivar vídeos para auditorías CI (más estabilidad)
    video: false,

    // ⚙️ Configuración de tiempo y rendimiento
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 90000,
    requestTimeout: 20000,
    responseTimeout: 20000,
    viewportWidth: 1366,
    viewportHeight: 768,
    retries: { runMode: 1, openMode: 0 },

    setupNodeEvents(on, config) {
      // =====================================================
      // 🧩 TAREAS PERSONALIZADAS WCAG
      // =====================================================

      /**
       * 📄 Función auxiliar: crear carpeta si no existe
       */
      function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }

      /**
       * 🧹 Limpiar capturas previas
       */
      function clearCaptures() {
        const dir = path.join(__dirname, "auditorias", "capturas");
        try {
          fs.emptyDirSync(dir);
          console.log("🧹 Capturas anteriores eliminadas correctamente.");
        } catch (err) {
          console.warn("⚠️ Error al limpiar capturas:", err.message);
        }
        return null;
      }

      /**
       * 🧹 Limpiar resultados antiguos
       */
      function cleanOldResults() {
        const auditoriasDir = path.join(__dirname, "auditorias");
        if (!fs.existsSync(auditoriasDir)) return null;

        const files = fs.readdirSync(auditoriasDir);
        for (const file of files) {
          if (file.startsWith("results-") || file.includes("auditoria")) {
            fs.rmSync(path.join(auditoriasDir, file), { recursive: true, force: true });
            console.log(`🧹 Eliminado archivo antiguo: ${file}`);
          }
        }
        return null;
      }

      /**
       * 🌐 Leer URLs desde scripts/urls.json
       */
      function readUrls() {
        const urlsPath = path.join(__dirname, "scripts", "urls.json");
        if (!fs.existsSync(urlsPath)) {
          console.warn("⚠️ No se encontró scripts/urls.json — se devolverá vacío.");
          return [];
        }

        try {
          const raw = fs.readFileSync(urlsPath, "utf8");
          const parsed = JSON.parse(raw);

          const urls = parsed
            .filter((u) => u && u.url)
            .map((u) => ({
              url: u.url.trim(),
              title: u.title?.trim() || "(sin título)",
            }));

          console.log(`🌍 URLs cargadas (${urls.length}) desde ${urlsPath}`);
          return urls;
        } catch (err) {
          console.error("❌ Error leyendo scripts/urls.json:", err.message);
          return [];
        }
      }

      /**
       * 💾 Guardar resultados JSON
       */
      function writeResults({ dir, data }) {
        ensureDir(dir);
        const filePath = path.join(dir, "results.json");

        try {
          let existing = [];
          if (fs.existsSync(filePath)) {
            existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
          }

          if (Array.isArray(data)) existing = existing.concat(data);
          else existing.push(data);

          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          console.log(`💾 Resultados guardados: ${filePath}`);
        } catch (err) {
          console.error("❌ Error al guardar resultados:", err.message);
        }
        return null;
      }

      /**
       * 🪵 Log seguro para CI
       */
      function safeLog(message) {
        const text = typeof message === "string" ? message : JSON.stringify(message);
        console.log(`🧭 ${text}`);
        return null;
      }

      /**
       * 📁 Crear carpeta recursiva
       */
      function createFolder(dir) {
        ensureDir(dir);
        console.log(`📁 Carpeta creada/verificada: ${dir}`);
        return null;
      }

      // ============================
      // Registrar todas las tareas
      // ============================
      on("task", {
        log: safeLog,
        clearCaptures,
        cleanOldResults,
        readUrls,
        writeResults,
        createFolder,
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
