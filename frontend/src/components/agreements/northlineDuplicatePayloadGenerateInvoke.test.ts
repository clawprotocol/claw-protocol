/** @vitest-environment jsdom */
/**
 * #229 — first entitled Northline dump died with `[duplicate_payload_rejected]`
 * then OPTIONS-only premium-full-draft (no POST) and the #226 60s no-pfd failsafe.
 *
 * The compiler `duplicate_payload_rejected` log is a local-preview scan, not the
 * generate-invoke gate. The gate is `recordPremiumFullDraftCall` /
 * `duplicate_checkout_premium_call`. A leftover fingerprint latch or a remount
 * that recorded an invoke before fetch() must not reject a fresh named-2p create.
 * True same-generation double-submits still dedupe after the first POST starts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  shouldFailClosedPremiumProcessingWithoutPfd,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSkipPartyPrepForOrdinaryNamedTwoParty,
} from "./multiPartyCreateReviewSettle";
import {
  clearPremiumGenerationCallAudit,
  isPremiumGenerateDedupeReason,
  markPremiumFullDraftHttpFired,
  readPremiumGenerationCallRecords,
  recordPremiumFullDraftCall,
  releasePremiumFullDraftCallIfHttpNeverFired,
} from "./paidProPremiumGenerationCallAudit";
import { bumpAgreementGenerationIdForFreshSession } from "./paidProSessionEligibility";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";

const h = vi.hoisted(() => ({ posts: 0 }));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      h.posts += 1;
      return Promise.resolve({
        ok: false as const,
        failure_kind: "http" as const,
        retryable: false,
        error_code: "audit_test_forced_fail",
        document_text: "",
        attemptCount: 1,
      });
    },
  };
});

const NORTHLINE_CANONICAL =
  "Services agreement between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo). Northline delivers robotics integration; Cedar Peak provides analytics. Fee $12,500. Term 6 months. Governing law Texas.";

const NORTHLINE_FP = shortIntakeFingerprint(NORTHLINE_CANONICAL);

const structured: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Northline Robotics LLC", role: "Service Provider" },
    { name: "Cedar Peak Analytics Inc", role: "Client" },
  ],
  purpose: "Northline delivers robotics integration; Cedar Peak provides analytics.",
  payment_terms: "$12,500",
  duration: "6 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: 12500, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

describe("Northline generate-invoke duplicate payload (#229)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPremiumGenerationCallAudit();
    h.posts = 0;
  });

  it("fresh entitled Northline dump is not duplicate-blocked", () => {
    expect(isPremiumGenerateDedupeReason("entitled_rewrite")).toBe(true);
    expect(
      recordPremiumFullDraftCall({
        reason: "entitled_rewrite",
        intakeFingerprint: NORTHLINE_FP,
        agreementGenerationId: "gen-northline-fresh",
      }).duplicateBlocked,
    ).toBe(false);
    expect(readPremiumGenerationCallRecords()).toHaveLength(1);
  });

  it("fingerprint-only leftover does not reject a fresh generation id (same Northline dump)", () => {
    expect(
      recordPremiumFullDraftCall({
        reason: "checkout_completion",
        intakeFingerprint: NORTHLINE_FP,
        agreementGenerationId: "",
      }).duplicateBlocked,
    ).toBe(false);
    expect(
      recordPremiumFullDraftCall({
        reason: "entitled_rewrite",
        intakeFingerprint: NORTHLINE_FP,
        agreementGenerationId: "gen-northline-fresh-2",
      }).duplicateBlocked,
    ).toBe(false);
  });

  it("true same-generation double-submit is still deduped", () => {
    const args = {
      reason: "entitled_rewrite" as const,
      intakeFingerprint: NORTHLINE_FP,
      agreementGenerationId: "gen-northline-dup",
    };
    expect(recordPremiumFullDraftCall(args).duplicateBlocked).toBe(false);
    expect(recordPremiumFullDraftCall(args).duplicateBlocked).toBe(true);
    expect(readPremiumGenerationCallRecords()).toHaveLength(1);
  });

  it("OPTIONS-only / never-POSTed invoke is released so the first dump can POST", () => {
    const args = {
      reason: "entitled_rewrite" as const,
      intakeFingerprint: NORTHLINE_FP,
      agreementGenerationId: "gen-northline-options-only",
    };
    expect(recordPremiumFullDraftCall(args).duplicateBlocked).toBe(false);
    expect(releasePremiumFullDraftCallIfHttpNeverFired(args)).toBe(true);
    expect(recordPremiumFullDraftCall(args).duplicateBlocked).toBe(false);
    markPremiumFullDraftHttpFired(args);
    expect(releasePremiumFullDraftCallIfHttpNeverFired(args)).toBe(false);
    expect(recordPremiumFullDraftCall(args).duplicateBlocked).toBe(true);
  });

  it("fresh-session bump clears the process-global generate ledger", () => {
    recordPremiumFullDraftCall({
      reason: "entitled_rewrite",
      intakeFingerprint: NORTHLINE_FP,
      agreementGenerationId: "gen-stale-tab",
    });
    bumpAgreementGenerationIdForFreshSession();
    expect(readPremiumGenerationCallRecords()).toHaveLength(0);
    expect(
      recordPremiumFullDraftCall({
        reason: "entitled_rewrite",
        intakeFingerprint: NORTHLINE_FP,
        agreementGenerationId: "gen-after-bump",
      }).duplicateBlocked,
    ).toBe(false);
  });

  it("pipeline POSTs on a fresh Northline entitled_rewrite and still dedupes a double invoke", async () => {
    const base = {
      intakeText: NORTHLINE_CANONICAL,
      originalUserIntakeRawForMerge: NORTHLINE_CANONICAL,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-northline-pipeline",
      premiumRequestIntakeFingerprint: NORTHLINE_FP,
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "entitled_rewrite" as const,
    };
    await runPremiumCompletion(base);
    await runPremiumCompletion(base);
    expect(h.posts).toBe(1);
    expect(readPremiumGenerationCallRecords().filter((r) => r.reason === "entitled_rewrite")).toHaveLength(1);
  });

  it("#226 named-2p no-pfd bound and too_much failsafe stay in force", () => {
    expect(CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS).toBe(60_000);
    expect(
      shouldSkipPartyPrepForOrdinaryNamedTwoParty({
        intakeText: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
        generateComplete: false,
      }),
    ).toBe(true);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: true,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(false);
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
    expect(intake).not.toContain("looksOverSpecifiedOrComplexityIntake");
    expect(intake).not.toContain("material_gap");
    const settle = readFileSync(join(__dirname, "multiPartyCreateReviewSettle.ts"), "utf8");
    expect(settle).toContain("if (input.pfdHttpCompleted) return false");
    expect(settle).toContain("CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS");
  });
});
