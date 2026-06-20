import { afterEach, describe, expect, it } from "vitest";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  guardPaidProReviewRenderCorpus,
  repairSignatureNameLinesUsingLegalEntity,
  resolvePaidProReviewRenderPlain,
  stripStrayStandalonePartyEntityLinesBeforeRecital,
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
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { resolvePaidProFinalReviewVisiblePlain } from "./authoritativePaidProReview";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
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
    resetPaidProReviewSignerMetadataSessionActiveForTests();
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

  it("review render plain hydrates signer metadata from consumed authority without losing entity blocks", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const renderPlain = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(copy).toBe(renderPlain);
    for (const corpus of [renderPlain, copy]) {
      expect(corpus).toMatch(/CLIENT:\s*\n\s*Blue Canyon Analytics LLC/i);
      expect(corpus).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale Systems Inc/i);
      expect(corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
      expect(corpus).not.toMatch(/Email for Notice:/i);
      expect(corpus).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    }
  });

  it("visible plain prefers hydrated authoritative display over polished boundary candidate", () => {
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
    expect(visible).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(visible).not.toMatch(/Email for Notice:/i);
    expect(visible).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(hashPaidProCorpus(visible)).not.toBe(hashPaidProCorpus(polished));
  });

  it("review render keeps canonical execution blocks after SoT freeze", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const renderPlain = resolvePaidProReviewRenderPlain();
    expect(renderPlain).toMatch(/CLIENT:\s*\n\s*Blue Canyon Analytics LLC/i);
    expect(renderPlain).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale Systems Inc/i);
    expect(renderPlain).toMatch(/IN WITNESS WHEREOF/i);
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
    establishPaidProSourceOfTruth({
      text: safe.text,
      draft,
      intakeText: intake,
      source: "server_full_draft",
    });
    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: intake })!.text;
    expect(review).toMatch(/(?:MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT|SERVICES AGREEMENT)/i);
    expect(review).toMatch(/(?:entered\s+into\s+as\s+of|is between)/i);
    expect(copy).toMatch(/Blue Canyon Analytics LLC\s*\(\s*["']?Client["']?\s*\)/i);
    expect(review).not.toMatch(/^Blue Canyon Analytics LLC\s*\n\s*1\./m);
    const sec1Review = review.search(/^\s*1\.\s+/m);
    const titleReview = review.search(
      /(?:MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT|SERVICES AGREEMENT)/i,
    );
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

  it("review and copy surfaces stay hash-equivalent when only SoT is established", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    const review = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(review.length).toBeGreaterThan(400);
    expect(copy.length).toBeGreaterThan(400);
    expect(hashPaidProCorpus(review)).toBe(record.hash);
    expect(hashPaidProCorpus(copy)).toBe(record.hash);
  });

  it("user-approved SoT revision stays byte-aligned on review and copy when authority is not consumed", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    const edited = RAW.replace(/Title: Membe/g, "Title: Member");
    establishPaidProSourceOfTruth({ text: edited, source: "server_full_draft", allowShorterOverwrite: true });
    const record = getPaidProSourceOfTruth()!;
    const renderPlain = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(renderPlain).toBe(record.text);
    expect(copy).toBe(record.text);
    expect(hashPaidProCorpus(renderPlain)).toBe(record.hash);
  });
});
