/**
 * Legal Identity Authority & Render Integrity — permanent regression suite.
 */

import { afterEach, describe, expect, it } from "vitest";
import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";
import { textContainsUnresolvedIdentityPlaceholders } from "../../agreement/partyPlaceholderDisplay";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { analyzeContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";
import { ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveGuidedPreReviewSignerSlots } from "./guidedDealCompletion/resolveGuidedPreReviewSignerSlots";
import {
  assertUserVisibleRenderIntegrity,
  compareLegalIdentityContinuity,
  containsForbiddenIdentityRenderTokens,
  detectDuplicateLegalIdentities,
  resolveAuthoritativeLegalPartyIdentities,
} from "./legalPartyIdentityAuthority";
import {
  buildLivePaidProSignerMetadataAuthority,
  buildPaidProSignerMetadataParties,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolveSignerSetupPartyIdentities } from "./signerSetupPartyIdentity";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const TWO_PARTY_INTAKE = [
  "Create a consulting agreement",
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")',
  "for AI workflow setup.",
].join(" ");

const CORRUPTED_DRAFT = [
  { name: "Red Mesa Logistics", role: "party_a" },
  { name: "LLC", role: "party_b" },
  { name: "Harbor Peak Automation", role: "party" },
];

const FOUR_PARTY_INTAKE = `
Party 1
Legal Entity: Pioneer Freight Solutions LLC
Party 2
Legal Entity: Summit Ridge Technologies LLC
Party 3
Legal Entity: North Star Data Analytics LLC
Party 4
Legal Entity: Iron Vale Implementation Partners LLC
`.trim();

function twoPartyCorpus() {
  return [
    "CONSULTING AGREEMENT",
    `This Agreement is between ${RED} and ${HARBOR}.`,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    RED,
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

describe("legalIdentityAuthorityIntegrity", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("two-party identities stay consistent across review, signer setup, manifest, and metadata", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: CORRUPTED_DRAFT,
    });
    expect(authority.map((a) => a.legalEntityName)).toEqual([RED, HARBOR]);

    const signerCards = resolveSignerSetupPartyIdentities({
      parties: CORRUPTED_DRAFT,
      intakeText: TWO_PARTY_INTAKE,
      agreementBodyText: twoPartyCorpus(),
    });
    expect(compareLegalIdentityContinuity(authority, signerCards.map((c) => c.legalEntityName)).ok).toBe(
      true,
    );

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 4,
      intakeText: TWO_PARTY_INTAKE,
      recipient1Name: "Red Mesa Logistics",
      recipient2Name: "LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: CORRUPTED_DRAFT.map((p) => p.name),
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
      sendMode: "review",
      recipientsDeferred: false,
    });
    expect(compareLegalIdentityContinuity(authority, manifest.parties.map((p) => p.partyName)).ok).toBe(
      true,
    );

    const metadata = buildPaidProSignerMetadataParties(
      {
        partyCount: 4,
        recipient1Name: RED,
        recipient2Name: HARBOR,
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Sarah", "Michael"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: ["", ""],
      },
      { intakeText: TWO_PARTY_INTAKE, draftPartyNames: CORRUPTED_DRAFT.map((p) => p.name) },
    );
    expect(compareLegalIdentityContinuity(authority, metadata.map((p) => p.partyLegalName)).ok).toBe(
      true,
    );
  });

  it("four-party identities stay consistent across surfaces", () => {
    const labeled = labeledPartyLegalEntities(FOUR_PARTY_INTAKE);
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: FOUR_PARTY_INTAKE,
      draftPartyNames: labeled,
    });
    expect(authority).toHaveLength(4);
    expect(authority.map((a) => a.legalEntityName)).toEqual(labeled);

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      intakeText: FOUR_PARTY_INTAKE,
      recipient1Name: labeled[0] ?? "",
      recipient2Name: labeled[1] ?? "",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: labeled,
      partySignerNames: ["", "", "", ""],
      extraPartyReviewEmails: [],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(compareLegalIdentityContinuity(authority, manifest.parties.map((p) => p.partyName)).ok).toBe(
      true,
    );
  });

  it("rejects same count but wrong identity (Party A / Party A)", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: CORRUPTED_DRAFT,
    });
    const wrong = [RED, RED];
    const result = compareLegalIdentityContinuity(authority, wrong);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.slotIndex === 1)).toBe(true);
  });

  it("rejects duplicate legal identity in authority list", () => {
    const dup = detectDuplicateLegalIdentities([RED, RED]);
    expect(dup.duplicate).toBe(true);
    expect(dup.duplicates).toContain(RED);
  });

  it("execution blocks derive from legal party authority", () => {
    const invariant = analyzePaidProExecutionBlockInvariant(twoPartyCorpus(), { expectedParties: 2 });
    expect(invariant.ok).toBe(true);
    expect(invariant.executionBlockCount).toBe(1);
  });

  it("signing manifest derives from legal party authority", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: CORRUPTED_DRAFT,
    });
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      intakeText: TWO_PARTY_INTAKE,
      partySignerNames: ["Sarah", "Michael"],
      recipient1Name: RED,
      recipient2Name: HARBOR,
      recipient1Email: "a@example.com",
      recipient2Email: "b@example.com",
      extraPartyReviewEmails: [],
      draftPartyNames: authority.map((a) => a.legalEntityName),
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(compareLegalIdentityContinuity(authority, manifest.parties.map((p) => p.partyName)).ok).toBe(
      true,
    );
  });

  it("metadata authorities cannot substitute legal identities", () => {
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 4,
        recipient1Name: "Wrong Entity LLC",
        recipient2Name: "Another Wrong LLC",
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Sarah", "Michael"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: ["", ""],
      },
      "live_ui",
      { intakeText: TWO_PARTY_INTAKE, draftPartyNames: CORRUPTED_DRAFT.map((p) => p.name) },
    );
    expect(authority.parties.map((p) => p.partyLegalName)).toEqual([RED, HARBOR]);
  });

  it("reviewer, notice, delivery, org, affiliate metadata cannot create parties", () => {
    const intake = `
${TWO_PARTY_INTAKE}
Reviewer Email: reviewer@example.com
Notice Contact: notices@harborpeak.test
Deliver to archive@example.com
Organization: Acme Holdings LLC contacts@acme.test
Affiliate referral: partner@affiliate.test
`.trim();
    const identities = resolveAuthoritativeLegalPartyIdentities({
      intakeText: intake,
      draftPartyNames: [RED, HARBOR, "reviewer@example.com", "archive@example.com", "contacts@acme.test"],
      consumerPartyCount: 5,
    });
    expect(identities).toHaveLength(2);
    expect(identities.map((i) => i.legalEntityName)).toEqual([RED, HARBOR]);
  });

  it("parser fragments cannot become parties without legal authority promotion", () => {
    const identities = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftPartyNames: ["LLC", "party_a", "Harbor Peak Automation"],
      consumerPartyCount: 3,
    });
    expect(identities.map((i) => i.legalEntityName)).toEqual([RED, HARBOR]);
    expect(identities.map((i) => i.legalEntityName)).not.toContain("LLC");
  });

  it("party_a / party_b and PARTY_A / PARTY_B cannot render in starter preview", () => {
    const preview = buildStarterAgreementPreviewForReview(
      {
        title: "Consulting Agreement",
        jurisdiction: "Oklahoma",
        parties: CORRUPTED_DRAFT,
        purpose: "AI workflow setup",
        payment_terms: "",
        duration: "12 months",
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
        agreement_family: "services_agreement",
      },
      { intakeText: TWO_PARTY_INTAKE },
    );
    expect(preview).not.toMatch(/party_a|party_b/i);
    expect(preview).not.toMatch(/\bPARTY[_\s-]?[AB]\b/i);
    expect(assertUserVisibleRenderIntegrity(preview).ok).toBe(true);
  });

  it("[EMAIL_1], [ORG_3], and template variables are forbidden in user-visible render", () => {
    const bad = [
      "Notice email: [EMAIL_1]",
      "If to [ORG_3]:",
      "Address: {{company}}",
      "City: ${address}",
    ].join("\n");
    expect(containsForbiddenIdentityRenderTokens(bad)).toBe(true);
    expect(assertUserVisibleRenderIntegrity(bad).ok).toBe(false);
  });

  it("contact notice delivery remains compatible with legal identity authority", () => {
    const body = [
      "10. NOTICES",
      "10.2 Notice Addresses",
      "If to Red Mesa Logistics LLC:",
      "Attn: Legal Department",
      "Email: client@example.com",
    ].join("\n");
    const parties = [
      {
        partyIndex: 0,
        partyLegalName: RED,
        signerEmail: "client@example.com",
        signerName: "Sarah",
        signerTitle: "CEO",
        partyAddress: "100 Main St",
      },
      {
        partyIndex: 1,
        partyLegalName: HARBOR,
        signerEmail: "provider@example.com",
        signerName: "Michael",
        signerTitle: "President",
        partyAddress: "200 Oak Ave",
      },
    ];
    const repaired = ensureOperativeIfToNoticeDelivery(body, parties).text;
    expect(repaired).toContain("If to Red Mesa Logistics LLC");
    expect(repaired).toContain("client@example.com");
    expect(assertUserVisibleRenderIntegrity(repaired).ok).toBe(true);
  });

  it("execution blocks remain Entity / By / Name / Title / Date only", () => {
    const corpus = twoPartyCorpus();
    const analysis = analyzeContactAuthorityExecutionBlockIntegrity(corpus);
    expect(analysis.contaminationCount).toBe(0);
    expect(analysis.diagnostics).toHaveLength(0);
  });

  it("normalizeAgreementDraftFromApi promotes only legal authority identities", () => {
    const draft = normalizeAgreementDraftFromApi(
      {
        id: "ag-legal-id",
        title: "Consulting Agreement",
        intake_text: TWO_PARTY_INTAKE,
        parties: CORRUPTED_DRAFT,
      },
      { partyNameContext: TWO_PARTY_INTAKE },
    );
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: draft?.parties ?? [],
    });
    expect(authority.map((a) => a.legalEntityName)).toEqual([RED, HARBOR]);
  });

  it("guided signature preparation slots match legal identities", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: CORRUPTED_DRAFT,
    });
    const slots = resolveGuidedPreReviewSignerSlots({
      partyCount: 4,
      intakeText: TWO_PARTY_INTAKE,
      partySignerNames: ["Sarah", "Michael"],
      recipient1Name: RED,
      recipient2Name: HARBOR,
      recipient1Email: "a@example.com",
      recipient2Email: "b@example.com",
      extraPartyReviewEmails: [],
      draftPartyNames: CORRUPTED_DRAFT.map((p) => p.name),
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(slots.requiredCount).toBe(authority.length);
    expect(textContainsUnresolvedIdentityPlaceholders(twoPartyCorpus())).toBe(false);
  });
});
