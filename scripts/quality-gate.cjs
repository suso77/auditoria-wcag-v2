/**
 * 🚦 quality-gate.cjs (versión avanzada con resumen por origen)
 * -----------------------------------------------------------------
 * ✅ Analiza el último results-merged-*.json
 * ✅ Calcula violaciones por severidad y origen (sitemap / interactiva)
 * ✅ Evalúa umbrales configurables vía env (CRITICAL_MAX / SERIOUS_MAX)
 * ✅ Genera resumen JSON y visual para GitHub Actions
 * ✅ 100% compatible con Node.js 20+ y CI/CD profesional
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
    .map((f) => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
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

  // 📈 Contadores globales y por origen
  const statsGlobal = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
  const statsByOrigen = {
    sitemap: { urls: new Set(), critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 },
    interactiva: { urls: new Set(), critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 },
  };

  for (const page of data) {
    const origen = page.origen === "interactiva" ? "interactiva" : "sitemap";
    statsByOrigen[origen].urls.add(page.url);

    for (const v of page.violations || []) {
      statsGlobal.total++;
      statsByOrigen[origen].total++;

      if (v.impact && statsGlobal[v.impact] !== undefined) {
        statsGlobal[v.impact]++;
        statsByOrigen[origen][v.impact]++;
      }
    }
  }

  // 🚦 Mostrar resumen global
  console.log("===============================================");
  console.log("🚦 Quality Gate – Auditoría de Accesibilidad");
  console.log("===============================================");
  console.log(`🧾 Archivo analizado: ${path.basename(latestFile)}`);
  console.log(`🔴 Críticas : ${statsGlobal.critical}`);
  console.log(`🟠 Serias   : ${statsGlobal.serious}`);
  console.log(`🟡 Moderadas: ${statsGlobal.moderate}`);
  console.log(`🟢 Menores  : ${statsGlobal.minor}`);
  console.log(`⚙️ Umbrales → Critical <= ${CRITICAL_MAX}, Serious <= ${SERIOUS_MAX}`);
  console.log("===============================================");

  // 📊 Resumen por origen
  for (const origen of Object.keys(statsByOrigen)) {
    const s = statsByOrigen[origen];
    if (s.total === 0) continue;
    console.log(`🔹 ${origen.toUpperCase()}:`);
    console.log(`   • URLs auditadas: ${s.urls.size}`);
    console.log(`   • Violaciones totales: ${s.total}`);
    console.log(`     - critical: ${s.critical}`);
    console.log(`     - serious: ${s.serious}`);
    console.log(`     - moderate: ${s.moderate}`);
    console.log(`     - minor: ${s.minor}`);
    console.log("-----------------------------------------------");
  }

  // 🧾 Guardar resumen JSON local
  const summaryJson = path.join(AUDITORIAS_DIR, "quality-report.json");
  fs.writeFileSync(
    summaryJson,
    JSON.stringify(
      {
        file: path.basename(latestFile),
        global: statsGlobal,
        byOrigen: {
          sitemap: {
            urls: statsByOrigen.sitemap.urls.size,
            ...statsByOrigen.sitemap,
          },
          interactiva: {
            urls: statsByOrigen.interactiva.urls.size,
            ...statsByOrigen.interactiva,
          },
        },
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
    let summary = `
## ♿ Informe de Control de Calidad – WCAG

### 📊 Resumen global
| Severidad | Conteo | Límite | Estado |
|------------|--------|--------|--------|
| 🔴 Críticas | ${statsGlobal.critical} | ≤ ${CRITICAL_MAX} | ${
      statsGlobal.critical > CRITICAL_MAX ? "❌" : "✅"
    } |
| 🟠 Serias | ${statsGlobal.serious} | ≤ ${SERIOUS_MAX} | ${
      statsGlobal.serious > SERIOUS_MAX ? "❌" : "✅"
    } |
| 🟡 Moderadas | ${statsGlobal.moderate} | — | ℹ️ |
| 🟢 Menores | ${statsGlobal.minor} | — | ℹ️ |
| 📄 **Total** | **${statsGlobal.total}** | — | ✅ |

### 🧩 Resultados por origen
| Origen | URLs | Critical | Serious | Moderate | Minor |
|--------|------|-----------|----------|-----------|--------|
| Sitemap | ${statsByOrigen.sitemap.urls.size} | ${statsByOrigen.sitemap.critical} | ${statsByOrigen.sitemap.serious} | ${statsByOrigen.sitemap.moderate} | ${statsByOrigen.sitemap.minor} |
| Interactiva | ${statsByOrigen.interactiva.urls.size} | ${statsByOrigen.interactiva.critical} | ${statsByOrigen.interactiva.serious} | ${statsByOrigen.interactiva.moderate} | ${statsByOrigen.interactiva.minor} |

📊 **Archivo analizado:** \`${path.basename(latestFile)}\`  
📅 **Fecha:** ${new Date().toLocaleString("es-ES")}
`;
    fs.appendFileSync(summaryPath, summary, "utf8");
    console.log("✅ Resumen visual añadido a GITHUB_STEP_SUMMARY");
  }

  // 🚨 Evaluar umbrales
  let exitCode = 0;
  if (statsGlobal.critical > CRITICAL_MAX) {
    console.error(`❌ Exceso de violaciones críticas (${statsGlobal.critical}).`);
    exitCode = 1;
  }
  if (statsGlobal.serious > SERIOUS_MAX) {
    console.error(`❌ Exceso de violaciones serias (${statsGlobal.serious}).`);
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


