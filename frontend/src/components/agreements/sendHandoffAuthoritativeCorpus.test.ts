import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
  longestPlainForAgreementPersist,
  pickAuthoritativePlainForSendHandoff,
} from "./sendHandoffAuthoritativeCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function minimalParsed(overrides: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "T",
    jurisdiction: "DE",
    parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
    purpose: "short",
    payment_terms: "p",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
    ...overrides,
  };
}

describe("sendHandoffAuthoritativeCorpus", () => {
  it("pickAuthoritativePlainForSendHandoff prefers premium_full_document_text over short purpose", () => {
    const body = "y".repeat(15_000);
    const d: AgreementDraft = {
      id: "a1",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: "thin",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_full_document_text: body,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.field).toBe("premium_full_document_text");
    expect(pick?.text.length).toBe(15_000);
  });

  it("longestPlainForAgreementPersist chooses longest premium / editor / purpose", () => {
    const longPremium = "z".repeat(800);
    const parsed = minimalParsed({
      premium_full_document_text: longPremium,
      purpose: "x".repeat(100),
    });
    expect(longestPlainForAgreementPersist(parsed, "e".repeat(50))).toBe(longPremium);
  });

  it("regression: ~15k persisted draft must not resolve to starter-length preview via picker", () => {
    const corpus = "y".repeat(15_000);
    expect(corpus.length).toBeGreaterThan(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN);
    const d: AgreementDraft = {
      id: "x",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "stub preview line only",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.text.length).toBe(corpus.length);
    expect(pick?.field).toBe("premium_full_document_text");
  });
});
