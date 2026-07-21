/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  buildAcceptedProCorpusSafeDisplayCacheKey,
  readAcceptedProCorpusSafeDisplayCache,
  writeAcceptedProCorpusSafeDisplayCache,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  buildPremiumPostCheckoutLocalRecoveryProDraft,
} from "./premiumNetworkRecoveryLocalDraft";
import {
  previewPostCheckoutRecoverySotCommit,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { detectProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import { preparePaidProFreezeCandidateText } from "./paidProFreezeCandidate";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  BLUE_HARBOR,
  CEDAR_RIDGE,
  MERIDIAN,
  NORTHSTAR,
  TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
  test468Draft,
} from "./paidProTest468Fixtures";

const h = vi.hoisted(() => ({
  callIndex: 0,
  mockResults: [] as PremiumFullDraftResult[],
}));

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

function quadDraft(): ParsedDraftShape {
  return {
    ...test468Draft(),
    parties: [
      { name: CEDAR_RIDGE, role: "Client" } as never,
      { name: NORTHSTAR, role: "Service Provider" } as never,
      { name: BLUE_HARBOR, role: "party" } as never,
      { name: MERIDIAN, role: "party" } as never,
    ],
  };
}

function twoPartyParsedDraft(): ParsedDraftShape {
  return test468Draft();
}

function buildDegradedJsonParseBody(targetLen = 8555): string {
  const header = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is among ${CEDAR_RIDGE}, ${NORTHSTAR}, ${BLUE_HARBOR}, and ${MERIDIAN}.`,
    "",
    "1. Scope. AI healthcare analytics platform services.",
    "2. Term. Twenty-four months.",
    "",
    "IN WITNESS WHEREOF",
    CEDAR_RIDGE,
    NORTHSTAR,
    BLUE_HARBOR,
    MERIDIAN,
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. [claw_full_draft_expansion_v1] degraded filler placeholder. `;
    i += 1;
  }
  return body.slice(0, targetLen);
}

function degradedJsonParseResult(documentText: string): PremiumFullDraftResult {
  return {
    title: "Services Agreement",
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
  resetPaidProPipelineTestIsolation();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearPaidProSourceOfTruth();
  clearFrozenCanonicalAgreementCorpus();
  clearCurrentSessionProEntitlementMarkers();
  bumpAgreementGenerationId();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
    true;
  h.callIndex = 0;
  const degraded = buildDegradedJsonParseBody();
  h.mockResults = [degradedJsonParseResult(degraded), degradedJsonParseResult(degraded)];
});

describe("TEST486–489 degraded json_parse quad-party recovery", () => {
  it("TEST486 — degraded JSON parse twice → deterministic fallback → recovery adopts SoT", async () => {
    const draft = quadDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      originalUserIntakeRawForMerge: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      structuredDraft: twoPartyParsedDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test486",
      premiumRequestIntakeFingerprint: "fp-test486",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => twoPartyParsedDraft(),
    });

    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    const body = (out.winningPremiumBodyText || "").trim();
    expect(body.length).toBeGreaterThan(4_000);

    const preview = previewPostCheckoutRecoverySotCommit({
      body,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(preview.eligible, preview.blockReason).toBe(true);

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body,
      draft: { ...out.premiumDraft, premium_full_document_text: body },
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "g-test486",
    });
    expect(commit.committed, !commit.committed ? commit.reason : "").toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(getPaidProSourceOfTruth()?.text.length).toBeGreaterThan(4_000);
  });

  it("TEST487 — notice validation uses intake authority 4 when draft/handoff are 4 but parsed authority was 2", () => {
    const draft = twoPartyParsedDraft();
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: quadDraft(),
      rawIntake: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const prep = preparePaidProFreezeCandidateText({
      text: recovery.body,
      source: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "post_checkout_recovery_freeze_preview",
    });

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
    });
    expect(authority.count).toBe(4);

    const structural = validateClauseFamilyStructuralIntegrity(prep.text, {
      parties: prep.reviewParties,
      surface: "post_checkout_recovery_freeze_preview_pre_freeze",
      phase: "post_acceptance",
      draftPartyCount: 4,
      handoffPartySlots: 4,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: draft.parties!.map((p) => String(p.name)),
      acceptedCorpus: prep.text,
    });
    expect(structural.violations.some((v) => v.code === "missing_party_notice_stanzas")).toBe(false);
    expect(structural.violations.some((v) => v.code === "excess_party_notice_stanzas")).toBe(false);
    expect(countOperativeIfToNoticeStanzas(prep.text)).toBe(4);
  });

  it("TEST488 — no Party 1/3 placeholders and no 5-stanza notices in degraded recovery", () => {
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: quadDraft(),
      rawIntake: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const prep = preparePaidProFreezeCandidateText({
      text: recovery.body,
      source: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      draft: twoPartyParsedDraft(),
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test488_degraded_recovery",
    });

    expect(countOperativeIfToNoticeStanzas(prep.text)).toBe(4);
    expect(prep.text).not.toMatch(/If to Party 1:/i);
    expect(prep.text).not.toMatch(/If to Party 3:/i);
    const contamination = detectProfessionalCorpusContamination(prep.text, {
      partyNames: [CEDAR_RIDGE, NORTHSTAR, BLUE_HARBOR, MERIDIAN],
      partyCount: 4,
    });
    expect(contamination.some((f) => f.code === "duplicate_notice_stanza")).toBe(false);
  });

  it("TEST489 — safe-display cache hit on recovery preview cannot block SoT adoption", () => {
    const draft = quadDraft();
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);
    const body = recovery.body.trim();

    const cachedDisplay = applyAcceptedProCorpusSafeDisplay(body, {
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "post_checkout_recovery_freeze_preview",
    });
    const cacheKey = buildAcceptedProCorpusSafeDisplayCacheKey(body, {
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "post_checkout_recovery_freeze_preview",
    });
    writeAcceptedProCorpusSafeDisplayCache(cacheKey, cachedDisplay);
    expect(readAcceptedProCorpusSafeDisplayCache(cacheKey)?.text.length).toBeGreaterThan(
      Math.floor(body.length * 0.85),
    );

    const preview = previewPostCheckoutRecoverySotCommit({
      body,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible, preview.blockReason).toBe(true);

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(commit.committed, !commit.committed ? commit.reason : "").toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(true);
  });
});
