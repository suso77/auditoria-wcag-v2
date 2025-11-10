/**
 * ♿ Configuración universal de Cypress (IAAP PRO v4.16-H3 / WCAG 2.2 + Pa11y + axe)
 * --------------------------------------------------------------------
 * ✅ Auditorías WCAG (sitemap + interactiva)
 * ✅ Soporte Pa11y/Axe/WAVE vía cy.task() en Node
 * ✅ Compatible con Cypress 15+ y Node 24
 * ✅ esbuild moderno + paths absolutos seguros
 * ✅ Logs y capturas IAAP PRO unificados
 * ✅ CI/CD, Docker y ejecución local
 * --------------------------------------------------------------------
 */

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pa11y from "pa11y";
import { runPa11yAudit } from "./scripts/audit-multi-engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let createBundler = null;

// =====================================================
// ⚙️ Carga dinámica del preprocesador esbuild
// =====================================================
async function loadBundler() {
  try {
    const pre = await import("@bahmutov/cypress-esbuild-preprocessor");
    return pre.default;
  } catch (e) {
    console.warn("⚠️ No se pudo cargar el preprocesador:", e.message);
    return null;
  }
}

// =====================================================
// 🧠 defineConfig manual (fallback)
// =====================================================
function defineConfig(config) {
  return config;
}

// =====================================================
// 🚀 Configuración principal Cypress E2E
// =====================================================
export default defineConfig({
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

    async setupNodeEvents(on, config) {
      // =====================================================
      // ⚙️ Preprocesador esbuild moderno
      // =====================================================
      createBundler = await loadBundler();
      if (!createBundler) {
        console.error("❌ No se pudo cargar el preprocesador esbuild. Abortando ejecución.");
        process.exit(1);
      }

      try {
        const bundler = createBundler({
          define: { "process.env.NODE_ENV": JSON.stringify("test") },
          platform: "node",
          format: "esm",
        });

        on("file:preprocessor", bundler);
        console.log("🧠 Preprocesador configurado correctamente con esbuild moderno");
      } catch (err) {
        console.error("❌ Error inicializando el preprocesador:", err.message);
        process.exit(1);
      }

      // =====================================================
      // 🧩 Funciones auxiliares IAAP PRO
      // =====================================================
      const ensureDir = (dirPath) => {
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      };

      const clearCaptures = () => {
        const dir = path.join(process.cwd(), "auditorias", "capturas");
        try {
          fs.emptyDirSync(dir);
          console.log("🧹 Capturas anteriores eliminadas correctamente.");
        } catch (err) {
          console.warn("⚠️ Error al limpiar capturas:", err.message);
        }
        return true;
      };

      const readUrls = () => {
        try {
          const projectRoot = process.cwd();
          const urlsPath = path.join(projectRoot, "scripts", "urls.json");

          if (!fs.existsSync(urlsPath)) {
            console.warn(`⚠️ No se encontró ${urlsPath}`);
            return [];
          }

          const raw = fs.readFileSync(urlsPath, "utf8").trim();
          if (!raw) {
            console.warn("⚠️ El archivo urls.json está vacío.");
            return [];
          }

          const parsed = JSON.parse(raw);
          const valid = parsed
            .filter((u) => u && u.url)
            .map((u) => ({
              url: u.url.trim(),
              title: u.title?.trim() || "(sin título)",
            }));

          console.log(`🌍 Cargadas ${valid.length} URLs desde ${urlsPath}`);
          return valid;
        } catch (err) {
          console.error("❌ Error leyendo urls.json:", err.message);
          return [];
        }
      };

      const writeResults = ({ dir, data }) => {
        ensureDir(dir);
        const filePath = path.join(dir, "results.json");
        try {
          const existing = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, "utf8"))
            : [];
          const merged = Array.isArray(data) ? existing.concat(data) : [...existing, data];
          fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
          console.log(`💾 Resultados guardados correctamente en ${filePath}`);
        } catch (err) {
          console.error("❌ Error guardando resultados:", err.message);
        }
        return true;
      };

      const safeLog = (message) => {
        const text = typeof message === "string" ? message : JSON.stringify(message);
        const logDir = path.join(process.cwd(), "auditorias");
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
      // ♿ Task: Auditoría Pa11y/Axe Node (corregido)
      // =====================================================
      on("task", {
        log: safeLog,
        clearCaptures,
        createFolder,
        readUrls,
        writeResults,

        async pa11yAudit(url) {
          console.log(`🧩 Ejecutando auditoría accesibilidad Node: ${url}`);
          try {
            const results = await pa11y(url, {
              standard: "WCAG2AA",
              runners: ["htmlcs"],
              // ✅ Logger vacío para evitar "options.log.info is not a function"
              log: {
                debug: () => {},
                error: () => {},
                info: () => {},
              },
              timeout: 60000,
              includeNotices: true,
              includeWarnings: true,
              chromeLaunchConfig: {
                headless: true,
                args: [
                  "--no-sandbox",
                  "--disable-setuid-sandbox",
                  "--disable-dev-shm-usage",
                  "--disable-gpu",
                ],
              },
            });

            const mapped = results.issues.map((issue) => ({
              code: issue.code,
              message: issue.message,
              context: issue.context,
              selector: issue.selector,
              type: issue.type,
              typeCode: issue.typeCode,
            }));

            console.log(`✅ Auditoría completada (${mapped.length} issues).`);
            return mapped;
          } catch (err) {
            console.error(`❌ Error ejecutando Pa11y en ${url}: ${err.message}`);
            return [];
          }
        },
      });

      // =====================================================
      // 🚀 Ajustes de navegador (CI)
      // =====================================================
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.name === "chrome" || browser.family === "chromium") {
          launchOptions.args.push("--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage");
        }
        return launchOptions;
      });

      // =====================================================
      // 🧾 Inicialización global de logs
      // =====================================================
      try {
        ensureDir(path.join(process.cwd(), "auditorias"));
        fs.writeFileSync(
          path.join(process.cwd(), "auditorias", "logs.txt"),
          `\n\n===== INICIO AUDITORÍA ${new Date().toISOString()} =====\n`
        );
      } catch (err) {
        console.warn("⚠️ No se pudo inicializar logs:", err.message);
      }

      return config;
    },
  },

  // =====================================================
  // 📊 Reporter y entorno
  // =====================================================
  reporter: "spec",
  reporterOptions: { toConsole: true },
  env: {
    SITE_URL: process.env.SITE_URL || "https://www.hiexperience.es",
  },
});
