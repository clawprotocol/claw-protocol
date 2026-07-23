/** @vitest-environment jsdom */
import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import {
  extractPremiumApiServerCorpusText,
  hasPaidProChromeAuthority,
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import { assertPremiumPurposeHandoffBlocked } from "./paidProRuntimeAuthorityEstablishment";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  clearDisplayReviewSnapshotAuthority,
  storeDisplayReviewSnapshotAuthority,
} from "../../agreement/canonicalReviewSnapshotApi";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve(
        h.mockResp ?? {
          ok: false as const,
          failure_kind: "exception" as const,
          retryable: false,
          error_code: "premium_full_draft_failed" as const,
          document_text: "" as const,
          attemptCount: 1,
        },
      ),
  };
});

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function servicesDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow implementation.",
    payment_terms: "$95,000 total.",
    duration: "30 days notice",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
  };
}

describe("premiumApiHandoff", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearDisplayReviewSnapshotAuthority();
    vi.restoreAllMocks();
  });

  it("extractPremiumApiServerCorpusText prefers server_full_document_text then document_text", () => {
    const long = SHARED_ACCEPTED_PAID_BODY;
    expect(
      extractPremiumApiServerCorpusText({
        server_full_document_text: long,
        document_text: "short",
      }),
    ).toBe(long);
    expect(
      extractPremiumApiServerCorpusText({
        server_full_document_text: "",
        document_text: long,
      }),
    ).toBe(long);
  });

  it("premiumApiResultHasAuthoritativeServerCorpus is false when only short purpose-like body", () => {
    expect(
      premiumApiResultHasAuthoritativeServerCorpus({
        server_full_document_text: "short purpose only",
        document_text: "",
      }),
    ).toBe(false);
  });

  it("logPremiumApiResultFromWire is silent in test mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumApiResultFromWire({
      ok: true,
      status: 200,
      wire: { server_full_document_text: SHARED_ACCEPTED_PAID_BODY },
    });
    expect(info).not.toHaveBeenCalled();
  });

  it("hasPaidProChromeAuthority is false without display snapshot authority", () => {
    expect(hasPaidProChromeAuthority({ draft: servicesDraft(), agreementId: "ag_chrome" })).toBe(false);
  });

  it("hasPaidProChromeAuthority stays false after local SoT alone", () => {
    establishPaidProSourceOfTruth({ text: SHARED_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    expect(hasPaidProChromeAuthority({ draft: servicesDraft(), agreementId: "ag_chrome" })).toBe(false);
  });

  it("hasPaidProChromeAuthority is true only with verified GET corpus", async () => {
    establishPaidProSourceOfTruth({ text: SHARED_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_chrome",
      snapshotId: "crs_chrome",
      corpusSha256: "a".repeat(64),
      corpusLength: SHARED_ACCEPTED_PAID_BODY.length,
      status: "pending",
    });
    // Display metadata alone must not unlock chrome.
    expect(hasPaidProChromeAuthority({ draft: servicesDraft(), agreementId: "ag_chrome" })).toBe(false);

    const { sha256CorpusDigest, storeVerifiedCommercialDisplayCorpus } = await import(
      "../../agreement/canonicalReviewSnapshotApi"
    );
    const sha = await sha256CorpusDigest(SHARED_ACCEPTED_PAID_BODY);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_chrome",
      snapshotId: "crs_chrome",
      corpusSha256: sha,
      corpusLength: SHARED_ACCEPTED_PAID_BODY.length,
      status: "pending",
      corpusPlain: SHARED_ACCEPTED_PAID_BODY,
    });
    expect(hasPaidProChromeAuthority({ draft: servicesDraft(), agreementId: "ag_chrome" })).toBe(true);
    expect(hasPaidProChromeAuthority({ draft: servicesDraft(), agreementId: "ag_other" })).toBe(false);
  });

  it("resolvePremiumRenderSource blocks live_generated_preview after checkout lock", () => {
    const draft = servicesDraft();
    const live = buildAgreementPreviewTextCore(draft, { premiumDeliverablePreview: true });
    const resolved = resolvePremiumRenderSource({
      draft,
      premiumWinningCorpusFallback: "",
      paidAuthoritativeProBody: null,
      postCheckoutProLocked: true,
      buildLivePreview: () => live,
    });
    expect(resolved.premium_render_source).not.toBe("live_generated_preview");
    expect(resolved.premium_render_source).toBe("none");
    expect(resolved.text).toBe("");
  });

  it("assertPremiumPurposeHandoffBlocked throws for purpose on premium routes without authority", () => {
    const draft = {
      ...servicesDraft(),
      premium_render_source: "live_generated_preview",
      purpose: "short purpose handoff",
    };
    expect(() =>
      assertPremiumPurposeHandoffBlocked({
        draft,
        field: "purpose",
        text: "short purpose handoff",
        surface: "test",
      }),
    ).toThrow(/premium-purpose-handoff-blocked/);
  });

  it("pickPremiumPaidReadonlyPlainText does not use live preview after checkout without SoT", () => {
    const draft = servicesDraft();
    const live = buildAgreementPreviewTextCore(draft, { premiumDeliverablePreview: true });
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumPipelineOutputBodyText: live,
      draft,
      agreementDocumentText: live,
      premiumCheckoutCompleted: true,
      intakeText: "AI services between Red Mesa and Harbor Peak.",
      lastPremiumPipelineRenderSource: "rejected_paid_corpus",
    });
    expect(pick.sourceUsed).not.toBe("live_generated_preview");
    expect((pick.plainText || "").trim().length).toBeLessThan(500);
  });

  it("runPremiumCompletion without server body returns rejected_paid_corpus in production mode", async () => {
    vi.stubEnv("MODE", "production");
    h.mockResp = {
      ok: false,
      failure_kind: "exception",
      retryable: false,
      error_code: "premium_full_draft_failed",
      document_text: "",
      attemptCount: 1,
    };
    const intake =
      "AI automation services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. $95,000 total. Texas law.";
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: servicesDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-handoff-test",
      premiumRequestIntakeFingerprint: "fp-handoff",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => servicesDraft(),
    });
    expect(out.premiumRenderSource).toBe("rejected_paid_corpus");
    expect((out.winningPremiumBodyText || "").trim()).toBe("");
  });
});
