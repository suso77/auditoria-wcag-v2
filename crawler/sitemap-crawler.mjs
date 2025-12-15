#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

const BASE_URL = process.env.SITE_URL;
const RAW_LANG_FILTER = (process.env.LANG_FILTER || "").trim();
const LANG_FILTER_PATTERNS = RAW_LANG_FILTER
  ? RAW_LANG_FILTER.split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .flatMap((token) => {
        const variants = new Set();
        const lower = token.toLowerCase();
        variants.add(lower);

        const noTrailing = lower.replace(/\/+$/, "");
        variants.add(noTrailing);

        const noLeading = noTrailing.replace(/^\/+/, "");
        variants.add(noLeading);

        if (noTrailing && !noTrailing.endsWith("/")) {
          variants.add(`${noTrailing}/`);
        }

        if (noLeading && !noLeading.startsWith("/")) {
          variants.add(`/${noLeading}`);
          variants.add(`/${noLeading}/`);
        }

        if (noLeading) {
          const bareNoSlash = noLeading.replace(/\/+/g, "");
          variants.add(bareNoSlash);
        }

        return Array.from(variants).filter(Boolean);
      })
  : [];
if (!BASE_URL) {
  console.error("❌ Debes ejecutar con: SITE_URL=\"https://dominio.com\" node crawler/sitemap-crawler.mjs");
  process.exit(1);
}

console.log("🚀 SITEMAP CRAWLER v1.1 (Node fetch FIX)");
console.log(`🌐 Sitio: ${BASE_URL}`);
if (RAW_LANG_FILTER) console.log(`🔎 Filtro de idioma: ${RAW_LANG_FILTER}`);

const fetch = global.fetch; // 👈 FIX PARA NODE 18+

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

const matchesLangFilter = (url) => {
  if (LANG_FILTER_PATTERNS.length === 0) return true;
  const target = url.toLowerCase();
  return LANG_FILTER_PATTERNS.some((pattern) => pattern && target.includes(pattern));
};

function normalize(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchSitemap(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const data = parser.parse(xml);

    let urls = [];

    if (data.sitemapindex?.sitemap) {
      const list = Array.isArray(data.sitemapindex.sitemap)
        ? data.sitemapindex.sitemap
        : [data.sitemapindex.sitemap];

      for (const item of list) {
        if (item.loc) urls.push(item.loc);
      }
    }

    if (data.urlset?.url) {
      const list = Array.isArray(data.urlset.url)
        ? data.urlset.url
        : [data.urlset.url];

      for (const item of list) {
        if (item.loc) urls.push(item.loc);
      }
    }

    return urls.map(normalize).filter(Boolean);
  } catch (err) {
    console.error(`❌ Error leyendo ${url}: ${err.message}`);
    return [];
  }
}

async function detectSitemapRoots() {
  const roots = [
    `${BASE_URL}/sitemap.xml`,
    `${BASE_URL}/sitemap_index.xml`,
    `${BASE_URL}/sitemap-index.xml`,
  ];

  const valid = [];

  console.log("🔎 Buscando sitemaps raíz…");

  for (const url of roots) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✔️ Encontrado: ${url}`);
        valid.push(url);
      }
    } catch {}
  }

  if (valid.length === 0) {
    console.warn("⚠️ No se encontró sitemap.xml ni sitemap_index.xml");
  }

  return valid;
}

async function crawlAllSitemaps() {
  const queue = await detectSitemapRoots();
  const visited = new Set();
  const finalURLs = new Set();

  while (queue.length > 0) {
    const sitemapURL = queue.shift();
    if (visited.has(sitemapURL)) continue;
    visited.add(sitemapURL);

    console.log(`📥 Leyendo: ${sitemapURL}`);

    const urls = await fetchSitemap(sitemapURL);

    for (const u of urls) {
      if (u.endsWith(".xml")) {
        queue.push(u);
      } else {
        finalURLs.add(u);
      }
    }
  }

  return Array.from(finalURLs);
}

// MAIN
const urls = await crawlAllSitemaps();
const filtered = urls.filter(matchesLangFilter);

if (LANG_FILTER_PATTERNS.length > 0 && filtered.length === 0) {
  console.warn(
    `⚠️ No se encontraron URLs con el filtro "${RAW_LANG_FILTER}". Se almacenarán todas las URLs del sitemap.`
  );
}

const finalURLs = filtered.length > 0 ? filtered : urls;

console.log(`\n📄 Total URLs encontradas en sitemap: ${finalURLs.length}`);

const outputPath = path.resolve("./scripts/sitemap-raw.json");
fs.writeFileSync(outputPath, JSON.stringify(finalURLs, null, 2), "utf8");

console.log(`💾 Guardado en ${outputPath}`);
console.log("🎉 Finalizado.");
