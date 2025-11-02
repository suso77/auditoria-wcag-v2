const fs = require("fs");
const path = require("path");

const filePath = "./auditorias/2025-10-31-results.json";
console.log(`🧩 Reparando formato JSON en: ${filePath}`);

if (!fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo.");
  process.exit(1);
}

let raw = fs.readFileSync(filePath, "utf8");

// 1️⃣ Limpiar saltos de línea y posibles duplicados de cierre/apertura
raw = raw
  .replace(/\n/g, "")
  .replace(/}\s*{/g, "},{")   // unir objetos consecutivos
  .replace(/\]\s*\[/g, ",");  // unir arrays consecutivos

// 2️⃣ Asegurar que todo esté entre []
if (!raw.trim().startsWith("[")) raw = `[${raw}`;
if (!raw.trim().endsWith("]")) raw = `${raw}]`;

// 3️⃣ Validar que sea JSON válido
try {
  const data = JSON.parse(raw);
  const fixedPath = path.join(path.dirname(filePath), "2025-10-31-results-fixed.json");
  fs.writeFileSync(fixedPath, JSON.stringify(data, null, 2));
  console.log(`✅ Archivo reparado correctamente: ${fixedPath}`);
  console.log(`📄 Total de elementos: ${data.length}`);
} catch (err) {
  console.error("❌ Error: El archivo sigue siendo inválido.");
  console.error(err.message);
}
