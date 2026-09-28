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
npm test                    # suite pura (node --test), sin navegador — 311 tests
npm run test:integracion    # integración con Chromium (Playwright) — 63 tests
npm run bench               # banco de precisión accname contra corpus WPT
npm run smoke               # humo del artifact generado, en Chromium real
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

### Lo que sigue pendiente

- **La transcripción real de NVDA** — el camino está montado y probado sin lector; falta lanzar el workflow desde Actions y guardar el fixture con `scripts/fixture-nvda.mjs`.

## Licencia

MIT © Jesús Fernández Abeledo (Suso) — [jesusaccesible.com](https://jesusaccesible.com)
