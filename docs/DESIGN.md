# Guía de diseño

Contrato visual de Plan Measure. Toda la rama `ui/polish` lo sigue: si un cambio visual no encaja aquí, se discute y se actualiza este documento primero.

Los tokens viven en `src/styles/tokens.css`. Los componentes base, en `src/components/ui/`.

## Principios

1. **Simplicidad.** Cada elemento justifica su presencia. Menos bordes, menos sombras, menos variantes.
2. **Estilo marcado y consistente.** Un solo lenguaje: superficies planas, divisores finos, acento azul único. El mismo elemento se ve igual en toda la app.
3. **Jerarquía clara.** El plano es el protagonista. La interfaz lo rodea con discreción. Solo la acción principal de cada contexto lleva énfasis.
4. **Pulido.** Alineación al píxel, estados completos (hover, activo, foco, deshabilitado, cargando), sin saltos de layout.
5. **Rendimiento.** Solo se anima `opacity` y `transform`. Nada de `backdrop-filter`, `filter`, `transition: all`, `will-change` ni sombras grandes. Se respeta `prefers-reduced-motion`.

## Alcance del pulido

Solo detalles visuales: CSS, tokens y marcado estrictamente necesario para estilar. Sin cambios de comportamiento, de flujo ni de layout estructural. Los contratos de `src/performance/` no se tocan.

## Reglas de uso de tokens

- Los módulos CSS **no** contienen colores, tamaños de fuente, radios, sombras ni `z-index` literales: se usan tokens. Excepción: `0`, `50%` y `1px` para divisores.
- Se usa siempre el nombre semántico (`--color-surface-panel`, `--font-size-base`). Los alias de compatibilidad (`--color-surface`, `--color-text`, `--font-size-sm`…) se migran y se eliminan al final.
- Los colores de datos (canvas, nubes de medición) viven en TS (`canvasVisualRoles.ts`, `cloudColors.ts`) y no forman parte del tema de la UI.
- Todo cambio de color se valida en tema claro **y** oscuro.

## Color

| Rol | Token |
|---|---|
| Fondo de la app | `--color-surface-shell` |
| Paneles | `--color-surface-panel` |
| Visor | `--color-surface-viewer` |
| Menús, popovers, tooltips | `--color-surface-raised` |
| Campos | `--color-surface-field` |
| Divisores | `--color-divider` |
| Texto | `--color-text-primary` / `-secondary` / `-disabled` |
| Acento (acción principal, selección) | `--color-accent` |
| Foco | `--color-focus-semantic` |
| Destructivo | `--color-danger-semantic` |
| Estados | `--color-status-{info,success,warning}` |

Reglas: un único acento. El rojo solo para acciones destructivas y errores. El estado nunca se comunica solo con color (acompaña icono o texto). Contraste mínimo AA.

## Tipografía

Una sola familia (`--font-family-sans`). Escala cerrada:

| Uso | Tamaño | Peso |
|---|---|---|
| Etiquetas secundarias, metadatos | 12 | 400/500 |
| Cuerpo y controles | 13 | 400/500 |
| Encabezados de panel | 14 | 600 |
| Identidad | 16 | 600 |
| Resultados numéricos | 24 | 600 |
| Títulos de pantalla (`--font-size-title`) | 22 | 600 |
| Cantidades (`--font-size-quantity`) | 20 | 600 |
| Micro: insignias y etiquetas mínimas (`--font-size-micro`) | 10 | 400/500 |

Pesos permitidos: 400, 500, 600. A 13 px el 600 se permite solo en títulos y valores de lista (nombres de fila, valores de grupo, títulos `h3`); el resto de 13 px es 400/500. Los `line-height` son siempre tokens `--line-height-*` (micro 12, secondary 16, base 18, heading 20, identity 22, quantity 24, result 28); sin valores sin unidad. No hay tamaños fuera de la escala (el glifo de insignia usa `--font-size-glyph-badge`, 7 px). Cifras tabulares (`font-variant-numeric: tabular-nums`) en mediciones y resultados.

## Espaciado y geometría

- Escala: 4, 8, 12, 16, 24, 32, 40, 48 (`--space-*`; 40 y 48 solo para pantallas vacías y tarjetas de bienvenida). Ningún `gap`/`padding`/`margin`/`inset` lleva px literales salvo `0` y `1px` de bordes o divisores; las medidas estructurales reutilizadas son `--geometry-*`.
- Radios: `--radius-control` (4) para controles, `--radius-overlay` (6) para overlays, `--radius-surface` (0) para paneles. `--radius-pill` (999px) para insignias y contadores en forma de píldora. Sin 2 px ni 9 px.
- Alturas de control: compacto 32, regular 40 (`--control-height-*`), objetivo táctil 44 en puntero grueso. Un mismo tipo de control tiene una sola altura en toda la app.
- Sin `min-height` literales (hoy hay `38px` en varios sitios).

## Elevación y capas

- Las superficies estructurales son planas: borde fino, sin sombra (`--shadow-structural`).
- Solo overlays flotantes (menús, popovers, tooltips, diálogos) llevan `--shadow-overlay`.
- Escala de `z-index` tokenizada (`tokens.css`); prohibidos los literales:

| Token | Valor | Uso |
|---|---|---|
| `--z-base` / `--z-raised` | 0 / 1 | Capas locales dentro de un componente |
| `--z-controls` | 2 | Barras y controles sobre el visor, foco local |
| `--z-feedback` | 3 | Avisos y escudos sobre el lienzo |
| `--z-cursor` | 4 | Cursores, paneles de páginas, lanzadores |
| `--z-panel` | 5 | Docks y paneles responsive |
| `--z-overlay` | 10 | Overlay de arrastrar y soltar |
| `--z-status` | 20 | Fila de estado de la app |
| `--z-loading` | 100 | Overlay de carga |
| `--z-popover` / `--z-tooltip` | 250 / 300 | Popovers y tooltips |

## Iconos

SVG inline, `viewBox` 20×20 como estándar, `currentColor`, escala cerrada de dos tamaños: 18 px (`--geometry-icon-size`, controles principales) y 16 px (`--geometry-icon-size-small`, iconos dentro de filas y paneles densos). No hay otros tamaños. Trazo trazo único de **1.5** (`--icon-stroke-width`; en CSS se usa el token, las máscaras `data:` llevan 1.5 literal).

## Componentes

Se usa siempre el componente de `src/components/ui/`. Los botones tipo chip o de barra de herramientas que hoy tienen CSS propio (`ContextToolbar`, `MeasurementPanel`) se alinean con `Button`/`IconButton` en radio, altura, estados y transición.

- **Button:** `primary` (una por contexto), `secondary`, `ghost`, `danger`, `dangerSecondary`. Compacto 32, regular 40.
- **IconButton:** cuadrado, icono 18, estados default / hover / pressed / foco.
- **Input / Select:** misma familia de reglas (`--font-size-base`, peso medium, borde, radio, foco, hover/activo/deshabilitado idénticos). Altura: regular (`--control-height-regular`) por defecto; compacta (`--control-height-compact`) en barras de herramientas y filtros. Todos los selects son el `Select` propio (compacto); no queda ningún `<select>` nativo ni CSS global de `select`.
- **Dialog, Popover, Menu, Tooltip:** `surface-raised`, `radius-overlay`, `shadow-overlay`. Dialog, Popover y Tooltip usan `composes: overlaySurface` (`ui/overlaySurface.module.css`).
- **Badge, Switch:** variantes por rol de color, sin variantes ad hoc.

### Patrones compartidos

- `ui/controlStates.module.css` (`composes`): `focusRing` (`:focus-visible`, usado por Button, IconButton, Input, AnchoredMenu) y `disabledSurface` (bloque deshabilitado de Button, IconButton, Input). Quien lo compone no repite esas reglas. El foco de Switch (`input + track`) replican los mismos valores sin `composes`.
- El par hover/activo de los neutros no se extrae: los selectores y la especificidad difieren entre componentes (`aria-disabled`, `data-disabled`, variantes danger/pressed). Se repite con los mismos tokens `--color-control-hover-*` / `--color-control-active-*`.
- `ui/overlaySurface.module.css` (`composes`): `overlaySurface` (borde, radio, fondo, texto, sombra de overlay).
- Tokens de geometría de componentes base: `--spinner-size`, `--badge-min-height`, `--switch-{width,height,thumb-size,thumb-offset,thumb-travel}`, `--dialog-width-{small,default,large}`, `--dialog-body-chrome`, `--tooltip-max-width`.
- Spinner de Button: aro circular (`border-radius: 50%`) de `--spinner-size`.
- Deshabilitado en el shell: `ToolRail .toolButton` replica los tokens de `disabledSurface` (usa `aria-disabled`, que el patrón no cubre). Una herramienta deshabilitada y seleccionada conserva `--color-selection-surface` para seguir identificándose.
- Patrón de menú (`AnchoredMenu`): padding `--space-4` y ítems sin separación (`gap: 0`); ítem de `--target-current` de alto, padding `0 --space-8`, radio de control y borde transparente; hover y activo solo rellenan (`--color-control-hover-surface` / `--color-control-active-surface`). El ítem marcado muestra el check en acento y la etiqueta con peso 500. `sectionLabel`: 12/16, peso 500, `--color-text-secondary`, sin mayúsculas, `--letter-spacing-overline` (0.04em); los separadores no iniciales llevan filo `--color-divider` a sangre del menú (margen negativo compensado en el padding horizontal).
- `Select` (`ui/Select`): capa fina sobre `AnchoredMenu` en modo selección (ítems `menuitemradio` con `checked`). Regla: todos los menús y formularios usan este Select propio, nunca `<select>` nativo en código nuevo. Disparador de `--control-height-compact`, borde `--color-divider`, `--radius-control`, fondo `--color-surface-field`, texto 13/18 peso 500 con elipsis, padding `0 --space-4 0 --space-8`; chevron SVG (`--color-text-secondary`, trazo `--icon-stroke-width`) que gira 180° al abrir. Hover/activo con tokens neutros de control; abierto, borde `--color-control-active-border`. Compone `focusRing` y `disabledSurface`. La lista iguala el ancho del disparador (`matchTriggerWidth` de `Popover`) y limita su alto con `--geometry-select-list-max-height` (280 px) y scroll. Con `labelledBy` el disparador anuncia etiqueta y valor (`aria-labelledby` = etiqueta + id); sin él usa `aria-label`. Es anidable en Popover/Dialog (Escape cierra solo la lista y devuelve el foco al disparador). Un `Popover` abierto desde dentro de un `<dialog>` se monta en ese `<dialog>` (no en `body`) para quedar en su capa superior y dentro del foco atrapado. `PdfViewer` no cancela la edición por teclado cuando el foco o el pointerdown van a un popover abierto desde sus controles. Limitación conocida: Tab sobre un ítem del Select dentro de un Modal con `trapFocus` no está resuelto.
- Migración de selects nativos: todos los selects usan `Select` (paneles, calibración, ayuda de geometría por teclado, exportación); el valor es siempre `string` y la conversión a número o enum se hace en el borde (`onChange`). El disparador lleva `data-select-trigger` y `shouldIgnoreViewerKeyboardShortcut` lo ignora como a un `<select>` nativo (las teclas no activan atajos del visor); `data-viewer-shortcuts="enabled"` se conserva por `triggerProps`. Helpers de test: `ui/selectTestUtils.ts` (`chooseSelectOption`, `selectOptionLabels`).
- Scroll interno (`ui/scrollSurface.module.css`, clase `scrollSurface`, vía `composes` junto al `overflow`): `scrollbar-width: thin` y `scrollbar-color` con el thumb `--color-scrollbar-thumb` (semitransparente, claro y oscuro) sobre pista transparente, para que se lea como superpuesto. No usa `scrollbar-gutter` ni `::-webkit-scrollbar`; en navegadores con barras clásicas la barra fina sigue ocupando unos píxeles al aparecer (no se compensa). Se aplica a Popover/AnchoredMenu/Select (listas con `max-height`), Dialog y los paneles con scroll interno (mediciones, takeoff, clasificación, escalas, páginas, exportación). Sin transiciones de opacidad ni `filter`.
- Selectores basados en `AnchoredMenu` (cambio de módulo del panel, escala activa del dock, valor de clasificación en asignación) usan `matchTriggerWidth`: la lista nunca es más estrecha que el disparador. Los menús de acciones de icono no. En `Select`, los hijos del disparador llevan `pointer-events: none` para que el botón sea el único objetivo del puntero y el cursor sea uniforme.
- Ajustes (`SettingsPopover`): popover de `--geometry-settings-popover-width` (360 px, acotado al viewport) con padding 0 y bloques apilados. Cabecera: padding `16 16 12`, filo inferior `--color-divider`, título 14/20 peso 600. Secciones: padding `12 16`, separadas por divisor de 1 px a sangre completa; su cabecera es 12/16 peso 500, `--color-text-secondary` y `--letter-spacing-overline`, con `--space-4` de margen inferior. Fila de ajuste: grid `minmax(0,1fr) auto`, gap 16, `--control-height-regular` de alto mínimo, padding vertical 4, sin hover de fila; etiqueta 13/18 peso 500 y descripción 12/16 peso 400 sin separación extra. Los selects usan `Select` con anchos `--geometry-select-width-narrow` (72 px, decimales) y `--geometry-select-width-regular` (148 px, espacio de trabajo); la etiqueta conserva `htmlFor` y se vincula con `labelledBy`. El segmentado Appearance solo comparte altura (`--control-height-compact`) y tipografía 13/18.
- Popover "View settings" del dock (`ViewerDock`): misma jerarquía que Ajustes. Padding 0; cabecera `16 16 12` con filo inferior, título 14/20 peso 600 y subtítulo 12/16 secundario; bloque de selects y bloque de interruptores (padding `12 16`) separados por divisor a sangre completa. Filas de `--control-height-regular`, sin hover de fila; etiqueta 13/18 peso 500, descripción 12/16 peso 400 secundario. Display unit y Polygon area usan `Select` de `--geometry-select-width-regular` (label con `htmlFor` y `labelledBy`); a 420 px o menos la fila se apila y el Select ocupa el 100 %. Se eliminó `--geometry-viewer-unit-select-width`.
- Switch (estilo iOS compacto): pista 36x20 px sin borde, `--radius-pill`; pulgar circular de 16 px (`--switch-thumb-size`) con desfase 2 px y recorrido 16 px (36 - 16 - 2*2). OFF `--color-switch-off-track` (hover `--color-control-active-border`, activo `--color-text-secondary`); ON `--color-accent` (hover/activo `--color-accent-{hover,active}-semantic`). Pulgar `--color-switch-thumb` con `--shadow-switch-thumb`: es la única sombra fuera de los overlays. Solo anima `transform` y colores; objetivo táctil de 44 px en puntero grueso.
- Switch deshabilitado: `--opacity-disabled` sobre la pista (el resto de controles usa colores deshabilitados porque tienen superficie propia; el Switch conserva sus colores de estado atenuados).
- Anillos inset para controles sin borde: `--ring-inset-hover` y `--ring-inset-active` (1 px, mismos colores que el borde hover/activo de los neutros). Se usan en lugar de `box-shadow: inset` literal.
- Anillo halo: `--ring-halo` (`--halo-width` 2 px, color `--color-surface-panel`) separa del fondo las marcas de UI dibujadas sobre el lienzo (cursor de teclado del visor).
- Geometría del visor (`--geometry-viewer-*`, `--geometry-keyboard-cursor-*`, `--geometry-context-{name-max,rename}-*`, `--geometry-pressed-mark-size`, `--geometry-separator-height`): anchos escalonados de los disparadores del dock (página, escala) por container query, anchos de popover, tamaño y brazos del cursor de teclado (los brazos se derivan con `calc` del tamaño, el trazo y el alcance). `--geometry-viewer-dock-gap-compact` (2 px) es el hueco y el relleno del dock en contenedores estrechos.
- Superficies flotantes del visor (dock, aviso de edición, ayuda de teclado, nombre completo de escala) usan `composes: overlaySurface`. Los disparadores del dock (`pageTrigger`, `scaleTrigger`, `viewTrigger`) componen `focusRing`, y página y vista también `disabledSurface`; `scaleTrigger` replica sus tokens para `aria-disabled`.
- Paneles de mediciones (`features/measurements`): geometría propia en `--geometry-measurement-*` (anchos de etiqueta y popover, alto máximo de listas, marcador de selección, marca de estado vacío, barra de aviso), `--geometry-icon-size-small` (16 px, iconos de fila, grupo y disclosure), `--geometry-count-badge-size`, `--geometry-swatch-size`, `--geometry-disclosure-caret-size` (flecha dibujada con bordes; su trazo es `--icon-stroke-width` en px) y `--line-height-quantity`. `--color-swatch-edge` es el filo interior de las muestras de color de nube (dato, no tema); par claro/oscuro: `rgba(0, 0, 0, 0.12)` / `rgba(255, 255, 255, 0.24)`. Los disparadores de clasificación, el botón de barra del panel, `itemMove` y las muestras componen `focusRing` (y `disabledSurface` los disparadores y el botón de barra; el área de notas replica los tokens); las muestras de color se atenúan con `--opacity-disabled` porque son color de dato (excepción al deshabilitado sin opacity).
- Clasificación, calibración, páginas y exportación (capa 5b): geometría en tokens `--geometry-{selection-indicator-width,checkbox-size,checkbox-mark-*,calibration-*,scale-add-menu-max-width,page-browser-width,page-goto-input-width,page-thumbnail-*,export-*}` y `--dialog-width-export` (1040 px, ancho propio de ExportDialog; el resto de diálogos usan small/default/large). `--geometry-selection-indicator-width` (2 px) es el grosor del subrayado de pestañas y del borde de la página activa. La marca del checkbox se dibuja con bordes de `calc(var(--icon-stroke-width) * 1px)`. Las etiquetas de campo a 12/13 px usan peso 500 (semibold solo en títulos y valores de lista). `ScaleCheckPanel` compone `overlaySurface` (barra y resultado de comprobación). Los selects de formularios (calibración, exportación, ayuda de teclado) son `Select`. Los disparadores con selectores anidados (`.valueList .valueChipTrigger`) no pueden usar `composes` y replican los tokens de `focusRing`.
- Transiciones: dos tokens. `--transition-interactive` anima colores (`background-color`, `border-color`, `color`); `--transition-transform` anima `transform`. Ningún componente anima `opacity` mediante estos tokens.

### Estados obligatorios

Todo control interactivo define: reposo, hover, activo/pulsado, `:focus-visible` (`--focus-outline`, siempre visible, nunca eliminado), deshabilitado y, si procede, cargando. Selección y activación usan acento; hover usa `--color-control-hover-*`.

## Movimiento

Una sola duración y curva (`--transition-interactive`, 120 ms ease). Se aplica a `background-color`, `border-color`, `color`, `opacity` y `transform`. Sin otras animaciones salvo el spinner. `prefers-reduced-motion` las anula.

## Deuda visual detectada (orden de ataque)

1. Tokenizar `z-index` y eliminar `min-height: 38px`.
2. Escala tipográfica: eliminar tamaños raw y el `font-weight: 650`.
3. Radios fuera de escala (9 px, 2 px).
4. Trazo de iconos unificado a 1.5.
5. Alturas de control: `Select` frente a `Input`.
6. Transiciones `transform` sueltas → `--transition-interactive`.
7. Botones tipo chip/toolbar alineados con `ui/Button`.
8. Sombras `inset`/anillos raw (`AppShell`, `PdfViewer`) → tokens.
9. Retirar alias de compatibilidad (colores y tamaños) cuando ya no se usen.

## Capas de trabajo

Una capa = un PR pequeño, verificado en claro y oscuro, con `npm run lint`, `npm test` y `npm run build` en verde.

1. Fundamentos: tokens, escala de capas, tipografía, alias.
2. Componentes base (`components/ui/`).
3. Shell: barra superior, paneles, barra contextual.
4. Visor y herramientas.
5. Paneles de funcionalidad (mediciones, clasificación, calibración).
6. Diálogos, menús y estados vacíos/carga/error.
7. Revisión final: coherencia, accesibilidad, rendimiento.
