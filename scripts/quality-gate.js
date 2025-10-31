/**
 * Control de calidad: falla el workflow si se superan los umbrales
 * CRITICAL_MAX y SERIOUS_MAX definidos como variables de entorno.
 */
import fs from "fs";
import path from "path";

const auditDir = "./auditorias";
const folders = fs.readdirSync(auditDir).filter(f => f.includes("-www."));
const latest = path.join(auditDir, folders.sort().reverse()[0], "results.json");

if (!fs.existsSync(latest)) {
  console.log("❌ No se encontró results.json");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(latest, "utf8"));
let critical = 0;
let serious = 0;

for (const page of data) {
  for (const v of page.violations) {
    if (v.impact === "critical") critical++;
    if (v.impact === "serious") serious++;
  }
}

const CRITICAL_MAX = parseInt(process.env.CRITICAL_MAX || "0");
const SERIOUS_MAX = parseInt(process.env.SERIOUS_MAX || "5");

console.log(`🔎 Violaciones detectadas → critical: ${critical}, serious: ${serious}`);
console.log(`✅ Umbrales → critical <= ${CRITICAL_MAX}, serious <= ${SERIOUS_MAX}`);

if (critical > CRITICAL_MAX || serious > SERIOUS_MAX) {
  console.error("❌ Control de calidad fallido. Se superan los umbrales permitidos.");
  process.exit(1);
} else {
  console.log("🟢 Control de calidad superado.");
}
