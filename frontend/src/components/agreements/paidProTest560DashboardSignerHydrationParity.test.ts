/** @vitest-environment jsdom */
/**
 * TEST560 — dashboard/user paid-Pro create flow must hydrate finalized signer metadata
 * through the SAME canonical post-finalize surface as the first-time-user flow.
 *
 * Live symptom: after "Finalize signer details and continue to review decision", handoff carries
 * name/title/email/address 4/4, but the rendered corpus still shows notice placeholders
 * ("Email: provided during signer setup" / "Address: provided during signer setup") and blank
 * execution Name/Title lines, and the next-step buttons look non-actionable.
 *
 * This regression drives the exact four-party production identities (Redwood / Summit / Blue Harbor /
 * Iron Gate → Emily Carter / Daniel Brooks / Sophia Martinez / Michael Reynolds) through the shared
 * canonical modules — establishPaidProSourceOfTruth → resolvePaidProSignerFinalizeRawCorpus →
 * buildHydratedAuthoritativeSigningCorpusFromAuthority → createAuthoritativeSigningSnapshot →
 * resolvePaidProPostFinalizeReviewPlain — and asserts the finalized display is fully hydrated while
 * the frozen signing snapshot stays byte-identical to the SoT (no parallel flow, no snapshot mutation).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
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
import {
  countOperativeIfToNoticeStanzas,
  repairBareEntityOnlyNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  auditPaidProPostFinalizeHydrationInvariant,
  canProceedPaidProReviewFirstHandoffAfterFinalize,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
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

// Exact production four-party identities from the live TEST560 dashboard-create session.
const T560_REDWOOD = "Redwood Biologics Inc";
const T560_SUMMIT = "Summit AI Consulting LLC";
const T560_BLUE_HARBOR = "Blue Harbor Systems LLC";
const T560_IRON_GATE = "Iron Gate Security LLC";
const T560_PARTIES = [T560_REDWOOD, T560_SUMMIT, T560_BLUE_HARBOR, T560_IRON_GATE] as const;

const T560_SIGNER_NAMES = ["Emily Carter", "Daniel Brooks", "Sophia Martinez", "Michael Reynolds"] as const;
const T560_SIGNER_TITLES = [
  "Chief Executive Officer",
  "Managing Partner",
  "Director of Implementation",
  "Chief Security Officer",
] as const;
const T560_SIGNER_EMAILS = [
  "emily.carter@redwoodbiologics.com",
  "daniel.brooks@summitaiconsulting.com",
  "sophia.martinez@blueharborsystems.com",
  "michael.reynolds@irongatesecurity.com",
] as const;
const T560_ADDRESSES = [
  "710 Discovery Parkway, Raleigh, NC 27609",
  "1880 Legacy Drive, Plano, TX 75024",
  "210 West Monroe Street, Chicago, IL 60606",
  "8300 Greensboro Drive, McLean, VA 22102",
] as const;

// Rename the proven substantive TEST457 four-party corpus onto the TEST560 identities so the
// regression exercises the exact production names without forking the corpus builder.
const T560_RENAME: ReadonlyArray<readonly [string, string]> = [
  [TEST440_EVERGREEN, T560_REDWOOD],
  [TEST440_ATLAS, T560_SUMMIT],
  [TEST440_HORIZON, T560_BLUE_HARBOR],
  [TEST440_BRIGHT_PEAK, T560_IRON_GATE],
];

function renameToTest560Identities(text: string): string {
  let out = text;
  for (const [from, to] of T560_RENAME) out = out.split(from).join(to);
  return out;
}

// Rename the proven TEST457 intake onto the TEST560 identities so the intake↔corpus structural
// alignment the establishment gate relies on is preserved (only party names change).
const T560_INTAKE = renameToTest560Identities(TEST457_LIVE_INTAKE);

function test560DashboardDraft(): ParsedDraftShape {
  const base = test457BrightPeakFirstDraft();
  return {
    ...base,
    parties: base.parties.map((party) => ({
      ...(party as Record<string, unknown>),
      name: renameToTest560Identities((party as { name: string }).name),
    })) as never,
  };
}

/** Substantive frozen server_full corpus with pre-signer-setup placeholders + blank execution lines. */
function buildTest560FrozenPlaceholderCorpus(rename: boolean): string {
  const raw = buildTest457LiveSuccessPolishDefectsBody();
  const joined = repairJoinedTopLevelSectionHeadings(raw);
  const notices = repairBareEntityOnlyNoticeStanzas(joined.text);
  const display = preparePaidProReviewDisplayPlain(notices.text);
  const polished = polishProAgreementDisplayLayer(display.text, {
    draft: test457BrightPeakFirstDraft(),
    intakeText: TEST457_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;
  return rename ? renameToTest560Identities(polished) : polished;
}

function buildTest560SignerAuthority() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: T560_REDWOOD,
      recipient2Name: T560_SUMMIT,
      recipient1Email: T560_SIGNER_EMAILS[0],
      recipient2Email: T560_SIGNER_EMAILS[1],
      extraPartyLegalNames: [T560_BLUE_HARBOR, T560_IRON_GATE],
      extraPartyReviewEmails: [T560_SIGNER_EMAILS[2], T560_SIGNER_EMAILS[3]],
      partySignerNames: [...T560_SIGNER_NAMES],
      partySignerTitles: [...T560_SIGNER_TITLES],
      partyAddresses: [...T560_ADDRESSES],
    },
    "live_ui",
    {
      intakeText: T560_INTAKE,
      draftPartyNames: [...T560_PARTIES],
    },
  );
}

function reset() {
  resetPaidProPipelineTestIsolation();
  resetPaidProCorpusLifecycleDiffForTests();
  clearPaidProSourceOfTruth();
  clearAuthoritativeSigningSnapshot();
  clearPaidProPinnedSignerAppliedCorpus();
  clearConsumedPaidProSignerMetadataAuthority();
}

describe("TEST560 — dashboard paid-Pro signer hydration parity with first-time-user flow", () => {
  beforeEach(reset);
  afterEach(reset);

  it("dashboard finalize hydrates notices + execution 4/4 and enables next-step actions", () => {
    const draft = test560DashboardDraft();

    // server_full_draft accepted → SoT established (dashboard-create review session).
    const frozen = buildTest560FrozenPlaceholderCorpus(true);
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      draft,
      intakeText: T560_INTAKE,
      reviewSessionId: "review-test560-dashboard",
      generationOutcome: "ok",
    });

    const preSignerReview = getPaidProSourceOfTruthText();
    expect(preSignerReview.length).toBeGreaterThan(20_000);
    expect(preSignerReview).toContain(TEST457_TRANSACTION_TITLE);
    // Pre-finalize corpus carries the exact live placeholders + blank execution lines.
    expect(preSignerReview).toMatch(/provided during signer setup/i);
    for (const party of T560_PARTIES) expect(preSignerReview).toContain(party);

    // Signer metadata prefilled/edited across all four parties.
    const authority = buildTest560SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);

    // Handoff (recipient metadata) has name/title/email/address 4/4. Party order follows the draft,
    // so assert each signer is bound to the correct legal entity (order-independent).
    const expectedByLegalName = new Map<
      string,
      { signerName: string; signerTitle: string; signerEmail: string; partyAddress: string }
    >(
      T560_PARTIES.map((legalName, i) => [
        legalName as string,
        {
          signerName: T560_SIGNER_NAMES[i],
          signerTitle: T560_SIGNER_TITLES[i],
          signerEmail: T560_SIGNER_EMAILS[i],
          partyAddress: T560_ADDRESSES[i],
        },
      ]),
    );
    expect(authority.parties).toHaveLength(4);
    for (const party of authority.parties) {
      const expected = expectedByLegalName.get(party.partyLegalName);
      expect(expected, `unexpected party legal name: ${party.partyLegalName}`).toBeTruthy();
      expect(party.signerName).toBe(expected!.signerName);
      expect(party.signerTitle).toBe(expected!.signerTitle);
      expect(party.signerEmail).toBe(expected!.signerEmail);
      expect(party.partyAddress).toBe(expected!.partyAddress);
    }
    expect(new Set(authority.parties.map((p) => p.partyLegalName))).toEqual(new Set(T560_PARTIES));
    const recipientMetadata = authorityPartiesToRecipientMetadata(authority.parties);
    expect(recipientMetadata.partySignerNames.filter(Boolean)).toHaveLength(4);
    expect(recipientMetadata.partySignerTitles.filter(Boolean)).toHaveLength(4);
    expect(recipientMetadata.partyAddresses.filter(Boolean)).toHaveLength(4);

    // Canonical finalize → hydrated signing corpus → immutable signing snapshot (frozen SoT preserved).
    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: preSignerReview,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: T560_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: T560_INTAKE,
      draftPartyNames: [...T560_PARTIES],
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: recipientMetadata,
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: T560_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    // Frozen signing snapshot stays byte-identical to the SoT (no snapshot mutation, first-time-user parity).
    expect(getAuthoritativeSigningSnapshot()?.corpus).toBe(preSignerReview);
    expect(getPaidProSourceOfTruthText()).toBe(preSignerReview);

    // Displayed review/signing corpus is fully hydrated for all four parties.
    const postSignerReview = resolvePaidProPostFinalizeReviewPlain(draft);
    expect(postSignerReview).not.toMatch(/provided during signer setup/i);
    expect(countOperativeIfToNoticeStanzas(postSignerReview)).toBe(4);
    expect(countPaidProExecutionBlocks(postSignerReview)).toBe(1);
    for (let i = 0; i < 4; i += 1) {
      expect(postSignerReview).toContain(T560_PARTIES[i]);
      expect(postSignerReview).toContain(T560_SIGNER_NAMES[i]);
      expect(postSignerReview).toContain(T560_SIGNER_TITLES[i]);
      expect(postSignerReview).toContain(T560_SIGNER_EMAILS[i]);
      // Address hydrated into notices (street line is sufficient proof).
      expect(postSignerReview).toContain(T560_ADDRESSES[i].split(",")[0]!);
    }
    // No blank execution Name/Title lines remain.
    expect(postSignerReview).toMatch(/Name:\s+Emily Carter/i);
    expect(postSignerReview).toMatch(/Title:\s+Chief Executive Officer/i);

    // Next-step buttons actionable: hydration invariant not blocked, review-first handoff can proceed.
    const invariant = auditPaidProPostFinalizeHydrationInvariant({
      reviewPlain: postSignerReview,
      signerMetadata: recipientMetadata,
    });
    expect(invariant.metadataComplete).toBe(true);
    expect(invariant.blankSignerLinesRemaining).toBe(0);
    expect(invariant.blocked).toBe(false);
    expect(
      canProceedPaidProReviewFirstHandoffAfterFinalize({
        signersComplete: true,
        reviewPlain: postSignerReview,
      }),
    ).toBe(true);
  });

  it("first-time-user flow (canonical Evergreen four-party) still hydrates 4/4", () => {
    const draft = test457BrightPeakFirstDraft();
    const frozen = buildTest560FrozenPlaceholderCorpus(false);
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewSessionId: "gen-test560-first-time-user",
      generationOutcome: "ok",
    });

    const preSignerReview = getPaidProSourceOfTruthText();
    expect(preSignerReview).toMatch(/provided during signer setup/i);

    const authority = buildLivePaidProSignerMetadataAuthority(
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
      { intakeText: TEST457_LIVE_INTAKE, draftPartyNames: TEST457_ALL_PARTIES },
    );
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: preSignerReview,
      immutableSourceOfTruthOnly: true,
    });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST457_LIVE_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
        intakeText: TEST457_LIVE_INTAKE,
        draftPartyNames: TEST457_ALL_PARTIES,
      }),
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
    expect(postSignerReview).not.toMatch(/provided during signer setup/i);
    expect(countOperativeIfToNoticeStanzas(postSignerReview)).toBe(4);
    expect(postSignerReview).toMatch(/Email:\s+eve\.green@evergreen\.test/i);
    expect(postSignerReview).toMatch(/Name:\s+Eve Green/i);
    expect(
      canProceedPaidProReviewFirstHandoffAfterFinalize({
        signersComplete: true,
        reviewPlain: postSignerReview,
      }),
    ).toBe(true);
  });
});
