#!/usr/bin/env node
/**
 * ♿ merge-auditorias.mjs — IAAP PRO v7.0
 * -------------------------------------------------------------
 * Combina todas las fuentes de auditoría (sitemap + interactiva)
 * y genera un merged-results.json listo para exportar a CSV/XLSX/PDF.
 *
 * ✅ Prioriza evidencias enriquecidas (violations.json) cuando existen
 * ✅ Fallback automático a los resultados clásicos (auditorias/sitemap/*.json)
 * ✅ Normaliza WCAG, severidades, selectores y rutas de captura
 * ✅ Compatible con generate-summary.mjs, export-to-xlsx/csv/pdf
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getWcagInfo } from "./wcag-map.mjs";

const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
const CAPTURE_SUBFOLDERS = ["capturas", "auditoria-interactiva", "auditoria-sitemap"]
  .map((dir) => path.join(AUDITORIAS_DIR, dir))
  .filter((dir) => fs.existsSync(dir));
const OUTPUT_FILE = path.join(REPORTES_DIR, "merged-results.json");
const CAPTURE_INDEX = buildCaptureIndex();

fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
fs.mkdirSync(REPORTES_DIR, { recursive: true });

const stats = {
  sources: {},
  issues: 0,
};

function logInfo(message) {
  console.log(`[merge] ${message}`);
}

function safeReadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error leyendo ${filePath}: ${err.message}`);
    return fallback;
  }
}

function normalizeSelector(selector) {
  if (!selector) return null;
  if (Array.isArray(selector)) return selector[0] || null;
  return String(selector);
}

function getFirstTarget(violation) {
  const node = violation?.nodes?.[0];
  if (!node) return null;
  return normalizeSelector(node.target?.[0] || node.target);
}

function walkCaptureFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkCaptureFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(fullPath);
  }
  return files;
}

function sanitizeForCapture(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(https|http)/, "")
    .replace(/^www/, "")
    .slice(0, 120);
}

function buildCaptureIndex() {
  const files = CAPTURE_SUBFOLDERS.flatMap((dir) => walkCaptureFiles(dir));
  return files.map((absPath) => {
    const relPath = path.relative(AUDITORIAS_DIR, absPath).split(path.sep).join("/");
    return {
      abs: absPath,
      rel: relPath,
      slug: sanitizeForCapture(relPath),
    };
  });
}

function findCaptureByUrl(url) {
  const slug = sanitizeForCapture(url);
  if (!slug) return null;
  const match = CAPTURE_INDEX.find(
    ({ slug: fileSlug }) => fileSlug.includes(slug) || slug.includes(fileSlug)
  );
  return match ? match.rel : null;
}

function toCapturePath(evidence) {
  const rel = evidence?.screenshot;
  if (!rel) return null;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("capturas/") || normalized.startsWith("capturas\\")) {
    return normalized;
  }
  const directPath = path.posix.join("capturas", normalized);
  if (fs.existsSync(path.join(AUDITORIAS_DIR, directPath))) return directPath;
  for (const subDir of ["auditoria-interactiva", "auditoria-sitemap"]) {
    const candidate = path.posix.join(subDir, normalized);
    if (fs.existsSync(path.join(AUDITORIAS_DIR, candidate))) return candidate;
  }
  return directPath;
}

function makeIssueId(seed) {
  return crypto.createHash("md5").update(seed).digest("hex");
}

function normalizeViolation(meta, record, violation, violationIndex) {
  const url = record.url || record.pageUrl;
  if (!url) return null;

  const selector =
    violation.annotation?.selector ||
    getFirstTarget(violation) ||
    normalizeSelector(violation.target?.[0]) ||
    "(sin selector)";

  const wcagInfo = violation.wcag || getWcagInfo(violation.id);
  const capturePath = toCapturePath(violation.evidence);
  const boundingBox =
    violation.annotation?.boundingBox || violation.evidence?.clip || null;

  const idSeed = [
    meta.source,
    meta.engine,
    url,
    violation.id || "rule",
    selector,
    record.stateId || "",
    violationIndex,
  ].join("|");

  const captureExists = capturePath && fs.existsSync(path.join(AUDITORIAS_DIR, capturePath));
  const fallbackCapture = captureExists ? capturePath : findCaptureByUrl(url);

  return {
    id: makeIssueId(idSeed),
    source: meta.source,
    origen: meta.source,
    engine: meta.engine,
    mode: record.mode || meta.source,
    url,
    pageUrl: url,
    stateId: record.stateId || null,
    timestamp: record.timestamp || new Date().toISOString(),
    selector,
    snippet: violation.annotation?.snippet || violation.snippet || "",
    html: violation.annotation?.html || violation.html || violation.nodes?.[0]?.html || "",
    description: violation.description || wcagInfo?.resumen || "",
    resultadoActual:
      violation.failureSummary || violation.description || wcagInfo?.resumen || "",
    resultadoEsperado:
      wcagInfo?.esperado ||
      (wcagInfo?.criterio ? `Cumplir ${wcagInfo.criterio}` : "Cumplir criterio WCAG aplicable."),
    recomendacionW3C: wcagInfo?.url || violation.helpUrl || "",
    wcag: wcagInfo?.criterioId || wcagInfo?.id || violation.id,
    nivel: wcagInfo?.nivel || "",
    principio: wcagInfo?.principio || "",
    impact: violation.impact || "sin severidad",
    severity: violation.impact || "sin severidad",
    help: violation.help || "",
    helpUrl: violation.helpUrl || wcagInfo?.url || "",
    context: violation.help || violation.description || "",
    capturePath: fallbackCapture || null,
    evidence: violation.evidence || null,
    highlightColor:
      violation.evidence?.highlightColor ||
      violation.annotation?.highlightColor ||
      null,
    boundingBox,
  };
}

function collectFromArray(records, meta) {
  const issues = [];
  if (!Array.isArray(records)) return issues;

  records.forEach((record) => {
    const violations = Array.isArray(record?.violations) ? record.violations : [];
    violations.forEach((violation, vIndex) => {
      const issue = normalizeViolation(meta, record, violation, vIndex);
      if (issue) issues.push(issue);
    });
  });

  return issues;
}

function collectFromDirectory(dirPath, meta) {
  const issues = [];
  if (!fs.existsSync(dirPath)) return issues;

  fs.readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .forEach((file) => {
      const fullPath = path.join(dirPath, file);
      const record = safeReadJson(fullPath);
      if (!record) return;

      const normalized = Array.isArray(record) ? record : [record];
      normalized.forEach((entry) => {
        const violations = Array.isArray(entry?.violations) ? entry.violations : [];
        violations.forEach((violation, vIndex) => {
          const issue = normalizeViolation(meta, entry, violation, vIndex);
          if (issue) issues.push(issue);
        });
      });
    });

  return issues;
}

function trackStats(sourceName, count) {
  stats.sources[sourceName] = (stats.sources[sourceName] || 0) + count;
  stats.issues += count;
}

function loadDataset() {
  const allIssues = [];

  // --- Sitemap: prefer evidencias enriquecidas ---
  const sitemapEvidencePath = path.join(
    AUDITORIAS_DIR,
    "auditoria-sitemap",
    "violations.json"
  );
  const sitemapEvidence = collectFromArray(
    safeReadJson(sitemapEvidencePath, []),
    { source: "sitemap", engine: "axe-core" }
  );

  if (sitemapEvidence.length > 0) {
    allIssues.push(...sitemapEvidence);
    trackStats("sitemap", sitemapEvidence.length);
    logInfo(`Usando evidencias enriquecidas de ${sitemapEvidencePath} (${sitemapEvidence.length})`);
  } else {
    const sitemapDir = path.join(AUDITORIAS_DIR, "sitemap");
    const basicSitemap = collectFromDirectory(sitemapDir, {
      source: "sitemap",
      engine: "axe-core",
    });
    allIssues.push(...basicSitemap);
    trackStats("sitemap", basicSitemap.length);
    logInfo(
      basicSitemap.length
        ? `Usando resultados base de ${sitemapDir} (${basicSitemap.length})`
        : "⚠️ No se encontraron resultados en auditorias/sitemap"
    );
  }

  // --- Interactiva: prefer violations.json y fallback a states.json ---
  const interactiveEvidencePath = path.join(
    AUDITORIAS_DIR,
    "auditoria-interactiva",
    "violations.json"
  );
  const interactiveEvidence = collectFromArray(
    safeReadJson(interactiveEvidencePath, []),
    { source: "interactiva", engine: "axe-core" }
  );

  if (interactiveEvidence.length > 0) {
    allIssues.push(...interactiveEvidence);
    trackStats("interactiva", interactiveEvidence.length);
    logInfo(
      `Usando evidencias interactivas enriquecidas (${interactiveEvidence.length})`
    );
  } else {
    const statesPath = path.join(
      AUDITORIAS_DIR,
      "auditoria-interactiva",
      "states.json"
    );
    const interactiveStates = collectFromArray(
      safeReadJson(statesPath, []),
      { source: "interactiva", engine: "axe-core" }
    );
    allIssues.push(...interactiveStates);
    trackStats("interactiva", interactiveStates.length);
    logInfo(
      interactiveStates.length
        ? `Usando estados interactivos (${interactiveStates.length})`
        : "⚠️ No se encontraron estados en auditorias/auditoria-interactiva"
    );
  }

  // --- Manual u otros orígenes opcionales ---
  const manualPath = path.join(
    AUDITORIAS_DIR,
    "auditoria-manual",
    "violations.json"
  );
  const manualIssues = collectFromArray(
    safeReadJson(manualPath, []),
    { source: "manual", engine: "manual" }
  );
  if (manualIssues.length > 0) {
    allIssues.push(...manualIssues);
    trackStats("manual", manualIssues.length);
    logInfo(`Añadidas incidencias manuales (${manualIssues.length})`);
  }

  return allIssues;
}

const mergedIssues = loadDataset();

if (!mergedIssues.length) {
  console.warn("⚠️ No se encontraron violaciones para combinar. merged-results.json no se actualizó.");
  process.exit(0);
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedIssues, null, 2));

console.log("\n===========================================");
console.log("✅ merged-results.json generado correctamente");
console.log(`📄 Total de incidencias: ${stats.issues}`);
Object.entries(stats.sources).forEach(([source, count]) => {
  console.log(`   - ${source}: ${count}`);
});
console.log(`📁 Archivo: ${OUTPUT_FILE}`);
if (fs.existsSync(CAPTURAS_DIR)) {
  console.log(`📸 Carpeta de capturas: ${CAPTURAS_DIR}`);
}
console.log("===========================================\n");
