/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  assertGuidedVs01SigningHandoffReady,
  buildGuidedSignaturePacketFromManifest,
} from "./guidedDealCompletion/guidedFinalReviewToSigning";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  authorityPartiesToRecipientMetadata,
  buildLivePaidProSignerMetadataAuthority,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resetPaidProCorpusLifecycleDiffForTests } from "./paidProCorpusLifecycleDiff";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { repairBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  evaluatePaidProSigningHandoffReadiness,
  resolvePaidProSigningHandoffPartyManifest,
  resolvePaidProSigningHandoffRecipients,
  resolvePaidProSigningHandoffSignerManifest,
} from "./paidProSigningHandoffAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  buildTest457LiveSuccessPolishDefectsBody,
  TEST457_ALL_PARTIES,
  TEST457_LIVE_INTAKE,
  TEST457_TRANSACTION_TITLE,
  test457BrightPeakFirstDraft,
} from "./paidProTest457Fixtures";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";

function polishTest459ReviewCorpus(body: string): string {
  const joined = repairJoinedTopLevelSectionHeadings(body);
  const notices = repairBareEntityOnlyNoticeStanzas(joined.text);
  const display = preparePaidProReviewDisplayPlain(notices.text);
  return polishProAgreementDisplayLayer(display.text, {
    draft: test457BrightPeakFirstDraft(),
    intakeText: TEST457_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;
}

function buildTest459SignerAuthority() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: TEST440_EVERGREEN,
      recipient2Name: TEST440_ATLAS,
      recipient1Email: "eve.green@evergreen.test",
      recipient2Email: "atlas.signer@atlas.test",
      extraPartyLegalNames: [TEST440_HORIZON, TEST440_BRIGHT_PEAK],
      extraPartyReviewEmails: ["horizon.signer@horizon.test", "brightpeak.signer@brightpeak.test"],
      partySignerNames: ["Eve Green", "Atlas Signer", "Horizon Signer", "BrightPeak Signer"],
      partySignerTitles: ["CEO", "President", "Managing Member", "CEO"],
      partyAddresses: [
        "100 Evergreen Way, Tulsa, OK 74101",
        "200 Atlas Blvd, Dallas, TX 75201",
        "300 Horizon Dr, Denver, CO 80201",
        "400 BrightPeak Ave, Austin, TX 78701",
      ],
    },
    "live_ui",
    {
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
    },
  );
}

function buildTest459ExecutionTail(): string {
  return [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    TEST440_EVERGREEN,
    "By: __________________________",
    "Name: Eve Green",
    "Title: CEO",
    "",
    TEST440_ATLAS,
    "By: __________________________",
    "Name: Atlas Signer",
    "Title: President",
    "",
    TEST440_HORIZON,
    "By: __________________________",
    "Name: Horizon Signer",
    "Title: Managing Member",
    "",
    TEST440_BRIGHT_PEAK,
    "By: __________________________",
    "Name: BrightPeak Signer",
    "Title: CEO",
  ].join("\n");
}

describe("TEST459 — signing handoff from frozen server_full SoT", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    resetPaidProCorpusLifecycleDiffForTests();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("prepare signatures path resolves four recipients without isIndividual throw", () => {
    const draft = test457BrightPeakFirstDraft();
    const polished = polishTest459ReviewCorpus(buildTest457LiveSuccessPolishDefectsBody());
    establishPaidProSourceOfTruth({
      text: polished,
      source: "server_full_draft",
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewSessionId: "gen-test459",
      generationOutcome: "ok",
    });

    const preSignerReview = getPaidProSourceOfTruthText();
    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: preSignerReview,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const authority = buildTest459SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST457_LIVE_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
    });
    const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata,
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: TEST457_LIVE_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const postSignerReview = resolvePaidProPostFinalizeReviewPlain(draft);
    expect(postSignerReview).toContain(TEST457_TRANSACTION_TITLE);
    expect(postSignerReview.slice(0, 2_500)).toBe(preSignerReview.slice(0, 2_500));
    expect(countPaidProExecutionBlocks(postSignerReview)).toBe(1);

    const emptyUiManifest = { parties: [] as typeof partyManifest.parties };
    const handoffManifest = resolvePaidProSigningHandoffPartyManifest({
      fallbackManifest: emptyUiManifest,
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
    });
    expect(handoffManifest.parties).toHaveLength(4);

    const readiness = evaluatePaidProSigningHandoffReadiness({
      manifest: emptyUiManifest,
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
      requiredPartyCount: 4,
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.recipients).toHaveLength(4);

    const recipients = resolvePaidProSigningHandoffRecipients({
      manifest: emptyUiManifest,
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
    });
    expect(recipients).toHaveLength(4);
    for (const recipient of recipients) {
      expect(recipient.partyLegalName.length).toBeGreaterThan(2);
      expect(recipient.signerName.length).toBeGreaterThan(1);
      expect(recipient.signerTitle.length).toBeGreaterThan(1);
      expect(recipient.email).toMatch(/@/);
      expect(recipient.address.length).toBeGreaterThan(8);
      expect(recipient.isIndividual).toBe(false);
    }

    expect(() =>
      buildGuidedSignaturePacketFromManifest(handoffManifest, true),
    ).not.toThrow();

    const signerPacket = resolvePaidProSigningHandoffSignerManifest({
      manifest: emptyUiManifest,
      signFirst: true,
      intakeText: TEST457_LIVE_INTAKE,
      draftPartyNames: TEST457_ALL_PARTIES,
    });
    expect(signerPacket.entries).toHaveLength(4);

    const corpusBody =
      postSignerReview.length >= GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN
        ? postSignerReview
        : `${postSignerReview}\n${"Operative clause padding.\n".repeat(400)}${buildTest459ExecutionTail()}`;

    expect(() =>
      assertGuidedVs01SigningHandoffReady({
        manifest: emptyUiManifest,
        corpusSource: "finalized_signer_applied_guided_corpus",
        corpusBody,
        intakeText: TEST457_LIVE_INTAKE,
      }),
    ).not.toThrow();

    const handoffAssert = assertGuidedVs01SigningHandoffReady({
      manifest: handoffManifest,
      corpusSource: "finalized_signer_applied_guided_corpus",
      corpusBody,
      intakeText: TEST457_LIVE_INTAKE,
    });
    expect(handoffAssert.ok).toBe(true);

    expect(countOperativeIfToNoticeStanzas(postSignerReview)).toBe(4);
    expect(postSignerReview).not.toMatch(/impact\.11\.\s+Assignment/i);
    expect(postSignerReview).not.toMatch(/venue11\.\d/i);
  });

  it("empty manifest handoff gate returns blocker instead of throwing", () => {
    expect(() =>
      assertGuidedVs01SigningHandoffReady({
        manifest: { parties: [] },
        corpusSource: "finalized_signer_applied_guided_corpus",
        corpusBody: `${"X".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 100)}\n${buildTest459ExecutionTail()}`,
        intakeText: TEST457_LIVE_INTAKE,
      }),
    ).not.toThrow();
    const blocked = assertGuidedVs01SigningHandoffReady({
      manifest: { parties: [] },
      corpusSource: "finalized_signer_applied_guided_corpus",
      corpusBody: `${"X".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 100)}\n${buildTest459ExecutionTail()}`,
      intakeText: TEST457_LIVE_INTAKE,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("manifest_party_rows_missing");
  });
});
