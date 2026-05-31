import { afterEach, describe, expect, it } from "vitest";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  guardPaidProReviewRenderCorpus,
  resolvePaidProReviewRenderPlain,
  syncConsumedAuthoritySignerTitlesFromCorpus,
} from "./paidProReviewRenderCorpus";
import { QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE } from "./canonicalPartyLegalNameSanitizer";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { resolvePaidProFinalReviewVisiblePlain } from "./authoritativePaidProReview";

const RAW = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
  "",
  ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: __________________________",
  "Name: Anthem H Blanchard",
  "Title: Manager",
  "",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc",
  "By: __________________________",
  "Name: Ira Vale",
  "Title: Membe",
  "",
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
  "By: __________________________",
  "Name: Anthem H Blanchard",
  "Title: Manager",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Blue Canyon Analytics LLC",
    recipient2Name: "Iron Vale Systems Inc",
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "iv467@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
    partySignerTitles: ["Manager", "Membe"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "208 Main St."],
  });
}

describe("paidProReviewRenderCorpus", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("guard repairs fused QA pattern before review HTML", () => {
    const auth = authority();
    const guarded = guardPaidProReviewRenderCorpus(RAW, auth.parties);
    expect(guarded.warned).toBe(true);
    expect(guarded.text).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    const html = buildPremiumAgreementReadonlyHtml(guarded.text, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      suppressDocumentIntelligenceCallouts: true,
      forceEmbeddedCorpusSignature: true,
    });
    expect(html).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(html).toContain("Blue Canyon Analytics LLC");
    expect(html).toContain("Iron Vale Systems Inc");
  });

  it("review render plain matches copy surface without fused party names", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const renderPlain = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    for (const corpus of [renderPlain, copy]) {
      expect(corpus).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
      expect(corpus).toMatch(/Party Notice Details:/i);
      expect(corpus).toMatch(/Client:\s*\n\s*Blue Canyon Analytics LLC/i);
      expect(corpus).toMatch(/Service Provider:\s*\n\s*Iron Vale Systems Inc/i);
    }
  });

  it("visible plain prefers render corpus over polished boundary with fused names", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const polished = polishProAgreementDisplayLayer(RAW, {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    const visible = resolvePaidProFinalReviewVisiblePlain({
      boundaryPlain: polished,
      displayCandidatePlain: polished,
    });
    expect(visible).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(visible).toMatch(/Title: Membe/);
  });

  it("review render removes fused legacy signature block after canonical CLIENT/SERVICE PROVIDER blocks", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const renderPlain = resolvePaidProReviewRenderPlain();
    expect(renderPlain).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(renderPlain).toMatch(/CLIENT:\s*\n\s*Blue Canyon Analytics LLC/i);
    expect(renderPlain).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale Systems Inc/i);
  });

  it("direct text edit Membe to Member persists in render and copy paths", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const edited = RAW.replace(/Title: Membe/g, "Title: Member");
    establishPaidProSourceOfTruth({ text: edited, source: "server_full_draft", allowShorterOverwrite: true });
    syncConsumedAuthoritySignerTitlesFromCorpus(edited);
    const renderPlain = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(renderPlain).toMatch(/Title: Member\b/);
    expect(copy).toMatch(/Title: Member\b/);
    expect(renderPlain).not.toMatch(/Title: Membe\b/);
  });
});
