/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { hydratePaidProExecutionBlockWithSignerMetadata } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { repairExecutionBlockEntityHeadingLines } from "./paidProExecutionBlockEntityHeading";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { auditExecutionBlockDisplayIntegrity } from "./paidProExecutionBlockEntityHeading";
import { buildReviewFirstDocumentDisplayHtml } from "../../agreement/reviewFirstDocumentDisplay";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";
const POLLUTED_PARTY_2 = `${HARBOR_PEAK}, Oklahoma law governs`;
const GOVERNING_LAW_CLAUSE =
  "This Agreement shall be governed by the laws of Oklahoma, without regard to conflict-of-law principles.";

function starterCorpusWithPollutedExecutionBlock(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement ("Agreement") is between ${RED_MESA} ("party") and ${POLLUTED_PARTY_2} ("party").`,
    `${RED_MESA} and ${POLLUTED_PARTY_2} (collectively, the "Parties").`,
    "",
    "1. Services. Provider shall perform data workflow services.",
    "2. Payment. Client shall pay within fifteen (15) days.",
    "3. Term. This Agreement continues until completion.",
    "4. Governing Law.",
    GOVERNING_LAW_CLAUSE,
    "",
    ...Array.from({ length: 6 }, (_, i) => `${i + 5}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY: ${RED_MESA}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    `PARTY: ${POLLUTED_PARTY_2}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

function executionTail(corpus: string): string {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  return witnessIdx >= 0 ? corpus.slice(witnessIdx) : corpus.slice(Math.floor(corpus.length * 0.65));
}

function harborPeakAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED_MESA,
    recipient2Name: HARBOR_PEAK,
    recipient1Email: "client@example.com",
    recipient2Email: "provider@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sam Canyon", "Dana Vale"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["", ""],
  });
}

describe("paidProExecutionBlockJurisdictionPollutionRegression", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("repairs inline PARTY execution header from jurisdiction-polluted corpus using signer authority", () => {
    const raw = starterCorpusWithPollutedExecutionBlock();
    const authority = harborPeakAuthority();
    const repaired = repairExecutionBlockEntityHeadingLines(raw, authority.parties);
    expect(repaired.text).toMatch(new RegExp(`PARTY:\\s*${HARBOR_PEAK.replace(/\./g, "\\.")}`, "i"));
    expect(repaired.text).not.toMatch(/PARTY:.*Oklahoma law governs/i);
    expect(repaired.text).toContain(GOVERNING_LAW_CLAUSE);
    expect(countPaidProExecutionBlocks(repaired.text)).toBe(1);
  });

  it("finalized review corpus repairs execution block party header while preserving governing law clause", () => {
    const raw = starterCorpusWithPollutedExecutionBlock();
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });
    const authority = harborPeakAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw,
      authority,
      intakeRaw: `between ${RED_MESA} and ${HARBOR_PEAK}. Oklahoma law governs.`,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });

    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    const execTail = executionTail(hydrated.corpus);
    expect(execTail).toMatch(/Harbor Peak Automation/i);
    expect(execTail).not.toMatch(/Oklahoma law governs/i);
    expect(hydrated.corpus).toContain(GOVERNING_LAW_CLAUSE);
    expect(hydrated.corpus).toMatch(/shall be governed by the laws of Oklahoma/i);

    const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
    expect(signerMetadata.recipient2Name).toBe(HARBOR_PEAK);

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata,
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
        intakeText: `between ${RED_MESA} and ${HARBOR_PEAK}`,
      }),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
    });

    const snapshot = readAuthoritativeSigningCorpus();
    expect(executionTail(snapshot)).toMatch(/Harbor Peak Automation/i);
    expect(executionTail(snapshot)).not.toMatch(/Oklahoma law governs/i);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(executionTail(reviewPlain)).toMatch(/Harbor Peak Automation/i);
    expect(executionTail(reviewPlain)).not.toMatch(/Oklahoma law governs/i);
    expect(reviewPlain).toContain(GOVERNING_LAW_CLAUSE);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

    const integrity = auditExecutionBlockDisplayIntegrity({
      text: hydrated.corpus,
      signerMetadata,
      parties: authority.parties,
    });
    expect(integrity.executionBlockCount).toBe(1);
    expect(integrity.executionHeadingMetadataLeak).toBe(false);
  });

  it("hydrate repairs polluted PARTY header and uses manual correction over extracted value", () => {
    const raw = starterCorpusWithPollutedExecutionBlock();
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: "Harbor Peak Automation",
      recipient1Email: "client@example.com",
      recipient2Email: "provider@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Sam Canyon", "Dana Vale"],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""],
    });
    const recipientMeta = authorityPartiesToRecipientMetadata(authority.parties);
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(raw, recipientMeta);
    const tail = executionTail(hydrated.corpus);
    expect(tail).toMatch(/Harbor Peak Automation\b/i);
    expect(tail).not.toMatch(/Oklahoma law governs/i);
    expect(hydrated.corpus).toContain(GOVERNING_LAW_CLAUSE);
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
  });

  it("recipient review display uses sanitized legal entity in execution block", () => {
    const raw = starterCorpusWithPollutedExecutionBlock();
    const authority = harborPeakAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const repaired = repairExecutionBlockEntityHeadingLines(raw, authority.parties);
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: repaired.text,
      surface: "reviewer",
    });
    expect(repaired.text).toContain(GOVERNING_LAW_CLAUSE);
    expect(html).toMatch(/Harbor Peak Automation/i);
    expect(executionTail(html)).not.toMatch(/Oklahoma law governs/i);
  });
});
