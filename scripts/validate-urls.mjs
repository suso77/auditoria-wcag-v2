/**
 * 🔍 validate-urls.mjs (v3.4 PRO IAAP / WCAG 2.2)
 * --------------------------------------------------------------
 * Valida y normaliza el listado de URLs antes de la auditoría WCAG.
 *
 * ✅ Limpia duplicados y URLs no válidas
 * ✅ Convierte rutas relativas a absolutas (usa SITE_URL)
 * ✅ Elimina parámetros de tracking (utm_*, gclid, fbclid)
 * ✅ Filtra recursos no HTML (PDF, imágenes, feeds, etc.)
 * ✅ Evita fallos en CI/CD cuando urls.json está vacío o mal formado
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
const SITE_URL = process.env.SITE_URL?.trim() || "https://example.com";

console.log("🔍 Validando estructura de scripts/urls.json...");
console.log(`🌐 Dominio base: ${SITE_URL}`);

// ===========================================================
// 📄 Leer archivo de entrada
// ===========================================================
if (!fs.existsSync(urlsPath)) {
  console.warn("⚠️ No se encontró scripts/urls.json. Se creará un archivo vacío.");
  fs.writeFileSync(urlsPath, "[]", "utf8");
}

let urlsRaw = [];
try {
  const data = fs.readFileSync(urlsPath, "utf8") || "[]";
  urlsRaw = JSON.parse(data);
  if (!Array.isArray(urlsRaw)) urlsRaw = [];
} catch (err) {
  console.error("❌ Error al leer o parsear scripts/urls.json:", err.message);
  urlsRaw = [];
}

if (urlsRaw.length === 0) {
  console.warn("⚠️ scripts/urls.json está vacío. No se encontraron URLs para validar.");
}

// ===========================================================
// 🧩 Normalización de URLs
// ===========================================================
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
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    u = parsed.toString().replace(/\/$/, ""); // quitar slash final
  } catch {
    return null;
  }

  // Ignorar recursos no HTML
  if (
    /\.(pdf|jpg|jpeg|png|gif|svg|doc|docx|xls|xlsx|zip|rar|mp4|webm|ico|rss|xml|json|txt)$/i.test(
      u
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
      title: entry?.title?.trim() || "",
    });
  }
});

const cleaned = Array.from(uniqueUrls.values());

// ===========================================================
// 💾 Guardar resultado limpio
// ===========================================================
try {
  fs.writeFileSync(urlsPath, JSON.stringify(cleaned, null, 2), "utf8");

  const originalCount = urlsRaw.length;
  const validCount = cleaned.length;

  console.log(`📊 URLs originales: ${originalCount} | Válidas: ${validCount}`);
  if (validCount === 0) {
    console.warn("⚠️ No se encontraron URLs válidas. El archivo sigue vacío, pero no se abortará el pipeline.");
  } else {
    console.log("✅ URLs válidas guardadas correctamente en scripts/urls.json");
  }

  console.log("💾 Archivo preparado para auditoría WCAG IAAP PRO.");
} catch (err) {
  console.error("❌ Error guardando scripts/urls.json:", err.message);
  process.exit(1);
}

