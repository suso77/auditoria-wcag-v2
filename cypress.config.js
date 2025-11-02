const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || "https://example.com",
    video: false,
    screenshotOnRunFailure: true,

    setupNodeEvents(on, config) {
      on("task", {
        // =====================================================
        // ✅ LOGS EN CONSOLA
        // =====================================================
        log(message) {
          console.log(message);
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
        // ✅ GUARDAR RESULTADOS DE VIOLACIONES AXE
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

          // Añadir nuevos datos
          existing.push(data);
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
            if (file.includes("auditoria")) {
              const fullPath = path.join(auditoriasDir, file);
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`🧹 Carpeta eliminada: ${file}`);
            }
          }
          return null;
        },

        // =====================================================
        // ✅ NUEVO: LEER URLs DESDE scripts/urls.json (sin usar fs en el navegador)
        // =====================================================
        readUrls() {
          const urlsPath = path.join(__dirname, "scripts", "urls.json");

          if (!fs.existsSync(urlsPath)) {
            throw new Error(`❌ No se encontró ${urlsPath}`);
          }

          const raw = fs.readFileSync(urlsPath, "utf8");
          const urls = JSON.parse(raw);

          console.log(`🌐 URLs cargadas desde ${urlsPath}: ${urls.length}`);
          return urls;
        },
      });

      return config;
    },
  },
});





