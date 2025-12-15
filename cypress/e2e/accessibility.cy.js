/// <reference types="cypress" />

import sitemapSource from "../../scripts/sitemap-final.json" with { type: "json" };
import interactiveSource from "../../scripts/interactive-analysis.json" with { type: "json" };

const REQUESTED_MODE = (Cypress.env("AUDIT_MODE") || "sitemap").toLowerCase();
const AUDIT_MODE = REQUESTED_MODE.startsWith("inter") ? "interactiva" : "sitemap";
const DATASETS = {
  sitemap: normalizePages(sitemapSource),
  interactiva: normalizePages(interactiveSource?.interactive || interactiveSource),
};
const pages = DATASETS[AUDIT_MODE] || DATASETS.sitemap;
const evidenceFile =
  AUDIT_MODE === "interactiva"
    ? "auditorias/auditoria-interactiva/violations.json"
    : "auditorias/auditoria-sitemap/violations.json";

function normalizePages(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.urls)) return source.urls;
  return [];
}

function toUrl(page) {
  if (typeof page === "string") return page;
  if (page?.url) return page.url;
  return null;
}

function urlToEvidenceId(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugify(value, fallback = "item") {
  if (!value) return fallback;
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || fallback;
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function rectToBox(rect) {
  if (!rect) return null;
  return {
    x: Number(rect.x.toFixed(2)),
    y: Number(rect.y.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
  };
}

function buildScreenshotName(evidenceId, violation, index) {
  const wcagSlug = slugify(violation.id || `issue-${index + 1}`, "wcag");
  const selectorSlug = slugify(violation.annotation?.selector || "node", "node");
  const order = `${index + 1}`.padStart(2, "0");
  return `${evidenceId}/${order}-${wcagSlug}-${selectorSlug}`;
}

function buildScreenshotRelativePath(screenshotName) {
  const specPath = (Cypress.spec?.name || "spec").replace(/\\/g, "/");
  return `${specPath}/${screenshotName}.png`;
}

function dedupeViolations(violations = []) {
  const seen = new Set();
  return violations.filter((violation) => {
    const selector = violation?.annotation?.selector || violation?.nodes?.[0]?.target?.[0];
    const key = `${violation?.id || "rule"}::${selector || "node"}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function computeClip(rect) {
  if (!rect || rect.width < 2 || rect.height < 2) return null;
  const viewportWidth = Cypress.config("viewportWidth") || 1366;
  const viewportHeight = Cypress.config("viewportHeight") || 768;

  const base = clamp(Math.round(Math.min(rect.width, rect.height) * 0.3), 24, 200);
  const topPadding = base + 28;
  const horizontalPadding = Math.round(base * 0.9);
  const bottomPadding = Math.round(base * 0.7);

  const x = clamp(Math.floor(rect.x) - horizontalPadding, 0, viewportWidth);
  const y = clamp(Math.floor(rect.y) - topPadding, 0, viewportHeight);
  const width = clamp(
    Math.ceil(rect.width + horizontalPadding * 2),
    80,
    viewportWidth - x
  );
  const height = clamp(
    Math.ceil(rect.height + topPadding + bottomPadding),
    80,
    viewportHeight - y
  );

  if (width <= 40 || height <= 40) return null;
  return { x, y, width, height };
}

function captureViolationEvidence(evidenceId, violation, index) {
  const annotation = violation?.annotation;
  if (!annotation?.selector) return cy.wrap(null, { log: false });

  const screenshotName = buildScreenshotName(evidenceId, violation, index);

  return cy
    .window({ log: false })
    .then((win) => {
      const el = win.document.querySelector(annotation.selector);
      if (!el) return null;

      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const rect = el.getBoundingClientRect();
      const clip = computeClip(rect);
      const screenshotOptions = clip
        ? { clip, scale: true, overwrite: true, log: false }
        : { capture: "viewport", scale: true, overwrite: true, log: false };

      return cy
        .screenshot(screenshotName, screenshotOptions)
        .then(() => ({
          selector: annotation.selector,
          screenshotId: screenshotName,
          screenshotFile: buildScreenshotRelativePath(screenshotName),
          boundingBox: rectToBox(rect),
          clip,
          color: annotation.highlightColor || null,
        }));
    });
}

describe("IAAP PRO – Auditoría de Accesibilidad WCAG", () => {
  before(() => {
    cy.task("log", `🧭 Modo de auditoría IAAP: ${AUDIT_MODE}`);
    cy.task("initEvidenceFile", evidenceFile);
  });

  pages.forEach((page, index) => {
    const url = toUrl(page);
    if (!url) return;
    const id = `${index + 1}`.padStart(3, "0");
    const evidenceId = `${urlToEvidenceId(url) || "page"}-${id}`;

    describe(`Auditoría WCAG → ${url}`, () => {
      it(`(${id}) Ejecuta AXE-Core + evidencias IAAP`, () => {
        cy.visit(url, { failOnStatusCode: false });
        cy.get("body", { timeout: 8000 }).should("not.be.empty");

        cy.injectAxe();

        cy.checkA11y(null, null, (violations) => {
          return cy.axeHighlight(violations).then((annotated) => {
            if (!annotated.length) {
              cy.task("log", `[IAAP] ✅ Sin violaciones reportables en ${url}`);
              return;
            }

            cy.task(
              "log",
              `[IAAP] ⚠️ ${annotated.length} violaciones detectadas en ${url}`
            );

            const uniqueViolations = dedupeViolations(annotated);
            if (uniqueViolations.length !== annotated.length) {
              cy.task(
                "log",
                `[IAAP] ℹ️ Evidencias consolidadas: ${uniqueViolations.length} únicas de ${annotated.length} hallazgos`
              );
            }
            const serialized = [];

            return cy
              .wrap(uniqueViolations, { log: false })
              .each((violation, vIndex) =>
                captureViolationEvidence(evidenceId, violation, vIndex).then(
                  (evidenceMeta) => {
                    const annotation = {
                      ...violation.annotation,
                      boundingBox:
                        evidenceMeta?.boundingBox ||
                        violation.annotation?.boundingBox ||
                        null,
                    };

                    serialized.push({
                      ...violation,
                      annotation,
                      evidence: evidenceMeta
                        ? {
                            screenshot: evidenceMeta.screenshotFile,
                            clip: evidenceMeta.clip,
                            selector: evidenceMeta.selector,
                            highlightColor: evidenceMeta.color,
                          }
                        : null,
                    });
                  }
                )
              )
              .then(() =>
                cy.task("appendEvidence", {
                  filePath: evidenceFile,
                  record: {
                    url,
                    mode: AUDIT_MODE,
                    timestamp: new Date().toISOString(),
                    violations: serialized,
                  },
                })
              );
          });
        });
      });
    });
  });
});
