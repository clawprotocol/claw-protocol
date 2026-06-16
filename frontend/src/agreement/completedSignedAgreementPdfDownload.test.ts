/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE,
  downloadCompletedSignedAgreementPdf,
  downloadPublicCompletedSignedAgreementPdf,
} from "./completedSignedAgreementPdfDownload";

describe("downloadCompletedSignedAgreementPdf", () => {
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

  it("uses canonical server export without dashboard HTML body", async () => {
    stubUrlObjectApis();
    const pdf = new Uint8Array(128).fill(37);
    pdf[0] = 0x25;
    pdf[1] = 0x50;
    pdf[2] = 0x44;
    pdf[3] = 0x46;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="services-agreement-signed.pdf"',
        },
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadCompletedSignedAgreementPdf({
      agreementId: "ag_1",
      title: "Services Agreement",
    });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("maps Failed to fetch to friendly unavailable copy", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      downloadCompletedSignedAgreementPdf({
        agreementId: "ag_1",
      }),
    ).rejects.toThrow(COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE);
  });
});

describe("downloadPublicCompletedSignedAgreementPdf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls public completed-signed-export-pdf endpoint", async () => {
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:unit-test"),
      });
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array(128).fill(37), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadPublicCompletedSignedAgreementPdf("ag_public");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/agreements/public/ag_public/completed-signed-export-pdf");
  });
});
