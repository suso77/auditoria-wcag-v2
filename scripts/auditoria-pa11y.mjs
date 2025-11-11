/**
 * ♿ IAAP PRO v4.16-H3 — Auditoría Pa11y (HTML_CodeSniffer)
 * ---------------------------------------------------------
 * Ejecuta Pa11y en una lista de URLs y genera:
 *  - auditorias/pa11y-results.json
 *
 * Compatible con merge-auditorias.mjs (v4.16-H3)
 * ---------------------------------------------------------
 */

import pa11y from "pa11y";
import fs from "fs";
import path from "path";

const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");
const OUTPUT = path.join(AUDITORIAS_DIR, "pa11y-results.json");

// 👇 Lista de páginas a analizar
const urls = [
  "https://tusitio.com/",
  "https://tusitio.com/contacto",
  "https://tusitio.com/servicios"
];

// Opciones de Pa11y
const options = {
  standard: "WCAG2AA",
  timeout: 60000,
  wait: 2000,
  includeNotices: false,
  includeWarnings: false,
  chromeLaunchConfig: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
};

// Función async para ejecutar la auditoría
const ejecutarAuditoria = async () => {
  const resultados = [];

  // Ejecución secuencial
  for (const url of urls) {
    console.log(`🔍 Ejecutando Pa11y en ${url}`);
    try {
      const result = await pa11y(url, options);
      resultados.push({
        pageUrl: url,
        pa11y: result.issues.map((i) => ({
          code: i.code,
          type: i.type,
          message: i.message,
          selector: i.selector,
          context: i.context,
        })),
      });
      console.log(`✅ ${result.issues.length} hallazgos en ${url}`);
    } catch (err) {
      console.error(`❌ Error analizando ${url}: ${err.message}`);
    }
  }

  // Guardar resultados
  fs.writeFileSync(OUTPUT, JSON.stringify(resultados, null, 2), "utf8");
  console.log(`💾 Resultados Pa11y guardados en: ${OUTPUT}`);
  console.log("🎯 Auditoría Pa11y completada IAAP PRO v4.16-H3");
};

// Ejecutar la función
ejecutarAuditoria();

