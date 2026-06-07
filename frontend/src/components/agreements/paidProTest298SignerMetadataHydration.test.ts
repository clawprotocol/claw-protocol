import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { freezeCanonicalAgreementSnapshot, clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  assertPaidProSignerFinalizeNoSubstantiveClauseDrift,
  auditPaidProCorpusLifecycleFromCheckpoint,
  classifyPaidProCorpusLifecycleDiff,
  recordPaidProCorpusLifecycleCheckpoint,
  resetPaidProCorpusLifecycleDiffForTests,
} from "./paidProCorpusLifecycleDiff";
import {
  hydratePaidProExecutionBlockWithSignerMetadata,
  logPaidProReviewActionsVisible,
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
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ivan Vee"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "138 Main St."],
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
    surface: "test298",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: FREEZE_BODY }],
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
    minLen: 500,
  });
  freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");
  recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
}

describe("Test298 paid Pro signer metadata finalize + review actions", () => {
  beforeEach(() => {
    resetPaidProCorpusLifecycleDiffForTests();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("completing signer fields hydrates Name/Title/Email/Address in PARTY: inline execution blocks", () => {
    const authority = qaAuthority();
    const recipientMeta = authorityPartiesToRecipientMetadata(authority.parties);
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(FREEZE_BODY, recipientMeta);
    expect(hydrated.applied).toBe(true);
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Ivan Vee/i);
    expect(hydrated.corpus).toMatch(/Title:\s*Member/i);
    expect(hydrated.corpus).toMatch(/Title:\s*Manager/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*ivee23@me\.com/i);
    expect(hydrated.corpus).toMatch(/Address for Notice:\s*1027 S\. Rainbow Blvd\./i);
    expect(hydrated.corpus).toMatch(/Address for Notice:\s*138 Main St\./i);
    expect(hydrated.corpus).toMatch(new RegExp(`PARTY:\\s*${BLUE.replace(/\./g, "\\.")}`, "i"));
    expect(hydrated.corpus).not.toMatch(/Name:\s*_{4,}/);
  });

  it("copy agreement includes hydrated signer metadata", () => {
    armSoT();
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test298_copy",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const copyDoc = getPaidProDocumentForSurface("copy");
    expect(copyDoc?.signerMetadataApplied).toBe(true);
    expect(copyDoc?.text).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(copyDoc?.text).toMatch(/Email for Notice:\s*ivee23@me\.com/i);
  });

  it("review track receives hydrated signer metadata", () => {
    armSoT();
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const reviewPlain = resolvePaidProReviewRenderPlain();
    expect(reviewPlain).toMatch(/Name:\s*Ivan Vee/i);
    expect(reviewPlain).toMatch(/Address for Notice:\s*138 Main St\./i);
  });

  it("signature prep receives hydrated signer metadata", () => {
    armSoT();
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test298_signature_prep",
      signatureRegionOnly: true,
    });
    writeSigningSnapshot(hydrated.corpus, authority);
    const prepDoc = getPaidProDocumentForSurface("finalized");
    expect(prepDoc?.signerMetadataApplied).toBe(true);
    expect(prepDoc?.text).toMatch(/Title:\s*Manager/i);
  });

  it("does not create a duplicate execution block after hydration", () => {
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test298_execution_invariant",
      signatureRegionOnly: true,
    });
    const invariant = analyzePaidProExecutionBlockInvariant(hydrated.corpus);
    expect(invariant.executionBlockCount).toBe(1);
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.ok).toBe(true);
  });

  it("renders Copy agreement and Edit agreement on forced first Pro review chrome", () => {
    const chromeSrc = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(chromeSrc).toContain("PremiumAgreementCopyButton");
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-copy-agreement"');
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-edit-agreement"');
    expect(chromeSrc).toContain("Edit agreement text");
    expect(PaidProForcedFirstReviewChrome.name).toBe("PaidProForcedFirstReviewChrome");
    expect(typeof logPaidProReviewActionsVisible).toBe("function");
  });

  it("wires Edit agreement on forced first review before track choice", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("onEditAgreement={() => void openPaidProDraftCardEditor()}");
    expect(intakeSrc).toContain("simpleProFinalReviewDisplayPlain || displayPolishedPaidProPlain");
    expect(intakeSrc).toContain("onExportAgreement={() => void handleSimpleProFinalReviewExport()}");
  });

  it("signer finalize does not substantively shrink canonical freeze corpus", () => {
    armSoT();
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    });
    expect(hydrated.rejected).toBe(false);
    const classification = classifyPaidProCorpusLifecycleDiff(FREEZE_BODY, hydrated.corpus);
    expect(classification).toBe("signer_metadata_only");
    assertPaidProSignerFinalizeNoSubstantiveClauseDrift(FREEZE_BODY, hydrated.corpus);
    expect(FREEZE_BODY.slice(0, FREEZE_BODY.indexOf("IN WITNESS"))).toBe(
      hydrated.corpus.slice(0, hydrated.corpus.indexOf("IN WITNESS")),
    );
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).not.toMatch(/Name:\s*_{4,}/);
    expect(Math.abs(hydrated.corpus.length - FREEZE_BODY.length)).toBeLessThan(250);
    const diff = auditPaidProCorpusLifecycleFromCheckpoint({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      afterText: hydrated.corpus,
    });
    expect(diff?.substantiveClauseDelta).toBe(false);
    expect(diff?.executionBlockCountAfter).toBe(1);
  });
});
