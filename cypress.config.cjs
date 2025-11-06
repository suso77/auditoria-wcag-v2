/**
 * ♿ Configuración universal de Cypress (v2.3 IAAP PRO / WCAG 2.2)
 * --------------------------------------------------------------------
 * ✅ Compatible con auditorías WCAG (sitemap + interactiva) y exportación JSON/XLSX
 * ✅ Limpieza automática de capturas y resultados antiguos
 * ✅ Soporte total para CI/CD (GitHub Actions, Docker, local)
 * ✅ Logs persistentes + creación automática de carpetas
 * ✅ Estabilidad reforzada y compatibilidad con Cypress.Promise.each
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
      // 🧩 TAREAS PERSONALIZADAS WCAG + OPCIONES PRO
      // =====================================================

      /** 📁 Crea carpeta si no existe */
      function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      }

      /** 🧹 Limpia capturas anteriores */
      function clearCaptures() {
        const dir = path.join(__dirname, "auditorias", "capturas");
        try {
          fs.emptyDirSync(dir);
          console.log("🧹 Capturas anteriores eliminadas correctamente.");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        } catch (err) {
          console.warn("⚠️ Error al limpiar capturas:", err.message);
        }
        return null;
      }

      /** 🧹 Limpia resultados antiguos */
      function cleanOldResults() {
        const auditoriasDir = path.join(__dirname, "auditorias");
        if (!fs.existsSync(auditoriasDir)) return null;

        const files = fs.readdirSync(auditoriasDir);
        for (const file of files) {
          if (file.startsWith("results-") || file.includes("auditoria")) {
            try {
              fs.rmSync(path.join(auditoriasDir, file), { recursive: true, force: true });
              console.log(`🧹 Eliminado archivo antiguo: ${file}`);
            } catch (err) {
              console.warn(`⚠️ No se pudo eliminar ${file}: ${err.message}`);
            }
          }
        }
        return null;
      }

      /** 🌐 Lee URLs desde scripts/urls.json */
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

      /** 💾 Guarda resultados JSON */
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

      /** 🪵 Log seguro */
      function safeLog(message) {
        const text = typeof message === "string" ? message : JSON.stringify(message);
        const logDir = path.join(__dirname, "auditorias");
        const logPath = path.join(logDir, "logs.txt");

        try {
          ensureDir(logDir);
          fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${text}\n`);
        } catch (err) {
          console.warn("⚠️ No se pudo escribir en logs.txt:", err.message);
        }

        console.log(`🧭 ${text}`);
        return null;
      }

      /** 📁 Crear carpeta recursiva */
      function createFolder(dir) {
        ensureDir(dir);
        console.log(`📁 Carpeta creada/verificada: ${dir}`);
        return null;
      }

      // =====================================================
      // 🚀 Config extra para CI
      // =====================================================
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.name === "chrome" || browser.family === "chromium") {
          launchOptions.args.push("--no-sandbox", "--disable-gpu");
        }
        return launchOptions;
      });

      // =====================================================
      // 📚 Registrar tareas
      // =====================================================
      on("task", {
        log: safeLog,
        clearCaptures,
        cleanOldResults,
        readUrls,
        writeResults,
        createFolder,
      });

      // 📦 Limpieza inicial global antes de ejecución (solo primera auditoría)
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

