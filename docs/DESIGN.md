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

- Escala: 4, 8, 12, 16, 24, 32 (`--space-*`). Los `1px`/`2px` sueltos de gap se sustituyen por la escala.
- Radios: `--radius-control` (4) para controles, `--radius-overlay` (6) para overlays, `--radius-surface` (0) para paneles. Sin 2 px ni 9 px.
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

SVG inline, `viewBox` 20×20 como estándar, tamaño visual 18 px (`--geometry-icon`), `currentColor`, trazo único de **1.5** (hoy hay 1.4, 1.5, 1.6 y 1.8). Los iconos de 24×24 se redibujan o se escalan al estándar.

## Componentes

Se usa siempre el componente de `src/components/ui/`. Los botones tipo chip o de barra de herramientas que hoy tienen CSS propio (`ContextToolbar`, `MeasurementPanel`) se alinean con `Button`/`IconButton` en radio, altura, estados y transición.

- **Button:** `primary` (una por contexto), `secondary`, `ghost`, `danger`, `dangerSecondary`. Compacto 32, regular 40.
- **IconButton:** cuadrado, icono 18, estados default / hover / pressed / foco.
- **Input / Select:** misma altura, borde y foco. `select` no puede diferir del `Input`.
- **Dialog, Popover, Menu, Tooltip:** `surface-raised`, `radius-overlay`, `shadow-overlay`.
- **Badge, Switch:** variantes por rol de color, sin variantes ad hoc.

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
