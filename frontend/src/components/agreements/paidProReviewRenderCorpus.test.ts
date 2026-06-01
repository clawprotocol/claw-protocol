import { afterEach, describe, expect, it } from "vitest";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  applyPaidProReviewRenderSanitizer,
  guardPaidProReviewRenderCorpus,
  repairSignatureNameLinesUsingLegalEntity,
  resolvePaidProReviewRenderPlain,
  stripStrayStandalonePartyEntityLinesBeforeRecital,
  syncConsumedAuthoritySignerTitlesFromCorpus,
} from "./paidProReviewRenderCorpus";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
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
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { PAID_PRO_MUTUAL_CONSULTING_TITLE } from "./paidProOpeningRecitalGuard";

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

  it("repairs naked party-name-only Pro head at acceptance before review and copy", () => {
    const intake =
      "Services between Blue Canyon Analytics LLC and Iron Vale Systems Inc for internal automation tooling and AI-assisted reporting workflows $8500 50% upfront 50% completion Delaware";
    const malformed = [
      "Blue Canyon Analytics LLC",
      "1. Scope of Services",
      "Provider delivers AI-assisted reporting workflows.",
      "Total $8,500 with 50% upfront and 50% on completion.",
      "Delaware law governs.",
      ...Array.from({ length: 30 }, (_, i) => `Operative clause ${i + 1} for minimum length.`),
    ].join("\n");
    const draft = {
      title: "Consulting Agreement",
      parties: [
        { name: "Blue Canyon Analytics LLC", role: "Client" },
        { name: "Iron Vale Systems Inc", role: "Service Provider" },
      ],
    } as import("./intakeSmartDefaults").ParsedDraftShape;
    const safe = applyAcceptedProCorpusSafeDisplay(malformed, { draft, intakeText: intake });
    establishPaidProSourceOfTruth({ text: safe.text, draft, intakeText: intake, source: "server_full_draft" });
    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: intake })!.text;
    expect(review).toContain(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(review).toMatch(/entered\s+into\s+as\s+of/i);
    expect(copy).toContain('Blue Canyon Analytics LLC ("Client")');
    expect(review).not.toMatch(/^Blue Canyon Analytics LLC\s*\n\s*1\./m);
    const sec1Review = review.search(/^\s*1\.\s+/m);
    const titleReview = review.indexOf(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(sec1Review).toBeGreaterThan(titleReview);
  });

  it("strips stray standalone party entity line before opening recital", () => {
    const corrupted = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "Blue Canyon Analytics LLC",
      "",
      'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
      "",
      "1. Services",
    ].join("\n");
    const stripped = stripStrayStandalonePartyEntityLinesBeforeRecital(corrupted, [
      "Blue Canyon Analytics LLC",
      "Iron Vale Systems Inc",
    ]);
    expect(stripped.removed).toBe(1);
    expect(stripped.text).not.toMatch(
      /^MUTUAL[\s\S]*?\n\nBlue Canyon Analytics LLC\n\nThis Agreement is between/m,
    );
    expect(stripped.text).toMatch(/This Agreement is between Blue Canyon Analytics LLC/i);
  });

  it("pre-signer review does not use party legal names as signature Name lines", () => {
    const preSigner = [
      "SIGNATURES",
      "",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: Blue Canyon Analytics LLC",
      "Title: __________________________",
      "",
      "SERVICE PROVIDER:",
      "Iron Vale Systems Inc",
      "By: __________________________",
      "Name: Iron Vale Systems Inc",
      "Title: __________________________",
    ].join("\n");
    const parties = authority().parties.map((p) => ({ ...p, signerName: "", signerTitle: "" }));
    const identities = authorityPartiesToCanonicalPartyIdentities(parties);
    const repaired = repairSignatureNameLinesUsingLegalEntity(preSigner, identities);
    expect(repaired.repairs).toBeGreaterThanOrEqual(2);
    expect(repaired.text).toMatch(/Name:\s*_{4,}/i);
    expect(repaired.text).not.toMatch(/Name:\s*Blue Canyon Analytics LLC/i);
    expect(repaired.text).not.toMatch(/Name:\s*Iron Vale Systems Inc/i);
  });

  it("review and copy surfaces stay equivalent when only SoT is established", () => {
    const clean = RAW.replace(/IN WITNESS WHEREOF[\s\S]*/i, "SIGNATURES\n\nEnd.");
    establishPaidProSourceOfTruth({ text: clean, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const review = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(review.length).toBeGreaterThan(400);
    expect(copy.length).toBeGreaterThan(400);
    expect(review).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(copy).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    const sanitizedReview = applyPaidProReviewRenderSanitizer(review, authority().parties).text;
    expect(sanitizedReview).toMatch(/CLIENT:\s*\n\s*Blue Canyon Analytics LLC/i);
    expect(sanitizedReview).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale Systems Inc/i);
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
