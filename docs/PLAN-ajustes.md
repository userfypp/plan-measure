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
