import { describe, expect, it } from "vitest";
import {
  formatRecipientExportCompactLocalStamp,
  recipientExportBasenameFromTitle,
  recipientPdfDownloadFilename,
  recipientReviewerSlugFromDisplayName,
  recipientTextDownloadFilename,
} from "./recipientExportFilenames";

describe("recipientExportFilenames", () => {
  const stampMay620262124 = new Date(2026, 4, 6, 21, 24, 0);

  it("slugifies titles to lowercase hyphenated basenames", () => {
    expect(recipientExportBasenameFromTitle("Web Development Agreement", "x")).toBe("web-development-agreement");
  });

  it("falls back to agreement id slug then agreement", () => {
    expect(recipientExportBasenameFromTitle("  ", "ag-123-XYZ")).toMatch(/^ag-123-xyz$/);
    expect(recipientExportBasenameFromTitle("", "!!")).toBe("agreement");
  });

  it("formats compact local stamps", () => {
    expect(formatRecipientExportCompactLocalStamp(stampMay620262124)).toBe("2026-05-06T2124");
  });

  it("builds deterministic timestamped PDF filenames", () => {
    expect(recipientPdfDownloadFilename("services", "original", { exportedAt: stampMay620262124 })).toBe(
      "services-original-2026-05-06T2124.pdf",
    );
    expect(
      recipientPdfDownloadFilename("services", "proposed", {
        exportedAt: stampMay620262124,
        reviewerSlug: "sarah-collins",
      }),
    ).toBe("services-proposed-sarah-collins-2026-05-06T2124.pdf");
    expect(
      recipientPdfDownloadFilename("services", "redline", {
        exportedAt: stampMay620262124,
        reviewerSlug: "sarah-collins",
      }),
    ).toBe("services-redline-sarah-collins-2026-05-06T2124.pdf");
  });

  it("builds proposed/redline filenames without reviewer slug when unknown", () => {
    expect(recipientPdfDownloadFilename("services", "proposed", { exportedAt: stampMay620262124 })).toBe(
      "services-proposed-2026-05-06T2124.pdf",
    );
  });

  it("builds deterministic timestamped text filenames", () => {
    expect(recipientTextDownloadFilename("services", "original", { exportedAt: stampMay620262124 })).toBe(
      "services-original-2026-05-06T2124.txt",
    );
  });

  it("strips unsafe characters from basename before extension", () => {
    expect(recipientPdfDownloadFilename("bad name/here", "original", { exportedAt: stampMay620262124 })).toBe(
      "bad-name-here-original-2026-05-06T2124.pdf",
    );
  });

  it("slugifies reviewer display names for filenames", () => {
    expect(recipientReviewerSlugFromDisplayName("Sarah Collins")).toBe("sarah-collins");
    expect(recipientReviewerSlugFromDisplayName("")).toBeUndefined();
  });
});
