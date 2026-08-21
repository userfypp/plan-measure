import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import type { LoadedPdf } from "../services/pdf";

export class PdfLoadLifecycle {
  private generation = 0;

  private readonly destroyedTasks = new WeakSet<PDFDocumentLoadingTask>();

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  async destroy(loaded: LoadedPdf | null | undefined): Promise<void> {
    if (!loaded || this.destroyedTasks.has(loaded.loadingTask)) return;
    this.destroyedTasks.add(loaded.loadingTask);
    await loaded.loadingTask.destroy().catch(() => undefined);
  }
}

export function canActivatePdf<T>(
  lifecycle: PdfLoadLifecycle,
  loadGeneration: number,
  candidate: T,
  pending: T | null,
  requiresPendingConfirmation: boolean,
): boolean {
  return (
    lifecycle.isCurrent(loadGeneration) &&
    (!requiresPendingConfirmation || pending === candidate)
  );
}
