/**
 * ✅ check-env.cjs (IAAP PRO v5.0 híbrido compatible)
 * ----------------------------------------------------------------------
 * Verifica que existan los archivos y carpetas mínimos
 * antes de ejecutar la auditoría WCAG (Cypress + axe-core + Pa11y).
 * Compatible con Cypress moderno (ESM), Node 20+, y entornos CI/CD.
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
    chalk = new Proxy({}, { get: () => (txt) => txt }); // fallback sin color
  }

  // ============================
  // 🧩 Utilidades
  // ============================
  const check = (p, label) => {
    if (!fs.existsSync(p)) {
      console.error(chalk.redBright(`❌ ${label}: no encontrado → ${p}`));
      process.exit(1);
    } else {
      console.log(chalk.green(`✅ ${label}: OK`));
    }
  };

  const ensureDir = (p, label) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      console.log(chalk.yellow(`📁 Carpeta creada automáticamente: ${label}`));
    }
  };

  const checkSite = async (url) =>
    new Promise((resolve) => {
      if (!url || url.startsWith("(")) {
        console.log(chalk.yellow("⚠️ SITE_URL no definido. Se omite la comprobación HTTP."));
        return resolve();
      }

      const client = url.startsWith("https") ? https : http;
      console.log(chalk.cyan(`\n🌐 Verificando disponibilidad del sitio: ${url}`));

      const req = client.get(url, { timeout: 8000 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(chalk.green(`✅ Sitio accesible (HTTP ${res.statusCode})`));
        } else {
          console.warn(chalk.yellow(`⚠️ El sitio respondió con HTTP ${res.statusCode}. Se continuará.`));
        }
        res.resume();
        req.destroy();
        resolve();
      });

      req.on("error", (err) => {
        console.warn(chalk.yellow(`⚠️ No se pudo acceder al sitio: ${err.message}`));
        resolve();
      });

      req.on("timeout", () => {
        req.destroy();
        console.warn(chalk.yellow("⚠️ Timeout en la comprobación HTTP."));
        resolve();
      });
    });

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
  // 🧱 Validaciones principales
  // ============================
  console.log(chalk.cyan?.("\n🔍 Validando estructura mínima...") || "\n🔍 Validando estructura mínima...");

  const possibleConfigs = ["cypress.config.js", "cypress.config.cjs", "cypress.config.mjs"];
  const foundConfig = possibleConfigs.find((f) => fs.existsSync(f));
  if (foundConfig) {
    console.log(chalk.green(`✅ Configuración Cypress detectada: ${foundConfig}`));
  } else {
    console.error(chalk.redBright(`❌ No se encontró archivo de configuración Cypress (${possibleConfigs.join(", ")})`));
    process.exit(1);
  }

  check("scripts", "Carpeta scripts");
  check("cypress/e2e", "Carpeta de tests e2e");

  // ✅ Buscar automáticamente los tests híbridos
  const possibleTests = [
    "cypress/e2e/accesibilidad-sitemap-hibrido.cy.js",
    "cypress/e2e/accesibilidad-sitemap.cy.js",
  ];
  const sitemapTest = possibleTests.find((f) => fs.existsSync(f));
  if (sitemapTest) {
    console.log(chalk.green(`✅ Test sitemap detectado: ${sitemapTest}`));
  } else {
    console.error(chalk.redBright("❌ No se encontró ningún test de sitemap válido (híbrido o estándar)."));
    process.exit(1);
  }

  const possibleInteractiva = [
    "cypress/e2e/accesibilidad-interactiva-hibrida.cy.js",
    "cypress/e2e/accesibilidad-interactiva.cy.js",
  ];
  const interactivaTest = possibleInteractiva.find((f) => fs.existsSync(f));
  if (interactivaTest) {
    console.log(chalk.green(`✅ Test interactivo detectado: ${interactivaTest}`));
  } else {
    console.error(chalk.redBright("❌ No se encontró ningún test de auditoría interactiva (híbrido o estándar)."));
    process.exit(1);
  }

  // URLs detectadas
  if (fs.existsSync("scripts/urls.json")) {
    console.log(chalk.green("✅ scripts/urls.json detectado correctamente."));
  } else {
    console.log(chalk.yellow("⚠️ No se encontró scripts/urls.json — se generará durante el rastreo."));
  }

  // ============================
  // 📂 Directorios de salida
  // ============================
  ensureDir("auditorias", "auditorias/");
  ensureDir("auditorias/capturas", "auditorias/capturas/");
  ensureDir("auditorias/reportes", "auditorias/reportes/");

  // ============================
  // 🌐 Verificación HTTP opcional
  // ============================
  await checkSite(process.env.SITE_URL);

  // ============================
  // ✅ Resultado final
  // ============================
  console.log(chalk.bold?.green?.("\n✅ Entorno validado correctamente. Todo listo para la auditoría WCAG IAAP PRO.\n") || "\n✅ Entorno validado correctamente. Todo listo para la auditoría WCAG IAAP PRO.\n");
})();







