import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  resolveProDeliveryTrackCanonicalCorpus,
  shouldBlockStarterRegenerationAfterPaidAuthority,
  shouldIgnoreLatePremiumPipelineResult,
  shouldSuppressPremiumProcessingModalAfterPaidAuthority,
} from "./paidProPostAcceptanceStateGuard";
import { canChooseProDeliveryTrack } from "./proDeliveryTrackState";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  assertNoPostAcceptanceStructuralMutation,
  clearAuthoritativeAgreementDocument,
  establishAuthoritativeAgreementDocument,
  getAuthoritativeAgreementText,
  returnAuthoritativeTextForIllegalPostAcceptanceGeneration,
} from "./authoritativeAgreementDocument";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

/** Substantive post-normalization fixture; hash assertions use established SoT bytes. */
const PAID_BODY = expandOperativeCorpusWithUniqueSupplements(
  SHARED_ACCEPTED_PAID_BODY,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
);

describe("paidProPostAcceptanceStateGuard", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("blocks starter regeneration when paid SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
    expect(shouldSuppressPremiumProcessingModalAfterPaidAuthority()).toBe(true);
  });

  it("delivery track canonical corpus derives from paid SoT when frozen corpus absent", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const corpus = resolveProDeliveryTrackCanonicalCorpus();
    expect(corpus.hasCanonicalCorpus).toBe(true);
    expect(corpus.hash).toBe(record.hash);
    expect(["frozen_canonical", "paid_pro_source_of_truth"]).toContain(corpus.source);
  });

  it("canChooseProDeliveryTrack stays true during recipient_setup_required when SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
  });

  it("review/signer/reviewer hashes stay stable from SoT across recipient_setup_required phase", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const reviewHash = fingerprintAgreementBody(record.text);
    const delivery = resolveProDeliveryTrackCanonicalCorpus();
    expect(delivery.hash).toBe(record.hash);
    expect(reviewHash).toBe(fingerprintAgreementBody(getPaidProSourceOfTruth()?.text ?? ""));
    expect(reviewHash).toBe(record.hash);
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
  });
});

describe("post-acceptance mutation guards (no starter/integrity-repair after paid SoT)", () => {
  afterEach(() => {
    clearAuthoritativeAgreementDocument();
    clearPaidProSourceOfTruth();
  });

  it("preview_starter builder cannot mutate corpus after paid authority (treated as failure)", () => {
    establishAuthoritativeAgreementDocument({ fullCorpusText: PAID_BODY });
    expect(() =>
      returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
        surface: "preview_starter",
        builder: "buildAgreementPreviewText",
        generatedText: "STARTER DRAFT. Red Mesa and Harbor Peak. Short body.",
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);
  });

  it("draft_ready_for_review integrity repair cannot mutate the authoritative corpus", () => {
    establishAuthoritativeAgreementDocument({ fullCorpusText: PAID_BODY });
    expect(() =>
      assertNoPostAcceptanceStructuralMutation({
        surface: "draft_ready_for_review",
        mutation: "integrity_repair",
        inputText: PAID_BODY,
        outputText: `${PAID_BODY} appended integrity repair tail`,
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);
  });

  it("returning the exact authoritative corpus is allowed (no mutation, no throw)", () => {
    establishAuthoritativeAgreementDocument({ fullCorpusText: PAID_BODY });
    expect(
      returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
        surface: "preview_starter",
        builder: "buildAgreementPreviewText",
        generatedText: PAID_BODY,
      }),
    ).toBe(PAID_BODY.trim());
  });

  it("paid Pro corpus hash + len stay stable through signer setup", () => {
    const doc = establishAuthoritativeAgreementDocument({ fullCorpusText: PAID_BODY });
    const beforeHash = doc.authoritativeHash;
    const beforeLen = doc.fullCorpusText.length;
    expect(beforeLen).toBeGreaterThan(10_000);

    // Simulate signer-setup work: gate resolution + edits never touch the corpus.
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["Alex Client", "Priya Provider"],
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "alex@redmesa.test",
      recipient2Email: "priya@harborpeak.test",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);

    const after = getAuthoritativeAgreementText();
    expect(fingerprintAgreementBody(after)).toBe(beforeHash);
    expect(after.length).toBe(beforeLen);
  });
});

describe("first-authoritative-success-wins: ignore late duplicate premium responses", () => {
  it("ignores a later rejected_paid_corpus once an authoritative paid corpus exists", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: true,
        incomingRenderSource: "rejected_paid_corpus",
        incomingBodyLen: 1135,
        acceptedBodyLen: 17657,
      }),
    ).toBe(true);
  });

  it("ignores a later premium_network_retryable / generation retryable response after success", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: true,
        incomingRenderSource: "premium_network_retryable",
        incomingBodyLen: 791,
        acceptedBodyLen: 17657,
      }),
    ).toBe(true);
  });

  it("ignores a later materially shorter degraded body after a full document was accepted", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: true,
        // even with a 'real' render source, a 7881-char downgrade after 17657 must be ignored
        incomingRenderSource: "server_full_draft",
        incomingBodyLen: 7881,
        acceptedBodyLen: 17657,
      }),
    ).toBe(true);
  });

  it("ignores an empty later body after success", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: true,
        incomingRenderSource: "server_full_document_text",
        incomingBodyLen: 0,
        acceptedBodyLen: 17657,
      }),
    ).toBe(true);
  });

  it("does NOT ignore the FIRST authoritative response (no accepted corpus yet)", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: false,
        incomingRenderSource: "server_full_document_text",
        incomingBodyLen: 17657,
        acceptedBodyLen: 0,
      }),
    ).toBe(false);
  });

  it("does NOT ignore a later equal/longer authoritative body (legit re-establish)", () => {
    expect(
      shouldIgnoreLatePremiumPipelineResult({
        hasAcceptedAuthoritativePaidCorpus: true,
        incomingRenderSource: "server_full_document_text",
        incomingBodyLen: 18582,
        acceptedBodyLen: 17657,
      }),
    ).toBe(false);
  });
});

describe("home create submit guard contract", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("paid SoT active implies home auto-generate skip (no starter rebuild)", async () => {
    const { shouldSkipHomeAutoGenerateForStoredReview } = await import("./createReviewRefreshRestore");
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
  });
});
