/**
 * ⚙️ IAAP PRO v6.8 – Plugin principal de Cypress
 * --------------------------------------------------------------
 * ✅ Añade tareas personalizadas para auditorías de accesibilidad
 * ✅ Soporte para Pa11y + fallback axe-core
 * ✅ Manejo de errores, logs y timeouts seguros en CI/CD
 * ✅ Funciones utilitarias: lectura de URLs, creación de carpetas, escritura de resultados
 */

import fs from "fs";
import path from "path";
import pa11y from "pa11y";
import { execSync } from "child_process";

/**
 * 📁 Crear carpeta si no existe
 */
function createFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`📂 Carpeta creada: ${folderPath}`);
  }
}

/**
 * 📖 Leer archivo JSON de URLs
 */
function readUrls(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Archivo no encontrado: ${filePath}`);
      return [];
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log(`✅ ${data.length} URLs cargadas desde ${filePath}`);
    return data;
  } catch (err) {
    console.error(`❌ Error al leer ${filePath}: ${err.message}`);
    return [];
  }
}

/**
 * 💾 Guardar resultados intermedios o finales
 */
function writeResults({ dir, data, filename = "results-temp.json" }) {
  try {
    createFolder(dir);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Resultados guardados en ${filePath}`);
  } catch (err) {
    console.error(`❌ Error al guardar resultados: ${err.message}`);
  }
}

/**
 * 🧹 Borrar capturas antiguas
 */
function clearCaptures() {
  const dir = path.join(process.cwd(), "auditorias/capturas");
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("🧹 Carpeta de capturas limpiada.");
  }
}

/**
 * ♿ Ejecutar auditoría Pa11y con control y fallback
 */
async function runPa11yAudit(url) {
  console.log(`♿ Iniciando auditoría Pa11y en: ${url}`);
  try {
    const results = await pa11y(url, {
      timeout: 45000,
      log: { debug: () => {}, error: () => {}, info: () => {} },
      standard: "WCAG2AA",
      runners: ["axe", "htmlcs"],
      chromeLaunchConfig: {
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });

    if (!results || !results.issues || results.issues.length === 0) {
      console.warn(`⚠️ Pa11y no detectó issues o devolvió resultados vacíos en: ${url}`);
      return [];
    }

    console.log(`✅ Pa11y completado (${results.issues.length} issues detectados)`);
    return results.issues;
  } catch (err) {
    console.error(`❌ Error ejecutando Pa11y en ${url}: ${err.message}`);
    return [];
  }
}

/**
 * 🚀 Exportar tareas personalizadas a Cypress
 */
export default (on, config) => {
  on("task", {
    log: (message) => {
      console.log(message);
      return null;
    },

    createFolder: (folderPath) => {
      createFolder(folderPath);
      return null;
    },

    readUrls: (filePath) => readUrls(filePath),

    writeResults: (args) => {
      writeResults(args);
      return null;
    },

    clearCaptures: () => {
      clearCaptures();
      return null;
    },

    /**
     * ♿ Ejecutar auditoría Pa11y con control
     */
    async pa11yAudit(url) {
      if (!url || !/^https?:\/\//.test(url)) {
        console.warn(`⚠️ URL no válida: ${url}`);
        return [];
      }

      // 🔍 Intentar ejecución directa de Pa11y
      let results = await runPa11yAudit(url);

      // 🔁 Si no devuelve resultados, reintentar una vez
      if (results.length === 0) {
        console.log("🔁 Reintentando auditoría Pa11y (2º intento)...");
        results = await runPa11yAudit(url);
      }

      // ⚙️ Si sigue vacío, probar fallback manual vía CLI (último recurso)
      if (results.length === 0) {
        try {
          console.log("🧩 Ejecutando fallback Pa11y CLI...");
          const cliResult = execSync(`npx pa11y --reporter json "${url}"`, {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 60000,
          });
          const parsed = JSON.parse(cliResult);
          if (parsed && parsed.issues) results = parsed.issues;
        } catch {
          console.warn("⚠️ Fallback CLI también falló. Se usará axe-core desde el test.");
        }
      }

      return results;
    },
  });

  return config;
};
