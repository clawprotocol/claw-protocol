/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import * as localRecoveryModule from "./premiumNetworkRecoveryLocalDraft";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { shouldSuppressPaidProCorpusRenderForRejectedPipeline } from "./paidProApiFailureAuthorityGuard";
import {
  clearPaidDashboardCreateContextForTests,
  DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  isDashboardPaidCreateRouteActive,
  markPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";
import { markAuthenticatedWorkspaceSession } from "../../launch/completedAgreementViewContext";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { planDashboardPaidCreateSubmitBootstrap } from "./dashboardPaidCreateRoute";
import { planReturningPaidCreateSubmitBootstrap } from "./returningPaidCreateBootstrap";
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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test533_no_second_post")),
  };
});

/** Short degraded/json_parse wire (~2382) with no substantive server_full — mirrors the live 2353 body. */
function buildShortDegradedNoServerFullWire(body: string): PremiumFullDraftResult {
  return {
    title: "CONSULTING SERVICES AGREEMENT",
    agreement_family: "services_agreement",
    document_text: body,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    agreement_validation: {
      passed: false,
      failures: [{ code: "json_parse", message: "parse failed", severity: "low" }],
      warnings: [],
      minimum_contract_elements: {
        identifiable_parties: true,
        agreement_purpose_or_scope: true,
        exchange_of_value_or_consideration: true,
        obligations_or_performance: false,
        execution_or_acceptance_mechanism: false,
      },
      summary: { failure_count: 1, warning_count: 0, checked_at: "2026-01-01T00:00:00Z" },
    },
    key_terms_found: [],
    missing_material_info: [],
  } as unknown as PremiumFullDraftResult;
}

beforeEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  if (typeof localStorage !== "undefined") localStorage.clear();
  resetPaidProPipelineTestIsolation();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidDashboardCreateContextForTests();
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  getOrInitSessionAgreementGenerationId();
  vi.restoreAllMocks();
});

afterEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  if (typeof localStorage !== "undefined") localStorage.clear();
  resetPaidProPipelineTestIsolation();
  clearFrozenPremiumSessionBodiesForTests();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidDashboardCreateContextForTests();
  vi.restoreAllMocks();
});

describe("TEST533 — dashboard/admin paid-create generation route parity", () => {
  // Item 1: dashboard/admin paid-create entry invokes the same premium generation authority as first-time paid create.
  it("returning-paid bootstrap delegates to the dashboard bootstrap when the dashboard route is active", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
    markAuthenticatedWorkspaceSession();
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    expect(isDashboardPaidCreateRouteActive()).toBe(true);

    const input = { workspaceProEntitled: true } as const;
    const dashboardPlan = planDashboardPaidCreateSubmitBootstrap(input);
    const returningPlan = planReturningPaidCreateSubmitBootstrap(input);

    expect(dashboardPlan).not.toBeNull();
    expect(returningPlan).toEqual(dashboardPlan);
    // Same post-payment premium generation entry: processing + generating_draft, entitled_rewrite.
    expect(returningPlan?.premiumPostCheckoutPhase).toBe("processing");
    expect(returningPlan?.createFlowPhase).toBe("generating_draft");
    expect(returningPlan?.markProEntitlementSource).toBe("entitled_rewrite");
  });

  it("dashboard and non-dashboard paid-create bootstrap resolve the identical generation entry shape", () => {
    const input = { workspaceProEntitled: true } as const;

    // Non-dashboard returning paid create (no dashboard route marker).
    const returningOnly = planReturningPaidCreateSubmitBootstrap(input);

    // Dashboard paid create route active.
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
    markAuthenticatedWorkspaceSession();
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    const dashboard = planDashboardPaidCreateSubmitBootstrap(input);

    expect(returningOnly).toEqual(dashboard);
  });

  // Item 2: ERR_NETWORK / short server body cannot be promoted as premium accepted corpus.
  it("guard rejects a 2382-char server_full_draft as mislabeled below substantive min", () => {
    const short = buildTest531ThinLocalRecoveryCandidates()[2]!;
    expect(short.length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: short,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "degraded",
      agreementGenerationId: "gen-test533",
      reason: "test533_short_server_full",
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.reason).toBe("mislabeled_server_full_draft_below_substantive_min");
  });

  it("guard rejects a 2018-char server_full_draft (matches live acceptedLen=2018)", () => {
    const short = "A. ".repeat(673).slice(0, 2018);
    expect(short.length).toBe(2018);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: short,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "degraded",
      agreementGenerationId: "gen-test533",
      reason: "test533_2018_server_full",
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.reason).toBe("mislabeled_server_full_draft_below_substantive_min");
  });

  it("ERR_NETWORK-style short degraded wire terminalizes rejected_paid_corpus with retry, not a promoted 2353 corpus", async () => {
    const short = buildTest531ThinLocalRecoveryCandidates()[2]!;
    premiumApiMock.mockResponses = [buildShortDegradedNoServerFullWire(short)];
    // No local/deterministic fallback promotion — recovery cannot manufacture a full corpus.
    vi.spyOn(localRecoveryModule, "buildPremiumPostCheckoutLocalRecoveryProDraft").mockImplementation(
      () => ({ ok: false as const, body: "", reasons: ["test533_no_local_recovery"] }),
    );
    vi.spyOn(console, "info").mockImplementation(() => {});

    const out = await runPremiumCompletion({
      intakeText: TEST531_INTAKE,
      originalUserIntakeRawForMerge: TEST531_INTAKE,
      structuredDraft: test531Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test533-short-degraded",
      premiumRequestIntakeFingerprint: "fp-test533",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test531Draft(),
    });

    // Item 2/3: not promoted; retry/empty terminal only.
    expect(out.premiumRenderSource).toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim()).toBe("");
    expect((out.proIntentGateMessage ?? "").length).toBeGreaterThan(0);
    expect(out.proIntentGateMessage ?? "").toMatch(/Retry Pro draft/i);
  }, 15_000);

  // Item 3: rejected short corpus renders retry/empty terminal only (render guard).
  it("rejected_paid_corpus suppresses any local render (retry/empty terminal only)", () => {
    expect(
      shouldSuppressPaidProCorpusRenderForRejectedPipeline({
        pipelineSource: "rejected_paid_corpus",
      }),
    ).toBe(true);
  });

  // Item 4: valid premium full corpus is not blocked by the mislabel/reject guards.
  it("a substantive >=10k server_full_draft is not flagged mislabeled and is not render-suppressed", () => {
    const full = "This Agreement section provides material obligations. ".repeat(220);
    expect(full.length).toBeGreaterThanOrEqual(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: full,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      agreementGenerationId: "gen-test533",
      reason: "test533_full_server_full",
    });
    expect(guarded.rejected).toBe(false);
    expect(
      shouldSuppressPaidProCorpusRenderForRejectedPipeline({ pipelineSource: "server_full_draft" }),
    ).toBe(false);
  });
});
