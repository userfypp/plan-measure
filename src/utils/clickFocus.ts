/**
 * What a press gives focus to in Chrome and Firefox. Safari (and every WebKit) leaves focus on the
 * page body when a button, link, checkbox or radio is pressed, so the trigger of a dialog or menu is
 * never "the focused element", Tab after a click starts over from the page's first control, and
 * everything keyed to focus (returning focus after Esc, keyboard shortcuts scoped to a panel, the
 * managed Tab sequence) works from the wrong place. This hands focus to the pressed control the way
 * the other browsers do, so the app sees one behaviour. Elements that already take focus on a press
 * (text fields, selects, anything with a tabindex) are left to the browser.
 */
const PRESS_FOCUSABLE =
  'button, a[href], summary, input:is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="file"])';

function pressedControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(PRESS_FOCUSABLE);
  if (!control || control.matches(":disabled") || control.closest("[inert]")) return null;
  return control;
}

/**
 * Focuses the control a primary-button press started and ended on, once the browser has done its
 * own default, so a browser that already focused it is left alone. A page that cancels `mousedown`
 * to keep focus where it is (a toolbar that must not blur a text field) is respected. Runs before
 * `click` handlers, so a handler that moves focus (opening a dialog) still has the last word.
 * Returns the cleanup.
 */
export function installClickFocus(doc: Document = document): () => void {
  let pressed: HTMLElement | null = null;

  const onMouseDown = (event: MouseEvent) => {
    pressed = event.button === 0 && !event.defaultPrevented ? pressedControl(event.target) : null;
  };
  const onMouseUp = (event: MouseEvent) => {
    const control = pressed;
    pressed = null;
    if (!control || event.button !== 0 || pressedControl(event.target) !== control) return;
    if (!control.isConnected || doc.activeElement === control) return;
    control.focus({ preventScroll: true });
  };

  doc.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("mouseup", onMouseUp, true);
  return () => {
    doc.removeEventListener("mousedown", onMouseDown);
    doc.removeEventListener("mouseup", onMouseUp, true);
  };
}
