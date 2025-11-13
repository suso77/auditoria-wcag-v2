// 🚀 run-merge.mjs — Wrapper ESM seguro
import('./scripts/merge-auditorias.mjs')
  .then(() => console.log('✅ merge ejecutado correctamente'))
  .catch(err => {
    console.error('❌ Error ejecutando merge:\n', err);
    process.exit(1);
  });
