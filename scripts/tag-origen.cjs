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
  console.warn("⚠️ No hay archivos de resultados para etiquetar.");
  process.exit(0);
}

archivos.forEach((archivo) => {
  const filePath = path.join(auditoriasDir, archivo);

  // 🧠 Lectura segura del JSON
  let data;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️ No se pudo leer o parsear ${archivo}: ${err.message}`);
    return;
  }

  // 🏷️ Determinar origen
  let origen = "sitemap";
  if (archivo.includes("interactiva")) origen = "interactiva";

  // 📄 Añadir campo "origen" según tipo de estructura
  if (Array.isArray(data)) {
    data.forEach((item) => (item.origen = origen));
  } else if (typeof data === "object" && data !== null) {
    data.origen = origen;
  } else {
    console.warn(`⚠️ Estructura inesperada en ${archivo}, se omite.`);
    return;
  }

  // 💾 Guardar cambios
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✅ Añadido campo "origen": "${origen}" → ${archivo}`);
});

console.log("🎯 Etiquetado completado correctamente.\n");

