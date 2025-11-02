/**
 * 🚦 quality-gate.cjs (versión CommonJS mejorada)
 * -----------------------------------------------------------------
 * ✅ Busca recursivamente el último results-merged-*.json
 * ✅ Evalúa violaciones críticas y serias contra umbrales
 * ✅ Genera informe JSON + resumen visual para GitHub Actions
 * ✅ 100% compatible con Node.js 20+ y GitHub Actions
 */

const fs = require("fs");
const path = require("path");
const process = require("process");

async function main() {
  const ROOT_DIR = process.cwd();
  const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

  const CRITICAL_MAX = parseInt(process.env.CRITICAL_MAX || "0", 10);
  const SERIOUS_MAX = parseInt(process.env.SERIOUS_MAX || "5", 10);

  // 🔍 Buscar recursivamente el último results-merged-*.json
  function findMergedResults(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results = results.concat(findMergedResults(fullPath));
      else if (entry.name.startsWith("results-merged-") && entry.name.endsWith(".json"))
        results.push(fullPath);
    }
    return results;
  }

  const mergedFiles = findMergedResults(AUDITORIAS_DIR)
    .map(f => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (!mergedFiles.length) {
    console.error("❌ No se encontró ningún results-merged-*.json (ni en subcarpetas)");
    process.exit(1);
  }

  const latestFile = mergedFiles[0].path;
  console.log(`📊 Analizando resultados desde: ${latestFile}`);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  } catch (err) {
    console.error("❌ Error al leer o parsear el archivo:", err.message);
    process.exit(1);
  }

  if (!Array.isArray(data) || !data.length) {
    console.error("❌ El archivo de resultados está vacío o tiene formato inválido.");
    process.exit(1);
  }

  // 📈 Contadores globales
  const stats = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };

  for (const page of data) {
    for (const v of page.violations || []) {
      stats.total++;
      if (v.impact && stats[v.impact] !== undefined) stats[v.impact]++;
    }
  }

  // 🚦 Mostrar resumen
  console.log("===============================================");
  console.log("🚦 Quality Gate – Auditoría de Accesibilidad");
  console.log("===============================================");
  console.log(`🧾 Archivo analizado: ${path.basename(latestFile)}`);
  console.log(`🔴 Críticas : ${stats.critical}`);
  console.log(`🟠 Serias   : ${stats.serious}`);
  console.log(`🟡 Moderadas: ${stats.moderate}`);
  console.log(`🟢 Menores  : ${stats.minor}`);
  console.log(`⚙️ Umbrales → Critical <= ${CRITICAL_MAX}, Serious <= ${SERIOUS_MAX}`);
  console.log("===============================================");

  // 🧾 Guardar resumen JSON local
  const summaryJson = path.join(AUDITORIAS_DIR, "quality-report.json");
  fs.writeFileSync(
    summaryJson,
    JSON.stringify(
      {
        file: path.basename(latestFile),
        ...stats,
        thresholds: { critical: CRITICAL_MAX, serious: SERIOUS_MAX },
        date: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`📝 Resumen JSON guardado en: ${summaryJson}`);

  // 🧭 Añadir resumen visual en GitHub Actions
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const summary = `
## ♿ Informe de Control de Calidad – WCAG

| Severidad | Conteo | Límite | Estado |
|------------|--------|--------|--------|
| 🔴 Críticas | ${stats.critical} | ≤ ${CRITICAL_MAX} | ${
      stats.critical > CRITICAL_MAX ? "❌" : "✅"
    } |
| 🟠 Serias | ${stats.serious} | ≤ ${SERIOUS_MAX} | ${
      stats.serious > SERIOUS_MAX ? "❌" : "✅"
    } |
| 🟡 Moderadas | ${stats.moderate} | — | ℹ️ |
| 🟢 Menores | ${stats.minor} | — | ℹ️ |
| 📄 **Total** | **${stats.total}** | — | ✅ |

📊 **Archivo analizado:** \`${path.basename(latestFile)}\`
📅 **Fecha:** ${new Date().toLocaleString("es-ES")}
`;
    fs.appendFileSync(summaryPath, summary, "utf8");
    console.log("✅ Resumen visual añadido a GITHUB_STEP_SUMMARY");
  }

  // 🚨 Evaluar umbrales
  let exitCode = 0;
  if (stats.critical > CRITICAL_MAX) {
    console.error(`❌ Exceso de violaciones críticas (${stats.critical}).`);
    exitCode = 1;
  }
  if (stats.serious > SERIOUS_MAX) {
    console.error(`❌ Exceso de violaciones serias (${stats.serious}).`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log("✅ Quality Gate superado correctamente.");
  } else {
    console.warn("⚠️ Quality Gate no superado (modo auditoría continua activo).");
  }

  process.exit(exitCode);
}

// 🚀 Ejecutar
main().catch((err) => {
  console.error("❌ Error en Quality Gate:", err);
  process.exit(1);
});

