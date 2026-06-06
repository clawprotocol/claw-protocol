/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessPaidProRuntimeAuthority } from "./paidProRuntimeAuthorityEstablishment";
import {
  hasRenderablePaidProFirstReviewCorpus,
  shouldBlockPaidProReviewShellWithoutCanonicalCorpus,
} from "./paidProPostCheckoutRenderGate";
import {
  logPaidProApiFailureNoCanonicalFreeze,
  logPaidProFallbackDisplayOnly,
  logPaidProRetryRequested,
  shouldBlockPaidProCanonicalFreezeOnApiFailure,
  shouldBlockSignerMetadataPaidProAuthority,
} from "./paidProApiFailureAuthorityGuard";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { MIN_PAID_PRO_AUTHORITY_LEN } from "./premiumGenerationApiAvailability";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";

const STARTER_CORPUS = [
  "STARTER SERVICES AGREEMENT",
  "",
  "This is a short starter draft body used only for local preview.",
  "",
  ...Array.from({ length: 12 }, (_, i) => `Clause ${i + 1}. Starter placeholder text.`),
].join("\n");

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem Blanchard, developer Sarah Collins, Oklahoma.
  $7,500 total. thirty days. May 1, 2026.
`.trim();

const structured: ParsedDraftShape = {
  title: "Web Development Agreement",
  jurisdiction: "Oklahoma",
  parties: [
    { name: "Client", role: "party" },
    { name: "Developer", role: "party" },
  ],
  purpose: "Software and web development.",
  payment_terms: "See intake.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: null, cadence: null, valid: false },
  agreement_family: "services_agreement",
};

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp
        ? Promise.resolve(h.mockResp)
        : Promise.resolve({
            ok: false as const,
            failure_kind: "cors" as const,
            retryable: false,
            error_code: "cors_blocked" as const,
            document_text: "" as const,
            attemptCount: 1,
          }),
  };
});

describe("Test289 paid Pro API failure must not freeze starter as Pro corpus", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("blocks canonical freeze when premium_full_draft_cors_blocked and corpus is starter-length", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: "premium_full_draft_cors_blocked",
        premiumPostCheckoutPhase: "premium_cors_blocked",
        corpusLen: STARTER_CORPUS.length,
        corpusSource: "canonical_working_draft",
      }),
    ).toBe(true);
    expect(STARTER_CORPUS.length).toBeLessThan(MIN_PAID_PRO_AUTHORITY_LEN);
  });

  it("does not block canonical freeze when real Pro corpus exists after successful generation", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: "server_full_draft",
        corpusLen: 16_000,
        corpusSource: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("blocks paid Pro review readiness and runtime authority from starter fallback after API failure", () => {
    const input = {
      draft: { premium_full_document_text: STARTER_CORPUS } as ParsedDraftShape,
      intakeText: WEB_INTAKE,
      premiumRenderSource: "premium_full_draft_cors_blocked",
      premiumPostCheckoutPhase: "premium_cors_blocked",
      premiumCheckoutCompleted: true,
      winningPremiumBodyText: STARTER_CORPUS,
    };
    expect(hasRenderablePaidProFirstReviewCorpus(input)).toBe(false);
    expect(shouldBlockPaidProReviewShellWithoutCanonicalCorpus(input)).toBe(true);
    const authority = assessPaidProRuntimeAuthority({
      draft: input.draft,
      premiumPipelineSource: "premium_full_draft_cors_blocked",
      premiumPostCheckoutPhase: "premium_cors_blocked",
      intakeText: WEB_INTAKE,
    });
    expect(authority.established).toBe(false);
    expect(authority.canRenderProReviewShell).toBe(false);
  });

  it("preserves signer handoff path but blocks signer metadata from conferring paid Pro authority", () => {
    expect(
      shouldBlockSignerMetadataPaidProAuthority({
        premiumRenderSource: "premium_full_draft_cors_blocked",
        premiumPostCheckoutPhase: "premium_cors_blocked",
      }),
    ).toBe(true);
  });

  it("runPremiumCompletion CORS failure does not establish server_full_draft winning body", async () => {
    h.mockResp = {
      ok: false,
      failure_kind: "cors",
      retryable: false,
      error_code: "cors_blocked",
      document_text: "",
      attemptCount: 1,
    };
    const out = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-cors-289",
      premiumRequestIntakeFingerprint: "fp-cors-289",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe("premium_full_draft_cors_blocked");
    expect((out.winningPremiumBodyText || "").trim().length).toBe(0);
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: out.premiumRenderSource,
        premiumPostCheckoutPhase: "premium_cors_blocked",
        corpusLen: STARTER_CORPUS.length,
      }),
    ).toBe(true);
  });

  it("emits required production diagnostics when API failure blocks canonical freeze", () => {
    vi.stubEnv("MODE", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProApiFailureNoCanonicalFreeze({
      corpusLen: STARTER_CORPUS.length,
      pipelineSource: "premium_full_draft_cors_blocked",
      phase: "premium_cors_blocked",
      corpusSource: "canonical_working_draft",
    });
    logPaidProFallbackDisplayOnly({
      corpusLen: STARTER_CORPUS.length,
      pipelineSource: "premium_full_draft_cors_blocked",
      displaySource: "free_starter",
    });
    logPaidProRetryRequested({
      pipelineSource: "premium_full_draft_cors_blocked",
      phase: "premium_cors_blocked",
      intakeLen: WEB_INTAKE.length,
    });
    expect(warn.mock.calls.some((c) => c[0] === "[paid-pro-api-failure-no-canonical-freeze]")).toBe(true);
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-fallback-display-only]")).toBe(true);
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-retry-requested]")).toBe(true);
    warn.mockRestore();
    info.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("Test289 wiring (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("blocks canonical freeze and logs API failure in commitParsedDraftToReviewFlow", () => {
    expect(intake).toContain("shouldBlockPaidProCanonicalFreezeOnApiFailure");
    expect(intake).toContain("logPaidProApiFailureNoCanonicalFreeze");
    expect(intake).toContain("logPaidProFallbackDisplayOnly");
    expect(intake).toContain("logPaidProAuthorityBlockedAfterApiFailure");
    expect(intake).toContain("logPaidProRetryRequested");
    expect(intake).toContain("shouldBlockSignerMetadataPaidProAuthority");
  });
});
