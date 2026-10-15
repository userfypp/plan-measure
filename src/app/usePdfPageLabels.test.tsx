/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedPdf } from "../services/pdf";
import { usePdfPageLabels, type PdfPageLabels } from "./usePdfPageLabels";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function renderLabels(pdf: LoadedPdf | null): { current: PdfPageLabels | null } {
  const result: { current: PdfPageLabels | null } = { current: null };
  function Probe({ value }: { value: LoadedPdf | null }) {
    result.current = usePdfPageLabels(value);
    return null;
  }
  root ??= createRoot(document.createElement("div"));
  act(() => root!.render(<Probe value={pdf} />));
  return result;
}

function loadedPdf(overrides: Partial<LoadedPdf>): LoadedPdf {
  return { document: {}, loadingTask: {}, pageLabels: null, ...overrides } as LoadedPdf;
}

describe("usePdfPageLabels", () => {
  it("reports no labels and nothing pending without a PDF", () => {
    expect(renderLabels(null).current).toEqual({ labels: null, pending: false });
  });

  it("is pending until the PDF's labels are read, then reports them", async () => {
    let resolveLabels!: (labels: string[] | null) => void;
    const pdf = loadedPdf({
      pageLabelsReady: new Promise((resolve) => {
        resolveLabels = resolve;
      }),
    });
    const result = renderLabels(pdf);
    expect(result.current).toEqual({ labels: null, pending: true });

    await act(async () => resolveLabels(["A-101"]));
    expect(result.current).toEqual({ labels: ["A-101"], pending: false });
  });

  it("stops pending when the PDF turns out to have no labels", async () => {
    const pdf = loadedPdf({ pageLabelsReady: Promise.resolve(null) });
    const result = renderLabels(pdf);
    await act(async () => {});
    expect(result.current).toEqual({ labels: null, pending: false });
  });

  it("uses labels that were already known without pending", () => {
    expect(renderLabels(loadedPdf({ pageLabels: ["1"] })).current).toEqual({
      labels: ["1"],
      pending: false,
    });
  });
});
