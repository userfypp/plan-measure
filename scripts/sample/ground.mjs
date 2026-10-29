// Sheet 4: A-101 ground floor plan 1:50 (20 mm per metre, origin (32, 44)).
import { SAMPLE_GEOMETRY, area, perimeter } from "./geometry.mjs";
import { C, LW } from "./lib.mjs";

const G = SAMPLE_GEOMETRY.ground;
const K = 20;
const OX = 32;
const OY = 44;
const A = (x) => OX + x * K;
const B = (y) => OY + y * K;
const FUR = { stroke: C.FINE, w: LW.thin };
const FUR_FINE = { stroke: C.FINE, w: LW.fine };

export const roomSchedule = () =>
  G.rooms.map((r) => ({ name: r.name, area: area(r.poly), perimeter: perimeter(r.poly) }));

const drawDoor = (d, { hole, hinge, open, closed, w }) => {
  const [x1, y1, x2, y2] = hole;
  d.rect(A(x1), B(y1), (x2 - x1) * K, (y2 - y1) * K, { fill: C.PAPER });
  const horiz = x2 - x1 > y2 - y1;
  const jamb = horiz
    ? [
        [x1, y1, x1, y2],
        [x2, y1, x2, y2],
      ]
    : [
        [x1, y1, x2, y1],
        [x1, y2, x2, y2],
      ];
  for (const [a, b, c, e] of jamb) d.ln(A(a), B(b), A(c), B(e), { w: LW.thin });
  const tip = [hinge[0] + open[0] * w, hinge[1] + open[1] * w];
  const end = [hinge[0] + closed[0] * w, hinge[1] + closed[1] * w];
  d.ln(A(hinge[0]), B(hinge[1]), A(tip[0]), B(tip[1]), { w: LW.main });
  const sweep = open[0] * closed[1] - open[1] * closed[0] > 0 ? 1 : 0;
  d.path(
    [
      ["M", A(tip[0]), B(tip[1])],
      ["A", w * K, sweep, A(end[0]), B(end[1])],
    ],
    { stroke: C.INK, w: LW.thin },
  );
};

const drawWindow = (d, { side, a, b, type }) => {
  const t = G.wallsExt;
  const [w, h] = SAMPLE_GEOMETRY.ground.size;
  const vert = side === "O" || side === "E";
  const p0 = { N: 0, S: h - t, O: 0, E: w - t }[side];
  const r = vert ? [p0, a, p0 + t, b] : [a, p0, b, p0 + t];
  d.rect(A(r[0]), B(r[1]), (r[2] - r[0]) * K, (r[3] - r[1]) * K, { fill: C.PAPER });
  const L = (x1, y1, x2, y2) => d.ln(A(x1), B(y1), A(x2), B(y2), { w: LW.thin });
  for (const o of [0, t / 2, t]) vert ? L(p0 + o, a, p0 + o, b) : L(a, p0 + o, b, p0 + o);
  for (const e of [a, b]) vert ? L(p0, e, p0 + t, e) : L(e, p0, e, p0 + t);
  // Tag 4 mm outside the wall, centred on the opening.
  const mid = (a + b) / 2;
  const out = { N: [0, -1], S: [0, 1], O: [-1, 0], E: [1, 0] }[side];
  const [tw, th] = vert ? [3.5, 6] : [6, 3.5];
  const face = { N: OY, S: B(h), O: OX, E: A(w) }[side];
  const gap = 4;
  const cx = vert ? (out[0] < 0 ? face - gap - tw / 2 : face + gap + tw / 2) : A(mid);
  const cy = vert ? B(mid) : out[1] < 0 ? face - gap - th / 2 : face + gap + th / 2;
  d.rect(cx - tw / 2, cy - th / 2, tw, th, { fill: C.PAPER, stroke: C.INK, w: LW.thin });
  const cap = (6 * 0.72) / (72 / 25.4);
  if (vert) d.txt(type, cx + cap / 2, cy, { size: 6, f: "b", col: C.INK, align: "c", rot: 90 });
  else d.txt(type, cx, cy + cap / 2, { size: 6, f: "b", col: C.INK, align: "c" });
};

const furniture = (d) => {
  const rm = (x1, y1, x2, y2, o = FUR) => d.rect(A(x1), B(y1), (x2 - x1) * K, (y2 - y1) * K, o);
  const ln = (x1, y1, x2, y2, o = FUR_FINE) => d.ln(A(x1), B(y1), A(x2), B(y2), o);
  const T = G.table;
  d.circle(A(T.c[0]), B(T.c[1]), (T.d / 2) * K, FUR);
  for (let i = 0; i < T.chairs; i++) {
    const t = (i * 2 * Math.PI) / T.chairs;
    const c = [T.c[0] + T.chairR * Math.cos(t), T.c[1] + T.chairR * Math.sin(t)];
    const hs = T.chair / 2;
    const pts = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([u, v]) => [
      A(c[0] + hs * (u * Math.cos(t) - v * Math.sin(t))),
      B(c[1] + hs * (u * Math.sin(t) + v * Math.cos(t))),
    ]);
    d.poly(pts, FUR);
  }
  rm(...G.island);
  // L counter without the edges that lie on the walls (keeps window E clear).
  d.polyline(
    [
      [7.0, 0.9],
      [12.1, 0.9],
      [12.1, 3.6],
    ].map(([x, y]) => [A(x), B(y)]),
    FUR,
  );
  rm(8.0, 0.4, 9.0, 0.8, FUR_FINE);
  rm(10.0, 0.4, 10.7, 0.8, FUR_FINE);
  for (const [hx, hy] of [
    [10.17, 0.52],
    [10.53, 0.52],
    [10.17, 0.68],
    [10.53, 0.68],
  ])
    d.circle(A(hx), B(hy), 0.07 * K, FUR_FINE);
  rm(...G.bathtub);
  d.ellipse(A(8.55), B(7.6), 0.75 * K, 0.32 * K, FUR_FINE);
  rm(8.95, 5.05, 9.35, 5.3, FUR_FINE);
  d.ellipse(A(9.15), B(5.52), 0.18 * K, 0.22 * K, FUR_FINE);
  rm(7.55, 5.5, 7.95, 6.1, FUR_FINE);
  d.ellipse(A(7.75), B(5.8), 0.14 * K, 0.2 * K, FUR_FINE);
  rm(5.6, 6.1, 7.2, 8.1);
  rm(5.7, 7.65, 6.3, 8.0, FUR_FINE);
  rm(6.5, 7.65, 7.1, 8.0, FUR_FINE);
  ln(5.6, 6.9, 7.2, 6.9);
  rm(11.1, 6.0, 12.5, 8.0);
  rm(11.2, 7.55, 11.75, 7.9, FUR_FINE);
  rm(11.85, 7.55, 12.4, 7.9, FUR_FINE);
  ln(11.1, 6.8, 12.5, 6.8);
};

const LABELS = {
  "Living / Dining": [3.6, 1.9],
  Kitchen: [8.1, 1.9],
  Corridor: [8.0, 4.2],
  "Bedroom 1": [4.55, 6.8],
  Bath: [8.55, 6.35],
  "Bedroom 2": [10.4, 6.9],
};

export const drawGround = (d) => {
  d.sheet({
    size: "A3",
    no: "A-101",
    page: 4,
    total: 6,
    name: "Ground floor plan",
    scales: ["1:50"],
  });
  d.title("GROUND FLOOR PLAN  1:50", 32, 25);
  for (const [x1, y1, x2, y2] of G.walls)
    d.rect(A(x1), B(y1), (x2 - x1) * K, (y2 - y1) * K, { fill: C.WALL });
  G.doors.forEach((o) => drawDoor(d, o));
  G.windows.forEach((o) => drawWindow(d, o));
  furniture(d);
  for (const r of roomSchedule()) {
    const [cx, cy] = LABELS[r.name];
    d.txt(r.name, A(cx), B(cy), { size: 8, f: "b", col: C.INK, align: "c" });
    d.txt(`${r.area.toFixed(2)} m²`, A(cx), B(cy) + 3.6, { size: 7, align: "c" });
  }

  const [w, h] = G.size;
  d.hdim([A(0), A(w)], 34, B(0), ["13.00"]);
  d.vdim([B(0), B(h)], 17, A(0), ["8.50"]);
  const diff = (v) => v.slice(1).map((e, i) => (e - v[i]).toFixed(2));
  d.hdim(G.axesX.map(A), 224, B(h), diff(G.axesX));
  d.vdim(G.axesY.map(B), 24, A(0), diff(G.axesY));
  d.hbar(32, 250, 20, K, 5, "SCALE 1:50");
  d.north(280, 250);

  // Room schedule.
  const cols = { room: 306, area: 366, per: 398 };
  d.title("ROOM SCHEDULE", 305, 29);
  d.txt("Room", cols.room, 38.1, { size: 7, f: "b", col: C.INK });
  d.txt("Area m²", cols.area, 38.1, { size: 7, f: "b", col: C.INK, align: "r" });
  d.txt("Perimeter m", cols.per, 38.1, { size: 7, f: "b", col: C.INK, align: "r" });
  d.ln(305, 34, 400, 34, { w: LW.obj });
  d.ln(305, 40, 400, 40, { w: LW.obj });
  const rows = roomSchedule();
  rows.forEach((r, i) => {
    const y = 40 + 6 * i + 4.1;
    d.txt(r.name, cols.room, y, { size: 7, col: C.INK });
    d.txt(r.area.toFixed(2), cols.area, y, { size: 7, col: C.INK, align: "r" });
    d.txt(r.perimeter.toFixed(2), cols.per, y, { size: 7, col: C.INK, align: "r" });
    d.ln(305, 46 + 6 * i, 400, 46 + 6 * i, { w: LW.fine, col: C.FINE });
  });
  const ty = 40 + 6 * rows.length;
  d.txt("Total", cols.room, ty + 4.1, { size: 7, f: "b", col: C.INK });
  d.txt(rows.reduce((a, r) => a + r.area, 0).toFixed(2), cols.area, ty + 4.1, {
    size: 7,
    f: "b",
    col: C.INK,
    align: "r",
  });
  d.ln(305, ty + 6, 400, ty + 6, { w: LW.obj });
  d.title("NOTES", 305, 96);
  d.txt("All dimensions in metres.", 305, 103, { size: 7, col: C.INK });
  d.txt("Room areas are net clear floor areas.", 305, 107.5, { size: 7, col: C.INK });
};
