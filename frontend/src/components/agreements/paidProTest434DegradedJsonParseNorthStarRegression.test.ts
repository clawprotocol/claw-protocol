/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  buildTest434DegradedJsonParseDocumentText,
  test434FourPartyDraft,
  test434Intake,
} from "./paidProTest434DegradedJsonParseFixtures";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
  forceValidateFail: false,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r ? Promise.resolve(r) : Promise.reject(new Error("no_mock"));
    },
  };
});

vi.mock("./paidProCorpusAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProCorpusAcceptance")>();
  return {
    ...mod,
    validatePaidProOutput: (...args: Parameters<typeof mod.validatePaidProOutput>) => {
      if (premiumApiMock.forceValidateFail) {
        return { ok: false, reasons: ["premium_truth_gate_soft_fail_test"] };
      }
      return mod.validatePaidProOutput(...args);
    },
  };
});

describe("TEST434 — degraded json_parse without server_full SoT crash", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    premiumApiMock.forceValidateFail = false;
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("pipeline rejects degraded json_parse with no server_full — no authoritative SoT", async () => {
    const degraded = buildTest434DegradedJsonParseDocumentText();
    expect(degraded.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    premiumApiMock.forceValidateFail = true;
    premiumApiMock.mockResponses = [
      {
        title: "Consulting and Implementation Agreement",
        agreement_family: "consulting_agreement",
        document_text: degraded,
        server_full_document_text: "",
        key_terms_found: [],
        missing_material_info: [],
        generation_outcome: "degraded",
        server_generation_failure_code: "json_parse",
        server_generation_failure_message: "Structured intelligence JSON failed to parse.",
      },
    ];
    const out = await runPremiumCompletion({
      intakeText: test434Intake(),
      originalUserIntakeRawForMerge: test434Intake(),
      structuredDraft: test434FourPartyDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test434-degraded-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test434",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test434FourPartyDraft(),
    });
    expect(
      out.premiumRenderSource,
      `unexpected render source with len=${out.winningPremiumBodyText.length}`,
    ).not.toMatch(/server_full_draft/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    if (out.winningPremiumBodyText.trim().length > 0) {
      expect(
        out.premiumRenderSource === "rejected_paid_corpus" ||
          out.premiumRenderSource === "fallback_preview" ||
          out.premiumRenderSource === "premium_degraded_server_local_recovery",
      ).toBe(true);
    }
  });

  it("render resolver does not auto-establish SoT from tiny fallback masquerading as server_full", () => {
    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: test434Intake(),
      draft: test434FourPartyDraft(),
    });
    expect(structural.ok).toBe(true);
    if (!structural.ok) return;
    expect(structural.body.length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    expect(() =>
      pickPremiumPaidReadonlyPlainText({
        premiumWinningBodyText: structural.body,
        premiumReadonlySnapshotText: "",
        premiumPipelineOutputBodyText: "",
        hydratedPremiumSnapshotText: "",
        agreementDocumentText: "",
        draft: test434FourPartyDraft(),
        intakeText: test434Intake(),
        premiumCheckoutCompleted: true,
        paidAuthoritativeProBody: structural.body,
        lastPremiumPipelineRenderSource: "rejected_paid_corpus",
      }),
    ).not.toThrow();
    expect(hasPaidProSourceOfTruth()).toBe(false);

    resolvePremiumRenderSource({
      draft: test434FourPartyDraft(),
      intakeText: test434Intake(),
      paidAuthoritativeProBody: structural.body,
      premiumWinningCorpusFallback: structural.body,
      postCheckoutProLocked: true,
      buildLivePreview: () => structural.body,
    });
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(getPaidProSourceOfTruth()?.source).not.toBe("server_full_draft");
  });

  it("establishPaidProSourceOfTruth blocks mislabeled tiny server_full_draft without clause-family throw", () => {
    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: test434Intake(),
      draft: test434FourPartyDraft(),
    });
    expect(structural.ok).toBe(true);
    if (!structural.ok) return;

    expect(() =>
      establishPaidProSourceOfTruth({
        text: structural.body,
        source: "server_full_draft",
        draft: test434FourPartyDraft(),
        intakeText: test434Intake(),
        generationOutcome: "degraded",
      }),
    ).toThrow(/\[paid-pro-sot-establishment-blocked\]/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });
});
