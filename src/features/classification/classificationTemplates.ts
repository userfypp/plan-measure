import type {
  ClassificationCatalog,
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
} from "../../types/domain";
import { classificationNameKey } from "../../utils/classificationNames";
import {
  canonicalRates,
  hasValidRates,
  isCurrencyCode,
  ratesByValueId,
} from "../../utils/classificationRates";

export interface ClassificationTemplateRates {
  value: string;
  derivation: ClassificationValueDerivation | null;
  price: ClassificationValuePrice | null;
}

export interface ClassificationTemplateDimension {
  name: string;
  values: string[];
  rates: ClassificationTemplateRates[];
}

export interface ClassificationTemplate {
  id: string;
  name: string;
  currency: string | null;
  dimensions: ClassificationTemplateDimension[];
}

export type TemplateConflictPolicy = "keep" | "replace";

export const CLASSIFICATION_TEMPLATES_STORAGE_KEY = "plan-measure.classification-templates";

/** Active structure plus the rates of active values. */
export function templateDimensions(
  catalog: ClassificationCatalog,
  rates: readonly ClassificationValueRates[],
): ClassificationTemplateDimension[] {
  const byId = ratesByValueId(rates);
  return catalog.dimensions
    .filter((dimension) => !dimension.archived)
    .map((dimension) => {
      const values = dimension.values.filter((value) => !value.archived);
      return {
        name: dimension.name,
        values: values.map((value) => value.name),
        rates: values.flatMap((value) => {
          const entry = byId.get(value.id);
          if (!entry) return [];
          const { derivation, price } = canonicalRates(value.id, entry.derivation, entry.price);
          return { value: value.name, derivation, price };
        }),
      };
    });
}

function validNames(names: unknown[]): names is string[] {
  return (
    names.every((name) => typeof name === "string" && !!name.trim() && name === name.trim()) &&
    new Set((names as string[]).map(classificationNameKey)).size === names.length
  );
}

function validCurrency(currency: unknown): currency is string | null {
  return currency === null || isCurrencyCode(currency);
}

export function validTemplateDimensions(
  value: unknown,
): value is ClassificationTemplateDimension[] {
  if (!Array.isArray(value) || !value.length) return false;
  return (
    value.every(
      (dimension) =>
        dimension &&
        typeof dimension === "object" &&
        Array.isArray(dimension.values) &&
        validNames(dimension.values) &&
        Array.isArray(dimension.rates) &&
        dimension.rates.every(
          (entry: unknown) =>
            entry &&
            typeof entry === "object" &&
            "value" in entry &&
            "derivation" in entry &&
            "price" in entry &&
            dimension.values.includes(entry.value) &&
            hasValidRates(entry.derivation, entry.price),
        ) &&
        validNames(dimension.rates.map((entry: { value: unknown }) => entry.value)),
    ) && validNames(value.map((dimension) => dimension.name))
  );
}

/** Version 1 templates carried no rates or currency. */
function upgradeTemplateV1(template: unknown): unknown {
  if (!template || typeof template !== "object" || !("dimensions" in template)) return template;
  const { dimensions } = template;
  return {
    ...template,
    currency: null,
    dimensions: Array.isArray(dimensions)
      ? dimensions.map((dimension) =>
          dimension && typeof dimension === "object" ? { ...dimension, rates: [] } : dimension,
        )
      : dimensions,
  };
}

export function readClassificationTemplates(): {
  templates: ClassificationTemplate[];
  error: string | null;
} {
  try {
    const raw = window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY);
    if (!raw) return { templates: [], error: null };
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      (data.version !== 1 && data.version !== 2) ||
      !("templates" in data) ||
      !Array.isArray(data.templates)
    ) {
      throw new Error("Invalid template library");
    }
    const templates: ClassificationTemplate[] = (
      data.version === 1 ? data.templates.map(upgradeTemplateV1) : data.templates
    ) as ClassificationTemplate[];
    if (
      !templates.every(
        (template) =>
          template &&
          typeof template === "object" &&
          typeof template.id === "string" &&
          !!template.id &&
          validCurrency(template.currency) &&
          validTemplateDimensions(template.dimensions),
      ) ||
      !validNames(templates.map((template) => template.name)) ||
      new Set(templates.map((template) => template.id)).size !== templates.length
    ) {
      throw new Error("Invalid template library");
    }
    return { templates, error: null };
  } catch {
    return {
      templates: [],
      error: "Saved templates could not be loaded. Your project is still available.",
    };
  }
}

export function writeClassificationTemplates(templates: ClassificationTemplate[]): string | null {
  try {
    window.localStorage.setItem(
      CLASSIFICATION_TEMPLATES_STORAGE_KEY,
      JSON.stringify({ version: 2, templates }),
    );
    return null;
  } catch {
    return "Templates could not be saved. Check your browser storage and try again.";
  }
}

export interface TemplateConflict {
  dimension: string;
  value: string;
}

/** Merge by name without replacing IDs, archive states, or measurement assignments. */
export function applyTemplateDimensions(
  catalog: ClassificationCatalog,
  rates: ClassificationValueRates[],
  currency: string | null,
  template: Pick<ClassificationTemplate, "currency" | "dimensions">,
  createId: () => string = () => crypto.randomUUID(),
  policy: TemplateConflictPolicy = "keep",
): {
  catalog: ClassificationCatalog;
  rates: ClassificationValueRates[];
  currency: string | null;
  conflicts: TemplateConflict[];
  pricesSkipped: boolean;
} {
  const { dimensions } = template;
  if (!validTemplateDimensions(dimensions) || !validCurrency(template.currency))
    throw new Error("This template is invalid.");
  const next = catalog.dimensions.map((dimension) => ({
    ...dimension,
    values: [...dimension.values],
  }));
  let changed = false;
  const ids = new Set(
    catalog.dimensions.flatMap((dimension) => [
      dimension.id,
      ...dimension.values.map((value) => value.id),
    ]),
  );
  function newId() {
    const id = createId();
    if (!id || ids.has(id))
      throw new Error("Could not create unique classification IDs. Try again.");
    ids.add(id);
    return id;
  }
  const incoming: {
    id: string;
    dimension: string;
    value: string;
    rates: ClassificationTemplateRates;
  }[] = [];
  for (const source of dimensions) {
    const matches = next.filter(
      (dimension) => classificationNameKey(dimension.name) === classificationNameKey(source.name),
    );
    if (matches.length > 1)
      throw new Error("Rename duplicate project dimensions before applying a template.");
    let target = matches[0];
    if (target?.archived)
      throw new Error(`Restore dimension “${target.name}” before applying this template.`);
    if (!target) {
      target = { id: newId(), name: source.name, archived: false, values: [] };
      next.push(target);
      changed = true;
    }
    for (const name of source.values) {
      const values = target.values.filter(
        (value) => classificationNameKey(value.name) === classificationNameKey(name),
      );
      if (values.length > 1)
        throw new Error("Rename duplicate project values before applying a template.");
      if (values[0]?.archived)
        throw new Error(
          `Restore value “${values[0].name}” in “${target.name}” before applying this template.`,
        );
      let match = values[0];
      if (!match) {
        match = { id: newId(), name, archived: false };
        target.values.push(match);
        changed = true;
      }
      const entry = source.rates.find((item) => item.value === name);
      if (entry)
        incoming.push({ id: match.id, dimension: target.name, value: match.name, rates: entry });
    }
  }
  // A project with no currency and no prices adopts the template's; otherwise currencies must match.
  const adopt = currency === null && !rates.some((entry) => entry.price);
  const pricesApply = adopt || template.currency === currency;
  const byId = new Map(ratesByValueId(rates));
  const conflicts: TemplateConflict[] = [];
  let pricesSkipped = false;
  let ratesChanged = false;
  for (const { id, dimension, value, rates: source } of incoming) {
    const existing = byId.get(id);
    let price = source.price;
    if (!pricesApply) {
      pricesSkipped ||= price !== null;
      price = existing?.price ?? null;
    }
    if (!hasValidRates(source.derivation, price)) price = null;
    if (!source.derivation && !price) continue;
    const entry = canonicalRates(id, source.derivation, price);
    if (existing) {
      const current = canonicalRates(id, existing.derivation, existing.price);
      if (JSON.stringify(current) === JSON.stringify(entry)) continue;
      conflicts.push({ dimension, value });
      if (policy === "keep") continue;
    }
    byId.set(id, entry);
    ratesChanged = true;
  }
  return {
    catalog: changed ? { dimensions: next } : catalog,
    rates: ratesChanged
      ? next.flatMap((dimension) => dimension.values.flatMap((value) => byId.get(value.id) ?? []))
      : rates,
    currency:
      adopt && [...byId.values()].some((entry) => entry.price) ? template.currency : currency,
    conflicts,
    pricesSkipped,
  };
}
