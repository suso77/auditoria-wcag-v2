import { readFile } from "fs/promises";

try {
  const code = await readFile("./scripts/wcag-map.mjs", "utf8");

  // Codificamos el código fuente del módulo como Base64
  const encoded = Buffer.from(code, "utf8").toString("base64");
  const dataUrl = `data:text/javascript;base64,${encoded}`;

  const mod = await import(dataUrl);

  console.log("✅ Evaluado manualmente como módulo ESM");
  console.log("🔑 Export keys:", Object.keys(mod));
} catch (err) {
  console.error("❌ Error evaluando módulo:", err);
}



