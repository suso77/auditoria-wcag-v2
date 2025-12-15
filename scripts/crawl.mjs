#!/usr/bin/env node
/**
 * 🔥 CRAWLER UNIVERSAL v3.0 — FUNCIONA EN TODAS LAS WEBS (OpenCart, WP, Shopify…)
 * Estrategias:
 *   ✔ Enlaces HTML tradicionales
 *   ✔ URLs embebidas en scripts
 *   ✔ URLs detectadas en XHR
 *   ✔ URLs detectadas en JSON incrustado
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const START_URL = process.env.SITE_URL || "https://example.com";
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
const MAX_URLS = 200;
const MAX_DEPTH = 3;
const CHROME_PROFILE_DIR = path.join(process.cwd(), ".chrome-crawler-profile");

fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

function normalize(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.origin + x.pathname + x.search;
  } catch {
    return null;
  }
}

const initialURL = normalize(START_URL);
if (!initialURL) {
  console.error("❌ START_URL inválida:", START_URL);
  process.exit(1);
}

const urlQueue = [{ url: initialURL, depth: 0 }];
const queued = new Set([initialURL]);
const visited = new Set();

const matchesLangFilter = (url) => {
  if (LANG_FILTER_PATTERNS.length === 0) return true;
  const target = url.toLowerCase();
  return LANG_FILTER_PATTERNS.some((pattern) => pattern && target.includes(pattern));
};

async function extractHTMLLinks(page, base) {
  return await page.$$eval("a[href]", (as) =>
    as
      .map((a) => a.href)
      .filter((href) => href && !href.startsWith("javascript:"))
  ).then((links) =>
    links.filter((href) => {
      try {
        return new URL(href).origin === base;
      } catch {
        return false;
      }
    })
  );
}

async function extractScriptUrls(page, base) {
  const scriptContent = await page.$$eval("script", (scripts) =>
    scripts.map((s) => s.innerText || "")
  );

  const found = [];
  const regex = /https?:\/\/[^"'\s]+/g;

  for (const script of scriptContent) {
    const matches = script.match(regex);
    if (!matches) continue;

    for (const m of matches) {
      try {
        const u = new URL(m);
        if (u.origin === base) found.push(m);
      } catch {}
    }
  }

  return found;
}

async function extractFetchUrls(page, base) {
  const urls = [];

  page.on("request", (req) => {
    try {
      const u = new URL(req.url());
      if (u.origin === base) urls.push(req.url());
    } catch {}
  });

  return urls;
}

async function crawl() {
  console.log("🚀 CRAWLER UNIVERSAL v3.0");
  console.log("🌐 Sitio:", initialURL);
  if (RAW_LANG_FILTER) console.log("🔎 Filtro de idioma:", RAW_LANG_FILTER);

  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: CHROME_PROFILE_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--disable-features=Crashpad",
      "--disable-extensions",
    ],
  });

  const origin = new URL(START_URL).origin;

  const fallbackQueue = [];
  const fallbackSeen = new Set();
  let enforcingFilter = LANG_FILTER_PATTERNS.length > 0;
  let filterMatchDetected = false;
  let retriedWithoutFilter = false;

  while (true) {
    while (urlQueue.length > 0 && visited.size < MAX_URLS) {
      const { url, depth } = urlQueue.shift();
      queued.delete(url);
      if (visited.has(url) || depth > MAX_DEPTH) continue;

      visited.add(url);
      console.log(`🌍 [${depth}] ${url}`);

      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(45000);

      const xhrUrls = [];
      page.on("request", (req) => {
        try {
          const u = new URL(req.url());
          if (u.origin === origin) xhrUrls.push(req.url());
        } catch {}
      });

      try {
        await page.goto(url, { waitUntil: "networkidle2" });

        const htmlLinks = await extractHTMLLinks(page, origin);
        const scriptLinks = await extractScriptUrls(page, origin);

        const all = [...htmlLinks, ...scriptLinks, ...xhrUrls];

        for (const found of all) {
          const clean = normalize(found);
          if (!clean) continue;
        if (visited.has(clean) || queued.has(clean)) continue;

        if (enforcingFilter && !matchesLangFilter(clean)) {
          if (!fallbackSeen.has(clean)) {
            fallbackQueue.push({ url: clean, depth: depth + 1 });
            fallbackSeen.add(clean);
            }
            continue;
          }

          if (matchesLangFilter(clean)) {
            filterMatchDetected = true;
          }

          urlQueue.push({ url: clean, depth: depth + 1 });
          queued.add(clean);
        }
      } catch (err) {
        console.log(`❌ Error: ${err.message}`);
      } finally {
        await page.close();
      }
    }

    if (
      enforcingFilter &&
      !filterMatchDetected &&
      fallbackQueue.length > 0 &&
      !retriedWithoutFilter
    ) {
      console.warn(
        `⚠️ No se detectaron URLs con el filtro "${RAW_LANG_FILTER}". Repitiendo sin filtro.`
      );
      for (const item of fallbackQueue) {
        if (!queued.has(item.url)) {
          urlQueue.push(item);
          queued.add(item.url);
        }
      }
      fallbackQueue.length = 0;
      enforcingFilter = false;
      retriedWithoutFilter = true;
      continue;
    }
    break;
  }

  await browser.close();

  const visitedList = Array.from(visited);
  const filtered = visitedList.filter(matchesLangFilter);
  if (LANG_FILTER_PATTERNS.length > 0 && filtered.length === 0) {
    console.warn(
      `⚠️ No se encontraron URLs con el filtro "${RAW_LANG_FILTER}". Se usarán todas las URLs rastreadas.`
    );
  }

  const finalList = filtered.length > 0 ? filtered : visitedList;
  const list = finalList.map((url) => ({ url }));
  fs.writeFileSync("scripts/urls.json", JSON.stringify(list, null, 2));

  console.log(`\n📄 Total URLs encontradas: ${list.length}`);
  console.log("💾 Guardado en scripts/urls.json");
}

crawl();
