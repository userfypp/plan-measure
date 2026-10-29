// Sheet 6: A-601 door and window schedule (A4 portrait, 1:50 = 20 mm per metre).
import { DOOR_TYPES, SAMPLE_GEOMETRY, WINDOW_TYPES } from "./geometry.mjs";
import { C, LW } from "./lib.mjs";

const GR = SAMPLE_GEOMETRY.ground;
const K = 20;
const LOC = {
  D1: "East wall, corridor",
  D2: "Living, kitchen, bedrooms",
  D3: "Bath",
  W1: "Living, kitchen, bedrooms",
  W2: "Kitchen",
  W3: "Bath",
};

export const scheduleRows = () => [
  ...Object.entries(DOOR_TYPES).map(([id, t]) => ({
    id,
    ...t,
    qty: GR.doors.filter((o) => o.type === id).length,
  })),
  ...Object.entries(WINDOW_TYPES).map(([id, t]) => ({
    id,
    ...t,
    qty: GR.windows.filter((o) => o.type === id).length,
  })),
];

const sizeText = (t) => `${t.w.toFixed(2)} × ${t.h.toFixed(2)} m`;

const door = (d, x, base, t) => {
  const [w, h] = [t.w * K, t.h * K];
  d.rect(x, base - h, w, h, { fill: C.PAPER, stroke: C.INK, w: LW.main });
  d.rect(x + 2, base - h + 2, w - 4, h * 0.45 - 3, { stroke: C.FINE, w: LW.fine });
  d.rect(x + 2, base - h * 0.5 + 1, w - 4, h * 0.5 - 3, { stroke: C.FINE, w: LW.fine });
  d.ln(x + w - 3.5, base - h * 0.5, x + w - 1.5, base - h * 0.5, { w: LW.obj });
};

const windowType = (d, x, base, t) => {
  const [w, h] = [t.w * K, t.h * K];
  d.rect(x, base - h, w, h, { fill: C.PAPER, stroke: C.INK, w: LW.main });
  d.rect(x + 1.5, base - h + 1.5, w - 3, h - 3, { fill: C.WATER_F, stroke: C.WATER_S, w: LW.thin });
  if (t.w >= 1.2)
    d.ln(x + w / 2, base - h + 1.5, x + w / 2, base - 1.5, { w: LW.thin, col: C.WATER_S });
};

export const drawSchedule = (d) => {
  d.sheet({
    size: "A4",
    no: "A-601",
    page: 6,
    total: 6,
    name: "Door & window schedule",
    scales: ["1:50"],
  });
  d.title("DOOR & WINDOW SCHEDULE", 20, 23);

  const cols = [20, 36, 98, 144, 152];
  const head = ["Type", "Description", "Size (W × H)", "Qty", "Location"];
  const rows = scheduleRows();
  head.forEach((h, i) => d.txt(h, cols[i], 35.2, { size: 7, f: "b", col: C.INK }));
  d.ln(20, 30, 190, 30, { w: LW.obj });
  d.ln(20, 38, 190, 38, { w: LW.obj });
  rows.forEach((r, i) => {
    const y = 38 + 8 * i + 5.2;
    d.txt(r.id, cols[0], y, { size: 7, f: "b", col: C.INK });
    d.txt(r.desc, cols[1], y, { size: 7, col: C.INK });
    d.txt(sizeText(r), cols[2], y, { size: 7, col: C.INK });
    d.txt(String(r.qty), cols[3], y, { size: 7, col: C.INK });
    d.txt(LOC[r.id], cols[4], y, { size: 7, col: C.INK });
    d.ln(20, 46 + 8 * i, 190, 46 + 8 * i, {
      w: i === rows.length - 1 ? LW.obj : LW.fine,
      col: i === rows.length - 1 ? C.INK : C.FINE,
    });
  });

  d.title("TYPES  1:50", 20, 108);
  const dx = { D1: 20, D2: 50, D3: 80 };
  const wx = { W1: 20, W2: 65, W3: 104 };
  d.ln(15, 160, 100, 160, { w: LW.main });
  for (const [id, x] of Object.entries(dx)) {
    const t = DOOR_TYPES[id];
    door(d, x, 160, t);
    d.txt(id, x + (t.w * K) / 2, 165.5, { size: 8, f: "b", col: C.INK, align: "c" });
    d.txt(sizeText(t), x + (t.w * K) / 2, 169.3, { size: 6, align: "c" });
  }
  for (const [id, x] of Object.entries(wx)) {
    const t = WINDOW_TYPES[id];
    windowType(d, x, 206, t);
    d.txt(id, x + (t.w * K) / 2, 211.5, { size: 8, f: "b", col: C.INK, align: "c" });
    d.txt(sizeText(t), x + (t.w * K) / 2, 215.3, { size: 6, align: "c" });
  }
  d.hbar(140, 230, 20, K, 2, "SCALE 1:50");
};
