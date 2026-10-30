// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadExportFile, exportFileName } from "./exportDownload";

describe("exportFileName", () => {
  it.each([
    ["Plan.pdf", "Plan-measurements.csv"],
    ["Plan.PDF", "Plan-measurements.csv"],
    ["plan.v2.final.pdf", "plan.v2.final-measurements.csv"],
    ["site/plan\\A.pdf", "site_plan_A-measurements.csv"],
    ["drawing", "drawing-measurements.csv"],
    [".pdf", "plan-measurements.csv"],
    ["", "plan-measurements.csv"],
  ])("names the export for %j as %j", (pdfName, expected) => {
    expect(exportFileName(pdfName, "measurements", "csv")).toBe(expected);
  });

  it("only strips a trailing .pdf", () => {
    expect(exportFileName("pdf.notes.pdf.txt", "data", "json")).toBe("pdf.notes.pdf.txt-data.json");
  });
});

describe("downloadExportFile", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function stubUrls() {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:export"), revokeObjectURL });
    vi.useFakeTimers();
    return revokeObjectURL;
  }

  it("downloads through a temporary link and revokes the URL afterwards", () => {
    const revokeObjectURL = stubUrls();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
      expect(document.body.contains(this)).toBe(true);
    });
    try {
      downloadExportFile("a,b\r\n", "plan-measurements.csv", "text/csv");
      expect(clicks).toHaveLength(1);
      expect(clicks[0]!.download).toBe("plan-measurements.csv");
      expect(clicks[0]!.getAttribute("href")).toBe("blob:export");
      expect(document.body.querySelector("a")).toBeNull();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the link and still revokes the URL when the click throws", () => {
    const revokeObjectURL = stubUrls();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(() => downloadExportFile("x", "plan-data.json", "application/json")).toThrow(
        "blocked",
      );
      expect(document.body.querySelector("a")).toBeNull();
      vi.advanceTimersByTime(250);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    } finally {
      vi.useRealTimers();
    }
  });
});
