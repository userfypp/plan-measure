// Sheet 5: A-201 roof plan and elevations 1:100 (10 mm per metre).
// Drawn in the displayed (landscape) system; the page itself is a rotated A3.
import {
  DOOR_TYPES,
  SAMPLE_GEOMETRY,
  WINDOW_TYPES,
  area,
  gableEast,
  rectPoly,
} from "./geometry.mjs";
import { C, LW } from "./lib.mjs";

const R = SAMPLE_GEOMETRY.roof;
const GR = SAMPLE_GEOMETRY.ground;
const K = 10;

// Window rectangle of an elevation, in paper mm (floor line at yFloor).
const windowRect = (type, a, b, yFloor, x0) => {
  const t = WINDOW_TYPES[type];
  return [x0 + K * a, yFloor - K * (t.sill + t.h), K * (b - a), K * t.h];
};

export const drawRoof = (d) => {
  d.sheet({
    size: "A3",
    no: "A-201",
    page: 5,
    total: 6,
    name: "Roof plan & elevations",
    scales: ["1:100"],
  });

  // Roof plan.
  const [ox, oy] = [30, 45];
  const [w, h] = R.size;
  d.title("ROOF PLAN  1:100", 30, 28);
  d.rect(ox, oy, w * K, h * K, { fill: C.FOOT, stroke: C.INK, w: LW.main });
  d.ln(ox, oy + R.ridgeY * K, ox + w * K, oy + R.ridgeY * K, { w: LW.obj });
  for (const [x1, y1, x2, y2] of R.skylights) {
    const [rx, ry, rw, rh] = [ox + x1 * K, oy + y1 * K, (x2 - x1) * K, (y2 - y1) * K];
    d.rect(rx, ry, rw, rh, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
    d.ln(rx, ry + rh, rx + rw, ry, { w: LW.fine, col: C.FINE });
  }
  for (const [x, y] of R.downpipes.pts)
    d.circle(ox + x * K, oy + y * K, (R.downpipes.d / 2) * K, {
      fill: C.INK,
      stroke: C.INK,
      w: LW.thin,
    });
  d.hdim([ox, ox + w * K], 38, oy, ["13.00"]);
  d.vdim([oy, oy + h * K], 22, ox, ["8.50"]);
  d.north(175, 55);

  // East elevation.
  const [ex, ey] = [195, 130];
  d.title("EAST ELEVATION  1:100", ex, 66);
  d.poly(
    gableEast().map(([x, y]) => [ex + K * x, ey - K * y]),
    { fill: C.PAPER, stroke: C.INK, w: LW.main },
  );
  d.ln(ex - 10, ey, ex + 8.5 * K + 10, ey, { w: LW.main });
  const d1 = DOOR_TYPES.D1;
  const dx = ex + K * (GR.size[1] - GR.doors[0].hole[3]);
  d.rect(dx, ey - K * d1.h, d1.w * K, d1.h * K, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
  d.txt("D1", dx + (d1.w * K) / 2, ey - (d1.h * K) / 2 + 1, {
    size: 6,
    f: "b",
    col: C.INK,
    align: "c",
  });
  for (const wd of GR.windows.filter((o) => o.side === "E")) {
    const [x, y, ww, hh] = windowRect(wd.type, GR.size[1] - wd.b, GR.size[1] - wd.a, ey, ex);
    d.rect(x, y, ww, hh, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
    d.txt(wd.type, x + ww / 2, y + hh / 2 + 1, { size: 6, f: "b", col: C.INK, align: "c" });
  }

  // South elevation.
  const [sx, sy] = [30, 245];
  d.title("SOUTH ELEVATION  1:100", sx, 185);
  d.rect(sx, sy - K * R.ridgeH, w * K, (R.ridgeH - R.wallH) * K, {
    fill: C.FOOT,
    stroke: C.INK,
    w: LW.main,
  });
  d.rect(sx, sy - K * R.wallH, w * K, R.wallH * K, { fill: C.PAPER, stroke: C.INK, w: LW.main });
  d.ln(sx - 10, sy, sx + w * K + 10, sy, { w: LW.main });
  for (const wd of GR.windows.filter((o) => o.side === "S")) {
    const [x, y, ww, hh] = windowRect(wd.type, wd.a, wd.b, sy, sx);
    d.rect(x, y, ww, hh, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
    d.txt(wd.type, x + ww / 2, y + hh / 2 + 1, { size: 6, f: "b", col: C.INK, align: "c" });
  }
  d.hbar(185, 242.5, 25, K, 10, "SCALE 1:100");
  const skyArea = area(rectPoly(R.skylights[0]));
  d.dataTable("ROOF DATA", [
    ["Roof area", `${area(rectPoly([0, 0, w, h])).toFixed(2)} m²`],
    ["Ridge length", `${w.toFixed(2)} m`],
    ["Rooflights", `${R.skylights.length} × ${skyArea.toFixed(2)} m²`],
    ["Downpipes", String(R.downpipes.pts.length)],
    ["Gable (east)", `${area(gableEast()).toFixed(2)} m²`],
  ]);
};
