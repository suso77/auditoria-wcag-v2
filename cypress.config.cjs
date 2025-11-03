/**
 * ♿ Configuración universal de Cypress
 * Compatible con proyectos ESM ("type": "module") o CommonJS
 * ----------------------------------------------------------
 * - Permite usar tanto `import` como `require` en los tests.
 * - Incluye tareas personalizadas para accesibilidad (carpetas, resultados, logs...).
 * - Aumenta timeouts para auditorías complejas.
 * - Totalmente compatible con tu flujo actual de exportación y merge.
 * ----------------------------------------------------------
 */

const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://www.hiexperience.es",
    video: false,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 60000,
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.js",

    setupNodeEvents(on, config) {
      // =====================================================
      // ✅ LOGS EN CONSOLA (para debug visual en CI/local)
      // =====================================================
      on("task", {
        log(message) {
          console.log("🧠 [CYPRESS LOG]", message);
          return null;
        },

        // =====================================================
        // ✅ CREAR CARPETA DE AUDITORÍA
        // =====================================================
        createFolder(dirPath) {
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Carpeta creada: ${dirPath}`);
          }
          return null;
        },

        // =====================================================
        // ✅ GUARDAR RESULTADOS DE VIOLACIONES AXE (WCAG)
        // =====================================================
        writeResults({ dir, data }) {
          const filePath = path.join(dir, "results.json");
          let existing = [];

          if (fs.existsSync(filePath)) {
            try {
              existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
            } catch (err) {
              console.warn(`⚠️ Archivo JSON corrupto: ${filePath}. Será recreado.`);
              existing = [];
            }
          }

          if (Array.isArray(data)) {
            existing = existing.concat(data);
          } else {
            existing.push(data);
          }

          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          console.log(`🧩 Resultados guardados en ${filePath}`);
          return null;
        },

        // =====================================================
        // ✅ LIMPIAR AUDITORÍAS ANTIGUAS
        // =====================================================
        cleanOldResults() {
          const auditoriasDir = path.join(__dirname, "auditorias");
          if (!fs.existsSync(auditoriasDir)) return null;

          const files = fs.readdirSync(auditoriasDir);
          for (const file of files) {
            if (file.includes("auditoria") || file.startsWith("results-")) {
              const fullPath = path.join(auditoriasDir, file);
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`🧹 Carpeta o archivo eliminado: ${file}`);
            }
          }
          return null;
        },

        // =====================================================
        // ✅ LEER URLs DESDE scripts/urls.json
        // =====================================================
        readUrls() {
          const urlsPath = path.join(__dirname, "scripts", "urls.json");

          if (!fs.existsSync(urlsPath)) {
            throw new Error(`❌ No se encontró ${urlsPath}`);
          }

          const raw = fs.readFileSync(urlsPath, "utf8");
          const parsed = JSON.parse(raw);

          const urls = parsed
            .filter((item) => item && item.url)
            .map((item) => ({
              url: item.url.trim(),
              title: item.title?.trim() || "(sin título)",
            }));

          console.log(`🌐 URLs cargadas desde ${urlsPath}: ${urls.length}`);
          return urls;
        },
      });

      // Devuelve configuración final a Cypress
      return config;
    },
  },

  // =====================================================
  // ✅ REPORTER BONITO EN TERMINAL Y CI
  // =====================================================
  reporter: "spec",
  reporterOptions: {
    toConsole: true,
  },

  // =====================================================
  // ✅ VARIABLES DE ENTORNO
  // =====================================================
  env: {
    SITE_URL: process.env.SITE_URL || "https://www.hiexperience.es",
  },
});

