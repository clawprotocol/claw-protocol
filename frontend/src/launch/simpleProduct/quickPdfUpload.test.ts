import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerApiFetch = vi.fn();
vi.mock("../../lib/ownerApiClient", () => ({
  ownerApiFetch: (...args: unknown[]) => ownerApiFetch(...args),
}));

import {
  sanitizedQuickPdfMessage,
  uploadOwnerQuickPdf,
  validateQuickPdfBytes,
  validateQuickPdfFile,
} from "./quickPdfUpload";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x20, 0x78]);

describe("quickPdfUpload", () => {
  beforeEach(() => {
    ownerApiFetch.mockReset();
  });

  it("rejects empty, non-PDF, and oversized files before fetch", async () => {
    expect(validateQuickPdfBytes(new Uint8Array()).ok).toBe(false);
    expect(validateQuickPdfBytes(new Uint8Array([1, 2, 3]))?.code).toBe("document_not_pdf");
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect(validateQuickPdfFile(file).ok).toBe(false);
    const result = await uploadOwnerQuickPdf(new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(sanitizedQuickPdfMessage("document_not_pdf"));
    expect(ownerApiFetch).not.toHaveBeenCalled();
  });

  it("maps 401/403/network to sanitized messages and never surfaces provider text", async () => {
    ownerApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: { code: "document_org_mismatch", message: "TRACEBACK from boto" } }),
    });
    const denied = await uploadOwnerQuickPdf(PDF);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("wrong_organization");
      expect(denied.message).not.toMatch(/TRACEBACK|boto/i);
    }
    ownerApiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const net = await uploadOwnerQuickPdf(PDF);
    expect(net.ok).toBe(false);
    if (!net.ok) expect(net.code).toBe("network");
  });

  it("binds only a complete owner finalize payload", async () => {
    ownerApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        document_id: "doc_phase4c1",
        content_sha256: "a".repeat(64),
        size_bytes: PDF.length,
        content_type: "application/pdf",
      }),
    });
    const ok = await uploadOwnerQuickPdf(PDF);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.binding.documentId).toBe("doc_phase4c1");
      expect(ok.binding.sizeBytes).toBe(PDF.length);
    }
    expect(ownerApiFetch).toHaveBeenCalledWith(
      "/v1/documents",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
