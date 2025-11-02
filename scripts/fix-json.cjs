/**
 * 🧹 fix-json.cjs
 * ------------------------------------------------------------
 * Repara automáticamente archivos JSON dañados o truncados en /auditorias.
 * Crea copias limpias con sufijo -fixed.json
 * ------------------------------------------------------------
 * ✅ Limpieza agresiva (arrays rotos, objetos consecutivos)
 * ✅ Recorre todos los archivos automáticamente
 * ✅ 100% CommonJS y compatible con GitHub Actions
 */

const fs = require("fs");
const path = require("path");

const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");

// 🕵️ Buscar JSON dañados
const files = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter(f => f.endsWith(".json") && !f.includes("fixed"));

if (!files.length) {
  console.log("ℹ️ No se encontraron archivos JSON para limpiar.");
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(AUDITORIAS_DIR, file);
  let raw = fs.readFileSync(filePath, "utf8");

  try {
    JSON.parse(raw);
    console.log(`✅ ${file} está correcto.`);
    continue;
  } catch {
    console.warn(`⚠️ Reparando ${file}...`);

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
      const fixedPath = filePath.replace(".json", "-fixed.json");
      fs.writeFileSync(fixedPath, JSON.stringify(data, null, 2), "utf8");
      console.log(`🧩 Archivo corregido: ${fixedPath}`);
      console.log(`📄 Total de elementos: ${data.length}`);
    } catch (err) {
      console.error(`❌ Error: ${file} sigue siendo inválido (${err.message})`);
    }
  }
}
