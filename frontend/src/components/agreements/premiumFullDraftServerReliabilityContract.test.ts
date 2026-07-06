/** @vitest-environment jsdom */
/**
 * Frontend half of the premium-full-draft server reliability contract.
 *
 * Mirrors the wire the backend now emits (see
 * backend/tests/test_premium_full_draft_reliability_contract.py) and proves the client
 * interprets it correctly WITHOUT weakening validation:
 *   - substantive success stays authoritative
 *   - explicit insufficient/degraded failure is classified retryable (never server_full_draft)
 *   - json_parse degraded WITH a substantive body is preserved/promoted
 *   - json_parse degraded WITHOUT a substantive body is retryable, never promoted from starter text
 */
import { describe, expect, it } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { classifyPremiumFullDraftGenerationRetryable } from "./premiumGenerationRetryable";
import { normalizePremiumFullDraftResponsePayload } from "./premiumFullDraftResponseNormalization";
import { premiumApiResultHasAuthoritativeServerCorpus } from "./premiumApiHandoff";
import { PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";

function substantiveFourPartyCorpus(): string {
  const sections = [
    "MASTER SERVICES, RESELLER, AND GUARANTY AGREEMENT",
    "This Agreement is entered into by Redwood Peak Ventures LLC (Client), Atlas Harbor Technologies Inc. (Vendor), Silverline Integration Partners LLC (Integrator), and Northwind Capital Advisors LLC (Guarantor).",
    "1. SCOPE AND SERVICES. Vendor and Integrator shall deliver the white-label platform and support.",
    "2. FEES AND PAYMENT. Client shall pay total fees of $124,750 across milestone payments.",
    "3. CONFIDENTIALITY. Each party shall protect the others' non-public information.",
    "4. INTELLECTUAL PROPERTY AND WORK PRODUCT. Ownership of deliverables vests in Client upon payment.",
    "5. LIMITATION OF LIABILITY AND INDEMNIFICATION. Liability is limited; parties indemnify third-party claims.",
    "6. INSURANCE. Vendor and Integrator shall maintain commercial general and professional liability insurance.",
    "7. TERM AND TERMINATION. Either party may terminate for cause on written notice and cure.",
    "8. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
    "9. NOTICES. Notices shall be sent to each party's designated email and mailing address.",
    "10. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures are valid and binding.",
    "IN WITNESS WHEREOF, the parties have executed this Agreement by their authorized signatories.",
  ];
  let body = sections.join("\n\n");
  body += "\n\n" + "Operative detail on performance, acceptance, and delivery standards. ".repeat(200);
  return body;
}

const CORPUS = substantiveFourPartyCorpus();

function baseWire(over: Partial<PremiumFullDraftResult>): PremiumFullDraftResult {
  return {
    title: "Master Services, Reseller, and Guaranty Agreement",
    agreement_family: "SaaS / software services",
    document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    ...over,
  } as PremiumFullDraftResult;
}

describe("premium-full-draft server reliability contract (client wire interpretation)", () => {
  it("guard: fixture corpus is comfortably substantive", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN * 2);
  });

  it("contract 1: substantive success stays authoritative and is not retryable", () => {
    const wire = baseWire({
      document_text: CORPUS,
      server_full_document_text: CORPUS,
      authoritative_draft: CORPUS,
      generation_outcome: "ok",
      generation_ok: true,
      retryable: false,
      server_generation_failure_code: "",
    });
    const classification = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(classification.retryable).toBe(false);
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(CORPUS.length - 50);
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
  });

  it("contract 2: explicit insufficient failure is retryable, never a server_full_draft", () => {
    const wire = baseWire({
      document_text: "",
      server_full_document_text: "",
      generation_outcome: "degraded",
      server_generation_failure_code: "premium_generation_insufficient",
      server_generation_failure_message: "The full Pro draft didn't come back complete this time.",
      generation_ok: false,
      retryable: true,
    });
    const classification = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(classification.retryable).toBe(true);
    expect(classification.errorCode).toBe("premium_generation_insufficient");
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.authoritativeText).toBe("");
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(false);
  });

  it("contract 3: json_parse degraded WITH substantive body is preserved/promoted", () => {
    const wire = baseWire({
      document_text: CORPUS,
      server_full_document_text: CORPUS,
      authoritative_draft: CORPUS,
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      generation_ok: true,
      retryable: false,
    });
    const classification = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(classification.retryable).toBe(false);
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(CORPUS.length - 50);
    expect(
      String(normalized.wire.server_full_document_text ?? "").length,
    ).toBeGreaterThanOrEqual(PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN);
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
  });

  it("contract 4: json_parse degraded WITHOUT substantive body is retryable, never promoted", () => {
    const wire = baseWire({
      document_text: "",
      server_full_document_text: "",
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      generation_ok: false,
      retryable: true,
    });
    const classification = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(classification.retryable).toBe(true);
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.authoritativeText).toBe("");
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(false);
  });
});
