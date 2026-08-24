import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewerContextBar, type ViewerContextData } from "./ViewerContextBar";

const context: ViewerContextData = {
  scale: {
    name: "Main plan",
    id: "scale-1",
    modeLabel: "Uniform",
    options: [{ id: "scale-1", name: "Main plan" }],
  },
  workflow: { label: "Ready", tone: "neutral" },
  selection: null,
};

describe("ViewerContextBar", () => {
  it("shows only scale and workflow context without repeating the active tool", () => {
    const markup = renderToStaticMarkup(<ViewerContextBar context={context} onScaleChange={() => {}} />);

    expect(markup).toContain("Main plan");
    expect(markup).toContain("Ready");
    expect(markup).toContain("None selected");
  });
});
