import { useMemo } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import { PageBrowser } from "./PageBrowser";

export function PageBrowserHost({
  document,
  sourceLabels,
  onNavigate,
  onClose,
}: {
  document: PDFDocumentProxy;
  sourceLabels: readonly string[] | null;
  onNavigate: (number: number) => void;
  onClose: () => void;
}) {
  const { session } = useSessionState();
  const { draft, calibrationFlow, calibrationReferenceEdit } = useWorkspaceState();
  const overrides = session?.pageLabelOverrides;
  const labels = useMemo(() => {
    if (!overrides || Object.keys(overrides).length === 0) return sourceLabels;
    return Array.from(
      { length: document.numPages },
      (_, index) => overrides[index + 1] ?? sourceLabels?.[index] ?? String(index + 1),
    );
  }, [document.numPages, overrides, sourceLabels]);
  if (!session) return null;
  return (
    <PageBrowser
      document={document}
      labels={labels}
      currentPage={session.currentPage}
      navigationDisabled={Boolean(draft || calibrationFlow || calibrationReferenceEdit)}
      onNavigate={onNavigate}
      onClose={onClose}
    />
  );
}
