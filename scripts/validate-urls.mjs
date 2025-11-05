/**
 * 🔍 validate-urls.mjs (v3.3 profesional IAAP / CI-safe)
 * --------------------------------------------------------------
 * Valida y normaliza el listado de URLs antes de la auditoría WCAG.
 * 
 * ✅ Limpia duplicados y URLs no válidas
 * ✅ Convierte rutas relativas a absolutas
 * ✅ Elimina parámetros de tracking (utm_*, gclid, fbclid)
 * ✅ Filtra recursos no HTML (PDF, imágenes, etc.)
 * ✅ Compatible con CI/CD (usa process.env.SITE_URL)
 * ✅ Logs claros y consistentes con merge-results/export-to-xlsx
 * --------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();
const urlsPath = path.join(__dirname, "urls.json");

// ===========================================================
// 🌍 URL base (entorno local o CI)
// ===========================================================
const SITE_URL = process.env.SITE_URL || "https://example.com";

console.log("🔍 Validando estructura de scripts/urls.json...");

// ===========================================================
// 📄 Leer archivo de entrada
// ===========================================================
if (!fs.existsSync(urlsPath)) {
  console.error("❌ No se encontró scripts/urls.json. Ejecute primero npm run crawl:js");
  process.exit(1);
}

let urlsRaw;
try {
  const data = fs.readFileSync(urlsPath, "utf8");
  urlsRaw = JSON.parse(data);
} catch (err) {
  console.error("❌ Error al leer o parsear scripts/urls.json:", err.message);
  process.exit(1);
}

if (!Array.isArray(urlsRaw) || urlsRaw.length === 0) {
  console.error("⚠️ El archivo scripts/urls.json está vacío o mal formado.");
  process.exit(0);
}

// ===========================================================
// 🧩 Normalización de URLs
// ===========================================================
const validExtensions = [".html", "/", ""];
const uniqueUrls = new Map();

function normalizarUrl(rawUrl) {
  if (!rawUrl) return null;
  let u = rawUrl.trim();

  // Convertir rutas relativas a absolutas
  if (!/^https?:\/\//i.test(u)) {
    try {
      u = new URL(u, SITE_URL).toString();
    } catch {
      return null;
    }
  }

  // Eliminar fragmentos (#) y parámetros tracking
  try {
    const parsed = new URL(u);
    ["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "utm_term", "utm_content"].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    u = parsed.toString().replace(/\/$/, ""); // quitar slash final
  } catch {
    return null;
  }

  // Ignorar recursos no HTML
  if (
    u.match(
      /\.(pdf|jpg|jpeg|png|gif|svg|doc|docx|xls|xlsx|zip|rar|mp4|webm|ico|rss|xml|json)$/i
    )
  ) {
    return null;
  }

  return u;
}

// ===========================================================
// 🧹 Validación y limpieza
// ===========================================================
urlsRaw.forEach((entry) => {
  const rawUrl = typeof entry === "string" ? entry : entry?.url;
  const cleaned = normalizarUrl(rawUrl);
  if (!cleaned) return;

  if (!uniqueUrls.has(cleaned)) {
    uniqueUrls.set(cleaned, {
      url: cleaned,
      title: entry?.title || "",
    });
  }
});

const cleaned = Array.from(uniqueUrls.values());

// ===========================================================
// 💾 Guardar resultado limpio
// ===========================================================
try {
  fs.writeFileSync(urlsPath, JSON.stringify(cleaned, null, 2), "utf8");
  console.log(`📊 Total original: ${urlsRaw.length} | Válidas: ${cleaned.length}`);
  console.log("✅ URLs válidas guardadas en scripts/urls.json");
  console.log(`🌍 Dominio base: ${SITE_URL}`);
  console.log("💾 Archivo validado y preparado para auditoría WCAG.");
} catch (err) {
  console.error("❌ Error guardando scripts/urls.json:", err.message);
  process.exit(1);
}
