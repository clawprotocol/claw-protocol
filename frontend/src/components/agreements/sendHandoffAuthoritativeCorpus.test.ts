import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
  longestPlainForAgreementPersist,
  pickAuthoritativePlainForSendHandoff,
  shouldMinimalProSendRecipientChrome,
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

  it("shouldMinimalProSendRecipientChrome: server_full_document_text forces minimal chrome even when pick is thin", () => {
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: "server_full_document_text",
        authoritativePick: null,
        readonlyPlainText: "",
      }),
    ).toBe(true);
  });

  it("shouldMinimalProSendRecipientChrome: premium corpus >=500 and not purpose enables minimal chrome", () => {
    const corpus = "z".repeat(600);
    const d: AgreementDraft = {
      id: "a",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: "short",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_server_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: "live_generated_preview",
        authoritativePick: pick,
        readonlyPlainText: corpus,
      }),
    ).toBe(true);
  });

  it("shouldMinimalProSendRecipientChrome: purpose-only long body does not enable minimal chrome", () => {
    const purposeLong = `p${"y".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN)}`;
    const d: AgreementDraft = {
      id: "b",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: purposeLong,
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.field).toBe("purpose");
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: null,
        authoritativePick: pick,
        readonlyPlainText: purposeLong,
      }),
    ).toBe(false);
  });

  it("regression: RECIPIENTS-stage minimal chrome flags for ~15k premium_server_full_document_text", () => {
    const corpus = "y".repeat(15_651);
    const d: AgreementDraft = {
      id: "c",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "short structured stub",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_server_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.text.length).toBeGreaterThanOrEqual(500);
    expect(pick?.field).toBe("premium_server_full_document_text");
    const minimal = shouldMinimalProSendRecipientChrome({
      premiumRenderSourceResolved: "server_full_document_text",
      authoritativePick: pick,
      readonlyPlainText: corpus,
    });
    expect(minimal).toBe(true);
  });
});
