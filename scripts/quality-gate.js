/**
 * ♿ Quality Gate – Auditoría WCAG (modo recopilación + compatibilidad total)
 * ---------------------------------------------------------------------------
 * ✅ No bloquea el flujo CI/CD (ideal para auditorías)
 * ✅ Funciona local y en GitHub Actions (aunque GITHUB_STEP_SUMMARY sea undefined)
 * ✅ Muestra resumen visual y guarda todos los conteos
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auditoriasDir = path.join(__dirname, "..", "auditorias");

// 🧱 Buscar el último archivo de resultados combinados
const files = fs
  .readdirSync(auditoriasDir)
  .filter(f => f.startsWith("results-merged-") && f.endsWith(".json"))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(auditoriasDir, f)).mtime.getTime(),
  }))
  .sort((a, b) => b.time - a.time);

if (!files.length) {
  console.error("❌ No se encontró ningún archivo results-merged-*.json");
  process.exit(0);
}

const latestFile = path.join(auditoriasDir, files[0].name);
console.log(`📊 Analizando resultados desde: ${latestFile}`);

const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
if (!Array.isArray(data) || !data.length) {
  console.error("❌ El archivo está vacío o no tiene formato válido.");
  process.exit(0);
}

// 📈 Contadores globales
let stats = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };

for (const page of data) {
  const violations = page.violations || [];
  for (const v of violations) {
    stats.total++;
    if (stats[v.impact] !== undefined) stats[v.impact]++;
  }
}

// 🚦 Mostrar resumen en consola
console.log("📋 Resumen de violaciones detectadas:");
console.log(`   🔴 Críticas : ${stats.critical}`);
console.log(`   🟠 Serias   : ${stats.serious}`);
console.log(`   🟡 Moderadas: ${stats.moderate}`);
console.log(`   🟢 Menores  : ${stats.minor}`);
console.log(`   📄 Total    : ${stats.total}`);

// 📄 Intentar crear resumen visual si es posible
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath && typeof summaryPath === "string") {
  try {
    const summary = `
## ♿ Informe de Control de Calidad – WCAG

| Severidad | Conteo | Emoji |
|------------|--------|--------|
| 🔴 Críticas | ${stats.critical} | 🔥 |
| 🟠 Serias | ${stats.serious} | ⚠️ |
| 🟡 Moderadas | ${stats.moderate} | 🕵️ |
| 🟢 Menores | ${stats.minor} | 💡 |
| 📄 **Total** | **${stats.total}** | ✅ |

📊 **Archivo analizado:** \`${path.basename(latestFile)}\`

> Este informe recopila todas las violaciones detectadas.  
> El pipeline no falla (modo auditoría).
    `;
    fs.appendFileSync(summaryPath, summary, "utf8");
    console.log("📝 Resumen visual añadido a GITHUB_STEP_SUMMARY");
  } catch (err) {
    console.warn("⚠️ No se pudo escribir el resumen en GitHub:", err.message);
  }
} else {
  console.log("ℹ️ No se encontró variable GITHUB_STEP_SUMMARY (ejecución local o runner limitado).");
}

console.log("✅ Auditoría completada con éxito (sin bloquear el flujo).");
process.exit(0);



