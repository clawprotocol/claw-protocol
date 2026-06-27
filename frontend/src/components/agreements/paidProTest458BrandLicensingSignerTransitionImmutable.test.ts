/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { shouldUseFrozenServerFullSourceOfTruthMinimalHydration } from "./paidProFrozenServerFullSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
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
import {
  repairBareEntityOnlyNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
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

function polishTest458ReviewCorpus(body: string): string {
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

function buildTest458SignerAuthority() {
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

function clauseBodyBeforeWitness(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? text.slice(0, idx).trimEnd() : text.trimEnd();
}

describe("TEST458 — frozen server_full SoT stays immutable through signer transition", () => {
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

  it("signer finalize hydrates metadata only — title, recital, and structure unchanged", () => {
    const draft = test457BrightPeakFirstDraft();
    const polished = polishTest458ReviewCorpus(buildTest457LiveSuccessPolishDefectsBody());
    establishPaidProSourceOfTruth({
      text: polished,
      source: "server_full_draft",
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewSessionId: "gen-test458",
      generationOutcome: "ok",
    });

    const preSignerReview = getPaidProSourceOfTruthText();
    expect(preSignerReview).toContain(TEST457_TRANSACTION_TITLE);
    expect(preSignerReview.length).toBeGreaterThan(20_000);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: preSignerReview,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    expect(shouldUseFrozenServerFullSourceOfTruthMinimalHydration(rawResolution.corpus)).toBe(true);

    const authority = buildTest458SignerAuthority();
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
    expect(hydrated.corpus.slice(0, 2_500)).toBe(preSignerReview.slice(0, 2_500));

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
    expect(postSignerReview).not.toMatch(/^SERVICES AGREEMENT/im);
    expect(clauseBodyBeforeWitness(postSignerReview)).toContain(TEST457_TRANSACTION_TITLE);
    const recitalHead = preSignerReview.slice(0, 2_500);
    const postRecitalHead = postSignerReview.slice(0, 2_500);
    expect(postRecitalHead).toBe(recitalHead);
    expect(postSignerReview).not.toMatch(/impact\.11\.\s+Assignment/i);
    expect(postSignerReview).not.toMatch(/venue11\.\d/i);
    expect(postSignerReview).not.toMatch(/termination\.12\./i);

    for (const party of TEST457_ALL_PARTIES) {
      expect(postSignerReview).toContain(party);
    }

    expect(countOperativeIfToNoticeStanzas(postSignerReview)).toBe(4);
    expect(postSignerReview).toMatch(/(?:Attn|Attention):\s+Eve Green/i);
    expect(postSignerReview).toMatch(/Email:\s+eve\.green@evergreen\.test/i);
    expect(postSignerReview).toMatch(/100 Evergreen Way/i);
    expect(postSignerReview).toMatch(/Tulsa,\s*OK\s+74101/i);

    expect(countPaidProExecutionBlocks(postSignerReview)).toBe(1);
    expect(postSignerReview).toMatch(/Name:\s+Eve Green/i);
    expect(postSignerReview).not.toMatch(
      new RegExp(`${TEST440_EVERGREEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n\\s*${TEST440_EVERGREEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    );
  });
});
