/** @vitest-environment jsdom */
/**
 * TEST561 — the dashboard/returning-paid create flow and the first-time-user Pro create flow must
 * execute the SAME premium generation pipeline through authoritative freeze.
 *
 * The only client value that differs between the two flows and reaches the pipeline is
 * `premiumGenerationCallReason` — `entitled_rewrite` (dashboard / returning-paid) vs
 * `checkout_completion` (first-time-user post-checkout). This regression proves that difference is
 * NOT a generation-path divergence:
 *
 *   - Given the SAME substantive server_full response, both reasons run through
 *     `runPremiumCompletion` → accepted server_full → `establishPaidProSourceOfTruth`
 *     (authoritative freeze) and produce a byte-identical frozen corpus.
 *   - Given the SAME thin/degraded response, both reasons reject identically to the
 *     "Retry Pro draft" terminal (no promotion of a below-substantive corpus).
 *
 * i.e. the pipeline is reason-agnostic through freeze — the dashboard flow does not enter a
 * different premium generation / validation path than the canonical first-time-user flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import type { PremiumGenerationCallReason } from "./paidProPremiumGenerationCallAudit";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import * as localRecoveryModule from "./premiumNetworkRecoveryLocalDraft";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  buildTest456LiveRailwayDefectiveBody,
  TEST456_LIVE_INTAKE,
  TEST456_TRANSACTION_TITLE,
  test456BrightPeakFirstDraft,
} from "./paidProTest456Fixtures";
import {
  buildTest531ThinLocalRecoveryCandidates,
  TEST531_INTAKE,
  test531Draft,
} from "./paidProTest531Fixtures";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
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
      return r ? Promise.resolve(r) : Promise.reject(new Error("test561_no_mock"));
    },
  };
});

function okServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST456_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: [],
    generation_outcome: "ok",
  } as unknown as PremiumFullDraftResult;
}

/** Short degraded/json_parse wire with no substantive server_full — mirrors the live thin body. */
function shortDegradedNoServerFullWire(body: string): PremiumFullDraftResult {
  return {
    title: "CONSULTING SERVICES AGREEMENT",
    agreement_family: "services_agreement",
    document_text: body,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    key_terms_found: [],
    missing_material_info: [],
  } as unknown as PremiumFullDraftResult;
}

const storage = new Map<string, string>();

function freshPipelineState() {
  resetPaidProPipelineTestIsolation();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumGenerationCallAudit();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearCurrentSessionProEntitlementMarkers();
  storage.clear();
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete();
  getOrInitSessionAgreementGenerationId();
  (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
    true;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
  freshPipelineState();
});

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearFrozenPremiumSessionBodiesForTests();
  clearCurrentSessionProEntitlementMarkers();
  clearPremiumGenerationCallAudit();
  storage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function runSubstantiveGenerationForReason(
  reason: PremiumGenerationCallReason,
  generationId: string,
  serverBody: string,
): Promise<string> {
  freshPipelineState();
  const draft = test456BrightPeakFirstDraft();
  premiumApiMock.mockResponses = [okServerFullResult(serverBody)];
  premiumApiMock.callIndex = 0;

  const out = await runPremiumCompletion({
    intakeText: TEST456_LIVE_INTAKE,
    originalUserIntakeRawForMerge: TEST456_LIVE_INTAKE,
    structuredDraft: draft,
    simpleProductFlow: true,
    partyRoleLabels: defaultIntakePartyRoleLabels(),
    agreementGenerationId: generationId,
    premiumRequestIntakeFingerprint: "fp-test561",
    isPremiumRequestStillValid: () => true,
    parseDraft: async () => draft,
    premiumGenerationCallReason: reason,
  });

  // Both flows accept the substantive server_full corpus (no reject, no local structural recovery).
  expect(out.proIntentGateMessage, `reason=${reason}`).toBeNull();
  expect(out.premiumRenderSource, `reason=${reason}`).toMatch(
    /server_full_draft|server_full_document_text/,
  );
  expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
  expect(out.premiumRenderSource).not.toBe("structural_recovery");
  expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(20_000);

  const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
    draft,
    intakeText: TEST456_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;

  // Authoritative freeze — the shared canonical SoT establishment for both flows.
  establishPaidProSourceOfTruth({
    text: display,
    source: out.premiumRenderSource,
    draft,
    intakeText: TEST456_LIVE_INTAKE,
    reviewSessionId: generationId,
    generationOutcome: "ok",
  });
  expect(hasPaidProSourceOfTruth(), `reason=${reason}`).toBe(true);
  const sot = getPaidProSourceOfTruthText();
  expect(sot).toContain(TEST456_TRANSACTION_TITLE);
  expect(sot.length).toBeGreaterThan(20_000);
  return sot;
}

async function runThinGenerationForReason(
  reason: PremiumGenerationCallReason,
  generationId: string,
): Promise<{ renderSource: string; gateMessage: string; body: string }> {
  freshPipelineState();
  const thin = buildTest531ThinLocalRecoveryCandidates()[2]!;
  expect(thin.length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  premiumApiMock.mockResponses = [shortDegradedNoServerFullWire(thin)];
  premiumApiMock.callIndex = 0;
  // No local/deterministic fallback promotion — recovery cannot manufacture a full corpus.
  vi.spyOn(localRecoveryModule, "buildPremiumPostCheckoutLocalRecoveryProDraft").mockImplementation(
    () => ({ ok: false as const, body: "", reasons: ["test561_no_local_recovery"] }),
  );

  const out = await runPremiumCompletion({
    intakeText: TEST531_INTAKE,
    originalUserIntakeRawForMerge: TEST531_INTAKE,
    structuredDraft: test531Draft(),
    simpleProductFlow: true,
    partyRoleLabels: defaultIntakePartyRoleLabels(),
    agreementGenerationId: generationId,
    premiumRequestIntakeFingerprint: "fp-test561-thin",
    isPremiumRequestStillValid: () => true,
    parseDraft: async () => test531Draft(),
    premiumGenerationCallReason: reason,
  });
  return {
    renderSource: out.premiumRenderSource,
    gateMessage: out.proIntentGateMessage ?? "",
    body: out.winningPremiumBodyText.trim(),
  };
}

describe("TEST561 — dashboard and first-time-user paid create run the same generation pipeline through freeze", () => {
  it("reason-agnostic freeze: entitled_rewrite (dashboard) and checkout_completion (first-time-user) reach the SAME authoritative SoT", async () => {
    const serverBody = buildTest456LiveRailwayDefectiveBody();

    const dashboardSot = await runSubstantiveGenerationForReason(
      "entitled_rewrite",
      "gen-test561-dashboard",
      serverBody,
    );
    const firstTimeSot = await runSubstantiveGenerationForReason(
      "checkout_completion",
      "gen-test561-first-time",
      serverBody,
    );

    // Same premium generation pipeline through authoritative freeze → byte-identical frozen corpus.
    expect(dashboardSot).toBe(firstTimeSot);
  }, 30_000);

  it("reason-agnostic rejection: both reasons reject a thin/degraded body to the Retry terminal (no promotion)", async () => {
    const dashboard = await runThinGenerationForReason("entitled_rewrite", "gen-test561-thin-dashboard");
    const firstTime = await runThinGenerationForReason("checkout_completion", "gen-test561-thin-first");

    for (const outcome of [dashboard, firstTime]) {
      expect(outcome.renderSource).toBe("rejected_paid_corpus");
      expect(outcome.body).toBe("");
      expect(outcome.gateMessage).toMatch(/Retry Pro draft/i);
    }
    // Both flows reach the identical rejected terminal.
    expect(dashboard.renderSource).toBe(firstTime.renderSource);
  }, 30_000);
});
