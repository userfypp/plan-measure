import { afterEach, describe, expect, it } from "vitest";
import type {
  LineMeasurement,
  MeasurementType,
  PageCalibration,
  PathMeasurement,
  Point,
} from "../types/domain";
import { resetAppPreferences, setAppPreference } from "./appPreferences";
import {
  architecturalSixteenthsToMillimetres,
  formatArchitecturalLength,
  formatAreaValue,
  formatCsvNumber,
  formatDisplayNumber,
  formatLinearValue,
  formatMeasurement,
  localizeNumberString,
  MAX_SAFE_ARCHITECTURAL_SIXTEENTHS,
} from "./format";
import {
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
  toMillimetres,
} from "./units";

const p = (x: number, y: number): Point => ({ x, y });
const ring = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  p(x0, y0),
  p(x1, y0),
  p(x1, y1),
  p(x0, y1),
];

describe("number rounding", () => {
  // toFixed rounds the stored binary value: 1.005 is really 1.00499999999999989..., so it shows
  // 1.00, while exact binary ties (0.125, 2.5) round away from zero.
  it.each([
    [1.005, 2, "1.00"],
    [2.675, 2, "2.67"],
    [1.255, 2, "1.25"],
    [10.075, 2, "10.07"],
    [8.345, 2, "8.35"],
    [0.125, 2, "0.13"],
    [-0.125, 2, "-0.13"],
    [2.5, 0, "3"],
    [-2.5, 0, "-3"],
    [0.5, 0, "1"],
    [1.45, 1, "1.4"],
    [1.25, 1, "1.3"],
  ])("shows %s with %i decimals as %s", (value, decimals, expected) => {
    expect(formatDisplayNumber(value, decimals as 0 | 1 | 2)).toBe(expected);
  });

  it("never shows a negative zero and keeps the sign of a tiny negative value", () => {
    expect(formatDisplayNumber(-0)).toBe("0.00");
    expect(formatDisplayNumber(-0.001)).toBe("-0.001");
    expect(formatDisplayNumber(-0.0000001)).toBe("-0.0000001");
  });

  it("falls back to the plain number for values smaller than toFixed can show", () => {
    expect(formatDisplayNumber(5e-324)).toBe("5e-324");
  });

  it.each([
    [0, "0.00"],
    [1, "1.00"],
    [1.5, "1.50"],
    [12.25, "12.25"],
    [0.01, "0.01"],
    [12.345, "12.345"],
    [100, "100.00"],
    [-1.5, "-1.50"],
    [0.1 + 0.2, "0.30000000000000004"],
    [1e-7, "1e-7"],
    [1e21, "1e+21"],
    [5e-324, "5e-324"],
    [Number.NaN, "NaN"],
    [Infinity, "Infinity"],
  ])("writes %s to CSV as %s", (value, expected) => {
    expect(formatCsvNumber(value)).toBe(expected);
  });

  it("writes a negative zero to CSV as an ordinary zero", () => {
    expect(formatCsvNumber(-0)).toBe("0.00");
  });
});

describe("thousands and decimal separators", () => {
  afterEach(() => resetAppPreferences());

  it("leaves the plain string alone with the default settings", () => {
    expect(localizeNumberString("1234567.89")).toBe("1234567.89");
  });

  it.each([
    ["comma", "point", "1,234,567.89"],
    ["space", "point", "1 234 567.89"],
    ["point", "comma", "1.234.567,89"],
    ["space", "comma", "1 234 567,89"],
    ["none", "comma", "1234567,89"],
  ] as const)("thousands %s with decimal %s gives %s", (thousands, decimal, expected) => {
    setAppPreference("thousandsSeparator", thousands);
    setAppPreference("decimalSeparator", decimal);
    expect(localizeNumberString("1234567.89")).toBe(expected);
  });

  it("drops a thousands separator that would clash with the decimal one", () => {
    setAppPreference("thousandsSeparator", "comma");
    setAppPreference("decimalSeparator", "comma");
    expect(localizeNumberString("1234567.89")).toBe("1234567,89");
    setAppPreference("thousandsSeparator", "point");
    setAppPreference("decimalSeparator", "point");
    expect(localizeNumberString("1234567.89")).toBe("1234567.89");
  });

  it("groups only the integer part, keeps the sign and leaves short numbers alone", () => {
    setAppPreference("thousandsSeparator", "comma");
    expect(localizeNumberString("-1234.5678")).toBe("-1,234.5678");
    expect(localizeNumberString("999.99")).toBe("999.99");
    expect(localizeNumberString("1000")).toBe("1,000");
    expect(localizeNumberString("1e+21")).toBe("1e+21");
  });

  it("applies the separators to formatted measurements", () => {
    setAppPreference("thousandsSeparator", "comma");
    setAppPreference("decimalSeparator", "point");
    expect(formatDisplayNumber(1234567.891, 1)).toBe("1,234,567.9");
    expect(formatLinearValue(1_234_567_000, "m", 2)).toBe("1,234,567.00 m");
  });
});

describe("architectural lengths", () => {
  const inches = (value: number) => formatArchitecturalLength(toMillimetres(value, "in"));

  it.each([
    [0, '0"'],
    [1 / 16, '1/16"'],
    [1 / 8, '1/8"'],
    [3 / 16, '3/16"'],
    [15 / 16, '15/16"'],
    [1, '1"'],
    [11, '11"'],
    [11 + 15 / 16, '11 15/16"'],
    [12, "1'"],
    [12 + 1 / 16, "1' 1/16\""],
    [30 + 7 / 8, "2' 6 7/8\""],
    [120, "10'"],
  ])("%s inches is written %s", (value, expected) => {
    expect(inches(value)).toBe(expected);
  });

  it("rounds the halfway point between sixteenths up", () => {
    expect(inches(1 / 32)).toBe('1/16"');
    expect(inches(3 / 32)).toBe('1/8"');
    expect(inches(5 / 32)).toBe('3/16"');
    expect(inches(1 + 1 / 32)).toBe('1 1/16"');
  });

  it("carries a rounded-up sixteenth into the next inch or foot", () => {
    expect(inches(31 / 32)).toBe('1"');
    expect(inches(11 + 31 / 32)).toBe("1'");
    expect(inches(35 + 31 / 32)).toBe("3'");
  });

  it("shows a tiny positive length as less than a sixteenth, never as zero", () => {
    expect(formatArchitecturalLength(0.0001)).toBe('< 1/16"');
    expect(formatArchitecturalLength(0.79)).toBe('< 1/16"');
    // Exactly half a sixteenth rounds up to a sixteenth.
    expect(formatArchitecturalLength(toMillimetres(1 / 32, "in"))).toBe('1/16"');
  });

  it.each([-1, Number.NaN, Infinity, -Infinity])("rejects %s", (value) => {
    expect(() => formatArchitecturalLength(value)).toThrow(RangeError);
  });

  it("converts whole sixteenths back to millimetres and rejects anything else", () => {
    expect(architecturalSixteenthsToMillimetres(0)).toBe(0);
    expect(architecturalSixteenthsToMillimetres(16)).toBe(25.4);
    expect(architecturalSixteenthsToMillimetres(192)).toBe(304.8);
    expect(architecturalSixteenthsToMillimetres(-1)).toBeNull();
    expect(architecturalSixteenthsToMillimetres(1.5)).toBeNull();
    expect(architecturalSixteenthsToMillimetres(Number.NaN)).toBeNull();
    expect(architecturalSixteenthsToMillimetres(MAX_SAFE_ARCHITECTURAL_SIXTEENTHS)).not.toBeNull();
    expect(architecturalSixteenthsToMillimetres(MAX_SAFE_ARCHITECTURAL_SIXTEENTHS + 1)).toBeNull();
  });

  it("writes every whole number of sixteenths in three feet as the same length", () => {
    const sixteenthsIn = (text: string) =>
      text
        .replace(/"$/, "")
        .split(" ")
        .reduce((total, token) => {
          if (token.endsWith("'")) return total + Number(token.slice(0, -1)) * 192;
          const [top, bottom] = token.split("/");
          return bottom ? total + (Number(top) * 16) / Number(bottom) : total + Number(token) * 16;
        }, 0);
    for (let sixteenths = 1; sixteenths <= 192 * 3; sixteenths += 1) {
      const text = formatArchitecturalLength(architecturalSixteenthsToMillimetres(sixteenths)!);
      expect(sixteenthsIn(text), text).toBe(sixteenths);
    }
  });
});

describe("unit constants", () => {
  it("converts square units with the published constants", () => {
    // 1 in = 25.4 mm, 1 ft = 304.8 mm, 1 m² = 10.7639104167097 ft², 1 acre = 4046.8564224 m².
    expect(fromSquareMillimetres(645.16, "in")).toBe(1);
    expect(fromSquareMillimetres(92903.04, "ft")).toBe(1);
    expect(fromSquareMillimetres(1_000_000, "ft")).toBeCloseTo(10.7639104167097, 12);
    expect(fromSquareMillimetres(1_000_000, "m")).toBe(1);
    expect(fromSquareMillimetres(100, "cm")).toBe(1);
    expect(fromSquareMillimetres(4_046_856_422.4, "m")).toBeCloseTo(4046.8564224, 9);
    expect(fromSquareMillimetresToAcres(4_046_856_422.4)).toBe(1);
    expect(fromSquareMillimetresToAcres(2_023_428_211.2)).toBe(0.5);
  });

  it("converts a length to square units consistently", () => {
    for (const unit of ["mm", "cm", "m", "in", "ft"] as const) {
      const side = toMillimetres(3, unit);
      expect(fromSquareMillimetres(side * side, unit)).toBeCloseTo(9, 12);
    }
  });

  it("round trips a length through every unit", () => {
    for (const unit of ["mm", "cm", "m", "in", "ft"] as const) {
      const back = fromMillimetres(toMillimetres(123.456, unit), unit);
      expect(Math.abs(back - 123.456) / 123.456, unit).toBeLessThan(1e-14);
    }
  });

  it("writes the same length in every display unit", () => {
    // 25400 mm = 25.4 m = 1000 in = 83.333... ft = 83' 4".
    expect(formatLinearValue(25400, "mm", 3)).toBe("25400.000 mm");
    expect(formatLinearValue(25400, "cm", 3)).toBe("2540.000 cm");
    expect(formatLinearValue(25400, "m", 3)).toBe("25.400 m");
    expect(formatLinearValue(25400, "in", 3)).toBe("1000.000 in");
    expect(formatLinearValue(25400, "ft", 3)).toBe("83.333 ft");
    expect(formatLinearValue(25400, "ft-in", 3)).toBe("83' 4\"");
  });

  it("writes the same area in every display unit and in acres", () => {
    // 64516 mm² = 100 in² = 645.16 cm² = 0.0645 m² = 0.6944 ft².
    expect(formatAreaValue(64516, "mm", "auto", 4)).toBe("64516.0000 mm²");
    expect(formatAreaValue(64516, "cm", "auto", 4)).toBe("645.1600 cm²");
    expect(formatAreaValue(64516, "m", "auto", 4)).toBe("0.0645 m²");
    expect(formatAreaValue(64516, "in", "auto", 4)).toBe("100.0000 in²");
    expect(formatAreaValue(64516, "ft", "auto", 4)).toBe("0.6944 ft²");
    expect(formatAreaValue(64516, "ft-in", "auto", 4)).toBe("0.6944 ft²");
    expect(formatAreaValue(4_046_856_422.4, "m", "ac", 2)).toBe("1.00 ac");
  });
});

describe("formatMeasurement for every type", () => {
  // 1 page unit is 10 mm.
  const scale: PageCalibration = {
    id: "scale",
    name: "Scale",
    mode: "uniform",
    start: p(0, 0),
    end: p(100, 0),
    referenceDistanceMm: 1000,
  };
  const measurement = (type: MeasurementType, points: Point[]) =>
    ({ id: "m", name: "m", type, calibrationId: "scale", points, visible: true }) as
      LineMeasurement | PathMeasurement;

  it.each([
    ["line", [p(0, 0), p(30, 40)], "500.00 mm"],
    ["polyline", [p(0, 0), p(30, 0), p(30, 40)], "700.00 mm"],
    ["polygon", [p(0, 0), p(30, 0), p(0, 40)], "P 1200.00 mm · A 60000.00 mm²"],
    ["rectangle", ring(0, 0, 20, 10), "P 600.00 mm · A 20000.00 mm²"],
    ["ellipse", ring(0, 0, 10, 10), "P 314.16 mm · A 7853.98 mm²"],
    ["cloud", [p(0, 0), p(30, 0), p(0, 40)], "P 1200.00 mm · A 60000.00 mm²"],
  ] as const)("%s", (type, points, expected) => {
    expect(formatMeasurement(measurement(type, [...points]), scale, "mm")).toBe(expected);
  });

  it("counts items with the right singular and plural", () => {
    expect(formatMeasurement(measurement("count", [p(1, 1)]), null, "mm")).toBe("1 item");
    expect(formatMeasurement(measurement("count", [p(1, 1), p(2, 2)]), null, "mm")).toBe("2 items");
  });

  it("converts to the display unit and keeps the labels for feet and inches", () => {
    const polygon = measurement("polygon", [p(0, 0), p(30, 0), p(0, 40)]);
    expect(formatMeasurement(polygon, scale, "m")).toBe("P 1.20 m · A 0.06 m²");
    expect(formatMeasurement(polygon, scale, "cm")).toBe("P 120.00 cm · A 600.00 cm²");
    expect(formatMeasurement(polygon, scale, "ft-in")).toBe("P 3' 11 1/4\" · A 0.65 ft²");
  });

  it("flags geometry that cannot be measured instead of showing a number", () => {
    expect(formatMeasurement(measurement("line", [p(1, 1), p(1, 1)]), scale, "mm")).toBe(
      "Repair required",
    );
    expect(formatMeasurement(measurement("polygon", [p(0, 0), p(1, 1)]), scale, "mm")).toBe(
      "Repair required",
    );
    expect(
      formatMeasurement(
        measurement("rectangle", [p(0, 0), p(4, 1), p(4, 3), p(0, 3)]),
        scale,
        "mm",
      ),
    ).toBe("Repair required");
  });
});
