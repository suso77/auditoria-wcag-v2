/**
 * 🔍 validate-urls.mjs (v6.0 IAAP PRO / WCAG 2.2)
 * ---------------------------------------------------------------------------
 * Valida y normaliza las URLs generadas para auditorías sitemap e interactivas.
 *
 * ✅ Limpia duplicados y URLs no válidas
 * ✅ Convierte rutas relativas a absolutas (usa SITE_URL)
 * ✅ Elimina parámetros de tracking (utm_*, gclid, fbclid)
 * ✅ Filtra recursos no HTML (PDF, imágenes, feeds, etc.)
 * ✅ Valida tanto sitemap como interactiva en un solo proceso
 * ✅ Evita abortar el pipeline en CI/CD si hay ficheros vacíos
 * ---------------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = process.cwd();
const SITE_URL = process.env.SITE_URL?.trim() || "https://example.com";

const FILES = [
  "scripts/urls-sitemap.json",
  "scripts/urls-interactiva.json"
];

// ===========================================================
// 🧩 Función de normalización de URLs
// ===========================================================
function normalizarUrl(rawUrl) {
  if (!rawUrl) return null;
  let u = rawUrl.trim();

  // Rutas relativas → absolutas
  if (!/^https?:\/\//i.test(u)) {
    try {
      u = new URL(u, SITE_URL).toString();
    } catch {
      return null;
    }
  }

  // Limpiar fragmentos y tracking
  try {
    const parsed = new URL(u);
    [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "msclkid"
    ].forEach((p) => parsed.searchParams.delete(p));
    u = parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }

  // Ignorar recursos no HTML
  if (/\.(pdf|jpg|jpeg|png|gif|svg|docx?|xlsx?|zip|rar|mp4|webm|ico|rss|xml|json|txt)$/i.test(u)) {
    return null;
  }

  return u;
}

// ===========================================================
// 🔁 Proceso de validación para cada archivo
// ===========================================================
for (const filePath of FILES) {
  console.log("\n==========================================================");
  console.log(`🔍 Validando archivo: ${filePath}`);
  console.log(`🌐 Dominio base: ${SITE_URL}`);

  const absPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(absPath)) {
    console.warn(`⚠️ No existe ${filePath}, se creará vacío.`);
    fs.writeFileSync(absPath, "[]", "utf8");
  }

  let urlsRaw = [];
  try {
    const data = fs.readFileSync(absPath, "utf8") || "[]";
    urlsRaw = JSON.parse(data);
    if (!Array.isArray(urlsRaw)) urlsRaw = [];
  } catch (err) {
    console.error(`❌ Error leyendo ${filePath}:`, err.message);
    urlsRaw = [];
  }

  if (urlsRaw.length === 0) {
    console.warn(`⚠️ ${filePath} está vacío o no contiene URLs válidas.`);
    continue;
  }

  // Limpieza y deduplicación
  const unique = new Map();
  urlsRaw.forEach((entry) => {
    const raw = typeof entry === "string" ? entry : entry?.url;
    const cleaned = normalizarUrl(raw);
    if (!cleaned) return;

    if (!unique.has(cleaned)) {
      unique.set(cleaned, {
        url: cleaned,
        title: entry?.title?.trim() || ""
      });
    }
  });

  const cleaned = Array.from(unique.values());

  // Guardar resultados limpios
  try {
    fs.writeFileSync(absPath, JSON.stringify(cleaned, null, 2), "utf8");
    console.log(`📊 ${filePath}: ${urlsRaw.length} originales → ${cleaned.length} válidas.`);
  } catch (err) {
    console.error(`❌ Error guardando ${filePath}:`, err.message);
  }
}

console.log("\n✅ Validación IAAP PRO v6.0 completada.");
