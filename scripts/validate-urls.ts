/**
 * ♻️ Validador de URLs antes de auditoría WCAG (versión TypeScript)
 * --------------------------------------------------------------------
 * - Comprueba que scripts/urls.json existe y es un JSON válido.
 * - Elimina duplicados, líneas vacías y URLs sin formato correcto.
 * - Limpia títulos y normaliza URLs.
 * - Compatible con CI/CD (GitHub Actions, workflows WCAG).
 * - Tipado fuerte y mensajes claros para debugging.
 * --------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

interface UrlEntry {
  url: string;
  title?: string;
}

// ✅ Ruta absoluta al archivo de URLs
const filePath = path.resolve("scripts/urls.json");

if (!fs.existsSync(filePath)) {
  console.warn("⚠️ No existe scripts/urls.json. Se generará tras el rastreo (crawl).");
  process.exit(0);
}

console.log("🔍 Validando estructura de scripts/urls.json...");

let data: unknown;

try {
  const raw = fs.readFileSync(filePath, "utf8");
  data = JSON.parse(raw);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Error al leer o parsear scripts/urls.json: ${message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("❌ Formato inválido: scripts/urls.json debe ser un array de objetos { url, title }");
  process.exit(1);
}

const urls = data as UrlEntry[];

// 🧹 Limpieza y normalización
const unique = new Map<string, boolean>();
const clean = urls
  .filter((p) => p && typeof p.url === "string" && /^https?:\/\//.test(p.url))
  .map((p) => ({
    url: p.url.trim().replace(/\/$/, ""), // 🔧 elimina el slash final
    title: p.title?.trim() || "(sin título)",
  }))
  .filter((p) => {
    const key = p.url.toLowerCase();
    if (unique.has(key)) return false;
    unique.set(key, true);
    return true;
  });

const removedCount = urls.length - clean.length;

// 🚨 Advertencias y errores
console.log(`📊 Total original: ${urls.length} | Válidas: ${clean.length}`);

if (removedCount > 0) {
  console.warn(`⚠️ Se eliminaron ${removedCount} URLs duplicadas o inválidas.`);
}

if (clean.length === 0) {
  console.error("❌ No quedaron URLs válidas después de la limpieza.");
  process.exit(1);
}

// 💾 Guardar archivo limpio
try {
  fs.writeFileSync(filePath, JSON.stringify(clean, null, 2), "utf8");
  console.log(`✅ ${clean.length} URLs válidas guardadas en scripts/urls.json`);
  console.log("💾 Archivo validado y preparado para auditoría WCAG.");
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Error al guardar scripts/urls.json: ${message}`);
  process.exit(1);
}
