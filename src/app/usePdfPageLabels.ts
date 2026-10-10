import { useEffect, useState } from "react";
import type { LoadedPdf } from "../services/pdf";

export function usePdfPageLabels(pdf: LoadedPdf | null): readonly string[] | null {
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
  return resolved?.pdf === pdf ? resolved.labels : (pdf?.pageLabels ?? null);
}
