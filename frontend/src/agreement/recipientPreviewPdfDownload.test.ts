/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE,
  downloadRecipientPreviewPdf,
} from "./recipientPreviewPdfDownload";

describe("downloadRecipientPreviewPdf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubUrlObjectApis() {
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:unit-test"),
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
      });
    }
  }

  it("humanizes bare Failed to fetch from thrown fetch errors", async () => {
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:unit-test"),
      });
    }
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      downloadRecipientPreviewPdf({
        agreementId: "a1",
        readHeaders: {},
        exportKind: "original",
        html: "<p>x</p>",
      }),
    ).rejects.toThrow(/temporarily unavailable/i);
  });

  it("throws friendly message on 503 without downloading", async () => {
    stubUrlObjectApis();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: "recipient_pdf_export_unavailable",
            message: "PDF export is temporarily unavailable. Please use Copy or Download text for now.",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    const createObjectURL = vi.spyOn(URL, "createObjectURL");

    await expect(
      downloadRecipientPreviewPdf({
        agreementId: "a1",
        readHeaders: {},
        exportKind: "original",
        html: "<p>x</p>",
      }),
    ).rejects.toThrow(/temporarily unavailable/i);

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("throws friendly message when content-type is not PDF", async () => {
    stubUrlObjectApis();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const createObjectURL = vi.spyOn(URL, "createObjectURL");

    await expect(
      downloadRecipientPreviewPdf({
        agreementId: "a1",
        readHeaders: {},
        exportKind: "proposed",
        html: "<p>x</p>",
      }),
    ).rejects.toThrow(RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("downloads blob when response is application/pdf", async () => {
    stubUrlObjectApis();
    const bytes = new Uint8Array(120);
    bytes[0] = 0x25;
    bytes[1] = 0x50;
    bytes[2] = 0x44;
    bytes[3] = 0x46;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadRecipientPreviewPdf({
      agreementId: "a1",
      readHeaders: {},
      exportKind: "redline",
      html: "<p>x</p>",
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});
