/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { Vs01RecipientPlacedField } from "./types";
import {
  buildVs01RecipientSigningUrl,
  loadRecipientManifest,
  storeRecipientManifest,
  VS01_RECIPIENT_SIGN_QUERY,
} from "./StepReceipt";

function makeRecipientField(id: string, cpId: string): Vs01RecipientPlacedField {
  return {
    id,
    counterpartyId: cpId,
    type: "signature",
    page: 0,
    x: 0.2,
    y: 0.3,
    width: 0.21,
    height: 0.046,
  };
}

describe("buildVs01RecipientSigningUrl", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("includes vs01_recipient_sign=1 in the generated URL", () => {
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 0,
      recipientName: "Pat",
      recipientEmail: "pat@example.com",
      counterpartyId: "cp1",
      documentId: "doc_123",
      receiptId: "rcpt_456",
      recipientFieldsForSigner: [makeRecipientField("f1", "cp1")],
    });
    const params = new URL(url).searchParams;
    expect(params.get(VS01_RECIPIENT_SIGN_QUERY)).toBe("1");
    expect(params.get("document_id")).toBe("doc_123");
    expect(params.get("receipt_id")).toBe("rcpt_456");
    expect(params.get("counterparty_id")).toBe("cp1");
    expect(params.get("recipient_name")).toBe("Pat");
    expect(new URL(url, "https://example.test").pathname).toBe("/app/esign/doc_123");
  });

  it("stores manifest in sessionStorage and keeps URL length reasonable", () => {
    const fields = Array.from({ length: 20 }, (_, i) =>
      makeRecipientField(`field_${i}`, "cp1"),
    );
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 0,
      recipientName: "Pat",
      recipientEmail: "pat@example.com",
      counterpartyId: "cp1",
      documentId: "doc_123",
      receiptId: "rcpt_456",
      recipientFieldsForSigner: fields,
    });
    expect(url.length).toBeLessThan(2000);

    const stored = loadRecipientManifest("doc_123", "cp1");
    expect(stored).not.toBeNull();
    expect(stored).toHaveLength(20);
  });

  it("recipient link URL does not contain raw JSON field data in query params", () => {
    const fields = Array.from({ length: 15 }, (_, i) =>
      makeRecipientField(`field_${i}`, "cp1"),
    );
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 0,
      recipientName: "Pat",
      recipientEmail: "pat@example.com",
      counterpartyId: "cp1",
      documentId: "doc_123",
      receiptId: "rcpt_456",
      recipientFieldsForSigner: fields,
    });
    expect(url).not.toContain('"type":"signature"');
    expect(url).not.toContain('"counterpartyId"');
  });

  it("small manifests may be inlined for portability", () => {
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 0,
      recipientName: "Pat",
      recipientEmail: "pat@example.com",
      counterpartyId: "cp1",
      documentId: "doc_123",
      receiptId: "rcpt_456",
      recipientFieldsForSigner: [makeRecipientField("f1", "cp1")],
    });
    const params = new URL(url).searchParams;
    const hasInline = params.has("vs01_rmanifest");
    const hasStored = params.get("vs01_rmanifest_stored") === "1";
    expect(hasInline || hasStored).toBe(true);
  });
});

describe("storeRecipientManifest / loadRecipientManifest", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("round-trips fields through storage", () => {
    const fields = [makeRecipientField("f1", "cp1"), makeRecipientField("f2", "cp1")];
    storeRecipientManifest("doc_a", "cp1", fields);
    const loaded = loadRecipientManifest("doc_a", "cp1");
    expect(loaded).toHaveLength(2);
    expect(loaded![0].id).toBe("f1");
    expect(loaded![1].id).toBe("f2");
  });

  it("returns null for unknown key", () => {
    expect(loadRecipientManifest("unknown", "cp1")).toBeNull();
  });

  it("different counterparties do not collide", () => {
    storeRecipientManifest("doc_a", "cp1", [makeRecipientField("f1", "cp1")]);
    storeRecipientManifest("doc_a", "cp2", [makeRecipientField("f2", "cp2")]);
    expect(loadRecipientManifest("doc_a", "cp1")![0].id).toBe("f1");
    expect(loadRecipientManifest("doc_a", "cp2")![0].id).toBe("f2");
  });

  it("falls back to localStorage when sessionStorage is cleared", () => {
    const fields = [makeRecipientField("f1", "cp1")];
    storeRecipientManifest("doc_ls", "cp1", fields);
    sessionStorage.clear();
    const loaded = loadRecipientManifest("doc_ls", "cp1");
    expect(loaded).not.toBeNull();
    expect(loaded).toHaveLength(1);
    expect(loaded![0].id).toBe("f1");
  });
});
