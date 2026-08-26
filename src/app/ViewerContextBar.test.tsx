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
};

describe("ViewerContextBar", () => {
  it("shows the active scale without the neutral workflow status", () => {
    const markup = renderToStaticMarkup(
      <ViewerContextBar context={context} onScaleChange={() => {}} />,
    );

    expect(markup).toContain("Main plan");
    expect(markup).toContain("Uniform");
    expect(markup).not.toContain("Ready");
    expect(markup).not.toContain(">Scale<");
    expect(markup).not.toContain(">Workflow<");
    expect(markup).not.toContain("None selected");
  });
});
