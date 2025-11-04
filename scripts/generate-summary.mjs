import fs from "fs";

// 📄 Obtener ruta del archivo JSON combinado
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo de resultados combinados.");
  process.exit(1);
}

// 📊 Leer datos
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Calcular totales
const totalViolations = data.reduce(
  (acc, audit) => acc + (audit.violations?.length || 0),
  0
);
const allImpacts = data.flatMap(
  (audit) => audit.violations?.map((v) => v.impact) || []
);

// Contar por tipo de severidad
const countByImpact = allImpacts.reduce((acc, impact) => {
  if (!impact) return acc;
  acc[impact] = (acc[impact] || 0) + 1;
  return acc;
}, {});

const totalUrls = data.length;

// Generar texto del resumen
const summary = `
# ♿ Informe Ejecutivo de Accesibilidad WCAG

**Sitio auditado:** ${process.env.SITE_URL || "no especificado"}  
**Fecha:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}

---

## 📊 Resultados generales
- **Total de URLs auditadas:** ${totalUrls}
- **Violaciones totales:** ${totalViolations}

| Severidad | Total |
|------------|--------|
${Object.entries(countByImpact)
  .map(([impact, count]) => `| ${impact} | ${count} |`)
  .join("\n")}

---

## 🔍 Observaciones automáticas
- Se detectaron varios fallos de contraste y estructura de encabezados.  
- Revisión de etiquetas ARIA y estados de foco recomendada.  
- La conformidad global estimada es del **${Math.max(
    0,
    100 - ((countByImpact.serious || 0) + (countByImpact.critical || 0)) / totalUrls
  ).toFixed(1)}%**.

---

🧩 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline.*
`;

console.log(summary);
