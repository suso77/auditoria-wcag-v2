/**
 * 🧹 fix-json.cjs (versión recursiva, in place)
 * ------------------------------------------------------------
 * Repara automáticamente archivos JSON dañados o anidados en /auditorias.
 * Modifica los archivos originales directamente (sin duplicados).
 * ------------------------------------------------------------
 * ✅ Limpieza agresiva (arrays rotos, objetos consecutivos)
 * ✅ Aplanado automático de arrays anidados ([[...]])
 * ✅ Escaneo recursivo de subcarpetas
 * ✅ 100% CommonJS y compatible con GitHub Actions
 */

const fs = require("fs");
const path = require("path");

const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");

// 🔍 Escaneo recursivo
function getAllJsonFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) results = results.concat(getAllJsonFiles(fullPath));
    else if (file.endsWith(".json")) results.push(fullPath);
  }
  return results;
}

const files = getAllJsonFiles(AUDITORIAS_DIR);

if (!files.length) {
  console.log("ℹ️ No se encontraron archivos JSON para limpiar.");
  process.exit(0);
}

for (const filePath of files) {
  const file = path.basename(filePath);
  let raw = fs.readFileSync(filePath, "utf8");

  try {
    const data = JSON.parse(raw);

    // ⚙️ Aplanar arrays anidados ([[...]])
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const flat = data.flat();
      fs.writeFileSync(filePath, JSON.stringify(flat, null, 2), "utf8");
      console.log(`🧩 ${file} tenía arrays anidados — corregido in place`);
      console.log(`📄 Total de elementos: ${flat.length}`);
      continue;
    }

    console.log(`✅ ${file} está correcto.`);
    continue;
  } catch {
    console.warn(`⚠️ Reparando formato JSON en ${file}...`);

    // Limpieza avanzada
    raw = raw
      .replace(/\n/g, "")
      .replace(/}\s*{/g, "},{")   // unir objetos consecutivos
      .replace(/\]\s*\[/g, ",")   // unir arrays consecutivos
      .replace(/,\s*]/g, "]")     // eliminar comas colgantes
      .replace(/}\s*$/, "}")      // cierre forzado
      .trim();

    // Asegurar formato array
    if (!raw.startsWith("[")) raw = `[${raw}`;
    if (!raw.endsWith("]")) raw = `${raw}]`;

    try {
      const data = JSON.parse(raw);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
      console.log(`🧩 ${file} reparado y sobrescrito correctamente`);
      console.log(`📄 Total de elementos: ${data.length}`);
    } catch (err) {
      console.error(`❌ Error: ${file} sigue siendo inválido (${err.message})`);
    }
  }
}

