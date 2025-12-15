/**
 * Utilidad para cargar un parser Markdown (marked) con fallback nativo.
 * Evita fallos cuando la dependencia no está instalada.
 */

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function basicMarkdown(md = "") {
  let html = escapeHtml(md);

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  html = html.replace(/^\s*[-*] (.+)$/gm, "• $1");

  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}

export async function createMarkdownRenderer(contextLabel = "markdown") {
  try {
    const markedModule = await import("marked");
    const marked = markedModule.marked || markedModule.default || null;
    if (marked && typeof marked.parse === "function") {
      return (md) => marked.parse(md, { headerIds: true, mangle: false });
    }
  } catch (err) {
    console.warn(`[${contextLabel}] ⚠️ Dependencia "marked" no encontrada. Se usará un parser básico.`);
  }

  return (md) => basicMarkdown(md);
}
