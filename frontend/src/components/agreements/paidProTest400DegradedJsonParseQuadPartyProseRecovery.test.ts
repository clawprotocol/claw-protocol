import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
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
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  previewPostCheckoutRecoverySotCommit,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import {
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
} from "./paidProPostCheckoutRenderGate";
import { shouldBlockPaidProCanonicalFreezeOnApiFailure } from "./paidProApiFailureAuthorityGuard";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { collectForbiddenTemplateFragments } from "./agreementTemplatePlaceholderSafety";
import { resolveAuthoritativeSignerCount, consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { buildPremiumPostCheckoutLocalRecoveryProDraft } from "./premiumNetworkRecoveryLocalDraft";
import { countNumberedAgreementSections } from "./paidProMutualConsultingQualityFloor";
import {
  test398Draft,
} from "./paidProTest398Fixtures";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import { DETERMINISTIC_PRO_FALLBACK_REASON } from "./deterministicQuadPartyProFallback";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc";

/** Production QA prose intake (~889 chars) — TEST397/TEST398 quad-party mutual services. */
export const TEST400_PRODUCTION_PROSE_INTAKE = [
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC, together with Harbor Peak Automation LLC and Iron Vale Systems Inc.,",
  "engage one another to design, implement, and support an integrated logistics and analytics platform.",
  "",
  "Term is twelve months.",
  "Confidential information, intellectual property ownership, limitation of liability, independent contractor status, and mutual indemnification should be included.",
  "Notices should be sent to the primary business addresses and emails of each party.",
  "Oklahoma law governs.",
  "The agreement should require written amendment approval by all parties.",
  "All parties will sign electronically.",
  "Total project consideration is $185,000 with monthly payments as specified.",
].join("\n");

const h = vi.hoisted(() => ({
  callIndex: 0,
  mockResults: [] as PremiumFullDraftResult[],
  fallbackLogs: [] as Array<Record<string, unknown>>,
}));

vi.mock("./deterministicQuadPartyProFallback", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./deterministicQuadPartyProFallback")>();
  return {
    ...mod,
    logDeterministicProFallbackDecision: (reason: string, payload: Record<string, unknown>) => {
      h.fallbackLogs.push({ reason, ...payload });
      return mod.logDeterministicProFallbackDecision(reason as never, payload);
    },
  };
});

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r = h.mockResults[h.callIndex] ?? h.mockResults[h.mockResults.length - 1];
      h.callIndex += 1;
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
      const r = h.mockResults[h.callIndex] ?? h.mockResults[h.mockResults.length - 1];
      h.callIndex += 1;
      return Promise.resolve(r);
    },
  };
});

function buildTest400RejectedDegradedBody(targetLen = 10_195): string {
  const header = [
    "MUTUAL SERVICES AGREEMENT",
    "",
    `This Agreement is among ${RED}, ${BLUE}, ${HARBOR}, and ${IRON}.`,
    "",
    "1. Services. Each party provides logistics and analytics services.",
    "2. Term. Twelve months.",
    "3. Payment. Provider fees apply.",
    "",
    "IN WITNESS WHEREOF",
    "SERVICE PROVIDER:",
    RED,
    "SERVICE PROVIDER:",
    BLUE,
    "SERVICE PROVIDER:",
    HARBOR,
    "SERVICE PROVIDER:",
    IRON,
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. [claw_full_draft_expansion_v1] Party A and Party B placeholder with structural defects. `;
    i += 1;
  }
  return body.slice(0, targetLen);
}

function degradedJsonParseResult(documentText: string): PremiumFullDraftResult {
  return {
    title: "Mutual Services Agreement",
    agreement_family: "consulting_agreement",
    document_text: documentText,
    authoritative_draft: documentText,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    key_terms_found: [],
    missing_material_info: [],
  };
}

beforeEach(() => {
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearPaidProSourceOfTruth();
  clearCurrentSessionProEntitlementMarkers();
  bumpAgreementGenerationId();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
    true;
  h.callIndex = 0;
  h.fallbackLogs = [];
  const degraded = buildTest400RejectedDegradedBody();
  h.mockResults = [degradedJsonParseResult(degraded), degradedJsonParseResult(degraded)];
});

describe("TEST400 degraded json_parse prose quad-party recovery", () => {
  it("deterministic local recovery satisfies Pro display gates for production prose intake", () => {
    const draft = test398Draft();
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST400_PRODUCTION_PROSE_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, JSON.stringify(localRecovery.reasons)).toBe(true);
    expect(localRecovery.body.length).toBeGreaterThan(4000);
    expect(localRecovery.body.length).toBeGreaterThanOrEqual(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(localRecovery.body, TEST400_PRODUCTION_PROSE_INTAKE)).toBe(
      true,
    );
    expect(countNumberedAgreementSections(localRecovery.body)).toBeGreaterThanOrEqual(12);
    expect(localRecovery.body).toMatch(/entered into by and among/i);
    for (const name of [RED, BLUE, HARBOR, IRON]) {
      expect(localRecovery.body).toMatch(new RegExp(name.replace(/\./g, "\\."), "i"));
    }
    expect(countPaidProExecutionBlocks(localRecovery.body)).toBe(1);
    expect(countSignatureBlockHeadingsInTail(localRecovery.body)).toBe(4);
    expect(collectForbiddenTemplateFragments(localRecovery.body, TEST400_PRODUCTION_PROSE_INTAKE)).toEqual([]);
    expect(localRecovery.body).not.toMatch(/Section Any/i);
    expect((localRecovery.body.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("both premium-full-draft attempts degraded/json_parse resolve via deterministic fallback", async () => {
    const draft = test398Draft();
    const corruptedDraft = {
      ...draft,
      parties: [
        { name: "licensing revenue", role: "party" },
        { name: "information known at intake", role: "party" },
      ],
    };

    const out = await runPremiumCompletion({
      intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
      originalUserIntakeRawForMerge: TEST400_PRODUCTION_PROSE_INTAKE,
      structuredDraft: corruptedDraft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test400",
      premiumRequestIntakeFingerprint: "fp-test400",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => corruptedDraft,
    });

    expect(h.callIndex).toBeGreaterThanOrEqual(2);
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(4000);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText).not.toMatch(/licensing revenue/i);
    expect(out.winningPremiumBodyText).not.toMatch(/CONSULTING AGREEMENT The following sections organi/i);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST400_PRODUCTION_PROSE_INTAKE)).toBe(
      true,
    );

    const acceptedLog = h.fallbackLogs.find(
      (l) => l.reason === DETERMINISTIC_PRO_FALLBACK_REASON.accepted,
    );
    expect(acceptedLog).toBeTruthy();
    expect(
      h.fallbackLogs.some((l) => l.reason === DETERMINISTIC_PRO_FALLBACK_REASON.rejected),
    ).toBe(false);

    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: out.winningPremiumBodyText,
      draft,
      intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);

    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: out.premiumRenderSource,
        corpusLen: out.winningPremiumBodyText.length,
        hasEligibleRecoveryCorpus: true,
      }),
    ).toBe(false);

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: out.winningPremiumBodyText,
      draft,
      intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      reviewSessionId: "test400-recovery",
    });
    expect(commit.committed).toBe(true);
    if (commit.committed) {
      expect(hasPaidProSourceOfTruth()).toBe(true);
    }

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
    });
    expect(authority.count).toBe(4);
    const vs01Count = consumeAuthoritativeSignerCount(
      "vs01_corpus_gate",
      {
        intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: out.winningPremiumBodyText,
      },
      4,
    );
    expect(vs01Count).toBe(4);
  });
});
