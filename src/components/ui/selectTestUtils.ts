import { act } from "react";

/** Test helpers for the custom Select (a button trigger plus a menuitemradio list in the body). */
export function selectOptionLabels(trigger: HTMLElement): string[] {
  act(() => trigger.click());
  const labels = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ).map((item) => item.textContent ?? "");
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  return labels;
}

export function chooseSelectOption(trigger: HTMLElement, optionLabel: string) {
  act(() => trigger.click());
  const item = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ).find((candidate) => candidate.textContent === optionLabel);
  if (!item) throw new Error(`Select option ${optionLabel} was not rendered.`);
  act(() => item.click());
}
