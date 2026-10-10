# Rendimiento de Plan Measure

La protección se divide en tres capas. Los conteos deterministas y el tamaño se
comprueban en CI. El benchmark de navegador se ejecuta aparte: tarda varios
minutos y sus resultados dependen del equipo, la temperatura, el navegador y la
carga de fondo. Un fallo debe investigarse; no es motivo para ampliar presupuestos
o regenerar automáticamente la línea base.

## 1. Conteos en Vitest

`npm test` incluye `src/performance/` y las fixtures golden de etiquetas. No usa
límites de milisegundos. Las sesiones sintéticas tienen una semilla fija y 5.000
mediciones. Protege:

- Panel sin agrupar y agrupado: como máximo 40 filas y 1.000 nodos DOM montados.
- Índice ID→medición y agrupación: lecturas de ID acotadas a 6×N; el coste entre
  1.000 y 5.000 filas no crece más de 5,1×.
- Culling: viewport fijo de 300×300 monta como máximo 50 formas de 5.000,
  conservando una medición seleccionada fuera del viewport.
- Comandos de sesión: 5.000 consumidores no reciben notificaciones por cambios
  de preferencias, edición o undo; se mantiene el estado y la semántica actual.
- Autosave: exactamente una serialización JSON para preparar y escribir el
  snapshot; verifica también la sesión persistida.
- CSV: cada lote contiene como máximo 200 filas, 25 cesiones para 5.000 filas,
  igualdad byte a byte con el generador canónico y SHA-256 fijo.
- Etiquetas: salida golden determinista para impedir cambios de posiciones,
  prioridades y visibilidad. Con 5.000 mediciones exige una ejecución del layout
  por zoom nuevo y ninguna adicional por pan; no presupone una caché global ni
  una transformación transitoria que alteren esas salidas.

Estos tests no representan el coste de pintar en una GPU real. El test de montaje
Konva usa un renderer simulado para contar formas; la tercera capa observa el
montaje en la aplicación real. Un fallo de hash/golden exige revisar el contrato,
no aceptar un snapshot nuevo sin explicación.

## 2. Tamaño de JavaScript

```sh
npm run build
npm run perf:size
npm run perf:selftest
```

`perf/size.mjs` lee el JS de `dist/index.html` y recorre sus imports estáticos,
excluyendo `import()`. El principal debe pesar ≤480.000 bytes y ≤140.000 bytes
gzip. El conjunto de JS inicial debe pesar ≤511.660 bytes: la referencia original
es 487.295 bytes (principal + runtime + format) con un 5 % de margen. Son bytes
decimales, no KiB. El límite no incluye CSS ni recursos de demostración.

También rechaza chunks PDF, PDF worker, pdf-lib/annotatedPdf y XLSX en ese grafo.
El chunk `es-*.js` corresponde actualmente al entry ESM de pdf-lib y se protege
explícitamente. También incorpora precargas `modulepreload` declaradas en HTML.
La tercera capa vigila las peticiones reales antes de abrir un PDF. Los nombres
de chunks son un indicador; si cambia la estrategia de empaquetado, hay que
revisar ambos detectores. Las dependencias incorporadas al principal siguen
sujetas al presupuesto de bytes.

`perf:selftest` prueba los verificadores con presupuestos infringidos: +1 byte,
import estático de pdf-lib, +31 % de pausas/long tasks, muestras incompletas y FPS
por debajo del mínimo (aviso normal y fallo estricto).
Se ejecuta con Node, fuera de Vitest, y no necesita Playwright.

## 3. Benchmark e2e separado

```sh
npm ci --prefix perf
./perf/node_modules/.bin/playwright install chromium
npm run build
npm run perf:e2e
```

Las únicas dependencias adicionales están en `perf/package.json` y su lockfile;
no se añaden dependencias de producción ni al package del proyecto. Requiere
Node 24. Por defecto inicia un preview propio en el puerto 4183 y lo cierra al
terminar. `PLAN_MEASURE_REPO` permite medir otro checkout ya construido;
`PERF_PORT` cambia el puerto. `PERF_URL` permite un preview existente, cuya
actualización queda a cargo de quien ejecuta el test.

El benchmark genera los PDFs F y C en `perf/.tmp/`, ignorado por Git. C contiene
un raster gris A0 de 9.933×14.043 píxeles, 16 niveles de ruido determinista y
ASCII85/Flate, aproximadamente 95 MiB. No usa padding artificial ni copia
fixtures del harness externo. Las sesiones usan la geometría determinista del
harness anterior: líneas, polilíneas y polígonos de 24 vértices. Se conserva
semilla 20261009. La fase de anotaciones reabre la sesión de IndexedDB; si el
motor no puede persistir Blobs, declara explícitamente el seed en memoria. Ese
fallback permite medir pintura, pero no demuestra recuperación ni CAS.

Cada una de las cinco muestras usa un contexto nuevo, Chromium a 1440×900, DPR
2, CPU 1x y 4x. Para M1000 y M5000 mide zoom de rueda, pan de botón central, drag
de vértice, primera exportación CSV después del drag, cierre del diálogo CSV y apertura del panel. CSV
incluye la descarga inicial del chunk del diálogo. También abre C a ambas tasas
de CPU y mide heap después de cargar. Comprueba que pan y drag cambien la sesión
visual y que el zoom tenga transformaciones observadas; los errores de página
hacen fallar la ejecución.

Registra nodos DOM, IDs de formas montadas, número de long tasks, máxima pausa,
heap, duración y FPS rAF. El conteo de formas recorre ambas raíces React (DOM y Konva) y los IDs de props
`measurement`; un cambio de estructura debe actualizar el probe.
Long tasks y pausa máxima incluyen 350 ms de consolidación posterior al gesto;
FPS y duración terminan al completar la acción. Pan guarda además tiempos crudos
de adquisición (`mouse.down`) y fin (`mouse.up`), incluidos los roundtrips de CDP;
son diagnósticos y no añaden presupuestos de tiempo. No mide RSS, pico de memoria ni
frames efectivamente presentados por la GPU.

Antes de cada contexto corre siete muestras de un microbenchmark de operaciones
enteras y usa su mediana. Las duraciones se normalizan por el cociente entre
calibración de referencia y actual; FPS por el inverso. Conteos y heap no se
normalizan. Esta corrección reduce diferencias de CPU; no elimina diferencias
de GPU, red, GC, SO ni el coste de automatización, y debe tratarse como una señal
secundaria.

Compara medianas de cinco muestras con `perf/baseline.json`. Falla ante empeoramiento

> 30 % de métricas (para conteos pequeños se toleran 2 long tasks, 10 formas o 20
> nodos adicionales). FPS falla con caída >30 %. En modo normal, los objetivos
> absolutos M1000/4x ≥30 FPS y M5000/1x ≥30 FPS sobre la mediana real sin normalizar
> (`rawMedianFps`) producen avisos visibles en consola y en el resumen de GitHub
> Actions, sin bloquear la ejecución. La base inicial sigue por debajo de ambos.
> Solo el modo estricto exige además esos mínimos:

```sh
npm run perf:e2e:strict
# Equivalente: npm run perf:e2e -- --strict
```

Ambos modos fallan ante regresiones relativas, muestras incompletas o errores de
interacción, arranque y PDF. La calibración no puede convertir un mínimo real
incumplido en un objetivo alcanzado. Actualizar la base no cambia los mínimos.
`perf/results/latest.json` guarda las muestras crudas y medianas; no se versiona.
La base versionada incluye navegador, fixtures, calibración, commit de la fuente,
diff pendiente, Node/SO y hashes SHA-256 de index.html y los chunks iniciales para
identificar el build e interpretar diferencias. Si `sourceDirty` es verdadero, el
commit por sí solo no describe la fuente; los hashes identifican el artefacto medido.
Estos datos son informativos: cambiar de commit, tener un diff de fuente o hacer
merge a main no invalida la comparación ni exige regenerar la base. El comparador
valida el esquema, las muestras, los escenarios y las métricas, no esos metadatos.

Para diagnóstico rápido, sin comparar ni actualizar la línea base:

```sh
PERF_SAMPLES=1 PERF_COUNT=1000 PERF_CPU=1 PERF_SKIP_PDF=1 npm run perf:e2e
```

Los filtros `PERF_*` producen una ejecución parcial y se anuncian como tal. No
pueden crear una línea base. `PERF_BROWSER_CHANNEL=chrome` permite investigar un
Chromium instalado; registrar un navegador distinto exige declarar esa diferencia.

## Cómo interpretar y actualizar una línea base

Primero revisa que `dist` corresponda al commit, que se ejecuten los cinco casos
por escenario y que no haya otras pruebas compitiendo por recursos. Compara los
conteos antes de atribuir un fallo a ruido de FPS. Una subida de DOM/formas suele
indicar pérdida de virtualización/culling; una subida de long tasks con conteos
estables apunta a trabajo síncrono adicional. Consulta calibración, navegador y
muestras crudas y repite en la misma máquina, sin editar la base.

```sh
npm run perf:update-baseline
```

Este es el único comando que escribe la línea base y exige la matriz completa
con cinco muestras. Es legítimo usarlo tras una mejora verificada o un cambio
intencional del método/entorno documentado con comparaciones y revisión del diff.
No es legítimo hacerlo para esconder una regresión. Los avisos de objetivos
incumplidos se conservan. El comando de actualización solo registra evidencia: ejecuta después
`npm run perf:e2e` para verificar presupuestos.

El workflow `performance.yml` ejecuta tamaño/selftests en PR y main; e2e en modo
normal por `workflow_dispatch` y cron semanal. El modo estricto es optativo para
exigir el objetivo absoluto cuando se alcance. Los runners compartidos son ruidosos y la
normalización no los convierte en laboratorio. Su fallo requiere confirmación
antes de aceptar nuevas referencias. Nunca actualiza la base automáticamente.
Los escenarios son sintéticos; CPU 4x no identifica un dispositivo físico.
El WebKit de Playwright no equivale a Safari; esta capa automatizada usa Chromium.
