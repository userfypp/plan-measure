// Geometry of the Orchard House sample, in real metres (y grows downwards on
// plans). Pure data plus pure measuring helpers; no drawing code lives here.

export const area = (pts) =>
  Math.abs(
    pts.reduce((a, [x, y], i) => {
      const [x2, y2] = pts[(i + 1) % pts.length];
      return a + x * y2 - x2 * y;
    }, 0) / 2,
  );

export const polylineLength = (pts) =>
  pts.slice(1).reduce((a, [x, y], i) => a + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

export const perimeter = (pts) => polylineLength([...pts, pts[0]]);

export const rectPoly = ([x1, y1, x2, y2]) => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

export const ellipseArea = (rx, ry) => Math.PI * rx * ry;

// Ramanujan II approximation.
export const ellipsePerimeter = (rx, ry) => {
  const h = ((rx - ry) / (rx + ry)) ** 2;
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

export const circleArea = (d) => Math.PI * (d / 2) ** 2;

// Area under a profile (trapezoids down to z = 0).
export const profileArea = (pts) =>
  pts.slice(1).reduce((a, [c, z], i) => a + ((c - pts[i][0]) * (z + pts[i][1])) / 2, 0);

const GROUND_ROOMS = [
  ["Living / Dining", [[0.3, 0.3], [6.9, 0.3], [6.9, 3.6], [3.4, 3.6], [3.4, 8.2], [0.3, 8.2]]],
  ["Kitchen", rectPoly([7.0, 0.3, 12.7, 3.6])],
  ["Corridor", rectPoly([3.5, 3.7, 12.7, 4.9])],
  ["Bedroom 1", rectPoly([3.5, 5.0, 7.4, 8.2])],
  ["Bath", rectPoly([7.5, 5.0, 9.6, 8.2])],
  ["Bedroom 2", rectPoly([9.7, 5.0, 12.7, 8.2])],
].map(([name, poly]) => ({ name, poly }));

// Doors: hole [x1,y1,x2,y2], hinge, open and closed unit directions, leaf width.
const door = (hole, hinge, open, closed, w) => ({ hole, hinge, open, closed, w });

export const DOOR_TYPES = {
  D1: { w: 0.9, h: 2.1, desc: "Entrance door, single leaf" },
  D2: { w: 0.8, h: 2.1, desc: "Internal door, single leaf" },
  D3: { w: 0.7, h: 2.1, desc: "Bathroom door, single leaf" },
};
export const WINDOW_TYPES = {
  W1: { w: 1.5, h: 1.2, sill: 0.9, desc: "Window, large" },
  W2: { w: 1.2, h: 1.2, sill: 0.9, desc: "Window, medium" },
  W3: { w: 0.9, h: 0.6, sill: 1.5, desc: "Window, small high-level" },
};

export const SAMPLE_GEOMETRY = {
  site: {
    parcel: [[0, 0], [40, 0], [41, 26], [26, 34], [0, 32]],
    house: [6, 6, 19, 14.5],
    terrace: [8, 14.5, 11, 16.5],
    parking: { x0: 27, y0: 0, w: 2.5, d: 5, n: 4 },
    pond: { c: [30, 20], rx: 4, ry: 2.5 },
    path: { axis: [[19, 10.3], [21.5, 10.3], [21.5, 4.0], [24.5, 0.0]], width: 1.2 },
    trees: { d: 4.0, pts: [[4, 25], [10, 28], [17, 29], [24, 27], [36, 12], [37.5, 19]] },
    section: { y: 24, x0: -2, x1: 42 },
  },
  detail: {
    terrace: { w: 3.0, h: 2.0, joint: 0.5 },
    planter: { c: [2.5, 1.0], d: 0.8 },
    bollards: { d: 0.08, pts: [[0.15, 0.15], [2.85, 0.15], [0.15, 1.85], [2.85, 1.85]] },
    bench: [0.4, 1.3, 2.0, 1.75],
  },
  section: {
    terrain: [[0, 0.5], [8, 1.2], [16, 2.4], [24, 2.0], [32, 2.8], [40, 1.6]],
  },
  ground: {
    size: [13.0, 8.5],
    wallsExt: 0.3,
    walls: [
      [0, 0, 13, 0.3], [0, 8.2, 13, 8.5], [0, 0.3, 0.3, 8.2], [12.7, 0.3, 13, 8.2],
      [6.9, 0.3, 7.0, 3.6], [3.4, 3.6, 12.7, 3.7], [3.4, 3.7, 3.5, 8.2],
      [3.5, 4.9, 12.7, 5.0], [7.4, 5.0, 7.5, 8.2], [9.6, 5.0, 9.7, 8.2],
    ],
    rooms: GROUND_ROOMS,
    doors: [
      door([12.7, 3.85, 13.0, 4.75], [12.7, 4.75], [-1, 0], [0, -1], 0.9),
      door([3.4, 3.85, 3.5, 4.65], [3.5, 4.65], [1, 0], [0, -1], 0.8),
      door([8.0, 3.6, 8.8, 3.7], [8.0, 3.6], [0, -1], [1, 0], 0.8),
      door([5.0, 4.9, 5.8, 5.0], [5.0, 5.0], [0, 1], [1, 0], 0.8),
      door([8.1, 4.9, 8.8, 5.0], [8.1, 5.0], [0, 1], [1, 0], 0.7),
      door([10.5, 4.9, 11.3, 5.0], [11.3, 5.0], [0, 1], [-1, 0], 0.8),
    ],
    windows: [
      ["N", 1.0, 2.5, "W1"], ["N", 4.0, 5.5, "W1"], ["N", 8.5, 10.0, "W1"], ["N", 11.0, 12.2, "W2"],
      ["S", 1.0, 2.5, "W1"], ["S", 4.8, 6.3, "W1"], ["S", 10.5, 12.0, "W1"], ["S", 8.1, 9.0, "W3"],
      ["O", 5.0, 6.5, "W1"], ["E", 1.2, 2.4, "W2"],
    ].map(([side, a, b, type]) => ({ side, a, b, type })),
    table: { c: [1.85, 6.2], d: 1.2, chairs: 6, chair: 0.45, chairR: 0.85 },
    island: [9.2, 1.5, 11.2, 2.5],
    bathtub: [7.7, 7.2, 9.4, 8.0],
    axesX: [0.15, 3.45, 7.45, 9.65, 12.85],
    axesY: [0.15, 3.65, 4.95, 8.35],
  },
  roof: {
    size: [13.0, 8.5],
    ridgeY: 4.25,
    skylights: [[3.0, 1.5, 4.0, 2.9], [9.0, 1.5, 10.0, 2.9]],
    downpipes: { d: 0.15, pts: [[0.5, -0.2], [12.5, -0.2], [0.5, 8.7], [12.5, 8.7]] },
    wallH: 3.0,
    ridgeH: 5.2,
  },
};

const G = SAMPLE_GEOMETRY;
// Door type is derived from the leaf width (0.9 / 0.8 / 0.7 m).
for (const d of G.ground.doors)
  d.type = Object.keys(DOOR_TYPES).find((t) => DOOR_TYPES[t].w === d.w);

// East gable in metres, y up, origin at the floor line.
export const gableEast = () => {
  const [, d] = G.ground.size;
  return [[0, 0], [d, 0], [d, G.roof.wallH], [d / 2, G.roof.ridgeH], [0, G.roof.wallH]];
};
