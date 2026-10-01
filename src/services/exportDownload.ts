export function exportFileName(pdfName: string, suffix: string, extension: string): string {
  const baseName = pdfName.replace(/\.pdf$/i, "").replace(/[\\/]/g, "_") || "plan";
  return `${baseName}-${suffix}.${extension}`;
}

export function downloadExportFile(contents: BlobPart, fileName: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  }
}
