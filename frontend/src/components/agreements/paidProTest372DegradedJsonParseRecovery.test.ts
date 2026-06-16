import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  clearPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  previewPostCheckoutRecoverySotCommit,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import { meetsPaidProDegradedRecoveryDisplayRequirements } from "./paidProPostCheckoutRenderGate";
import { shouldBlockPaidProCanonicalFreezeOnApiFailure } from "./paidProApiFailureAuthorityGuard";

const TEST372_INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) " +
  "and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500. Delaware law governs.";

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("no_mock")),
  };
});

vi.mock("./paidProCorpusAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProCorpusAcceptance")>();
  return {
    ...mod,
    validatePaidProOutput: (...args: Parameters<typeof mod.validatePaidProOutput>) => {
      if (premiumApiMock.forceValidateFail) {
        return { ok: false, reasons: ["premium_truth_gate_soft_fail_test372"] };
      }
      return mod.validatePaidProOutput(...args);
    },
  };
});

function test372StructuredDraft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting and Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "services_agreement",
    parties: [
      { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
      { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
    ],
    purpose: "AI workflow implementation services.",
    payment_terms: "Fixed fee of $8,500.",
    duration: "Until completion",
    due_date: null,
    effective_date: null,
    payment: { amount: 8_500, cadence: null, valid: true },
  };
}

function buildTest372ValidBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. Scope of Services. Service Provider shall deliver AI workflow implementation services.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $8,500.",
    "3. Governing Law. This Agreement is governed by the laws of the State of Delaware.",
    "4. Electronic Signatures. The parties agree that electronic signatures are valid and binding.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    PAID_PRO_HARDENING_CLIENT,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    PAID_PRO_HARDENING_PROVIDER,
    "By: __________________________",
  ].join("\n");
  let body = header;
  let i = 5;
  while (body.length < targetLen) {
    body +=
      `\n${i}. Additional Provision. The parties acknowledge obligations under section ${i} are commercially reasonable.`;
    i += 1;
  }
  return body;
}

beforeEach(() => {
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearPaidProSourceOfTruth();
  clearCurrentSessionProEntitlementMarkers();
  bumpAgreementGenerationId();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  premiumApiMock.forceValidateFail = false;
});

describe("paidPro Test372 degraded json_parse recovery", () => {
  it("uses server degraded document for local recovery when client gates soft-fail", async () => {
    const valid = buildTest372ValidBody(6_900);
    premiumApiMock.forceValidateFail = true;
    premiumApiMock.mockResponses = [
      {
        title: "Mutual Consulting and Implementation Agreement",
        agreement_family: "services_agreement",
        document_text: valid,
        authoritative_draft: valid,
        server_full_document_text: "",
        generation_outcome: "degraded",
        server_generation_failure_code: "json_parse",
        key_terms_found: [],
        missing_material_info: [],
      },
    ];
    const out = await runPremiumCompletion({
      intakeText: TEST372_INTAKE,
      originalUserIntakeRawForMerge: TEST372_INTAKE,
      structuredDraft: test372StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test372-degraded",
      premiumRequestIntakeFingerprint: "fp-test372",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test372StructuredDraft(),
    });
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(6_500);
    expect(
      out.premiumRenderSource === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE ||
        out.premiumRenderSource === "server_full_draft" ||
        out.premiumRenderSource === "server_full_draft_degraded",
    ).toBe(true);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST372_INTAKE)).toBe(
      true,
    );
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
  });

  it("commits eligible degraded recovery to paid Pro SoT", () => {
    const body = buildTest372ValidBody(4_700);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(body, TEST372_INTAKE)).toBe(true);
    const preview = previewPostCheckoutRecoverySotCommit({
      body,
      draft: test372StructuredDraft(),
      intakeText: TEST372_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body,
      draft: test372StructuredDraft(),
      intakeText: TEST372_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      reviewSessionId: "test372-recovery",
    });
    expect(commit.committed).toBe(true);
    if (commit.committed) {
      expect(typeof commit.canonicalSnapshotFrozen).toBe("boolean");
      expect(hasPaidProSourceOfTruth()).toBe(true);
    }
  });

  it("rejects degraded recovery that fails structural display requirements", () => {
    const thin = "CONSULTING AGREEMENT\n\nBlue Canyon and Iron Vale.\n$8,500 Delaware.\n".repeat(35);
    expect(thin.length).toBeGreaterThan(500);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(thin, TEST372_INTAKE)).toBe(false);
    const preview = previewPostCheckoutRecoverySotCommit({
      body: thin,
      draft: test372StructuredDraft(),
      intakeText: TEST372_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(false);
  });

  it("does not block canonical freeze when eligible recovery corpus exists during generation_retry phase", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
        premiumPostCheckoutPhase: "generation_retry",
        corpusLen: 4_700,
        corpusSource: "canonical_working_draft",
        hasEligibleRecoveryCorpus: true,
      }),
    ).toBe(false);
  });
});
