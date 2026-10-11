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

Pesos permitidos: 400, 500, 600. No hay tamaños fuera de la escala (el glifo de insignia usa `--font-size-glyph-badge`, 7 px). Cifras tabulares (`font-variant-numeric: tabular-nums`) en mediciones y resultados.

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

SVG inline, `viewBox` 20×20 como estándar, tamaño visual 18 px (`--geometry-icon`), `currentColor`, trazo único de **1.5** (`--icon-stroke-width`; en CSS se usa el token, las máscaras `data:` llevan 1.5 literal). Los iconos de 24×24 se redibujan o se escalan al estándar: `ToolIcon` (viewBox 24, pintado a 18 px) usa `strokeWidth` 1.8, que equivale visualmente a 1.5 sobre viewBox 20 (1.5 × 24/20).

## Componentes

Se usa siempre el componente de `src/components/ui/`. Los botones tipo chip o de barra de herramientas que hoy tienen CSS propio (`ContextToolbar`, `MeasurementPanel`) se alinean con `Button`/`IconButton` en radio, altura, estados y transición.

- **Button:** `primary` (una por contexto), `secondary`, `ghost`, `danger`, `dangerSecondary`. Compacto 32, regular 40.
- **IconButton:** cuadrado, icono 18, estados default / hover / pressed / foco.
- **Input / Select:** misma familia de reglas (`--font-size-base`, peso medium, borde, radio, foco, hover/activo/deshabilitado idénticos). Altura: regular (`--control-height-regular`) por defecto; compacta (`--control-height-compact`) en barras de herramientas y filtros. El `select` global es compacto; los contenedores con `select` en formularios lo ajustan localmente.
- **Dialog, Popover, Menu, Tooltip:** `surface-raised`, `radius-overlay`, `shadow-overlay`. Dialog, Popover y Tooltip usan `composes: overlaySurface` (`ui/overlaySurface.module.css`).
- **Badge, Switch:** variantes por rol de color, sin variantes ad hoc.

### Patrones compartidos

- `ui/controlStates.module.css` (`composes`): `focusRing` (`:focus-visible`, usado por Button, IconButton, Input, AnchoredMenu) y `disabledSurface` (bloque deshabilitado de Button, IconButton, Input). Quien lo compone no repite esas reglas. El `select` global (CSS no modular) y el foco de Switch (`input + track`) replican los mismos valores sin `composes`.
- El par hover/activo de los neutros no se extrae: los selectores y la especificidad difieren entre componentes (`aria-disabled`, `data-disabled`, variantes danger/pressed). Se repite con los mismos tokens `--color-control-hover-*` / `--color-control-active-*`.
- `ui/overlaySurface.module.css` (`composes`): `overlaySurface` (borde, radio, fondo, texto, sombra de overlay).
- Tokens de geometría de componentes base: `--spinner-size`, `--badge-min-height`, `--switch-{width,height,thumb-size,thumb-offset,thumb-travel}`, `--dialog-width-{small,default,large}`, `--dialog-body-chrome`, `--tooltip-max-width`.
- Spinner de Button: aro circular (`border-radius: 50%`) de `--spinner-size`.
- Deshabilitado en el shell: `ToolRail .toolButton` replica los tokens de `disabledSurface` (usa `aria-disabled`, que el patrón no cubre). Una herramienta deshabilitada y seleccionada conserva `--color-selection-surface` para seguir identificándose.
- Switch deshabilitado: `--opacity-disabled` sobre la pista (el resto de controles usa colores deshabilitados porque tienen superficie propia; el Switch conserva sus colores de estado atenuados).
- Anillos inset para controles sin borde: `--ring-inset-hover` y `--ring-inset-active` (1 px, mismos colores que el borde hover/activo de los neutros). Se usan en lugar de `box-shadow: inset` literal.
- Anillo halo: `--ring-halo` (`--halo-width` 2 px, color `--color-surface-panel`) separa del fondo las marcas de UI dibujadas sobre el lienzo (cursor de teclado del visor).
- Geometría del visor (`--geometry-viewer-*`, `--geometry-keyboard-cursor-*`, `--geometry-context-{name-max,rename}-*`, `--geometry-pressed-mark-size`, `--geometry-separator-height`): anchos escalonados de los disparadores del dock (página, escala) por container query, anchos de popover, tamaño y brazos del cursor de teclado (los brazos se derivan con `calc` del tamaño, el trazo y el alcance). `--geometry-viewer-dock-gap-compact` (2 px) es el hueco y el relleno del dock en contenedores estrechos.
- Superficies flotantes del visor (dock, aviso de edición, ayuda de teclado, nombre completo de escala) usan `composes: overlaySurface`. Los disparadores del dock (`pageTrigger`, `scaleTrigger`, `viewTrigger`) componen `focusRing`, y página y vista también `disabledSurface`; `scaleTrigger` replica sus tokens para `aria-disabled`.
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
5. Alturas de control: `select` frente a `Input`.
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
