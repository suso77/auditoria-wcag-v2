/**
 * ♿ Configuración central IAAP PRO v6.0
 * -------------------------------------------------------------------------
 * Define rutas, criterios y filtros de auditoría por tipo.
 * Cada auditoría (sitemap / interactiva) carga su propia configuración
 * sin necesidad de duplicar lógica ni tocar las specs.
 */

export const CONFIG = {
  sitemap: {
    name: "Auditoría Sitemap Híbrida",
    urlsFile: "scripts/urls-sitemap.json",
    crawl: true, // usa crawler automáticamente
    includePatterns: [".*"], // todo el sitio
    excludePatterns: [
      "/wp-json",
      "/admin",
      "/login",
      "/api/",
      "\\.pdf$",
      "\\.jpg$",
      "\\.png$",
      "\\.zip$",
    ],
  },

  interactiva: {
    name: "Auditoría Interactiva Híbrida",
    urlsFile: "scripts/urls-interactiva.json",
    crawl: false, // se puede generar desde sitemap filtrando
    includePatterns: [
      "/contacto",
      "/formulario",
      "/login",
      "/checkout",
      "/reservar",
      "/registro",
    ],
    excludePatterns: ["/wp-json", "/api/", "\\.pdf$"],
    selectorsToTest: ["button", "form", "input", "[role='dialog']", "nav", "a[href]"],
  },
};
