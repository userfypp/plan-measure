import { act } from "react";

/** Test helpers for SearchSelect (a button trigger plus a search field and a listbox in the body). */
export function searchSelectOptions(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
}

export function searchSelectOptionLabels(trigger: HTMLElement): string[] {
  act(() => trigger.click());
  const labels = searchSelectOptions().map((option) => option.textContent ?? "");
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  return labels;
}

export function chooseSearchSelectOption(trigger: HTMLElement, optionLabel: string) {
  act(() => trigger.click());
  const option = searchSelectOptions().find((candidate) => candidate.textContent === optionLabel);
  if (!option) throw new Error(`Search select option ${optionLabel} was not rendered.`);
  act(() => option.click());
}
