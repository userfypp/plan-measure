import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewerContextBar, type ViewerContextData } from "./ViewerContextBar";

const context: ViewerContextData = {
  workflow: { label: "Ready", tone: "neutral" },
};

describe("ViewerContextBar", () => {
  it("renders nothing for an idle context with no selected action", () => {
    const markup = renderToStaticMarkup(<ViewerContextBar context={context} />);

    expect(markup).toBe("");
  });

  it("renders a compact selected-measurement action at the right side of the context bar", () => {
    const markup = renderToStaticMarkup(
      <ViewerContextBar
        context={context}
        action={{ label: "Duplicate", disabled: false, onClick: () => {} }}
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
      />,
    );

    expect(markup).toContain(">Duplicate<");
    expect(markup).toContain("disabled");
  });

  it("shows active workflow status while a transient viewer workflow is running", () => {
    const markup = renderToStaticMarkup(
      <ViewerContextBar context={{ workflow: { label: "Calibrating scale", tone: "active" } }} />,
    );

    expect(markup).toContain("Calibrating scale");
  });
});
