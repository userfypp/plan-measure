/**
 * Mide el ancho que ocupa una barra de scroll fina (`scrollbar-width: thin`) y lo publica en
 * `--scrollbar-size`. Es 0 cuando las barras ya son overlay (macOS/Safari). Los contenedores de la
 * barra lateral reservan ese hueco con `scrollbar-gutter: stable` y lo restan de su padding derecho,
 * de modo que el ancho útil es idéntico con y sin overflow.
 */
export function publishScrollbarSize(doc: Document = document): number {
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;width:64px;height:64px;overflow:scroll;scrollbar-width:thin";
  doc.body.appendChild(probe);
  const size = Math.max(0, probe.offsetWidth - probe.clientWidth);
  probe.remove();
  doc.documentElement.style.setProperty("--scrollbar-size", `${size}px`);
  return size;
}
