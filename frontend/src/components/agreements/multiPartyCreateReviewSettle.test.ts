import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { normalizeIntakePartyEditorRows } from "./intakeContractingPartyEditor";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import { shouldFailSafeEmptyAuthorityPreparation } from "./starterMultiPartyProGate";
import {
  CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
  CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS,
  mergePartyPrepIntoCreateSubmitText,
  resolvePartyPrepSlotCount,
  shouldDismissHomeCreateTransitionForIntakeRecovery,
  shouldFailClosedGeneratingWithoutPipeline,
  shouldFailClosedInFlightPipelineWithoutCorpus,
  shouldSkipEntitledRewriteForMatchingAcceptedSnapshot,
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

  it("intake wires party-prep merge and generate-HTTP fail-closed on Create", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("mergePartyPrepIntoCreateSubmitText");
    expect(intake).toContain("resolvePartyPrepSlotCount");
    expect(intake).toContain("shouldSkipEntitledRewriteForMatchingAcceptedSnapshot");
    expect(intake).toContain("premiumGenerateHttpStartedRef");
    expect(intake).toContain("generatePipelineInFlight");
    expect(intake).toContain('handoffSource: "prep_failsafe_retry"');
    expect(intake).toContain("intakeClarification");
    expect(intake).toContain("emptyAuthorityPrepFailSafe");
  });
});
