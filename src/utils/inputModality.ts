/** Attribute of the root that says which input the user used last; read by the focus rules of controlStates.css. */
export const INPUT_MODALITY_ATTRIBUTE = "data-input-modality";

type InputModality = "keyboard" | "pointer" | "text";

/**
 * Whether what is focused now is the keyboard's doing. False while the last input was a press
 * ("pointer" or "text"): the browser still calls `:focus-visible` the focus a script hands back
 * after Esc closes a menu or panel, but nothing should react to it as keyboard focus (no ring, no
 * tooltip). True before the first press or Tab, so the browser decides.
 */
export function isKeyboardFocus(doc: Document = document): boolean {
  const modality = doc.documentElement.getAttribute(INPUT_MODALITY_ATTRIBUTE);
  return modality !== "pointer" && modality !== "text";
}

const LISTENER_OPTIONS = { capture: true, passive: true };

/** The fields the stylesheet gives a ring after a press; keep in step with controlStates.css. */
const TEXT_FIELD =
  'textarea, input:is(:not([type]), [type="text"], [type="search"], [type="number"], [type="email"], [type="password"], [type="tel"], [type="url"])';

/**
 * What a key can navigate or activate, the targets that count when the user arrows or presses
 * Enter or Space on them. A text field is left out (those keys edit its text), and so is the
 * viewer, where they pan and nudge.
 */
const CONTROL =
  'button, a[href], select, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], input:is([type="checkbox"], [type="radio"], [type="range"])';

const CONTROL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Enter",
  " ",
]);

/**
 * The focus ring is for the keyboard, but each browser guesses by itself when a focused control
 * deserves one, and Safari guesses yes for what script focuses after a click: the viewer, a menu
 * or panel that has just opened, the trigger a closed dialog gives focus back to. This replaces the
 * guess with a rule. A press marks the root "pointer" (or "text" when it lands in a text field),
 * Tab (or Shift+Tab) marks it "keyboard", and so do the arrows, Home, End, Page Up and Down, Enter
 * and Space on a control, and the stylesheet draws no ring while it says "pointer" and none but a
 * pressed text field's while it says "text". Escape never marks it: closing a menu or panel hands
 * focus back, and that is not the keyboard's doing after a press. Before the first press the root
 * is unmarked and the browser decides, so tabbing into the page from the address bar still shows
 * the ring. It writes one attribute and never touches React state. Returns the cleanup.
 */
export function installInputModality(doc: Document = document): () => void {
  const root = doc.documentElement;

  function mark(modality: InputModality) {
    if (root.getAttribute(INPUT_MODALITY_ATTRIBUTE) !== modality) {
      root.setAttribute(INPUT_MODALITY_ATTRIBUTE, modality);
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Ctrl, Cmd and Alt + Tab switch browser tabs or apps instead of moving focus, and with them
    // the other keys are shortcuts.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Tab") {
      mark("keyboard");
    } else if (CONTROL_KEYS.has(event.key)) {
      const target = event.target;
      if (target instanceof Element && target.closest(CONTROL)) mark("keyboard");
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    mark(target instanceof Element && target.matches(TEXT_FIELD) ? "text" : "pointer");
  };

  doc.addEventListener("keydown", onKeyDown, LISTENER_OPTIONS);
  doc.addEventListener("pointerdown", onPointerDown, LISTENER_OPTIONS);

  return () => {
    doc.removeEventListener("keydown", onKeyDown, LISTENER_OPTIONS);
    doc.removeEventListener("pointerdown", onPointerDown, LISTENER_OPTIONS);
    root.removeAttribute(INPUT_MODALITY_ATTRIBUTE);
  };
}
