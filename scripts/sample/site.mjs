// Sheet 2: C-101 site plan 1:200 (5 mm per metre, origin at paper (25, 40)).
import { SAMPLE_GEOMETRY, area, circleArea, ellipseArea, polylineLength, rectPoly } from "./geometry.mjs";
import { C, LW } from "./lib.mjs";

const G = SAMPLE_GEOMETRY.site;
const K = 5;
const OX = 25;
const OY = 40;
const px = ([x, y]) => [OX + K * x, OY + K * y];

// Parallel polyline at distance dist (left of travel) with mitred corners,
// trimmed at both ends to the axis end lines (x = first x, y = last y).
export const offsetPolyline = (pts, dist) => {
  const dirs = pts.slice(1).map(([x, y], i) => {
    const [x0, y0] = pts[i];
    const l = Math.hypot(x - x0, y - y0);
    return [(x - x0) / l, (y - y0) / l];
  });
  const nrm = ([tx, ty]) => [ty, -tx];
  const out = [];
  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1) {
      const t = dirs[i === 0 ? 0 : i - 1];
      const n = nrm(t);
      let q = [p[0] + n[0] * dist, p[1] + n[1] * dist];
      if (i === pts.length - 1 && t[1] !== 0) {
        const s = (p[1] - q[1]) / t[1];
        q = [q[0] + t[0] * s, p[1]];
      }
      out.push(q);
    } else {
      const n1 = nrm(dirs[i - 1]);
      const n2 = nrm(dirs[i]);
      const k = dist / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      out.push([p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]);
    }
  });
  return out;
};

export const siteData = () => [
  ["Parcel area", `${area(G.parcel).toFixed(2)} m²`],
  ["House footprint", `${area(rectPoly(G.house)).toFixed(2)} m²`],
  ["Parking", `${G.parking.n} bays, ${(G.parking.n * G.parking.w * G.parking.d).toFixed(2)} m²`],
  ["Trees", `${G.trees.pts.length} × Ø${G.trees.d.toFixed(1)} m, ${(G.trees.pts.length * circleArea(G.trees.d)).toFixed(2)} m²`],
  ["Pond", `${ellipseArea(G.pond.rx, G.pond.ry).toFixed(2)} m²`],
  ["Path length", `${polylineLength(G.path.axis).toFixed(2)} m`],
];

export const drawSite = (d) => {
  d.sheet({ size: "A3", no: "C-101", page: 2, total: 6, name: "Site plan", scales: ["1:200"] });
  d.title("SITE PLAN  1:200", 25, 22);

  // Street.
  d.ln(20, 32, 290, 32, { w: LW.thin, col: C.INK });
  d.txt("ORCHARD LANE", 127.5, 30, { size: 7, col: C.TEXT2, align: "c" });

  d.poly(G.parcel.map(px), { stroke: C.INK, w: LW.main, dash: [6, 2, 1, 2] });

  const [hx1, hy1, hx2, hy2] = G.house;
  const [h1, h2] = [px([hx1, hy1]), px([hx2, hy2])];
  d.rect(h1[0], h1[1], h2[0] - h1[0], h2[1] - h1[1], { fill: C.FOOT, stroke: C.INK, w: LW.main });
  d.txt("HOUSE", (h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2 + 1, { size: 8, f: "b", col: C.INK, align: "c" });
  const [t1, t2] = [px(G.terrace.slice(0, 2)), px(G.terrace.slice(2))];
  d.rect(t1[0], t1[1], t2[0] - t1[0], t2[1] - t1[1], { fill: C.PAPER, stroke: C.FINE, w: LW.obj });

  const pk = G.parking;
  for (let i = 0; i < pk.n; i++) {
    const [x, y] = px([pk.x0 + i * pk.w, pk.y0]);
    d.rect(x, y, pk.w * K, pk.d * K, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
  }
  const [pcx] = px([pk.x0 + (pk.n * pk.w) / 2, 0]);
  d.txt("PARKING", pcx, px([0, pk.d])[1] + 5, { size: 7, align: "c" });

  const [ex, ey] = px(G.pond.c);
  d.ellipse(ex, ey, G.pond.rx * K, G.pond.ry * K, { fill: C.WATER_F, stroke: C.WATER_S, w: LW.obj });
  d.txt("POND", ex, ey + 1, { size: 7, align: "c" });

  // Path: two offsets of the axis plus the dashed axis.
  const axis = G.path.axis;
  const half = G.path.width / 2;
  for (const s of [half, -half])
    d.polyline(offsetPolyline(axis, s).map(px), { stroke: C.FINE, w: LW.fine });
  d.polyline(axis.map(px), { stroke: C.TEXT2, w: LW.thin, dash: [4, 2] });

  for (const p of G.trees.pts) {
    const [x, y] = px(p);
    d.circle(x, y, (G.trees.d / 2) * K, { fill: C.GREEN_F, stroke: C.GREEN_S, w: LW.obj });
  }

  // Section line A-A with arrowheads and letters.
  const s = G.section;
  const sy = px([0, s.y])[1];
  const [sa, sb] = [px([s.x0, 0])[0], px([s.x1, 0])[0]];
  d.ln(sa, sy, sb, sy, { w: LW.main, dash: [6, 2, 1, 2] });
  for (const x of [sa, sb]) {
    d.poly([[x, sy - 4], [x - 1.8, sy], [x + 1.8, sy]], { fill: C.INK, stroke: C.INK, w: LW.thin });
    d.txt("A", x, sy - 5.5, { size: 8, f: "b", col: C.INK, align: "c" });
  }

  d.hbar(25, 250, 25, 5, 20, "SCALE 1:200");
  d.north(275, 250);

  d.dataTable("SITE DATA", siteData());
};
