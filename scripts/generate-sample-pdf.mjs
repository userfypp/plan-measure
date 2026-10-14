// Generates the deterministic six-sheet "Orchard House" sample drawing set.
// Usage: node scripts/generate-sample-pdf.mjs [output.pdf]
// Geometry lives in scripts/sample/geometry.mjs; check it with
// `node scripts/sample/check.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";
import { drawCover } from "./sample/cover.mjs";
import { drawDetails } from "./sample/details.mjs";
import { drawGround } from "./sample/ground.mjs";
import { PT, createCtx } from "./sample/lib.mjs";
import { drawRoof } from "./sample/roof.mjs";
import { drawSchedule } from "./sample/schedule.mjs";
import { drawSite } from "./sample/site.mjs";

export { SAMPLE_GEOMETRY, area, perimeter } from "./sample/geometry.mjs";

export const LABELS = ["G-001", "C-101", "C-501", "A-101", "A-201", "A-601"];

const A3 = [420 * PT, 297 * PT];
const A4 = [210 * PT, 297 * PT];

// Builds the document in memory; returns it with the text boxes per page.
export const buildSamplePdf = async () => {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle("Orchard House – Plan Measure sample");
  pdf.setAuthor("Plan Measure");
  pdf.setCreator("Plan Measure sample generator");
  pdf.setProducer("pdf-lib");
  pdf.setSubject("Sample drawing set");
  pdf.setCreationDate(new Date(Date.UTC(2025, 0, 1)));
  pdf.setModificationDate(new Date(Date.UTC(2025, 0, 1)));
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const pages = [];
  const make = (size, draw, rotated = false) => {
    const pg = pdf.addPage(size);
    let ctx;
    if (rotated) {
      // Portrait A3 shown landscape: /Rotate 90 plus a matching CTM so the
      // drawing code can keep using landscape top-left coordinates.
      pg.setRotation(degrees(90));
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, 297 * PT, 0));
      ctx = createCtx(pg, 297 * PT, fonts);
      draw(ctx);
      pg.pushOperators(popGraphicsState());
    } else {
      ctx = createCtx(pg, size[1], fonts);
      draw(ctx);
    }
    pages.push(ctx.boxes);
  };
  make(A3, drawCover);
  make(A3, drawSite);
  make(A3, drawDetails);
  make(A3, drawGround);
  make([297 * PT, 420 * PT], drawRoof, true);
  make(A4, drawSchedule);

  pdf.catalog.set(
    PDFName.of("PageLabels"),
    pdf.context.obj({
      Nums: LABELS.flatMap((l, i) => [i, { P: PDFString.of(l) }]),
    }),
  );
  return { pdf, pages };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(
    process.argv[2] ?? new URL("../assets/orchard-house-sample.pdf", import.meta.url).pathname,
  );
  const { pdf } = await buildSamplePdf();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await pdf.save({ useObjectStreams: false }));
  console.log(`Wrote ${out}`);
}
