// Sheet 3: C-501 terrace detail 1:20, key plan 1:500 and section A-A.
import { SAMPLE_GEOMETRY, area, circleArea, polylineLength, profileArea, rectPoly } from "./geometry.mjs";
import { C, LW } from "./lib.mjs";

const DT = SAMPLE_GEOMETRY.detail;
const SITE = SAMPLE_GEOMETRY.site;
const TERRAIN = SAMPLE_GEOMETRY.section.terrain;

const terraceDetail = (d) => {
  const k = 50;
  const [ox, oy] = [40, 45];
  const { w, h, joint } = DT.terrace;
  d.title("TERRACE DETAIL  1:20", 40, 28);
  d.rect(ox, oy, w * k, h * k, { fill: C.PAPER, stroke: C.INK, w: LW.main });
  for (let x = joint; x < w - 1e-9; x += joint)
    d.ln(ox + x * k, oy, ox + x * k, oy + h * k, { w: LW.fine, col: C.FINE });
  for (let y = joint; y < h - 1e-9; y += joint)
    d.ln(ox, oy + y * k, ox + w * k, oy + y * k, { w: LW.fine, col: C.FINE });
  const [bx1, by1, bx2, by2] = DT.bench;
  d.rect(ox + bx1 * k, oy + by1 * k, (bx2 - bx1) * k, (by2 - by1) * k, { fill: C.FOOT, stroke: C.INK, w: LW.obj });
  d.txt("BENCH", ox + ((bx1 + bx2) / 2) * k, oy + ((by1 + by2) / 2) * k + 1, { size: 7, align: "c", col: C.INK });
  const { c, d: pd } = DT.planter;
  d.circle(ox + c[0] * k, oy + c[1] * k, (pd / 2) * k, { fill: C.GREEN_F, stroke: C.GREEN_S, w: LW.obj });
  d.txt("Ø0.80", ox + c[0] * k, oy + c[1] * k + 1, { size: 7, align: "c", col: C.INK });
  for (const [x, y] of DT.bollards.pts)
    d.circle(ox + x * k, oy + y * k, (DT.bollards.d / 2) * k, { fill: C.INK, stroke: C.INK, w: LW.thin });
  d.hdim([ox, ox + w * k], 38, oy, ["3.00"]);
  d.vdim([oy, oy + h * k], 32, ox, ["2.00"]);
  d.hbar(40, 158, 25, k, 1, "SCALE 1:20");
};

const keyPlan = (d) => {
  const k = 2;
  const [ox, oy] = [205, 55];
  const P = ([x, y]) => [ox + k * x, oy + k * y];
  d.title("KEY PLAN  1:500", 205, 28);
  d.poly(SITE.parcel.map(P), { stroke: C.INK, w: LW.main, dash: [6, 2, 1, 2] });
  const rr = (r, o) => {
    const [a, b] = [P(r.slice(0, 2)), P(r.slice(2))];
    d.rect(a[0], a[1], b[0] - a[0], b[1] - a[1], o);
  };
  rr(SITE.house, { fill: C.FOOT, stroke: C.INK, w: LW.main });
  rr(SITE.terrace, { fill: C.INK, stroke: C.INK, w: LW.thin });
  const sy = P([0, SITE.section.y])[1];
  const [sa, sb] = [P([SITE.section.x0, 0])[0], P([SITE.section.x1, 0])[0]];
  d.ln(sa, sy, sb, sy, { w: LW.main, dash: [6, 2, 1, 2] });
  for (const x of [sa, sb]) {
    d.poly([[x, sy - 4], [x - 1.8, sy], [x + 1.8, sy]], { fill: C.INK, stroke: C.INK, w: LW.thin });
    d.txt("A", x, sy - 5.5, { size: 8, f: "b", col: C.INK, align: "c" });
  }
  d.hbar(205, 135, 10, k, 20, "SCALE 1:500");
};

const section = (d) => {
  const X = (c) => 40 + 5 * c;
  const Y = (z) => 262 - 20 * z;
  const last = TERRAIN[TERRAIN.length - 1][0];
  d.title("SECTION A–A  H 1:200 / V 1:50", 40, 190);
  d.poly([...TERRAIN.map(([c, z]) => [X(c), Y(z)]), [X(last), Y(0)], [X(0), Y(0)]], { fill: C.FOOT });
  for (let c = 0; c <= last; c += 5) d.ln(X(c), Y(0), X(c), Y(3), { w: LW.fine, col: C.FINE });
  for (let z = 0; z <= 3; z++) d.ln(X(0), Y(z), X(last), Y(z), { w: LW.fine, col: C.FINE });
  d.ln(X(0), Y(0), X(last), Y(0), { w: LW.main });
  d.polyline(TERRAIN.map(([c, z]) => [X(c), Y(z)]), { stroke: C.INK, w: LW.terrain });
  for (const [c, z] of TERRAIN) {
    const s = z.toFixed(2);
    const w = d.tw(s, 6);
    d.rect(X(c) - w / 2 - 0.6, Y(z) - 1.5 - 1.5 - 0.6, w + 1.2, 1.5 + 1.2, { fill: C.PAPER });
    d.txt(s, X(c), Y(z) - 1.5, { align: "c" });
  }
  for (let c = 0; c <= last; c += 5) {
    d.ln(X(c), Y(0), X(c), Y(0) + 2, { w: LW.fine, col: C.TEXT2 });
    d.txt(String(c) + (c === last ? " m" : ""), X(c), 267, { align: "c" });
  }
  d.hbar(40, 276, 25, 5, 10, "SCALE H 1:200");
  d.vbar(30, 262, 20, 20, 2, "SCALE V 1:50", "r");
};

export const drawDetails = (d) => {
  d.sheet({
    size: "A3",
    no: "C-501",
    page: 3,
    total: 6,
    name: "Details & section",
    scales: ["Detail 1:20", "Key plan 1:500", "Section H 1:200 / V 1:50"],
  });
  terraceDetail(d);
  keyPlan(d);
  section(d);
  const T = DT.terrace;
  const [bx1, by1, bx2, by2] = DT.bench;
  d.dataTable("DETAIL DATA", [
    ["Terrace area", `${area(rectPoly([0, 0, T.w, T.h])).toFixed(2)} m²`],
    ["Bench", `${area(rectPoly([bx1, by1, bx2, by2])).toFixed(2)} m²`],
    [`Planter Ø${DT.planter.d.toFixed(2)}`, `${circleArea(DT.planter.d).toFixed(2)} m²`],
    ["Section profile length", `${polylineLength(TERRAIN).toFixed(2)} m`],
    ["Area under profile", `${profileArea(TERRAIN).toFixed(2)} m²`],
  ]);
};
