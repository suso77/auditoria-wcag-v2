/**
 * ♿ Configuración universal de Cypress (IAAP PRO v4.0.2 / WCAG 2.2)
 * --------------------------------------------------------------------
 * ✅ Compatible con auditorías WCAG (sitemap + interactiva)
 * ✅ Exportación JSON / XLSX y dashboard IAAP PRO
 * ✅ Limpieza automática de capturas y resultados antiguos
 * ✅ Logs persistentes + creación automática de carpetas
 * ✅ Soporte total para CI/CD (GitHub Actions, Docker, local)
 * ✅ Estabilidad reforzada para axe-core y Promises Cypress
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

    // 🎥 Desactivar vídeos en CI (más estabilidad)
    video: false,

    // ⚙️ Configuración de tiempos y estabilidad
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
      // 🧩 FUNCIONES UTILITARIAS IAAP PRO
      // =====================================================

      /** 📁 Garantiza que una carpeta exista */
      function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      }

      /** 🧹 Limpia capturas previas */
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

      /** 🧹 Limpia resultados antiguos */
      function cleanOldResults() {
        const auditoriasDir = path.join(__dirname, "auditorias");
        if (!fs.existsSync(auditoriasDir)) return null;

        const entries = fs.readdirSync(auditoriasDir);
        for (const entry of entries) {
          if (
            entry.startsWith("results-") ||
            entry.endsWith(".json") ||
            entry.includes("auditoria-")
          ) {
            try {
              fs.rmSync(path.join(auditoriasDir, entry), { recursive: true, force: true });
              console.log(`🧹 Eliminado archivo antiguo: ${entry}`);
            } catch (err) {
              console.warn(`⚠️ No se pudo eliminar ${entry}: ${err.message}`);
            }
          }
        }
        return null;
      }

      /** 🌍 Lee las URLs desde scripts/urls.json */
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

      /** 💾 Escribe resultados JSON */
      function writeResults({ dir, data }) {
        ensureDir(dir);
        const filePath = path.join(dir, "results.json");
        try {
          let existing = [];
          if (fs.existsSync(filePath)) {
            existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
          }

          const merged = Array.isArray(data)
            ? existing.concat(data)
            : existing.concat([data]);

          fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
          console.log(`💾 Resultados guardados correctamente en ${filePath}`);
        } catch (err) {
          console.error("❌ Error guardando resultados:", err.message);
        }
        return null;
      }

      /** 🪵 Log persistente y visible */
      function safeLog(message) {
        const text = typeof message === "string" ? message : JSON.stringify(message);
        const logDir = path.join(__dirname, "auditorias");
        const logPath = path.join(logDir, "logs.txt");
        ensureDir(logDir);

        try {
          fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${text}\n`);
        } catch (err) {
          console.warn("⚠️ No se pudo escribir en logs.txt:", err.message);
        }

        console.log(`🧭 ${text}`);
        return null;
      }

      /** 📁 Crear carpeta recursiva si no existe */
      function createFolder(dir) {
        ensureDir(dir);
        console.log(`📁 Carpeta creada/verificada: ${dir}`);
        return null;
      }

      // =====================================================
      // 🚀 Ajustes de navegador en CI
      // =====================================================
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.name === "chrome" || browser.family === "chromium") {
          launchOptions.args.push("--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage");
        }
        return launchOptions;
      });

      // =====================================================
      // 🧩 Registro de tareas IAAP PRO
      // =====================================================
      on("task", {
        log: safeLog,
        clearCaptures,
        cleanOldResults,
        createFolder,

        readUrls() {
          return Promise.resolve(readUrls());
        },

        writeResults({ dir, data }) {
          writeResults({ dir, data });
          return Promise.resolve(null);
        },
      });

      // =====================================================
      // 🧾 Inicialización global de logs
      // =====================================================
      try {
        ensureDir(path.join(__dirname, "auditorias"));
        fs.writeFileSync(
          path.join(__dirname, "auditorias", "logs.txt"),
          `\n\n===== INICIO AUDITORÍA ${new Date().toISOString()} =====\n`
        );
      } catch (err) {
        console.warn("⚠️ No se pudo inicializar logs:", err.message);
      }

      return config;
    },
  },

  // =====================================================
  // 📊 REPORTER LIMPIO
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
