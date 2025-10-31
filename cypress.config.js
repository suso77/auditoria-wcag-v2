import { defineConfig } from 'cypress';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🗂️ Carpeta donde se guardarán los resultados de auditoría
const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
const outputDir = path.join(__dirname, `auditorias/${timestamp}-auditoria`);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

export default defineConfig({
  e2e: {
    baseUrl: process.env.SITE_URL || 'https://example.com',
    video: false,
    screenshotOnRunFailure: false,

    setupNodeEvents(on, config) {
      // ✅ Task para mostrar logs personalizados en consola
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },

        // ✅ Task para guardar resultados de auditoría (axe-core)
        saveA11yResults({ url, violations }) {
          const filePath = path.join(outputDir, 'results.json');
          const existing = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath))
            : [];
          existing.push({ url, violations });
          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          return null;
        }
      });

      // 📁 Expone la ruta de salida para otros scripts (merge/export)
      config.env.outputDir = outputDir;

      return config;
    }
  }
});
