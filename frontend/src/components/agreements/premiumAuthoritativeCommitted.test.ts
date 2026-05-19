/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import {
  cleanPremiumUrlAfterAuthoritativeCommit,
  resolveAuthoritativePremiumCommitted,
  resolveAuthoritativePremiumCommittedFromResult,
} from "./premiumAuthoritativeCommitted";
import { authoritativePremiumPipelineResultForUiApply } from "./premiumPostCheckoutApplyEligible";

function mockResult(overrides: Partial<PremiumCompletionResult> = {}): PremiumCompletionResult {
  const body = "x".repeat(23_000);
  return {
    premiumDraft: {} as PremiumCompletionResult["premiumDraft"],
    premiumParties: [],
    recipientCandidates: [],
    winningPremiumBodyText: body,
    premiumRenderSource: "server_full_draft",
    premiumReview: null,
    premiumFinalizeAudit: null,
    premiumReviewRoute: null,
    staleIntakeOrGeneration: false,
    agreementGenerationId: "gen-1",
    founderDetailsGateMessage: null,
    proIntentGateMessage: null,
    ...overrides,
  };
}

describe("resolveAuthoritativePremiumCommitted", () => {
  it("commits when server_full_draft body exceeds threshold even with needs_details advisory", () => {
    const body = "a".repeat(23_000);
    const state = resolveAuthoritativePremiumCommitted({
      winningPremiumBodyText: body,
      premiumRenderSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
      generationOutcome: "needs_details",
    });
    expect(state.committed).toBe(true);
    expect(state.bodyLen).toBeGreaterThan(20_000);
    expect(state.source).toBe("server_full_draft");
  });

  it("commits from persisted snapshot when visible text is still thin", () => {
    const snapBody = "b".repeat(12_000);
    const state = resolveAuthoritativePremiumCommitted({
      winningPremiumBodyText: "",
      agreementDocumentText: "short",
      snapshot: {
        premiumAccepted: true,
        premiumWinningBodyText: snapBody,
        premiumReadonlyPlainText: snapBody,
        premiumPipelineRenderSource: "server_full_draft",
        premiumRenderResolveSource: "server_full_document_text",
      } as never,
    });
    expect(state.committed).toBe(true);
    expect(state.bodyLen).toBe(12_000);
  });
});

describe("authoritativePremiumPipelineResultForUiApply", () => {
  it("returns true when needs_details advisory is set but authoritative corpus is present", () => {
    expect(
      authoritativePremiumPipelineResultForUiApply(
        mockResult({
          proIntentGateMessage: "Add a few more details, then tap Retry Pro draft.",
        }),
      ),
    ).toBe(true);
  });
});

describe("cleanPremiumUrlAfterAuthoritativeCommit", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    window.history.replaceState({}, "", "/app/create?restore=starterReview&premiumCompletion=1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips restore and premiumCompletion query params", () => {
    expect(cleanPremiumUrlAfterAuthoritativeCommit()).toBe(true);
    expect(window.location.pathname).toBe("/app/create");
    expect(window.location.search).toBe("");
    expect(console.info).toHaveBeenCalledWith("[premium-url-cleaned-after-commit]");
  });
});

describe("checkout return simulation", () => {
  it("authoritative result with needs_details still applies to UI", () => {
    const result = mockResult({
      proIntentGateMessage: "We need a few more details so the Pro draft matches your deal type.",
    });
    expect(resolveAuthoritativePremiumCommittedFromResult(result).committed).toBe(true);
    expect(authoritativePremiumPipelineResultForUiApply(result)).toBe(true);
  });

  it("commits with restore=starterReview URL context when snapshot has server_full_draft corpus", () => {
    window.history.replaceState({}, "", "/app/create?restore=starterReview&premiumCompletion=1");
    const body = "c".repeat(23_387);
    const state = resolveAuthoritativePremiumCommitted({
      winningPremiumBodyText: body,
      premiumRenderSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
      agreementDocumentText: "Review and edit the document below when it appears.",
      generationOutcome: "needs_details",
      snapshot: {
        premiumAccepted: true,
        premiumWinningBodyText: body,
        premiumPipelineRenderSource: "server_full_draft",
        premiumRenderResolveSource: "server_full_document_text",
      } as never,
    });
    expect(state.committed).toBe(true);
    expect(state.bodyLen).toBeGreaterThan(20_000);
  });
});
