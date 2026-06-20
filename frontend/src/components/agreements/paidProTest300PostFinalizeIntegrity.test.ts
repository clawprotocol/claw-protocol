import { beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
import {
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  auditPaidProPostFinalizeHydrationInvariant,
  canProceedPaidProReviewFirstHandoffAfterFinalize,
  resolvePaidProPostFinalizeReviewHash,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

const FREEZE_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  `PARTY: ${BLUE}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
  "Date: _____________________________",
  "",
  `PARTY: ${IRON}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
  "Date: _____________________________",
].join("\n");

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "sm9876@gmail.com",
    recipient2Email: "ivs34@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124, Koe, OH 98024", "23 Ost Avenue, Ute, Utah, 01293"],
  });
}

function armFinalizeSnapshot() {
  armSoT();
  const authority = qaAuthority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: FREEZE_BODY,
    authority,
    intakeRaw: "",
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  return readAuthoritativeSigningCorpus();
}

function armSoT() {
  establishPaidProSourceOfTruth({
    text: FREEZE_BODY,
    source: "server_full_draft",
    intakeText: "consulting between Blue Canyon and Iron Vale",
  });
  const snap = buildCanonicalAgreementSnapshot({
    surface: "test300",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: FREEZE_BODY }],
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
    minLen: 500,
  });
  freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");
}

describe("Test300 post-finalize signer metadata/action integrity", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("review document contains hydrated Sarah Mitchell and Michael Torres metadata", () => {
    armFinalizeSnapshot();
    const reviewPlain = resolvePaidProReviewRenderPlain();
    expect(reviewPlain).toMatch(/Name:\s*Sarah Mitchell/i);
    expect(reviewPlain).toMatch(/Name:\s*Michael Torres/i);
    expect(reviewPlain).toMatch(/Title:\s*CEO/i);
    expect(reviewPlain).toMatch(/Title:\s*President/i);
    expect(reviewPlain).toMatch(/sm9876@gmail\.com/i);
    expect(reviewPlain).toMatch(/ivs34@me\.com/i);
    expect(reviewPlain).toMatch(/1027 S\. Rainbow Blvd/i);
    expect(reviewPlain).toMatch(/23 Ost Avenue/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(reviewPlain)).toBe(0);
  });

  it("copy/export/edit/review surfaces share the same hydrated snapshot hash", () => {
    armFinalizeSnapshot();
    const lockedHash = resolvePaidProPostFinalizeReviewHash();
    const copyHash = hashPaidProCorpus(getPaidProDocumentForSurface("copy")?.text ?? "");
    const reviewHash = hashPaidProCorpus(resolvePaidProReviewRenderPlain());
    const exportHash = hashPaidProCorpus(getPaidProDocumentForSurface("finalized")?.text ?? "");
    const authorityHash = hashPaidProCorpus(resolveAuthoritativePaidProReviewPlain());
    expect(lockedHash).toBeTruthy();
    expect(copyHash).toBe(lockedHash);
    expect(reviewHash).toBe(lockedHash);
    expect(exportHash).toBe(lockedHash);
    expect(authorityHash).toBe(lockedHash);
  });

  it("paid-pro-review-sot-parity accepts signer-field-only delta with zero blank signer lines", () => {
    armFinalizeSnapshot();
    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain: resolvePaidProPostFinalizeReviewPlain(),
      surface: "test300_parity",
    });
    expect(parity.blankSignerLinesRemaining).toBe(0);
    expect(parity.signerFieldOnlyDelta || parity.invariantOk).toBe(true);
    expect(parity.invariantOk).toBe(true);
  });

  it("review-first-click canProceed is true after signer metadata finalize", () => {
    armFinalizeSnapshot();
    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(
      canProceedPaidProReviewFirstHandoffAfterFinalize({
        signersComplete: true,
        reviewPlain,
      }),
    ).toBe(true);
  });

  it("blocks hydration invariant when metadata complete but signer lines remain blank", () => {
    armFinalizeSnapshot();
    const authority = qaAuthority();
    const audit = auditPaidProPostFinalizeHydrationInvariant({
      reviewPlain: FREEZE_BODY,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    });
    expect(audit.metadataComplete).toBe(true);
    expect(audit.blankSignerLinesRemaining).toBeGreaterThan(0);
    expect(audit.blocked).toBe(true);
  });

  it("resolvePaidProPostFinalizeReviewPlain returns snapshot verbatim without sanitizer drift", () => {
    const snapshotPlain = armFinalizeSnapshot();
    const locked = resolvePaidProPostFinalizeReviewPlain();
    expect(hashPaidProCorpus(locked)).toBe(hashPaidProCorpus(snapshotPlain));
    expect(locked).toBe(readAuthoritativeSigningCorpus());
  });
});
