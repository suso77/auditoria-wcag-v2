/**
 * ♿ IAAP PRO v4.13.1 — Exportar resultados a PDF accesible
 * Usa merged-summary.md para generar Informe-WCAG-IAAP.pdf
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { marked } from "marked";

const ROOT_DIR = process.cwd();
const summaryFile = path.join(ROOT_DIR, "auditorias/reportes/merged-summary.md");
const outputFile = path.join(ROOT_DIR, "auditorias/reportes/Informe-WCAG-IAAP.pdf");

if (!fs.existsSync(summaryFile)) {
  console.error(`❌ No se encontró el resumen Markdown: ${summaryFile}`);
  process.exit(1);
}

const md = fs.readFileSync(summaryFile, "utf8");
const html = marked.parse(md);

const template = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe IAAP PRO</title>
  <style>
    body {
      font-family: "Arial", sans-serif;
      margin: 2cm;
      color: #222;
    }
    h1, h2, h3 {
      color: #0055a5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5em;
    }
    table, th, td {
      border: 1px solid #ccc;
    }
    th, td {
      padding: 6px 8px;
      font-size: 13px;
      text-align: left;
    }
  </style>
</head>
<body>
  ${html}
  <footer style="margin-top:2cm; font-size:10px; color:#555; border-top:1px solid #ccc; padding-top:5px;">
    ♿ IAAP PRO v4.13.1 — Generado automáticamente el ${new Date().toLocaleString("es-ES")}
  </footer>
</body>
</html>
`;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
