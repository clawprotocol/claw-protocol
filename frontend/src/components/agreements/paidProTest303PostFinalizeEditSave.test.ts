/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { commitPaidProPostFinalizeClauseEditRevision } from "./paidProPostFinalizeEditSave";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function buildFreezeBody(paymentDays: string) {
  return [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    `Section 4. Payment. Client shall pay within ${paymentDays} days of invoice.`,
    "",
    ...Array.from({ length: 16 }, (_, i) => `Section ${i + 5}. Operative clause ${i + 1}.`),
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
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "BCA45@me.com",
    recipient2Email: "Huntme45@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["23 Edge St.", "345 Fist Ave."],
  });
}

function armFinalizeSnapshot(hydratedCorpus: string) {
  const authority = qaAuthority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydratedCorpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(hydratedCorpus);
}

describe("Test303 post-finalize edit save preserves signer metadata", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("clause edit save re-hydrates signer metadata and does not clear signing snapshot", () => {
    const freezeBody = buildFreezeBody("thirty (30)");
    establishPaidProSourceOfTruth({
      text: freezeBody,
      source: "server_full_draft",
      intakeText: "consulting between Blue Canyon and Iron Vale",
    });
    const snap = buildCanonicalAgreementSnapshot({
      surface: "test303",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: freezeBody }],
      parties: [
        { name: BLUE, role: "Client" },
        { name: IRON, role: "Service Provider" },
      ],
      minLen: 500,
    });
    freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: freezeBody,
      authority,
      intakeRaw: "",
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus);
    const priorHash = getAuthoritativeSigningSnapshot()?.hash ?? "";
    const priorSoTHash = getPaidProSourceOfTruth()?.hash ?? "";

    const editedClauseBody = hydrated.corpus.replace(
      "thirty (30) days",
      "fifteen (15) days",
    );
    const editedWithBlankSigners = editedClauseBody
      .replace(/Name:\s*Sarah Mitchell/gi, "Name: ________________________________")
      .replace(/Name:\s*Michael Torres/gi, "Name: ________________________________");

    const saved = commitPaidProPostFinalizeClauseEditRevision({
      editedPlain: editedWithBlankSigners,
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.corpus).toMatch(/fifteen \(15\) days/i);
    expect(saved.corpus).toMatch(/Sarah Mitchell/i);
    expect(saved.corpus).toMatch(/Michael Torres/i);
    expect(saved.corpus).toMatch(/CEO/i);
    expect(saved.corpus).toMatch(/President/i);
    expect(saved.corpus).toMatch(/BCA45@me\.com/i);
    expect(saved.corpus).toMatch(/Huntme45@me\.com/i);
    expect(saved.corpus).toMatch(/23 Edge St\./i);
    expect(saved.corpus).toMatch(/345 Fist Ave\./i);
    expect(saved.blankSignerLinesRemaining).toBe(0);
    expect(countBlankSignerMetadataLinesInExecutionBlock(saved.corpus)).toBe(0);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(readAuthoritativeSigningCorpus()).toBe(saved.corpus);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe(saved.corpus);
    expect(getPaidProSourceOfTruth()?.hash).toBe(priorSoTHash);
    expect(saved.corpusHash).not.toBe(priorHash);

    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain: saved.corpus,
      surface: "test303_post_edit",
    });
    expect(parity.blankSignerLinesRemaining).toBe(0);
  });

  it("visible shell stays on post_finalize_hydrated_snapshot_plain after clause edit save", () => {
    const freezeBody = buildFreezeBody("thirty (30)");
    establishPaidProSourceOfTruth({ text: freezeBody, source: "server_full_draft" });
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: freezeBody,
      authority,
      intakeRaw: "",
      surface: "test303_visible",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus);
    const edited = hydrated.corpus.replace("thirty (30) days", "fifteen (15) days");
    const saved = commitPaidProPostFinalizeClauseEditRevision({ editedPlain: edited });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const visible = resolveCanonicalPlainForVisibleShell();
    expect(visible.source).toBe("authoritative_signing_snapshot");
    expect(visible.plain).toMatch(/fifteen \(15\) days/i);
    expect(visible.plain).toMatch(/Sarah Mitchell/i);
    expect(hashPaidProCorpus(visible.plain)).toBe(saved.corpusHash);

    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: freezeBody.length,
      htmlLen: 0,
      canonicalPlainLen: visible.plain.length,
      canonicalPlainSource: visible.source,
    });
    expect(branch.reason).toBe("post_finalize_hydrated_snapshot_plain");
  });

  it("allowShorterOverwrite SoT path clears snapshot; post-finalize save keeps it", () => {
    const freezeBody = buildFreezeBody("thirty (30)");
    establishPaidProSourceOfTruth({ text: freezeBody, source: "server_full_draft" });
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: freezeBody,
      authority,
      intakeRaw: "",
      surface: "test303_bypass",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus);
    const edited = hydrated.corpus.replace("thirty (30) days", "fifteen (15) days");

    establishPaidProSourceOfTruth({ text: edited, allowShorterOverwrite: true });
    expect(hasAuthoritativeSigningSnapshot()).toBe(false);

    armFinalizeSnapshot(
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: freezeBody,
        authority,
        intakeRaw: "",
        surface: "test303_bypass_retry",
        signatureRegionOnly: true,
        repairRecital: false,
      }).corpus,
    );
    const saved = commitPaidProPostFinalizeClauseEditRevision({ editedPlain: edited });
    expect(saved.ok).toBe(true);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe(saved.ok ? saved.corpus : "");
  });
});
