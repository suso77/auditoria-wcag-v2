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
const LANG_FILTER = process.env.LANG_FILTER || "";
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

const matchesLangFilter = (url) =>
  !LANG_FILTER || url.toLowerCase().includes(LANG_FILTER.toLowerCase());

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
  if (LANG_FILTER) {
    console.log("🔎 Filtro de idioma:", LANG_FILTER);
  }

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
        if (!matchesLangFilter(clean)) continue;
        if (visited.has(clean) || queued.has(clean)) continue;

        urlQueue.push({ url: clean, depth: depth + 1 });
        queued.add(clean);
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const filtered = Array.from(visited).filter(matchesLangFilter);
  const list = filtered.map((url) => ({ url }));
  fs.writeFileSync("scripts/urls.json", JSON.stringify(list, null, 2));

  console.log(`\n📄 Total URLs encontradas: ${list.length}`);
  console.log("💾 Guardado en scripts/urls.json");
}

crawl();
