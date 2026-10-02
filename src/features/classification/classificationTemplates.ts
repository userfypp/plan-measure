import type { ClassificationCatalog } from "../../types/domain";
import { classificationNameKey } from "../../utils/classificationNames";

export interface ClassificationTemplateDimension {
  name: string;
  values: string[];
}

export interface ClassificationTemplate {
  id: string;
  name: string;
  dimensions: ClassificationTemplateDimension[];
}

export const CLASSIFICATION_TEMPLATES_STORAGE_KEY = "plan-measure.classification-templates";

export function templateDimensions(
  catalog: ClassificationCatalog,
): ClassificationTemplateDimension[] {
  return catalog.dimensions
    .filter((dimension) => !dimension.archived)
    .map((dimension) => ({
      name: dimension.name,
      values: dimension.values.filter((value) => !value.archived).map((value) => value.name),
    }));
}

function validNames(names: unknown[]): names is string[] {
  return (
    names.every((name) => typeof name === "string" && !!name.trim() && name === name.trim()) &&
    new Set((names as string[]).map(classificationNameKey)).size === names.length
  );
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
        validNames(dimension.values),
    ) && validNames(value.map((dimension) => dimension.name))
  );
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
      data.version !== 1 ||
      !("templates" in data) ||
      !Array.isArray(data.templates) ||
      !data.templates.every(
        (template) =>
          template &&
          typeof template === "object" &&
          typeof template.id === "string" &&
          !!template.id &&
          validTemplateDimensions(template.dimensions),
      ) ||
      !validNames(data.templates.map((template) => template.name)) ||
      new Set(data.templates.map((template) => template.id)).size !== data.templates.length
    ) {
      throw new Error("Invalid template library");
    }
    return { templates: data.templates, error: null };
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
      JSON.stringify({ version: 1, templates }),
    );
    return null;
  } catch {
    return "Templates could not be saved. Check your browser storage and try again.";
  }
}

/** Merge by name without replacing IDs, archive states, or measurement assignments. */
export function applyTemplateDimensions(
  catalog: ClassificationCatalog,
  dimensions: ClassificationTemplateDimension[],
  createId: () => string = () => crypto.randomUUID(),
): ClassificationCatalog {
  if (!validTemplateDimensions(dimensions))
    throw new Error("This template has invalid classification names.");
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
      if (!values.length) {
        target.values.push({ id: newId(), name, archived: false });
        changed = true;
      }
    }
  }
  return changed ? { dimensions: next } : catalog;
}
