# Agente de Accesibilidad — extensión de Chrome

Audita la pestaña activa contra WCAG 2.2 A+AA con el **mismo motor determinista**
que el CLI y el artifact web. `motor.js` no se escribe a mano: se genera desde
`src/` con `npm run build:extension`, y hay una prueba de integración que compara
los veredictos del bundle con los de la librería componente a componente.

## Instalar (modo desarrollador)

1. `npm run build:extension` en la raíz del repo.
2. En Chrome: `chrome://extensions` → activa **Modo de desarrollador**.
3. **Cargar descomprimida** → elige esta carpeta `extension/`.

## Qué hace

- **Analizar esta página** — motor semántico sobre el DOM ya renderizado, ámbito
  de página, medición real de contraste/foco/tamaño, adaptación del contenido
  (texto al 200 %, espaciado de 1.4.12, emergentes, orientación) y contraste
  **por píxeles** sobre degradados e imágenes.
- **Añadir a la muestra** — guarda la huella de la página. Con dos o más, salen
  los criterios de sitio: 3.2.3 navegación coherente, 3.2.4 identificación
  coherente, 3.2.6 ayuda coherente y 2.4.5 múltiples vías.
- **Exportar barreras (CSV)** — el mismo formato OAW/IRA del resto del agente.

## Para qué sirve la extensión y no otra cosa

Audita la página **real, con tu sesión iniciada**: el área privada, el paso 3 de
un formulario, el estado después de filtrar, la SPA ya renderizada. Eso no lo
alcanza un rastreador externo.

## Lo que NO puede hacer, y por qué se dice

**1.4.10 Reflujo no se comprueba aquí.** Una extensión no puede cambiar el tamaño
del viewport, y estrechar `documentElement` no reevalúa las media queries: daría
un número sin significado. Se declara fuera de alcance en vez de inventarlo. Para
ese criterio, el modo responsive del navegador o la auditoría desde Node
(`examples/auditar-sitio.mjs`).

**El contraste por píxeles solo alcanza la parte visible.** La captura de la
extensión es del viewport; los textos que quedan fuera se cuentan y se avisan.
Desplázate y vuelve a analizar.

**2.4.7 Foco visible se mide de otra manera desde aquí.** Mientras el popup está
abierto, el foco del sistema lo tiene el popup, no la página: `:focus` no se
aplica y el indicador de foco **no se puede medir sobre el render** por mucho que
el elemento reciba el foco. Comparar estilos daría «sin cambio medible» en todos
los controles, que es una acusación falsa en cada uno.

Así que cuando no hay foco del sistema el motor cambia de vía y lee el CSS de la
página: si encuentra una regla `:focus` / `:focus-visible` que alcance al control
y pinte algo (contorno, sombra, borde, fondo, subrayado), lo deja en
**cumple-parcial** — la presencia está, falta ver a ojo que se distinga y
contraste lo suficiente. Si no encuentra ninguna, queda en **revisar** diciendo
por qué. `outline: none` no cuenta como indicador: es justo lo contrario.

La limitación se declara en los avisos de cada análisis. Para medir 2.4.7 sobre
el render de verdad, haz clic en la página (que recupere el foco) y audítala
desde Node o desde el artifact; 2.1.1 no se ve afectado en ningún caso, porque
`activeElement` sí se mueve.

## Privacidad

No sale nada de tu navegador. El análisis corre en la página, las capturas se
procesan en memoria y la muestra acumulada vive en `chrome.storage.local`, que se
vacía con el botón **Vaciar muestra**. No hay servidor, ni telemetría, ni red.
