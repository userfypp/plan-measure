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
    expect(markup).not.toContain("Duplicate");
  });

  it("renders a compact selected-measurement action at the right side of the context bar", () => {
    const markup = renderToStaticMarkup(
      <ViewerContextBar
        context={context}
        action={{ label: "Duplicate", disabled: false, onClick: () => {} }}
        onScaleChange={() => {}}
      />,
    );

    expect(markup).toContain(">Duplicate<");
    expect(markup).not.toContain("disabled");
  });

  it("reflects a disabled selected-measurement action", () => {
    const markup = renderToStaticMarkup(
      <ViewerContextBar
        context={context}
        action={{ label: "Duplicate", disabled: true, onClick: () => {} }}
        onScaleChange={() => {}}
      />,
    );

    expect(markup).toContain(">Duplicate<");
    expect(markup).toContain("disabled");
  });
});
