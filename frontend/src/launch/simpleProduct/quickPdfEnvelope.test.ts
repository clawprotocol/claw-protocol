import { describe, expect, it } from "vitest";
import { ownerAndRecipientPlaced, sanitizedEnvelopeMessage, tokenHiddenFromText } from "./quickPdfEnvelope";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "./quickPdfEnvelope";

describe("quickPdfEnvelope", () => {
  it("sanitizes backend codes and never echoes provider text", () => {
    expect(sanitizedEnvelopeMessage("document_hash_mismatch")).toMatch(/no longer matches/i);
    expect(sanitizedEnvelopeMessage("owner_ceremony_incomplete")).toMatch(/agree/i);
    expect(sanitizedEnvelopeMessage("receipt_pending")).toMatch(/not available yet/i);
    expect(sanitizedEnvelopeMessage("receipt_unavailable")).toMatch(/missing or no longer matches/i);
    expect(sanitizedEnvelopeMessage("Traceback")).not.toContain("Traceback");
  });

  it("requires owner-chosen owner and recipient fields instead of a static default page-1 layout", () => {
    expect(ownerAndRecipientPlaced([])).toBe(false);
    expect(
      ownerAndRecipientPlaced([
        { field_id: "a", signer_role_id: OWNER_ROLE_ID, field_type: "signature", page_index: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1, required: true },
      ]),
    ).toBe(false);
    expect(
      ownerAndRecipientPlaced([
        { field_id: "a", signer_role_id: OWNER_ROLE_ID, field_type: "signature", page_index: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1, required: true },
        { field_id: "b", signer_role_id: RECIPIENT_ROLE_ID, field_type: "signature", page_index: 1, x: 0.5, y: 0.2, w: 0.3, h: 0.1, required: true },
      ]),
    ).toBe(true);
  });

  it("treats clipboard URL tokens as hidden from visible copy", () => {
    const path = "/app/esign/doc_1?vs01_recipient_sign=1&t=hidden-token";
    expect(tokenHiddenFromText("Link prepared. Email unavailable.", path)).toBe(true);
    expect(tokenHiddenFromText("hidden-token", path)).toBe(false);
  });
});
