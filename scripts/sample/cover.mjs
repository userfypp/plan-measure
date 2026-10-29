// Sheet 1: G-001 cover with the drawing index.
import { C, LW } from "./lib.mjs";

export const SHEETS = [
  { no: "G-001", name: "Cover", scale: "NTS", size: "A3" },
  { no: "C-101", name: "Site plan", scale: "1:200", size: "A3" },
  { no: "C-501", name: "Details & section", scale: "1:20 · 1:500 · H 1:200 / V 1:50", size: "A3" },
  { no: "A-101", name: "Ground floor plan", scale: "1:50", size: "A3" },
  { no: "A-201", name: "Roof plan & elevations", scale: "1:100", size: "A3" },
  { no: "A-601", name: "Door & window schedule", scale: "1:50", size: "A4" },
];

export const drawCover = (d) => {
  d.sheet({ size: "A3", no: "G-001", page: 1, total: 6, name: "Cover", scales: ["NTS"] });
  d.txt("ORCHARD HOUSE", 30, 60, { size: 28, f: "b", col: C.INK });
  d.txt("Plan Measure sample project", 30, 70, { size: 12, col: C.TEXT2 });

  const cols = [30, 60, 170, 230];
  const head = ["Sheet", "Title", "Scale", "Size"];
  const y0 = 100;
  head.forEach((h, i) => d.txt(h, cols[i], y0 + 6, { size: 9, f: "b", col: C.INK }));
  d.ln(30, y0 + 9, 400, y0 + 9, { w: LW.main });
  SHEETS.forEach((s, r) => {
    const y = y0 + 9 * (r + 1);
    [s.no, s.name, s.scale, s.size].forEach((v, i) =>
      d.txt(v, cols[i], y + 6, { size: 9, col: C.INK, f: i === 0 ? "b" : "r" }),
    );
    d.ln(30, y + 9, 400, y + 9, {
      w: r === SHEETS.length - 1 ? LW.main : LW.fine,
      col: r === SHEETS.length - 1 ? C.INK : C.FINE,
    });
  });
};
