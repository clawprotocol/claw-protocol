/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearAcceptedUnfrozenPremiumDocumentRefs,
  revertAgreementDocumentAwayFromRejectedCorpus,
} from "./commitAuthoritativePremiumDocument";
import { getAuthoritativeAgreementText } from "./authoritativeAgreementDocument";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  hasFrozenPaidProAuthoritativeSnapshot,
  isPaidProSoTEstablishmentFailure,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import {
  clearStaleAcceptedButUnfrozenProCorpus,
  rejectedProCorpusHash,
} from "./paidProStaleAcceptedUnfrozenCorpus";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  latchAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  persistPremiumCompletionSnapshot,
  readPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { resolvePaidProReviewBranchPath } from "./paidProReviewBranchInstrumentation";
import {
  buildTest420MalformedServerDraft,
  TEST420_PRODUCTION_INTAKE,
  test420Draft,
} from "./paidProTest420Fixtures";

function makeRefs(initialDoc = "") {
  return {
    agreementDocumentTextRef: { current: initialDoc },
    agreementDocumentDirtyRef: { current: false },
    hydratedPremiumBodyRef: { current: initialDoc },
    lastPremiumWinningCorpusRef: { current: initialDoc },
    premiumPipelineOutputBodyRef: { current: initialDoc },
    lastPremiumPipelineRenderSourceRef: { current: "server_full_draft" as string | null },
    lastKnownGoodAuthoritativeDraftRef: { current: initialDoc },
  };
}

describe("TEST421 — clear stale accepted-but-unfrozen Pro corpus after structural rejection", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("clears latch, snapshot bodies, authoritative doc, and refs after structural establish failure", () => {
    const rejected = buildTest420MalformedServerDraft();
    const rejectedHash = rejectedProCorpusHash(rejected);
    expect(rejected.length).toBeGreaterThan(5000);
    expect(rejectedHash).toBeTruthy();

    markPaidProPipelineValidationPassed({ text: rejected, source: "server_full_draft" });
    const latchBody =
      rejected.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN
        ? rejected
        : `${rejected}\n\n${"Supplemental clause text. ".repeat(400)}`;
    latchAcceptedServerFullDraftAuthority(latchBody, "server_full_draft");
    expect(getLatchedAcceptedServerFullDraftAuthority()).not.toBeNull();
    if (rejected.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN) {
      expect(getLatchedAcceptedServerFullDraftAuthority()?.hash).toBe(rejectedHash);
    }

    persistPremiumCompletionSnapshot({
      premiumDraft: {
        ...test420Draft(),
        premium_full_document_text: rejected,
        premium_server_full_document_text: rejected,
        premium_render_source: "server_full_document_text",
      },
      premiumParties: test420Draft().parties ?? [],
      recipientCandidates: [],
      premiumReadonlyPlainText: rejected,
      premiumWinningBodyText: rejected,
      premiumAccepted: true,
      acceptedPremiumCanonicalText: rejected,
      acceptedPremiumCanonicalHash: rejectedHash ?? undefined,
      premiumPipelineRenderSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
    });

    const refs = makeRefs(rejected);
    clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: rejected, reason: "test421" });
    clearAcceptedUnfrozenPremiumDocumentRefs(refs);

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(false);
    expect(getLatchedAcceptedServerFullDraftAuthority()).toBeNull();
    expect(getAuthoritativeAgreementText().trim()).toBe("");
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);

    const snap = readPremiumCompletionSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.premiumWinningBodyText).toBeUndefined();
    expect(snap?.premiumReadonlyPlainText).toBeUndefined();
    expect(snap?.acceptedPremiumCanonicalText).toBeUndefined();
    expect(snap?.premiumAccepted).toBe(false);
    expect(snap?.premiumDraft.premium_full_document_text).toBeUndefined();
    expect(snap?.premiumDraft.purpose).toBeTruthy();

    expect(refs.hydratedPremiumBodyRef.current).toBe("");
    expect(refs.lastPremiumWinningCorpusRef.current).toBe("");
    expect(refs.premiumPipelineOutputBodyRef.current).toBe("");

    const branch = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: hasCanonicalReviewCorpusForRender(),
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: false,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: false,
      failedPremiumCorpusActive: true,
      premiumReturnWaitActive: false,
    });
    expect(branch.path).not.toBe("forced_embedded");
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
  });

  it("reverts agreement document to starter plain and does not reuse rejected hash on retry path", () => {
    const rejected = buildTest420MalformedServerDraft();
    const rejectedHash = rejectedProCorpusHash(rejected);
    const starter = "STARTER PREVIEW BODY FOR RETRY";
    const refs = makeRefs(rejected);

    markPaidProPipelineValidationPassed({ text: rejected, source: "server_full_draft" });
    latchAcceptedServerFullDraftAuthority(
      rejected.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN
        ? rejected
        : `${rejected}\n\n${"Supplemental clause text. ".repeat(400)}`,
      "server_full_draft",
    );

    clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: rejected });
    const reverted = revertAgreementDocumentAwayFromRejectedCorpus(refs, rejected, starter);
    expect(reverted.reverted).toBe(true);
    expect(reverted.starterPlain).toBe(starter);
    expect(rejectedProCorpusHash(refs.agreementDocumentTextRef.current)).not.toBe(rejectedHash);
    expect(refs.agreementDocumentTextRef.current).toBe(starter);

    expect(() =>
      establishPaidProSourceOfTruth({
        text: rejected,
        source: "server_full_draft",
        draft: test420Draft(),
        intakeText: TEST420_PRODUCTION_INTAKE,
      }),
    ).toThrow();
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("successful recovery mounts only frozen SoT with hash distinct from rejected acceptance", () => {
    const rejected = buildTest420MalformedServerDraft();
    const rejectedHash = rejectedProCorpusHash(rejected);
    markPaidProPipelineValidationPassed({ text: rejected, source: "server_full_draft" });
    latchAcceptedServerFullDraftAuthority(
      rejected.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN
        ? rejected
        : `${rejected}\n\n${"Supplemental clause text. ".repeat(400)}`,
      "server_full_draft",
    );

    expect(() =>
      establishPaidProSourceOfTruth({
        text: rejected,
        source: "server_full_draft",
        draft: test420Draft(),
        intakeText: TEST420_PRODUCTION_INTAKE,
      }),
    ).toThrow();

    clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: rejected });
    expect(getLatchedAcceptedServerFullDraftAuthority()).toBeNull();
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);

    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(true);
    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThan(4000);

    const sot = getPaidProSourceOfTruthText();
    const sotHash = rejectedProCorpusHash(sot);
    expect(sotHash).not.toBe(rejectedHash);

    const render = resolvePaidProReviewRenderPlain({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
    });
    expect(render.trim().length).toBeGreaterThan(4000);
    expect(rejectedProCorpusHash(render)).not.toBe(rejectedHash);
  });

  it("structural establish failure message is classified for stale corpus cleanup routing", () => {
    const msg = "[paid-pro-section-structure-completeness-blocked] section_structure_completeness_unresolved";
    expect(isPaidProSoTEstablishmentFailure(msg)).toBe(true);

    const serverDraft = buildTest420MalformedServerDraft();
    const validation = validatePaidProOutput({
      text: serverDraft,
      rawIntake: TEST420_PRODUCTION_INTAKE,
      draft: test420Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(true);
  });
});
