import { describe, expect, it } from "vitest";
import {
  recipientExportBasenameFromTitle,
  recipientPdfDownloadFilename,
  recipientTextDownloadFilename,
} from "./recipientExportFilenames";

describe("recipientExportFilenames", () => {
  it("slugifies titles to lowercase hyphenated basenames", () => {
    expect(recipientExportBasenameFromTitle("Web Development Agreement", "x")).toBe("web-development-agreement");
  });

  it("falls back to agreement id slug then agreement", () => {
    expect(recipientExportBasenameFromTitle("  ", "ag-123-XYZ")).toMatch(/^ag-123-xyz$/);
    expect(recipientExportBasenameFromTitle("", "!!")).toBe("agreement");
  });

  it("builds deterministic PDF filenames", () => {
    expect(recipientPdfDownloadFilename("services", "original")).toBe("services-original.pdf");
    expect(recipientPdfDownloadFilename("services", "redline")).toBe("services-redline.pdf");
  });

  it("builds deterministic text filenames", () => {
    expect(recipientTextDownloadFilename("services", "proposed")).toBe("services-proposed.txt");
  });

  it("strips unsafe characters from basename before extension", () => {
    expect(recipientPdfDownloadFilename("bad name/here", "original")).toBe("bad-name-here-original.pdf");
  });
});
