import type { LabelContent } from "../../utils/appPreferences";

/** On-screen label text; exports never use name/classification prefixes. */
export function composeLabelText(
  value: string,
  name: string | undefined,
  content: LabelContent,
  classification?: string,
): string {
  const trimmed = name?.trim();
  const parts: string[] = [];
  if (content === "name-value" && trimmed) parts.push(trimmed);
  if (classification) parts.push(classification);
  parts.push(value);
  return parts.join(" · ");
}
