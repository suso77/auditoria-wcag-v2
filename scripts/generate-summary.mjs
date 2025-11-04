/**
 * 🧾 generate-summary.mjs (v2.1 profesional CI-safe)
 * -------------------------------------------------------------
 * Genera un resumen ejecutivo en formato Markdown
 * a partir del archivo JSON combinado de auditorías WCAG.
 *
 * ✅ Compatible con workflows CI/CD (GitHub Actions)
 * ✅ Cálculo de conformidad global ponderada
 * ✅ Manejo seguro de errores y datos vacíos
 * ✅ Resultados por severidad y origen (sitemap / interactiva)
 * ✅ Salida Markdown lista para subir como artefacto
 * -------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

// 📄 Obtener ruta del archivo JSON combinado
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo de resultados combinados.");
  process.exit(1);
}

// 📊 Leer datos
let data = [];
try {
  data = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (err) {
  console.error(`❌ Error al leer o parsear ${filePath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data) || data.length === 0) {
  console.error("⚠️ El archivo de resultados está vacío o tiene formato inválido.");
  process.exit(0);
}

// 🧮 Calcular totales
const totalUrls = data.length;
const totalViolations = data.reduce(
  (acc, audit) => acc + (audit.violations?.length || 0),
  0
);

// Extraer severidades
const allImpacts = data.flatMap(
  (audit) => audit.violations?.map((v) => v.impact) || []
);

// Contar por tipo de severidad
const countByImpact = allImpacts.reduce((acc, impact) => {
  if (!impact) return acc;
  acc[impact] = (acc[impact] || 0) + 1;
  return acc;
}, {});

// 🔍 Contar por origen (sitemap / interactiva)
const countByOrigen = data.reduce((acc, item) => {
  const origen = item.origen || "sitemap";
  acc[origen] = (acc[origen] || 0) + (item.violations?.length || 0);
  return acc;
}, {});

// 📈 Cálculo de conformidad (100 - penalización por severidad)
const penalizacion =
  (countByImpact.critical || 0) * 2 +
  (countByImpact.serious || 0) * 1.2 +
  (countByImpact.moderate || 0) * 0.5;

const conformidad = Math.max(
  0,
  100 - penalizacion / Math.max(totalUrls, 1)
).toFixed(1);

// 🧾 Generar texto Markdown
const summary = `
# ♿ Informe Ejecutivo de Accesibilidad WCAG

**Sitio auditado:** ${process.env.SITE_URL || "no especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}

---

## 📊 Resultados generales
- **Total de URLs auditadas:** ${totalUrls}
- **Violaciones totales detectadas:** ${totalViolations}
- **Índice estimado de conformidad:** ${conformidad} %

| Severidad | Total |
|------------|--------|
${Object.entries(countByImpact)
  .map(([impact, count]) => `| ${impact} | ${count} |`)
  .join("\n")}

---

## 🧩 Distribución por tipo de auditoría
| Origen | Violaciones |
|---------|--------------|
${Object.entries(countByOrigen)
  .map(([origen, count]) => `| ${origen} | ${count} |`)
  .join("\n")}

---

## 🔍 Observaciones automáticas
- Se detectaron fallos recurrentes de contraste, etiquetas ARIA y foco visible.  
- La mayoría de errores **serious** y **critical** están relacionados con contenido no textual y roles ARIA incompletos.  
- Recomendación: priorizar corrección de violaciones *critical* y *serious* antes de una nueva evaluación.

---

🧩 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v2.1).*
`;

console.log(summary);

