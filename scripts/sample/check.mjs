// Verifies the sample geometry against the expected measurements (+-0.5 %)
// and reports overlapping or out-of-frame text boxes.
// Usage: node scripts/sample/check.mjs
import { buildSamplePdf } from "../generate-sample-pdf.mjs";
import {
  DOOR_TYPES,
  SAMPLE_GEOMETRY as G,
  WINDOW_TYPES,
  area,
  circleArea,
  ellipseArea,
  ellipsePerimeter,
  gableEast,
  perimeter,
  polylineLength,
  profileArea,
  rectPoly,
} from "./geometry.mjs";

const rows = [];
const expect = (name, got, want) => {
  const ok = Math.abs(got - want) <= Math.max(Math.abs(want) * 0.005, 0.005);
  rows.push(ok);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${got.toFixed(2)} (expected ${want})`);
};

const room = (n) => G.ground.rooms.find((r) => r.name === n).poly;
for (const [n, a, p] of [
  ["Living / Dining", 36.04, 29.0],
  ["Kitchen", 18.81, 18.0],
  ["Corridor", 11.04, 20.8],
  ["Bedroom 1", 12.48, 14.2],
  ["Bath", 6.72, 10.6],
  ["Bedroom 2", 9.6, 12.4],
]) {
  expect(`${n} area`, area(room(n)), a);
  expect(`${n} perimeter`, perimeter(room(n)), p);
}
const S = G.site;
expect("parcel area", area(S.parcel), 1295);
expect("parcel perimeter", perimeter(S.parcel), 141.1);
expect("parcel north side", Math.hypot(...S.parcel[1]), 40);
expect("path axis", polylineLength(S.path.axis), 13.8);
expect("pond area", ellipseArea(S.pond.rx, S.pond.ry), 31.42);
expect("pond perimeter", ellipsePerimeter(S.pond.rx, S.pond.ry), 20.69);
expect("parking", S.parking.n * S.parking.w * S.parking.d, 50);
expect("house", area(rectPoly(S.house)), 110.5);
S.trees.pts.forEach((_, i) => expect(`tree ${i + 1}`, circleArea(S.trees.d), 12.57));
expect("terrace area", area(rectPoly(G.site.terrace)), 6);
expect("terrace perimeter", perimeter(rectPoly(G.site.terrace)), 10);
expect("bench", area(rectPoly(G.detail.bench)), 0.72);
expect("planter", circleArea(G.detail.planter.d), 0.5);
expect("profile length", polylineLength(G.section.terrain), 40.26);
expect("area under profile", profileArea(G.section.terrain), 75.6);
expect("roof", area(rectPoly([0, 0, ...G.roof.size])), 110.5);
const sk = G.roof.skylights[0];
expect("skylight", area(rectPoly(sk)), 1.4);
expect("east gable", area(gableEast()), 34.85);
const gross = G.ground.size[0] * G.roof.wallH;
const holes = G.ground.windows
  .filter((w) => w.side === "S")
  .reduce((a, w) => a + WINDOW_TYPES[w.type].w * WINDOW_TYPES[w.type].h, 0);
expect("south facade gross", gross, 39);
expect("south openings", holes, 5.94);
expect("south facade net", gross - holes, 33.06);
for (const [id, v] of [["D1", 1.89], ["D2", 1.68], ["D3", 1.47]])
  expect(`${id} area`, DOOR_TYPES[id].w * DOOR_TYPES[id].h, v);
for (const [id, v] of [["W1", 1.8], ["W2", 1.44], ["W3", 0.54]])
  expect(`${id} area`, WINDOW_TYPES[id].w * WINDOW_TYPES[id].h, v);

// Trees must clear the pond and each other (and stay inside the parcel).
const tr = S.trees;
tr.pts.forEach(([x, y], i) => {
  const rx = (S.pond.rx + tr.d / 2) ** 2;
  const nearPond = ((x - S.pond.c[0]) ** 2) / rx + ((y - S.pond.c[1]) ** 2) / ((S.pond.ry + tr.d / 2) ** 2) < 1;
  if (nearPond) console.log(`FAIL tree ${i + 1} overlaps the pond`);
  tr.pts.slice(i + 1).forEach(([x2, y2], j) => {
    if (Math.hypot(x - x2, y - y2) < tr.d) console.log(`FAIL trees ${i + 1}/${i + j + 2} overlap`);
  });
});

// Door and window openings must match the plan widths of their types.
G.ground.doors.forEach((d, i) => {
  const [x1, y1, x2, y2] = d.hole;
  const len = Math.max(x2 - x1, y2 - y1);
  expect(`door ${i + 1} hole = leaf ${d.type}`, len, d.w);
});
G.ground.windows.forEach((w, i) => expect(`window ${i + 1} ${w.type} width`, w.b - w.a, WINDOW_TYPES[w.type].w));

// Dimension axes versus wall centres.
const centres = G.ground.walls.flatMap(([x1, y1, x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2]);
for (const v of [...G.ground.axesX, ...G.ground.axesY])
  if (!centres.some((c) => Math.abs(c - v) < 1e-9)) console.log(`FAIL axis ${v} is not a wall centre`);

// Text boxes: overlaps and frame bounds.
const { pages } = await buildSamplePdf();
let issues = 0;
pages.forEach((boxes, p) => {
  const [xMax] = p === 5 ? [200] : [410];
  boxes.forEach((a, i) => {
    if (a.x0 < 10.5 || a.x1 > xMax - 0.5 || a.y0 < 10.5 || a.y1 > 286.5) {
      console.log(`page ${p + 1}: "${a.s}" outside the frame`);
      issues++;
    }
    for (const b of boxes.slice(i + 1))
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) {
        console.log(`page ${p + 1}: text overlap "${a.s}" / "${b.s}"`);
        issues++;
      }
  });
});
const failed = rows.filter((o) => !o).length;
console.log(`${rows.length - failed}/${rows.length} measurements OK, ${issues} text issues`);
process.exitCode = failed || issues ? 1 : 0;
