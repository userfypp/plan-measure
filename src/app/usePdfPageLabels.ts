import { useEffect, useState } from "react";
import type { LoadedPdf } from "../services/pdf";

export interface PdfPageLabels {
  labels: readonly string[] | null;
  /** The PDF's own labels are still being read, so `labels: null` does not yet mean "none". */
  pending: boolean;
}

export function usePdfPageLabels(pdf: LoadedPdf | null): PdfPageLabels {
  const [resolved, setResolved] = useState<{ pdf: LoadedPdf; labels: string[] | null } | null>(
    null,
  );
  useEffect(() => {
    if (!pdf?.pageLabelsReady) return;
    let live = true;
    void pdf.pageLabelsReady.then((labels) => {
      if (live) setResolved({ pdf, labels });
    });
    return () => {
      live = false;
    };
  }, [pdf]);
  if (resolved?.pdf === pdf) return { labels: resolved.labels, pending: false };
  return { labels: pdf?.pageLabels ?? null, pending: Boolean(pdf?.pageLabelsReady) };
}
