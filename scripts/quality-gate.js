/**
 * ♿ Quality Gate – Auditoría WCAG (modo recopilación + compatibilidad total)
 * ---------------------------------------------------------------------------
 * ✅ No bloquea el flujo CI/CD (ideal para auditorías)
 * ✅ Funciona localmente y en GitHub Actions sin errores de "path undefined"
 * ✅ Genera resumen visual + quality-report.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auditoriasDir = path.resolve(__dirname, "..", "auditorias");

// 🧱 Buscar el último archivo results-merged-*.json
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

let data;
try {
  data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
} catch (err) {
  console.error("❌ Error al leer o parsear el archivo:", err.message);
  process.exit(0);
}

if (!Array.isArray(data) || !data.length) {
  console.error("❌ El archivo de resultados está vacío o no tiene formato válido.");
  process.exit(0);
}

// 📈 Contadores globales
let stats = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };

for (const page of data) {
  const violations = page.violations || [];
  for (const v of violations) {
    stats.total++;
    if (v.impact && stats[v.impact] !== undefined) stats[v.impact]++;
  }
}

// 🚦 Mostrar resumen
console.log("📋 Resumen de violaciones detectadas:");
console.log(`   🔴 Críticas : ${stats.critical}`);
console.log(`   🟠 Serias   : ${stats.serious}`);
console.log(`   🟡 Moderadas: ${stats.moderate}`);
console.log(`   🟢 Menores  : ${stats.minor}`);
console.log(`   📄 Total    : ${stats.total}`);

// 🧾 Guardar resumen JSON local (útil para informes posteriores)
const summaryJson = path.join(auditoriasDir, "quality-report.json");
fs.writeFileSync(summaryJson, JSON.stringify({
  file: path.basename(latestFile),
  ...stats,
  date: new Date().toISOString(),
}, null, 2));
console.log(`📝 Resumen JSON guardado en: ${summaryJson}`);

// 🧭 Escribir resumen visual en GitHub (solo si la variable existe y es string)
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (typeof summaryPath === "string" && summaryPath.trim() !== "") {
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
📅 **Fecha:** ${new Date().toLocaleString("es-ES")}

> Modo auditoría: el pipeline continúa aunque existan violaciones.
`;
    fs.appendFileSync(summaryPath, summary, "utf8");
    console.log("✅ Resumen visual añadido a GITHUB_STEP_SUMMARY");
  } catch (err) {
    console.warn("⚠️ No se pudo escribir el resumen visual:", err.message);
  }
} else {
  console.log("ℹ️ GITHUB_STEP_SUMMARY no disponible (modo local o runner limitado).");
}

console.log("✅ Quality Gate completado sin errores (modo auditoría).");
process.exit(0);




