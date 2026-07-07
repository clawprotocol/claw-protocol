/** @vitest-environment jsdom */
/**
 * TEST542 — earliest incorrect transition in the paid returning-user flow.
 *
 * Review renders iff hasPaidProSourceOfTruth(); SoT is established only if the freeze gate
 * (assertClauseFamilyStructuralIntegrityForFreeze -> validateNoticesClauseFamilyStructuralIntegrity)
 * passes. That gate computed its excess/missing decision from a CONTEXT-FREE
 * requiredNoticeStanzaCount(opts.parties), which ignored the TEST538 intake-manifest ceiling that
 * the trim step and the diagnostic (canonicalAuthorityPartyCount) both honor. When a contaminated
 * parties list carried an authoritative-looking phantom Nth party, the required count inflated above
 * the number of real legal parties the intake resolves, so a valid, correctly-trimmed corpus was
 * rejected with a spurious missing_/excess_party_notice_stanzas. The freeze failed, SoT was never
 * established, and the review fell back to the retry shell (blank review). This is cache-independent,
 * which is why the TEST541 safe-display cache work did not clear the live failure.
 */
import { describe, expect, it } from "vitest";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import { resolveIntakeManifestAuthorityCount } from "./signerCountAuthority";

const TEST542_INTAKE = [
  "Create a Professional Technology Services and AI Implementation Agreement between the following four parties:",
  "",
  "Redwood Biologics Inc (Client)",
  "Address: 710 Discovery Parkway, Raleigh, NC 27609",
  "Authorized Signer: Dana Whitfield",
  "Signer Title: Chief Executive Officer",
  "Email: dana.whitfield@redwoodbio.com",
  "",
  "Summit AI Consulting LLC (Lead Provider)",
  "Address: 1880 Legacy Drive, Plano, TX 75024",
  "Authorized Signer: Marcus Lee",
  "Signer Title: Managing Partner",
  "Email: marcus.lee@summitai.com",
  "",
  "Blue Harbor Systems LLC (Implementation Partner)",
  "Address: 210 West Monroe Street, Chicago, IL 60606",
  "Authorized Signer: Priya Nair",
  "Signer Title: VP Engineering",
  "Email: priya.nair@blueharbor.com",
  "",
  "Iron Gate Security LLC (Cybersecurity Auditor)",
  "Address: 8300 Greensboro Drive, McLean, VA 22102",
  "Authorized Signer: Sam Okafor",
  "Signer Title: Chief Security Officer",
  "Email: sam.okafor@irongate.com",
].join("\n");

const FOUR = [
  "Redwood Biologics Inc",
  "Summit AI Consulting LLC",
  "Blue Harbor Systems LLC",
  "Iron Gate Security LLC",
];

function reviewParties(names: readonly string[]): PaidProSignerMetadataParty[] {
  return names.map((name, i) => ({
    partyIndex: i,
    partyLegalName: name,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

function fourPartyNoticesCorpus(): string {
  const stanza = (name: string, addr: string, email: string) =>
    [`If to ${name}:`, name, addr, `Email: ${email}`].join("\n");
  return [
    "PROFESSIONAL TECHNOLOGY SERVICES AND AI IMPLEMENTATION AGREEMENT",
    "",
    "10. NOTICES",
    "All notices under this Agreement shall be in writing and delivered to the following:",
    "",
    stanza("Redwood Biologics Inc", "710 Discovery Parkway, Raleigh, NC 27609", "dana.whitfield@redwoodbio.com"),
    "",
    stanza("Summit AI Consulting LLC", "1880 Legacy Drive, Plano, TX 75024", "marcus.lee@summitai.com"),
    "",
    stanza("Blue Harbor Systems LLC", "210 West Monroe Street, Chicago, IL 60606", "priya.nair@blueharbor.com"),
    "",
    stanza("Iron Gate Security LLC", "8300 Greensboro Drive, McLean, VA 22102", "sam.okafor@irongate.com"),
    "",
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    "",
  ].join("\n");
}

describe("TEST542 scratch — required-stanza count vs canonical authority divergence", () => {
  it("intake ceiling is 4", () => {
    expect(resolveIntakeManifestAuthorityCount(TEST542_INTAKE)).toBe(4);
  });

  it("resolveNoticeStructuralValidationParties clamps an AUTHORITATIVE phantom 5th to 4", () => {
    const clamped = resolveNoticeStructuralValidationParties(
      reviewParties([...FOUR, "Scope Analytics Inc"]),
      { intakeText: TEST542_INTAKE, draftPartyNames: FOUR, acceptedCorpus: null },
    );
    // Enrichment respects the ceiling.
    expect(clamped).toHaveLength(4);
  });

  it("REPRO: valid 4-stanza corpus rejected because required-count ignores the intake ceiling for an authoritative phantom 5th", () => {
    const corpus = fourPartyNoticesCorpus();
    // The caller passes an authoritative-looking phantom 5th party that survives
    // isAuthoritativeLegalEntityName (mirrors a contaminated reviewParties list).
    const violations = validateNoticesClauseFamilyStructuralIntegrity(corpus, {
      parties: reviewParties([...FOUR, "Scope Analytics Inc"]),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
      intakeText: TEST542_INTAKE,
      draftPartyNames: FOUR,
      draftPartyCount: 4,
      handoffPartySlots: 4,
      acceptedCorpus: corpus,
    });
    const codes = violations.map((v) => v.code);
    // After fix: the ceiling-aware authority (4) drives the required-stanza count, so a valid
    // 4-stanza corpus is NOT spuriously rejected.
    expect(codes).not.toContain("missing_party_notice_stanzas");
    expect(codes).not.toContain("excess_party_notice_stanzas");
  });

  it("still flags a genuine shortfall (3 stanzas for a 4-party intake)", () => {
    const corpus = fourPartyNoticesCorpus()
      .split("\n\n")
      .filter((block) => !block.includes("Iron Gate Security LLC"))
      .join("\n\n");
    const violations = validateNoticesClauseFamilyStructuralIntegrity(corpus, {
      parties: reviewParties(FOUR),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
      intakeText: TEST542_INTAKE,
      draftPartyNames: FOUR,
      draftPartyCount: 4,
      handoffPartySlots: 4,
      acceptedCorpus: corpus,
    });
    expect(violations.map((v) => v.code)).toContain("missing_party_notice_stanzas");
  });
});
