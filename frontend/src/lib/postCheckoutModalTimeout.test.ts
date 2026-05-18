import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "../components/agreements/agreementIntentContract";
import { computeProTruthSurface } from "../components/agreements/premiumProTruth";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import {
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
  shouldFailOpenAfterHardCeiling,
} from "./postCheckoutModalTimeout";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function minimalDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "DE",
    agreement_family: "services_agreement",
    parties: [
      { name: "A LLC", role: "party" },
      { name: "B LLC", role: "party" },
    ],
    purpose: "Development services with milestones.",
    payment_terms: "$5000 monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "Jan 1",
    payment: emptyPayment,
  };
}

describe("postCheckoutModalTimeout policy", () => {
  it("30s elapsed alone does not imply hard failopen (late ~55s success allowed)", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
      }),
    ).toBe(false);
  });

  it("55s with authoritative body accepted never fails open", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: 55_000,
        hasAcceptedServerFullDraftBody: true,
        premiumFullDraftRequestFailed: false,
      }),
    ).toBe(false);
  });

  it("hard ceiling with no body triggers failopen policy when request is not in flight", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: false,
      }),
    ).toBe(true);
  });

  it("120s hard ceiling while authoritative request in flight does not trigger failopen", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("request failure triggers failopen regardless of elapsed time", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: 5_000,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: true,
      }),
    ).toBe(true);
  });

  it("constants match modal UX contract", () => {
    expect(PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS).toBe(30_000);
    expect(PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS).toBe(120_000);
  });
});

describe("post-checkout authoritative visible surface (server_full_document_text)", () => {
  it("regression: premium_success when pipeline matches server full draft after modal race fixes", () => {
    const intake =
      "SaaS website API work for Client A and Developer B in Oklahoma, $5000, May 2026.";
    const contract = resolveAgreementIntentContract(intake);
    const body =
      "WHEREAS parties agree.\n\n1. Services for SaaS website in Oklahoma.\n2. Fees $5000.\n3. IP.\n4. Term.\n5. Law Oklahoma.\n\n" +
      "x".repeat(4500);
    const s = computeProTruthSurface({
      intentContract: contract,
      documentText: body,
      renderSource: "server_full_document_text",
      premiumPipelineSource: "server_full_draft",
      intakeText: intake,
      draft: minimalDraft(),
      qualityRetryActive: false,
      serverGenerationDegraded: false,
      allowPaidSubstantiveStitch: true,
      stale: false,
    });
    expect(s.gate.state).toBe("premium_success");
    expect(s.validation.ok).toBe(true);
  });
});
