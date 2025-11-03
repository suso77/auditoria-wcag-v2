// scripts/tag-origen.cjs
// Añade la propiedad "origen" a cada resultado JSON antes del merge

const fs = require("fs");
const path = require("path");

const auditoriasDir = path.join(__dirname, "../auditorias");
if (!fs.existsSync(auditoriasDir)) {
  console.error("❌ Carpeta /auditorias no encontrada.");
  process.exit(1);
}

const archivos = fs
  .readdirSync(auditoriasDir)
  .filter((f) => f.startsWith("results-") && f.endsWith(".json"));

if (archivos.length === 0) {
  console.error("⚠️ No hay archivos de resultados para etiquetar.");
  process.exit(0);
}

archivos.forEach((archivo) => {
  const filePath = path.join(auditoriasDir, archivo);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  let origen = "sitemap";
  if (archivo.includes("interactiva")) origen = "interactiva";

  if (Array.isArray(data)) {
    data.forEach((item) => (item.origen = origen));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Añadido campo "origen": "${origen}" → ${archivo}`);
  }
});
