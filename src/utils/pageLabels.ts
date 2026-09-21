function hasInvalidCustomPageLabelCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}

export type CustomPageLabelNormalization =
  { kind: "valid"; value: string } | { kind: "reset" } | { kind: "invalid" };

export type PageLabelOverrideDecision =
  { kind: "set"; value: string } | { kind: "remove" } | { kind: "unchanged" } | { kind: "invalid" };

export function isValidCustomPageLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !hasInvalidCustomPageLabelCharacter(value)
  );
}

export function normalizeCustomPageLabel(value: string): CustomPageLabelNormalization {
  if (hasInvalidCustomPageLabelCharacter(value)) return { kind: "invalid" };
  const normalized = value.trim();
  return normalized ? { kind: "valid", value: normalized } : { kind: "reset" };
}

export function effectivePageLabel(
  pageNumber: number,
  pageLabelOverrides: Readonly<Record<number, string>>,
  sourcePageLabels: readonly string[] | null,
): string {
  return pageLabelOverrides[pageNumber] ?? sourcePageLabel(pageNumber, sourcePageLabels) ?? "";
}

export function sourcePageLabel(
  pageNumber: number,
  sourcePageLabels: readonly string[] | null,
): string | null {
  return sourcePageLabels?.[pageNumber - 1] ?? null;
}

export function decidePageLabelOverride({
  draft,
  originalEffectiveLabel,
  customPageLabel,
  sourcePageLabel,
}: {
  draft: string;
  originalEffectiveLabel: string;
  customPageLabel: string | null;
  sourcePageLabel: string | null;
}): PageLabelOverrideDecision {
  if (draft === originalEffectiveLabel) return { kind: "unchanged" };
  if (sourcePageLabel !== null && draft === sourcePageLabel) {
    return customPageLabel === null ? { kind: "unchanged" } : { kind: "remove" };
  }

  const normalized = normalizeCustomPageLabel(draft);
  if (normalized.kind === "invalid") return normalized;
  if (normalized.kind === "reset") {
    return customPageLabel === null ? { kind: "unchanged" } : { kind: "remove" };
  }
  if (sourcePageLabel !== null && normalized.value === sourcePageLabel) {
    return customPageLabel === null ? { kind: "unchanged" } : { kind: "remove" };
  }
  if (normalized.value === customPageLabel) return { kind: "unchanged" };
  return { kind: "set", value: normalized.value };
}
