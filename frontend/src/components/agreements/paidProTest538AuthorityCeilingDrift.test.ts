/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  resolveAuthoritativeSignerCount,
  resolveIntakeManifestAuthorityCount,
} from "./signerCountAuthority";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { isNonAuthoritativeFreezePartyName } from "./paidProFreezeCandidate";

/**
 * TEST538 — live 35ace88c: canonical-final-party-manifest resolves 4, then a downstream
 * recovery/notice/signer resolver inflates authority to 5 and promotes "Party 1", rejecting a
 * valid 4-party recovery with `missing_party_notice_stanzas`.
 *
 * Root cause: `resolveAuthoritativeSignerCountCore` let an externally-supplied inflated
 * `manifestPartyCount` (a contaminated `reviewParties.length`) — and a "Party 1" placeholder in
 * the consumed authority — push the count above the party count the immutable intake manifest
 * truly resolves. There was no hard ceiling anchoring authority to the intake manifest.
 *
 * Exact live shape: `Entity (Role)` heading lines (entity names WITHOUT commas) followed by
 * stacked Address / Authorized Signer / Signer Title / Email metadata.
 */
const TEST538_INTAKE = [
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
  "",
  "Prepare the full agreement with one signature block per party including:",
  "* Entity legal name",
  "* Signer name",
  "* Signer title",
  "* Signature line",
  "* Date line",
  "",
  "Also include a corresponding Notices section containing one notice stanza for each of the four",
  "parties using the addresses listed above and the designated contact email for each party.",
].join("\n");

const FOUR = [
  "Redwood Biologics Inc",
  "Summit AI Consulting LLC",
  "Blue Harbor Systems LLC",
  "Iron Gate Security LLC",
];

const FIVE_PARTY_INTAKE = [
  "Create a services agreement between the following five parties:",
  "Alpha Robotics LLC (Client)",
  "Beacon Systems Inc (Provider)",
  "Cedar Analytics LLC (Data Partner)",
  "Delta Security LLC (Auditor)",
  "Echo Logistics LLC (Distributor)",
].join("\n");

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

/** Build a 4-stanza NOTICES corpus for the canonical four parties. */
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
  ].join("\n");
}

describe("TEST538 — intake manifest authority ceiling (4→5 drift)", () => {
  // The intake manifest authoritatively fixes the party count at 4.
  it("resolves the intake manifest authority count as 4 for the 4-party intake", () => {
    expect(resolveIntakeManifestAuthorityCount(TEST538_INTAKE)).toBe(4);
  });

  // Reproduces the exact live mechanism: a contaminated manifestPartyCount=5 must NOT inflate the
  // authority — the immutable intake manifest clamps it to 4.
  it("clamps a contaminated manifestPartyCount=5 back to the 4-party intake manifest", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST538_INTAKE,
      draftPartyNames: FOUR,
      draftParties: FOUR.map((name) => ({ name })),
      manifestPartyCount: 5,
    });
    expect(resolution.count).toBe(4);
  });

  // A "Party 1" placeholder leaking into the draft/consumed party list cannot inflate authority.
  it("never lets a 'Party 1' placeholder become a fifth party in authority count", () => {
    const contaminated = [...FOUR, "Party 1"];
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST538_INTAKE,
      draftPartyNames: contaminated,
      draftParties: contaminated.map((name) => ({ name })),
      manifestPartyCount: 5,
    });
    expect(resolution.count).toBe(4);
    expect(isNonAuthoritativeFreezePartyName("Party 1")).toBe(true);
  });

  // No "Party 1" / phantom 5th enters notice structural validation parties, even when offered.
  it("clamps notice structural validation parties to the 4-party manifest (no Party 1, no 5th)", () => {
    const withPhantom = resolveNoticeStructuralValidationParties(
      reviewParties([...FOUR, "Scope Analytics Inc"]),
      { intakeText: TEST538_INTAKE, draftPartyNames: FOUR, acceptedCorpus: null },
    );
    expect(withPhantom).toHaveLength(4);
    for (const p of withPhantom) {
      expect(isNonAuthoritativeFreezePartyName(p.partyLegalName)).toBe(false);
      expect(/^party\s*\d+$/i.test(p.partyLegalName.trim())).toBe(false);
    }

    const withParty1 = resolveNoticeStructuralValidationParties(
      reviewParties([...FOUR, "Party 1"]),
      { intakeText: TEST538_INTAKE, draftPartyNames: FOUR, acceptedCorpus: null },
    );
    expect(withParty1).toHaveLength(4);
    expect(withParty1.some((p) => /^party\s*\d+$/i.test(p.partyLegalName.trim()))).toBe(false);
  });

  // canonicalAuthorityPartyCount stays 4 through recovery_freeze_finalize even with 5 parties passed:
  // missing_party_notice_stanzas is NOT thrown for 4 manifest parties + 4 valid notice stanzas.
  it("does not throw missing_party_notice_stanzas for 4 manifest parties + 4 notice stanzas (contaminated 5 offered)", () => {
    const corpus = fourPartyNoticesCorpus();
    const violations = validateNoticesClauseFamilyStructuralIntegrity(corpus, {
      parties: reviewParties([...FOUR, "Party 1"]),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
      intakeText: TEST538_INTAKE,
      draftPartyNames: FOUR,
      draftPartyCount: 4,
      handoffPartySlots: 4,
      acceptedCorpus: corpus,
    });
    const codes = violations.map((v) => v.code);
    expect(codes).not.toContain("missing_party_notice_stanzas");
    expect(codes).not.toContain("excess_party_notice_stanzas");
  });

  // Actual 5-party intakes still support 5 real parties — the ceiling is the real manifest count.
  it("still supports 5 real parties for a genuine 5-party intake", () => {
    expect(resolveIntakeManifestAuthorityCount(FIVE_PARTY_INTAKE)).toBe(5);
    expect(resolveAuthoritativeSignerCount({ intakeText: FIVE_PARTY_INTAKE }).count).toBe(5);
  });

  // Real count mismatches are still surfaced: a genuine 3-stanza corpus for a 4-party manifest
  // still reports missing_party_notice_stanzas (validation is not weakened).
  it("still rejects a genuine notice-stanza shortfall (3 stanzas for 4 manifest parties)", () => {
    const corpus = fourPartyNoticesCorpus()
      .split("\n\n")
      .filter((block) => !block.includes("Iron Gate Security LLC"))
      .join("\n\n");
    const violations = validateNoticesClauseFamilyStructuralIntegrity(corpus, {
      parties: reviewParties(FOUR),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
      intakeText: TEST538_INTAKE,
      draftPartyNames: FOUR,
      draftPartyCount: 4,
      handoffPartySlots: 4,
      acceptedCorpus: corpus,
    });
    expect(violations.map((v) => v.code)).toContain("missing_party_notice_stanzas");
  });
});
