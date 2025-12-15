/// <reference types="cypress" />

import interactiveSource from "../../scripts/interactive-analysis.json" with { type: "json" };
import curatedInteractive from "../../scripts/urls-interactiva.json" with { type: "json" };

/**
 * IAAP – Interactive Accessibility Engine (Versión estable)
 * - URLs cargadas dinámicamente (sin forEach prematuro)
 * - Estados interactivos detectados en tiempo real
 * - Guardado completo de AXE + estados
 */

const RAW_SITE_URL =
  (typeof Cypress !== "undefined" && Cypress.config("baseUrl")) ||
  (typeof process !== "undefined" && process.env?.SITE_URL) ||
  "";
const SITE_URL = (RAW_SITE_URL || "").trim();
const TARGET_DOMAIN = getTargetDomain(SITE_URL);
const SITE_ORIGIN = getSiteOrigin(SITE_URL);
const INTERACTIVE_EVIDENCE_FILE = "auditorias/auditoria-interactiva/states.json";
const rawTargets = [
  ...normalizeList(interactiveSource?.interactive),
  ...normalizeList(curatedInteractive),
];
const dedupedTargets = dedupeTargets(rawTargets);
const filteredTargets = filterByDomain(dedupedTargets);
const interactiveTargets = fallbackToSite(filteredTargets);

function normalizeList(source) {
  if (!source) return [];
  const list = Array.isArray(source) ? source : Array.isArray(source.urls) ? source.urls : [];
  return list
    .map((item) => {
      if (typeof item === "string") return { url: ensureAbsolute(item) };
      if (!item) return null;
      if (item.url) return { ...item, url: ensureAbsolute(item.url) };
      if (item.path) return { ...item, url: ensureAbsolute(item.path) };
      return null;
    })
    .filter((entry) => entry?.url);
}

function dedupeTargets(list) {
  const seen = new Set();
  return list
    .map((item) => (typeof item === "string" ? { url: item } : item))
    .filter((item) => {
      const url = item?.url;
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function getTargetDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getSiteOrigin(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function filterByDomain(list) {
  if (!TARGET_DOMAIN) return list;
  const filtered = list.filter(({ url }) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "") === TARGET_DOMAIN;
    } catch {
      return false;
    }
  });
  if (filtered.length === 0) {
    console.warn(
      `[IAAP] ⚠️ No se encontraron URLs interactivas para el dominio ${TARGET_DOMAIN}.`
    );
  }
  return filtered;
}

function fallbackToSite(list) {
  if (list.length > 0) return list;
  if (!SITE_URL) return [];
  console.warn("[IAAP] ⚠️ No se detectaron URLs interactivas. Se usará SITE_URL como fallback.");
  return [{ url: ensureAbsolute(SITE_URL), reasons: ["fallback-site-url"] }];
}

function ensureAbsolute(target) {
  if (!target) return null;
  try {
    return new URL(target).toString();
  } catch {
    if (!SITE_ORIGIN) return null;
    const normalized = target.startsWith("/") ? target : `/${target}`;
    return `${SITE_ORIGIN.replace(/\/$/, "")}${normalized}`;
  }
}

function getSelector(el) {
  if (!el) return null;
  if (el.id) return `#${el.id}`;
  if (el.classList?.length)
    return "." + [...el.classList].map(c => c.trim()).join(".");
  return el.tagName?.toLowerCase();
}

function detectPatterns(win) {
  const doc = win.document;
  const patterns = [];

  doc.querySelectorAll("[aria-expanded]").forEach((el, i) => {
    patterns.push({ type: "accordion", selector: getSelector(el), index: i });
  });

  doc.querySelectorAll('[role="dialog"]').forEach((dialog, i) => {
    const trigger = doc.querySelector(`[aria-controls="${dialog.id}"]`);
    if (trigger)
      patterns.push({ type: "modal", selector: getSelector(trigger), index: i });
  });

  doc.querySelectorAll('[role="menu"]').forEach((menu, i) => {
    const trigger = doc.querySelector(`[aria-controls="${menu.id}"]`);
    if (trigger)
      patterns.push({ type: "menu", selector: getSelector(trigger), index: i });
  });

  ["swiper-container", "slick-slider", "owl-carousel"].forEach(cls => {
    doc.querySelectorAll("." + cls).forEach((el, i) => {
      patterns.push({ type: "slider", selector: getSelector(el), index: i });
    });
  });

  doc.querySelectorAll("form").forEach((el, i) => {
    patterns.push({ type: "form", selector: getSelector(el), index: i });
  });

  return patterns;
}

function generateStates(p) {
  const id = `${p.type}_${p.index}`;
  const states = [];

  if (p.type === "accordion") {
    states.push({
      stateId: `${id}_default`,
      action: "none",
      post: `${p.selector}[aria-expanded="false"]`,
      selector: p.selector
    });
    states.push({
      stateId: `${id}_expanded`,
      action: "click",
      post: `${p.selector}[aria-expanded="true"]`,
      selector: p.selector
    });
  }

  if (p.type === "modal") {
    states.push({
      stateId: `${id}_closed`,
      action: "none",
      post: 'dialog:not([open])',
      selector: p.selector
    });
    states.push({
      stateId: `${id}_opened`,
      action: "click",
      post: 'dialog[open]',
      selector: p.selector
    });
  }

  if (p.type === "menu") {
    states.push({
      stateId: `${id}_closed`,
      action: "none",
      post: '[role="menu"]:not([open])',
      selector: p.selector
    });
    states.push({
      stateId: `${id}_open`,
      action: "click",
      post: '[role="menu"][open]',
      selector: p.selector
    });
  }

  if (p.type === "slider") {
    for (let i = 0; i < 3; i++) {
      states.push({
        stateId: `${id}_slide_${i}`,
        action: `slide_${i}`,
        selector: p.selector,
        index: i,
        post: null
      });
    }
  }

  if (p.type === "form") {
    states.push({
      stateId: `${id}_default`,
      action: "none",
      selector: p.selector,
      post: null
    });
    states.push({
      stateId: `${id}_submit`,
      action: "submit",
      selector: p.selector,
      post: "[aria-invalid], .error"
    });
  }

  return states;
}

function performAction(state) {
  if (state.action === "none") return;

  if (state.action === "click") {
    cy.get(state.selector, { timeout: 6000 }).click({ force: true });
  }

  if (state.action.startsWith("slide_")) {
    const idx = state.index;
    cy.get(state.selector).then($el => {
      const swiper = $el[0]?.swiper;
      if (swiper?.slideTo) swiper.slideTo(idx);
    });
  }

  if (state.action === "submit") {
    cy.get(state.selector).within(() => cy.root().submit());
  }
}

function verifyPost(post) {
  if (!post) return;
  cy.document().then((doc) => {
    const node = doc.querySelector(post);
    if (!node) {
      cy.task("log", `[IAAP] ⚠️ Postcondición no encontrada: ${post}`);
    } else {
      cy.task("log", `[IAAP] ✅ Postcondición verificada: ${post}`);
    }
  });
}

describe("IAAP PRO – Auditoría Interactiva (Estable)", () => {

  before(() => {
    if (TARGET_DOMAIN) {
      cy.task("log", `[IAAP] 🌐 Dominio objetivo: ${TARGET_DOMAIN}`);
    }
    cy.task(
      "log",
      `[IAAP] 🔄 URLs interactivas cargadas: ${interactiveTargets.length} (de ${dedupedTargets.length} únicas)`
    );
    cy.task("initEvidenceFile", INTERACTIVE_EVIDENCE_FILE);
  });

  interactiveTargets.forEach(({ url }, idx) => {
    const id = `${idx + 1}`.padStart(3, "0");

    it(`(${id}) Auditoría interactiva → ${url}`, () => {
      cy.task("log", `[IAAP] Visitando → ${url}`);

      cy.visit(url, { failOnStatusCode: false });
      cy.get("body", { timeout: 8000 }).should("not.be.empty");
      cy.wait(400);

      cy.window().then((win) => {
        const patterns = detectPatterns(win);
        let states = [];

        patterns.forEach((p) => {
          states = states.concat(generateStates(p));
        });

        states = states.slice(0, 5);

        cy.task("log", `[IAAP] Estados generados: ${states.length}`);

        states.forEach((state) => {
          cy.task("log", `[IAAP] ▶️ Estado ${state.stateId}`);
          performAction(state);
          cy.wait(300);
          verifyPost(state.post);

          cy.injectAxe();

          cy.checkA11y(null, null, (results) => {
            cy.axeHighlight(results).then((annotated) => {
              cy.task("appendEvidence", {
                filePath: INTERACTIVE_EVIDENCE_FILE,
                record: {
                  url,
                  stateId: state.stateId,
                  timestamp: new Date().toISOString(),
                  violations: annotated,
                },
              });
            });
          });
        });
      });
    });
  });
});
