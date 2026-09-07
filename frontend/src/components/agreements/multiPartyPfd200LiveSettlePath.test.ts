/**
 * Live-path regression: #196 demoted helpers, but entitled Pro N≥3 still fail-closed
 * after premium-full-draft 200 because AgreementBuilderIntake / pipeline / freeze
 * call different sites that still log [placeholder-reject] and
 * [signer-count-authority]-mismatch under leftover 2-party overlay.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeUserVisibleAgreementPlainText,
} from "./agreementTemplatePlaceholderSafety";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { mergePartyPrepIntoCreateSubmitText } from "./multiPartyCreateReviewSettle";
import {
  consumeAuthoritativeSignerCount,
  resetSignerCountAuthorityDiagnosticsForTests,
} from "./signerCountAuthority";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import {
  shouldFailCloseCreateAfterPremiumFullDraft,
  shouldSettleProReviewAfterPremiumFullDraft,
} from "./multiPartyCreateReviewSettle";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const THREE_PARTY_DUMP = "Three-party services agreement for $24,000. Governing law: Texas.";
const FOUR_PARTY_DUMP =
  "Need a four-party collaboration agreement for $80k over 12 months covering shared platform ops.";
const THREE_NAMES = ["Cedar Ridge LLC", "Harbor Point Inc", "Summit Mesa LP"] as const;
const FOUR_NAMES = ["North Wind LLC", "East Dock Inc", "South Pier LP", "West Gate Corp"] as const;
const LEFTOVER_TWO = ["Redwood LLC", "BlueHarbor Inc"] as const;

function padOperative(targetLen: number, already: string): string {
  const clause =
    "The parties shall perform their commercial obligations in good faith, keep accurate records, and cooperate on deliverables, reporting, and milestone acceptance. ";
  let t = already;
  while (t.length < targetLen) t += clause;
  return t.slice(0, targetLen);
}

/** Live-shaped ~15k salvaged multiparty corpus with notice/signature field stubs. */
function buildLiveMultipartyCorpus(names: readonly string[], targetLen = 15_381): string {
  const among = names.join(", ");
  const notices = names
    .map((n) => `If to ${n}:\nEmail: [EMAIL]\nAddress: [ADDRESS]\n`)
    .join("\n");
  const signatures = names
    .map(
      (n) =>
        `${n}\nBy: [SIGNATURE]\nName: [NAME]\nTitle: [TITLE]\nDate: [DATE]\nEmail: [EMAIL]\n`,
    )
    .join("\n");
  const head = [
    "MULTI-PARTY SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${among}.`,
    "",
    "1. SCOPE OF SERVICES",
    "The parties shall perform the professional services described in this Agreement for the fees stated herein.",
    "2. PAYMENT",
    "Fees total the amount stated in the intake and are payable in monthly installments.",
    "3. TERM",
    "The term begins on the Effective Date and continues for the stated duration unless earlier terminated.",
    "4. CONFIDENTIALITY",
    "Each party shall protect the others' confidential information using reasonable care.",
    "5. INTELLECTUAL PROPERTY",
    "Work product is assigned as set forth in this Agreement after payment of undisputed amounts.",
    "6. INDEMNIFICATION",
    "Each party shall indemnify the others against third-party claims arising from its material breach.",
    "7. LIMITATION OF LIABILITY",
    "No party is liable for indirect or consequential damages except for confidentiality or IP breach.",
    "8. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law rules.",
    "9. NOTICES",
    "Notices under this Agreement must be in writing.",
    notices,
    "10. GENERAL",
    "This Agreement constitutes the entire agreement among the parties.",
    "",
  ].join("\n");
  const tail = ["", "IN WITNESS WHEREOF, the parties have executed this Agreement.", "", signatures].join("\n");
  const midBudget = Math.max(8_500, Math.min(targetLen, 17_800) - tail.length);
  const mid = padOperative(midBudget, head);
  return `${mid}${tail}`;
}

function leftoverTwoPartyDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: LEFTOVER_TWO.map((name) => ({ name, role: "party" })),
    purpose: "Services",
    payment_terms: "$24,000",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 24000, cadence: "monthly", valid: true },
  };
}

/** Same partyNames the live pipeline reject ctx uses (leftover merged.parties). */
function liveRejectPartyNames(draft: ParsedDraftShape): string[] {
  return (draft.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean);
}

/** Same partyNames the live pipeline finalize call uses. */
function liveFinalizePartyNames(draft: ParsedDraftShape, intake: string): string[] {
  return resolvePartiesForReviewRender({ draft, intakeText: intake })
    .map((p) => p.partyLegalName.trim())
    .filter((name) => name.length >= 2);
}

describe("live pipeline sites after pfd 200 + leftover 2-party overlay", () => {
  afterEach(() => {
    resetSignerCountAuthorityDiagnosticsForTests();
    vi.restoreAllMocks();
  });

  it("N=3: live reject + finalize + freeze do not fire placeholder-reject", () => {
    const intake = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [...THREE_NAMES]);
    const corpus = buildLiveMultipartyCorpus(THREE_NAMES);
    const leftover = leftoverTwoPartyDraft();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: liveFinalizePartyNames(leftover, intake),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);

    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[placeholder-reject]"))).toBe(false);

    const settle = {
      winningPremiumBodyText: freeze.text || corpus,
      premiumRenderSource: "server_full_draft" as const,
      staleIntakeOrGeneration: false,
    };
    expect(shouldSettleProReviewAfterPremiumFullDraft(settle)).toBe(true);
    expect(shouldFailCloseCreateAfterPremiumFullDraft(settle)).toBe(false);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftover,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: settle.winningPremiumBodyText,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
  });

  it("N=4: live freeze + signer-count consume do not fire authority mismatch", () => {
    const intake = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...FOUR_NAMES]);
    const corpus = buildLiveMultipartyCorpus(FOUR_NAMES);
    const leftover = leftoverTwoPartyDraft();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: liveFinalizePartyNames(leftover, intake),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);

    const consumed = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: intake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
        manifestPartyCount: 4,
      },
      leftover.parties.length,
    );
    expect(consumed).toBe(4);
    enforcePaidProSingleExecutionBlock(freeze.text || corpus, {
      intakeText: intake,
      draftPartyNames: leftover.parties.map((p) => p.name),
    });

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("[signer-count-authority]-mismatch")),
    ).toBe(false);
    expect(containsUnresolvedRenderTokens(fin.text)).toBe(false);

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
  });

  it("two-party named intake still freeze-passes on the live functions", () => {
    const twoIntake =
      "Consulting agreement between Acme LLC and Beta Corp. Payment: $5,000 per month. Term: 12 months. California law governs.";
    const twoNames = ["Acme LLC", "Beta Corp"] as const;
    const corpus = buildLiveMultipartyCorpus(twoNames, 16_000);
    const draft: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "California",
      agreement_family: "consulting_agreement",
      parties: twoNames.map((name) => ({ name, role: "party" })),
      purpose: "Consulting",
      payment_terms: "$5,000 per month",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: { amount: 5000, cadence: "monthly", valid: true },
    };
    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: twoIntake,
      partyNames: liveFinalizePartyNames(draft, twoIntake),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);
    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft,
      intakeText: twoIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
  });

  it("hollow insert junk still fail-closes on the same live functions", () => {
    const intake = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [...THREE_NAMES]);
    const leftover = leftoverTwoPartyDraft();
    const junk = [
      "AGREEMENT",
      `Among ${THREE_NAMES.join(", ")}.`,
      "Fees are [INSERT PAYMENT TERMS HERE] and notice at [INSERT ADDRESS].",
      "{{party_name}} shall perform.",
      "x".repeat(200),
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(junk, {
      intakeRaw: intake,
      partyNames: liveFinalizePartyNames(leftover, intake),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok).toBe(false);
    const acc = rejectPremiumBodyForProRender(junk, {
      intakeText: intake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok).toBe(false);
    const freeze = resolvePaidProFreezeCommitText({
      text: junk,
      source: "server_full_draft",
      draft: leftover,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok).toBe(false);
  });
});
