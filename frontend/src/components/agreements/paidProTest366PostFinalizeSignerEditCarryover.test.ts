import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToLiveSignerMetadataUi,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { beginPaidProPostFinalizeSignerDetailsReopen } from "./paidProPostFinalizeEditSignerDetails";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { PAID_PRO_ACCEPTANCE_WITNESS_LINE } from "./paidProAcceptanceExecutionBlockInvariant";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Harbor Peak Automation LLC";
const RED_ADDRESS = "876 Tussle Ave., Anogram, AZ 91991";
const BLUE_ADDRESS = "897 Hough Rd., Mendoza, CA 91023";
const PARTY1_EMAIL_FIRST = "anthemhayek@me.com";
const PARTY1_EMAIL_SECOND = "corrected.party1@example.test";
const PARTY2_EMAIL = "cryptocurated21@gmail.com";

function buildSoTBody() {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${BLUE} ("Service Provider").`,
    "",
    "Section 4. Payment. Client shall pay fees within thirty (30) days of invoice.",
    "",
    ...Array.from(
      { length: 16 },
      (_, i) =>
        `Section ${i + 5}. Operative clause ${i + 1}. Each party shall perform its obligations in good faith and in accordance with applicable law.`,
    ),
    "",
    PAID_PRO_ACCEPTANCE_WITNESS_LINE,
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${BLUE}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

function firstFinalizeAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: PARTY1_EMAIL_FIRST,
    recipient2Email: PARTY2_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Thomas Bundy", "Nancy Mane"],
    partySignerTitles: ["CEO", "Member"],
    partyAddresses: [RED_ADDRESS, BLUE_ADDRESS],
  });
}

function finalizeSignerMetadataFromAuthority(authority: ReturnType<typeof buildLivePaidProSignerMetadataAuthority>) {
  const rawCorpus = resolvePaidProSignerFinalizeRawCorpus({
    immutableSourceOfTruthOnly: true,
  }).corpus;
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus,
    authority,
    intakeRaw: "",
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  setConsumedPaidProSignerMetadataAuthority(authority);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata,
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    replaceExisting: true,
  });
  setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
  return hydrated.corpus;
}

function expectFullyHydratedReview(text: string, party1Email: string) {
  expect(text).toMatch(/Thomas Bundy/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Nancy Mane/i);
  expect(text).toMatch(/Member/i);
  expect(text).toMatch(new RegExp(party1Email.replace(".", "\\.")));
  expect(text).toMatch(new RegExp(PARTY2_EMAIL.replace(".", "\\.")));
  expect(text).toContain(RED_ADDRESS);
  expect(text).toContain(BLUE_ADDRESS);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect((text.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
}

describe("Test366 post-finalize edit signer details metadata carryover", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    establishPaidProSourceOfTruth({
      text: buildSoTBody(),
      source: "server_full_draft",
      intakeText: "consulting",
    });
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("reopen clears stale pins so finalize uses immutable SoT", () => {
    const first = finalizeSignerMetadataFromAuthority(firstFinalizeAuthority());
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(true);
    expect(first).toMatch(/Thomas Bundy/i);

    beginPaidProPostFinalizeSignerDetailsReopen();
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(false);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe("");

    const hydratedReviewPlain = buildSoTBody().replace(
      /Email for Notice: _+/,
      `Email for Notice: ${PARTY1_EMAIL_FIRST}`,
    );
    const raw = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: hydratedReviewPlain,
      immutableSourceOfTruthOnly: true,
    });
    expect(raw.source).toBe("paid_pro_source_of_truth");
    expect(raw.corpus).toBe(getPaidProSourceOfTruthText());
    expect(raw.corpus).not.toMatch(/Thomas Bundy/i);
  });

  it("finalize hydration overwrites prior email from immutable SoT on re-finalize", () => {
    finalizeSignerMetadataFromAuthority(firstFinalizeAuthority());
    beginPaidProPostFinalizeSignerDetailsReopen();

    const correctedUi = authorityPartiesToLiveSignerMetadataUi(firstFinalizeAuthority().parties);
    correctedUi.recipient1Email = PARTY1_EMAIL_SECOND;
    const correctedAuthority = buildLivePaidProSignerMetadataAuthority(correctedUi);
    expect(correctedAuthority.parties[0]?.signerEmail).toBe(PARTY1_EMAIL_SECOND);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority: correctedAuthority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.corpus).toMatch(/corrected\.party1@example\.test/i);
    expect(hydrated.corpus).not.toMatch(/anthemhayek@me\.com/i);
  });

  it("second finalize after edit_signer_details carries corrected Party 1 email and Party 2 metadata", () => {
    finalizeSignerMetadataFromAuthority(firstFinalizeAuthority());
    beginPaidProPostFinalizeSignerDetailsReopen();

    const correctedUi = authorityPartiesToLiveSignerMetadataUi(firstFinalizeAuthority().parties);
    correctedUi.recipient1Email = PARTY1_EMAIL_SECOND;
    const correctedAuthority = buildLivePaidProSignerMetadataAuthority(correctedUi);

    const secondHydrated = finalizeSignerMetadataFromAuthority(correctedAuthority);
    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();

    expectFullyHydratedReview(reviewPlain, PARTY1_EMAIL_SECOND);
    expectFullyHydratedReview(secondHydrated, PARTY1_EMAIL_SECOND);
    expect(reviewPlain).not.toMatch(new RegExp(PARTY1_EMAIL_FIRST.replace(".", "\\.")));

    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain,
      surface: "test366_second_finalize",
    });
    expect(parity.blankSignerLinesRemaining).toBe(0);
    expect(parity.signerFieldOnlyDelta).toBe(true);
    expect(getAuthoritativeSigningSnapshot()?.signerMetadata.recipient1Email).toBe(PARTY1_EMAIL_SECOND);
  });
});
