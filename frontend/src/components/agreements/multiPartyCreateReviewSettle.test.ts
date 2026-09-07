import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { normalizeIntakePartyEditorRows } from "./intakeContractingPartyEditor";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import { shouldFailSafeEmptyAuthorityPreparation } from "./starterMultiPartyProGate";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";
import { extractCleanPremiumParties } from "./premiumCompletionPipeline";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import {
  CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE,
  CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
  CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS,
  CREATE_FLOW_PREPARATION_FAILSAFE_GENERIC_MESSAGE,
  hasFilledPartyPrepForDeclaredCreate,
  mergePartyPrepIntoCreateSubmitText,
  overlayDeclaredPartiesOnDraft,
  resolveCreateFlowPreparationFailsafeMessage,
  resolvePartiesForPremiumGenerateRequest,
  resolvePartyPrepSlotCount,
  shouldDismissCreateOverlaysAfterRejectOrGate,
  shouldDismissHomeCreateTransitionForIntakeRecovery,
  shouldFailClosedCreateAfterRejectOrGate,
  shouldFailClosedGeneratingWithoutPipeline,
  shouldFailClosedInFlightPipelineWithoutCorpus,
  shouldFailCloseCreateAfterPremiumFullDraft,
  hasAuthoritativeCreateReviewBodyForPrepFailsafe,
  isCreatePipelineRejectOrGateDecision,
  isVs01CorpusGateBlockedWithoutSelectedFinal,
  isVs01CorpusGateNonTerminalBlockReason,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSettleProReviewAfterPremiumFullDraft,
  shouldSkipEntitledRewriteForMatchingAcceptedSnapshot,
  withCreatePipelineVs01CorpusGate,
} from "./multiPartyCreateReviewSettle";

const THREE_PARTY_DUMP =
  "Three-party services agreement for $24,000. Governing law: Texas.";
const FOUR_PARTY_DUMP =
  "Need a four-party collaboration agreement for $80k over 12 months covering shared platform ops.";

describe("multi-party create → review settle or fail-closed", () => {
  it("party-prep expands to 3 and 4 slots for declared dumps (no hard-coded entities)", () => {
    expect(resolvePartyPrepSlotCount(THREE_PARTY_DUMP, 0)).toBe(3);
    expect(resolvePartyPrepSlotCount(FOUR_PARTY_DUMP, 0)).toBe(4);
    expect(normalizeIntakePartyEditorRows([], 3)).toEqual(["", "", ""]);
    expect(normalizeIntakePartyEditorRows([], 4)).toHaveLength(4);
    expect(normalizeIntakePartyEditorRows(["Acme LLC", "Beta Inc"], null)).toEqual([
      "Acme LLC",
      "Beta Inc",
    ]);
  });

  it("merges N named party-prep rows into create submit without inventing names", () => {
    const three = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [
      "Cedar Ridge LLC",
      "Harbor Point Inc",
      "Summit Mesa LP",
    ]);
    expect(three).toMatch(/Party 1: Cedar Ridge LLC/);
    expect(three).toMatch(/Party 3: Summit Mesa LP/);
    expect(three).toContain("$24,000");
    expect(three).not.toMatch(/Redwood|BlueHarbor|LoneStar/);

    const four = mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [
      "North Wind LLC",
      "East Dock Inc",
      "South Pier LP",
      "West Gate Corp",
    ]);
    expect(four).toMatch(/Party 4: West Gate Corp/);
    expect(evaluateIntentionalCreateDraftSubmit(three).action).toBe("proceed");
    expect(evaluateIntentionalCreateDraftSubmit(four).action).toBe("proceed");
  });

  it("unnamed 3-party dump stays capability-blocked until party-prep is filled", () => {
    const blocked = evaluateIntentionalCreateDraftSubmit(THREE_PARTY_DUMP);
    expect(blocked.action).toBe("block_capability");
    if (blocked.action !== "block_capability") return;
    expect(blocked.clarification.kind).toBe("missing_named_parties");
  });

  it("home prepare overlay dismisses for party-prep / fail-closed — not infinite !draft", () => {
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: false,
        intakeClarification: { kind: "missing_named_parties" },
      }),
    ).toBe(true);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: false,
        emptyAuthorityPrepFailSafe: true,
      }),
    ).toBe(true);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: false,
        homeAutoGenerateConsumed: true,
        createFlowPhase: "capturing_input",
      }),
    ).toBe(true);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: true,
        intakeClarification: { kind: "missing_named_parties" },
      }),
    ).toBe(false);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: true,
        hardError: CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE,
      }),
    ).toBe(true);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: true,
        rejectOrGateBlocked: true,
      }),
    ).toBe(true);
  });

  it("fail-closes generating overlay when generate HTTP never starts", () => {
    expect(
      shouldFailClosedGeneratingWithoutPipeline({
        isGenerating: true,
        generatePipelineInFlight: false,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
      }),
    ).toBe(true);
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "generating_draft",
        isGenerating: true,
        hasDraft: true,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
        generatePipelineInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "generating_draft",
        isGenerating: true,
        hasDraft: true,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + 60_000,
        generatePipelineInFlight: true,
      }),
    ).toBe(false);
  });

  it("in-flight generate still fail-closes if no corpus after the pipeline bound", () => {
    expect(
      shouldFailClosedInFlightPipelineWithoutCorpus({
        generatePipelineInFlight: true,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS,
      }),
    ).toBe(true);
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "preparing_review",
        isGenerating: true,
        hasDraft: true,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS,
        generatePipelineInFlight: true,
      }),
    ).toBe(true);
  });

  it("does not skip entitled rewrite when the next intake is a different multi-party deal", () => {
    const prior = "Draft a services agreement between Acme LLC and Beta Inc for $12k. Texas law.";
    const next = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [
      "Cedar Ridge LLC",
      "Harbor Point Inc",
      "Summit Mesa LP",
    ]);
    expect(
      shouldSkipEntitledRewriteForMatchingAcceptedSnapshot({
        incomingIntake: next,
        snapshotIntakeFingerprint: shortIntakeFingerprint(prior),
        hasMatchingAcceptedAuthority: true,
      }),
    ).toBe(false);
    expect(
      shouldSkipEntitledRewriteForMatchingAcceptedSnapshot({
        incomingIntake: prior,
        snapshotIntakeFingerprint: shortIntakeFingerprint(prior),
        hasMatchingAcceptedAuthority: true,
      }),
    ).toBe(true);
  });

  it("filled N≥3 party-prep invokes generate; empty names stay fail-closed", () => {
    const threeRows = ["Cedar Ridge LLC", "Harbor Point Inc", "Summit Mesa LP"];
    const fourRows = ["North Wind LLC", "East Dock Inc", "South Pier LP", "West Gate Corp"];
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: THREE_PARTY_DUMP,
        partyRows: threeRows,
      }),
    ).toBe(true);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: FOUR_PARTY_DUMP,
        partyRows: fourRows,
      }),
    ).toBe(true);
    expect(hasFilledPartyPrepForDeclaredCreate(THREE_PARTY_DUMP, threeRows)).toBe(true);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: THREE_PARTY_DUMP,
        partyRows: ["", "", ""],
      }),
    ).toBe(false);
    expect(hasFilledPartyPrepForDeclaredCreate(THREE_PARTY_DUMP, ["", "", ""])).toBe(false);
    expect(evaluateIntentionalCreateDraftSubmit(THREE_PARTY_DUMP).action).toBe("block_capability");
    expect(
      resolveCreateFlowPreparationFailsafeMessage({
        intakeText: THREE_PARTY_DUMP,
        partyRows: threeRows,
      }),
    ).toBe(CREATE_FLOW_PREPARATION_FAILSAFE_GENERIC_MESSAGE);
    expect(
      resolveCreateFlowPreparationFailsafeMessage({
        intakeText: THREE_PARTY_DUMP,
        partyRows: ["", "", ""],
      }),
    ).toMatch(/Add the party names/);
  });

  it("two-party named intake still invokes generate and is unchanged", () => {
    const two =
      "Consulting agreement between Acme LLC and Beta Corp. Payment: $5,000 per month. Term: 12 months. California law governs.";
    expect(evaluateIntentionalCreateDraftSubmit(two).action).toBe("proceed");
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: two,
        partyRows: ["Acme LLC", "Beta Corp"],
      }),
    ).toBe(true);
    expect(
      shouldSkipEntitledRewriteForMatchingAcceptedSnapshot({
        incomingIntake: two,
        snapshotIntakeFingerprint: shortIntakeFingerprint(two),
        hasMatchingAcceptedAuthority: true,
      }),
    ).toBe(true);
  });

  it("leftover accepted SoT does not skip generate after filled N≥3 party-prep", () => {
    const next = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [
      "Cedar Ridge LLC",
      "Harbor Point Inc",
      "Summit Mesa LP",
    ]);
    expect(
      shouldSkipEntitledRewriteForMatchingAcceptedSnapshot({
        incomingIntake: next,
        snapshotIntakeFingerprint: "",
        hasMatchingAcceptedAuthority: true,
        partyPrepCreateReady: true,
      }),
    ).toBe(false);
    expect(
      shouldSkipEntitledRewriteForMatchingAcceptedSnapshot({
        incomingIntake: "",
        snapshotIntakeFingerprint: "prior-two-party",
        hasMatchingAcceptedAuthority: true,
        partyPrepCreateReady: true,
      }),
    ).toBe(false);
  });

  it("intake wires party-prep merge and generate-HTTP fail-closed on Create", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("mergePartyPrepIntoCreateSubmitText");
    expect(intake).toContain("resolvePartyPrepSlotCount");
    expect(intake).toContain("shouldSkipEntitledRewriteForMatchingAcceptedSnapshot");
    expect(intake).toContain("shouldInvokePremiumGenerateAfterPartyPrepCreate");
    expect(intake).toContain("launchEntitledGenerateAfterFilledPartyPrep");
    expect(intake).toContain("partyPrepCreateReady");
    expect(intake).toContain("premiumGenerateHttpStartedRef");
    expect(intake).toContain("premiumGeneratePathCommittedRef");
    expect(intake).toContain("generatePipelineInFlight");
    expect(intake).toContain('handoffSource: "prep_failsafe_retry"');
    expect(intake).toContain("intakeClarification");
    expect(intake).toContain("emptyAuthorityPrepFailSafe");
    expect(intake).toContain("shouldSettleProReviewAfterPremiumFullDraft");
    expect(intake).toContain("shouldFailClosedCreateAfterRejectOrGate");
    expect(intake).toContain("shouldDismissHomeCreateTransitionForIntakeRecovery");
    expect(intake).toContain("shouldDismissCreateOverlaysAfterRejectOrGate");
    expect(intake).toContain("withCreatePipelineVs01CorpusGate");
    expect(intake).toContain("isVs01CorpusGateBlockedWithoutSelectedFinal");
    expect(intake).toContain("hasAuthoritativeCreateReviewBodyForPrepFailsafe");
    expect(intake).toContain("dismissCreateOverlaysAfterRejectOrGate");
    const vs01AttachIdx = intake.indexOf("withCreatePipelineVs01CorpusGate(result, vs01GateAfterGenerate)");
    const rejectAfterVs01Idx = intake.indexOf("shouldFailClosedCreateAfterRejectOrGate(result)", vs01AttachIdx);
    expect(vs01AttachIdx).toBeGreaterThan(-1);
    expect(rejectAfterVs01Idx).toBeGreaterThan(vs01AttachIdx);
    expect(intake).toContain("overlayDeclaredPartiesOnDraft");
    expect(intake).toContain("CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE");
  });

  it("premium-full-draft 200 + usable corpus settles Review and does not fail-close", () => {
    const corpus = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;
    expect(corpus.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    const ok = {
      winningPremiumBodyText: corpus,
      premiumRenderSource: "server_full_draft" as const,
      staleIntakeOrGeneration: false,
    };
    expect(shouldSettleProReviewAfterPremiumFullDraft(ok)).toBe(true);
    expect(shouldFailCloseCreateAfterPremiumFullDraft(ok)).toBe(false);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: { parties: [] } as never,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
  });

  it("placeholder-reject / corpus-gate dismisses overlays and fail-closes when corpus is not usable", () => {
    const rejected = {
      winningPremiumBodyText: "thin [ORG_1] stub",
      premiumRenderSource: "rejected_paid_corpus" as const,
      proIntentGateMessage: "Unresolved drafting placeholders remain in the Pro agreement.",
    };
    expect(isCreatePipelineRejectOrGateDecision(rejected)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(rejected)).toBe(true);
    expect(shouldSettleProReviewAfterPremiumFullDraft(rejected)).toBe(false);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: false,
      }),
    ).toBe(true);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        hardError: CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE,
      }),
    ).toBe(true);
    expect(CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE).toMatch(/Try again/);
  });

  it("corpus-gate-blocked + no selected-final dismisses overlays and fail-closes", () => {
    const blocked = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: "",
        premiumRenderSource: "premium_generation_retryable",
      },
      { allowed: false, blockReason: "empty_corpus" },
    );
    expect(isVs01CorpusGateNonTerminalBlockReason("premium_corpus_in_progress")).toBe(true);
    expect(isVs01CorpusGateNonTerminalBlockReason("empty_corpus")).toBe(false);
    expect(
      isVs01CorpusGateBlockedWithoutSelectedFinal({
        allowed: false,
        blockReason: "empty_corpus",
        selectedFinal: false,
      }),
    ).toBe(true);
    expect(
      isVs01CorpusGateBlockedWithoutSelectedFinal({
        allowed: false,
        blockReason: "premium_corpus_in_progress",
        selectedFinal: false,
      }),
    ).toBe(false);
    expect(isCreatePipelineRejectOrGateDecision(blocked)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(blocked)).toBe(true);
    expect(shouldSettleProReviewAfterPremiumFullDraft(blocked)).toBe(false);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: false,
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeCreateReviewBodyForPrepFailsafe({
        leftoverBody: true,
        vs01SelectedFinal: false,
      }),
    ).toBe(false);
    expect(
      shouldDismissHomeCreateTransitionForIntakeRecovery({
        isGenerating: true,
        rejectOrGateBlocked: true,
      }),
    ).toBe(true);
  });

  it("commercially usable accepted corpus still settles when vs01 gate is blocked", () => {
    const corpus = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;
    const usableButBlocked = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft" as const,
        staleIntakeOrGeneration: false,
      },
      { allowed: false, blockReason: "missing_signature_block" },
    );
    expect(isCreatePipelineRejectOrGateDecision(usableButBlocked)).toBe(true);
    expect(shouldSettleProReviewAfterPremiumFullDraft(usableButBlocked)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(usableButBlocked)).toBe(false);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: true,
      }),
    ).toBe(true);
  });

  it("usable selected-final still settles Review (confusing / money_vibe class)", () => {
    const corpus = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;
    const selected = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft" as const,
        staleIntakeOrGeneration: false,
      },
      { allowed: true, blockReason: undefined },
    );
    expect(
      isVs01CorpusGateBlockedWithoutSelectedFinal({
        allowed: true,
        blockReason: undefined,
        selectedFinal: true,
      }),
    ).toBe(false);
    expect(shouldSettleProReviewAfterPremiumFullDraft(selected)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(selected)).toBe(false);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: false,
        corpusCommerciallyUsable: true,
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeCreateReviewBodyForPrepFailsafe({
        leftoverBody: true,
        vs01SelectedFinal: true,
      }),
    ).toBe(true);
  });

  it("usable 2-party dump still settles Review even when a gate message is present", () => {
    const corpus = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;
    const twoParty = {
      winningPremiumBodyText: corpus,
      premiumRenderSource: "server_full_draft" as const,
      staleIntakeOrGeneration: false,
      proIntentGateMessage: "Unresolved drafting placeholders remain in the Pro agreement.",
    };
    expect(isCreatePipelineRejectOrGateDecision(twoParty)).toBe(true);
    expect(shouldSettleProReviewAfterPremiumFullDraft(twoParty)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(twoParty)).toBe(false);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: true,
      }),
    ).toBe(true);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: { parties: [] } as never,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
        proIntentGateMessage: twoParty.proIntentGateMessage,
      }),
    ).toBe(false);
  });

  it("503 / empty generate does not settle and uses a clear fail-closed message", () => {
    const empty = {
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable" as const,
    };
    expect(shouldSettleProReviewAfterPremiumFullDraft(empty)).toBe(false);
    expect(shouldFailCloseCreateAfterPremiumFullDraft(empty)).toBe(true);
    expect(CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE).toMatch(/Try again/);
    expect(CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE).not.toMatch(/save your draft/i);
  });

  it("N=3 party-prep names survive leftover 2-party draft into the generate request", () => {
    const threeRows = ["Cedar Ridge LLC", "Harbor Point Inc", "Summit Mesa LP"];
    const leftoverTwo = ["Redwood LLC", "BlueHarbor Inc"];
    const names = resolvePartiesForPremiumGenerateRequest({
      intakeText: THREE_PARTY_DUMP,
      partyRows: threeRows,
      draftPartyNames: leftoverTwo,
    });
    expect(names).toEqual(threeRows);
    const merged = mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, threeRows);
    const cleaned = extractCleanPremiumParties(merged, {
      title: "Services Agreement",
      jurisdiction: "Texas",
      parties: leftoverTwo.map((name) => ({ name, role: "party" })),
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    });
    expect(cleaned.map((p) => p.name)).toEqual(threeRows);
    const overlaid = overlayDeclaredPartiesOnDraft(
      { parties: leftoverTwo.map((name) => ({ name, role: "party" })) },
      names,
    );
    expect(overlaid.parties?.map((p) => p.name)).toEqual(threeRows);
  });

  it("two-party named intake still resolves two parties only", () => {
    const two =
      "Consulting agreement between Acme LLC and Beta Corp. Payment: $5,000 per month. Term: 12 months. California law governs.";
    expect(
      resolvePartiesForPremiumGenerateRequest({
        intakeText: two,
        partyRows: ["Acme LLC", "Beta Corp"],
        draftPartyNames: ["Acme LLC", "Beta Corp"],
      }),
    ).toEqual(["Acme LLC", "Beta Corp"]);
  });
});
