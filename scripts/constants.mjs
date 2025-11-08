import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = process.cwd();
export const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
export const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
export const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
export const OUTPUT_PATH = path.join(REPORTES_DIR, "Informe-WCAG-IAAP.xlsx");
