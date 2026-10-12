# Plan: ajustes completos

Estado: propuesta, sin implementar. Objetivo: ajustes más completos y mejor agrupados, con una sección *Advanced* para lo técnico.

## Qué existe hoy
- **Settings** (`SettingsPopover`, preferencias de app en `localStorage`, salvo decimales en la sesión): Appearance (tema), teclado de dibujo y edición, workspace al recuperar un plan, decimales (0–8), confirmaciones de borrado (medidas, valores, dimensiones).
- **View** (`ViewerDock`, por proyecto en `session.settings`): unidad de visualización, visualización de áreas, mostrar etiquetas / medidas / calibración.
- **Export** (`ExportDialog`): formato, datos CSV y columnas (`csvExport.columnOverrides`).
- **Constantes sin ajuste**: tolerancia de snap y de cierre de polígono (10 px, `snapping.ts`), zoom 0.1–8 (`coordinates.ts`), debounce de render (90 ms), autoguardado (`autosave.ts`).

## Principios
- Dos ámbitos y se ven: **App** (preferencia del equipo, `localStorage`) y **Proyecto** (viaja con el plan, `session.settings`). Cada ajuste vive en uno solo.
- Defaults = comportamiento actual; nada cambia si el usuario no toca nada.
- Un ajuste nuevo de proyecto exige migración de esquema (`schemaVersion`); uno de app, no.
- Cada ajuste: etiqueta corta, ayuda en tooltip, test y entrada en `docs/DESIGN.md`.

## Propuesta por sección

### Settings → Interface (app)
| Ajuste | Valores | Nota |
|---|---|---|
| Interface density | Comfortable / Compact | Alto de controles vía tokens `--control-height-*`. |
| Reduce motion | System / On | Respeta `prefers-reduced-motion` por defecto. |
| Show tooltips | On/Off | Útil para usuarios avanzados. |
| Default workspace on open | último / Scales / Measurements… | Generaliza el actual "Recovered plan workspace". |

### Settings → Measurements (app o proyecto según caso)
| Ajuste | Ámbito | Valores |
|---|---|---|
| Decimal places | proyecto | 0–8 (hecho) |
| Thousands separator | app | None / Space / Comma |
| Decimal separator | app | Point / Comma (ES) |
| Default unit for new plans | app | m, cm, mm, ft, in… |
| Default label content | proyecto | Nombre / Valor / Ambos |
| Area display | proyecto | ya existe en View |

### Settings → Drawing (app)
| Ajuste | Valores |
|---|---|
| Snap on by default | On/Off |
| Ortho on by default | On/Off (solo líneas y trazados) |
| Snap sensitivity | Low 6 / Normal 10 / High 16 px |
| Polygon close sensitivity | Low / Normal / High |
| Auto-return to Select after finishing | On/Off |
| Show crosshair cursor | On/Off |

### Settings → Files & saving (app)
| Ajuste | Valores |
|---|---|
| Autosave | On / Off (con aviso) |
| Autosave delay | 1 s / 3 s / 10 s |
| Ask before closing with unsaved changes | On/Off |
| Max saved projects shown | 10 / 25 / all |

### Settings → Confirmations (app)
Agrupar las tres confirmaciones actuales y añadir: confirmar al descartar puntos en dibujo, al sustituir calibración, al borrar proyecto (hoy siempre).

### View (proyecto)
Añadir a los actuales: grosor de línea (Thin/Normal/Thick), tamaño de etiqueta (S/M/L), opacidad del relleno de polígonos y nubes, mostrar nombre de clasificación en etiqueta, color de etiqueta automático por clasificación, rejilla de página (On/Off).

### Export (proyecto)
Persistir último formato/datos, nombre de archivo (plantilla `{project}-{date}`), incluir cabecera de unidades, separador CSV (`,` / `;` según locale).

### Advanced (app, plegado por defecto, aviso "can affect performance")
| Ajuste | Valores | Riesgo |
|---|---|---|
| Max zoom | 4× / 8× / 16× | Memoria de render. |
| Render quality | Balanced / Sharp (más resolución de raster) | Rendimiento. |
| Render debounce | 50–200 ms | Fluidez al hacer zoom. |
| Raster cache size | Small / Normal / Large | Memoria. |
| Undo history depth | 50 / 200 / unlimited | Memoria. |
| Hit-test tolerance | 4–16 px | Selección con ratón/táctil. |
| Number rounding | Half up / Half even | Coincidir con otro software. |
| Debug overlay (FPS, caché) | On/Off | Solo diagnóstico. |
| Export/Import settings (JSON) | botones | Copia entre equipos. |
| Reset all settings | botón con confirmación | Destructivo; no toca proyectos. |

## Implementación sugerida (fases)
1. **Infraestructura**: registro tipado de preferencias de app (`appPreferences.ts`) con clave, default, validador y hook único; sustituye los ficheros `*Preference.ts` sueltos. Sin cambio visible.
2. **Settings con pestañas/secciones**: Interface · Measurements · Drawing · Files · Advanced (sección plegable). El popover pasa a diálogo si supera ~8 filas.
3. **Drawing y Files** (ajustes de app, sin migración): wiring de snap/ortho por defecto, sensibilidades, autoguardado.
4. **Measurements y separadores**: formateo en `utils/format.ts` con locale configurable; tests de formato.
5. **View ampliado** (proyecto): requiere subir `schemaVersion` y migración; respetar goldens de export.
6. **Advanced**: zoom máximo, calidad y caché; ejecutar `perf:*` solo si se pide, sin ampliar presupuestos.

## Estado de la implementación
Hecho (rama `ui/polish`): infraestructura de preferencias, diálogo con navegación lateral (Interface, Measurements, Drawing, Confirmations, Advanced), separadores de miles/decimales por dispositivo, unidad por defecto de planos nuevos, snap/ortho por defecto, sensibilidad de snap y de cierre de polígono, reducir movimiento, tooltips, zoom máximo, historial de deshacer, retardo de render y "Reset settings".

Aplazado a propósito:
- Autoguardado (activar/retardo): riesgo de pérdida de datos.
- Densidad de la interfaz: riesgo de geometría (contratos de layout y rendimiento).
- Sección Files & saving.
- View ampliado y Export ampliado (ajustes de proyecto): requieren subir `schemaVersion` y migrar; respetar goldens.
- Exportar/importar ajustes.

## Decisiones tomadas
- Separadores de números: por dispositivo (`localStorage`), sin migración de esquema.
- Contenedor: diálogo con navegación lateral.

## Estado tras la sección View
Hecho: Settings → View (proyecto: unidad, área, Labels/Measurements/Calibration; dispositivo: grosor de línea y tamaño de etiqueta). El dock mantiene el acceso rápido. Todo sin migración de esquema.

## Estado tras la sección Canvas
Hecho: nueva sección Settings → Canvas (tras View) con las preferencias de dispositivo de apariencia: Line thickness, Label size, Fill opacity, Handle size, Label background y Page grid. View conserva solo "This project". Label content sigue en Measurements. Alturas medidas a 1280x800 (px): Interface 441, Measurements 280, Drawing 392, View 313, Canvas 326, Confirmations 248, Advanced 248.

## Estado Fase A (parcial)
Hecho (dispositivo, sin migración): Fill opacity, Handle size, Label background, After finishing (Drawing) y Zoom step (Interface); además Default zoom, Mouse wheel y Date format (Interface), Crosshair cursor, Live segment length y Finish on double-click (Drawing), Label content (Measurements) y Page grid (Canvas). Altura del panel de Ajustes fijada en 456 px (sección más alta: Interface, 441 px) para que ninguna sección haga scroll a 1280x800. Pendiente del resto de la Fase A.

## Plan: siguientes ajustes útiles
Ordenados por valor/riesgo. Ámbito: **D** = dispositivo (sin migración), **P** = proyecto (exige `schemaVersion` + migración + goldens). "Riesgo" indica qué contrato puede tocar.

### Fase A — Dispositivo, bajo riesgo (siguiente tanda recomendada)
| Ajuste | Dónde | Detalle / riesgo |
|---|---|---|
| Fill opacity (Light/Normal/Strong) | Canvas | Rellenos de polígono, rectángulo, elipse y nube. Hoy el alfa va dentro de `canvasVisualRoles`; hay que parametrizarlo sin cambiar el default. Riesgo: tests de roles visuales. |
| Handle size (Small/Normal/Large) | Canvas | Tamaño visible de vértices; la zona táctil (`interactionTargetScreenPx`) no cambia. Útil en táctil. |
| Show vertex handles on hover | Canvas | Solo al seleccionar (hoy) vs. también al pasar el ratón. |
| Label background (Solid/Translucent/None) | Canvas | Legibilidad sobre planos densos. |
| Page grid (On/Off) | Canvas | Cuadrícula sobre la página, no sobre el fondo del visor. |
| Default zoom on open (Fit page / Fit width / 100 %) | Interface | Aplica al abrir/cambiar de página. |
| Zoom step (Fine/Normal/Coarse) | Interface | Paso de los botones +/− y de la rueda; el rango lo marca "Maximum zoom". |
| Invert scroll zoom / Wheel behaviour (Zoom/Pan) | Interface | Ctrl+rueda = zoom en un modo y desplazamiento en otro. |
| Pan with Space / middle button | Interface | Afecta atajos del visor; probar con `shouldIgnoreViewerKeyboardShortcut`. |
| Auto-return to Select after finishing | Drawing | Hoy cada herramienta decide; unificar con ajuste. |
| Crosshair cursor | Drawing | Cursor en cruz mientras se dibuja. |
| Show length while drawing | Drawing | Etiqueta viva del segmento en curso. |
| Finish polygon on double click / Enter | Drawing | Alternativas de cierre; respetar teclado de dibujo. |
| Keep tool active after finishing | Drawing | Complementa al anterior (excluyentes: ofrecer un único select "After finishing: Select / Keep tool"). |
| Nudge step with arrows (1 px / 0.1 u / 1 u) | Drawing | Para teclado de dibujo; depende de `keyboardAuthoringEnabled`. |
| Default label content (Value / Name / Both) | Measurements | Hoy solo valor; leer de `measurementViewModels`. |
| Date and time format | Interface | Para "Saved …" y la biblioteca. |
| Language de números en exportación | Measurements | Mantener CSV con punto; solo informativo. |

### Fase B — Archivos y guardado (dispositivo; riesgo de datos, requiere tests de pérdida)
| Ajuste | Detalle |
|---|---|
| Autosave on/off y retardo (1/3/10 s) | Con aviso "los cambios no guardados se perderán". Hoy `autosave.ts` fija el comportamiento. Pruebas con fallos de IndexedDB. |
| Ask before closing with unsaved changes | `beforeunload`; solo si hay cambios sin guardar. |
| Saved projects shown (10/25/Todos) | Biblioteca de proyectos. |
| Auto-open last project | Al iniciar. Relacionado con "Recovered plan workspace". |
| Export/Import settings (JSON) | Botones en Advanced; validar con los validadores del registro. |
| Storage usage (solo lectura) | `navigator.storage.estimate()`; botón "Clear cache" con confirmación. |

### Fase C — Accesibilidad e interfaz (dispositivo)
| Ajuste | Detalle / riesgo |
|---|---|
| Interface density (Comfortable/Compact) | Toca tokens `--control-height-*` y tests de geometría/rendimiento; diferir hasta tener contrato claro. |
| Text size (100/110/125 %) | Escala de tipografía de UI; revisar overflow en diálogos. |
| High contrast | Tokens de color alternativos; comprobar contraste AA con tests. |
| Focus ring thickness | Pequeño; token `--focus-outline`. |
| Larger touch targets | Forzar `--target-coarse` aunque el puntero sea fino. |
| Sound/haptic feedback al cerrar polígono | Opcional; baja prioridad. |
| Show shortcuts hints in tooltips | Mostrar la tecla en el tooltip. |
| Keyboard shortcuts reference (solo lectura) | Sección "Shortcuts" con tabla; sin ajuste, solo ayuda. |

### Fase D — Proyecto (requiere migración y goldens)
| Ajuste | Detalle / riesgo |
|---|---|
| Default label content por proyecto | Viaja con el plan; exportaciones lo reflejan. |
| Colour labels by classification | Color de etiqueta/relleno según valor de clasificación; toca export anotado. |
| Show classification name in label | Cambia texto de etiqueta. |
| Rounding mode (Half up / Half even) | Solo si hace falta casar con otro software; toca goldens numéricos. |
| Export defaults (formato, datos, plantilla de nombre `{project}-{date}`, separador CSV) | Persistir último uso; los goldens de export no deben cambiar con defaults. |
| Per-page view overrides | Unidad o visibilidad por página; mayor cambio de modelo. |

### Fase E — Avanzado (dispositivo, plegado; no ampliar presupuestos de rendimiento)
Render quality (Balanced/Sharp), raster cache size, hit-test tolerance (4–16 px), debug overlay (FPS/caché). Validar con `perf:*` solo a petición expresa.

### Reglas para todas las fases
1. Default = comportamiento actual; sin cambios visibles si no se toca nada.
2. Cada ajuste: etiqueta corta, "?" si es ambiguo, validador en `appPreferences`, test en `SettingsDialog.test.tsx` y entrada en `docs/DESIGN.md`.
3. Un ajuste P exige subir `schemaVersion`, migrar y no tocar goldens; si algo cambia, parar y consultar.
4. Lo de acceso rápido (visibilidad, unidad, grosor, tamaño) vive también en el dock; el resto solo en Ajustes.
5. Orden sugerido: A → B (con tests de datos) → C → D → E.
