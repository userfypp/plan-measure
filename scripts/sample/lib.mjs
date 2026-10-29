// Drawing helpers for the sample sheets. Everything is expressed in millimetres
// of paper measured from the top-left corner of the (displayed) sheet.
import { degrees, rgb } from "pdf-lib";

export const PT = 72 / 25.4;

const hex = (h) =>
  rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  );
export const C = {
  PAPER: hex("#FFFFFF"),
  INK: hex("#1B2129"),
  WALL: hex("#3D444B"),
  TEXT2: hex("#5F6B76"),
  FINE: hex("#A7B0B8"),
  FOOT: hex("#EEF0F2"),
  GREEN_F: hex("#EAF1E6"),
  GREEN_S: hex("#7D9A78"),
  WATER_F: hex("#E9EEF4"),
  WATER_S: hex("#8DA3B8"),
};
// Line weights in pt.
export const LW = { fine: 0.25, thin: 0.35, obj: 0.5, main: 0.7, terrain: 1.0 };

export const fmtNum = (v) => String(Number(v.toFixed(2)));

// Creates a drawing context. H is the displayed page height in points.
export const createCtx = (pg, H, fonts) => {
  const boxes = [];
  const X = (mm) => mm * PT;
  const Y = (mm) => H - mm * PT;
  const font = (f) => (f === "b" ? fonts.bold : fonts.regular);
  const tw = (s, size = 6, f = "r") => font(f).widthOfTextAtSize(s, size) / PT;

  const ln = (x1, y1, x2, y2, { w = LW.obj, col = C.INK, dash } = {}) =>
    pg.drawLine({
      start: { x: X(x1), y: Y(y1) },
      end: { x: X(x2), y: Y(y2) },
      thickness: w,
      color: col,
      dashArray: dash,
    });

  const rect = (x, y, w, h, { fill, stroke, w: bw = LW.obj, dash } = {}) =>
    pg.drawRectangle({
      x: X(x),
      y: Y(y + h),
      width: w * PT,
      height: h * PT,
      color: fill,
      borderColor: stroke,
      borderWidth: stroke ? bw : 0,
      borderDashArray: dash,
    });

  const circle = (cx, cy, r, { fill, stroke, w = LW.obj } = {}) =>
    pg.drawCircle({
      x: X(cx),
      y: Y(cy),
      size: r * PT,
      color: fill,
      borderColor: stroke,
      borderWidth: stroke ? w : 0,
    });

  const ellipse = (cx, cy, rx, ry, { fill, stroke, w = LW.obj } = {}) =>
    pg.drawEllipse({
      x: X(cx),
      y: Y(cy),
      xScale: rx * PT,
      yScale: ry * PT,
      color: fill,
      borderColor: stroke,
      borderWidth: stroke ? w : 0,
    });

  // cmds: ["M",x,y] ["L",x,y] ["A",r,sweep,x,y] ["Z"], coordinates in mm.
  const path = (cmds, { fill, stroke, w = LW.obj, dash } = {}) => {
    const d = cmds
      .map(([c, ...a]) => {
        if (c === "Z") return "Z";
        if (c === "A") return `A ${a[0] * PT} ${a[0] * PT} 0 0 ${a[1]} ${a[2] * PT} ${a[3] * PT}`;
        return `${c} ${a[0] * PT} ${a[1] * PT}`;
      })
      .join(" ");
    pg.drawSvgPath(d, {
      x: 0,
      y: H,
      color: fill,
      borderColor: stroke,
      borderWidth: stroke ? w : 0,
      borderDashArray: dash,
    });
  };
  const line = (pts, closed, opts) =>
    path([...pts.map(([x, y], i) => [i ? "L" : "M", x, y]), ...(closed ? [["Z"]] : [])], opts);
  const poly = (pts, opts) => line(pts, true, opts);
  const polyline = (pts, opts) => line(pts, false, opts);

  // Text with baseline at (x, y). Records its box for overlap checks.
  const txt = (s, x, y, { size = 6, f = "r", col = C.TEXT2, align = "l", rot = 0 } = {}) => {
    const w = tw(s, size, f);
    const cap = (size * 0.72) / PT;
    const off = align === "c" ? w / 2 : align === "r" ? w : 0;
    if (rot) {
      boxes.push({ s, x0: x - cap, x1: x, y0: y + off - w, y1: y + off });
      pg.drawText(s, {
        x: X(x),
        y: Y(y) - off * PT,
        size,
        font: font(f),
        color: col,
        rotate: degrees(rot),
      });
    } else {
      boxes.push({ s, x0: x - off, x1: x - off + w, y0: y - cap, y1: y });
      pg.drawText(s, { x: X(x - off), y: Y(y), size, font: font(f), color: col });
    }
  };

  // View title: 10 pt bold capitals underlined with 0.5 pt of the text width.
  const title = (s, x, y) => {
    txt(s, x, y, { size: 10, f: "b", col: C.INK });
    ln(x, y + 1.4, x + tw(s, 10, "b"), y + 1.4, { w: LW.obj });
  };

  // Horizontal dimension chain. xs: tick positions, ref: y of the measured
  // element, y: dimension line, labels: one per segment.
  const hdim = (xs, y, ref, labels) => {
    const dir = Math.sign(y - ref);
    ln(xs[0], y, xs[xs.length - 1], y, { w: LW.thin, col: C.TEXT2 });
    xs.forEach((x) => {
      ln(x, ref + dir * 1, x, y + dir * 1.5, { w: LW.fine, col: C.FINE });
      ln(x - 0.9, y + 0.9, x + 0.9, y - 0.9, { w: LW.obj, col: C.TEXT2 });
    });
    labels.forEach((l, i) =>
      txt(l, (xs[i] + xs[i + 1]) / 2, dir < 0 ? y - 1 : y + 3, { align: "c" }),
    );
  };
  // Vertical dimension chain, text on the left of the line.
  const vdim = (ys, x, ref, labels) => {
    const dir = Math.sign(x - ref);
    ln(x, ys[0], x, ys[ys.length - 1], { w: LW.thin, col: C.TEXT2 });
    ys.forEach((y) => {
      ln(ref + dir * 1, y, x + dir * 1.5, y, { w: LW.fine, col: C.FINE });
      ln(x - 0.9, y + 0.9, x + 0.9, y - 0.9, { w: LW.obj, col: C.TEXT2 });
    });
    labels.forEach((l, i) => txt(l, x - 1, (ys[i] + ys[i + 1]) / 2, { align: "c", rot: 90 }));
  };

  // Alternating scale bar. step: mm per segment, mmPerM: drawing scale,
  // totalM: bar length in metres.
  const hbar = (x, y, step, mmPerM, totalM, scale) => {
    const n = Math.round((totalM * mmPerM) / step);
    const mSeg = step / mmPerM;
    for (let i = 0; i < n; i++)
      rect(x + i * step, y, step, 2.5, { fill: i % 2 ? C.PAPER : C.INK, stroke: C.INK, w: LW.obj });
    for (let i = 0; i <= n; i++)
      txt(fmtNum(i * mSeg) + (i === n ? " m" : ""), x + i * step, y + 2.5 + 3, { align: "c" });
    txt(scale, x, y - 1.8, { size: 7, f: "b", col: C.INK });
  };
  // Vertical scale bar: y is the baseline (zero), growing upwards.
  const vbar = (x, y, step, mmPerM, totalM, scale, capAlign = "r") => {
    const n = Math.round((totalM * mmPerM) / step);
    const mSeg = step / mmPerM;
    for (let i = 0; i < n; i++)
      rect(x, y - (i + 1) * step, 2.5, step, {
        fill: i % 2 ? C.PAPER : C.INK,
        stroke: C.INK,
        w: LW.obj,
      });
    for (let i = 0; i <= n; i++)
      txt(fmtNum(i * mSeg) + (i === n ? " m" : ""), x + 2.5 + 1.2, y - i * step + 0.7);
    txt(scale, capAlign === "r" ? x + 2.5 : x, y - n * step - 2.5, {
      size: 7,
      f: "b",
      col: C.INK,
      align: capAlign,
    });
  };

  const north = (cx, cy, r = 6) => {
    circle(cx, cy, r, { fill: C.PAPER, stroke: C.INK, w: LW.obj });
    poly(
      [
        [cx, cy - r * 0.8],
        [cx - r * 0.3, cy + r * 0.65],
        [cx, cy + r * 0.3],
      ],
      {
        fill: C.INK,
        stroke: C.INK,
        w: LW.thin,
      },
    );
    poly(
      [
        [cx, cy - r * 0.8],
        [cx + r * 0.3, cy + r * 0.65],
        [cx, cy + r * 0.3],
      ],
      {
        fill: C.PAPER,
        stroke: C.INK,
        w: LW.thin,
      },
    );
    txt("N", cx, cy - r - 1.5, { size: 8, f: "b", col: C.INK, align: "c" });
  };

  // Sheet frame and title block. size "A3" (400 x 277 frame) or "A4".
  const sheet = ({ size, no, page, total, name, scales }) => {
    const ink = { col: C.INK };
    const cell = (x, y, label, vals, wCell) => {
      txt(label, x + 3, y + 3.8, { size: 6 });
      const multi = vals.length > 1;
      vals.forEach((v, i) =>
        txt(v, x + 3, y + (multi ? 8.8 + i * 3.6 : 12.5), {
          size: multi ? 7 : 12,
          f: multi ? "r" : "b",
          ...ink,
        }),
      );
      return wCell;
    };
    if (size === "A3") {
      rect(10, 10, 400, 277, { stroke: C.INK, w: LW.main });
      const x = 305;
      const y = 222;
      rect(x, y, 95, 60, { fill: C.PAPER, stroke: C.INK, w: LW.main });
      rect(x, y, 95, 9, { fill: C.INK });
      txt("ORCHARD HOUSE", x + 3, y + 6, { size: 8, f: "b", col: C.PAPER });
      txt("Sheet title", x + 3, y + 13, { size: 6 });
      txt(name, x + 3, y + 21, { size: 12, f: "b", ...ink });
      ln(x, y + 27, x + 95, y + 27, { w: LW.main });
      ln(x, y + 51, x + 95, y + 51, { w: LW.obj });
      for (const dx of [32, 72]) ln(x + dx, y + 27, x + dx, y + 51, { w: LW.obj });
      cell(x, y + 27, "SHEET", [no], 32);
      cell(x + 32, y + 27, "SCALE", scales, 40);
      cell(x + 72, y + 27, "PAGE", [`${page} / ${total}`], 23);
      txt("A3 · Plan Measure sample – not for construction", x + 3, y + 56, { size: 6 });
    } else {
      rect(10, 10, 190, 277, { stroke: C.INK, w: LW.main });
      const x = 15;
      const y = 252;
      rect(x, y, 180, 30, { fill: C.PAPER, stroke: C.INK, w: LW.main });
      rect(x, y, 180, 7, { fill: C.INK });
      txt("ORCHARD HOUSE", x + 3, y + 5, { size: 8, f: "b", col: C.PAPER });
      const ry = y + 7;
      ln(x, ry + 18, x + 180, ry + 18, { w: LW.obj });
      for (const dx of [80, 110, 150]) ln(x + dx, ry, x + dx, ry + 18, { w: LW.obj });
      cell(x, ry, "Sheet title", [name], 80);
      cell(x + 80, ry, "SHEET", [no], 30);
      cell(x + 110, ry, "SCALE", scales, 40);
      cell(x + 150, ry, "PAGE", [`${page} / ${total}`], 30);
      txt("A4 · Plan Measure sample – not for construction", x + 3, y + 28, { size: 6 });
    }
  };

  // Right-column data table: title at y=29, rule at y=34, rows of 6 mm.
  const dataTable = (name, rows) => {
    title(name, 305, 29);
    ln(305, 34, 400, 34, { w: LW.obj });
    rows.forEach(([k, v], i) => {
      const y = 34 + 6 * i;
      const last = i === rows.length - 1;
      txt(k, 306, y + 4.1, { size: 7, col: C.INK });
      txt(v, 399, y + 4.1, { size: 7, col: C.INK, align: "r" });
      ln(305, y + 6, 400, y + 6, { w: last ? LW.obj : LW.fine, col: last ? C.INK : C.FINE });
    });
  };

  return {
    pg,
    H,
    boxes,
    dataTable,
    X,
    Y,
    tw,
    ln,
    rect,
    circle,
    ellipse,
    path,
    poly,
    polyline,
    txt,
    title,
    hdim,
    vdim,
    hbar,
    vbar,
    north,
    sheet,
  };
};
