/**
 * Live-path regression: #196 demoted helpers, but entitled Pro N≥3 still fail-closed
 * after premium-full-draft 200 because AgreementBuilderIntake / pipeline / freeze
 * call different sites that still log [placeholder-reject] and
 * [signer-count-authority]-mismatch under leftover 2-party overlay.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeTemplatePlaceholderFragments,
  finalizeUserVisibleAgreementPlainText,
  isPaidProCommercialFieldStubToken,
  shouldAcceptPaidProCommercialFieldStubsAfterPfd200,
} from "./agreementTemplatePlaceholderSafety";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { mergePartyPrepIntoCreateSubmitText } from "./multiPartyCreateReviewSettle";
import { sanitizeProReviewDisplayText } from "./polishProAgreementDisplayLayer";
import {
  consumeAuthoritativeSignerCount,
  extractAuthoritativeLegalNamesFromCommercialCorpus,
  resetSignerCountAuthorityDiagnosticsForTests,
  resolveAuthoritativeSignerCount,
  resolvePartyNamesPreferringCommercialCorpus,
} from "./signerCountAuthority";
import { assessLabeledPartyManifestIntegrity } from "./labeledPartyManifestIntegrity";
import {
  bindUnusedFilledPartyNamesIntoLeftoverOrgSlots,
  repairKnownPartyPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
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
/** Live #197/#198 walk names — leftover 2-slot editor + Party 3 LoneStar. */
const LIVE_THREE = ["Redwood LLC", "BlueHarbor Inc", "LoneStar LLC"] as const;
const LIVE_FOUR = ["Redwood LLC", "BlueHarbor Inc", "LoneStar LLC", "IronGate LP"] as const;
/** Live post-#202 4p leftover: generate named 1+3 and left [ORG_1]/[ORG_2] for 2+4. */
const LIVE_FOUR_UNBOUND = [
  "Solo Design",
  "CodeNest LLC",
  "BrightPay Ops",
  "Warehouse One Inc",
] as const;

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

/**
 * Live leftover-overlay 4p 200 after #199: leftover 2-party opening still has
 * [ORG_1]/[ORG_2], Party 3/4 survive only in notices/signatures.
 */
function buildLeftoverOverlayFourPartyLiveCorpus(
  names: readonly string[],
  targetLen = 15_381,
): string {
  const leftoverOpening = "This Agreement is entered into by and between [ORG_1] and [ORG_2].";
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
    leftoverOpening,
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
  const tail = ["", "IN WITNESS WHEREOF, the parties have executed this Agreement.", "", signatures].join(
    "\n",
  );
  const midBudget = Math.max(8_500, Math.min(targetLen, 17_800) - tail.length);
  const mid = padOperative(midBudget, head);
  return `${mid}${tail}`;
}

/**
 * Live leftover-overlay 4p 200 after #200: leftover 2-party template still
 * repeats [ORG_1]/[ORG_2] through the operative body (not only the opening).
 * Notice/signature field stubs for all 4 parties plus those leftover slots
 * exceed the old 48-token accept cap → fe_placeholder_reject.
 */
function buildLeftoverOverlayFourPartyRepeatedOrgCorpus(
  names: readonly string[],
  targetLen = 15_381,
): string {
  const leftoverOpening =
    'This Agreement is entered into by and between [ORG_1] ("Client") and [ORG_2] ("Service Provider").';
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
    leftoverOpening,
    "",
    "1. SCOPE OF SERVICES",
    "[ORG_1] shall perform the professional services described in this Agreement and [ORG_2] shall cooperate.",
    "2. PAYMENT",
    "[ORG_1] shall pay fees in monthly installments. [ORG_2] shall invoice in good faith.",
    "3. TERM",
    "The term begins on the Effective Date and continues for the stated duration unless earlier terminated.",
    "4. CONFIDENTIALITY",
    "[ORG_1] and [ORG_2] shall protect the others' confidential information using reasonable care.",
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
  const leftoverClause =
    "[ORG_1] shall perform commercial obligations and [ORG_2] shall keep accurate records, cooperate on deliverables, and accept milestones. ";
  const tail = ["", "IN WITNESS WHEREOF, the parties have executed this Agreement.", "", signatures].join(
    "\n",
  );
  const midBudget = Math.max(8_500, Math.min(targetLen, 17_800) - tail.length);
  let mid = head;
  while (mid.length < midBudget) mid += leftoverClause;
  return `${mid.slice(0, midBudget)}${tail}`;
}

/**
 * Live post-#202 pfd 200: opening names Solo Design + BrightPay only;
 * leftover [ORG_1]×4 and [ORG_2]×3; CodeNest + Warehouse One never appear.
 * Unique brackets are only those leftover [ORG_n] slots (text_len ≈ 9447).
 */
function buildLiveFourPartyUnboundOrgLeftoverCorpus(targetLen = 9_447): string {
  const leftoverOpening =
    'This Agreement is entered into by and among Solo Design ("Solo Design"), [ORG_1] ("[ORG_1]"), BrightPay Ops ("BrightPay Ops"), and [ORG_2] ("[ORG_2]").';
  const head = [
    "MULTI-PARTY SERVICES AGREEMENT",
    "",
    leftoverOpening,
    "",
    "1. SCOPE OF SERVICES",
    "[ORG_1] shall perform the professional services described in this Agreement and the other parties shall cooperate.",
    "2. PAYMENT",
    "Fees total the amount stated in the intake and are payable in monthly installments.",
    "3. TERM",
    "The term begins on the Effective Date and continues for the stated duration unless earlier terminated.",
    "4. CONFIDENTIALITY",
    "[ORG_1] and [ORG_2] shall protect the others' confidential information using reasonable care.",
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
    'If to Solo Design:\nEmail: notices@solodesign.example\nAddress: 100 Design Way',
    'If to BrightPay Ops:\nEmail: notices@brightpay.example\nAddress: 200 Ops Blvd',
    "10. GENERAL",
    "This Agreement constitutes the entire agreement among the parties.",
    "",
  ].join("\n");
  const leftoverClause =
    "The parties shall perform their commercial obligations in good faith, keep accurate records, and cooperate on deliverables, reporting, and milestone acceptance. ";
  const tail = [
    "",
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    "",
    "Solo Design\nBy: _________________________\nName: _________________________\nTitle: _________________________\nDate: _________________________\n",
    "BrightPay Ops\nBy: _________________________\nName: _________________________\nTitle: _________________________\nDate: _________________________\n",
  ].join("\n");
  const midBudget = Math.max(8_500, Math.min(targetLen, 12_000) - tail.length);
  let mid = head;
  while (mid.length < midBudget) mid += leftoverClause;
  return `${mid.slice(0, midBudget)}${tail}`;
}

function leftoverTwoPartyDraft(
  names: readonly string[] = LEFTOVER_TWO,
): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: names.map((name) => ({ name, role: "party" })),
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

  it("N=4 leftover first-two prep + 4 live names: reject/finalize/freeze/consume settle", () => {
    // Live leftover overlay: 2-slot editor still holds the first two of the four
    // intake names. Reject/finalize use resolvePartiesForReviewRender (4 names),
    // not leftover.parties. Consume sites often omit corpusPlain / manifest=4.
    const leftoverFirstTwo = leftoverTwoPartyDraft([FOUR_NAMES[0], FOUR_NAMES[1]]);
    const intake = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...FOUR_NAMES]);
    const corpus = buildLiveMultipartyCorpus(FOUR_NAMES);
    const liveNames = liveFinalizePartyNames(leftoverFirstTwo, intake);

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: liveNames,
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: liveNames,
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftoverFirstTwo,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);

    const consumedEnforce = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: intake,
        draftPartyNames: leftoverFirstTwo.parties.map((p) => p.name),
        draftParties: leftoverFirstTwo.parties,
        corpusPlain: corpus,
      },
      leftoverFirstTwo.parties.length,
    );
    expect(consumedEnforce).toBe(4);

    const consumedSlots = consumeAuthoritativeSignerCount(
      "guided_pre_review_signer_slots",
      {
        intakeText: intake,
        draftPartyNames: leftoverFirstTwo.parties.map((p) => p.name),
        rawPartyCount: 2,
        userExpandedPartyCount: 2,
      },
      2,
    );
    expect(consumedSlots).toBe(4);
    const consumedBlockers = consumeAuthoritativeSignerCount(
      "guided_signer_setup_blockers",
      {
        intakeText: intake,
        draftPartyNames: leftoverFirstTwo.parties.map((p) => p.name),
        rawPartyCount: 2,
        userExpandedPartyCount: 2,
      },
      2,
    );
    expect(consumedBlockers).toBe(4);

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
  });

  it("N=4 leftover 2-party prep overwrite still settles from the 200 corpus", () => {
    // Leftover 2-party prep re-upserts only the first two names, wiping Party 3/4
    // labels from intake. The 200 corpus still carries all four legal names.
    const fourNamed = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...FOUR_NAMES]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(fourNamed, [
      FOUR_NAMES[0],
      FOUR_NAMES[1],
    ]);
    const leftover = leftoverTwoPartyDraft([FOUR_NAMES[0], FOUR_NAMES[1]]);
    const corpus = buildLiveMultipartyCorpus(FOUR_NAMES);

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: leftoverPrepIntake,
      partyNames: liveFinalizePartyNames(leftover, leftoverPrepIntake),
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveFinalizePartyNames(leftover, leftoverPrepIntake),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of FOUR_NAMES) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    const consumed = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: leftoverPrepIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      },
      leftover.parties.length,
    );
    expect(consumed).toBe(4);

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
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

  it("N=3 leftover overlay: settled freeze + overlay still show all 3 legal names", () => {
    const intake = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [...LIVE_THREE]);
    const leftover = leftoverTwoPartyDraft([LIVE_THREE[0], LIVE_THREE[1]]);
    const corpus = buildLiveMultipartyCorpus(LIVE_THREE);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    expect(freeze.text).toContain(LIVE_THREE[0]);
    expect(freeze.text).toContain(LIVE_THREE[1]);
    expect(freeze.text).toContain(LIVE_THREE[2]);

    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: intake,
    }).map((p) => p.partyLegalName.trim());
    for (const name of LIVE_THREE) {
      expect(overlay, overlay.join("|")).toContain(name);
    }
    expect(overlay).toHaveLength(3);

    const display = sanitizeProReviewDisplayText(freeze.text || corpus, {
      source: "pro_review_display",
    });
    expect(display.text).toContain(LIVE_THREE[0]);
    expect(display.text).toContain(LIVE_THREE[1]);
    expect(display.text).toContain(LIVE_THREE[2]);
    expect(display.sanityBlocked).toBe(false);

    const consumed = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: intake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      },
      leftover.parties.length,
    );
    expect(consumed).toBe(3);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("[signer-count-authority]-mismatch")),
    ).toBe(false);
  });

  it("N=3 leftover 2-party prep overwrite: do not silently drop BlueHarbor", () => {
    const threeNamed = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [...LIVE_THREE]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(threeNamed, [
      LIVE_THREE[0],
      LIVE_THREE[1],
    ]);
    const leftover = leftoverTwoPartyDraft([LIVE_THREE[0], LIVE_THREE[1]]);
    const corpus = buildLiveMultipartyCorpus(LIVE_THREE);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(leftoverPrepIntake).not.toMatch(/Party\s*3\s*:/i);
    expect(extractAuthoritativeLegalNamesFromCommercialCorpus(corpus)).toEqual(
      expect.arrayContaining([...LIVE_THREE]),
    );
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: leftoverPrepIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      }).count,
    ).toBe(3);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_THREE) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: leftoverPrepIntake,
      corpusPlain: freeze.text || corpus,
    }).map((p) => p.partyLegalName.trim());
    for (const name of LIVE_THREE) {
      expect(overlay, `overlay dropped ${name}: ${overlay.join("|")}`).toContain(name);
    }
    expect(overlay).toHaveLength(3);

    const display = sanitizeProReviewDisplayText(freeze.text || corpus, {
      source: "pro_review_display",
    });
    expect(display.text).toContain("BlueHarbor Inc");
    expect(display.text).toContain("LoneStar LLC");
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("[signer-count-authority]-mismatch")),
    ).toBe(false);
  });

  it("N=4 leftover 2-party prep overwrite: freeze keeps middle parties", () => {
    const fourNamed = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...LIVE_FOUR]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(fourNamed, [
      LIVE_FOUR[0],
      LIVE_FOUR[1],
    ]);
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR[0], LIVE_FOUR[1]]);
    const corpus = buildLiveMultipartyCorpus(LIVE_FOUR);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_FOUR) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }
    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: leftoverPrepIntake,
      corpusPlain: freeze.text || corpus,
    }).map((p) => p.partyLegalName.trim());
    for (const name of LIVE_FOUR) {
      expect(overlay, `overlay dropped ${name}: ${overlay.join("|")}`).toContain(name);
    }
    expect(overlay).toHaveLength(4);
  });

  it("N=4 leftover-overlay live path after #199: leftover [ORG_n] opening + 4 notice names settles", () => {
    // Live fail after #199: leftover 2-party opening still has [ORG_1]/[ORG_2],
    // leftover prep wiped Party 3/4 labels, notices already name all four.
    // Overlay showed parties_visible=4 on fail-close UI; Review still did not settle.
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR[0], LIVE_FOUR[1]]);
    const fourNamed = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...LIVE_FOUR]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(fourNamed, [
      LIVE_FOUR[0],
      LIVE_FOUR[1],
    ]);
    const leftoverFusedIntake = `Party 1: ${LIVE_FOUR[0]}\nParty 2: ${LIVE_FOUR[1]}\nCollaboration leftover prep.`;
    const corpus = buildLeftoverOverlayFourPartyLiveCorpus(LIVE_FOUR);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(corpus).toMatch(/\[ORG_1\]/);
    expect(corpus).toMatch(/\[ORG_2\]/);
    expect(extractAuthoritativeLegalNamesFromCommercialCorpus(corpus)).toEqual(
      expect.arrayContaining([...LIVE_FOUR]),
    );
    expect(
      resolvePartyNamesPreferringCommercialCorpus({
        intakeText: leftoverPrepIntake,
        corpusPlain: corpus,
        leftoverNames: leftover.parties.map((p) => p.name),
      }),
    ).toEqual(expect.arrayContaining([...LIVE_FOUR]));
    expect(
      resolvePartyNamesPreferringCommercialCorpus({
        intakeText: leftoverFusedIntake,
        corpusPlain: corpus,
        leftoverNames: leftover.parties.map((p) => p.name),
      }).length,
    ).toBeGreaterThanOrEqual(4);

    const recovered = liveFinalizePartyNames(leftover, leftoverPrepIntake);
    const recoveredWithCorpus = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: leftoverPrepIntake,
      corpusPlain: corpus,
    })
      .map((p) => p.partyLegalName.trim())
      .filter((name) => name.length >= 2);
    expect(recoveredWithCorpus).toEqual(expect.arrayContaining([...LIVE_FOUR]));
    expect(recoveredWithCorpus).toHaveLength(4);

    const repair = repairKnownPartyPlaceholders(corpus, recoveredWithCorpus, leftoverPrepIntake);
    expect(repair.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);
    for (const name of LIVE_FOUR) {
      expect(repair.text).toContain(name);
    }

    const accLeftoverCtx = rejectPremiumBodyForProRender(corpus, {
      intakeText: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(accLeftoverCtx.ok, accLeftoverCtx.reasons.join("|")).toBe(true);

    const accRecovered = rejectPremiumBodyForProRender(repair.text, {
      intakeText: leftoverPrepIntake,
      partyNames: recoveredWithCorpus,
    });
    expect(accRecovered.ok, accRecovered.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_FOUR) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    const consumedEnforce = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: leftoverPrepIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      },
      leftover.parties.length,
    );
    expect(consumedEnforce).toBe(4);
    const consumedSlots = consumeAuthoritativeSignerCount(
      "guided_pre_review_signer_slots",
      {
        intakeText: leftoverPrepIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        rawPartyCount: 2,
        userExpandedPartyCount: 2,
      },
      2,
    );
    expect(consumedSlots).toBe(4);
    const consumedFused = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: leftoverFusedIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      },
      leftover.parties.length,
    );
    expect(consumedFused).toBe(4);

    expect(
      shouldAcceptPaidProCommercialFieldStubsAfterPfd200({
        text: corpus,
        intakeRaw: leftoverPrepIntake,
      }),
    ).toBe(true);

    const integrity = assessLabeledPartyManifestIntegrity({
      intakeText: leftoverPrepIntake,
      draftPartyNames: leftover.parties.map((p) => p.name),
      documentText: corpus,
    });
    expect(integrity.reasons).not.toContain("document_fatal_org_email_placeholder");

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftover,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("[signer-count-authority]-mismatch")),
    ).toBe(false);
    expect(recovered.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * Live leftover 2-party overlay after #201: repeated [ORG_n] plus leftover role/alias
   * slots finalize already rewrites ([CLIENT]/[PROVIDER]) and leftover [ENTITY NAME]
   * (the counterpart of allowlisted [PARTY NAME]). Tip a2f1188e / #201 only allowlisted
   * numbered leftover [ORG_n]/[PARTY_n] — these extra leftover identity tokens still
   * fail-closed rejectPremiumBodyForProRender before finalize, so the harness never
   * saw [placeholder-reject].
   */
  function buildLeftoverOverlayFourPartyRoleAliasCorpus(
    names: readonly string[],
    targetLen = 15_381,
  ): string {
    const leftoverOpening =
      'This Agreement is entered into by and between [ORG_1] ("Client") and [ORG_2] ("Service Provider").';
    const notices = names
      .map((n) => `If to ${n}:\nEmail: [EMAIL]\nAddress: [ADDRESS]\n`)
      .join("\n");
    const signatures = names
      .map(
        (n) =>
          `${n}\nBy: [SIGNATURE]\nName: [NAME]\nTitle: [TITLE]\nDate: [DATE]\nEmail: [EMAIL]\n`,
      )
      .join("\n");
    const leftoverRoleNoise =
      "[CLIENT] shall pay [PROVIDER]. [PARTY NAME] and [ENTITY NAME] remain leftover identity slots. ";
    const head = [
      "MULTI-PARTY SERVICES AGREEMENT",
      "",
      leftoverOpening,
      leftoverRoleNoise,
      "",
      "1. SCOPE OF SERVICES",
      "[ORG_1] shall perform the professional services described in this Agreement and [ORG_2] shall cooperate.",
      "2. PAYMENT",
      "[ORG_1] shall pay fees in monthly installments. [ORG_2] shall invoice in good faith.",
      "3. TERM",
      "The term begins on the Effective Date and continues for the stated duration unless earlier terminated.",
      "4. CONFIDENTIALITY",
      "[ORG_1] and [ORG_2] shall protect the others' confidential information using reasonable care.",
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
    const leftoverClause =
      "[ORG_1] shall perform commercial obligations and [ORG_2] shall keep accurate records, cooperate on deliverables, and accept milestones. ";
    const tail = ["", "IN WITNESS WHEREOF, the parties have executed this Agreement.", "", signatures].join(
      "\n",
    );
    const midBudget = Math.max(8_500, Math.min(targetLen, 17_800) - tail.length);
    let mid = head;
    while (mid.length < midBudget) mid += leftoverClause;
    return `${mid.slice(0, midBudget)}${tail}`;
  }

  /** Tip a2f1188e leftover matcher — numbered identity only. */
  function tipA2f1188eLeftoverIdentity(token: string): boolean {
    const n = token
      .replace(/^\[|\]$/g, "")
      .replace(/_/g, " ")
      .trim()
      .replace(/[\s./-]+/g, "_")
      .replace(/_+/g, "_")
      .toUpperCase();
    if (/^(?:ORG|PARTY|ENTITY|CLIENT|COMPANY|ORGANIZATION|PERSON)_\d+$/i.test(n)) return true;
    if (/^(?:ORG|PARTY|ENTITY|CLIENT|COMPANY|ORGANIZATION|PERSON)\d+$/i.test(n)) return true;
    return /^PARTY_[AB]\d*$/i.test(n);
  }

  it("N=4 leftover-overlay after #201: leftover [PROVIDER]/[ENTITY NAME] + repeated [ORG_n] settle", () => {
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR[0], LIVE_FOUR[1]]);
    const fourNamed = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...LIVE_FOUR]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(fourNamed, [
      LIVE_FOUR[0],
      LIVE_FOUR[1],
    ]);
    const corpus = buildLeftoverOverlayFourPartyRoleAliasCorpus(LIVE_FOUR);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(corpus).toMatch(/\[ORG_1\]/);
    expect(corpus).toMatch(/\[PROVIDER\]/);
    expect(corpus).toMatch(/\[ENTITY NAME\]/);
    expect((corpus.match(/\[ORG_1\]/g) || []).length).toBeGreaterThan(8);

    const leftoverFatals = analyzeTemplatePlaceholderFragments(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
    }).filter((d) => d.fatal);
    const uniqueFatals = [...new Set(leftoverFatals.map((d) => d.token))].sort();
    // Exact unique remainingFatal from the same classifier rejectPremiumBodyForProRender uses.
    expect(uniqueFatals).toEqual(
      ["[CLIENT]", "[EMAIL]", "[ENTITY NAME]", "[ORG_1]", "[ORG_2]", "[PARTY NAME]", "[PROVIDER]"].sort(),
    );
    const tipA2f1188eUnacceptable = uniqueFatals.filter(
      (t) => !isPaidProCommercialFieldStubToken(t) && !tipA2f1188eLeftoverIdentity(t),
    );
    // These are the tokens tip a2f1188e still fail-closed on after the 48-cap removal.
    expect(tipA2f1188eUnacceptable).toEqual(["[ENTITY NAME]", "[PROVIDER]"]);
    expect(extractAuthoritativeLegalNamesFromCommercialCorpus(corpus)).toEqual(
      expect.arrayContaining([...LIVE_FOUR]),
    );

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_FOUR) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    expect(
      shouldAcceptPaidProCommercialFieldStubsAfterPfd200({
        text: corpus,
        intakeRaw: leftoverPrepIntake,
      }),
    ).toBe(true);

    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: leftoverPrepIntake,
      corpusPlain: freeze.text || corpus,
    }).map((p) => p.partyLegalName.trim());
    expect(overlay).toHaveLength(4);
    for (const name of LIVE_FOUR) {
      expect(overlay, `overlay dropped ${name}`).toContain(name);
    }

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftover,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[placeholder-reject]"))).toBe(
      false,
    );
  });

  it("N=4 leftover-overlay after #200: repeated leftover [ORG_n] + 4p field stubs settle", () => {
    // Live fail on tip 6aa42225 / #200: leftover 2-party template still repeats
    // [ORG_1]/[ORG_2] through the operative body. Notices already name all four.
    // Overlay parties_visible=4; Review still fail-closed (fe_placeholder_reject).
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR[0], LIVE_FOUR[1]]);
    const fourNamed = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...LIVE_FOUR]);
    const leftoverPrepIntake = mergePartyPrepIntoCreateSubmitText(fourNamed, [
      LIVE_FOUR[0],
      LIVE_FOUR[1],
    ]);
    const corpus = buildLeftoverOverlayFourPartyRepeatedOrgCorpus(LIVE_FOUR);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(corpus).toMatch(/\[ORG_1\]/);
    expect(corpus).toMatch(/\[ORG_2\]/);
    expect((corpus.match(/\[ORG_1\]/g) || []).length).toBeGreaterThan(8);
    const leftoverFatals = analyzeTemplatePlaceholderFragments(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
    }).filter((d) => d.fatal);
    expect(leftoverFatals.length).toBeGreaterThan(48);
    expect(leftoverFatals.some((d) => /\[ORG_[12]\]/i.test(d.token))).toBe(true);
    expect(extractAuthoritativeLegalNamesFromCommercialCorpus(corpus)).toEqual(
      expect.arrayContaining([...LIVE_FOUR]),
    );

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: leftoverPrepIntake,
      partyNames: liveRejectPartyNames(leftover),
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const freeze = resolvePaidProFreezeCommitText({
      text: corpus,
      source: "server_full_draft",
      draft: leftover,
      intakeText: leftoverPrepIntake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_FOUR) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    expect(
      shouldAcceptPaidProCommercialFieldStubsAfterPfd200({
        text: corpus,
        intakeRaw: leftoverPrepIntake,
      }),
    ).toBe(true);

    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: leftoverPrepIntake,
      corpusPlain: freeze.text || corpus,
    }).map((p) => p.partyLegalName.trim());
    expect(overlay).toHaveLength(4);
    for (const name of LIVE_FOUR) {
      expect(overlay, `overlay dropped ${name}`).toContain(name);
    }

    const consumed = consumeAuthoritativeSignerCount(
      "enforcePaidProSingleExecutionBlock",
      {
        intakeText: leftoverPrepIntake,
        draftPartyNames: leftover.parties.map((p) => p.name),
        draftParties: leftover.parties,
        corpusPlain: corpus,
      },
      leftover.parties.length,
    );
    expect(consumed).toBe(4);

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftover,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: freeze.text || corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[placeholder-reject]"))).toBe(
      false,
    );
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("[signer-count-authority]-mismatch")),
    ).toBe(false);
  });

  it("N=4 live leftover after #202: unused party-prep names bind into [ORG_n] and settle", () => {
    // Live fail on tip 44dea121 / #202: pfd 200 named Solo Design + BrightPay only.
    // [ORG_1]×4 / [ORG_2]×3 remain; CodeNest + Warehouse One never appear in the corpus.
    // Leftover-[ORG_n] accept-when-corpus-names-N≥3 correctly refuses (only 2 named).
    // Slot-index repair maps [ORG_1]→Solo Design (already named) and drops Warehouse One.
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR_UNBOUND[0], LIVE_FOUR_UNBOUND[2]]);
    const intake = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...LIVE_FOUR_UNBOUND]);
    const overlaid = {
      ...leftover,
      parties: LIVE_FOUR_UNBOUND.map((name) => ({ name, role: "party" })),
    };
    const corpus = buildLiveFourPartyUnboundOrgLeftoverCorpus();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(corpus.length).toBeGreaterThanOrEqual(8_500);
    expect((corpus.match(/\[ORG_1\]/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((corpus.match(/\[ORG_2\]/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(corpus).toContain("Solo Design");
    expect(corpus).toContain("BrightPay Ops");
    expect(corpus).not.toContain("CodeNest LLC");
    expect(corpus).not.toContain("Warehouse One Inc");
    expect(extractAuthoritativeLegalNamesFromCommercialCorpus(corpus).length).toBeLessThan(3);

    const tipReject = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: liveRejectPartyNames(overlaid),
    });
    expect(tipReject.ok, "tip 44dea121 must still refuse unbound leftover [ORG_n]").toBe(false);
    expect(tipReject.reasons.some((r) => /\[ORG_[12]\]/.test(r))).toBe(true);

    const tipSlotIndexOnly = repairKnownPartyPlaceholders(
      corpus,
      [LIVE_FOUR_UNBOUND[0], LIVE_FOUR_UNBOUND[2]],
      "",
    );
    expect(tipSlotIndexOnly.text).not.toContain("CodeNest LLC");
    expect(tipSlotIndexOnly.text).not.toContain("Warehouse One Inc");

    const slotIndexTip = repairKnownPartyPlaceholders(
      corpus,
      [LIVE_FOUR_UNBOUND[0], LIVE_FOUR_UNBOUND[2]],
      intake,
    );
    // Without unused-name bind, leftover 2-slot mapping cannot surface CodeNest + Warehouse.
    // After the fix, Party N: lines on intake still bind those unused filled names.
    expect(slotIndexTip.text).toContain("CodeNest LLC");
    expect(slotIndexTip.text).toContain("Warehouse One Inc");
    expect(slotIndexTip.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);

    const bindOnly = bindUnusedFilledPartyNamesIntoLeftoverOrgSlots(
      corpus,
      [...LIVE_FOUR_UNBOUND],
      intake,
    );
    expect(bindOnly.bound).toBe(true);
    expect(bindOnly.unusedNamesBound).toEqual(["CodeNest LLC", "Warehouse One Inc"]);
    for (const name of LIVE_FOUR_UNBOUND) {
      expect(bindOnly.text, `bind dropped ${name}`).toContain(name);
    }
    expect(bindOnly.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);

    const acc = rejectPremiumBodyForProRender(bindOnly.text, {
      intakeText: intake,
      partyNames: [...LIVE_FOUR_UNBOUND],
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: [...LIVE_FOUR_UNBOUND],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);
    for (const name of LIVE_FOUR_UNBOUND) {
      expect(fin.text, `finalize dropped ${name}`).toContain(name);
    }
    expect(fin.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);

    const freeze = resolvePaidProFreezeCommitText({
      text: bindOnly.text,
      source: "server_full_draft",
      draft: overlaid,
      intakeText: intake,
      surface: "premium_completion_pipeline_accept",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    for (const name of LIVE_FOUR_UNBOUND) {
      expect(freeze.text, `freeze dropped ${name}`).toContain(name);
    }

    const overlay = resolvePartiesForReviewRender({
      draft: leftover,
      intakeText: intake,
      corpusPlain: freeze.text || bindOnly.text,
    }).map((p) => p.partyLegalName.trim());
    expect(overlay).toHaveLength(4);
    for (const name of LIVE_FOUR_UNBOUND) {
      expect(overlay, `overlay dropped ${name}`).toContain(name);
    }

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: freeze.text || bindOnly.text,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftover,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: freeze.text || bindOnly.text,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[placeholder-reject]"))).toBe(
      false,
    );
  });

  it("unresolved leftover [ORG_n] with no remaining filled party name still fail-closes", () => {
    const leftover = leftoverTwoPartyDraft([LIVE_FOUR_UNBOUND[0], LIVE_FOUR_UNBOUND[2]]);
    const intake = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [
      LIVE_FOUR_UNBOUND[0],
      LIVE_FOUR_UNBOUND[2],
    ]);
    const corpus = buildLiveFourPartyUnboundOrgLeftoverCorpus();
    const bind = bindUnusedFilledPartyNamesIntoLeftoverOrgSlots(
      corpus,
      leftover.parties.map((p) => p.name),
      intake,
    );
    expect(bind.bound).toBe(false);
    expect(bind.text).toMatch(/\[ORG_1\]/);
    expect(bind.text).toMatch(/\[ORG_2\]/);
    expect(
      shouldAcceptPaidProCommercialFieldStubsAfterPfd200({
        text: corpus,
        intakeRaw: intake,
      }),
    ).toBe(false);
    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: liveRejectPartyNames(leftover),
    });
    expect(acc.ok).toBe(false);
    expect(acc.reasons.some((r) => /\[ORG_[12]\]/.test(r))).toBe(true);
  });
});
