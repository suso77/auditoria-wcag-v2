/**
 * ♿ Task IAAP PRO – getAxeSource()
 * --------------------------------
 * ✅ Devuelve el código completo de axe-core desde Node
 * ✅ Compatible con Node 24+, Cypress 15+
 * ✅ Evita duplicados de tareas (log ya definida en config)
 */

const fs = require("fs");
const path = require("path");

module.exports = (on) => {
  on("task", {
    // Devuelve el contenido de axe-core/axe.min.js
    getAxeSource() {
      try {
        const axePath = path.resolve(
          __dirname,
          "../../node_modules/axe-core/axe.min.js"
        );
        const code = fs.readFileSync(axePath, "utf8");
        console.log("🧩 axe-core leído correctamente desde:", axePath);
        return code;
      } catch (err) {
        console.error("❌ Error leyendo axe-core:", err.message);
        return null;
      }
    },
  });
};

