/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  clearPaidProReviewRenderFusedRepairCache,
  guardPaidProReviewRenderCorpus,
  repairFusedPartyLegalNamesForReviewDisplay,
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
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { resolvePaidProFinalReviewVisiblePlain } from "./authoritativePaidProReview";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

/** Substantive clean two-party corpus for SoT establishment (no fused third-party stub). */
const CLEAN_TWO_PARTY = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
  "",
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `${i + 1}. Operative clause ${i + 1}. Provider delivers AI-assisted reporting workflows, dashboard integrations, and operational automation under Delaware law with commercially reasonable care.`,
  ),
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
].join("\n");

/**
 * Weak/polluted RAW: non-operative "Section N." headings + fused third-party stub.
 * Used only to prove section_heading_title_anomaly still rejects at freeze gates
 * (before establish's pipeline-acceptance latch short-circuit).
 */
const POLLUTED_WEAK_FUSED_RAW = [
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

/** Polluted substantive corpus retained for fused-repair proofs only (not SoT success). */
const POLLUTED_FUSED_RAW = [
  CLEAN_TWO_PARTY,
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
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProReviewRenderFusedRepairCache();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
    clearPaidProReviewRenderFusedRepairCache();
    resetPaidProPipelineTestIsolation();
  });

  it("guard repairs fused QA pattern before review HTML", () => {
    const auth = authority();
    const guarded = guardPaidProReviewRenderCorpus(POLLUTED_FUSED_RAW, auth.parties);
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
    establishPaidProSourceOfTruth({ text: CLEAN_TWO_PARTY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    expect(getPaidProSourceOfTruthText()).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
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

  it("fused legal-name repair at review boundary is idempotent and leaves valid corpora unchanged", () => {
    const auth = authority();
    const boundary = repairFusedPartyLegalNamesForReviewDisplay(POLLUTED_FUSED_RAW, auth.parties);
    expect(boundary.repaired).toBe(true);
    expect(boundary.text).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    const againBoundary = repairFusedPartyLegalNamesForReviewDisplay(boundary.text, auth.parties);
    expect(againBoundary.repaired).toBe(false);
    expect(againBoundary.text).toBe(boundary.text);

    const noop = repairFusedPartyLegalNamesForReviewDisplay(CLEAN_TWO_PARTY, auth.parties);
    expect(noop.repaired).toBe(false);
    expect(noop.text).toBe(CLEAN_TWO_PARTY.replace(/\r\n/g, "\n"));
  });

  it("rejects polluted/weak RAW with fused third-party stub at freeze gates", () => {
    // Prove the gate itself — establish() latches pipeline acceptance before freeze
    // evaluation and can short-circuit; do not weaken section_heading_title_anomaly.
    const prep = preparePaidProFreezeCandidateText({
      text: POLLUTED_WEAK_FUSED_RAW,
      source: "server_full_draft",
      surface: "rrc_polluted_weak_reject",
    });
    const gate = evaluatePaidProFreezeCandidateGates(prep, {
      text: POLLUTED_WEAK_FUSED_RAW,
      source: "server_full_draft",
      surface: "rrc_polluted_weak_reject",
    });
    expect(gate.ok).toBe(false);
    expect(gate.rejectReason).toBe("section_heading_title_anomaly");
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("visible plain prefers hydrated authoritative display over polished boundary candidate", () => {
    establishPaidProSourceOfTruth({ text: CLEAN_TWO_PARTY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const polished = polishProAgreementDisplayLayer(CLEAN_TWO_PARTY, {
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
    establishPaidProSourceOfTruth({ text: CLEAN_TWO_PARTY, source: "server_full_draft" });
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
    establishPaidProSourceOfTruth({ text: CLEAN_TWO_PARTY, source: "server_full_draft" });
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
    establishPaidProSourceOfTruth({ text: CLEAN_TWO_PARTY, source: "server_full_draft" });
    const edited = CLEAN_TWO_PARTY.replace(/Title: Membe/g, "Title: Member");
    establishPaidProSourceOfTruth({
      text: edited,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });
    const record = getPaidProSourceOfTruth()!;
    const renderPlain = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    expect(renderPlain).toBe(record.text);
    expect(copy).toBe(record.text);
    expect(hashPaidProCorpus(renderPlain)).toBe(record.hash);
  });
});
