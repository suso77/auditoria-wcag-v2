/**
 * ♿ Configuración universal de Cypress (IAAP PRO v4.0.6 / WCAG 2.2)
 * --------------------------------------------------------------------
 * ✅ Compatible con auditorías WCAG (sitemap + interactiva)
 * ✅ Soporte CI/CD (GitHub Actions, Docker, local)
 * ✅ Evita error “Cannot find module 'cypress'” en CI
 * ✅ Limpieza automática y logs persistentes
 * ✅ Carga segura del preprocesador ESBuild
 * --------------------------------------------------------------------
 */

const fs = require("fs-extra");
const path = require("path");

let createBundler = null;
try {
  // Solo cargamos el preprocesador si no estamos dentro de Electron
  if (!process.env.CYPRESS_INTERNAL_ENV) {
    createBundler = require("@bahmutov/cypress-esbuild-preprocessor");
  } else {
    console.log("⚙️ Modo CI detectado — omitiendo carga del preprocesador esbuild");
  }
} catch (e) {
  console.warn("⚠️ No se pudo cargar el preprocesador (no crítico):", e.message);
}

// Fallback manual: si defineConfig no existe, usamos un wrapper
function defineConfig(config) {
  return config;
}

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://www.hiexperience.es",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.js",

    screenshotsFolder: "auditorias/capturas",
    screenshotOnRunFailure: true,
    video: false,
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
      // 🧠 Carga condicional del preprocesador (solo local)
      // =====================================================
      if (createBundler) {
        on("file:preprocessor", createBundler());
      }

      // =====================================================
      // 🧩 FUNCIONES UTILITARIAS IAAP PRO
      // =====================================================
      const ensureDir = (dirPath) => {
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      };

      const clearCaptures = () => {
        const dir = path.join(__dirname, "auditorias", "capturas");
        try {
          fs.emptyDirSync(dir);
          console.log("🧹 Capturas anteriores eliminadas correctamente.");
        } catch (err) {
          console.warn("⚠️ Error al limpiar capturas:", err.message);
        }
        return true;
      };

      const cleanOldResults = () => {
        const auditoriasDir = path.join(__dirname, "auditorias");
        if (!fs.existsSync(auditoriasDir)) return true;

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
        return true;
      };

      const readUrls = () => {
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
      };

      const writeResults = ({ dir, data }) => {
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
        return true;
      };

      const safeLog = (message) => {
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
        return true;
      };

      const createFolder = (dir) => {
        ensureDir(dir);
        console.log(`📁 Carpeta creada/verificada: ${dir}`);
        return true;
      };

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
        readUrls,
        writeResults,
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

  reporter: "spec",
  reporterOptions: { toConsole: true },

  env: {
    SITE_URL: process.env.SITE_URL || "https://www.hiexperience.es",
  },
});
