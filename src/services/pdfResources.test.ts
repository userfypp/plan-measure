import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfResourceOptions } from "./pdfResources";

const pdfjsDirectory = `${fileURLToPath(new URL("../../node_modules/pdfjs-dist", import.meta.url))}/`;

/** One page that draws an 8×8 CCITT G4 image (all white rows), which only the WASM decoder reads. */
function ccittImagePdf(): Uint8Array {
  const image = Buffer.from([0xff, 0x00, 0x10, 0x01]);
  const content = "q 100 0 0 100 0 0 cm /Im1 Do Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  const parts: Buffer[] = [Buffer.from("%PDF-1.7\n")];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  const push = (part: Buffer) => {
    parts.push(part);
    length += part.length;
  };
  objects.forEach((body, index) => {
    offsets.push(length);
    push(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`));
  });
  offsets.push(length);
  push(
    Buffer.from(
      "5 0 obj\n<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /BitsPerComponent 1 " +
        "/ColorSpace /DeviceGray /Filter /CCITTFaxDecode " +
        `/DecodeParms << /K -1 /Columns 8 /Rows 8 >> /Length ${image.length} >>\nstream\n`,
    ),
  );
  push(image);
  push(Buffer.from("\nendstream\nendobj\n"));
  const xref = length;
  const table = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${table}trailer\n<< /Size 6 /Root 1 0 R >>\n` +
        `startxref\n${xref}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(parts));
}

describe("pdf.js resources", () => {
  it("builds one URL per resource folder from the base", () => {
    expect(pdfResourceOptions("/plan-measure/pdfjs/1.2.3/")).toEqual({
      cMapUrl: "/plan-measure/pdfjs/1.2.3/cmaps/",
      standardFontDataUrl: "/plan-measure/pdfjs/1.2.3/standard_fonts/",
      wasmUrl: "/plan-measure/pdfjs/1.2.3/wasm/",
      iccUrl: "/plan-measure/pdfjs/1.2.3/iccs/",
    });
  });

  // pdf.js caches a failed decoder module for the whole process, so only the working case is
  // tested; without `wasmUrl` the image comes back empty.
  it("decodes a CCITT image of a scanned plan with those options", async () => {
    const task = getDocument({
      data: ccittImagePdf(),
      verbosity: 0,
      ...pdfResourceOptions(pdfjsDirectory),
    });
    const document = await task.promise;
    try {
      const page = await document.getPage(1);
      const operators = await page.getOperatorList();
      const paint = operators.fnArray.indexOf(OPS.paintImageXObject);
      expect(paint).toBeGreaterThanOrEqual(0);
      const id = operators.argsArray[paint][0] as string;
      const image = await new Promise<{ width: number } | null>((resolve) =>
        page.objs.get(id, resolve),
      );
      expect(image?.width).toBe(8);
    } finally {
      await task.destroy();
    }
  });
});
