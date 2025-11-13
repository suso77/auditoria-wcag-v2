/**
 * 🔧 Tareas IAAP PRO – Soporte dinámico v6.0
 * -------------------------------------------------------------------------
 * Este módulo amplía las tareas personalizadas de Cypress
 * para leer URLs desde distintos archivos (sitemap/interactiva)
 * y guardar resultados de auditorías parciales.
 */

import fs from "fs";

export default (on, config) => {
  on("task", {
    /**
     * 🔹 Leer URLs dinámicamente desde un archivo específico
     * o por defecto desde scripts/urls.json.
     */
    readUrls: (filePath = "scripts/urls.json") => {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const urls = JSON.parse(content);
        console.log(`✅ ${urls.length} URLs cargadas desde ${filePath}`);
        return urls;
      } catch (err) {
        console.error(`⚠️ No se pudo leer el archivo ${filePath}:`, err.message);
        return [];
      }
    },

    /**
     * 🔹 Guardar resultados parciales (compatibilidad IAAP PRO)
     */
    writeResults: ({ dir, data, filename }) => {
      try {
        const fullPath = `${dir}/${filename}`;
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
        console.log(`💾 Guardado parcial → ${fullPath}`);
        return true;
      } catch (err) {
        console.error("⚠️ Error al guardar resultados:", err.message);
        return false;
      }
    },

    /**
     * 🔹 Crear carpeta (si no existe)
     */
    createFolder: (folderPath) => {
      try {
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
          console.log(`📁 Carpeta creada: ${folderPath}`);
        }
        return true;
      } catch (err) {
        console.error("⚠️ Error al crear carpeta:", err.message);
        return false;
      }
    },

    /**
     * 🔹 Limpiar capturas entre ejecuciones
     */
    clearCaptures: () => {
      const capturesDir = "auditorias/capturas";
      try {
        if (fs.existsSync(capturesDir)) {
          fs.rmSync(capturesDir, { recursive: true, force: true });
          fs.mkdirSync(capturesDir, { recursive: true });
          console.log("🧹 Capturas limpiadas correctamente.");
        }
        return true;
      } catch (err) {
        console.error("⚠️ Error limpiando capturas:", err.message);
        return false;
      }
    },
  });
};
