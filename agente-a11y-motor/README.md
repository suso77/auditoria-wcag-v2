# agente-a11y-motor

Núcleo determinista del **Agente de Accesibilidad**, extraído del prototipo monolítico y convertido en una **librería testeable**. Toma el HTML de un componente y produce:

1. un **modelo del árbol de accesibilidad** —rol, nombre y descripción accesibles (accname simplificado), estados, relaciones y el *anuncio* aproximado de NVDA/VoiceOver/JAWS por nodo—, y
2. un **dictamen de conformidad** de los **55 criterios WCAG 2.2 de nivel A y AA** aplicables, con severidad, evidencia y su cláusula **EN 301 549 v3.2.1** (marco del RD 1112/2018).

Es la primera pieza de la separación *motor ⁄ interfaz*: el mismo código corre en el navegador (dentro del artifact) y en Node (para tests, CI y, más adelante, el cruce con axe-core y el puente Guidepup).

## Por qué existe

El prototipo era un único HTML. Un producto real quiere el motor como librería con pruebas de regresión sobre fixtures, para poder evolucionarlo sin romper el comportamiento validado. La extracción es fiel: la lógica es la del prototipo, sin cambios de comportamiento salvo un detalle de portabilidad (`CSS.escape` con sustituto en Node).

## Instalación

```bash
npm install
```

La única dependencia de ejecución es [`linkedom`](https://github.com/WebReflection/linkedom), que aporta el `DOMParser` en Node (el CLI la importa). En el navegador no hace falta nada: `agente-a11y-motor/browser` expone solo los módulos isomorfos, sin arrastrar Playwright al *bundle*. `playwright` y `axe-core` son dependencias de par **opcionales**: solo hacen falta para el render real, el cruce con axe y la prueba dinámica.

## Uso

### En Node

El motor es isomorfo pero Node no trae `DOMParser`, así que se inyecta una vez:

```js
import { DOMParser } from "linkedom";
import { setDOMParser, understand, analyze } from "agente-a11y-motor";

setDOMParser(DOMParser);

const modelo = understand('<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>');
const informe = analyze(modelo);

console.log(informe.summary);
// { falla: 1, revisar: 5, humano: 7, cumple: 3, crítica: 1, ... }
```

### En el navegador

```js
import { understand, analyze } from "agente-a11y-motor";
// DOMParser nativo: no hay que inyectar nada.
const informe = analyze(understand(html));
```

## API

| Export | Qué hace |
| --- | --- |
| `understand(html)` | Modela el componente. Devuelve `{ roots, all, primary, pattern, criteria, observations, hidden }`, o `null` si el fragmento no tiene ningún elemento analizable. |
| `analyze(model)` | Dictamina los criterios aplicables. Devuelve `{ summary, findings }`; cada *finding* lleva criterio, veredicto, severidad y evidencia. |
| `accessibleName(el, doc, role)` | Nombre accesible de un elemento (accname simplificado). |
| `implicitRole(el)` | Rol implícito (subconjunto pragmático de HTML-AAM). |
| `announcement(node)` | Anuncio aproximado del lector para un nodo del modelo. |
| `applicableCriteria(nodeFacts)` | Criterios WCAG que aplican a los **hechos de un nodo** (`isFormControl`, `interactive`, `relations`, …). |
| `WCAG22`, `WCAG_TOTAL` | La base de 55 criterios A+AA y su tamaño. |
| `enClause(n)` | Cláusula EN 301 549 (`"9."+n`), o `null` para los 6 criterios nuevos de 2.2 aún no armonizados. |
| `severityByCrit(n, lvl)` | Severidad por criterio. |
| `setDOMParser(P)` | Inyecta el `DOMParser` (solo Node). |

## Tests

```bash
npm test                    # suite pura (node --test), sin navegador — 743 tests
npm run test:integracion    # integración con Chromium (Playwright) — 160 tests
npm run bench               # banco de precisión accname contra corpus WPT
npm run smoke               # humo del artifact generado, en Chromium real
node scripts/quien-declara-conforme.mjs   # quién puede declarar conforme qué, y con qué base
node scripts/quien-declara-conforme.mjs --no-aplica   # y quién puede cerrar un criterio sin dejar rastro
node scripts/comparar-auditorias.mjs a.json b.json      # qué cambió entre dos auditorías del mismo sitio
node scripts/comparar-auditorias.mjs a.json --referencia barreras.csv   # contra una lista de barreras
node scripts/comparar-auditorias.mjs a.json --seguimiento hoja.xlsx     # contra la hoja de seguimiento de una persona
node scripts/medir-informe.mjs a.json b.json            # calidad del informe: selectores, filas indistinguibles, cobertura
```

`PW_CHROMIUM=/ruta/a/chrome` apunta a un Chromium ya instalado y lo respetan todos los drivers a la vez (`src/playwright-launch.js`).

`npm test` usa el *runner* nativo de Node, sin frameworks ni navegador. Cubre:

- **`roles`** — mapeo de rol implícito (HTML-AAM), prioridad del `role` explícito y detección de roles inválidos.
- **`accname`** — prioridad del cálculo de nombre: `aria-label` > `aria-labelledby` > `<label for>` > contenido > `alt`, y el caso del icono sin nombre.
- **`criteria`** — integridad de la base (55 criterios A+AA bien formados), mapeo/exclusiones EN 301 549, severidades, aplicabilidad por nodo y veredictos sobre componentes de referencia.
- **`engine`** — forma del modelo, patrón compuesto, anuncio del lector, manejo de fragmentos sin elemento analizable y **determinismo** (misma entrada → mismo veredicto).
- **`axe-cross`** — mapeo axe→WCAG y la reconciliación motor ⁄ axe (acuerdo, solo-motor, solo-axe), con `runAxe` inyectado (sin navegador).
- **`verdicts`** — la tabla de gravedad de veredictos, incluida la regla de fallo seguro: un veredicto desconocido nunca cuenta como conforme.
- **`measure`** — la matemática de contraste y, con un DOM simulado, las reglas de medición: texto propio, controles deshabilitados u ocultos, *roving tabindex*, límite de cobertura.
- **`page-audit`**, **`sample-audit`**, **`dynamic`**, **`report-oaw`** — ámbito de página, agregación de muestra, interpretación de trazas y exportación a los entregables.
- **`viewport`** — adaptación del contenido: reflujo, texto al 200 %, espaciado, orientación y contenido emergente.
- **`coherence`** — coherencia entre páginas: normalización de destinos, orden relativo y regiones de la página.
- **`sampling`** — selección de muestra WCAG-EM: clasificación, reproducibilidad con semilla y justificación.
- **`png`** y **`pixel-contrast`** — decodificación PNG y medida de contraste sobre los píxeles del fondo real.
- **`audit-run`** — reconciliación con axe: lo que axe ve y el motor no entra al informe; lo que ven los dos no se duplica.

`npm run test:integracion` corre contra un Chromium real; se **salta solo** si no hay navegador instalado (`npx playwright install chromium`). Incluye una batería de **seguridad del driver dinámico** que levanta un servidor HTTP que registra todo lo que recibe y comprueba que, en modo seguro, el agente no le envía absolutamente nada (ver más abajo).

> La extracción a tests ha ido destapando fugas reales: el global `CSS` (solo navegador), un mal uso de `applicableCriteria`, el `.trim()` que se comía el `nbsp` del *accname*, y —en la revisión exhaustiva— que `el.focus()` enfoca un `tabindex="-1"` aunque el tabulador jamás llegue a él. Ese es justamente el valor de sacar el motor a librería.

## Cruce con axe-core (segunda fuente determinista)

El motor razona sobre el árbol de accesibilidad (nombre, rol, estado, anuncio del lector); **axe-core** comprueba reglas sobre el DOM renderizado. Cruzarlos por criterio WCAG reduce falsos positivos/negativos y hace explícitas las zonas donde cada fuente ve algo que la otra no.

```js
import { DOMParser } from "linkedom";
import { setDOMParser, crossCheck, runAxeWithPlaywright } from "agente-a11y-motor";
setDOMParser(DOMParser);

const { engine, axeViolations, reconciliation } = await crossCheck(
  '<button><svg><path d="M3 6h18"/></svg></button>',
  { runAxe: runAxeWithPlaywright }
);
console.log(reconciliation.summary); // { acuerdo, soloMotor, soloAxe }
```

`reconcile(engineFallas, axeViolations)` es **pura y testeable sin navegador**; `runAxeWithPlaywright` es el adaptador de render real (import perezoso, no arrastra Playwright si no se usa). Demo ejecutable:

```bash
npm run test:integracion   # o:
node examples/cross-check.mjs
```

Lo que revela el cruce sobre los ejemplos (render real en Chromium):

| Componente | Motor | axe | Lectura |
| --- | --- | --- | --- |
| Icono sin nombre | 4.1.2 | `button-name` | **Coinciden** en 4.1.2 |
| `div` + `onclick` | 2.1.1, 4.1.2 | — | **Solo el motor**: axe no marca el div como control; el razonamiento semántico sí |
| Campo con `placeholder` | 3.3.2 | — | **Solo el motor**: axe acepta el placeholder como nombre; el motor señala que no sustituye a una etiqueta visible |
| Enlace «Leer más» | 2.4.4 | — | **Solo el motor**: el propósito del enlace fuera de contexto no es automatizable para axe |

Cada zona es accionable: *coinciden* → alta confianza; *solo-axe* → posible falso negativo del motor; *solo-motor* → cobertura semántica que axe no automatiza (o un candidato a afinar).

## Puente Guidepup (el tercer nivel de verdad)

El motor **predice** qué anunciaría un lector (`announcement(node)`). El puente **captura** lo que VoiceOver anuncia de verdad —vía [Guidepup](https://github.com/guidepup/guidepup) sobre un render real— y los **compara**, convirtiendo un «a revisar» o un 4.1.2 predicho en un veredicto verdadero:

| Veredicto | Significado |
| --- | --- |
| `confirmado` | El lector anuncia el nombre y el rol previstos. |
| `parcial` | Anuncia el nombre pero no un rol reconocible. |
| `divergente` | Anuncia algo distinto a lo previsto (posible falso positivo/negativo del motor). |
| `barrera-confirmada` | El motor previó un control **sin nombre** y el lector, en efecto, solo pronuncia el rol → el 4.1.2 es **real**. |
| `sin-captura` | La frase capturada no es de la página (estaba vacía, o VoiceOver hablaba del escritorio). **No hay evidencia**, ni a favor ni en contra. |

```js
import { bridge, captureWithGuidepup } from "agente-a11y-motor";
const out = await bridge(html, { capture: captureWithGuidepup }); // macOS + VoiceOver
console.log(out.summary); // { confirmado, parcial, divergente, "barrera-confirmada", "no-encontrado" }
```

`compareAnnouncement(predicho, fraseReal)` y el bucle `verifyWithScreenReader({ voiceOver })` son **puros y testeables con un lector simulado** (los tests usan frases reales de VoiceOver en español). `captureWithGuidepup` es el adaptador real —import perezoso de `@guidepup/guidepup`, el mismo API que ya usas en tu `guidepup-mcp`— que abre el componente en el navegador y recorre con VoiceOver.

Demo (solo macOS; VoiceOver toma el control unos segundos):

```bash
npx @guidepup/setup setup              # una vez: permisos de accesibilidad (macOS)
node examples/reader-bridge.mjs
# o la prueba de integración, con opt-in explícito:
A11Y_REAL_VO=1 npm run test:integracion
```

El léxico de roles (`src/reader-lexicon.js`) cubre ES y EN porque las frases reales mezclan idiomas (VoiceOver dice «botón» pero a veces expone el rol en inglés: «link Saltar al contenido»); el comparador recorta además el «ruido» del lector (ayudas de teclado, estado de VoiceOver) antes de buscar el nombre.

### Contra transcripciones reales, no contra frases inventadas

El léxico se probaba con frases escritas por nosotros, que es justo como se cuelan los supuestos. Ahora hay un fixture (`test/fixtures/voiceover-es-real.json`) con capturas de verdad de una sesión de VoiceOver en español sobre WebKit, copiadas tal cual de `voiceover-verificacion-real/transcripts/`. Lo que enseñan:

- VoiceOver en español dice el rol en **inglés y delante** del nombre: «link Saltar al contenido», no «Saltar al contenido, enlace».
- Detrás va un párrafo de ayuda entero («Estás en un elemento de tipo…, para hacer clic pulsa Control-Opción-Espacio…») que hay que recortar antes de buscar el nombre.
- Y lo que costaba caro: `lastSpokenPhrase()` **arrastra el escritorio** cuando el navegador pierde el primer plano. En la transcripción real aparecen el Finder, el Terminal, otra ventana de Chrome y los propios avisos de VoiceOver, todo en una sola «frase».

Ese último punto era un fallo con signo. Esas palabras sobreviven al recorte, y la comparación las tomaba por el **nombre** del control: un botón de icono sin nombre accesible —un 4.1.2 real— pasaba de `barrera-confirmada` a «divergente: el lector sí pronuncia un nombre». Una barrera de verdad, absuelta por ruido del Finder.

Ahora esas frases se reconocen y se declaran `sin-captura`, diciendo además cómo repetir la prueba (navegador en primer plano). No se adivina un nombre a partir de ruido, y el emparejamiento nunca le asigna a un control el título de una ventana del sistema.

### Verificación en vivo

```bash
node examples/verificar-voiceover.mjs [salida.json]
```

Arranca VoiceOver sobre un componente con tres casos de veredicto distinto (icono sin nombre → `barrera-confirmada`, botón con texto y enlace → `confirmado`) y deja un JSON con el veredicto de cada nodo, la frase literal del lector y la transcripción en bruto, para revisarla después sin repetir la sesión. Encuentra `@guidepup/guidepup` aunque esté instalado en otro proyecto (`GUIDEPUP_PATH`, o el `guidepup-mcp` del equipo), y **sale con error si ninguna captura sirvió**: mejor un fallo visible que un informe vacío con buena pinta.

> Honestidad sobre la verificación: la comparación y el bucle de navegación están probados en verde; la **captura real** solo puede validarse en tu Mac con VoiceOver, no en CI ni en la nube. Es, literalmente, el tercer nivel de verdad: código → navegador → lector de pantalla real.

## CLI

El mismo motor, desde la terminal (útil en CI o para auditar fragmentos sueltos):

```bash
a11y-motor componente.html          # informe legible
a11y-motor componente.html --json   # informe estructurado
cat componente.html | a11y-motor    # desde stdin
```

Código de salida **1** si hay barreras, **0** si no, **2** si el fragmento no tiene elemento analizable. Es exactamente el mismo `understand`/`analyze` que corre en la web.

## Fuente única de verdad: la web se genera desde la librería

El artifact es un HTML autocontenido, así que no puede importar la librería en tiempo de ejecución. En su lugar **se genera**: `web/agente-a11y.html` lleva dos regiones marcadas y el build inyecta en ellas el código transformado a su forma en línea.

| Región | Fuente | Qué lleva |
|---|---|---|
| `ENGINE:START … ENGINE:END` | `src/engine.js` | el motor (DOMParser nativo, sin `export`) |
| `MEASURE:START … MEASURE:END` | `src/measure.browser.js` | la capa de medición sobre render real |

Y lo mismo con la extensión de Chrome: `npm run build:extension` genera
`extension/motor.js` desde `src/`.

```bash
npm run build:artifact
```

Así, editar el motor una sola vez propaga el cambio a la página, al CLI y a los tests: **web y repo comparten exactamente el mismo núcleo**, motor y medición.

El build es idempotente y **aborta sin escribir** si algo no cuadra: marcadores ausentes, repetidos o invertidos, un `export` que se coló, un bloque que no compila (`new Function`), o un resultado que perdería más de la mitad de la página. Antes, unos marcadores invertidos producían un `slice` disparatado que destruía el HTML… y salía con código 0.

`npm run smoke` cierra el círculo: carga el HTML generado en un Chromium real, pega un componente, pulsa *Analizar* y *Verificar en el navegador*, y comprueba que la medición dice lo que debe.

## Banco de precisión (medición contra WPT)

La fiabilidad no se afirma, se **mide**. `bench/` corre el motor contra un corpus de referencia transcrito de los **Web Platform Tests** (`accname/name/*`, con cita a la fuente) y reporta la precisión del cálculo de nombre accesible:

```bash
npm run bench            # informe legible
node bench/run.mjs --json
```

Resultado actual: **100 % (45/45) en ámbito**. Los casos que un motor sin CSS/layout no puede resolver —contenido generado por `::before/::after`, `text-transform`, o el matiz de `visibility:hidden` en un descendiente de un objetivo `aria-labelledby` visible— se marcan `skip` con su motivo y se informan aparte como **limitaciones conocidas**, no como aprobados. El banco corre también como test de regresión (`test/accname-bench.test.mjs`), así que ningún cambio puede bajar la precisión sin que salte.

> El banco ya pagó: destapó que el recorte de espacios eliminaba `nbsp` y otros espacios Unicode (el braille en blanco), que el accname debe preservar. Corregido.

## Análisis sobre render real (página viva)

El motor razona sobre el HTML, pero contraste, foco y tamaño solo son fiables sobre el **render real** (con el CSS y el layout de verdad). `analyzeRendered` abre una URL en un navegador de verdad, pasa el **DOM ya renderizado** (post-JS) por el motor, y mide con `getComputedStyle`/`getBoundingClientRect` **reales** inyectando el núcleo de medición en la página:

```js
import { analyzeRendered } from "agente-a11y-motor";
const out = await analyzeRendered({ url: "https://ejemplo.com" }, { axe: true });
console.log(out.summary); // { barreras, medicion: {pasa,revisar,falla}, axeViolaciones }
```

```bash
node examples/analyze-url.mjs https://ejemplo.com --axe   # necesita: npx playwright install chromium
```

El **núcleo de medición** (`src/measure.browser.js`) se escribe una sola vez: la matemática de contraste (WCAG + APCA, con **composición alfa** y detección de fondos con imagen/degradado no medibles) es pura y está testeada en Node; las funciones que dependen del DOM se serializan a texto inyectable que corre dentro de la página. Hay tres formas del mismo código, para tres destinos:

- `MEASURE_BODY` — cuerpo para `page.evaluate(new Function(...))` en Playwright. Es la vía preferente: la evaluación por CDP **no está sujeta a la CSP** de la página, mientras que `addScriptTag` sí — con una CSP restrictiva la etiqueta se descartaba en silencio y la medición fallaba sin decir por qué.
- `MEASURE_SRC` — para la **extensión de Chrome** sobre una pestaña viva (con sesión iniciada, SPA renderizada), envuelto en IIFE para no pisar los globals del sitio auditado.
- `MEASURE_FNS` — fuentes desnudas, que es lo que embebe el artifact en su región `MEASURE`.

Qué mide, y con qué cuidado: el contraste se calcula **donde de verdad hay texto** (los nodos de texto propios del elemento, no `textContent`, que mezclaba el color del contenedor con el texto de un hijo); un control deshabilitado, no renderizado o con *roving tabindex* dentro de un widget compuesto **no falla 2.1.1**; y si el límite de controles recorta la muestra, la medición **lo dice** en vez de callarlo.

> Nota: la medición sobre render real está verificada contra Chromium de verdad (composición alfa y degradado incluidos). El análisis de URLs externas requiere red del navegador — funciona en tu equipo o vía la extensión, no desde un entorno aislado sin salida.

## Página completa y muestreo (WCAG-EM)

Hay criterios que solo existen a nivel de página, no de componente. `auditPageDoc` / `auditPageHtml` los evalúan sobre el documento renderizado: **2.4.2** título, **3.1.1** idioma, **1.3.1** landmarks (un solo `main`, banner/contentinfo únicos, ids duplicados en relaciones), **2.4.1** saltar bloques, **2.4.6/1.3.1** jerarquía de encabezados. `analyzeRendered` los ejecuta automáticamente y devuelve, junto a lo semántico y lo medido, un array `findings` unificado.

Sobre eso, `auditSample` agrega una **muestra de páginas** al estilo WCAG-EM: un criterio falla para el sitio si falla en alguna página, con el detalle de en cuáles.

```js
import { analyzeRendered, auditSample } from "agente-a11y-motor";
const analyze = async (t) => ({ url: t.url, findings: (await analyzeRendered({ url: t.url })).findings });
const { rollup } = await auditSample([{ url: "/" }, { url: "/contacto" }], { analyze });
console.log(rollup.conformidad); // "No conforme" | "Requiere revisión manual" | "Sin barreras…"
```

```bash
node examples/audit-site.mjs https://ejemplo.com/ https://ejemplo.com/contacto
```

`rollupSample` (la agregación) es pura y testeada; el recorrido usa un analizador **inyectable**, así que la misma agregación sirve con render real, con la extensión de Chrome, o con HTML ya capturado.

## Prueba dinámica de widgets

Muchas barreras solo aparecen al **operar** la interfaz. `dynamicAnalyze` conduce la página real y captura qué pasa:

- **Tabulación real** — pulsa Tab por toda la página y comprueba que se alcanzan todos los controles; detecta **trampas de foco** (2.1.1 / 2.1.2).
- **Expandibles (disclosure)** — activa cada `[aria-expanded]` y verifica que el estado cambia y el contenido controlado aparece (4.1.2).
- **Pestañas** — activa cada `[role=tab]` y verifica que `aria-selected` se mueve y se muestra su panel (4.1.2 / 1.3.1).
- **Errores de formulario forzados** — envía el formulario con datos inválidos y comprueba que los errores se identifican en texto (`aria-describedby`/`aria-errormessage`), exponen `aria-invalid` y se anuncian (`role=alert`) — 3.3.1 / 4.1.3.

```bash
node examples/dynamic-test.mjs https://ejemplo.com/
```

Igual que el resto: la **interpretación de la traza** (`analyzeTabTrace`, `analyzeDisclosure`, `analyzeTabs`, `analyzeErrorState`) es pura y testeada; el driver que opera la página va con Playwright (o la extensión).

### Seguridad: este driver toca un sitio ajeno

Es la única parte del agente que **escribe** en lugar de leer, así que tiene reglas propias, verificadas contra un servidor HTTP real en `test/integration/dynamic-safety.test.mjs`:

- **El envío de formularios no sale a la red.** En modo `safe` (el de serie) se cancela el evento `submit` en fase de captura y se abortan las navegaciones del marco principal. La validación de cliente y el marcado ARIA de error se producen igual —que es lo que medimos—, pero no se crea ni se borra nada en el servidor. `forms: "submit"` permite el envío real y exige *opt-in* explícito; `forms: "off"` ni se acerca.
- **No se pulsa ningún botón para enviar.** Se usa `requestSubmit()` sin *submitter*: dispara validación y evento `submit` sin activar ningún control. Antes se hacía clic en el primer `<button>` del formulario, que podía ser «Eliminar cuenta» o «Cerrar sesión».
- **No se vacían los `input[type=hidden]`.** Ahí viven los tokens CSRF y el estado de sesión.
- **Los formularios que parecen destructivos** (`delete`, `logout`, `eliminar`, `baja`…) no se tocan en ningún modo.
- Cada fase va en su propio `try/catch`: un fallo no tira la ejecución ni pierde lo ya medido.

Y una regla de precisión que es también de honradez: si la tabulación se corta —por una trampa de foco o por agotar el presupuesto de pulsaciones— o si un clic no llega a ocurrir, el veredicto es **`revisar`, nunca `falla`**. «No lo he podido comprobar» no es «está mal».

## Adaptación del contenido: cinco criterios que dejaron de ser «revisar»

Cinco criterios AA salían siempre `revisar` sin haber mirado nada, y son mecánicos: se aplica un cambio y se mide qué se rompe. Es el procedimiento manual de la Guía Técnica del OAW —el bookmarklet de Text Spacing, el zoom al 400 %— hecho por el agente.

| Criterio | Qué hace el agente |
|---|---|
| **1.4.10** Reflujo | Estrecha a 320×256 px CSS (el 400 % sobre 1280) y busca desplazamiento horizontal, señalando el elemento que desborda |
| **1.4.4** Redimensionar el texto | Pone el texto al 200 % y mide qué bloques quedan recortados |
| **1.4.12** Espaciado del texto | Aplica `line-height:1.5`, `letter-spacing:.12em`, `word-spacing:.16em` y 2em entre párrafos, y mide lo mismo |
| **1.3.4** Orientación | Detecta `screen.orientation.lock()`, reglas CSS que ocultan según la orientación, y compara el contenido en vertical y horizontal |
| **1.4.13** Contenido emergente | Señala el `title` usado como tooltip (ni se descarta con Esc ni se puede señalar) y comprueba los emergentes propios |

```bash
node examples/auditar-pagina.mjs https://ejemplo.com/
```

Dos decisiones de método que evitan falsos positivos:

**Antes y después, no solo el estado final.** Una caja que ya venía recortada de serie no es culpa del espaciado. Se fotografía cada bloque de texto antes del cambio y solo cuenta lo que **empeora**. Lo que ya estaba recortado no se traga en silencio: sale aparte como `revisar`, diciendo que no lo provoca el cambio pero que hay texto ilegible.

**Desbordar con barra de desplazamiento no es perder contenido.** Solo cuenta como recorte el desbordamiento con `overflow:hidden`, donde el texto deja de ser alcanzable. Y en 1.4.10, si *todo* lo que desborda es contenido que WCAG puede eximir por uso esencial (tablas, imágenes, mapas), el veredicto es `revisar` para que una persona confirme la excepción — no `falla`.

## La extensión de Chrome

```bash
npm run build:extension   # genera extension/motor.js desde src/
```

Luego `chrome://extensions` → Modo de desarrollador → **Cargar descomprimida** → carpeta `extension/`.

Audita la pestaña activa: motor semántico sobre el DOM ya renderizado, ámbito de página, medición real, adaptación del contenido y contraste por píxeles. Exporta las barreras al mismo CSV OAW del resto del agente.

**Para qué sirve la extensión y no otra cosa:** audita la página real **con tu sesión iniciada** — el área privada, el paso 3 de un formulario, el estado después de filtrar, la SPA ya renderizada. Eso no lo alcanza un rastreador externo.

**La muestra se acumula navegando.** El botón «Añadir a la muestra» guarda la huella de cada página; con dos o más salen los criterios de sitio (3.2.3, 3.2.4, 3.2.6, 2.4.5) sobre páginas que solo tú puedes ver.

**Las tres capturas son del viewport entero, no de cada elemento.** Para el contraste por píxeles se captura una vez con cada sonda y una con el texto transparente, y luego se recorta el rectángulo de cada texto. En la versión de Node eran tres capturas *por elemento*.

### Lo que la extensión NO puede, y por qué se dice

**1.4.10 Reflujo no se comprueba ahí.** Una extensión no puede cambiar el tamaño del viewport, y estrechar `documentElement` no reevalúa las media queries: daría un número sin significado. Se declara fuera de alcance en vez de inventarlo. Y el contraste por píxeles solo alcanza la parte visible, porque la captura es del viewport; los textos que quedan fuera se cuentan y se avisan.

**2.4.7 Foco visible se mide por otra vía.** Con el popup abierto el foco del sistema lo tiene el popup, no la página: `:focus` no se aplica y el cambio de estilo al enfocar no existe. Ver más abajo — no es un problema de la extensión, sino de cualquier auditoría con la ventana en segundo plano.

### El aplanado no es una concatenación

Los módulos son ESM y un content script de MV3 es un script clásico. Pegarlos uno detrás de otro habría sido un desastre silencioso: media docena de módulos definen por su cuenta `F`, `crit`, `IX`, `loc`, `tagOf` u `ocultoEl`, y en un solo ámbito el último gana y el resto pasa a llamar a una función que no es la suya — sin error, con veredictos falsos. Cada módulo va en su propia IIFE y comparte un espacio de nombres; los `import` se traducen a una desestructuración de él. Hay un test que comprueba justo eso: que cada capa sigue emitiendo su propio `scope`.

Y la prueba que importa: **el bundle y la librería dictaminan idéntico**, componente a componente, sobre el mismo fixture. Si divergieran, la extensión sería una segunda implementación que mantener a mano, que es lo que el build existe para evitar.

## 2.4.7 sin el foco del sistema: el fallo que solo se ve en un navegador de verdad

Auditando mi propio sitio desde un panel de navegador salió un veredicto que la suite no podía haber detectado: **«sin cambio medible» en todos y cada uno de los controles**. La medición de 2.4.7 compara el estilo antes y después de `el.focus()`, y el resultado era idéntico siempre.

La causa: **el documento no tenía el foco del sistema**. Con el panel abierto, el foco lo tiene el panel. `el.focus()` sigue moviendo `document.activeElement` —por eso 2.1.1 seguía midiéndose bien—, pero `:focus` **no se aplica** si la ventana no está enfocada, así que no hay nada que comparar. En Playwright no aparece nunca, porque allí la página siempre tiene el foco; en la extensión pasaría siempre, porque el popup se queda con él. Un falso 2.4.7 por elemento, en cada análisis.

La salida no es adivinar, es **cambiar de fuente**. Si `document.hasFocus()` es falso, el motor deja de medir el render y lee el CSSOM de la página buscando reglas `:focus` / `:focus-visible` que alcancen al control y **pinten** algo. Tres estados, cada uno con su veredicto:

| Situación | Veredicto | Por qué |
|---|---|---|
| Documento enfocado, el estilo cambia | `pasa` | Medido sobre el render. |
| Documento enfocado, no cambia | `revisar` | Medido, y no hay indicador que medir. |
| Sin foco, hay regla de foco con indicador | `cumple-parcial` | La presencia está; que se distinga y contraste, a ojo. |
| Sin foco, ninguna regla | `revisar` | Se dice exactamente por qué, no se acusa. |

Y la limitación **se declara** en los avisos del análisis, con la cuenta de controles resueltos por cada vía y las hojas de estilo de otro origen que no se han podido leer.

Dos trampas dentro del recorrido del CSSOM, las dos con test propio:

- En Chrome moderno una `CSSStyleRule` **también** tiene `cssRules` (CSS anidado). El recorrido evidente —`if (r.cssRules) { bajar; continue; }`— se salta en silencio **todas** las reglas normales, sin dar ningún error.
- En Tailwind los dos puntos van dentro del **nombre de clase**, escapados: `.focus\:outline-2:focus`. Recortar la pseudoclase con una expresión regular destroza la clase y el selector deja de coincidir con nada. El recorte va carácter a carácter respetando los escapes.

Y una precisión que cambia el signo del veredicto: **`outline: none` no cuenta como indicador**. Es justo la regla que quita el foco visible; si contase, `*:focus { outline: none }` —el borrador de indicadores más extendido que existe— daría «cumple-parcial» en toda la página exactamente donde más falta hace fallar. (Chrome normaliza además `*:focus` a `:focus`, lo que dejaba fuera precisamente las reglas que alcanzan a todo; también tiene su test.)

## Contraste sobre degradados e imágenes, midiendo píxeles

Era el último hueco de 1.4.3. Cuando el fondo es un degradado o una foto no existe un «color de fondo» que consultar, así que el agente lo marcaba `revisar` — honrado, pero de los «revisar» que más trabajo manual generan, porque los *hero* con foto están en todas partes.

El método es el que haría una persona con una lupa, automatizado. **El texto se repinta con dos colores conocidos y opuestos** —magenta y verde— y se captura tres veces: con cada sonda y con el texto transparente. La diferencia entre las dos sondas no depende del color real del texto ni del fondo: es siempre máxima donde hay letra. Del canal rojo sale la **cobertura exacta** de cada píxel, y la tercera captura da el fondo real bajo esas mismas posiciones.

El primer intento fue más simple —capturar con el texto y sin él, y quedarse con lo que cambia— y tenía un fallo de fondo: el caso que **más** importa, texto blanco sobre un fondo casi blanco, es aquel en el que la diferencia es mínima. El método se quedaba ciego justo donde hacía falta. Hay un test de regresión para ese caso exacto.

Tres cuidados para no mentir con números:

- **Los bordes antialiasados no se miden.** Un píxel de borde es mezcla parcial de texto y fondo; medirlo da contrastes falsos, casi siempre peores que los reales. Con la cobertura exacta se excluyen sin margen de duda.
- **Manda el peor punto, no la media.** Sobre un degradado, el texto puede leerse en un extremo y desaparecer en el otro; un promedio lo daría por bueno. Se informa del peor y del mejor, y de qué porcentaje del texto no llega al mínimo.
- **Si no se puede, se dice.** Con `background-clip: text` el color computado es `transparent`: no es el color que se pinta, así que no se dictamina. Medir contra el negro por omisión —que es lo que hacía— daba un veredicto inventado.

Lo resuelto por píxeles **sustituye** al «no medible» de la capa de medición para ese elemento, tanto si se resolvió como si no: arrastrar el pendiente dejaría en el informe un trabajo ya hecho, y cuando no se pudo, la explicación de la capa de píxeles es la útil.

El decodificador PNG va en `src/png.js`, sin dependencias: el alcance es diminuto y conocido —8 bits por canal, sin entrelazar, que es lo que emite Chromium— y lo que queda fuera lanza un error claro en vez de devolver píxeles inventados.

## La muestra, según WCAG-EM

Hasta ahora las URLs las ponías tú. WCAG-EM (paso 3) pide algo más concreto: una **muestra estructurada** —páginas comunes, una por plantilla, cada tipo de contenido y tecnología— más una **muestra aleatoria** de al menos el 10 %, y la **justificación de por qué está cada página**, que es lo que acaba en el IRA.

```bash
node examples/auditar-sitio.mjs --muestra 15 --semilla expediente-2026 https://ejemplo.com/
node examples/auditar-sitio.mjs --solo-muestra https://ejemplo.com/   # propone la muestra sin auditar
```

Cada página seleccionada llega con sus motivos:

```
/buscar
    – Resultados de búsqueda
    – Página con formulario
    – Plantilla propia (1 página la comparte)
/servicios/a
    – Plantilla propia (2 páginas la comparten)
    – Tipo de contenido: Tabla de datos
/servicios
    – Muestra aleatoria (semilla «expediente-2026»)
```

**La parte aleatoria es reproducible.** Un generador con semilla, y la semilla viaja en el resultado y en la justificación. Dos ejecuciones con la misma semilla dan la misma muestra: sin eso, un informe no se puede defender ni repetir.

**Se dice lo que falta.** Si el sitio no tiene declaración de accesibilidad, o no se ha encontrado ningún paso de un proceso, sale como aviso en la justificación en vez de pasar desapercibido. Y si la muestra estructurada ya cubre todas las páginas rastreadas, el informe dice que la auditoría abarca el sitio completo y no una muestra.

**Al recortar por el máximo nunca se pierde la parte aleatoria.** WCAG-EM la exige; recortar por ahí dejaría el informe fuera de metodología.

### El rastreo visita un sitio que no es tuyo

Cuatro reglas, verificadas contra un servidor que registra cada petición (`test/integration/crawl-real.test.mjs`):

- **Se respeta robots.txt.** No porque obligue —una auditoría contratada tiene permiso— sino porque lo que un sitio marca como prohibido suele ser justo lo que no hay que tocar: carritos, paneles, endpoints de acción. `robots: "ignorar"` lo desactiva y exige decisión explícita, y queda anotado en la procedencia.
- **Solo GET y solo el mismo host.** Los PDF y demás binarios se anotan como señal de contenido; no se descargan.
- **Nada destructivo.** Cerrar sesión, borrar, darse de baja: ni se visitan. Un rastreador que pulsa «cerrar sesión» invalida el resto del rastreo; uno que pulsa «eliminar» hace daño. La regla de rutas y la del texto del enlace van **separadas** a propósito: en el texto «Salir» es inequívoco, pero en una ruta `/como-salir-de-dudas` o `/borradores` son páginas legítimas, y bloquearlas deja agujeros en la muestra sin que nadie se entere.
- **Ritmo.** Una página cada vez, con pausa entre peticiones y tope de páginas y profundidad.

La **firma de plantilla** agrupa páginas del mismo diseño: landmarks en orden, la clase de `body` y `main`, las clases de los bloques de primer nivel y el número de enlaces de la navegación. Cuenta solo los elementos **con clase propia**: las clases las pone la plantilla, las etiquetas sueltas (`<p>`, `<table>`, `<video>`) las pone el contenido. Mezclándolas, dos fichas del mismo diseño —una con tabla y otra con vídeo— salían como plantillas distintas, y en un sitio real cada artículo habría parecido una plantilla propia.

## Coherencia entre páginas: cuatro criterios que dejaron de ser «humanos»

Otros cuatro criterios salían como «evaluación humana» no porque exijan juicio, sino porque **hay que mirar más de una página a la vez**. Con la muestra delante son deterministas.

| Criterio | Qué compara el agente |
|---|---|
| **3.2.3** Navegación coherente | Que los destinos repetidos en la navegación mantengan el mismo orden relativo en cada página |
| **3.2.4** Identificación coherente | Que el mismo destino se llame siempre igual — «Servicios» en una página y «Prestaciones» en otra es una falla |
| **3.2.6** Ayuda coherente | Que cada mecanismo de ayuda viva siempre en la misma parte de la página |
| **2.4.5** Múltiples vías | Que el sitio ofrezca al menos dos formas de localizar una página (buscador, mapa web, índice, navegación) |

```js
import { auditSite } from "agente-a11y-motor";
const r = await auditSite([{ url: "…/" }, { url: "…/servicios" }, { url: "…/contacto" }]);
r.coherencia;  // los cuatro criterios de sitio
r.rollup;      // conformidad agregada de la muestra
```

La identidad de «misma función» es el **destino normalizado**: `/contacto`, `/contacto/`, `https://sitio.es/contacto` y `/contacto#form` son el mismo sitio; `?q=a` y `?q=b` no. Las anclas internas no identifican una página y quedan fuera.

Tres decisiones evitan los falsos positivos que arruinarían estos criterios:

**La huella se toma dentro de la página real, con `getComputedStyle`.** Casi todos los sitios llevan un menú móvil duplicado que el CSS oculta en escritorio, a menudo con los destinos en otro orden. Si se colara en la huella, 3.2.3 fallaría en sitios perfectamente coherentes.

**Añadir enlaces no es desordenar.** Solo se compara el orden relativo de lo que las páginas comparten: meter un enlace nuevo en medio, o que falte uno, no es una incoherencia.

**3.2.6 mira dónde está la ayuda, no en qué orden.** Comparar el orden entre mecanismos distintos era ruidoso —un «Contacto» en el menú y una «Ayuda» en el pie cambian de orden relativo en cuanto una página añade un enlace contextual—. Lo que sí es una incoherencia real es que el mismo mecanismo esté en la cabecera en una página y en el pie en otra. Dentro de una misma región, el orden sí cuenta.

Y un matiz de 3.2.4: que un nombre **contenga** al otro («Inicio» / «Ir a inicio») es un matiz a revisar, no una contradicción; dos nombres sin nada en común para el mismo destino sí son una falla.

## Una página, un navegador

`auditRun` audita una página entera en **una sola sesión de navegador**. Antes cada capa abría su propio Chromium: quince páginas de muestra eran cuarenta y cinco lanzamientos.

```js
import { auditRun } from "agente-a11y-motor";
const r = await auditRun({ url: "https://ejemplo.com/" }, {
  capas: { render: true, viewport: true, axe: true, dynamic: false }
});
```

El orden no es casual: primero lo que solo **observa** (motor, ámbito de página, medición, axe, huella), después lo que **modifica** la presentación (adaptación) y al final lo que **interactúa** (dinámico). Así ninguna capa mide sobre el desorden que dejó otra.

La navegación la hace el orquestador, una vez, antes de cualquier capa. Antes era un efecto secundario de la capa de render: apagándola, todo lo demás medía sobre `about:blank` y devolvía vacío sin dar ningún error.

**axe entra en el informe.** Antes se ejecutaba y sus hallazgos no llegaban a `findings`: lo que axe veía y el motor no, se perdía. Ahora se incorporan los criterios que el motor no ha marcado ya como falla — sin duplicar la misma barrera con dos voces.

**La ejecución queda documentada.** Cada auditoría devuelve `procedencia`: fecha, objetivo, versión del navegador, versión de axe, viewport base, qué capas corrieron y cuánto tardó cada una. Un entregable con efectos legales tiene que ser reproducible.

## Puente a los entregables (OAW / IRA / EN 301 549)

Los hallazgos ya llevan la cláusula EN. `oawExport` los transforma a la forma que consumen los informes de auditoría: hoja de **Barreras** (una fila por barrera, con su subcriterio EN `9.X.Y.Z`, gravedad, página, elemento y evidencia sin HTML) y hoja de **Seguimiento** (resultado agregado por subcriterio, estilo WCAG-EM), en **CSV para Excel en español** (BOM + `;` + CRLF) y JSON.

```js
import { oawExport } from "agente-a11y-motor";
const out = oawExport(findings, { url });   // { barreras, seguimiento, fueraDeEN, csv:{...} }
```

```bash
node examples/export-oaw.mjs https://ejemplo.com/ https://ejemplo.com/contacto
# → barreras.csv, seguimiento.csv, oaw-export.json
```

El mapeo llega a la **letra del OAW** (`9.X.Y.Z-A/-B…`, ver más abajo); el formato exacto de las plantillas lo aplican las skills de Informe de Hallazgos / IRA — esto les da la materia prima ya normalizada. Los 6 criterios nuevos de WCAG 2.2 (no en la EN vigente) se separan en `fueraDeEN`.

**Fallo seguro.** Solo `cumple` y `pasa` se exportan como «Correcto». `humano`, `revisar`, `cumple-parcial` y cualquier veredicto que no esté en la tabla salen como «No se puede comprobar». Un criterio que nunca se ha evaluado no puede declararse conforme en un documento con efectos legales — y eso es exactamente lo que hacía antes, porque cada módulo tenía su propia tabla de gravedad incompleta y lo que faltaba caía a «cumple». Ahora la tabla es una sola (`src/verdicts.js`) y trata lo desconocido como pendiente de revisión.

**Una fila por barrera real.** La hoja de Barreras emite una fila por cada *elemento* afectado, no una por criterio, y `num_barreras` cuenta lo mismo.

### La letra del OAW la asigna quien sabe qué comprobó

La plantilla R9.Web no se conforma con la cláusula EN: dentro de un criterio distingue casos con una letra. Un `1.3.1` no es un `1.3.1` — es `-D` si el problema son listas, `-I` si son tablas, `-Ñ` si son agrupaciones de controles, `-Q` si es la estructura de regiones, y `-A` en el caso general.

Lo evidente sería buscarlo en la redacción del hallazgo («tabla», «lista», «landmark»). Es lo que hacía el pipeline manual, y es frágil: **el subcriterio acababa dependiendo de cómo estuviera escrita la frase**, no de lo que se comprobó. Cambias la redacción de una barrera y cambia su subcriterio en el informe.

El motor tiene algo mejor: sabe el **tipo de regla** que saltó y sobre **qué nodo**. Eso son hechos.

```js
letraOAW(hallazgo, { nodo, overrides })
// → { subcriterio: "9.1.3.1-I", via: "estructura", motivo: "el nodo es una tabla…" }
```

El orden es: **override del auditor → señal estructural → texto → letra general**, y cada fila del CSV lleva su columna «Asignado por» con la vía. En un entregable con efectos legales conviene poder auditar también el mapeo. Ejemplos de señal estructural: el nodo es `table`/`role=table` → `-I`; es `ul`/`role=list` → `-D`; es `nav`/`main`/un encabezado → `-Q`; en 4.1.2, la regla que saltó es de estados (`aria-missing-state`, `state-invalid`) → `-B`, y de nombre o rol → `-A`.

**La letra se resuelve por fila, no por criterio.** Dos barreras del mismo `1.3.1` salen como `9.1.3.1-I` y `9.1.3.1-D` si una es una tabla y la otra una lista.

**Y no se inventan letras.** Un criterio que no está en la tabla devuelve `null` con su motivo y aparece en `oaw.sinSubcriterio` para mirarlo a mano; no se rellena con una `-A` por defecto que pasaría por buena. Los 6 criterios que la plantilla no recoge (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) se informan por su cláusula EN, sin letra. Hay un test que recorre los 55 criterios del motor y falla si alguno se queda sin mapear sin que nadie lo haya decidido — hoy están los 55.

**Los overrides mandan**, por criterio (`"1.3.1"`) o por elemento (`"1.3.1|nav.principal"`), igual que en el pipeline manual.

**Dos elementos distintos son dos barreras.** Los nodos se deduplicaban por *locator*, y dos `<img>` sin `id` ni clase comparten locator (`img`): se fusionaban en uno y el IRA contaba una barrera donde había dos. Ahora la deduplicación es por identidad del nodo; el locator sirve para leerlo, no para contar.

**Y cada fila lleva un selector que selecciona.** Arreglado el recuento quedaba lo otro: dos filas con «img» en la columna Elemento no le dicen al auditor a cuál de las dos imágenes ir. Cada nodo lleva ahora una ruta CSS única (`html > body > main:nth-of-type(1) > img:nth-of-type(2)`) en su propia columna **Selector**: se pega en la consola del navegador y lleva a ese elemento y a ninguno más. Es el mismo formato que ya usaban la capa dinámica y la de píxeles, así que las cuatro capas nombran igual al mismo elemento.

El orden de foco (2.4.3) no es de un elemento sino de una secuencia, así que en vez de un selector lleva la lista: su detalle legible es `a → a → a → button`, que por sí solo no deja comprobar nada.

Hay tres tests en Chromium de verdad que comprueban lo único que importa aquí: que cada ruta emitida devuelve **exactamente un** elemento y que es el que dice ser — incluidos los `<img>` repetidos, el SVG en camelCase (`linearGradient`) y los elementos personalizados. Sobre jesusaccesible.com: 150 elementos, 150 rutas que resuelven a uno solo.

**Las celdas del CSV no ejecutan fórmulas.** La evidencia lleva texto tomado del sitio auditado, y Excel o Calc ejecutan como fórmula cualquier celda que empiece por `=`, `+`, `-` o `@`. Esas celdas se neutralizan y se entrecomillan (los números legítimos se dejan en paz).

## Hoja de ruta

- [x] **Motor como librería testeable** (este repo).
- [x] **Banco de precisión** contra corpus WPT (accname), como test de regresión.
- [x] **Análisis sobre render real** — `analyzeRendered` (Playwright) + núcleo de medición inyectable, reutilizable por la extensión de Chrome.
- [x] **Página completa y muestreo (WCAG-EM)** — criterios de ámbito de página + agregación de una muestra con veredicto de conformidad.
- [x] **Prueba dinámica** — tabulación, expandibles, pestañas y errores de formulario sobre render real.
- [x] **Puente a entregables OAW / IRA / EN 301 549** — exportación a Barreras + Seguimiento (CSV/JSON).
- [x] **Cruce con axe-core** — `src/axe-cross.js` + `src/axe-map.js`, reconciliación pura y adaptador Playwright.
- [x] **Puente Guidepup** — `src/guidepup-bridge.js` + `src/reader-lexicon.js`: predicción del motor vs. anuncio real de VoiceOver, con adaptador Guidepup y comparación pura testeada.
- [x] **Núcleo unificado** — CLI (`bin/a11y-motor.mjs`) y artifact web —motor **y medición**— generados desde la misma librería (`scripts/build-artifact.mjs`), con humo automatizado del HTML resultante.
- [x] **Adaptación del contenido** — 1.4.10 / 1.4.4 / 1.4.12 / 1.3.4 / 1.4.13 medidos sobre render real, con método antes/después.
- [x] **Orquestación en un solo navegador** — `auditRun`, con axe reconciliado dentro del informe y procedencia de la ejecución.
- [x] **Coherencia entre páginas** — `auditSite`: 3.2.3 / 3.2.4 / 3.2.6 / 2.4.5 comparando las páginas de la muestra.
- [x] **Selección de muestra WCAG-EM** — rastreo cortés + muestra estructurada y aleatoria reproducible, con su justificación para el IRA.
- [x] **Contraste sobre degradados e imágenes** — medido sobre los píxeles del fondo real, con decodificador PNG propio.
- [x] **Extensión de Chrome** — núcleo generado desde `src/`, con paridad verificada contra la librería.
- [x] **Siete criterios fuera del cajón de «juicio humano»** — 1.4.1 (enlaces distinguidos solo por color), 2.4.11 (foco tapado por lo que flota), 1.2.1/1.2.2/1.2.3 y 1.4.2 (inventario de medios y sus pistas) y 3.1.2 (bloques en otro idioma sin `lang`). De 27 criterios sin ninguna capa que los mida a 20.
- [x] **La tabla de determinabilidad dice la verdad** — catorce criterios marcados `semi`/`manual` ya los mide otra capa; la evidencia distingue «nadie puede dictaminarlo» de «lo mide una capa que no has ejecutado».
- [x] **Ajustes tras la revisión profunda** — `autocomplete` comprobado de verdad (1.3.5), sonda de puntero real (1.4.13), colores resueltos en la página con canvas (oklch, lab, color-mix), muestra reproducible sin depender del orden de rastreo, `auditSite` que sobrevive a una página caída, y un test que falla si lo generado no corresponde a `src/`.
- [x] **Léxico del lector contra capturas reales** — fixture de VoiceOver en español, y el ruido del escritorio deja de absolver barreras.
- [x] **Identidad del elemento en el informe** — ruta CSS única por nodo, verificada en navegador, común a las cuatro capas.
- [x] **Granularidad por letra del OAW** — `9.X.Y.Z-A/-B…` asignada por señales estructurales, con overrides, vía de asignación y nada inventado.
- [x] **2.4.7 sin foco del sistema** — vía estática sobre el CSSOM cuando `:focus` no puede aplicarse, con la limitación declarada en el informe.
- [x] **Revisión exhaustiva y endurecimiento** — vocabulario único de veredictos con fallo seguro, seguridad del driver dinámico verificada contra un servidor real, identidad estable de los controles en la traza, medición del contraste donde hay texto, y guardas en el build.
- [x] **Nueve criterios más fuera del cajón de «juicio humano»** — 2.2.1 (`meta refresh`), 2.1.4 (atajos de una sola tecla), 2.5.1/2.5.2/2.5.4/2.5.7 (dónde mirar el puntero, el arrastre y el movimiento), 2.2.2 (lo que se mueve solo más de cinco segundos) y 3.2.1/3.2.2 (cambio de contexto, sondado de verdad en el navegador). De 20 criterios sin ninguna capa que los mida a **11**.
- [x] **NVDA por integración continua** — léxico español del lector que de verdad se usa en España, recorte de sus estados para que no absuelvan barreras, adaptador de captura y workflow en `windows-latest` que devuelve la transcripción como fixture.
- [x] **Cuaderno de juicio** — los once criterios que quedan: el agente aparta los que no vienen al caso (`no-aplica`, nuevo en el vocabulario de veredictos), monta el expediente de los demás con sus elementos localizados, y recoge la decisión del auditor con motivo y firma para que viaje al IRA.
- [x] **Cuaderno de la muestra** — un criterio aplica al sitio si aplica en una sola página, y 3.3.7 se cruza entre páginas para ver el dato que se pide en el paso 1 y otra vez en el paso 3.
- [x] **El cuaderno, dentro de la orquestación** — `auditRun` lo monta en la capa de render (donde están el DOM ejecutado y el CSS resuelto) y `auditSite` agrega el de la muestra: una vez, no uno por página.

### Cambio de contexto: sondar sin romper la página

3.2.1 y 3.2.2 son de los pocos criterios que no se ven en el marcado: hay que **enfocar** cada control y **cambiarle el valor**, y mirar si la página se va a otro sitio, si el foco salta o si el contenido cambia solo. El driver lo hace sobre el navegador de verdad, con el cortafuegos puesto: la navegación se aborta antes de salir a la red y se declara en los avisos.

Dos cosas que costaron:

**La página aborta, y `__el(uid)` deja de existir.** Abortar una navegación deja el documento en un estado en el que el elemento ya no se resuelve, aunque la huella siga respondiendo. Si no se recarga, cada control posterior se queda sin sondar. Se recarga y se reintenta, y las recargas se cuentan en un aviso del informe.

**Y el orden importa más que la recarga.** Tomando la huella «antes» *antes* de resolver el elemento, la recarga cambiaba la URL entre las dos huellas y **todos** los controles siguientes salían acusados de navegar. El orden correcto —primero resolver el elemento, recargando si hace falta, y solo después tomar la huella— es lo que separa un informe útil de una tanda de falsos positivos. Hay un test en Chromium con servidor real que lo comprueba: el `<select>` que navega sale `falla`, y el `<input>` y el `<button>` de al lado no salen en ningún sitio.

**Veredictos distintos para cosas distintas.** Navegar al enfocar o al cambiar el valor es `falla`: no hay lectura benévola. Que salte el foco o cambie el contenido es `revisar`, porque el criterio lo permite si se avisó antes, y ese aviso no se ve desde aquí. Y cuando no pasa nada, el veredicto dice **cuántos controles se probaron**, que es lo que permite juzgar si la prueba valía algo.

### NVDA: el lector que de verdad se usa aquí

El puente de lector se verificaba solo con VoiceOver, porque el equipo trabaja en macOS. Pero en España el lector dominante es **NVDA**, y NVDA es Windows. Un informe que dice «verificado con lector real» y por dentro solo ha visto VoiceOver está diciendo media verdad.

**NVDA no dice lo que dice VoiceOver.** Donde VoiceOver anuncia «imagen», NVDA dice «gráfico»; donde dice «enlace», «vínculo»; donde dice «campo de texto», «edición»; donde dice «botón de radio», «botón de opción». Las palabras de los dos conviven ahora en la misma tabla de roles: reconocer de más un rol no absuelve nada, porque el rol solo sirve para **confirmar** lo que el motor ya predijo.

**Lo que sí era peligroso es el estado.** NVDA acompaña cada elemento de su estado y su posición: «casilla no marcada», «contraído», «visitado», «1 de 7», «nivel 2», «fila 3 columna 1», «clicable». Nada de eso es el nombre del control. Si no se recorta, un botón de icono **sin** nombre accesible —un 4.1.2 real— se queda con «no marcada» de residuo y el puente concluye que «el lector sí pronuncia un nombre»: una barrera de verdad absuelta por una palabra de estado. Es el mismo fallo que ya se arregló con el ruido del escritorio en macOS, con otro disfraz. Hay tests para los dos casos.

**Y se ejecuta en CI, porque no hay otra forma.** El workflow `NVDA (Windows)` levanta un runner `windows-latest`, instala NVDA con `npx @guidepup/setup install`, recorre el mismo componente de prueba que la verificación de VoiceOver y guarda la **transcripción literal** como artefacto. No corre en cada push —arrancar un lector es lento y frágil, y su fallo no debería teñir de rojo un cambio de CSV—: se lanza a mano y una vez por semana.

El fichero vive en el `.github/workflows/` de la **raíz del repositorio**, no dentro de esta carpeta, y sus pasos trabajan con `working-directory: agente-a11y-motor`. No es capricho: GitHub Actions solo lee los workflows de la raíz, y un `.github` anidado en una subcarpeta no se ejecuta nunca — el fichero parece estar y no corre.

Ese JSON es el entregable. `node scripts/fixture-nvda.mjs verificacion-nvda.json` lo guarda en `test/fixtures/nvda-es-real.json` **sin tocar ni una frase**, y a partir de ahí la comparación se prueba en cualquier máquina, sin Windows y sin lector. El script se niega a guardar un informe que no sea de NVDA, que no venga de Windows o en el que ninguna captura haya servido: un fixture retocado para que los tests pasen no prueba lo que dice NVDA, prueba lo que queríamos que dijera.

**Mientras no haya transcripción real, esos tests se saltan solos** y dicen cómo producirla. No hay un fixture escrito a mano haciendo bulto: sería exactamente el supuesto que el fixture existe para desmentir.

**Y un fichero por idioma, que no es un detalle.** El runner de GitHub es una máquina en inglés: su NVDA dice «button» y «heading, level 1». Esa transcripción vale para comprobar el mecanismo y las palabras inglesas del léxico, pero **no comprueba el español**, que es el que hace falta para auditar aquí. Guardarla como `nvda-es-real.json` sería el peor fixture posible: uno que parece probar el español y no lo prueba. Así que `scripts/fixture-nvda.mjs` detecta el idioma por las palabras de rol, escribe `nvda-en-real.json` o `nvda-es-real.json` según corresponda, y se niega a archivar una sesión cuyo idioma no reconoce. Las comprobaciones del recorte de estados —«casilla no marcada», «3 de 7»— solo corren con el fixture español.

### El cuaderno de juicio: los once que no se dictaminan

Quedan **Once criterios de evaluación humana**, los que exigen que una persona mire y decida: subtítulos y audiodescripción (1.2.4, 1.2.5), secuencia significativa (1.3.2), características sensoriales (1.3.3), imágenes de texto (1.4.5), destellos (2.3.1), propósito de los enlaces en contexto (2.4.4), sugerencias ante errores y prevención de errores (3.3.3, 3.3.4), entrada redundante (3.3.7) y autenticación accesible (3.3.8).

El agente no los dictamina. Hace otras dos cosas, y ninguna es opinar.

**Dice cuándo no vienen al caso.** En una página sin vídeo ni audio, 1.2.4 y 1.2.5 no se cumplen ni se incumplen: **no aplican**, y el IRA tiene esa casilla. Sin campos con restricciones no hay error que sugerir cómo corregir, y 3.3.3 se va. Sin contraseña ni captcha no hay autenticación que evaluar, y 3.3.8 también. En una página de contenido corriente, seis de los once desaparecen antes de que nadie los mire. Eso es determinista, y es donde está la mayor parte del ahorro.

**Y monta el expediente de los que sí.** Qué elementos hay que mirar, con su ruta CSS para ir directo; qué se sabe ya de ellos; la pregunta concreta que hay que responder; y qué contaría como fallo. En 2.4.4 trae cada enlace genérico **con el párrafo, el ítem o la celda que lo contiene** —el contexto que un lector de pantalla puede alcanzar— y marca los que no tienen ninguno, que son los que suelen fallar. En 1.3.3 busca en la redacción las instrucciones que apelan al color, la forma o la posición («pulse el botón verde», «vea la columna de la derecha») y dice de cuál de las tres se trata. En 3.3.7 agrupa los campos que piden el mismo dato y marca los pares que son una confirmación, que la norma exceptúa expresamente. En un sitio grande, encontrar eso es lo que cuesta; decidirlo lleva diez segundos.

**Lo que no hace es fingir que ve lo que no ve.** En 1.4.5 dice literalmente que no hay OCR: los indicios son el `alt` y el nombre del archivo, y el texto dentro de la imagen no lo lee nadie desde el marcado. En 1.3.3, el «no aplica» deja escrito que solo se ha mirado el texto, porque una instrucción dada dentro de una imagen se le escapa. En 3.3.7 avisa de que el criterio habla del proceso entero y él solo ve una página.

**Y recoge la decisión con su motivo y su firma.** `registrarJuicio` se niega a registrar una decisión sin motivo y sin quién la toma:

```js
registrarJuicio(cuaderno, {
  criterio: "1.3.3", veredicto: "falla",
  motivo: "«Pulse el botón verde» no da el nombre del botón: sin ver la pantalla no se sabe cuál es.",
  auditor: "Jesús Fernández Abeledo"
});
```

Un IRA que dice «Correcto» sin decir por qué no es una auditoría, es una casilla marcada — y el motivo es justo lo que hay que poder enseñar si alguien pregunta. El veredicto sale de un juego cerrado (`cumple`, `falla`, `no-aplica`, `revisar`): `pasa` y `cumple-parcial` son palabras de la máquina, significan «medido sobre render real», y no le corresponden a una persona.

De ahí al informe: un criterio decidido viaja con su motivo y su firma en la evidencia; uno que no aplica sale como `no-aplica`; y **uno pendiente sale como `humano`, nunca como conforme**. `aplicaCuaderno(findings, cuaderno)` sustituye en un informe ya hecho el «requiere evaluación humana» genérico del motor por lo del cuaderno — pero **no borra ningún `falla`**: si axe encontró una barrera real en 2.4.4, el cuaderno añade juicio, no lo perdona.

`no-aplica` entró en el vocabulario de veredictos por debajo de `cumple`, a propósito: en cuanto una página de la muestra aporta cualquier otro veredicto, ese otro gana. Un «no aplica» nunca puede tapar el hallazgo de otra página.

### Y el cuaderno de la muestra, que ve lo que ninguna página ve

Por página el cuaderno se queda corto en dos criterios, y lo dice: 3.3.7 y 3.3.4 hablan del **proceso**, no de la pantalla. `cuadernoDeMuestra(cuadernos)` junta los de todas las páginas, y ahí aparecen dos cosas nuevas.

**Un criterio aplica al sitio si aplica en UNA sola página.** Si la primera página no tiene vídeo y la segunda sí, 1.2.5 aplica a la muestra entera, con su elemento y su página al lado. Al revés —declarar «no aplica» porque no aplicaba en la primera— sería el fallo que este motor existe para no cometer.

**Y 3.3.7 se cruza entre páginas.** El caso real del criterio es un trámite de varios pasos que te vuelve a pedir el correo en el paso 3. Mirando el paso 1 no se ve; mirando el paso 3 tampoco; las dos fichas por página salen «no aplica» con toda la razón. Poniéndolas juntas, sí:

```
── 3.3.7 Entrada redundante (A)  [PENDIENTE]
   · Ninguna página de la muestra repite un dato dentro de sí misma: la repetición está ENTRE páginas.
   · 1 dato(s) se piden en más de una página de la muestra: autocomplete:email.
   · El agente no sabe si esas páginas son pasos del mismo proceso: eso lo sabes tú.
   → https://x.es/paso-1 · input#e   [entre páginas · autocomplete:email] «Correo»
   → https://x.es/paso-2 · input#e2  [entre páginas · autocomplete:email] «Correo»
```

Esa última línea del «lo que ya sabemos» es la que evita el falso positivo: dos formularios sin relación pueden pedir el mismo dato sin incumplir nada, y quién sabe si son pasos del mismo trámite es el auditor, no el agente. Cuando el cruce levanta el criterio, la frase de «no viene al caso» desaparece: dejarla debajo del estado nuevo sería contar dos cosas incompatibles en la misma ficha.

Un veredicto adelantado —el `cumple-parcial` de 2.4.4 cuando no hay ningún enlace genérico— solo sobrevive a la muestra si **todas** las páginas donde aplica lo comparten. Basta una con «Leer más» para que el sitio vuelva a estar pendiente.

```
node examples/cuaderno-juicio.mjs https://ejemplo.es/
node examples/cuaderno-juicio.mjs https://ejemplo.es/paso-1 https://ejemplo.es/paso-2
```

### Y ya no hay que acordarse de meterlo

`auditRun` monta el cuaderno **dentro de la capa de render**, que es donde están las dos cosas que necesita y no hay en ningún otro sitio: el DOM después de ejecutar los scripts, y las reglas de las hojas de estilo **externas**. Sin lo segundo, 2.3.1 se quedaba corto sin decirlo: una animación declarada en un `.css` aparte no se ve montando el cuaderno sobre el HTML servido. Hay un test en Chromium con la animación en una hoja externa, justamente para eso.

`auditSite` agrega el de la muestra y lo mete en el informe **una vez**, retirando los de cada página. Dejar los dos llenaría el CSV de N copias del mismo expediente —una por página— diciendo cosas distintas del mismo criterio. Los cuadernos por página siguen ahí, en `paginas[i].cuaderno`, para el detalle.

## Revisión completa: once fallos que absolvían al sitio

Una revisión de todo el motor, capa por capa, con una regla: **nada se arregla sin haberlo reproducido ejecutando código primero**. Salieron once fallos confirmados así, y tienen todas la misma forma: el informe declaraba conforme, o simplemente no decía, algo que no se había comprobado. Es el único error que este motor no se puede permitir, porque el entregable tiene efectos legales. Cada uno lleva su prueba de regresión.

**La firma del auditor no sobrevivía a la agregación.** `registrarJuicio` fijaba `decision` y `veredicto` y no tocaba `aplica`; `cuadernoDeMuestra` agregaba mirando solo `aplica` y no propagaba `decision`. Resultado: un `falla` firmado a mano sobre una ficha que el motor había marcado «no aplica» salía del informe del SITIO como **«No aplica»**, y la conformidad pasaba de «No conforme» a «Sin barreras deterministas en la muestra». El agente absolvía al sitio de una barrera que una persona había confirmado y firmado. Ahora la firma manda sobre la detección, un `falla` firmado en cualquier página es un `falla` del sitio, y una firma en una página no cierra el criterio si falta otra.

**Una muestra con huecos se declaraba completa.** `rollupSample` deducía «esta página no se analizó» de «no trae hallazgos», y `auditSite` añade a cada página los hallazgos de sitio —coherencia y cuaderno—, así que ninguna lista quedaba vacía y el guardia no se disparaba nunca. Con dos de tres páginas caídas, el rollup decía «3 de 3 analizadas» y llegaba a exportar nueve criterios como «No aplica» **para el sitio entero a partir de una sola página**. Las páginas viajan ahora con `error` y `analizada`, y el cuaderno recibe la lista de huecos: con la muestra incompleta, un «no aplica» se queda en pendiente y dice por qué.

**El resumen contaba como conforme lo que no lo era.** Un `else summary.cumple++` metía `cumple-parcial` en el cubo de `cumple`, y el CLI imprimía «5 cumplen» en una página cuyos textos alternativos nadie había leído. Un cubo por veredicto, y «cumplen» son los que cumplen.

**El cruce motor↔axe no se disparaba jamás.** El motor nombra un elemento con su ruta canónica y axe con su selector mínimo (`img[src="a.png"]`, `a`): comparar las cadenas no casa nunca. Cada barrera que veían las dos fuentes salía dos veces en el IRA y `num_barreras` iba al doble — en una página de tres barreras, seis filas en lugar de cuatro. La ruta se resuelve ahora en el navegador con `querySelector`, que es el único sitio donde se puede. Y la frase «N elemento(s) ya los había detectado el motor» se escribía también cuando el motor no había visto nada: era una evidencia falsa nuestra.

**El puente a los lectores confirmaba lo que no había comprobado.** El arreglo por palabra completa se hizo en `alignPredictedToSpoken` y no se trajo a `compareAnnouncement`, que seguía con `indexOf`: «Ver» casaba dentro de «Verificar mis datos» y el puente devolvía `confirmado` con la nota «el lector anuncia el nombre y el rol previstos». Y al descartar los tokens de dos letras, un nombre hecho solo de palabras cortas —«Ir a»— no puntuaba, empataba con un nodo SIN nombre y el desempate se la llevaba el que no lo tiene: el enlace-imagen sin `alt` aparecía nombrado y su 4.1.2 salía como «posible falso positivo del motor». Las dos cosas son la absolución que este puente existe para impedir.

**`\s` dentro de un template literal no es `\s`.** Cuatro capas inyectan código en el navegador dentro de un template literal, y ahí JavaScript colapsa `\s` a la letra `s` sin avisar: lo que se escribe `/\s+/` llega como `/s+/`, «una o más letras s». Pasaba en tres sitios. En `crawl.js`, `__cls` partía la lista de clases por la «s», así que `class="noticias"` y `class="noticia"` daban el mismo token: dos plantillas con la misma firma, una desaparecía de la muestra, y el IRA afirmaba «4 plantillas, la muestra cubre 4» — una plantilla entera, con sus barreras, fuera de la auditoría. Y `role="search"` se perdía. En `pixel-contrast.js`, la capa de píxeles nombraba los elementos distinto que el motor, que es justo lo que el comentario de esa función dice evitar. El fallo es invisible leyendo el fichero: en el editor se ve `/\s+/`. Hay una prueba que **evalúa** las cuatro plantillas y lo busca en todas.

**El cortafuegos de red era un interruptor, y tenía que ser un pestillo.** Se armaba al empezar cada fase de interacción y se desarmaba al acabarla. Pero el manejador de un control no lanza su petición durante el `click()`: la lanza después, en un `setTimeout` o un `debounce`. Cuando llegaba, la fase había terminado y la petición salía. Reproducido con seis `DELETE` diferidos: el aviso decía «No han llegado al servidor» y uno había llegado. Había un segundo hueco, intermitente, entre la última fase y el cierre del navegador, donde `page.route` ya no existe; se cierra apagando la página (`about:blank`) antes de recoger, que destruye los temporizadores pendientes. El aviso ya no promete en absoluto: dice desde cuándo garantiza lo que garantiza. Y hay una prueba de integración que barre cuatro retardos contra un servidor que registra lo que recibe, porque era una carrera y un solo valor puede pasar por casualidad.

## Segunda ronda: las capas que miden sobre el navegador

La primera ronda fue el vocabulario de veredictos, el cuaderno y la agregación. Esta es la mitad que corre dentro de Chromium: medición, adaptación del contenido, píxeles, prueba dinámica y criterios de sitio. Misma regla —nada se arregla sin reproducirlo ejecutando código— y mismo patrón en casi todo: **el criterio se dictaminaba por una señal que no es la que el criterio pide**.

**Un indicador de foco invisible pasaba 2.4.7.** La comparación del antes y el después de enfocar era una cadena de texto, y cualquier diferencia contaba como indicador visible. Cinco indicadores literalmente invisibles —`outline: 2px solid transparent`, `rgba(0,0,0,0)`, un `box-shadow` transparente, un borde blanco sobre fondo blanco— salían los cinco «pasa · cambio visible al enfocar». Ahora se mira canal por canal: que tenga tamaño, que su color tenga alfa, y que no sea del mismo color que lo que hay detrás. De paso entran dos canales que la firma no miraba, el fondo y la decoración del texto, así que un foco que solo cambia el fondo deja de pasar desapercibido —y eso hizo que la vía estática del CSS dejara de ser necesaria para el caso que la justificaba—. Y un cambio que no se ve ya no es `revisar`: es una medición concluyente de que no hay indicador, o sea `falla`.

**1.4.3 se medía contra un fondo inventado.** `bgBehind` sube por la ascendencia del DOM, y la ascendencia no es el orden de pintado. Un bloque `position:absolute` que se dibuja encima de una foto sin ser descendiente suyo se medía contra el blanco del `body`: texto `#1a1a1a` sobre una foto `#141418` salía «pasa · 17.40:1 … sobre rgb(255 255 255)» con un contraste real de **1.06:1**. Ahora se comprueba con `elementsFromPoint` quién pinta de verdad ahí debajo; si no es un antepasado, el criterio se queda sin dictaminar y se dice qué lo tapa. Dentro del viewport, que es el límite y también se dice.

**1.4.10 pasaba con el texto recortado.** Se dictaminaba solo por `scrollWidth > clientWidth`. Con el desbordamiento escondido en `overflow:hidden` no hay barra, `scrollWidth` no crece, y el criterio salía «cumple» con 580 px de texto ocultos e inalcanzables a 320 px CSS. El criterio no habla de barras: exige que no haya pérdida de información, y esconder lo que no cabe es peor que la barra, porque ni se ve que falte algo. Lo que decide si es `falla` o `revisar` es si hay algo enfocable dentro: con texto plano no hay forma humana de llegar a esos píxeles.

**1.4.4 afirmaba un 200 % que no se aplicó a nada.** `html { font-size: 200% }` no toca nada cuando los tamaños están en `px`, que es lo normal, y eso no se comprobaba en ningún momento: la fase devolvía «aplicado» y el criterio salía «cumple · con el texto al 200 % no se recorta ni se solapa ningún bloque». Medido: la fuente seguía en 14px antes y después. Ahora se comprueba si surtió efecto y, si no, se escala el tamaño y el interlineado computados de cada elemento con texto —que es lo que hace el zoom de texto de un navegador— y se dice por qué vía se consiguió. Con el texto al doble de verdad, la tarjeta de la prueba esconde 116 px.

**La tolerancia del 2 % de la medición por píxeles absolvía letras enteras.** Se justificaba por «el ruido de remuestreo y compresión», pero se aplicaba a píxeles con cobertura ≥ 0.9 —el núcleo del glifo, ya filtrado de antialiasing—, donde ese ruido no existe. Sobre un degradado, ese 2 % son palabras. Y la evidencia llegaba a decir «todo el texto llega al mínimo» junto a «1.00:1 en el peor punto», una contradicción dentro de la misma línea. Ahora `pasa` solo si no falla ni un píxel; un puñado suelto pide revisión, que no es conforme.

**2.1.1 no miraba los controles interactivos.** El driver enumeraba lo que ya era enfocable, así que un `div role="button"` sin `tabindex` —el fallo de libro del criterio— no entraba en la lista, no había nada «sin alcanzar», y se emitía `cumple` con la frase «Todos los controles interactivos se alcanzan con Tab». Cinco barreras reales invisibles y una afirmación sobre «todos» hecha sin mirar ninguno. Ahora se enumeran aparte, respetando la excepción que hay que respetar: en un widget compuesto (tablist, listbox, menu…) el patrón ARIA correcto es una sola parada de tabulación y las flechas por dentro, así que eso no es barrera —pero como esta prueba no recorre las flechas, tampoco se firma el criterio: `cumple-parcial` y se dice.

**2.1.2 no veía la trampa de foco normal.** Solo detectaba el caso degenerado, el mismo control tres veces seguidas. Una trampa real no repite un control: cicla entre los del modal, así que la bandera se quedaba en `false` — y como esta capa es la única del motor que emite 2.1.2, el criterio no se evaluaba en ninguna parte y la trampa salía reetiquetada como un 2.1.1 de los controles de fuera. Ahora se detecta el ciclo y se nombran los controles entre los que gira.

**Tres barreras que el motor se inventaba.** Un `<fieldset disabled>` hace que sus campos no sean enfocables, pero el atributo no está en el hijo: mirando solo `hasAttribute('disabled')` entraban en la lista de enfocables, la tabulación no los alcanzaba —porque no se pueden alcanzar— y salía un 2.1.1 **grave** sobre dos campos correctamente deshabilitados. Si la fase de tabulación se caía (página cerrada, timeout de CDP), `reached` quedaba vacío y se emitía `falla` grave para *todos* los enfocables: cinco barreras graves inventadas por un error de la sonda. Y 3.3.1 emitía `falla` grave sobre formularios que hacen exactamente lo que manda la técnica **G83** —texto de error visible junto al campo, sin asociación ARIA— porque solo se miraba `aria-describedby`; lo que falta ahí es la asociación, que es 4.1.2, y ahí se dice.

**3.3.1 afirmaba tres cosas y no comprobaba ninguna.** «Los errores se identifican en texto, exponen `aria-invalid` y **se anuncian**» se emitía a partir de la simple existencia de un `[aria-live]` en cualquier parte del documento, vacío o no, relacionado con el error o no. Ahora el anuncio hay que verlo producirse: se compara el contenido de las regiones de estado antes y después de enviar.

**3.2.1 se exportaba como conforme sondando un tercio.** El tope de veinte controles recortaba la lista dentro del navegador, así que el análisis no llegaba a saber que había más: en una página de sesenta se sondaban veinte y el veredicto era `pasa`, que `esConforme()` da por conformidad. Ahora el total viaja con la traza, el veredicto baja a `cumple-parcial` y se dice cuántos quedan y cómo mirarlos. De paso el sondeo deja fuera lo que no puede recibir el foco —`[inert]`, el `disabled` heredado—, que producía sospechas falsas porque `el.focus()` no mueve el foco y la sonda lo leía como «el foco salta a otro sitio».

**Y cuatro de los criterios de sitio.** 3.2.3 comparaba cada página contra la primera, así que un destino que cambia de sitio entre la segunda y la tercera, y que no aparece en la primera, no se comparaba con nada: la inversión pasaba desapercibida y el criterio salía `cumple` afirmando que el orden se mantiene. 3.2.6 devolvía la primera región que encontraba subiendo, así que un `<footer><nav>` daba «navegación» y un `<footer>` a secas daba «pie», y emitía `falla` diciendo que el mecanismo de ayuda «cambia de sitio» cuando la única diferencia era el envoltorio. Cualquier `mailto:` contaba como mecanismo de ayuda, así que un «Compartir por correo» dentro de un artículo hacía fallar 3.2.6 en dos páginas que tienen la misma dirección de contacto en el mismo pie. Y 3.2.4 minusculizaba la ruta además del host, fundiendo `/Servicios` y `/servicios` en un destino con dos nombres: en HTTP la ruta distingue mayúsculas y son dos páginas.

### Y el guard que encontró lo que no buscaba nadie

La prueba de las secuencias colapsadas (`\s` dentro de un template literal) se amplió para recorrer también las plantillas **en línea**, que son la mayoría del código que se inyecta en el navegador: no basta con las que tienen nombre. Ese recorrido encontró el tercer caso, en `pixel-contrast.js`, que hacía que la capa de píxeles nombrara los elementos distinto que el motor — justo lo que el comentario de esa función dice evitar. Está comprobado que el guard muerde: se le mete el fallo a mano y falla.

## Tercera tanda: la letra pequeña de las técnicas

Menos espectacular que las dos anteriores y, en algunos casos, más dañina: aquí hay tres barreras que el motor **se inventaba** contra técnicas que WCAG declara suficientes, y un criterio que desaparecía del informe sin que nadie se enterase.

**Ocho criterios podían evaporarse sin rastro.** `render-analyze.js` tenía tres `catch` vacíos seguidos y una salida sin campo de errores, a diferencia de `viewportAnalyze`. Si la fase del cuaderno reventaba —basta un script que envuelva `document.styleSheets` para que lance, que es el patrón de los scripts de consentimiento y anti-bot—, el cuaderno quedaba en `null` y ocho criterios salían de `findings`: ni hallazgo, ni `revisar`, ni nota. De 36 criterios se pasaba a 28 y el informe no decía nada. En un IRA, un criterio que no está es un criterio del que nadie sabe que no se comprobó, y eso es peor que un `revisar`. Ahora el CSS es un extra y no un requisito —solo 2.3.1 lo necesita—, así que el cuaderno se monta sin él, se apunta el error y sale una nota de cobertura diciendo qué se ha quedado corto.

**1.4.13 fallaba por el simple hecho de que hubiera un `title`.** El texto normativo del criterio termina con una excepción: «the visual presentation of the additional content is controlled by the user agent and is not modified by the author». El tooltip nativo es exactamente eso, así que está exento — y el motor emitía `falla` moderada en cualquier página con un `<abbr title>`. Que `title` sea mala idea sigue siendo verdad, pero por otras vías: no se alcanza con teclado ni con el dedo y el soporte en lectores es desigual, y eso aterriza en 1.1.1, 2.5.3 o 4.1.2. Ahora se dice eso, y se dice dónde.

**1.4.1 fallaba contra la técnica G183.** «Contraste de 3:1 con el texto de alrededor más una señal visual adicional al recibir el foco» es técnica *suficiente* para 1.4.1, y solo se miraba el estado en reposo: un enlace que hace exactamente lo que G183 manda salía como `falla` grave. Y en el mismo bloque, la evidencia afirmaba una comparación que nunca hacía: decía «sin ningún distintivo **salvo el color**» también cuando el enlace tiene el mismo color que el texto que lo rodea — medido, 1.00:1, donde el color no distingue nada y el caso es peor, no mejor.

**1.4.12 aplicaba un margen que el criterio no exige.** El cuarto valor del criterio es «espaciado después de los **párrafos**», y el CSS de prueba lo aplicaba también a `li`, `dd` y `blockquote`. Medido: un menú de alto fijo con seis elementos no pierde nada con lo que exige 1.4.12 y perdía 126 px con lo que aplicaba el motor — un `falla` grave inventado. Ahora se aplica solo a `p`, que es además lo que hace el bookmarklet de Text Spacing de la Guía Técnica del OAW.

**2.4.11 acusaba a lo que se pinta detrás y no veía lo que tapa.** El comentario decía que se comprobaba «que de verdad se pinta por encima» y no se comprobaba: el `z-index` se recogía y no se leía nunca. Una marca de agua `fixed; inset:0; z-index:-1` cruzaba su rectángulo con cualquier control y producía tres `falla` graves en una página correcta. Y la barrera de verdad no se emitía: el foco se ponía con `preventScroll`, así que el rect de un enlace al final de la página no era el que tiene cuando el foco llega ahí — el último enlace, tapado al 100 % por la barra de cookies al tabular hasta él, no salía. Ahora el orden de pintado lo decide `elementFromPoint` sobre un punto dentro de la intersección, se mide con la página desplazada como al tabular, y el scroll se devuelve donde estaba.

**Y tres del puente a los lectores.** El nombre previsto se buscaba en la frase ya recortada, y el recorte quita estados y posiciones que no se distinguen de un nombre que diga lo mismo: un enlace llamado «Nivel 2» salía `divergente` porque el filtro se comía justo su nombre, igual que «Página 3 de 10» o «Requerido para continuar». Ahí la ambigüedad sí se puede resolver, porque el motor dice qué nombre espera, así que el nombre se busca en la frase cruda. Las palabras de estado estaban solo en la lista de NVDA y `stripReaderNoise` aplica una sola lista cuando se le pasa el lector: con `lector: "voiceover"` —que es lo que hacen los adaptadores reales— sobrevivían, y con ese residuo un control sin nombre dejaba de ser `barrera-confirmada` y pasaba a «divergente: posible falso positivo». Ahora el estado se recorta siempre, para los dos, y se han añadido «pulsado» y «atenuado», que no estaban en ninguna de las dos listas. Y la deduplicación de frases iba por la versión recortada, así que dos casillas cuya única diferencia era «marcada» / «no marcada» quedaban con la misma clave y una se descartaba en silencio: su nodo acababa sin verificar por un artefacto del filtro.

## Cuarta tanda: lo que no se miraba y lo que no se decía

Las cuatro que quedaban apuntadas, reproducidas y arregladas. Tres son de la misma familia —el motor tenía el dato delante y no lo usaba— y la cuarta es una nota de cobertura que decía un número y significaba otro.

**2.4.3 se dictaminaba sin mirar el orden visual.** El único criterio de decisión era la existencia de un `tabindex` positivo: sin él, `pasa` y la evidencia «sigue el orden del DOM». Pero el criterio exige que el orden de foco preserve el significado, y el orden del DOM y el visual se separan con `flex-direction: row-reverse`, `order`, `grid-area`, `float` o `position:absolute`. Medido: una fila con `row-reverse` se tabula de derecha a izquierda respecto a lo que se ve, y salía «pasa» — con el detalle «a → a → a → a», que además no permite comprobar nada. Ahora se comparan las inversiones dentro de una misma línea visual, que es donde la señal es limpia; entre líneas distintas no se acusa (una barra lateral que va primero en el DOM y se pinta a la derecha es maquetación legítima) pero se dice cuántas hay. El veredicto es `revisar`, no `falla`: que el orden difiera no es automáticamente una barrera, pero tampoco se firma como conforme sin que alguien lo mire. Y cada control va con su texto al lado.

**El Shadow DOM y los iframes eran invisibles, y nadie lo decía.** Todos los barridos usan `doc.querySelectorAll` sobre el documento principal, que no entra en un `shadowRoot` ni en un marco. Comprobado: un componente con shadow DOM con texto a 1.2:1 y un botón de 12×12, más un iframe del mismo origen con lo mismo, y cero mediciones y cero notas — el informe quedaba idéntico a uno de una página sin nada dentro. Que no se mida es discutible y queda como trabajo por hacer; que no se diga, no: ahora salen dos notas de cobertura nombrando los componentes y los marcos, y diciendo qué criterios de su contenido no están comprobados.

**1.3.4 afirmaba «no hay bloqueo de orientación» tras leer solo los scripts en línea.** Y con una expresión literal, así que no veía nada de lo habitual: la llamada en un bundle externo, una referencia intermedia (`var o = screen.orientation; o.lock(…)`), un módulo, un minificador que renombre. Las dos formas salían `cumple`. Ahora la API se envuelve antes de que cargue la página —`ScreenOrientation.prototype.lock` y las variantes antiguas con prefijo—, así que da igual dónde esté escrita la llamada: si se llama, se anota, y se anota con sus argumentos para poder citarla. La llamada se deja pasar al original, envuelta y no bloqueada, para no cambiar el comportamiento de la página. La búsqueda en el texto se queda como pista para la evidencia, no como veredicto.

**Y el cupo de la medición de contraste se gastaba en lo que descartaba.** El bucle recorría los primeros `limit` elementos de la lista y se saltaba los ya medidos, los invisibles y los que no dan contraste — pero esos habían gastado cupo igual. Con seis párrafos `display:none` delante, un cupo de seis se agotaba sin medir ni uno y los seis visibles ilegibles de después no se miraban. Y la nota imprimía el cupo como si fuera lo medido: «se midió el contraste de 6 de 18» con las mediciones de verdad por debajo. Ni se detectaba la barrera ni se avisaba. Ahora el cupo se cuenta sobre lo que de verdad se mide, los descartados se dicen aparte, y los ya medidos en la primera pasada no inflan la cuenta de pendientes.

## La medición entra donde antes no llegaba

Las dos cosas que quedaban no eran fallos sino función que faltaba, y aquí está.

### Componentes web: se mide dentro

Todos los barridos usaban `doc.querySelectorAll(…)`, que se detiene en la frontera de un shadow root. En un sitio hecho con componentes eso puede ser la página entera sin medir, y hasta ahora lo único que se hacía era declararlo. `todosM(raiz, sel)` recorre el árbol entero entrando en los shadow roots **abiertos**, y con eso el contraste, el tamaño de los objetivos, el foco visible y el orden de foco del contenido de un componente se miden como el resto de la página.

Dos detalles que hacían falta para que sirviera de algo. El primero, la identificación: `parentElement` es `null` en el primer hijo de un shadow root —la raíz sombra es un fragmento, no un elemento—, así que la ruta de un elemento de dentro salía como su etiqueta a secas. Ahora se salta al host y se marca el salto con ` >> `, la misma convención de Playwright, y el locator legible dice en qué componente vive: `mi-tarjeta >> p`. Sin eso, «p» no le sirve de nada a quien tiene que ir a buscarlo.

El segundo apareció al probarlo, y es el tipo de cosa que justifica la regla de verificar antes de dar nada por bueno: `document.activeElement` **se queda en la frontera**. Cuando el foco está en un botón dentro de un shadow root, `document.activeElement` es el host, no el botón. En cuanto los barridos empezaron a entrar, la comprobación de 2.1.1 producía «no recibe foco con Tab» sobre botones perfectamente enfocables — una barrera grave inventada por el propio arreglo. El foco de verdad se sigue bajando por `shadowRoot.activeElement`.

Lo que sigue sin medirse es lo que de verdad no se puede mirar: un shadow root **cerrado**, que desde fuera no expone nada. Eso se declara como nota de cobertura, nombrando los componentes.

### Marcos: se mide cada uno

`page.evaluate` corre en el marco principal y nada más. En un sitio que mete el formulario de pago, el reproductor o el mapa en un `<iframe>`, eso es justo la parte que más falta hace comprobar. Ahora `analyzeRendered` recorre `page.frames()` y ejecuta la misma medición dentro de cada marco, sellando los hallazgos con la URL de donde vienen (`marco https://… » p`) para que el informe diga dónde está la barrera y no solo que existe. Un marco de otro origen no se puede evaluar —la política del navegador lo impide, y no es un fallo nuestro— y se declara.

### 2.4.3: columnas frente a saltos

Las inversiones dentro de una misma línea visual ya se detectaban. Las verticales se contaban todas, y eso habría dejado el criterio a revisar en media web: en dos columnas, terminar la primera y volver arriba para empezar la segunda es el orden de lectura correcto, no un fallo. Lo que distingue los dos casos es si los dos controles comparten espacio **horizontal**: si no se solapan, están en columnas distintas y volver arriba es pasar de una a la siguiente; si se solapan, el foco sube por donde ya había bajado, y ahí sí hay algo que mirar.

Y se mide cuánto sube, porque no es lo mismo un salto de tres píxeles —una etiqueta y su campo que no cuadran al píxel: ruido de alineación— que uno de media pantalla. El primero no se dice; el segundo se dice con su cifra, que es lo que permite juzgarlo. Los tres casos están en la batería de integración: dos columnas legítimas, un enlace del final del DOM colocado arriba con `position:absolute` en la misma columna, y la desalineación de tres píxeles.

## La prueba contra un sitio real, y lo que encontró

Cuatro rondas de revisión arreglaron 37 fallos, todos reproducidos antes de tocar nada. Después se hizo lo que faltaba de verdad: auditar un sitio real de diez páginas y comparar el resultado, a ciegas, con el informe firmado a mano de la misma muestra.

La muestra venía dada —la fijó quien audita, no el rastreo—, y para eso está `examples/auditar-muestra.mjs`: audita **exactamente** esas URLs, descarta las repetidas diciéndolo (una portada dos veces no cubre once páginas, cubre diez, e infla el recuento de barreras), comprueba el navegador **una** vez antes de empezar —sin Chromium no se escribe ningún entregable, porque un informe de cero páginas no es un informe— y saca los dos CSV, el cuaderno y un JSON con todo por criterio y por página, que es lo que permite comparar dos ejecuciones.

El contraste con el informe humano: **precisión 12/15**, **cobertura 12/27**, y **cero conformidades falsas** — solo dos criterios se declararon conformes y en los dos coincidía el informe. La regla de oro se sostuvo. La cobertura es la mitad porque siete criterios no los mide ninguna capa todavía y porque hay barreras que requieren entender el contenido.

Y encontró tres cosas que cuatro rondas de revisión dirigida no habían visto, las tres del mismo tipo: **falsos positivos sistemáticos**, 247 de 802 filas, el 31 % del informe.

**2.4.7 inventaba un fondo blanco.** 82 filas. El fondo «real» se daba por bueno sin comprobar que lo pintado coincidiera con la cadena de antepasados, así que donde no se sabía, se suponía blanco, y sobre blanco supuesto cualquier indicador claro «no contrasta». Ahora las tres comparaciones por color van condicionadas a que el fondo sea fiable —origen conocido, sin imagen, verificado con `elementsFromPoint`—, y donde no lo es, no se afirma. Medido después en el mismo sitio: de 82 filas a 1.

**1.2.4 y 1.2.5 decían «no aplica» en una muestra con una página de vídeos.** El inventario de medios buscaba los reproductores habituales de Occidente. El sitio era la versión china de un portal turístico: Youku, Bilibili, iQiyi, Tencent Video, Douyin. Ninguno estaba en la lista, así que no había medios, así que los criterios no aplicaban — una afirmación positiva, firmada, falsa. Ahora la lista incluye las plataformas chinas y, lo que importa más, un marco que no se reconoce **ni como reproductor ni como no-reproductor** ya no cuenta como ausencia de medios: los dos criterios quedan pendientes y el marco dudoso se nombra. (Añadiendo esa lista escribí `le\.com` sin ancla, que casa dentro de «goo**gle.com**»: todos los Google pasaron a ser reproductores y Maps hizo que 1.2.4 aplicara. Lo cazó la propia sonda; ahora cada dominio va anclado con `(?:^|[/.])`.)

**2.4.11 acusaba a 165 controles de la misma barra.** Ocho páginas, todas con el mismo `div#cookieConsent`: fijo al pie, 150 px, `rgba(255,255,255,.95)` —opaco de hecho, así que la excusa del velo translúcido no le valía—, y cubriendo el 21 % de la ventana, lejos del umbral que habría hecho que se declarase como velo a pantalla completa. Aquí lo falso **no eran las barreras**: `scrollIntoView` con alineación «nearest», que es lo que hace el navegador al tabular, deja el control pegado al borde inferior, justo debajo de la barra, y ahí no se ve dónde está el foco. Reproducido en local con una barra equivalente: 17 de 24 enlaces, uno a uno. Lo falso era el **recuento**: una decisión de CSS que se arregla en un sitio salía como 165 barreras y enterraba los otros catorce criterios que fallaban en el mismo informe.

Así que 2.4.11 pasa a contarse **por causa**: un hallazgo por elemento que tapa, señalando a ese elemento —que es lo que hay que cambiar—, con cuántos controles deja ocultos, cinco de ellos por su nombre para poder reproducirlo, y el arreglo concreto (`scroll-padding-bottom` mayor que el alto de la barra, en el contenedor de desplazamiento). De 17 filas a 1 en el montaje de prueba; el número en el sitio real lo dirá la siguiente ejecución.

Y con el mismo bloque abierto, dos cosas más que estaban mal por debajo:

- **Solo se medía tabulando hacia abajo.** La alineación «nearest» deja el control pegado al borde por el que entra, y con Mayús+Tab ese borde es el de arriba — donde está la cabecera pegajosa, que es el ejemplo de manual de 2.4.11. Comprobado con una cabecera de 120 px: se acusaba **un** control, el que ya nacía debajo de ella, de los veinticuatro que oculta al subir. El criterio no habla de la dirección: habla de recibir el foco. Ahora se mide en las dos, y el mismo control tapado por los dos lados sigue siendo un hallazgo.
- **Quien reservaba el hueco cobraba igual.** El control no se coloca a mano: se saca de la ventana por el lado del que vendría el foco y se deja que el navegador lo traiga, que es quien aplica el `scroll-padding` del sitio. Con `scroll-padding-bottom: 170px` las acusaciones bajan de 17 a 1 — y ese 1 es verdad: al final del documento no hay sitio donde seguir desplazando, así que el último control no se aparta de la barra ni con hueco reservado. Para ese caso el consejo cambia, porque repetir «reserva el hueco» a quien ya lo reservó es no haber mirado: se dice que falta relleno en el contenido.

Lo que esta prueba demuestra no es que el agente estuviera mal. Es que **cuatro rondas de revisión del código no sustituyen a una medición**: los tres fallos eran sistemáticos, estaban en código revisado a propósito, y ninguno se veía sin ejecutarlo contra una página que nadie había escrito para probarlo.

## Los tres que quedaban de la comparación, y el que apareció por el camino

**El que apareció por el camino es el peor de todos: cuatro criterios de sitio desaparecían del informe en cualquier sitio con un correo en el pie.** La huella de cada página se toma dentro del navegador, y el código inyectado se montaba declarando a mano las constantes del módulo. Faltaba una: `COMPARTIR_RE`, que `tipoAyuda` usa en la primera línea de la rama de `mailto:`/`tel:`. En Node no se nota, porque allí la función corre con el módulo cargado; dentro de la página es un `ReferenceError`. Comprobado en Chromium, con una página de cuatro líneas: «ReferenceError: COMPARTIR_RE is not defined». El error se recogía en `errores`, la huella quedaba en `null`, y sin huellas la comparación entre páginas no compara nada: **2.4.5, 3.2.3, 3.2.4 y 3.2.6 salían del informe sin que nadie lo dijera**. El sitio chino con el que se midió no tiene ningún correo ni teléfono enlazado, así que allí no estalló; el pie de casi cualquier sitio español lo habría hecho estallar.

El fallo no era la constante olvidada: era que la lista se escribía a mano. Ahora es una lista con nombre, y hay un guard que extrae los identificadores en mayúsculas de las funciones serializadas y falla si alguno no está declarado ni es un global del navegador. Más uno de integración, que toma la huella de una página con `mailto:` en la cabecera, `tel:` en el pie y un «Compartir por correo» en el contenido, y comprueba que los dos primeros cuentan y el tercero no.

**2.4.1: lo que es un enlace de salto y lo que no.** De las tres condiciones de un enlace de salto solo se comprobaba una —que el destino exista—, así que valía cualquier ancla interna de las ocho primeras. Faltaban las otras dos: estar entre los primeros controles enfocables (si para llegar al enlace de salto hay que tabular el menú entero, no sirve) y apuntar al contenido. El caso que lo demuestra lo encontré probándolo: el `<a href="#panel">Desplegar</a>` que abre un acordeón es **estructuralmente idéntico** a un enlace de salto —primer enfocable, destino detrás del menú— y pasaba por uno. Por el nombre no se puede distinguir sin atarse a un idioma, y este sitio está en chino, así que se distingue por el destino: `cumple-parcial` solo cuando apunta al landmark `main` o a algo de dentro; cualquier otro destino se nombra y se deja a revisar, que es lo que es.

Y la evidencia afirmaba un mecanismo que la página no tenía. Decía «hay landmarks/encabezados como mecanismo alternativo», juntando las dos cosas en una frase; medido en el sitio real: **cero `main`, cero `nav`, cero anclas internas y catorce encabezados**. El informe decía «landmarks» de una página que no tiene ninguno. Ahora dice qué hay de cada cosa, cuántos controles hay que tabular para llegar al contenido —el número que de verdad decide este criterio a mano— y la advertencia que lo decide: WCAG admite ARIA11 y H69 como técnicas suficientes, así que desde aquí no se firma como falla, pero landmarks y encabezados solo se navegan con tecnología de apoyo, y quien usa el teclado sin lector de pantalla no tiene con qué saltar el bloque repetido. Es el motivo habitual para firmarlo como barrera, y ahora está escrito en el informe en vez de en la cabeza de quien audita.

Escribiéndolo metí la pata de una forma que vale la pena dejar anotada: usé `compareDocumentPosition` para comparar el orden en el documento. **En linkedom no está implementado**, así que devolvía `undefined`, la máscara de bits daba 0 y todo quedaba «antes de todo»: el enlace de salto bueno se rechazaba y la cuenta de controles previos salía 0 siempre — un dato falso en la evidencia, que es peor que no darlo. La sonda lo cazó en el primer intento, antes de que saliera de aquí. El motor corre en linkedom y en el navegador, así que el índice de orden es propio.

**2.2.2: observar en vez de leer el CSS.** La medición lee `animationName` e `animationIterationCount`, así que ve los carruseles hechos con `@keyframes` y no ve los que mueve JavaScript, que son la mayoría. En el sitio real eso se vio tal cual: el carrusel de la portada pasó sin que nadie lo cazara, y en su lugar el informe acusaba a un icono con `fadeInDown` —lo único que el CSS declaraba— en siete páginas. Un carrusel que pasa de diapositiva cada cuatro segundos no declara nada: cambia clases, cambia `style.transform`, mete y quita nodos.

Así que ahora se observa. Antes de tocar la página —primero de todo, porque si se observa después de tabular y pulsar, lo que se mida puede ser consecuencia de la propia sonda— un `MutationObserver` mira ocho segundos y apunta qué cambia, cuántas veces y entre qué segundos. El filtro es lo que separa un carrusel de la carga de la página: hacen falta varios cambios **repartidos en el tiempo**; una ráfaga en el primer segundo es el `lazy-load` y la animación de entrada. Después se busca si hay algún control de pausa en toda la página (2.2.2 lo admite en cualquier punto), con léxico en varios idiomas y contando los controles nativos de `<video>` y `<audio>`. Sin ningún control, movimiento sostenido es `falla` grave de nivel A; con un candidato, `revisar` nombrándolo.

También aquí la sonda corrigió mi umbral. Escribí «dura más de cinco segundos» como la distancia entre el primer y el último cambio, y un carrusel de 1,2 s por diapositiva observado siete segundos tiene su primer cambio en el 1,2 y el último en el 6,0 —4,8 s— y salía clasificado como movimiento que no llega al umbral. No es que no llegara: **es que se acabó la ventana**. Lo que distingue los dos casos es si el último cambio cae junto al final de la observación, contando con que entre dos cambios pasa un intervalo. Con eso, el carrusel es `falla` y una animación de entrada que para a los tres segundos se queda en `revisar` diciendo exactamente eso.

Cuesta ocho segundos de reloj por página, y se apaga con `movimientoMs: 0`.

**3.2.6 y 2.4.5: el léxico era monolingüe.** Los patrones de ayuda (contacto, ayuda, FAQ, chat), de mapa del sitio y de buscador estaban solo en castellano e inglés. En el sitio chino no se reconoció **ningún** mecanismo de ayuda, y el veredicto fue «no se ha detectado ayuda con los patrones conocidos; confírmalo a mano». Aquí hay que decir dos cosas, y la segunda importa más que la primera.

La primera: el léxico ya no es monolingüe. Van castellano, gallego, catalán, euskera, portugués, inglés y chino —simplificado y tradicional—, con un detalle que no es cosmético: los ideogramas van en una alternativa **sin** `\b`, porque en JavaScript no son `\w` y un `\b` detrás de «帮助» no casa nunca; la rama habría quedado muerta sin que se notara. Comprobado uno por uno: 联系我们 → contacto, 帮助 → ayuda, 常见问题 → FAQ, 在线客服 → chat, 网站地图 → mapa web, y 分享 sigue sin ser un mecanismo de ayuda.

La segunda: **en ese sitio 3.2.6 no tiene nada que encontrar.** Fui a mirarlo en vivo. El pie tiene 关于我们 (sobre nosotros), 隐私政策 (privacidad), Cookie 政策 y 网站地图 (mapa del sitio); no hay contacto, ni ayuda, ni FAQ, ni un solo `mailto:` o `tel:` en la página. Y 3.2.6 no exige ofrecer ayuda: exige que, **si se ofrece**, esté en el mismo sitio relativo en todas las páginas. Sin mecanismo de ayuda el criterio no aplica. El veredicto del agente era el correcto, y lo era por el motivo correcto aunque el léxico estuviera corto. Si tu informe firma 3.2.6 como barrera por no haber mecanismo de ayuda, ahí el que conviene volver a leer es el informe.

## Las dos adjudicaciones que quedaban

Las dos eran discrepancias con el informe hecho a mano, y en las dos el agente acusaba y la persona no. Las dos han resultado ser del agente, y las dos por el mismo tipo de motivo: el criterio dice algo más preciso de lo que el código comprobaba.

**3.2.4: el mismo destino no es siempre el mismo componente.** El agente agrupaba por destino: dos nombres distintos para la misma URL en páginas distintas, falla. Con eso, el patrón más común de la web entera sale como barrera: el menú de cabecera llama a una página por su nombre y una tarjeta del contenido la enlaza con un «+ más», un «Leer más», un «Ver todo». Medido en el sitio real: 7 destinos acusados, todos del mismo par —el nombre del menú y el «+ 更多» de una tarjeta—. Pero 3.2.4 habla de componentes con la MISMA funcionalidad, y un ítem de menú y un enlace de tarjeta no lo son.

La primera versión del arreglo agrupaba por destino **y por región**: cabecera, pie, navegación y contenido no se comparan entre sí, y dentro de una misma región sí —un ítem de menú que se llama distinto en otra página sigue siendo exactamente lo que el criterio prohíbe, y sigue saliendo—. Y de paso se arregló una comprobación que ya estaba ahí con el comentario correcto y la pregunta equivocada: decía «si conviven en la misma página son dos enlaces distintos» y preguntaba si algún nombre se ve en alguna página donde el otro no esté, que es verdad en cuanto un nombre está en todas las páginas y el otro solo en la portada. La pregunta era la que decía el comentario: ¿hay alguna página donde se vean los dos? Lo que sí se dice, sin acusar, es cuántos destinos se nombran distinto según qué enlace los apunta.

Y la región no bastó, lo cual se supo porque se volvió a medir: de 7 filas bajó a 3, no a 0. **El sitio no tiene NI UN landmark**, así que `regionDe` devolvía «otra» para todo y el ítem del menú y el «+ 更多» de la tarjeta volvían a caer en el mismo grupo; peor, el mismo menú salía «cabecera» en unas páginas y «otra» en otras, y una clasificación que cambia de página en página rompe también la comprobación de convivencia. Lo que sí es estable sin landmarks es la etiqueta y las clases: `a.menus_item` es el menú y `a.moer` es la tarjeta, en todas las páginas. Así que el componente se identifica por ahí — dejando fuera el `id` a propósito, porque muchos sitios lo derivan del texto del enlace y entonces cambiaría justo cuando cambia el nombre, que es lo que hay que detectar.

**1.4.13: el criterio lleva su excepción escrita y no se leía.** El requisito de «descartable» termina así: «except when the additional content ... does not obscure or replace other content». Un emergente hecho con `:hover` en CSS no responde a Esc **por definición**, así que sin esa condición todos salen como falla grave — incluido el tooltip que aparece en un hueco reservado debajo de un campo y no tapa nada, que la excepción exime expresamente. 47 filas en el sitio real. Ahora la sonda mide si tapa (fuera del flujo y con algo pintado debajo de su centro), y el emergente que no tapa nada sale como `cumple-parcial` diciendo que la excepción lo exime; cuando no se puede medir, se cuenta como que tapa, porque absolver sin mirar es lo único que no se puede hacer.

Y las barreras de esta capa salían al CSV **con la columna «Selector» vacía**: cinco filas diciendo `li.float-left` y nada con que ir a buscarlas. El `uid` de la sonda ya era un selector canónico; solo no viajaba al hallazgo. Una barrera que no se puede localizar no se puede arreglar ni comprobar.

### Y tres fallos de medición dentro de esa misma sonda

Los tres los encontró la sonda al probarla contra el navegador, y los tres estaban en código que llevaba tiempo escrito.

**Lo que «aparece» se comparaba por elemento y rectángulo.** `__visibleHuella()` devuelve `uid@x,y,ancho,alto` y la comparación usaba la cadena entera, así que cualquier reajuste de maquetación contaba como contenido nuevo: al desplegarse una pista, el bloque de debajo baja treinta píxeles, cambia su clave y pasa por «emergente». El viaje del puntero se iba al centro de un bloque desplazado, no al emergente, y de ahí salía un «desaparece al llevar el puntero encima» sobre una pista impecable. Y al revés, y esta era la peligrosa: un emergente que sigue abierto tras el Esc pero se mueve un píxel parecía haberse cerrado, y el criterio lo daba por **descartable sin haber comprobado nada**. Ahora las dos comparaciones van por elemento.

**«¿Se puede señalar?» era aritmética de rectángulos, con un atajo falso.** Valía si el emergente tocaba al disparador o era descendiente suyo. Lo segundo no se sostiene: un globo `position:absolute` colocado 18 px por debajo de su disparador ES descendiente suyo y NO es alcanzable, porque al cruzar el hueco el puntero no está sobre ninguno de los dos, el `:hover` se cae y el globo desaparece antes de que llegue la mano. Es el fallo clásico de 1.4.13 y el atajo lo absolvía. Ahora se viaja de verdad: se mueve el ratón en pasos intermedios y se mira si al llegar sigue ahí.

Escribiendo ese viaje metí uno nuevo, y la sonda me lo enseñó paso a paso: apuntaba al centro del emergente, y una diagonal se sale del disparador por el lado antes de entrar en el emergente. Medido en Chromium sobre un globo que pega perfectamente con su disparador (se tocan en y=36): al tercer paso el puntero iba por (101,34) —a la altura del disparador pero 1 px pasado su borde derecho—, el `:hover` se caía, y un emergente correcto salía como inalcanzable. Una mano no hace eso. Ahora se entra por el punto más cercano al disparador y, ya dentro, se va al centro.

**Y el Esc se probaba antes del viaje, en el orden equivocado.** Hay sitios cuyo manejador de Esc deja el emergente cerrado con una clase; después del Esc ya no se puede volver a abrir, así que «¿se deja señalar?» quedaba sin comprobar justo en los emergentes que se portan bien con el teclado. Ahora el viaje va primero, el emergente se reabre y entonces se prueba Esc sin mover el puntero —que es lo que pide el criterio—, y si no se consigue reabrirlo no se afirma nada: queda sin comprobar, que no es lo mismo que aprobado.

**Lo que queda por decidir no es del agente.** En el sitio real, el emergente que 1.4.13 señala es el submenú desplegable de la navegación: tapa el contenido de debajo y no responde a Esc. Con la excepción ya aplicada, eso sigue siendo una barrera por la lectura estricta del criterio. Es un punto donde la práctica profesional discute, y ahora el informe lleva escritas las tres condiciones y cuál de ellas se ha medido, para poder discrepar sabiendo de qué.

## 2.1.4: de «sin evaluar» a medido, pulsando las teclas

De los siete criterios que no miraba ninguna capa, este era el más fácil de arreglar y el que más claramente estaba mal. Existía un detector, pero solo ve los manejadores **en línea** (`onkeydown="…"`), y hoy nadie los escribe así: un `document.addEventListener('keydown', …)` dentro de un bundle no está en el marcado. Así que en el sitio real no se emitía nada — ni para bien ni para mal.

Lo que sí se puede hacer es lo que hace una persona auditando: poner el foco en el cuerpo del documento, fuera de cualquier campo, pulsar una tecla suelta y mirar si pasa algo. La sonda prueba diez teclas de las que los sitios usan de verdad como atajo global (`/`, `?`, `s`, `f`, `j`, `k`, `n`, `p`, `g`, `1`) y compara antes y después: URL, dónde está el foco, el desplazamiento, cuántos elementos se ven, la longitud del texto y si el cortafuegos abortó alguna petición. El foco se lleva al cuerpo con un `blur()`, no poniéndole `tabindex="-1"` al `<body>`: eso cambiaría la página que se está midiendo.

Y lo que se concluye es exactamente **una** de las tres salidas del criterio: si la tecla actúa con el foco en el cuerpo, el atajo no está limitado a un control. Las otras dos —poder desactivarlo y poder reasignarlo— viven en las preferencias del sitio y no se pueden comprobar desde fuera, así que el veredicto es `revisar` y queda dicho qué tecla hace qué, que es lo que hace falta para ir a buscar el interruptor. Sin ninguna tecla activa el veredicto es `cumple-parcial`, no `cumple`: se han probado diez teclas de las que hay, y decir «no hay atajos de un carácter» con eso sería afirmar más de lo medido.

La fase va con el cortafuegos armado, porque una tecla suelta puede disparar una petición con efecto igual que un clic, y se apaga con `teclas: false`.

### Y 2.2.2 se callaba cuando la página estaba quieta

Lo vio la propia medición: en la tercera pasada contra el sitio real, 2.2.2 salió «sin determinar» en las diez páginas y lo único escrito en el informe era un icono con `fadeInDown` que había visto la capa de CSS. Leyendo eso no hay forma de saber si la observación miró ocho segundos y la página estaba quieta, o si no llegó a correr — y son cosas muy distintas. `analyzeAutoMovement` devolvía lista vacía cuando no encontraba nada, así que el silencio hacía ambiguo el resultado.

Ahora lo dice: `cumple-parcial`, con los segundos que se observó y con lo que queda fuera por haber mirado solo esa ventana — lo que tarde más en arrancar, lo que solo se mueva al interactuar, lo que pase dentro de un marco o un vídeo (que no emiten cambios en este documento) y el movimiento pintado en un `<canvas>`. Si la observación NO corrió o falló, se sigue sin decir nada: un `cumple-parcial` ahí sería afirmar que se miró.

Con eso ya se puede responder a la pregunta que quedaba abierta: en ese sitio **no hay movimiento automático sostenido** que un observador de mutaciones pueda ver, en ninguna de las diez páginas. Comprobado además que la observación funciona dentro de una auditoría completa —con la capa de adaptación por delante, que redimensiona la ventana y le mete CSS— contra un carrusel servido por HTTP: lo caza y lo declara `falla`.

(Escribiendo la sonda metí un `\s` sin doblar dentro de la plantilla que viaja al navegador. El guard de las secuencias colapsadas lo cazó en la primera ejecución de la suite — que es para lo que está.)

## 4.1.3: el mensaje de estado que no es un error de formulario

4.1.3 ya se dictaminaba para un caso —el error de formulario, con el envío forzado y la comparación de las regiones live antes y después—, y en un sitio sin formularios con error eso no emite nada. Pero el criterio cubre mucho más: «información sobre el éxito o el resultado de una acción, el estado de espera, el progreso de un proceso o la existencia de errores». En el sitio real no se dijo ni una palabra de 4.1.3.

El dato sale de los clics que la prueba dinámica ya hacía sobre los `[aria-expanded]`: se censa el texto visible antes y después, separando lo que vive dentro de una región live de lo que vive fuera, y se busca texto que aparezca **en otro sitio de la página** sin que el foco se mueva hasta él y sin que ninguna región de estado cambie. Ese es exactamente el patrón que 4.1.3 prohíbe.

La trampa de esta medición, y lo que la hace utilizable: lo que un control expandible revela **dentro de su propio panel** es contenido por definición, no un mensaje de estado, así que el texto del panel que el control declara con `aria-controls` se descuenta. Sin eso, cualquier acordeón correcto habría salido como barrera. Comprobado contra un navegador de verdad: un acordeón que solo abre su panel no produce ningún candidato; un `3 resultados encontrados` escrito en un `<p>` suelto sí; y el mismo texto dentro de un `role="status"` se cuenta como anunciado.

El veredicto es `revisar` y el motivo es honesto: que ese texto SEA un mensaje de estado —y no un trozo de interfaz que salió a la vez— lo decide alguien leyéndolo. Lo que se afirma es lo observado: apareció, el foco no fue ahí, y ninguna región de estado se enteró. Y cuando sí pasó por una región live, también se dice, porque el acierto medido es información igual que el fallo — la lección de 2.2.2 aplicada antes de tropezar con ella.

## 2.2.1 y el inventario de medios: los cinco que quedaban

**2.2.1 solo miraba el `<meta http-equiv="refresh">`.** Es el fallo de libro del criterio y hoy casi nadie lo usa: medido contra el sitio real, 2.2.1 no emitió nada. El límite de tiempo de verdad lo pone JavaScript —`setTimeout(cerrarSesion, 900000)`— y eso no está en el marcado. Ahora se envuelven `setTimeout` y `setInterval` antes de que la página cargue, igual que ya se hacía con el bloqueo de orientación, y se anota cada llamada con retardo de 20 s o más: el retardo y la línea de pila de donde sale. El umbral son 20 s porque por debajo no hay límite que ajustar, y porque es el que el propio criterio usa para el aviso de prórroga.

El veredicto es `revisar`, y el motivo está en los datos: un temporizador largo puede ser un cierre de sesión —y entonces 2.2.1 exige poder apagarlo, ajustarlo o prorrogarlo— o un sondeo, una baliza de analítica o la caducidad de una caché, que al criterio no le importan. Sin temporizadores largos, `cumple-parcial` diciendo qué queda fuera: lo que se programe después del momento de mirar, lo que imponga el servidor y el `meta refresh`, que se comprueba aparte.

Escribiendo eso metí un fallo que la sonda enseñó a la primera: la procedencia de la llamada se sacaba de la pila filtrando por nombre, y como la envoltura es anónima devolvía **su propio marco** (`at deDonde (<anonymous>:40:29)`) en todos los casos — un dato inútil presentado como la procedencia del temporizador. Lo que distingue los marcos es el origen: el script inyectado no tiene URL y el de la página sí. Ahora apunta a la línea real.

**Y el inventario de medios no era lo que yo creía.** Fui a implementarlo y me encontré con que `page-audit.js` ya emitía 1.2.1, 1.2.2, 1.2.3 y 1.4.2 — estuve a punto de añadir un segundo productor y duplicar cada hallazgo. Lo que había mal era otra cosa, y peor: **dos listas de reproductores**. La de `cuaderno.js` —que decide 1.2.4 y 1.2.5— y otra en `page-audit.js` con nueve dominios occidentales y ninguna plataforma china. Cuando se arregló el inventario para reconocer Youku, Bilibili, iQiyi y compañía, el arreglo entró en el cuaderno y **no** en el otro archivo. Resultado en el sitio real: los mismos reproductores reconocidos para dos criterios y no para los otros tres, y esos tres en blanco. El fallo no era la lista corta: era tener dos listas. Ahora es una, vive en el cuaderno, y hay un test que mete cinco plataformas —cuatro chinas y YouTube— por el ámbito de página y exige que las reconozca.

Con la lista unificada, tres arreglos más en el mismo bloque:

- **Un marco que no se reconoce ya no deja los criterios en blanco.** El cuaderno trataba así los marcos dudosos para 1.2.4 y 1.2.5; `page-audit` no, así que en una página cuyo único medio es un marco desconocido, 1.2.1, 1.2.2 y 1.2.3 no emitían nada. Una fila en blanco no es «no aplica». Un mapa o un captcha siguen sin contar como medio.
- **1.2.3 afirmaba «ni se detecta una alternativa» sin detectar nada.** El criterio se satisface con una alternativa en texto, que no vive dentro del `<video>` sino al lado. Ahora se busca —enlace o bloque, en los mismos idiomas que el léxico de ayuda, chino incluido— y se distingue el vídeo que no tiene nada del que tiene algo que se anuncia como transcripción: son dos sitios muy distintos a los que mandar a quien audita.
- **1.2.1 hace lo mismo con los `<audio>`**: cuántos hay y cuáles tienen una transcripción anunciada al lado.

Ninguno de los cuatro se firma como conforme, y eso no ha cambiado: la fidelidad de unos subtítulos, que una audiodescripción describa lo que hace falta y que una transcripción esté completa son juicios que exigen ver y oír el medio. Lo que cambia es que ahora se sabe sobre qué hay que juzgar.

## La cuarta pasada: tres aciertos y tres silencios

La cuarta ejecución contra el sitio real confirmó lo que se había arreglado y, como siempre, enseñó lo que no.

**Lo que funcionó.** 3.2.4 bajó de 3 filas a **cero** con la identificación por componente, y el criterio pasa a `cumple` — tercer criterio conforme de la muestra, y coincide con el informe hecho a mano. 2.1.4 dictamina (`cumple-parcial`: diez teclas pulsadas, ninguna hace nada con el foco en el cuerpo). 2.2.1 dictamina y encontró algo real: un `setInterval` de 24 horas programado por `gtm.js`. 2.4.11 sigue en 7 filas y 1.4.13 en 14.

**Y tres silencios, los tres de la misma familia.**

El primero: **2.2.1 señalaba a Google Tag Manager sin decir que era Google Tag Manager.** La fila es correcta —el temporizador se programó, y eso es lo que se afirma— pero obligaba a ir a mirar un bundle de terceros para descartarla. Ahora, cuando la pila apunta a una etiqueta de analítica conocida, se dice: la fila no se esconde, se vuelve descartable de un vistazo.

El segundo: **1.2.2 apareció y 1.2.1 y 1.2.3 siguieron en blanco**, por la misma página y el mismo marco dudoso — cuyo texto de evidencia dice literalmente «1.2.1, 1.2.2 y 1.2.3 aplican». La nota se emitía solo bajo 1.2.2. Ahora va bajo los tres, que es lo que su propio texto promete.

El tercero lo resolvió una medición en el navegador, y es el más instructivo: **la página de vídeos del sitio no tiene ni un `<video>` ni un `<iframe>`.** Los vídeos son enlaces `a.swipebox-video` a un `vod-player.html` de Tencent Cloud VOD que se abren en una caja de luz al pulsarlos. En el DOM no hay ningún medio hasta que alguien hace clic, así que los cuatro criterios de medios salían en blanco **justo en la página que más medios tiene de toda la muestra**. El inventario mira ahora también los enlaces cuyo destino es un reproductor reconocido o un archivo de medios por extensión (`.mp4`, `.m3u8`, `.mp3`…), y la lista de plataformas incluye el reproductor de Tencent. Un enlace a una página que lleve «video» en la ruta sigue sin contar: eso es adivinar.

Y 4.1.3 se callaba por el mismo motivo: esa página no tiene **ni un** `[aria-expanded]`, así que la fase no pulsó nada, no hubo candidatos, y el criterio salió en blanco. Ahora lo dice, y añade el dato que de verdad orienta: cuántas regiones de estado declara la página. Cero regiones en un sitio con filtros y formularios no es un veredicto, pero es una pista fuerte, y ahora está escrita.

Tres veces el mismo defecto —2.2.2, los medios, 4.1.3— y la misma lección: **el silencio y la conformidad se parecen demasiado en un informe.** Cuando una capa no llega a mirar, lo que hay que emitir no es nada: es qué no se miró y por qué.

## La quinta pasada: 55 de 55 con veredicto

Las tres predicciones se cumplieron. **1.2.1, 1.2.2 y 1.2.3** traen ahora filas de `videos.html` nombrando los **26 enlaces** al reproductor de Tencent — la página que salía en blanco es la que más evidencia de medios tiene de toda la muestra. **4.1.3** sale en las diez páginas diciendo que no hay controles expandibles que pulsar ni ninguna región de estado declarada. **3.2.4** sigue en cero y los catorce criterios que fallan siguen siendo los mismos catorce.

Y la pasada dejó ver la última fila en blanco de todas: **de los 55 subcriterios, 54 tenían veredicto y uno no — 1.4.2**. Por el mismo motivo que los anteriores: solo hablaba al encontrar un medio con `autoplay`, y este sitio no tiene ni un `<video>` ni un `<audio>` en el DOM. El criterio sí se puede acotar, porque lo que prohíbe es el audio que arranca **solo al cargar**: un medio que se abre al pulsarlo no es automático. Ahora dice eso, y añade lo único que de verdad hay que ir a comprobar —varios de esos enlaces llevan `autoplay` en la URL, así que el audio puede empezar solo en cuanto se abre la caja de luz, y ahí sí importa si el reproductor tiene controles alcanzables—. Con medios propios y ninguno con `autoplay` sin silenciar, también lo dice, en vez de callarse.

Y una fuga de información en el propio entregable: el JSON guardaba **solo la primera línea** de la evidencia de cada criterio a revisar. Varias capas ponen en la segunda y la tercera justo lo que permite cerrarlo —el arreglo concreto, lo que queda fuera de la medición, o que un temporizador largo sale de una etiqueta de analítica y se puede descartar—. Nada de eso llegaba al informe: el dato existía en el motor y no en el papel. Ahora van las cuatro primeras líneas, y los `cumple-parcial` también, que son los que dicen qué se midió y hasta dónde.

Cinco pasadas contra el mismo sitio: **802 → 715 → 519 → 522 → 523 filas**, de 36 a 55 subcriterios con veredicto, y la cuenta de criterios que fallan bajando de 15 a 14 solo porque uno de ellos (3.2.4) resultó no ser una barrera. Lo que ha cambiado no es que el agente encuentre más: es que ya no afirma menos de lo que sabe ni más de lo que ha medido.

### Lo que sigue pendiente

- **La lista de los siete criterios sin medir está cerrada.** 2.1.4, 4.1.3, 2.2.1, 1.2.1, 1.2.2, 1.2.3 y 1.4.2 se miden ya, cada uno hasta donde se puede medir y diciendo qué queda fuera. Lo que no se puede automatizar sigue sin automatizarse, pero ahora está nombrado en el informe en vez de salir en blanco.
- **La transcripción real de NVDA en español** — la inglesa ya está archivada (`test/fixtures/nvda-en-real.json`, capturada en Actions sobre `windows-latest`) y verifica el mecanismo y el léxico inglés. El runner de GitHub no tiene voz española («Spanish (not supported)»), así que los cinco tests del léxico español siguen escritos y saltándose. Es lo único que queda de la lista.

## La revisión final: siete sitios donde el silencio se leía como conformidad

La revisión completa del agente, hecha al revés de las anteriores: en vez de buscar criterios sin medir, buscar **afirmaciones que el agente no puede sostener**. Cada hallazgo se comprobó ejecutando el código —con un control A/B cuando se podía montar— antes de tocar nada, y de los doce candidatos que salieron de la revisión, siete eran defectos reales.

**El velo de la opacidad.** Un control A/B sobre cuatro fixtures en Chromium: la misma página, cambiando una sola propiedad CSS. Un emergente con `opacity:0 → 1` no se observaba nunca (un disparador, cero *hovers*), así que **1.4.13** salía `cumple`; y un bloque recortado con `opacity:0` inventaba una **falla grave de 1.4.10** sobre 564 px que nadie puede ver. El mismo marcado con `display:none` o `visibility:hidden` se comportaba bien. Había tres nociones distintas de «pintado» repartidas por tres capas, y ninguna miraba la opacidad **acumulada** de los antepasados. Ahora hay una (`__opacidadAcum`), la usan las tres, y después del arreglo 1.4.13 dice `falla/grave` donde debía y la falla inventada de 1.4.10 desaparece — mientras la que era verdadera (`scrollWidth 351 > clientWidth 320`) sigue ahí.

**Lo oculto no es lo que no existe.** El mismo formulario de acceso daba veredicto pendiente visible y `no-aplica` metido en un `display:none`; el mismo vídeo, igual con 1.2.4 y 1.2.5. Y el daño era doble, porque el cuaderno sustituye el `humano` conservador del motor por su `no-aplica`: el criterio pasaba de «pendiente de persona» a «fuera de alcance». Ahora, antes de firmar «no viene al caso», se hace el censo de los candidatos **ocultos** de la familia del criterio — y solo cuando no hay ninguno visible, porque 3.3.7 no aplica a un formulario de un campo por razones que no tienen que ver con que falten campos, y meter el censo ahí cambiaría un «no aplica» correcto por una duda inventada.

**El CSS que no se puede leer.** Una hoja de otro origen lanza al tocar `cssRules`, y eso se descartaba en silencio en dos sitios. En el cuaderno, **2.3.1** afirmaba que no hay nada que pueda destellar sobre un CSS que no había leído; en el rastreo de orientación, **1.3.4** decía literalmente «y no hay bloqueo de orientación» con la búsqueda de `@media (orientation:…)` a medias. Las dos cuentan ya las hojas ilegibles y ninguna declara conformidad mientras quede alguna sin leer. Comprobado con dos páginas idénticas servidas desde dos puertos: la que enlaza la hoja desde otro origen —y que de verdad esconde texto en vertical— pasa de `cumple` a `revisar`; la que la lleva en línea sigue en `cumple`.

**Las notas de cobertura que no ataban nada.** La medición emite avisos cuando sabe que no ha llegado a mirar todo: un velo a pantalla completa, un *shadow DOM* cerrado, un marco que no se ha podido medir, el límite de bloques de texto, el límite de controles, la ventana sin el foco del sistema. Esos avisos viajaban a la prosa del final del informe y **no tocaban ningún veredicto**: 2.4.3 podía salir `pasa` habiendo medido 20 de 500 controles, con el aviso que lo decía a cuatro páginas de distancia. Y era una incoherencia dentro del propio agente, porque la capa de adaptación sí bajaba a `revisar` cuando su medición estaba recortada. Ahora cada nota que acredita algo NO MIRADO declara **qué criterios limita** y `aplicaCoberturas` los ata: con tope 20 sobre una página de 200 botones, nada llega a `pasa`; con tope 400 —cobertura completa— la misma página vuelve a salir conforme. Lo que no se toca: una barrera encontrada en la parte medida sigue siendo una barrera, y un `no-aplica` también, que habla de lo que hay en la página y no de lo que se midió en ella.

**Cuatro conformidades del motor que no eran conformidades.** Un `<div tabindex="0" onclick="…">` **sin rol** salía `2.1.1 cumple`: la comprobación de «recibir el foco no es ser operable» estaba atada a la lista de roles ARIA, así que el caso más vulgar de la web se escapaba entero — y es el peor de los dos, porque con `role="button"` al menos se anuncia como botón. Una **tabla de datos sin ningún `<th>`** salía `1.3.1 cumple` → «Correcto» en el IRA, y una tabla correcta no salía en absoluto. Una página en **inglés con `lang="es"`** salía `3.1.1 cumple`: el atributo estaba bien escrito, que es lo único que se comprobaba, y 3.1.1 no pide eso. Y la tabla de estados requeridos de ARIA tenía la familia de `aria-checked` y poco más, así que un `role="slider"` **sin `aria-valuenow`** —un deslizador que no dice en qué valor está— salía `4.1.2 cumple`.

La tabla de estados se reescribió contra la especificación, no de memoria: los doce roles de «Required States and Properties» de WAI-ARIA 1.2 §5.2.2, comprobados en el texto normativo y contra `aria-query` 5.3.2. Lo que la especificación **no** exige tampoco se exige: `spinbutton`, `tab` y `progressbar` se quedan fuera (en `progressbar`, la ausencia de `aria-valuenow` es justamente cómo se expresa el progreso indeterminado), y `treeitem` va como sospecha porque la guía de patrones admite omitirlo en un árbol de selección única. `combobox` y `scrollbar` exigen **dos** cosas cada uno, y con un solo campo de texto se comprobaba una y se callaba la otra.

Y por el camino, leyendo la especificación para eso, apareció un **falso positivo grave que el agente llevaba dentro**: `role="presentation"` **se hereda** a los descendientes estructurales obligatorios («the implicit native semantics of an HTML table element's thead/tbody/tfoot/tr/th/td descendants will also be removed»). El motor quitaba el rol de la tabla y dejaba los `<tr>` como `row` sin tabla donde vivir, así que **el marcado recomendado para una tabla de maquetación daba una falla grave de 1.3.1 por «row huérfano»**. Duele especialmente porque el mensaje nuevo de la tabla sin encabezados dice, textualmente, que uses `role="presentation"`.

**Tres fugas en el entregable.** La nota instrumental de las sondas de píxeles se colaba como una fila de `1.4.3 revisar` entre las barreras de contraste de verdad. La hoja de **Seguimiento** exportaba «Correcto» sin decir en ninguna parte que tres de las diez páginas no se habían analizado — ahora la cobertura va en su propia columna y, con la muestra incompleta, la conformidad se queda en «No se puede comprobar» con el motivo dentro; la barrera y el «no aplica» no se tocan. Y el rollup **reventaba con un `TypeError`** si la muestra traía un hueco (`[pagina, null]`, que es lo que deja un fallo de carga en algunos orquestadores): un informe que no se genera es peor que un informe incompleto. Sobre una muestra **vacía** decía «Sin barreras deterministas en la muestra» — la frase más tranquilizadora del informe, dicha sobre cero páginas.

Son **598 tests unitarios** (de 579) y 127 de integración, todos en verde, con los diecisiete nuevos escritos para que cada una de estas honestidades no se pueda perder en silencio.

### Y la comprobación de que todo el agente funciona, que encontró cuatro cosas más

Terminada la revisión, la pregunta siguiente no era si el código compila sino si **el agente entero hace lo que dice**. Se montó un sitio local de cinco páginas con barreras plantadas a propósito —una imagen sin alternativa, texto gris sobre blanco, una tabla de datos sin encabezados, un vídeo sin subtítulos, un `div` con `onclick` y sin rol, un `role="slider"` sin valor, un botón vacío— y además una tabla de maquetación correctamente marcada con `role="presentation"`, que es el falso positivo recién arreglado. Se auditó con la CLI completa, las nueve capas, y se comprobó fila por fila: **las dieciséis filas de barreras son ciertas, están todas las plantadas, y la tabla de presentación no genera ninguna**.

Pero la prueba encontró cuatro cosas que las suites no veían:

**Una atadura demasiado severa, mía y de ese mismo día.** La nota «Marcos: se auditan aparte» salta con cualquier `iframe` pintado, y le había puesto `limita`. Un A/B con la misma página —sin marco, con marco del mismo origen, con marco de otro origen— lo dejó claro: el orquestador de Node entra en cada marco con Playwright, **también en los de otro origen**, y los mide (cinco hallazgos medidos dentro del marco, en los dos casos). Así que un solo reproductor incrustado tumbaba 1.4.3, 1.4.11, 2.4.7, 2.5.8 y 2.1.1 de `pasa` a `revisar` con el marco medido entero. Eso no es prudencia: es ruido, y el ruido tapa barreras igual que el silencio. La nota volvió a ser informativa; lo que ata es «Marco no medible», que se emite exactamente cuando un marco no se ha podido mirar. Un test sobre la fuente inyectada fija ahora qué notas pueden llevar `limita` y cuál no.

**Un campo obligatorio no es un campo en error.** `analyzeErrorState` decidía con `f.required || f.invalid`, y `invalid` mira solo `aria-invalid`. O sea: «obligatorio» se usaba como sustituto de «habrá fallado la validación», y en cuanto el campo está relleno eso es falso — un `required` correcto producía `3.3.1 falla grave` y, de paso, un `4.1.2 revisar` reclamándole `aria-invalid` a un campo sin ningún error que exponer. Ahora el error lo acredita quien lo sabe: `aria-invalid`, o la validez **nativa** que el navegador acaba de decidir al enviar (`checkValidity()`, que no tiene efectos secundarios y funciona incluso con `novalidate` puesto, comprobado en Chromium). Se mantiene «obligatorio y vacío» como respaldo para los rastreos que no traen esa señal. **Honestidad sobre el alcance:** en la tubería de Node este falso positivo no estaba produciendo filas falsas, porque el driver vacía el formulario a propósito antes de enviar y ahí «obligatorio» coincidía con «en error»; el defecto estaba en la lógica de una función exportada, alcanzable desde la extensión o desde cualquier otro productor de trazas.

**Dos criterios que salían «No evaluado».** En la hoja de seguimiento de esa auditoría, **2.4.11 y 3.1.2** no se pronunciaban. Los dos por la misma razón: solo hablaban al encontrar algo. 2.4.11 emitía fila cuando algo tapaba el foco, así que una página sin barras fijas dejaba el criterio en blanco — cuando lo que había pasado es que se había recorrido cada control enfocable contra cada elemento superpuesto, en las dos direcciones de tabulación, y estaba bien. Ahora lo dice, con el recuento y las rutas comprobadas, y dice `revisar` —no `pasa`— cuando no hay ningún control sobre el que medir. 3.1.2 igual: en una página de un solo idioma no emitía nada, y ahora emite `cumple-parcial` nombrando cuántos bloques revisó, cuántos ya declaran su idioma, y el límite real de la detección (cinco idiomas, unas 25 palabras: una cita corta o un término extranjero suelto no los ve). Con eso, la auditoría del sitio de prueba cierra **55 de 55 subcriterios con veredicto, cero «No evaluado»**.

Tres tests existentes afirmaban justo ese silencio (`assert.deepEqual(…, [])` sobre 2.4.11 y 3.1.2). Reescritos: lo que defendían era que no se inventara una barrera, no que el criterio se callara, y eso se sigue defendiendo —comprobando además el veredicto positivo—. Al final: **605 unitarios y 129 de integración**, todos en verde.

### v0.38.0 — las mejoras que quedaban, incluidas dos que el propio agente escondía

Hecho el inventario de lo que faltaba, se atacó entero. Cinco cosas, y dos de ellas resultaron ser peores de lo que parecían desde fuera.

**El velo translúcido ataba como uno opaco.** La nota del velo —mía, de la ronda anterior— limitaba los mismos ocho criterios con opacidad 0,30 que con 0,97, mientras el texto que iba al lado decía lo contrario: «es translúcido, así que la página se ve a través y la medición sirve». Un velo opaco invalida todo lo medido; uno translúcido deja intacta la geometría —tamaños de objetivo, foco, orden de tabulación— y solo pone en duda el **color**, porque se compone encima. Comprobado con la misma página y dos opacidades: la translúcida tumba 1.4.3 y 1.4.11 y deja pasar 2.4.7, 2.5.8 y 2.1.1; la opaca tumba los ocho.

**El shadow DOM cerrado, preguntado en vez de adivinado.** La heurística inyectada exige un guion en el nombre de la etiqueta —un elemento personalizado—, así que un `<div>` con un root cerrado no se detectaba, no se emitía la nota y los criterios no quedaban atados sobre contenido que nadie había podido mirar: la dirección peligrosa del error. Resulta que el navegador sí lo sabe: `DOM.getDocument` con `pierce` devuelve los shadow roots con su tipo, cerrados incluidos. Ahora el orquestador se lo pregunta por CDP, y lo que diga manda sobre la aproximación; el censo trae además la ruta canónica de cada anfitrión, resuelta en la página. Con un `div` y un elemento personalizado, los dos con root cerrado, los encuentra los dos; en una página limpia no inventa ninguno. Sin CDP (otro navegador, página cerrada) se queda la heurística y no se pierde nada.

**El agente se acusaba a sí mismo.** La extensión busca llamadas a `screen.orientation.lock()` entre los `script` en línea de la página para 1.3.4 — y su propio núcleo inyectado lleva esa cadena dentro de los textos de evidencia de esa misma función. Medido: cuatro páginas limpias salían las cuatro con **falla grave**. Peor aún, el fallo estaba fosilizado en la suite: un test de integración llevaba semanas en verde afirmando `fallan.has("1.3.4")` sobre un fixture que no tiene **un solo script en línea**. Dos arreglos, y el segundo importa más que el primero: el núcleo generado lleva ahora una marca literal que el analizador reconoce para no leerse a sí mismo; y, sobre todo, **encontrar la llamada escrita no es haberla visto ocurrir**. `bloqueoJS` significa que la API envuelta registró la llamada; la extensión pasaba ahí el resultado de una búsqueda de texto. Ahora va como `enScriptEnLinea` y se emite `revisar` diciendo que puede estar bajo una condición que no se cumplió, en código muerto o dentro de una cadena. De paso, la extensión dejó de pasar `mediaBloqueante: []` escrito a mano: recorre el CSSOM de verdad y cuenta las hojas de otro origen que no puede leer.

**Cada fila del informe con la evidencia de su elemento.** Un hallazgo con N elementos produce N filas en la hoja de Barreras, y las N salían con la **unión** de los mensajes del criterio: la fila de un `role="slider"` arrastraba lo del `div` con `onclick` y lo del botón vacío. No era falso —cada mensaje lleva delante el elemento del que habla— pero filtrar una fila a lo suyo no se podía. La evidencia viaja ahora pegada a su nodo desde el motor, y lo que no se puede atribuir a un elemento (una observación estructural del documento) acompaña a todas las filas, que es donde corresponde.

**El perfil de idioma, con las lenguas cooficiales.** 3.1.1 y 3.1.2 distinguían cinco idiomas —castellano, inglés, francés, portugués y gallego— mientras los léxicos de coherencia ya cubrían catalán, euskera y chino. En un país con cuatro lenguas oficiales eso no es un detalle de cobertura. Se añadieron catalán y euskera (el vasco es aglutinante: su perfil son marcas de caso y auxiliares, no artículos), y con ellos salieron dos problemas de método. El primero: contando todas las palabras igual, el castellano sacaba un 27 % sobre un texto catalán y le ganaba a su propio idioma, así que **una página catalana correcta no podía confirmarse nunca**. Ahora cada palabra pesa por lo que distingue: una que está en N léxicos vale 1/N. El segundo era de planteamiento: 3.1.1 no pregunta «¿qué idioma es?» sino «¿encaja el declarado?», y se estaba respondiendo a la primera. Reformulado, la matriz de 7×7 idiomas queda con la diagonal confirmada, **cero casillas declarando conformidad sobre un idioma equivocado**, y los dos empates reales —castellano/catalán y gallego/portugués— emitiendo `cumple-parcial` que nombra el empate y pide confirmarlo a ojo, en las dos direcciones: ni se firma una página catalana etiquetada como `lang="es"`, ni se acusa a una correcta.

**612 tests unitarios** (de 605) y **130 de integración**, en verde, y la auditoría del sitio de prueba sigue cerrando 55 de 55 subcriterios con veredicto y las mismas 16 barreras ciertas.

### v0.39.0 — los criterios de sitio, que nadie había revisado

Quedaban módulos sin pasar por la revisión, y los de más riesgo eran los criterios de SITIO: 2.4.5, 3.2.3, 3.2.4 y 3.2.6 se dictaminan comparando las páginas de la muestra entre sí, y un error ahí no se ve en ninguna página sino en el informe entero. Se revisaron `coherence.js` y `axe-cross.js` con el mismo método: un informe de candidatos y después la comprobación ejecutando cada uno. **Diez defectos confirmados.** Cuatro inventaban barreras sobre marcado correcto, cuatro declaraban conformidad sobre lo que no se había comparado, y dos eran afirmaciones imposibles de sostener en el cruce con axe.

**Las migas de pan hacían fallar 3.2.3.** La secuencia de navegación concatenaba todos los `nav` de la página en una sola lista, así que unas migas que repiten destinos del menú en otro orden —«Inicio → Servicios» frente a «Inicio → Blog → Servicios»— producían un `falla` diciendo que «el orden de la navegación cambia» en una página donde el menú es idéntico. Es el patrón más común de la web. Ahora cada navegación se compara con la SUYA, emparejada por su etiqueta accesible (que es justo lo que distingue «Principal» de «Migas de pan») o por su selector; y si no se puede emparejar ninguna, el criterio lo dice en vez de firmar que el orden se mantiene.

**Un tercer nombre enterraba la incoherencia del menú.** 3.2.4 descartaba un destino cuando dos de sus nombres «convivían» en alguna página —dos componentes distintos, no una identificación incoherente— pero preguntaba eso del grupo entero. Medido: un menú que llama «Servicios» a una página y «Nuestros servicios» en otra se detecta bien… hasta que una de ellas añade una tarjeta «Leer más» al mismo destino. La tarjeta convive con el nombre del menú, el grupo se descartaba completo, y el criterio pasaba de `revisar` a **`cumple`**. Añadir una tarjeta no arregla un menú incoherente. Ahora convivir acredita que ESE nombre es de otro componente y lo saca del grupo; lo que queda es el componente que se repite entre páginas, comparado consigo mismo. Y cuando la página tiene landmarks se usa la región de cada nombre, que separa el menú de la tarjeta sin ambigüedad.

**La clase que marca el ítem actual partía el componente.** Casi todos los menús marcan la página actual con una clase, así que el mismo enlace es `a.nav-link.active` en su propia página y `a.nav-link` en las demás. Con esa clase dentro de la identidad del componente, el grupo se partía en dos, ninguna mitad llegaba a dos páginas, y 3.2.4 emitía **«Ningún destino se repite entre las páginas de la muestra»** —literalmente falso— perdiendo la incoherencia real. Las clases de estado (`active`, `current`, `is-active`, `nav-item--current`, `seleccionado`…) ya no cuentan para la identidad.

**Tres maneras de inventar un fallo de 3.2.6.** La huella guardaba solo la PRIMERA aparición de cada tipo de ayuda, así que una página con «Contacto» en la cabecera y en el pie frente a otra que solo lo tiene en el pie daba `falla` — y el del pie no se ha movido. La clasificación probaba el patrón contra el `href` entero, así que `<a href="/contacto/empleo">Trabaja con nosotros</a>` quedaba registrado como mecanismo de «contacto» y después se le acusaba de cambiar de sitio; ahora manda el nombre accesible y el destino solo corrobora cuando el enlace no tiene nombre, y solo en el último tramo de la ruta. Y la comprobación era «¿aparece en más de una región?», cuando lo que contradice al criterio es que no quede un sitio COMÚN a todas las páginas que lo ofrecen: un `<nav>` suelto frente a un `<header><nav>` ya no es una barrera, sino un `revisar` que dice que esa región el marcado no la resuelve.

**2.4.5 firmaba «el sitio ofrece dos vías» sobre un `div` vacío.** Bastaba un `[role=search]` sin un solo control, o un `<form>` vacío cuyo `action` llevara la palabra «buscar», para contar un buscador; un enlace a `sitemap.xml` —que es para las máquinas— contaba como mapa web; y un «Índice» que apunta a un ancla de la propia página contaba como índice del sitio. Las cuatro señales se endurecieron (un buscador es un campo donde escribir), y el veredicto bajó de `cumple` a **`cumple-parcial`**: lo detectado es la presencia de los mecanismos en el marcado, y que funcionen —que el buscador encuentre, que el menú lleve a todas las páginas, que es lo que piden G126 y G185— no se ve en el marcado y no se ha comprobado.

**Y los cuatro criterios desaparecían del informe sin una palabra** cuando la capa de huella se cae en todas las páginas o está apagada: `analyzeCoherence` devolvía una lista vacía. El export OAW los rescataba como «No evaluado» porque pide los 55 criterios, pero la CLI, la extensión y el rollup de la muestra no veían nada. Ahora dicen que no se han comparado y por qué.

**En el cruce con axe, dos afirmaciones que no se podían sostener.** `crossCheck` fabricaba `{findings: []}` cuando el motor no llegaba a construir el modelo —texto suelto, un comentario, una cadena vacía—, y ese resultado entraba en la reconciliación como una comprobación limpia: «soloMotor: 0» era indistinguible de «el motor comprobó y no encontró nada». Y el «acuerdo» se construía solo porque coincidía el número de criterio: el motor acusando a `img.logo` y axe a otro `img` de la página salían como «acuerdo: 1». Casar los elementos exige la página abierta —lo hace la orquestación, no la reconciliación pura—, así que ahora se publica cuántos elementos trae cada fuente, que la coincidencia a nivel de elemento NO está comprobada, y que el motor no miró cuando no miró.

**620 tests unitarios** (de 612) y **130 de integración**, en verde, con dieciséis nuevos para los diez defectos. Siete tests existentes afirmaban el comportamiento viejo —incluido uno que exigía `analyzeCoherence([]) === []`, es decir, el silencio— y se reescribieron conservando lo que de verdad defendían.

### v0.56.0 — 209 filas que no se podían distinguir de la de al lado

La v0.55.0 arregló esto en la capa de adaptación y **se dejó 18 filas allí mismo**. La predicción que te di —«de 353 bajará a 302»— salió mal: quedaron 320. Y al ir a ver por qué, lo que apareció fue que el arreglo estaba en el sitio equivocado.

**El problema, medido bien.** Con la medida estricta —misma página, mismo criterio, mismo **elemento** y mismo párrafo— eran **209 de 522 filas**, no 353: la cifra anterior contaba filas que la columna «Elemento» ya distinguía. Y no es un error de medición: son elementos distintos y la frase es verdad en todos. Lo que pasa es que la frase no los separa. 63 enlaces `a.red-link` con el mismo color dan 63 veces «ratio 3.38:1 … rgb(231 30 15) sobre rgb(28 36 55)»; los 63 que caza axe dan 63 veces «Links must have discernible text». En el Word eso son 63 párrafos iguales, y quien lee uno no sabe cuál de los 63 elementos es el suyo.

**Y por qué la capa era el sitio equivocado.** En la de adaptación quedaron 18 filas igualmente, porque dos elementos pueden compartir `locator` y medida: «p» más «96 px de alto ocultos» produce la misma frase para dos párrafos distintos. Arreglarlo capa por capa habría pedido el mismo parche en la medición, en el motor, en axe y en el cuaderno. El sitio donde se resuelve de una vez es **donde nacen las filas**, en `report-oaw`: ahí están todas, vengan de donde vengan.

**La regla, y lo que deliberadamente no hace.** Cuando dos filas de la misma página y criterio quedarían con el mismo elemento y el mismo párrafo, cada una añade el selector de **su** elemento y el recuento del grupo. Y solo entonces: si la columna «Elemento» ya las separa —las filas de axe traen el atributo que falta, `a[alt="…"]`—, el párrafo **no se toca**, porque añadirle una cola sería repetir una columna que el informe ya lleva. Una fila sola nunca se adorna.

**Medido sobre las 522 filas reales de la pasada v7 del sitio**, aplicando la regla a los datos de verdad y no a un test: **209 → 0**, 36 grupos tocados, 245 filas reescritas.

**Y un medidor para que esto no vuelva a dependerme.** `scripts/medir-informe.mjs antes.json despues.json` cuenta las cuatro cosas que un veredicto no dice —filas sin selector, filas indistinguibles, avisos de CSS ilegible y barreras con identidad propia— y avisa si alguna ha **empeorado**. Las barreras pueden estar bien encontradas y el informe ser malo de usar; eso ahora se mide.

Lo que sigue sin arreglar y conviene decir: que 63 elementos con la misma barrera salgan como 63 filas en vez de una familia con 63 instancias es una decisión del formato del entregable, no del motor, y no la toco sin que la tome una persona.

**743 tests unitarios** (de 739) y 169 de integración, en verde.

### v0.55.0 — las tres de la lista: el selector, la evidencia repetida y las hojas del CDN

Tres cosas que no eran huecos de criterio sino del informe y de la cobertura, y las tres salieron midiendo una auditoría real de diez páginas.

**El selector que estaba calculado y no salía del fichero.** De 522 filas, **62 —el 12 %— tenían la columna «Selector» vacía**, todas de la capa de adaptación (1.4.4, 1.4.10, 1.4.12). Y la ruta canónica ya estaba ahí: `__caja` guarda `uid:__uid(el)`, con la misma forma que usa la capa de medición, y se usaba solo para emparejar el antes con el después. Eso tenía dos consecuencias que se notan: la guía de capturas resalta el elemento **por selector**, así que esas 62 barreras no podían llevar evidencia visual; y el cotejo entre dos pasadas identifica la barrera por criterio, página y selector, con lo que diez filas de una misma página se fundían en una. No había que calcular nada nuevo: solo dejar de tirarlo. Medido con dos tarjetas idénticas —el caso que el `locator` no puede distinguir, las dos son `div.card`—: ahora salen con `div:nth-of-type(1)` y `div:nth-of-type(2)`.

**Y cada fila con la evidencia de su elemento.** Las N filas de un hallazgo llevaban todas el mismo párrafo: la lista completa de los bloques afectados, repetida fila a fila. En la auditoría real eran cinco filas de 1.4.13 con el mismo «5 contenido(s) emergente(s) incumplen: …» con los cinco listados dentro, y las de 1.4.4 con la lista de los quince bloques en cada una. `report-oaw` ya sabía hacerlo bien —si el nodo trae su propio `evid`, la fila lleva ese—; esta capa no lo rellenaba. Ahora cada fila dice lo que le pasa a **ese** elemento, y el recuento se queda en el hallazgo, que es su sitio.

**Las hojas de estilo de otro origen, traídas.** `hoja.cssRules` lanza en una hoja servida desde otro dominio, y lo único que se hacía era contarla: cada pasada dejaba una nota de cobertura que **limita cuatro criterios** —2.3.1, 1.3.4, 1.4.1 y 2.4.7—, de modo que ninguno de los cuatro podía declararse conforme. En el sitio real eso fueron **93, 225 y 41 mediciones** en tres páginas distintas: el agente se negaba a firmar por una limitación que tenía arreglo. Y lo tiene, porque la CORS es del navegador **dentro** de la página, no de Playwright: se piden los ficheros desde fuera y se le pasan al documento.

Lo que importa de cómo se hace: **no se inyectan en la página**. Un `<style>` añadido duplicaría reglas y movería la cascada, y entonces lo medido ya no sería lo que ve el usuario. Se montan como `CSSStyleSheet` sueltas —`replaceSync`, sin adoptar— y la medición las consulta aparte. Hay un test que lo vigila con dos servidores de verdad: la geometría idéntica, `adoptedStyleSheets` en cero y ningún `<style>` nuevo. Es apagable (`hojasExternas: false`), solo se piden URLs que la propia página declara en `styleSheets[].href` y solo por http(s) — ficheros que el navegador ya descargó para pintar, así que no se abre ningún destino nuevo.

**Y lo honesto sobre el alcance:** lo medido es que la nota de cobertura desaparece, no que cambie ningún veredicto. Lo intenté de dos maneras —con foco de documento y sin él— y la vía del render encontraba el indicador igual, porque `el.focus()` cambia el estilo computado aunque el documento no tenga el foco. El CSS es la vía de respaldo; lo que se gana es que cuatro criterios dejen de estar marcados como «medición incompleta» en cada página con un CDN. La capa de viewport tiene su propia pasada y todavía no rescata nada: eso queda pendiente y dicho.

**Dos errores propios por el camino, los dos encontrados por la suite de integración.** `hojasLegibles` se llamaba desde el navegador y no estaba en la lista `FNS` que se inyecta: `ReferenceError` que ni el módulo cargando ni la suite pura ven, y que tapaba el canal de errores de la capa. Hay ahora un guardián estático que lo caza antes: si el cuerpo inyectado **llama** a una función que el módulo define, esa función tiene que estar también inyectada (comprobado poniéndolo rojo a propósito). Y el rescate, al colocarse por delante de todo lo que lee el CSSOM, quedó por encima de la declaración de `errores`: su rama de error —justo la que no puede romperse— lanzaba `Cannot access 'errores' before initialization`. Lo cazó el test de «una fase caída no hace desaparecer criterios del informe».

**739 tests unitarios** (de 738) y 169 de integración (de 162), en verde.

### v0.54.0 — «candidato a falso positivo» y «nadie lo ha mirado» no son lo mismo

Con la hoja de seguimiento de una auditoría humana delante, el modo `--referencia` quedó en evidencia. Lee una **lista de barreras**, y una lista de barreras no puede decir lo único que de verdad hace falta saber. La hoja traía cuatro criterios con hallazgos, el agente denunciaba catorce, y el informe sacó «**SOLO EL AGENTE · 10 — candidatos a falso positivo**». Era falso: de esos diez, **nueve estaban sin evaluar** en la hoja y **uno estaba marcado como que cumple**. Son dos cosas distintísimas —de la primera no se concluye nada sobre precisión, y la segunda es el único desacuerdo real de todo el libro— y meterlas en el mismo montón es exactamente la forma de no mirar la que importaba.

Una hoja de seguimiento sí lo distingue, porque tiene vocabulario para ello: una matriz de criterios por páginas donde cada celda dice cumple, falla, no aplica, o que todavía nadie lo ha visto. Así que hay un modo nuevo, `--seguimiento hoja.xlsx`, que **lee el `.xlsx` directamente** y parte el cotejo en los cuatro montones que exigen cuatro reacciones distintas:

- **Se le escapan** — la persona lo denuncia y el agente no. Lo más grave que puede salir, y va primero.
- **Candidatos a falso positivo** — la persona dice que **cumple** y el agente lo denuncia. Estos sí hay que ir a verlos.
- **Desacuerdo de aplicabilidad** — la persona dice «no aplica» y el agente denuncia. Un «no aplica» saca el criterio del informe sin que nadie lo mire; si el agente tiene razón, ese cierre es el que hay que deshacer.
- **El agente va por delante** — la persona no lo ha mirado todavía. De aquí no se concluye nada.

Y al final, **la cuenta tiene que cerrar**: una línea suma los montones y los compara con los criterios de la hoja, porque un criterio que no aparezca en ninguno sería un criterio del que no se está diciendo nada.

**El `.xlsx` se lee sin dependencias** (`scripts/xlsx-min.mjs`): un `.xlsx` es un ZIP con XML dentro, y para leer celdas de texto hace falta el directorio central del ZIP, el `inflateRaw` que ya trae Node, la tabla de cadenas compartidas y el XML de la hoja. Unas cien líneas, y el lector dice por escrito lo que **no** hace: no evalúa fórmulas, no entiende formatos de fecha y no mira colores ni celdas combinadas. Comprobado contra el libro real de una auditoría —seis pestañas, 1006 filas, celdas desplazadas— celda por celda contra lo que leía `openpyxl`.

**Tres cosas que la hoja real enseñó por el camino.** La columna de criterios y las de páginas **se localizan solas**, por contenido: nada que configurar. El primer umbral pedía dos veredictos por columna y se cargaba las hojas pequeñas, donde una columna legítima tiene uno. Un valor que no esté en el vocabulario **se dice** en vez de darse por «sin mirar», porque así un error de escritura se convertiría en silencio — pero el aviso solo mira dentro de las columnas de veredictos, que si no saltaba por «A», «AA» y «Obligatorio», y un aviso que salta donde no hay nada enseña a no leer los avisos. Y una columna que **mezcla** veredictos con otra cosa se señala: en la hoja real era una fila en la que el veredicto de la primera página se había escrito una columna antes.

**738 tests unitarios** (de 725) y 162 de integración, en verde.

### v0.53.2 — el 12 % de las barreras que el cotejo no veía

Primera comparación de verdad: las pasadas **v5 y v6 del mismo sitio real**, 522 filas cada una, once versiones de motor entre medias. Y lo primero que hizo la comparación fue descubrir dos cosas de sí misma y una del motor.

**El cotejo elemento a elemento estaba ciego sobre el 12 % de las barreras.** De las 522 filas, **62 venían sin `selector`** — todas de la capa de adaptación (1.4.4, 1.4.10, 1.4.12), que nombra el bloque recortado en el campo `elemento` y no calcula ruta. Con la clave «criterio | página | selector», las diez filas de una misma página se fundían en una: la herramienta dijo «desaparecidas 1» cuando 1.4.4 había perdido dos filas y 1.4.10 una. Ahora la identidad cae en `elemento` cuando no hay selector, y lo que **aún** no se pueda distinguir se cuenta y se dice en una nota de cobertura: cuántas filas se identificaron por `elemento`, cuántas no traían ni lo uno ni lo otro, y cuántas comparten identidad con otra. Sin esa nota, «nuevas 3 · desaparecidas 1» se lee como el recuento completo, que es la misma falta que absolver por no haber mirado.

**Y «94 de 93 control(es) alcanzados».** Eso salió en el 2.1.2 del sitio, y leído así parece una cuenta mal hecha. No lo es: el censo de enfocables se toma *antes* de tabular, así que un control que se vuelve enfocable durante el camino —un menú que se despliega al recibir el foco su botón— se alcanza sin estar censado. Medido con una página de respuesta sabida (un botón que al enfocarse añade tres enlaces): **5 alcanzados de 2 censados**. El número no se toca, porque es verdad; se explica. Y pasa a decir algo que interesa: que la página cambia al tabularla.

**Lo que la comparación dijo del motor**, ya con las dos cosas arregladas: 14 criterios fallan antes y después, y los **tres conformes de la v5 han desaparecido** —2.4.5, 3.1.1 y 3.2.4 pasan a `revisar` o `cumple-parcial`—, que es justo lo que buscaban los barridos de v0.49.0 y v0.50.0. Seis criterios se vuelven más severos y cuatro más indulgentes (2.1.2, 2.1.4, 2.5.4 y 2.5.7, los cuatro de `revisar`/`humano` a `cumple-parcial`): comprobados uno por uno, los cuatro llevan detrás una medición real sobre la página y dicen qué parte no cubren, así que son el efecto buscado y no una regresión. Y ninguno de los cuatro es conformidad: `cumple-parcial` no lo acepta `esConforme()`, y el seguimiento sigue diciendo «No se puede comprobar».

**725 tests unitarios** (de 723) y 162 de integración (de 160), en verde.

### v0.53.1 — la herramienta que comparaba la nada y no se quejaba

La v0.53.0 se estrenó con datos reales y a la primera salió algo que no estaba en ningún test: la orden que tenía que generar el segundo informe falló, pero la redirección del intérprete ya había creado el fichero, así que quedó un `.json` de **cero bytes** — y la comparación se rompió con un «Unexpected end of JSON input» y una pila de llamadas de Node, que no le dice a nadie qué ha pasado.

Y al ir a arreglarlo apareció lo de verdad grave, que es el mismo error del proyecto entero aplicado a la propia herramienta. Con un JSON **válido pero que no es una auditoría del agente**, la comparación imprimía el informe completo: «0 más severo, 0 más indulgente, 0 barreras». Eso se lee como *no ha cambiado nada*, cuando lo que pasa es que **no se ha leído nada**. En un informe el silencio se lee como conformidad, y en una comparación un montón de ceros se lee como coincidencia: la herramienta estaba absolviendo por no haber mirado, exactamente lo que lleva once versiones persiguiendo en el motor.

Así que ahora se niega a comparar nada, y lo dice: el fichero que no existe, con su ruta y sin volcado; el fichero vacío, **apuntando a la causa** —la orden anterior falló y la redirección creó el fichero igualmente—; el JSON que no trae la lista `seguimiento`, diciendo qué salidas sí valen; y, en modo referencia, el CSV del que no sale ni un criterio, listando las cabeceras que encontró para ver cuál falta. Los cuatro salen con código 2 y **sin imprimir una línea de informe**.

**723 tests unitarios** (de 719) y 160 de integración, en verde.

### v0.53.0 — la herramienta para medir el agente contra una verdad conocida

Hasta aquí la precisión se ha medido por dentro: criterios que no podían denunciar, capas que firmaban conformidad sin haberlo visto todo, «no aplica» que cerraban sin dejar rastro. Todo eso se encuentra leyendo el código y midiendo con páginas de respuesta sabida, y da para once versiones. Lo que no se puede medir así es lo único que de verdad importa: **sobre un sitio real y grande, qué se le escapa y qué se inventa**.

Para eso hacen falta dos cosas que no están en el código —una auditoría anterior del mismo sitio, o una hecha a mano por una persona— y esta versión es la herramienta que las compara. `node scripts/comparar-auditorias.mjs` con dos modos:

**Dos pasadas del agente** (`antes.json despues.json`): qué criterio cambió de veredicto y en qué dirección, y qué barreras aparecieron y desaparecieron **elemento a elemento**, cotejadas por criterio, página y selector. Lo que se vuelve más indulgente se lista aparte y con aviso, porque en este proyecto esa es la dirección peligrosa: cada caso hay que justificarlo —un falso positivo retirado está bien— o es una regresión. Y un criterio que **desaparece del informe** sale primero, que es lo más grave que puede aparecer ahí.

**Contra una referencia humana** (`auditoria.json --referencia barreras.csv`): lo que la persona marca y el agente no —distinguiendo «lo deja a juicio» de «lo absuelve», que no es lo mismo— y lo que solo ve el agente, que son los candidatos a falso positivo. Vale cualquier CSV con una columna de criterio: el `-barreras.csv` del propio agente o un export de una hoja de seguimiento.

**Y los dos errores que cometió en su primer uso, con datos reales delante.** Probada contra dos pasadas reales de visitspain.com.cn (464 barreras cada una), clasificó como «más indulgente» cuatro criterios que antes tenían el veredicto a `null` —es decir, que nadie se había pronunciado—, que es exactamente lo contrario. Y en modo referencia leyó la columna del subcriterio de la EN («9.1.1.1»), sacó de ahí «9.1.1» con la expresión del criterio WCAG, y produjo siete criterios inventados y todo lo demás «escapado». Los dos están arreglados y fijados en tests. La comprobación de que el mecanismo entero funciona: la pasada v5 contra su propio CSV de barreras da **14 criterios de 14, con el mismo recuento en cada uno**.

Dicho lo obvio: esto **no concluye nada solo**. Señala dónde mirar, y que dos auditorías coincidan en el criterio no quiere decir que coincidan en la barrera. Eso se compara elemento a elemento, con el selector delante, y lo hace una persona.

**719 tests unitarios** (de 712) y 160 de integración, en verde.

### v0.52.0 — los cinco «no aplica» que absolvían en silencio

La absolución viene en dos formas, y hasta ahora solo se había barrido una. Un criterio declarado conforme al menos deja su fila en el informe; uno marcado **«no aplica» desaparece sin que nadie lo mire**. Doce criterios pueden cerrarse así, casi todos desde el cuaderno de juicio, y medidos con casos de respuesta sabida había **cinco que se cerraban mal**.

**Un vídeo también está enlazado, o lo sirve JavaScript.** `<a href="/jornada.mp4">Vídeo de la jornada</a>` daba «no aplica · la página no tiene ningún vídeo», y lo mismo un reproductor hecho con un elemento personalizado (`<video-player src>`) o un `div` con `data-video`. Ahora esas dos señales —extensión de medio en un enlace, y pinta de reproductor con un medio en sus datos— no dictaminan nada, pero impiden que el criterio se cierre solo: la ficha se emite y dice qué se vio. Un PDF enlazado sigue sin ser un vídeo.

**El cartel con el titular incrustado casi nunca es un `<img>`.** 1.4.5 ya miraba las imágenes de fondo declaradas en las hojas de estilo, pero no las del atributo `style`, que es donde acaban la mitad: `style="background-image:url(/cartel-con-texto.png)"` firmaba «no aplica». Y lo mismo en **2.3.1** con un GIF puesto de fondo — que es el criterio cuyo incumplimiento puede provocar una crisis epiléptica, el último que puede cerrarse por descuido.

**Y un `<area href>` es un enlace.** Tiene destino y tiene nombre (su `alt`); una página cuyos enlaces eran todos de un mapa de imagen salía con 2.4.4 «no aplica · la página no tiene enlaces visibles». Los `<area>` no se ven ellos mismos —los pinta la imagen—, así que no pasaban por el filtro de visibilidad: ahora se toman aparte, comprobando que su `<map>` no esté oculto.

Ninguno de los cinco arreglos convierte nada en barrera: lo único que hacen es **dejar de cerrar el criterio**, de modo que la ficha del cuaderno se emite y alguien lo mira. Y el barrido queda en el repo junto al otro: `node scripts/quien-declara-conforme.mjs --no-aplica` saca la segunda lista, la de quién puede cerrar un criterio sin dejar rastro.

**712 tests unitarios** (de 708) y 160 de integración, en verde. El entregable no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto.

### v0.51.0 — 3.3.3 leyendo el mensaje de verdad, y el léxico de 1.3.3 medido

Los dos criterios que quedaban del repaso, y los dos tenían más tela de la que parecía.

**3.3.3 Sugerencias ante errores: el mensaje ya lo teníamos y nadie lo leía.** El cuaderno de juicio decía, con razón, que «este criterio va del contenido del mensaje, y eso hay que leerlo» — pero la capa dinámica ya envía el formulario en modo seguro y se trae el texto que apareció, de `aria-describedby`, de `aria-errormessage` o del entorno del campo. Lo que faltaba era leerlo.

Y al ir a leerlo apareció el problema de fondo: **el modo seguro vacía los campos antes de enviar** —no manda los datos de nadie a ninguna parte—, así que *todos* los errores que provocaba eran de campo vacío. Y 3.3.3 va justo de lo otro: un obligatorio vacío se corrige rellenándolo y «este campo es obligatorio» ya dice cómo; lo que exige una sugerencia es el formato incumplido, porque **el formato esperado lo conoce la página: está escrito en sus propios atributos** (`type`, `pattern`, `minlength`, `min`/`max`). Medido sobre un formulario con un `type="email"` mal rellenado a propósito, el análisis solo veía `valueMissing`.

Así que hay una **segunda pasada** que escribe un valor inválido en los campos con restricción de formato, envía otra vez y lee el mensaje. Nada sale a la red —el cortafuegos sigue armado y el `submit` sigue interceptado— y los valores del usuario se restauran: hay un test de integración que comprueba las tres cosas a la vez, que el error se provoca, que el servidor no recibe nada y que el formulario queda con sus datos y su token CSRF intactos.

Con el mensaje delante, el veredicto: si el campo falló por formato y el mensaje no apunta a ningún formato —«Campo inválido. Revise el dato.»— sale **`revisar`** con el texto citado, el motivo que dio el navegador y las restricciones del campo; si el mensaje dice el formato («debe tener el formato nombre@dominio.es, por ejemplo ana@ejemplo.gal»), `cumple-parcial`, porque que la sugerencia sea *suficiente* lo juzga una persona. Nunca `falla`: la sugerencia puede estar fuera del mensaje, en una pista junto al campo. Y se dice lo que **no** se pudo provocar: `minlength` no se puede, porque el navegador solo marca `tooShort` cuando el valor lo escribe una persona, no cuando se pone por programa. Callarlo haría leer «se probó el formulario» como «se probó todo».

**1.3.3 Características sensoriales: el léxico existía y se le escapaba la mitad.** Aquí me equivoqué al proponerlo como criterio sin medir: ya estaba implementado. Lo que faltaba era medirlo, y medido con frases de respuesta sabida salió esto: solo admitía artículo determinado («el botón verde» sí, «un recuadro rojo» no); la forma solo en botón, icono, forma y figura, así que «la casilla cuadrada» no; nada del **tamaño** ni del **sonido**, que el criterio nombra expresamente; «el botón de abajo» tampoco; y nada en **gallego** —«preme o botón verde», en un sitio público de aquí, que es media provincia—. Y a la vez tenía un falso positivo claro: «más abajo» a secas, en prosa normal («más abajo encontrarás el teléfono»), que no es una instrucción para operar nada.

Reescrito con listas en español, gallego e inglés, y con una regla que cambia el resultado: **la posición tiene que ir acompañada** de un elemento («el botón de abajo») o de un verbo de acción («haz clic arriba a la izquierda»). Sola no cuenta. Trece frases que debía pillar, las trece; seis que no debía, ninguna.

**708 tests unitarios** (de 699) y **160 de integración** (de 159), en verde. El entregable no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto.

### v0.50.0 — los dos huecos que quedaban de la lista de «quién declara conforme»

Repasando con el barrido de v0.49.0 los quince criterios que alguna capa puede firmar como conformes, quedaban dos por mirar. Los dos tenían hueco, y los dos se midieron antes de tocar nada.

**1.4.3 no medía el texto que pinta el CSS.** `textTargets` recoge los elementos con *nodos* de texto propios, y el texto generado no es un nodo de texto: lo pinta el motor de estilos desde `content`. Medido sobre una página con `a.externo::after { content:" (abre en ventana nueva)"; color:#fafafa }` sobre blanco —**1.04:1, invisible**—: 1.4.3 salía `pasa` seis veces. El criterio, exportable como conforme, con un texto que no se ve. Y no es un caso de laboratorio: el aviso de enlace externo, el asterisco de obligatorio, las etiquetas «Nuevo» de un escaparate y los separadores de una miga de pan se pintan así todos los días.

Ahora se mide, con el mismo umbral y la misma evidencia que el resto de 1.4.3, nombrando el texto y el pseudoelemento (`a.externo::after`). Lo que queda fuera, a propósito: el glifo de una fuente de iconos (`content:"\e900"`, que se ve como un dibujo y no como letras), las viñetas, las flechas, las comillas, `attr()` y `counter()` —cuyo valor no está en la hoja de estilos— y `content: url(...)`, que es una imagen. Ese último lo encontró un test antes que nadie: sin quitar las funciones, la cadena de dentro de `url("icono.png")` se tomaba por texto y se medía el contraste del **nombre del fichero**. Y un límite que hay que decir en voz alta: con el corte de «si no hay letras no es texto» se queda fuera el asterisco de campo obligatorio, que sí es información; desde el carácter no se puede distinguir de una viñeta, y entre callar uno y acusar a todas las viñetas de la web se calla ese.

**2.1.1 decía `cumple` de un botón que solo responde al ratón.** La medición dice `pasa` cuando el control *recibe el foco*, y eso no es operar con el teclado. Para los controles no nativos ya había sospecha, pero el hueco estaba en los nativos: `<button onmousedown="x()">` salía **`cumple`** cuando Enter y Espacio disparan `click` y **no** `mousedown` — con el teclado ese botón no hace nada. Es el fallo **F54**, y lo mismo pasaba con `ondblclick` (que no tiene equivalente de teclado) y con `onmouseover`.

Ahora sale `revisar` —nunca `falla`, porque desde el marcado no se ve si el manejador hace una función o un efecto visual— con la frase que lo explica. Y con el falso positivo descartado, que era el más probable de todos: **el `<a href="/x" onmousedown="telemetria()">`**. Ese enlace se opera con Enter perfectamente y el manejador de ratón es un añadido; acusarlo sacaría un aviso en cada enlace con analítica de medio internet. Así que no entra nada que tenga una acción nativa que el teclado ya dispare: un enlace con `href`, un `select`, un `summary`, un `input`, o un `submit` **dentro de un formulario** — que fuera de uno no envía nada por sí mismo, y ahí sí se avisa.

**699 tests unitarios** (de 694) y **159 de integración** (de 155), en verde, cuatro de ellos contra un Chromium real porque el texto generado no existe en el documento y un DOM de mentira no puede verlo. El entregable no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto.

### v0.49.0 — 2.4.3 comparaba 25 controles y firmaba la página entera

Esta versión sale de darle la vuelta a la pregunta. Hasta ahora el barrido buscaba criterios que **no pueden denunciar** una barrera; este busca lo contrario, que es más difícil de ver porque un informe que absuelve no se queja: **quién puede declarar conforme qué, y con qué base**. De los 55 criterios, quince pueden salir como `pasa` o `cumple` desde alguna capa — y hay que mirarlos uno por uno con una sola pregunta: *¿lo que se ha medido cubre todo lo que pide el criterio, o solo una parte?*

**2.4.3 Orden del foco no lo cubría.** El `slice(0, 25)` estaba antes de **comparar** en vez de antes de **imprimir**: los 25 son para que la evidencia se pueda leer —sesenta controles en una línea no se leen—, pero el recorte se aplicaba a la lista que después se compara con el orden visual. Medido en un Chromium real: una página de 30 controles con una fila invertida (`row-reverse`) en los dos últimos daba **`pasa`**, con la frase «la tabulación sigue el orden visual de la página» y sin una sola nota; la misma inversión en los dos primeros daba `revisar`. En cualquier sitio con más de 25 elementos enfocables —es decir, en casi todos— el criterio se podía exportar como conforme teniendo la inversión fuera del recorte. Ahora se compara la secuencia completa, se imprimen los 25 primeros y se dice cuántos hay en total.

**Y un recuento que engañaba, en 1.4.1.** Cada enlace que solo se distingue por el color sale como su propia barrera, y con más de 25 los demás desaparecían sin dejar rastro: en una página con cuarenta, el informe decía veinticinco. El criterio fallaba igual, pero el alcance de la reparación se contaba mal, y quien lee el informe para presupuestar el arreglo se llevaba una cifra falsa. Ahora, cuando hay más, se dice cuántos y se nombran algunos.

**El barrido queda en el repo,** porque el método vale más que el hallazgo: `node scripts/quien-declara-conforme.mjs` saca cada línea del código que emite un veredicto conforme y a qué criterio, y `node scripts/quien-declara-conforme.mjs 2.4.3` lo hace de uno. Es el tercer sitio donde aparece el mismo patrón —1.4.11 medía el relleno y firmaba el criterio, 3.2.1 sondaba sin foco de documento y firmaba «ninguno provoca nada», 2.4.3 comparaba 25 y firmaba la página— así que conviene tenerlo a mano y volver a pasarlo cada vez que una capa aprenda a decir `pasa`.

**694 tests unitarios** (de 691) y **155 de integración** (de 154), en verde. El entregable no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto. Y en el sitio de prueba 2.4.3 sigue saliendo `pasa` en las siete páginas donde el orden es correcto: esto no inunda de avisos, cierra un agujero.

### v0.48.0 — «el agente no ve el orden visual» era mentira, y el cuaderno borraba la prueba

El cuaderno de juicio dejaba **1.3.2 Secuencia significativa** en manos de una persona con esta frase: *«el agente no ve el orden visual»*. No era verdad — 2.4.3 ya compara la tabulación con el orden visual sobre el render real desde hace versiones; lo que pasaba es que 1.3.2 no usaba ese dato. Medido sobre tres pasos de una receta reordenados con `order` —en el código 1, 2, 3; en pantalla 3, 2, 1, que es el caso de libro del criterio—: `humano`, con la pregunta de rigor y sin un solo dato.

**Dos condiciones, y las dos tienen que cumplirse.** Primero, que el CSS **declare** una reordenación: `order`, `flex-direction: *-reverse`, `flex-wrap: wrap-reverse` o colocación explícita en la rejilla. Segundo, que medido sobre el render el orden visual **sea** distinto del orden del DOM. Con una sola de las dos no se dice nada, y eso es deliberado: hay mil maneras legítimas de que lo que se ve no siga al código —dos columnas, una barra lateral, un `float`—, y acusarlas todas dejaría el criterio en `revisar` en media web, que es la forma más rápida de que nadie lea los avisos. Una rejilla de tres columnas en su orden no sale; una fila en RTL leída de derecha a izquierda tampoco, porque ahí ese *es* el orden de lectura.

El veredicto es `revisar`, nunca `falla`: 1.3.2 pide que la secuencia **preserve el significado**, y si reordenar tres tarjetas de un escaparate lo cambia o no lo decide una persona. Lo que aporta esto es el dato que esa persona no tenía: qué se reordenó, por qué propiedad, y en qué orden se lee frente a en qué orden se ve.

**Y por el camino apareció algo peor que el silencio.** Con la medición ya funcionando, el hallazgo seguía sin llegar al informe: `aplicaCuaderno` **borraba** cualquier `revisar` de los once criterios de juicio, porque «son exactamente los que el cuaderno viene a concretar». Así que la capa de render medía el desorden sobre el navegador, lo describía con los dos órdenes, y el cuaderno lo tiraba y dejaba la pregunta genérica. El cuaderno concreta lo que nadie ha mirado; no tapa lo que ya se ha medido. Ahora se conserva todo `revisar` que venga de una capa que mide —medición, píxeles, puntero, adaptación, dinámico, axe, coherencia— y la ficha del cuaderno sigue estando al lado, con su expediente. Esto no afecta solo a 1.3.2: el mismo borrado se habría comido cualquier observación medida de los otros diez.

Corregida también la frase del cuaderno, que ahora dice la verdad: se ve la reordenación **declarada**, y no se ve la que no se declara.

Un detalle de forma que importa: la evidencia de 1.3.2 nombra los bloques por su etiqueta y su texto **sin corchetes angulares**, porque esa evidencia viaja a informes HTML y un `<p>` suelto ahí o se interpreta como marcado o lo borra el saneador. Hay un test que lo vigila.

**691 tests unitarios** (de 684) y **154 de integración** (de 150), en verde. El entregable no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto.

### v0.47.0 — 3.2.1 salía «pasa» en una página que lo incumple dos veces

Tercera pasada del mismo método, y la de más alcance: **3.2.1 y 3.2.2** —enfocar un control o cambiar su valor no puede mover el suelo— tenían dos agujeros, uno en cada lado del agente.

**El marcado no se leía.** De estos dos criterios se encarga la capa dinámica, que enfoca cada control y le cambia el valor sobre la página viva. Pero esa capa viene **apagada por defecto**, y en la extensión y en el artifact no existe: ahí el motor daba `humano` —«ninguna máquina lo dictamina»— incluso con el fallo escrito dentro del atributo. Medido: `<select onchange="location.href=this.value">`, el fallo **F37** de libro, salía como «requiere evaluación humana». Ahora el motor lee los manejadores **en línea** y solo las acciones que son un cambio de contexto sin discusión: navegar, abrir una ventana, enviar el formulario o mover el foco. Un `onchange="pinta(this.value)"` sigue sin decir nada —lo que hace está en un script que el marcado no ve— porque inventarse una barrera con un nombre de función es lo contrario de medir. Y 3.2.2 es el *ajuste* de un componente, así que un `oninput` en un buscador con autocompletado no entra: avisar de eso sería ruido en cada caja de búsqueda del mundo.

**Y la capa dinámica declaraba conforme lo que incumple.** Sobre una página con los cuatro fallos escritos en los atributos, emitía: «se han probado 9 control(es) y ninguno provoca navegación, salto de foco ni sustitución de contenido». Es decir **`pasa`** —que `esConforme()` da por conformidad— en una página que falla 3.2.1 dos veces. Tres causas, las tres medidas:

Abrir una ventana **no cambia la URL** de la página, así que `onfocus="window.open(...)"` (fallo **F52**) era invisible. El foco perdido deja `activeElement` en `<body>`, que la huella leía como «sin foco» y un filtro `!== null` descartaba —ese filtro estaba puesto para no acusar a los controles que *no pueden* recibir el foco, donde `el.focus()` no mueve nada—, así que `onfocus="this.blur()"` (fallo **F55**) tampoco se veía. Y la gorda: **en cuanto el cortafuegos aborta la primera navegación, el documento pierde el foco, y sin foco de documento Chromium no despacha los eventos de foco — el `onfocus` ni se ejecuta**. Del tercer control en adelante la sonda estaba mirando una página donde los manejadores no corrían, y lo apuntaba como «ninguno provoca nada».

Arreglado escuchando el evento `focus` del propio elemento —que `el.focus()` despacha de forma síncrona—, lo que distingue «recibió el foco y lo soltó» de «no pudo recibirlo»; devolviendo el foco al documento con `bringToFront()` cuando se pierde; y contando lo que no se pueda sondar con foco como **no sondado**, que baja el veredicto a `cumple-parcial` en vez de firmar conformidad.

**Un falso positivo que apareció por el camino, y cómo se quitó.** La primera versión atribuía las ventanas con el evento `popup` del driver. Medido: el `onfocus` se vuelve a disparar cada vez que el documento recupera el foco, salieron **cinco** ventanas del mismo `input` repartidas en 300 ms, y la última aterrizó en el turno del control siguiente —que solo hacía `this.blur()`— y lo acusó de «abre una ventana nueva». Una barrera colgada a quien no la abrió. Ahora la cuenta la lleva la propia página, envolviendo `window.open` y apuntando quién tenía el foco: la atribución es exacta y no depende de cuándo llegue el aviso.

**Y una corrección de criterio, no de código.** Un test existente pedía `revisar` para el control que roba el foco, con el motivo de que «3.2.1 lo permite si se avisó antes». Eso es de **3.2.2**: 3.2.1 no tiene esa salida, y el foco está en la lista de lo que la norma considera un cambio de contexto. Es barrera, y F55 la nombra.

**684 tests unitarios** (de 674) y **150 de integración** (de 148), en verde. El sitio de prueba no se mueve: 7 familias, 21 hallazgos, 55 de 55 con veredicto.

### v0.46.0 — 2.5.3 no podía denunciar una barrera en ninguna capa

Siguiendo el método de la versión anterior —probar si el agente *detecta* cuando hay algo que detectar— pero esta vez mirando el código en vez de las páginas: de los 55 criterios, **solo ocho tienen en el motor una regla capaz de emitir `falla`** (4.1.2, 1.3.1, 3.3.2, 2.1.1, 2.4.4, 2.4.3, 1.3.5 y 1.1.1). De los demás hablan las capas o el juicio humano, que está bien. Pero uno de los que se quedaban fuera no tenía excusa: **2.5.3 Etiqueta en el nombre**, que es mecánico.

El criterio existe por quien maneja el ordenador hablando: dice «pulsa Enviar» porque es lo que lee en el botón, y si el nombre accesible es «Submit form» el reconocimiento de voz no encuentra nada. Es el fallo **F96**, de los más comunes en sitios en español con ARIA copiado en inglés. Medido antes de tocar nada: el motor daba `cumple-parcial` **siempre**, también en `<button aria-label="Submit form">Enviar</button>`.

**El texto visible no es el texto del subárbol,** y ahí está la gracia. `subtreeText` mete los `aria-label` de los hijos y el `alt` de las imágenes —que no se ven— y sobre todo mete el texto de los iconos de fuente: `<i class="material-icons">search</i>` se ve como una lupa, no como la palabra «search». Esa es la vía clásica del falso positivo en este criterio, así que el texto visible se calcula aparte, dejando fuera iconos, imágenes y lo oculto, y para los botones `<input>` se toma su `value`. La regla solo entra cuando el nombre viene de `aria-label`/`aria-labelledby` —si sale del contenido no puede haber desajuste— y en los controles que se operan por voz. Un carácter suelto no es una etiqueta: la «x» del botón de cerrar es un icono escrito con el teclado. Y lo que solo difiere en tildes sale como **`revisar`**, no como barrera: puede que el reconocedor lo case y puede que no, y eso se prueba.

**Y una decisión que se tomó midiendo, no opinando.** axe tiene una regla para esto, `label-content-name-mismatch`, con la etiqueta `wcag21a` y dentro del filtro del agente — pero no corre, porque axe desactiva las experimentales. Antes de habilitarla se midió lo que acusa sobre una página con los ocho casos, contra Chromium real: de los cuatro nodos que marca, **uno es un falso positivo** (el icono de fuente) y **se le escapa** `<input type="submit" value="Guardar" aria-label="Save changes">`, que sí es una barrera. Como las barreras que solo ve axe entran al informe, habilitarla metería ese falso positivo en un entregable legal. Así que de 2.5.3 habla el motor, que acierta en los ocho casos, y la regla de axe se queda fuera — con los nodos medidos guardados en un test de integración, para que si una versión futura de axe lo arregla, el test se ponga en rojo y la decisión se vuelva a tomar con datos.

**674 tests unitarios** (de 669) y **148 de integración** (de 145), en verde. Las barreras del entregable no se mueven: el sitio de prueba sigue en 7 familias, 21 hallazgos y 55 de 55 con veredicto — no hay en él un solo caso de F96, que es la mejor prueba de que esto no inventa hallazgos.

### v0.45.0 — 1.4.11 medía el relleno del control y llamaba a eso «el límite»

Probando el agente al revés —no si absuelve de más, sino si **detecta cuando hay algo que detectar**— con cuatro páginas nuevas, una por criterio y con la respuesta sabida: 2.1.2 dio `falla` nombrando el ciclo del foco, 4.1.3 describió exactamente lo que vio, 1.4.1 dio `falla`. Y **1.4.11 no emitió nada**: lo único que llegaba al informe era el relleno del motor diciendo que de eso se encarga otra capa.

**El fallo.** `boundaryContrastOf` solo miraba `background-color`. Un botón de relleno blanco sobre página blanca con un borde gris claro —el patrón «ghost button», de los más extendidos que hay— da relleno idéntico al fondo, salía por el `return null` de «no hay límite que medir» y se callaba. Medido sobre `border: 2px solid #f0f0f0` en página blanca: **1.14:1**, el caso de libro de 1.4.11, y el criterio se quedaba sin un solo hallazgo de la capa. En las 20 páginas del sitio de prueba, la medición **no había dicho nunca nada** de 1.4.11.

**El límite visible de un control es lo que lo separa de su fondo, y en la mitad de los diseños eso es el borde.** Ahora se miran el relleno y los cuatro lados del borde, y manda el que *más* lo distingue: basta con que una de las dos cosas separe el control para que el límite sea perceptible. La ficha dice por dónde se midió —«por su borde 2 px», «por su relleno»—, que es lo que permite ir a comprobarlo.

**Y el techo baja de `pasa` a `cumple-parcial`.** 1.4.11 cubre además los objetos gráficos y los **estados** del control, que esto no mide: un límite que contrasta de sobra no cierra el criterio, solo cierra la parte que se midió. Firmar `pasa` era declarar conforme lo que no se ha visto, que es el error que este agente persigue. Por debajo de 3:1 tampoco es `falla`: quedan formas de delimitar un control —una sombra, un icono, un subrayado— que esto no mira, y eso lo juzga una persona con la medida delante.

**Del control sin relleno ni borde se dice una cosa o la otra según lleve texto.** Con texto propio, 1.4.11 no le exige límite —se identifica por el texto, y de ese texto se ocupa 1.4.3—: `cumple-parcial` diciéndolo. Sin texto, lo único que lo identificaría es una forma o un icono y hay que mirarlo a mano: `revisar`. La diferencia importa porque avisar de los primeros sería dar la lata en cada botón de texto de la página, y un aviso que sale en todo es un aviso que nadie lee. En el sitio de prueba esto encontró dos controles nuevos en `roto.html`, y el segundo es el caso real: un `div role="slider"` vacío con `aria-label`, que no pinta absolutamente nada.

**669 tests unitarios** (de 663) y **145 de integración** (de 137), en verde, con ocho de los nuevos contra un Chromium real — porque el fallo vivía en cómo se *lee* el estilo, y en la suite pura el `getComputedStyle` es de mentira: desglosa `border: 2px solid #f0f0f0` por lados solo si el test se acuerda de desglosarla. Las barreras del entregable no se mueven: 7 familias, 21 hallazgos, 55 de 55 subcriterios con veredicto.

### v0.44.0 — los cuatro criterios de puntero, preguntándoselo al navegador

De la medición de v0.43.0 salía un bloque claro: **2.5.1, 2.5.2, 2.5.4 y 2.5.7 —gestos, cancelación, actuación por movimiento y arrastre— daban los cuatro «requiere evaluación humana» en todas las páginas**, `humano` ×15 cada uno, sin una línea de expediente. Es verdad que ninguno se cierra sin juicio. Pero lo que una persona necesita para juzgarlos es saber *qué* de la página se opera con gestos, arrastrando o al pulsar, y eso sí se puede averiguar.

**De dónde sale el dato, que es lo que decide si esto vale algo.** No de leer los scripts buscando palabras, que es como se cuelan los supuestos: del **registro de oyentes del propio navegador**, vía `getEventListeners` del protocolo de depuración. Devuelve lo que el navegador tiene apuntado, incluidos los oyentes que añadió JavaScript en tiempo de ejecución y los escritos en un atributo `onmousedown` — comprobado contra Chromium real, que las dos formas aparecen. Es un hecho, no una conjetura, y por eso se puede poner en un informe.

Con el censo delante, cada criterio recibe su expediente: 2.5.1 lista lo que escucha un gesto de trayectoria o multipunto (`touchstart`+`touchmove`, `pointerdown`+`pointermove`, los `gesture*` de Safari); 2.5.2, los controles que escuchan la BAJADA del puntero y ningún evento de subida ni `click`; 2.5.4, si la página escucha `devicemotion` o `deviceorientation`; y 2.5.7, lo que se opera arrastrando, por `draggable`, por `dragstart` o por la secuencia `pointerdown→move→up`.

**Y lo que no se puede afirmar, dicho en las cuatro fichas.** Encontrar el gesto no es incumplir: 2.5.1 pide que exista alternativa de un solo puntero, y eso hay que probarlo. No encontrarlo tampoco cierra el criterio: el censo es una foto del documento principal, no ve dentro de los marcos ni de un `<canvas>`, y una biblioteca que ate sus oyentes la primera vez que se interactúa con ella no aparece. Por eso el silencio sale como `cumple-parcial` —presencia medida, resto por juzgar— y **nunca** como `cumple` ni como `no-aplica`. Sin censo, el analizador no dice nada y se encargan el relleno del motor o el barrido: inventar un veredicto sin medir es lo contrario de medir.

Un detalle que se corrigió al medirlo: la primera versión decía «se han revisado los oyentes de N elementos» con N = los que *tienen* oyente, así que en una página limpia salía «**se han revisado los oyentes de 0 elementos**» — que se lee como que no se miró nada, justo lo contrario de lo que había pasado. Ahora cuenta los elementos recorridos.

**663 tests unitarios** (de 654) y 137 de integración, en verde, con una página nueva en el sitio de prueba que lleva los cuatro casos. Las barreras del entregable no se mueven: esto no inventa un hallazgo, convierte cuatro «evaluación humana» en cuatro expedientes.

### v0.43.0 — medir el agente contra sí mismo: qué criterios no decide nunca

Hasta aquí las revisiones iban módulo a módulo. Esta empezó por una medición del conjunto: sobre el sitio de prueba, con todas las capas encendidas, **cuántos de los 55 criterios reciben alguna vez un veredicto determinante** —`falla`, `cumple`, `pasa` o `no-aplica`— y cuántos se quedan siempre en una pregunta. Salieron 22 con veredicto, 11 que miden la presencia y dejan la calidad a una persona, y 22 que solo preguntan. Esa última columna es la que había que mirar de cerca, porque algunos de ellos el agente los estaba midiendo y no lo contaba.

**El motor afirmaba que una capa «no ha corrido» en auditorías donde sí había corrido.** El motor lee el marcado y nada más: no lanza las capas ni sabe cuáles lanzará la orquestación después. Y sin embargo dejaba, por criterio, un `revisar` con esta frase: «lo mide la capa de dinámico, que **en esta ejecución no ha corrido**». Medido con la capa dinámica encendida: esa frase salía en la misma auditoría en la que esa capa había corrido y había dictaminado. Una afirmación falsa en la evidencia de un informe con efectos legales. Ahora dice lo que es cierto desde donde está: «que este análisis del marcado no ejecuta».

**Y ese relleno dejaba pendientes criterios que la capa había medido.** El rollup se queda con el peor veredicto de cada criterio, así que un `revisar` de relleno conviviendo con el `cumple-parcial` de la capa dejaba el criterio en `revisar`. Medido en 2.1.2: quince hallazgos de relleno contra quince de la capa, y el criterio pendiente en el informe. Ahora el relleno va marcado (`origen: "motor-sin-capa"`) y la orquestación lo retira en los criterios de los que una capa sí habló — y solo en esos: donde la capa no encontró nada que medir, el relleno se queda, porque entonces es la respuesta honrada. Retirarlo no vuelve conforme lo medido a medias: las notas de cobertura siguen atando después, y el barrido final sigue nombrando lo que quede sin nadie que hable.

**2.1.2 solo hablaba cuando encontraba la trampa.** Si el recorrido con Tab daba la vuelta a la página entera sin quedarse atrapado, no emitía nada: el agente había hecho el trabajo —tabular toda la página y comprobar que de todas partes se sale— y no lo contaba. Ahora hay cuatro escalones: atrapado es `falla`; sin atrapar pero con el presupuesto de tabulaciones agotado es `revisar`, porque no ver una trampa sin haber recorrido el camino entero no es haber comprobado que no la hay; el recorrido completo es `cumple-parcial`, no `cumple`, porque esta prueba pulsa Tab y dentro de un widget compuesto se navega con flechas, que es justo donde Tab no ve la trampa; y una página sin controles enfocables es `no-aplica`. Con eso 2.1.2 pasa a la columna de los que sí deciden.

Y un guardia para el barrido: un test comprueba que toda la prosa de `CAPA_QUE_MIDE` se traduce a una capa conocida. Si alguien añade un criterio con una prosa nueva que no mapee, el barrido diría «ninguna capa lo mide aparte del motor» sobre un criterio que sí mide una capa, y lo diría con toda la seguridad del mundo.

**654 tests unitarios** (de 650) y 133 de integración, en verde. La auditoría del sitio de prueba sigue cerrando 55 de 55 subcriterios y las mismas 7 familias de barreras: nada de esto inventa un hallazgo, solo deja de callar lo que ya se sabía.

### v0.42.0 — tres «no aplica» del cuaderno, y la primera sesión con un lector real

El cuaderno de juicio decide once criterios, y «no aplica» cierra uno igual de bien que «cumple». Revisadas las seis fichas que quedaban, tres cerraban criterios que sí venían al caso.

**3.3.4 declaraba fuera de alcance una pantalla de pago.** La exclusión se apoyaba en `method="post"`: lo que no enviara por POST ni llevara una palabra comprometedora en un botón se declaraba «de consulta o búsqueda». Pero un formulario sin `method` envía por GET, y uno de una aplicación moderna no declara método ninguno — lo envía JavaScript. Medido con `<form id="checkout"><input name="tarjeta"><button>Continuar</button></form>`: **«no aplica»**, es decir, el criterio sobre compromisos legales y económicos cerrado sobre un campo de tarjeta, con un botón que dice «Continuar» y que no está ni puede estar en una lista de palabras. La regla se invierte: ahora se excluye lo que SÍ se reconoce —un buscador, que es `role="search"` o un único campo de consulta— y todo lo demás queda pendiente de juicio. Acotar por lo reconocible, no adivinar por lo que no se reconoce.

**3.3.7 cerraba el criterio sobre el trámite de varios pasos, que es para lo que existe.** El atajo «menos de dos campos, no aplica» salía *antes* de calcular los grupos de datos y sin adjuntarlos, aunque el comentario del propio módulo dijera que se guardan siempre porque el cruce entre páginas los necesita. Medido: paso 1 con un único «Correo electrónico» y paso 3 con ese mismo correo daban, en el cuaderno de la muestra, **3.3.7 «no aplica · no viene al caso en ninguna de las 2 páginas»**. Ahora los grupos se calculan primero y viajan también en el «no aplica» de página —que solo habla de esa página—, y la muestra reabre el criterio nombrando el dato repetido.

**1.3.2 no se aplicaba a una página de párrafos.** La lista de bloques se quedaba en encabezados, regiones, formularios y tablas, así que una página de `<div>` y `<p>` —que son legión— salía «no aplica · no tiene bloques de contenido cuyo orden pueda importar». Y 1.3.2 va exactamente de eso: tres párrafos reordenados con `order` se leen en un orden y se ven en otro. Un solo bloque sigue quedando fuera, porque ahí no hay secuencia que alterar.

**Y la prueba con VoiceOver real se ejecutó por primera vez en la vida del proyecto.** Falló. Tardó 103 segundos y dijo «el icono sin nombre debería confirmarse» — el mismo mensaje tanto si el lector habló y dijo otra cosa, que sería un defecto del léxico, como si no llegó a leer la página, que es el entorno. Dos conclusiones opuestas y el rojo no las distinguía: cien segundos de sesión sin una frase en el informe es la misma falta que el agente persigue en los sitios que audita. Ahora el puente publica un resumen de la SESIÓN (`sesionUtil`) junto al de los nodos, comprobado contra las transcripciones reales: si todas las frases son del escritorio o están vacías, la sesión se declara **nula** y se dice que eso no dice nada sobre el componente. La prueba falla con los veredictos, lo previsto, lo oído y las frases en bruto, para que un fallo se diagnostique sin repetir la sesión.

Sobre el fallo en sí, lo medido: **el puente no tenía la culpa.** Con las transcripciones reales, las frases de página dan `confirmado` y el control sin nombre da `barrera-confirmada`. Y conduciendo VoiceOver en vivo sobre macOS 26.5.1 se capturó **«Enviar formulario, botón» → `confirmado`** — con el rol detrás y en español, al revés que el «link Saltar al contenido» de la transcripción de abril, que lo decía delante y en inglés. Las dos formas se resuelven, y ahora las dos están en la suite. Lo que falla es la captura: `lastSpokenPhrase()` escucha a todo el sistema y devuelve el escritorio cuando el navegador no está delante. Se añade la activación explícita del navegador, **sin verificar aquí** —esta máquina no tiene VoiceOver— y dicho así en el código.

**650 tests unitarios** (de 642) y 133 de integración, en verde.

### v0.41.0 — el silencio que no era de un criterio, sino del conjunto

Los módulos que quedaban sin revisar eran el rastreo, la muestra y el contraste por píxeles. Y revisándolos apareció algo que no era de ninguno de los tres: **el agujero estaba en el agregado**.

**Once criterios de una página salían sin una sola frase, y con `render: false`, cuarenta y nueve.** La regla de oro se cumplía criterio a criterio: ninguno se exportaba como conforme sin comprobar. Lo que no se comprobaba era el conjunto. Si *ninguna* capa emitía un hallazgo para un criterio, ese criterio no existía en el informe, y en la plantilla del IRA eso se imprime «No evaluado» —o se queda en blanco— sin que nadie haya dicho que no se miró. Medido sobre una página del sitio de pruebas: con las capas por defecto se quedaban callados 1.2.1, 1.2.2, 1.2.3, 1.4.2, 2.1.4, 2.2.2 y 4.1.3; con la capa de render apagada, que es una opción legítima, **49 de los 55**, y el informe no decía en ninguna parte que no se hubiera medido nada. Ahora un barrido final nombra lo que nadie nombró y distingue tres cosas distintas: que la capa que lo mide no se ejecutó, que se ejecutó y no dijo nada —«lo más probable es que no haya encontrado contenido al que aplique, pero el agente no lo afirma»— o que ninguna capa lo mide aparte del motor. Siempre `revisar`, que no es conforme. Se alimenta de `CAPA_QUE_MIDE`, que ya era la única tabla de qué capa mide qué, así que un criterio nuevo entra solo. El sitio completo pasa de 48 a **55 de 55 subcriterios con veredicto**, y ninguna barrera se mueve: el barrido no acusa, explica.

**En la muestra, siete expresiones de subcadena clasificaban mal ocho de nueve rutas corrientes.** `/accesorios` y `/catalogo/alta-montana` salían como «Acceso o registro» —«acceso» dentro de accesorios, «alta» dentro de altavoces—, `/blog/comercio-ilegal-de-especies` como «Aviso legal», `/noticias/resultados-del-partido` como «Resultados de búsqueda» y `/servicios/soporte-vital-basico` como «Ayuda». El daño no se quedaba en la lista: la cobertura que va al IRA daba por cubiertas **cinco categorías que no estaban**, y los avisos de «no se ha encontrado ninguna página de esta categoría» —que son los que mandan a la persona auditora a comprobarlo a mano— desaparecían por estar «cubiertas». Ahora se reconoce por palabra entera y se exige que el resto del segmento sea de la misma categoría, de apoyo o conectores: `/aviso-legal` y `/contactar-con-nosotros` pasan, `/contactos-culturales` no. Acceso y búsqueda son **función, no tema**, así que el nombre nunca basta: hace falta un campo de contraseña, un formulario o un parámetro de búsqueda. Medido sobre 23 rutas reales de páginas comunes: **cero falsos positivos y cero páginas perdidas**. Y lo que se descarta por poco no se tira en silencio —descartar de más deja el mismo agujero, solo que al revés—: va a un aviso con sus URL.

**La portada no siempre vive en «/».** Un sitio que arranca en `/es/` no tenía ninguna página marcada como inicio, así que la categoría «Página de inicio» —esencial en WCAG-EM— se declaraba ausente en un sitio que obviamente la tiene. La URL de arranque de la auditoría es la portada a estos efectos.

**En `robots.txt`, las líneas `User-agent` consecutivas son un grupo** (RFC 9309 §2.2.1) y cada una sobreescribía a la anterior: con `User-agent: *` delante de otro agente, el `Disallow` se perdía y el rastreador entraba justo donde el sitio pedía que no entrara. Y lo que el rastreo se salta —por robots o por parecer una acción destructiva— ya no es solo un número en un contador: se nombran las URL. La regla de rutas destructivas es, y debe seguir siendo, prudente (visitar un GET que borra algo hace daño; saltarse una página solo encoge la muestra), pero medido sobre rutas corrientes se salta también `/consejos/como-eliminar-manchas`. Prudencia sí; silencio no.

**En el contraste por píxeles, dos defectos en direcciones opuestas.** `color` se hereda, así que al sondar un párrafo las letras de sus hijos cambiaban de color con él y entraban en la máscara: medido, un párrafo de 622 px de texto pasaba a 1072 al meterle un enlace, y esos 457 px se juzgaban **con el color del padre**. Salía «pasa · todo el texto llega al mínimo» con el enlace fallando a 1.19:1 dentro de la misma caja; con el hijo sobre fondo claro el error es al revés y el padre falla por letras que no son suyas. Ahora cada descendiente se clava a su propio color calculado antes de sondar, deja de cambiar entre sonda y sonda y queda fuera de la máscara.

**Y la sombra del texto se borraba para medir, en silencio.** Texto blanco sobre un degradado claro con `text-shadow` daba 1.18:1 — exactamente lo mismo que el mismo texto sin sombra —, así que el informe no podía distinguir un texto ilegible de uno que la sombra hace legible. Tampoco vale creditar la sombra sin más: 1.4.3 compara el color del texto con el del fondo, y un halo es discutible. Se miden las **dos lecturas** y, cuando no coinciden, el veredicto es `revisar` con los dos números escritos: medido, una sombra apilada da 19.02:1 detrás de la letra frente a 1.15:1 sin ella, y eso es una decisión de la persona auditora, no del agente. Una sombra difuminada no llega al núcleo del glifo y sigue fallando, que es lo correcto.

**Y «no aplica» era tan afirmación como «cumple», sin nadie que la vigilara.** Las notas de cobertura bajaban un `cumple` a `revisar` cuando la medición estaba incompleta, pero dejaban intacto el `no-aplica`. Medido con un `<video>` dentro de un shadow root cerrado: 1.2.5 salía **«no aplica · La página no tiene ningún vídeo ni marco embebido de ninguna clase»** tres líneas por debajo de la nota en la que el propio agente informaba de ese shadow root sin explorar. El agente se contradecía a sí mismo en el mismo informe, y la plantilla del IRA se queda con el «No aplica», que es la casilla que cierra el criterio. Ahora una nota marcada `ocultaContenido` —la del shadow cerrado, que es el caso puro: su contenido no lo ve ninguna pasada— invalida todos los `no-aplica` de esa página. Los marcos no la llevan, porque cada marco se mide en su propia pasada y el cuaderno ya los cuenta como reproductores posibles: eso sería atar de más, y atar de más entierra barreras igual de bien que el silencio.

**Y en 2.4.4, «sin nombre» se contaba como «tiene nombre propio».** La expresión de nombres vagos va anclada entre `^` y `$` y no tiene alternativa vacía, así que un enlace sin nombre accesible —un icono sin `alt`, un `<svg>` sin título, un `<a href>` vacío— no casaba con ella, pasaba el filtro y la ficha firmaba **`cumple-parcial`** escribiendo «Ninguno de los 6 enlaces visibles se llama "Leer más"… **todos tienen nombre propio**». Medido sobre una página con cuatro de seis enlaces sin nombre: una afirmación falsa en la evidencia, con un veredicto casi conforme y `queMirar` vacío, es decir, diciéndole a quien audita que no hay nada que mirar en el criterio que más barreras masivas produce en una auditoría real (71 en visitspain). Ahora «sin nombre» es su propia clase, va al expediente antes que los vagos y la ficha queda pendiente de firma: un nombre que no existe no puede describir el destino. Y por el camino, el cálculo del nombre: el cuaderno tenía uno propio que se dejaba fuera `aria-labelledby`, con lo que un enlace nombrado así se leía como sin nombre — que con el arreglo anterior habría sido un falso positivo nuevo en la dirección contraria. Ahora el nombre lo calcula el motor, que ya tenía el cálculo completo.

**Y dos «no aplica» más que daban por único un supuesto que no lo era.** En **1.4.5** (imágenes de texto), el hero con el titular incrustado —que es *el* caso del criterio— casi nunca es un `<img>`: es un `background-image` en CSS. Una página cuya única imagen fuera de fondo firmaba «no aplica · no tiene imágenes visibles con contenido». Ahora, si el CSS declara imágenes de fondo, el criterio queda pendiente diciendo exactamente eso; un degradado, que no lleva texto, no lo activa. En **3.3.8** (autenticación accesible), `input[type=password]` no es el único campo de credencial: un acceso por código de un solo uso no lleva contraseña ninguna, y el criterio le aplica de lleno porque admite el código **solo si se puede pegar**. Firmaba «no hay proceso de autenticación que evaluar» sobre un formulario de acceso. Ahora se reconocen también los `autocomplete` que la especificación reserva para credenciales y los nombres de campo de código —hechos del marcado, no conjeturas—, y un buscador sigue sin ser un acceso.

**Y un guardia que no tapa un defecto vivo, sino una afirmación sin comprobar.** La capa de píxeles leía el color del fondo sin mirar su canal alfa. Con el driver de hoy no pasa nada —medido: Playwright compone la captura sobre el fondo de la página y el alfa sale 255 en todos los píxeles—, pero de ahí sale un ratio de contraste que acaba en un informe con efectos legales: si la captura llegara con transparencia, el color leído no sería el que se ve y el ratio estaría calculado contra un fondo que nadie tiene delante. Ahora, si aparece, no se dictamina y se dice por qué.

**Y la comprobación que se hacía a mano, ahora es un script.** `scripts/regresion-sitio.mjs` levanta un sitio, lo audita entero y escribe tres números que no deben moverse sin que alguien lo decida: barreras por criterio, subcriterios con veredicto sobre 55 y conformidad declarada. Con `--esperadas N` sale con código 1 si cambian. Cada refactor de los últimos meses se comprobó mirando la consola, y lo que se mira a mano se olvida.

**642 tests unitarios** (de 624) y 133 de integración, en verde.

### v0.40.0 — la letra del IRA, que decide en qué fila acaba cada barrera

El último módulo sin revisar era el de más riesgo legal: `oaw-letters.js` asigna el subcriterio `9.X.Y.Z-L` de la plantilla oficial, y la letra decide **en qué fila del informe acaba cada barrera**. Lo primero fue bueno: la tabla cubre los 55 criterios sin un hueco ni un solapamiento, y lo que no cubre devuelve `null` con su motivo en vez de rellenar. Lo demás, cuatro defectos confirmados ejecutando.

**La etiqueta se leía del primer tramo del selector, que es un antepasado.** En un selector descendente el primer token no es el elemento: los hallazgos de axe traen su propio selector mínimo (`main > img:nth-child(7)`) y los de medición la ruta canónica (`html > body > table:nth-of-type(1)`). Así que un `img` dentro de `main` se leía como «main» y 1.3.1 recibía la letra **-Q** con el motivo «el nodo es una región, navegación o encabezado» —una afirmación falsa sobre ese nodo— y una tabla con ruta canónica se leía como «html», perdiendo la señal que le daba su **-I**. Ahora se lee el último tramo, y la ruta canónica manda sobre el locator legible.

**La `-A` por defecto, que la cabecera del propio módulo condena.** Dice, con razón, que no se inventan letras y que es mejor dejar la casilla pendiente «en vez de colocar una -A por defecto que pasaría por buena» — y luego la colocaba. En 1.1.1 es correcto, porque su -A está documentada como el caso general; en **1.3.1 la -A es un caso concreto** («relación programática campo↔etiqueta, pares etiqueta/valor») y en 4.1.2 también («nombre y rol»), así que marcar ahí un hallazgo que no se ha podido clasificar afirmaba algo sobre él que nadie había comprobado. Ahora solo hay letra general donde está documentada; el resto devuelve `null` nombrando las letras posibles para asignarla a mano. Medido antes de endurecerlo: de los hallazgos que produce el motor, **ninguno** llegaba a esa rama. Y por el camino apareció la señal que faltaba: un **campo de formulario** en 1.3.1 es la letra -A por derecho propio, no por descarte.

**Un deslizador contaminaba la letra de todas las filas del criterio.** Esto solo se vio ejecutando el entregable completo. La letra de 4.1.2 se decidía con `finding.types`, que junta los tipos de todas las reglas del criterio en toda la página: un solo `role="slider"` sin `aria-valuenow` metía `aria-missing-state` en la lista y **las tres filas** de 4.1.2 salían con la letra -B («estados y propiedades»), incluidos un botón vacío y un `div` sin nombre, que son -A («nombre y rol»). Cada fila habla de un elemento, así que el tipo de regla viaja ahora pegado a su nodo —como ya hacía la evidencia— y cada fila recibe su letra.

**Y los hallazgos de axe no casaban con nada.** La clasificación por texto buscaba palabras españolas, y la evidencia de axe está en inglés («Form elements must have labels»), así que esos hallazgos caían en la letra por defecto. Pero traen el **id de la regla** que saltó, que es un hecho y no prosa: `list` habla de listas, `th-has-data-cells` de tablas, `aria-required-attr` de estados. Los ids salen de `axe.getRules()` de la versión instalada —ninguno inventado— y las reglas que no deciden el caso se dejan fuera a propósito, para que caigan en la rama que lo declara.

**624 tests unitarios** y 130 de integración, en verde.

### La misma lección, por séptima vez

Las siete son la misma: **el silencio y la conformidad se parecen demasiado en un informe**. Y las comprobaciones posteriores añadieron la cara B y el caso límite: el **ruido** tampoco informa —una atadura que aprieta donde sí se ha medido entierra las barreras igual de bien que el silencio— y lo más incómodo, que una afirmación falsa puede **fosilizarse en la suite**: el test que llevaba semanas en verde confirmando una barrera inexistente de 1.3.4 es el recordatorio de que un test comprueba lo que se le pidió comprobar, no lo que es verdad. Lo que cambia es dónde se esconde el silencio. En 2.2.2, en las filas de medios, en 4.1.3 y en 1.4.2 era un criterio que no emitía nada. Aquí es más fino: un `cumple` sobre un CSS que no se ha leído, un `no-aplica` sobre un formulario que no se ha podido ver, un `pasa` sobre el 4 % de los controles, un «Correcto» sobre siete décimas partes de la muestra. La regla de oro cubría el caso en blanco; ahora cubre también el caso **medido a medias**, que es el que de verdad se cuela: tiene veredicto, tiene evidencia y parece completo.

## Licencia

MIT © Jesús Fernández Abeledo (Suso) — [jesusaccesible.com](https://jesusaccesible.com)
