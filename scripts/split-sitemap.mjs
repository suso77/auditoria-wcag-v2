import fs from "fs-extra";
import path from "path";

const INPUT = path.join("cypress", "fixtures", "sitemap-final.json");
const OUT_DIR = path.join("cypress", "fixtures", "lotes");

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("❌ No existe sitemap-final.json");
    return;
  }

  const urls = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  if (!Array.isArray(urls) || urls.length === 0) {
    console.error("❌ sitemap-final.json vacío o inválido");
    return;
  }

  fs.ensureDirSync(OUT_DIR);

  const chunkSize = 5;
  let index = 0;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const filename = `sitemap-lote-${index + 1}.json`;
    const dest = path.join(OUT_DIR, filename);

    fs.writeFileSync(dest, JSON.stringify(chunk, null, 2), "utf8");

    console.log(`🟦 Generado lote ${index + 1}: ${chunk.length} URLs → ${filename}`);
    index++;
  }

  console.log(`\n✅ Finalizado: ${index} lotes creados en /cypress/fixtures/lotes`);
}

main();
