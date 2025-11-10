/**
 * ♿ Configuración universal Cypress – IAAP PRO v4.44-H (FINAL)
 * ------------------------------------------------------------
 * ✅ Compatible con auditorías híbridas (sitemap + interactiva)
 * ✅ Soporte integrado para axe-core, Pa11y y logs IAAP PRO
 * ✅ readUrls(), writeResults(), clearCaptures() y pa11yAudit()
 * ✅ Totalmente compatible con Node 24+, Cypress 15+ y CI/CD
 * ✅ Rutas estandarizadas para merge-auditorias.mjs
 * ------------------------------------------------------------
 */

import { defineConfig } from "cypress";
import fs from "fs-extra";
import path from "path";
import pa11y from "pa11y";

let createBundler = null;

// =============================================================
// ⚙️ Carga dinámica del preprocesador esbuild
// =============================================================
async function loadBundler() {
  try {
    const pre = await import("@bahmutov/cypress-esbuild-preprocessor");
    return pre.default;
  } catch (e) {
    console.warn("⚠️ No se pudo cargar el preprocesador:", e.message);
    return null;
  }
}

// =============================================================
// 🚀 Configuración principal Cypress E2E
// =============================================================
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
    viewportWidth: 1366,
    viewportHeight: 768,
    retries: { runMode: 1, openMode: 0 },

    async setupNodeEvents(on, config) {
      // =========================================================
      // 🧠 Preprocesador moderno (esbuild)
      // =========================================================
      createBundler = await loadBundler();
      if (!createBundler) {
        console.error("❌ No se pudo cargar el preprocesador esbuild.");
        process.exit(1);
      }

      const bundler = createBundler({
        define: { "process.env.NODE_ENV": JSON.stringify("test") },
        platform: "node",
        format: "esm",
      });

      on("file:preprocessor", bundler);
      console.log("🧠 Preprocesador configurado correctamente con esbuild moderno");

      // =========================================================
      // 🧩 Utilidades IAAP PRO
      // =========================================================
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

      // =========================================================
      // 🌍 readUrls() – Corrige Promise real
      // =========================================================
      const readUrls = () => {
        return new Promise((resolve) => {
          try {
            const urlsPath = path.join(process.cwd(), "scripts", "urls.json");
            if (!fs.existsSync(urlsPath)) {
              console.warn(`⚠️ No se encontró ${urlsPath}`);
              return resolve([]);
            }
            const raw = fs.readFileSync(urlsPath, "utf8").trim();
            if (!raw) {
              console.warn("⚠️ El archivo urls.json está vacío.");
              return resolve([]);
            }
            const parsed = JSON.parse(raw);
            const valid = parsed
              .filter((u) => u && u.url)
              .map((u) => ({
                url: u.url.trim(),
                title: u.title?.trim() || "(sin título)",
              }));
            console.log(`🌍 Cargadas ${valid.length} URLs desde ${urlsPath}`);
            resolve(valid);
          } catch (err) {
            console.error("❌ Error leyendo urls.json:", err.message);
            resolve([]);
          }
        });
      };

      // =========================================================
      // 💾 writeResults() – Con filename dinámico
      // =========================================================
      const writeResults = ({ dir, data, filename = "results.json" }) => {
        ensureDir(dir);
        const filePath = path.join(dir, filename);
        try {
          const existing = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, "utf8"))
            : [];
          const merged = Array.isArray(data)
            ? existing.concat(data)
            : [...existing, data];
          fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
          console.log(`💾 Resultados guardados correctamente en ${filePath}`);
        } catch (err) {
          console.error("❌ Error guardando resultados:", err.message);
        }
        return true;
      };

      // =========================================================
      // 🧭 Logs IAAP PRO
      // =========================================================
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

      // =========================================================
      // ♿ Task: Auditoría Pa11y
      // =========================================================
      const pa11yAudit = async (url) => {
        if (!url) return [];
        console.log(`🧩 Ejecutando auditoría Pa11y para: ${url}`);
        try {
          const results = await pa11y(url, {
            standard: "WCAG2AA",
            runners: ["htmlcs"],
            timeout: 60000,
            includeNotices: true,
            includeWarnings: true,
            log: { debug: () => {}, error: () => {}, info: () => {} },
            chromeLaunchConfig: {
              headless: true,
              args: ["--no-sandbox", "--disable-setuid-sandbox"],
            },
          });
          const mapped = (results?.issues || []).map((issue) => ({
            engine: "pa11y",
            code: issue.code,
            message: issue.message,
            context: issue.context,
            selector: issue.selector,
            type: issue.type,
            wcag: issue.code?.match(/WCAG\\d+\\.\\d+/)?.[0] || "N/A",
          }));
          console.log(`♿ Pa11y completado (${url}) — ${mapped.length} issues`);
          return mapped;
        } catch (err) {
          console.error(`❌ Error en Pa11y (${url}): ${err.message}`);
          return [];
        }
      };

      // =========================================================
      // 🔗 Registrar tasks IAAP PRO
      // =========================================================
      on("task", {
        log: safeLog,
        clearCaptures,
        createFolder,
        readUrls,
        writeResults,
        pa11yAudit,
      });

      // =========================================================
      // 🚀 Configuración de navegador (CI/local)
      // =========================================================
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (["chrome", "chromium", "edge"].includes(browser.name)) {
          launchOptions.args.push(
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage"
          );
        }
        return launchOptions;
      });

      // =========================================================
      // 🧾 Inicialización de logs
      // =========================================================
      try {
        ensureDir(path.join(process.cwd(), "auditorias"));
        fs.writeFileSync(
          path.join(process.cwd(), "auditorias", "logs.txt"),
          `\n===== INICIO AUDITORÍA ${new Date().toISOString()} =====\n`
        );
      } catch (err) {
        console.warn("⚠️ No se pudo inicializar logs:", err.message);
      }

      return config;
    },
  },

  // =========================================================
  // 📊 Reporter y entorno
  // =========================================================
  reporter: "spec",
  reporterOptions: { toConsole: true },
  env: {
    SITE_URL: process.env.SITE_URL || "https://www.hiexperience.es",
  },
});


