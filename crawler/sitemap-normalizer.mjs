#!/usr/bin/env node
import fs from "fs";
import path from "path";

// ---------------------------------------------------------
// ⚡ NORMALIZADOR DE SITEMAP – versión 1.2 (estable)
// ---------------------------------------------------------

console.log("🚀 NORMALIZADOR DE SITEMAP v1.2");
const RAW_PATH = path.resolve("scripts/sitemap-raw.json");
const OUT_PATH = path.resolve("scripts/sitemap-final.json");

// 1. Cargar URLs RAW
if (!fs.existsSync(RAW_PATH)) {
  console.error("❌ ERROR: No existe scripts/sitemap-raw.json");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
console.log(`📥 Leyendo RAW… Total = ${raw.length}`);

// 2. Normalizar (limpiar duplicados)
const unique = [...new Set(raw.map(url => url.trim()))];
console.log(`🧹 Duplicados eliminados → ${unique.length}`);

// 3. Funciones de utilidad
const getDepth = url => url.replace(/https?:\/\/[^/]+/, "").split("/").length - 1;
const getLang = url => {
  const match = url.match(/\/(en|es|de|fr|it|pt|nl|pl|da|fi|sv|nb|hu|ca)\b/);
  return match ? match[1] : "root";
};
const getTemplateKey = url => {
  return url
    .replace(/https?:\/\/[^/]+/, "")
    .replace(/\/(en|es|de|fr|it|pt|nl|pl|da|fi|sv|nb|hu|ca)\b/, "")
    .replace(/[0-9]+/g, "{id}")
    .replace(/\/+/g, "/")
    .trim();
};

// 4. Agrupaciones
const buckets = {
  home: [],
  categories: [],
  listings: [],
  detail: [],
  legal: [],
  help: [],
  languageRoots: [],
  misc: []
};

for (const url of unique) {
  const depth = getDepth(url);
  const lang = getLang(url);
  const template = getTemplateKey(url);

  // Home
  if (url.endsWith(".com") || url.endsWith(".com/")) {
    buckets.home.push(url);
    continue;
  }

  // Legal
  if (/terms|privacy|cookies|conditions/.test(url)) {
    buckets.legal.push(url);
    continue;
  }

  // Help
  if (/help|faq|support/.test(url)) {
    buckets.help.push(url);
    continue;
  }

  // Language roots
  if (depth === 1) {
    buckets.languageRoots.push(url);
    continue;
  }

  // Detail pages
  if (/airport|product|hotel|transfer|item|post|article|detail/.test(url)) {
    buckets.detail.push(url);
    continue;
  }

  // Listings
  if (depth === 2) {
    buckets.listings.push(url);
    continue;
  }

  // Categories
  if (depth === 3) {
    buckets.categories.push(url);
    continue;
  }

  // Resto
  buckets.misc.push(url);
}

// 5. Selección representativa
const pick = (arr, limit) => arr.slice(0, limit);

const finalUrls = [
  ...pick(buckets.home, 2),
  ...pick(buckets.languageRoots, 10),
  ...pick(buckets.legal, 5),
  ...pick(buckets.help, 5),
  ...pick(buckets.categories, 10),
  ...pick(buckets.listings, 15),
  ...pick(buckets.detail, 20),
  ...pick(buckets.misc, 10)
].filter(Boolean);

// Limitar a 40–80 URLs
let limited = finalUrls.slice(0, 80);

console.log(`📦 Agrupaciones procesadas.`);
console.log(`🔢 URLs seleccionadas: ${limited.length}`);

// 6. Guardar salida
fs.writeFileSync(OUT_PATH, JSON.stringify(limited, null, 2));
console.log(`💾 Guardado en: ${OUT_PATH}`);
console.log("🎉 Normalización completa.");

