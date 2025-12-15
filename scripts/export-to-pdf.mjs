/**
 * ♿ IAAP PRO v4.13.1 — Exportar resultados a PDF accesible
 * Usa merged-summary.md para generar Informe-WCAG-IAAP.pdf
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { createMarkdownRenderer } from "./utils/markdown.mjs";

const ROOT_DIR = process.cwd();
const SUMMARY_CANDIDATES = [
  path.join(ROOT_DIR, "auditorias/reportes/merged-summary.md"),
  path.join(ROOT_DIR, "auditorias/Resumen-WCAG.md"),
];
const summaryFile = SUMMARY_CANDIDATES.find((candidate) => fs.existsSync(candidate));
const outputFile = path.join(ROOT_DIR, "auditorias/reportes/Informe-WCAG-IAAP.pdf");
const CHROME_PROFILE_DIR = path.join(ROOT_DIR, "auditorias", ".chrome-pdf-profile");

fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

if (!summaryFile) {
  console.error("❌ No se encontró ningún resumen Markdown (merged-summary.md o Resumen-WCAG.md).");
  console.error("   Ejecuta primero: npm run summary");
  process.exit(1);
}

const renderMarkdown = await createMarkdownRenderer("export-to-pdf");
const md = fs.readFileSync(summaryFile, "utf8");
const html = renderMarkdown(md);

const template = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe IAAP PRO – Auditoría WCAG</title>
  <style>
    @page {
      margin: 20mm 18mm 25mm 18mm;
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
    }
    body {
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1d1d1f;
      background-color: #f5f7fb;
      font-size: 12px;
    }
    .wrapper {
      padding: 24px 32px 40px;
      background: #fff;
      box-shadow: 0 6px 24px rgba(0, 34, 68, 0.08);
      border-radius: 18px;
      margin-bottom: 24px;
    }
    header.report-header {
      background: linear-gradient(135deg, #0055a5, #00b4d8);
      color: #fff;
      padding: 28px 32px;
      border-radius: 18px 18px 0 0;
    }
    header.report-header h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.5px;
    }
    header.report-header p {
      margin: 6px 0 0;
      font-size: 13px;
      opacity: 0.9;
    }
    h2, h3 {
      color: #0f3d63;
      border-bottom: 2px solid #e3eef9;
      padding-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-bottom: 1.4em;
      font-size: 11.5px;
    }
    table thead tr {
      background: #eaf4ff;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #d8e4f3;
    }
    th {
      font-weight: 600;
      color: #0f3d63;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.3px;
    }
    blockquote {
      border-left: 4px solid #00b4d8;
      margin: 12px 0;
      padding: 6px 12px;
      background: #f0fbff;
      color: #0f3d63;
    }
    footer {
      margin-top: 18px;
      font-size: 10px;
      color: #6c7b91;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="report-header">
    <h1>Informe Ejecutivo de Accesibilidad Digital</h1>
    <p>IAAP PRO · Evaluación WCAG 2.2 – Generado el ${new Date().toLocaleDateString("es-ES")}</p>
  </header>
  <div class="wrapper">
    ${html}
  </div>
  <footer>
    ♿ IAAP PRO v4.13.1 — Documento generado automáticamente a las ${new Date().toLocaleTimeString("es-ES")}
  </footer>
</body>
</html>
`;

(async () => {
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
  const page = await browser.newPage();
  await page.setContent(template, { waitUntil: "networkidle0" });
  await page.pdf({
    path: outputFile,
    format: "A4",
    printBackground: true,
    margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
  });
  await browser.close();

  console.log(`✅ PDF IAAP generado: ${outputFile}`);
})();
