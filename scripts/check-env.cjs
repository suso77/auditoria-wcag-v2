/**
 * ✅ check-env.cjs (versión avanzada, estable y CI-safe)
 * ----------------------------------------------------------------------
 * Verifica que existan los archivos y carpetas mínimos
 * antes de ejecutar la auditoría WCAG.
 * Incluye comprobación HTTP no bloqueante del SITE_URL.
 * Compatible con chalk v5+, Node 20+ y entornos CI.
 * ----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// 🧩 Importar chalk dinámicamente (v5 es ESM)
let chalk;
(async () => {
  try {
    const mod = await import("chalk");
    chalk = mod.default;
  } catch {
    // Fallback sin colores
    chalk = new Proxy({}, { get: () => (txt) => txt });
  }

  // ============================
  // 🧩 Funciones de utilidad
  // ============================
  function check(p, label) {
    if (!fs.existsSync(p)) {
      console.error(chalk.redBright(`❌ ${label}: no encontrado → ${p}`));
      process.exit(1);
    } else {
      console.log(chalk.green(`✅ ${label}: OK`));
    }
  }

  function ensureDir(p, label) {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      console.log(chalk.yellow(`📁 Carpeta creada automáticamente: ${label}`));
    }
  }

  async function checkSite(url) {
    return new Promise((resolve) => {
      if (!url || url.startsWith("(")) {
        console.log(chalk.yellow("⚠️ SITE_URL no definido. Se omitirá la comprobación HTTP."));
        return resolve();
      }

      const client = url.startsWith("https") ? https : http;
      console.log(chalk.cyan(`\n🌐 Verificando disponibilidad del sitio: ${url}`));

      const req = client.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(chalk.green(`✅ Sitio accesible (HTTP ${res.statusCode})`));
        } else {
          console.warn(chalk.yellow(`⚠️ El sitio respondió con HTTP ${res.statusCode}. Se continuará igualmente.`));
        }
        res.resume(); // ✅ consume el flujo antes de cerrar
        req.destroy();
        resolve();
      });

      req.on("error", (err) => {
        console.warn(chalk.yellow(`⚠️ No se pudo acceder al sitio: ${err.message}. Se continuará igualmente.`));
        resolve();
      });

      req.on("timeout", () => {
        req.destroy();
        console.warn(chalk.yellow("⚠️ Timeout al intentar acceder al sitio. Se continuará igualmente."));
        resolve();
      });
    });
  }

  // ============================
  // 🧾 Mostrar entorno
  // ============================
  console.log(chalk.cyan.bold?.("\n♿ Verificación del entorno WCAG CI\n") || "\n♿ Verificación del entorno WCAG CI\n");

  const envVars = {
    "🌍 SITE_URL": process.env.SITE_URL || "(no definido)",
    "⚙️ NODE_ENV": process.env.NODE_ENV || "(no definido)",
    "🚦 CRITICAL_MAX": process.env.CRITICAL_MAX || "(no definido)",
    "⚠️ SERIOUS_MAX": process.env.SERIOUS_MAX || "(no definido)",
    "🕒 TZ": process.env.TZ || "(no definido)",
  };

  for (const [k, v] of Object.entries(envVars)) {
    console.log(`${k}: ${chalk.whiteBright?.(v) || v}`);
  }

  // ============================
  // 🧱 Validaciones básicas
  // ============================
  console.log(chalk.cyan?.("\n🔍 Validando estructura mínima...") || "\n🔍 Validando estructura mínima...");

  const possibleConfigs = ["cypress.config.js", "cypress.config.cjs", "cypress.config.mjs"];
  const foundConfig = possibleConfigs.find((f) => fs.existsSync(f));

  if (foundConfig) {
    console.log(chalk.green(`✅ Archivo de configuración Cypress detectado: ${foundConfig}`));
  } else {
    console.error(chalk.redBright(`❌ No se encontró ningún archivo de configuración Cypress (${possibleConfigs.join(", ")})`));
    process.exit(1);
  }

  check("scripts", "Carpeta scripts");
  check("cypress/e2e", "Carpeta de tests e2e");
  check("cypress/e2e/accesibilidad-sitemap.cy.js", "Test accesibilidad-sitemap.cy.js");

  if (fs.existsSync("scripts/urls.json")) {
    console.log(chalk.green("✅ scripts/urls.json detectado correctamente."));
  } else {
    console.log(chalk.yellow("⚠️ No se encontró scripts/urls.json — se generará durante el rastreo."));
  }

  // ============================
  // 🧱 Directorios de salida
  // ============================
  ensureDir("auditorias", "auditorias/");
  ensureDir("auditorias/capturas", "auditorias/capturas/");

  // ============================
  // 🌐 Verificación HTTP opcional
  // ============================
  await checkSite(process.env.SITE_URL);

  // ============================
  // ✅ Resultado final
  // ============================
  console.log(chalk.bold?.green?.("\n✅ Entorno validado correctamente. Todo listo para la auditoría WCAG.\n") || "\n✅ Entorno validado correctamente. Todo listo para la auditoría WCAG.\n");
})();






