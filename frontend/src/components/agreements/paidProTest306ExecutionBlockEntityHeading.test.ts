import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
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
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  auditExecutionBlockDisplayIntegrity,
  detectExecutionHeadingMetadataLeak,
  extractCleanLegalEntityFromExecutionLine,
  repairExecutionBlockEntityHeadingLines,
} from "./paidProExecutionBlockEntityHeading";
import { buildReviewFirstDocumentDisplayHtml } from "../../agreement/reviewFirstDocumentDisplay";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function corruptedExecutionBody() {
  return [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    "Section 4. Payment. Client shall pay within fifteen (15) days of invoice.",
    "",
    ...Array.from({ length: 12 }, (_, i) => `Section ${i + 5}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    `${BLUE}, with Sarah Mitchell, CEO, signing on its behalf and ${IRON} its behalf`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    `${IRON}, with Michael Torres, President, signing on its behalf and ${IRON} its behalf`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
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

describe("Test306 execution block entity heading metadata leak repair", () => {
  beforeEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("detects EXECUTION_HEADING_METADATA_LEAK markers in corrupted entity lines", () => {
    const leak = detectExecutionHeadingMetadataLeak(corruptedExecutionBody());
    expect(leak.leak).toBe(true);
    expect(leak.markers.length).toBeGreaterThan(0);
  });

  it("extractCleanLegalEntityFromExecutionLine strips signer authority prose", () => {
    const line = `${BLUE}, with Sarah Mitchell, CEO, signing on its behalf and ${IRON} its behalf`;
    expect(extractCleanLegalEntityFromExecutionLine(line, [BLUE, IRON])).toBe(BLUE);
  });

  it("repair + hydrate fills Name/Title/Email/Address without metadata in entity headings", () => {
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const repaired = repairExecutionBlockEntityHeadingLines(corruptedExecutionBody(), authority.parties);
    expect(repaired.text).toMatch(new RegExp(`CLIENT:\\s*\\n${BLUE.replace(/\./g, "\\.")}`, "i"));
    expect(repaired.text).not.toMatch(/with Sarah Mitchell, CEO, signing on its behalf/i);
    expect(repaired.text).not.toMatch(/with Michael Torres, President, signing on its behalf/i);

    const recipientMeta = authorityPartiesToRecipientMetadata(authority.parties);
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(repaired.text, recipientMeta);
    expect(hydrated.corpus).toMatch(/Sarah Mitchell/i);
    expect(hydrated.corpus).toMatch(/Michael Torres/i);
    expect(hydrated.corpus).toMatch(/CEO/i);
    expect(hydrated.corpus).toMatch(/President/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(hydrated.corpus)).toBe(0);

    const integrity = auditExecutionBlockDisplayIntegrity({
      text: hydrated.corpus,
      signerMetadata: recipientMeta,
      parties: authority.parties,
    });
    expect(integrity.executionHeadingMetadataLeak).toBe(false);
    expect(integrity.signerFieldHydrationFailure).toBe(false);
    expect(integrity.invariantOk).toBe(true);
  });

  it("post-finalize snapshot and review-first display HTML preserve clean execution block", () => {
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const recipientMeta = authorityPartiesToRecipientMetadata(authority.parties);
    const repaired = repairExecutionBlockEntityHeadingLines(corruptedExecutionBody(), authority.parties);
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(repaired.text, recipientMeta);
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: recipientMeta,
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const plain = resolvePaidProPostFinalizeReviewPlain();
    expect(plain).toMatch(/fifteen \(15\) days/i);
    expect(plain).not.toMatch(/signing on its behalf/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(plain)).toBe(0);

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>stale server render</p>",
      corpusText: plain,
      partyNames: [BLUE, IRON],
    });
    expect(html).toMatch(/Sarah Mitchell/i);
    expect(html).toMatch(/Michael Torres/i);
    expect(html).not.toMatch(/signing on its behalf/i);
    expect(html).not.toMatch(/with Sarah Mitchell, CEO/i);
  });
});
