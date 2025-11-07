import fs from "fs";
import path from "path";

export const ROOT_DIR = process.cwd();
export const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
export const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");

export function getMergedPath() {
  if (fs.existsSync(path.join(REPORTES_DIR, "merged-results.json"))) {
    return path.join(REPORTES_DIR, "merged-results.json");
  }

  const fallback = fs.readdirSync(AUDITORIAS_DIR)
    .find(f => f.startsWith("results-merged") && f.endsWith(".json"));
  if (fallback) {
    return path.join(AUDITORIAS_DIR, fallback);
  }

  console.error("❌ No se encontró ningún archivo merged-results válido.");
  process.exit(1);
}
