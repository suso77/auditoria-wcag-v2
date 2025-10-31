/**
 * ♿ Merge de auditorías WCAG con autoreparación de JSON corruptos
 *
 * ✅ Soporta:
 *   - Archivos raíz (ej: auditorias/2025-10-31-results.json)
 *   - Subcarpetas (auditorias/2025-10-31-xxxx-auditoria/results.json)
 *   - results-merged previos (evita duplicados)
 * ✅ Repara automáticamente JSON concatenados sin comas (por flag a+)
 * ✅ Evita duplicados por URL + regla ID
 * ✅ Ordena resultados por severidad y URL
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const auditoriasDir = path.join(__dirname, "..", "auditorias");
console.log("🔎 Buscando resultados de auditoría en:", auditoriasDir);

if (!fs.existsSync(auditoriasDir)) {
  console.error("❌ No existe la carpeta /auditorias");
  process.exit(1);
}

// ----------------------------------------------------
// 🧩 Función auxiliar: intenta reparar JSON corruptos
// ----------------------------------------------------
function fixJSON(raw, fileName) {
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`⚠️  Corrigiendo formato JSON dañado en ${fileName}...`);
    let fixed = raw
      .replace(/\n/g, "")
      .replace(/}\s*{/g, "},{")
      .replace(/\]\s*\[/g, ",");
    if (!fixed.trim().startsWith("[")) fixed = `[${fixed}`;
    if (!fixed.trim().endsWith("]")) fixed = `${fixed}]`;
    try {
      const parsed = JSON.parse(fixed);
      console.log(`✅ ${fileName} reparado (${parsed.length} elementos)`);
      return parsed;
    } catch (err) {
      console.error(`❌ No se pudo reparar ${fileName}: ${err.message}`);
      return [];
    }
  }
}

// ----------------------------------------------------
// 1️⃣ Detectar todos los archivos con resultados JSON
// ----------------------------------------------------
const auditFiles = [];
for (const item of fs.readdirSync(auditoriasDir)) {
  const fullPath = path.join(auditoriasDir, item);
  if (fs.lstatSync(fullPath).isDirectory()) {
    const filePath = path.join(fullPath, "results.json");
    if (fs.existsSync(filePath)) auditFiles.push(filePath);
  } else if (item.match(/results.*\.json$/)) {
    auditFiles.push(fullPath);
  }
}

if (auditFiles.length === 0) {
  console.error("❌ No se encontraron archivos results.json");
  process.exit(1);
}

console.log(`📂 Se encontraron ${auditFiles.length} archivos de resultados.`);

// ----------------------------------------------------
// 2️⃣ Leer, reparar y combinar todos los resultados
// ----------------------------------------------------
const merged = [];
const seen = new Set();

for (const filePath of auditFiles) {
  console.log(`📖 Procesando: ${path.basename(filePath)}`);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = fixJSON(raw, path.basename(filePath));
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      const url = item.url || "sin-url";

      // 🔍 Soporte para los dos formatos: plano o estructurado
      let violationsArray = [];
      if (Array.isArray(item.violations)) {
        // Formato estructurado
        violationsArray = item.violations;
      } else if (item.id && item.impact) {
        // Formato plano (una violación por línea)
        violationsArray = [item];
      }

      if (!violationsArray.length) continue;

      const existing = merged.find(p => p.url === url);
      if (existing) {
        for (const v of violationsArray) {
          const key = `${url}::${v.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            existing.violations.push(v);
          }
        }
      } else {
        for (const v of violationsArray) seen.add(`${url}::${v.id}`);
        merged.push({ url, violations: violationsArray });
      }
    }
  } catch (err) {
    console.error(`❌ Error procesando ${filePath}: ${err.message}`);
  }
}

// ----------------------------------------------------
// 3️⃣ Ordenar por severidad y URL
// ----------------------------------------------------
const order = { critical: 1, serious: 2, moderate: 3, minor: 4, undefined: 5 };
merged.forEach(p => {
  p.violations.sort(
    (a, b) => (order[a.impact] || 5) - (order[b.impact] || 5) || a.id.localeCompare(b.id)
  );
});
merged.sort((a, b) => a.url.localeCompare(b.url));

// ----------------------------------------------------
// 4️⃣ Guardar archivo combinado final
// ----------------------------------------------------
const mergedName = `results-merged-${format(new Date(), "yyyyMMdd-HHmm")}.json`;
const mergedPath = path.join(auditoriasDir, mergedName);
fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

console.log(`✅ Archivo combinado guardado en: ${mergedPath}`);
console.log(`📄 Total de páginas: ${merged.length}`);
const totalViolations = merged.reduce((sum, p) => sum + (p.violations?.length || 0), 0);
console.log(`♿ Total de violaciones combinadas: ${totalViolations}`);

