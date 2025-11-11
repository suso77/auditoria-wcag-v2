import { defineConfig } from "cypress";
import fs from "fs-extra";
import path from "path";
import pa11y from "pa11y";

let createBundler = null;

async function loadBundler() {
  try {
    const pre = await import("@bahmutov/cypress-esbuild-preprocessor");
    return pre.default;
  } catch (e) {
    console.warn("⚠️ No se pudo cargar el preprocesador esbuild:", e.message);
    return null;
  }
}

export default defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://www.hiexperience.es",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.js",
    screenshotsFolder: "auditorias/capturas",
    screenshotOnRunFailure: true,
    video: false,
    chromeWebSecurity: false, // Deshabilitar la seguridad de Chrome si es necesario para iframes
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    viewportWidth: 1366,
    viewportHeight: 768,
    retries: { runMode: 1, openMode: 0 },

    async setupNodeEvents(on, config) {
      // Cargar el bundler de esbuild
      createBundler = await loadBundler();
      if (!createBundler) {
        console.warn("[IAAP] ⚠️ No se cargó esbuild, usando configuración predeterminada.");
      } else {
        const bundler = createBundler({
          define: { "process.env.NODE_ENV": JSON.stringify("test") },
          platform: "node",
          format: "esm",
        });

        on("file:preprocessor", bundler);
        console.log("[IAAP] 🧠 Preprocesador configurado correctamente con esbuild moderno.");
      }

      // Registrar tareas personalizadas
      const registerAxeTask = require("./cypress/plugins/get-axe-source.cjs");
      registerAxeTask(on);

      on("task", {
        log(message) {
          console.log(message);
          return null;
        },

        verifyAxeSource() {
          const axePath = path.resolve("node_modules/axe-core/axe.min.js");
          if (fs.existsSync(axePath)) {
            console.log(`[IAAP] ✅ axe-core detectado correctamente: ${axePath}`);
            return true;
          } else {
            console.error("[IAAP] ❌ axe-core no encontrado en node_modules.");
            return false;
          }
        },

        clearCaptures() {
          const dir = path.join(process.cwd(), "auditorias", "capturas");
          try {
            fs.emptyDirSync(dir);
            console.log("[IAAP] 🧹 Capturas anteriores eliminadas correctamente.");
          } catch (err) {
            console.warn("[IAAP] ⚠️ Error al limpiar capturas:", err.message);
          }
          return true;
        },

        createFolder(dir) {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          console.log(`[IAAP] 📁 Carpeta creada/verificada: ${dir}`);
          return true;
        },

        readUrls() {
          const urlsPath = path.join(process.cwd(), "scripts", "urls.json");
          if (!fs.existsSync(urlsPath)) {
            console.warn(`[IAAP] ⚠️ No se encontró ${urlsPath}`);
            return [];
          }
          const raw = fs.readFileSync(urlsPath, "utf8").trim();
          if (!raw) {
            console.warn("[IAAP] ⚠️ El archivo urls.json está vacío.");
            return [];
          }
          try {
            const parsed = JSON.parse(raw);
            return parsed
              .filter((u) => u && u.url)
              .map((u) => ({
                url: u.url.trim(),
                title: u.title?.trim() || "(sin título)",
              }));
          } catch (err) {
            console.error(`[IAAP] ❌ Error parseando urls.json: ${err.message}`);
            return [];
          }
        },

        writeResults({ dir, data, filename }) {
          const isInteractiva = dir.toLowerCase().includes("interactiva");
          const safeName =
            filename || `results-${isInteractiva ? "interactiva" : "sitemap"}-${Date.now()}.json`;
          const filePath = path.join(dir, safeName);

          try {
            const existing = fs.existsSync(filePath)
              ? JSON.parse(fs.readFileSync(filePath, "utf8"))
              : [];
            const merged = Array.isArray(data)
              ? [...existing, ...data]
              : [...existing, data];

            console.log(`[IAAP] 💾 Guardando ${merged.length} resultados en ${filePath}`);
            fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf8");
            console.log(`[IAAP] ✅ Resultados guardados correctamente.`);
          } catch (err) {
            console.error("[IAAP] ❌ Error guardando resultados:", err.message);
          }
          return filePath;
        },

        async pa11yAudit(url) {
          if (!url) return [];
          console.log(`[IAAP] 🧩 Ejecutando auditoría Pa11y para: ${url}`);
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
                args: [
                  "--no-sandbox",
                  "--disable-setuid-sandbox",
                  "--disable-gpu",
                  "--disable-dev-shm-usage",
                  "--window-size=1366,768",
                ],
              },
            });

            const mapped = (results?.issues || []).map((issue) => ({
              engine: "pa11y",
              code: issue.code,
              message: issue.message,
              context: issue.context,
              selector: issue.selector,
              type: issue.type,
              wcag: issue.code?.match(/WCAG\d+\.\d+/)?.[0] || "N/A",
            }));

            console.log(`[IAAP] ♿ Pa11y completado (${url}) — ${mapped.length} issues`);
            return mapped;
          } catch (err) {
            console.error(`[IAAP] ❌ Error en Pa11y (${url}): ${err.message}`);
            return [];
          }
        },
      });

      return config;
    },
  },
});




