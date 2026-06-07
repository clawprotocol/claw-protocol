import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { freezeCanonicalAgreementSnapshot, clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
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
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
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
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: _____________________________",
  "",
  `PARTY: ${IRON}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
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

function writeSigningSnapshot(corpus: string, authority: ReturnType<typeof qaAuthority>) {
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
}

function armSoT() {
  establishPaidProSourceOfTruth({
    text: FREEZE_BODY,
    source: "server_full_draft",
    intakeText: "consulting between Blue Canyon and Iron Vale",
  });
  const snap = buildCanonicalAgreementSnapshot({
    surface: "test299",
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

describe("Test299 post-finalize review surface hydration + actions", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("captured signer metadata appears in visible final review agreement after snapshot write", () => {
    armSoT();
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const snapshot = readAuthoritativeSigningCorpus();
    expect(snapshot).toMatch(/Name:\s*Sarah Mitchell/i);
    expect(snapshot).toMatch(/Name:\s*Michael Torres/i);
    expect(snapshot).toMatch(/Title:\s*CEO/i);
    expect(snapshot).toMatch(/Title:\s*President/i);
    expect(snapshot).toMatch(/Email for Notice:\s*sm9876@gmail\.com/i);
    expect(snapshot).toMatch(/Email for Notice:\s*ivs34@me\.com/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(snapshot)).toBe(0);
  });

  it("copy agreement includes signer names/titles/emails/addresses", () => {
    armSoT();
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test299_copy",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const copyDoc = getPaidProDocumentForSurface("copy");
    expect(copyDoc?.text).toMatch(/Sarah Mitchell/i);
    expect(copyDoc?.text).toMatch(/Michael Torres/i);
    expect(copyDoc?.text).toMatch(/1027 S\. Rainbow Blvd/i);
    expect(copyDoc?.text).toMatch(/23 Ost Avenue/i);
  });

  it("review track receives hydrated signer metadata", () => {
    armSoT();
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    writeSigningSnapshot(
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: FREEZE_BODY,
        authority,
        intakeRaw: "",
        surface: "test299_review",
        signatureRegionOnly: true,
      }).corpus,
      authority,
    );
    const reviewPlain = resolvePaidProReviewRenderPlain();
    expect(reviewPlain).toMatch(/Sarah Mitchell/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(reviewPlain)).toBe(0);
  });

  it("signature prep receives hydrated signer metadata", () => {
    armSoT();
    const authority = qaAuthority();
    writeSigningSnapshot(
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: FREEZE_BODY,
        authority,
        intakeRaw: "",
        surface: "test299_signature_prep",
        signatureRegionOnly: true,
      }).corpus,
      authority,
    );
    const prepDoc = getPaidProDocumentForSurface("finalized");
    expect(prepDoc?.text).toMatch(/President/i);
    expect(prepDoc?.text).toMatch(/ivs34@me\.com/i);
  });

  it("exactly one execution block remains after snapshot finalize", () => {
    armSoT();
    const authority = qaAuthority();
    writeSigningSnapshot(
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: FREEZE_BODY,
        authority,
        intakeRaw: "",
        surface: "test299_invariant",
        signatureRegionOnly: true,
      }).corpus,
      authority,
    );
    const invariant = analyzePaidProExecutionBlockInvariant(readAuthoritativeSigningCorpus());
    expect(invariant.executionBlockCount).toBe(1);
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.ok).toBe(true);
  });

  it("paid-pro-review-sot-parity accepts signer-field-only delta after finalize", () => {
    armSoT();
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain: readAuthoritativeSigningCorpus(),
      surface: "test299_parity",
    });
    expect(parity.signerFieldOnlyDelta).toBe(true);
    expect(parity.blankSignerLinesRemaining).toBe(0);
    expect(parity.invariantOk).toBe(true);
  });

  it("fails invariant when signer metadata exists but execution block lines remain blank", () => {
    const authority = qaAuthority();
    const meta = authorityPartiesToRecipientMetadata(authority.parties);
    const blank = hydratePaidProExecutionBlockWithSignerMetadata(FREEZE_BODY, {
      ...meta,
      partySignerNames: ["", ""],
      partySignerTitles: ["", ""],
      recipient1Email: "",
      recipient2Email: "",
      partyAddresses: ["", ""],
    });
    expect(countBlankSignerMetadataLinesInExecutionBlock(blank.corpus)).toBeGreaterThan(0);
  });

  it("post-finalize chrome exposes prepare, copy, export, and edit agreement text actions", () => {
    const chromeSrc = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(chromeSrc).toContain("PAID_PRO_PREPARE_ESIGN_DECISION_CTA");
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-copy-agreement"');
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-export-agreement"');
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-edit-agreement"');
    expect(chromeSrc).toContain("Edit agreement text");
    expect(chromeSrc).toContain("Download / export");
    expect(PaidProForcedFirstReviewChrome.name).toBe("PaidProForcedFirstReviewChrome");
  });

  it("intake wires export and hydrated copy plain on forced post-finalize chrome", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("handleSimpleProFinalReviewExport");
    expect(intakeSrc).toContain("simpleProFinalReviewDisplayPlain || displayPolishedPaidProPlain");
    expect(intakeSrc).toContain("onExportAgreement={() => void handleSimpleProFinalReviewExport()}");
    expect(intakeSrc).toContain("paidProSignerSavedMappings");
  });
});
