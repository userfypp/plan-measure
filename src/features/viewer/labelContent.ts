import type { LabelContent } from "../../utils/appPreferences";

/** On-screen label text; exports never use the name prefix. */
export function composeLabelText(
  value: string,
  name: string | undefined,
  content: LabelContent,
): string {
  const trimmed = name?.trim();
  return content === "name-value" && trimmed ? `${trimmed} · ${value}` : value;
}
