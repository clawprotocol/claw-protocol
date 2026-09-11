import { describe, expect, it } from "vitest";
import { defaultOwnerRecipientFields, sanitizedEnvelopeMessage, tokenHiddenFromText } from "./quickPdfEnvelope";

describe("quickPdfEnvelope", () => {
  it("sanitizes backend codes and never echoes provider text", () => {
    expect(sanitizedEnvelopeMessage("document_hash_mismatch")).toMatch(/no longer matches/i);
    expect(sanitizedEnvelopeMessage("Traceback")).not.toContain("Traceback");
  });

  it("binds owner and recipient fields on page 0 without overlap", () => {
    const fields = defaultOwnerRecipientFields();
    expect(fields).toHaveLength(2);
    const [a, b] = fields;
    expect(a.page_index).toBe(0);
    expect(b.page_index).toBe(0);
    expect(a.x + a.w).toBeLessThanOrEqual(b.x + 0.0001);
  });

  it("treats clipboard URL tokens as hidden from visible copy", () => {
    const path = "/app/esign/doc_1?vs01_recipient_sign=1&t=hidden-token";
    expect(tokenHiddenFromText("Link prepared. Email unavailable.", path)).toBe(true);
    expect(tokenHiddenFromText("hidden-token", path)).toBe(false);
  });
});
