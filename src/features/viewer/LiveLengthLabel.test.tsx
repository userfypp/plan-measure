// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  setAppPreference,
} from "../../utils/appPreferences";
import type { UniformPageCalibration } from "../../types/domain";
import { MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX } from "./annotationLabelLayout";
import { LiveLengthLabel } from "./LiveLengthLabel";
import { resolveCanvasVisualRoles } from "./canvasVisualRoles";

const captured = vi.hoisted(() => ({ props: {} as Record<string, Record<string, unknown>> }));

vi.mock("react-konva", () => {
  const make = (name: string) => (props: Record<string, unknown>) => {
    captured.props[name] = props;
    return props.children ?? null;
  };
  return { Label: make("Label"), Tag: make("Tag"), Text: make("Text") };
});

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class {
    constructor(private config: { text: string; fontSize: number; padding: number }) {}
    width() {
      return this.config.text.length * this.config.fontSize * 0.6 + 2 * this.config.padding;
    }
    height() {
      return this.config.fontSize + 2 * this.config.padding;
    }
  },
}));

function prop(name: string): Record<string, unknown> {
  const found = captured.props[name];
  if (!found) throw new Error(`${name} was not rendered`);
  return found;
}

// 100 px is 1 m, so the 208.8 px draft segment below is 2.088 m.
const calibration: UniformPageCalibration = {
  id: "calibration-1",
  name: "Scale 1",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  referenceDistanceMm: 1000,
};

const base: Parameters<typeof LiveLengthLabel>[0] = {
  from: { x: 100, y: 100 },
  to: { x: 300, y: 160 },
  bounds: { width: 1000, height: 800 },
  zoom: 1.5,
  roles: resolveCanvasVisualRoles("light"),
  calibration,
  displayUnit: "m",
  decimalPlaces: 2,
};

describe("LiveLengthLabel", () => {
  beforeEach(() => {
    captured.props = {};
    localStorage.clear();
  });

  it("renders at the placed position with preference-driven size and opacity", () => {
    const html = renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(html).toBeDefined();
    const label = prop("Label");
    const text = prop("Text");
    expect(label.name).toBe("live-length-label");
    expect(text.text).toBe("2.09 m");
    expect(Number.isFinite(label.x as number)).toBe(true);
    expect(Number.isFinite(label.y as number)).toBe(true);
    expect(text.fontSize as number).toBeCloseTo(
      (MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * LABEL_SIZE_SCALE.normal) / base.zoom,
    );
    expect(prop("Tag").opacity as number).toBeCloseTo(0.88 * LABEL_BACKGROUND_OPACITY.solid);
  });

  it("follows label size and background preferences", () => {
    setAppPreference("labelSize", "large");
    setAppPreference("labelBackground", "translucent");
    renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(prop("Text").fontSize as number).toBeCloseTo(
      (MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * LABEL_SIZE_SCALE.large) / base.zoom,
    );
    expect(prop("Tag").opacity as number).toBeCloseTo(0.88 * LABEL_BACKGROUND_OPACITY.translucent);
    setAppPreference("labelSize", "normal");
    setAppPreference("labelBackground", "solid");
  });

  it("keeps the text readable over the plan and follows a chosen text color", () => {
    const { roles } = base;
    renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(prop("Tag").fill).toBe(roles.labelBackground);
    expect(prop("Text").fill).toBe(roles.labelText);
    setAppPreference("labelBackground", "translucent");
    renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(prop("Tag").fill).toBe(roles.labelBackground);
    expect(prop("Text").fill).toBe(roles.labelText);
    setAppPreference("labelBackground", "none");
    renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(prop("Text").fill).toBe(roles.labelBackground);
    expect(prop("Text").stroke).toBe(roles.labelText);
    setAppPreference("labelTextColor", "red");
    setAppPreference("labelBackground", "solid");
    renderToStaticMarkup(<LiveLengthLabel {...base} />);
    expect(prop("Tag").fill).toBe(roles.labelText);
    expect(prop("Text").fill).toBe("#d92d20");
    setAppPreference("labelTextColor", "auto");
  });

  it("formats the length in the chosen unit and precision", () => {
    renderToStaticMarkup(<LiveLengthLabel {...base} displayUnit="mm" decimalPlaces={0} />);
    expect(prop("Text").text).toBe("2088 mm");
  });

  it("renders nothing without bounds", () => {
    expect(() => renderToStaticMarkup(<LiveLengthLabel {...base} bounds={null} />)).not.toThrow();
    expect(captured.props.Label).toBeUndefined();
  });

  it("renders nothing without a calibration or for a zero-length segment", () => {
    renderToStaticMarkup(<LiveLengthLabel {...base} calibration={null} />);
    expect(captured.props.Label).toBeUndefined();
    renderToStaticMarkup(<LiveLengthLabel {...base} to={base.from} />);
    expect(captured.props.Label).toBeUndefined();
  });
});
