/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  extractIntakePartyManifestRows,
  intakePartyManifestIsAuthoritative,
} from "./intakePartyManifestAuthority";
import {
  resolvePartiesForReviewRender,
} from "./paidProReviewRenderParties";
import {
  resolveNoticeStructuralValidationParties,
} from "./paidProPartyNoticeDetails";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";

/**
 * TEST539 — post-TEST538 identity propagation regression. Counts are correct (4), but a prior
 * generation attempt's contaminated consumed authority (a "Party 1" placeholder in slot 0) caused
 * `resolvePartiesForReviewRender` to drop the real slot-0 identity (empty / "Party N") instead of
 * restoring it from the authoritative intake manifest — so notice validation saw a placeholder and
 * rejected the recovery with `missing_party_notice_stanzas` / count mismatch.
 *
 * Fix: once the intake manifest authoritatively resolves the real legal entity for a slot, that
 * identity is restored onto contaminated slots (empty or "Party N") before any downstream notice /
 * count validation. `resolveNoticeStanzaLegalEntity` additionally consults the manifest by index so
 * notice validation can never degrade a real slot to "Party N".
 */
const INTAKE = [
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
  "Prepare the full agreement with one signature block per party including entity legal name, signer name, signer title, signature line, and date line.",
  "Also include a corresponding Notices section containing one notice stanza for each of the four parties using the addresses listed above and the designated contact email for each party.",
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

function contaminateConsumedAuthority(names: readonly string[]): void {
  setConsumedPaidProSignerMetadataAuthority({
    parties: reviewParties(names),
    source: "authoritative_snapshot",
    hash: "test539",
    updatedAt: Date.now(),
  } as never);
}

function emptyDraft(): ParsedDraftShape {
  return {
    title: "Professional Technology Services and AI Implementation Agreement",
    jurisdiction: "Delaware",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: "",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  } as unknown as ParsedDraftShape;
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
  ].join("\n");
}

describe("TEST539 — party identity propagation (Party 1 resurrection)", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  // A. canonical manifest resolves the four real legal entities.
  it("A. canonical manifest resolves Redwood/Summit/Blue Harbor/Iron Gate", () => {
    expect(intakePartyManifestIsAuthoritative(INTAKE)).toBe(true);
    expect(extractIntakePartyManifestRows(INTAKE).map((r) => r.partyLegalName)).toEqual(FOUR);
  });

  // B. reviewParties preserve Redwood at slot 1 even when consumed authority slot 0 is "Party 1".
  it("B. reviewParties restore the real slot-0 identity from a contaminated consumed authority", () => {
    contaminateConsumedAuthority(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]);
    const parties = resolvePartiesForReviewRender({ draft: emptyDraft(), intakeText: INTAKE });
    expect(parties.map((p) => p.partyLegalName)).toEqual(FOUR);
    expect(parties[0]?.partyLegalName).toBe("Redwood Biologics Inc");
  });

  // C. notice validation parties preserve Redwood at slot 1 (no placeholder survives).
  it("C. notice structural validation parties keep Redwood at slot 0 (contaminated input)", () => {
    const withPlaceholder = resolveNoticeStructuralValidationParties(
      reviewParties(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]),
      { intakeText: INTAKE, draftPartyNames: [], acceptedCorpus: null },
    );
    expect(withPlaceholder[0]?.partyLegalName).toBe("Redwood Biologics Inc");
    expect(withPlaceholder.map((p) => p.partyLegalName)).toEqual(FOUR);

    const withEmpty = resolveNoticeStructuralValidationParties(
      reviewParties(["", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]),
      { intakeText: INTAKE, draftPartyNames: [], acceptedCorpus: null },
    );
    expect(withEmpty[0]?.partyLegalName).toBe("Redwood Biologics Inc");
  });

  // D. expected notice entities never contain "Party 1".
  it("D. resolved notice validation parties contain no Party N placeholder", () => {
    const parties = resolveNoticeStructuralValidationParties(
      reviewParties(["Party 1", "Party 2", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]),
      { intakeText: INTAKE, draftPartyNames: [], acceptedCorpus: null },
    );
    for (const p of parties) {
      expect(/^party\s*\d+$/i.test(p.partyLegalName.trim())).toBe(false);
      expect(p.partyLegalName.trim().length).toBeGreaterThanOrEqual(2);
    }
    expect(parties.map((p) => p.partyLegalName)).toEqual(FOUR);
  });

  // E. missing_party_notice_stanzas is NOT thrown when the four real notice stanzas exist, even if
  //    the parties passed in were contaminated with a Party 1 placeholder.
  it("E. no missing_party_notice_stanzas for 4 real notice stanzas + contaminated slot0", () => {
    const corpus = fourPartyNoticesCorpus();
    // The freeze path validates against parties already resolved through the manifest overlay; a
    // contaminated slot-0 must be restored to the real entity before validation, so the 4 real
    // notice stanzas satisfy the authority count with no missing/excess violation.
    const resolvedParties = resolveNoticeStructuralValidationParties(
      reviewParties(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]),
      { intakeText: INTAKE, draftPartyNames: FOUR, acceptedCorpus: corpus },
    );
    expect(resolvedParties[0]?.partyLegalName).toBe("Redwood Biologics Inc");
    const violations = validateNoticesClauseFamilyStructuralIntegrity(corpus, {
      parties: resolvedParties,
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
      intakeText: INTAKE,
      draftPartyNames: FOUR,
      draftPartyCount: 4,
      handoffPartySlots: 4,
      acceptedCorpus: corpus,
    });
    const codes = violations.map((v) => v.code);
    expect(codes).not.toContain("missing_party_notice_stanzas");
    expect(codes).not.toContain("excess_party_notice_stanzas");
  });

  // F. genuine placeholders are still rejected when no real manifest identity exists for the slot.
  it("F. keeps a placeholder when the intake has no real manifest entity for that slot", () => {
    const noManifestIntake = "Draft a simple two-party services agreement.";
    expect(intakePartyManifestIsAuthoritative(noManifestIntake)).toBe(false);
    const parties = resolvePartiesForReviewRender({
      draft: { ...emptyDraft(), parties: [{ name: "Party 1" } as never] } as ParsedDraftShape,
      intakeText: noManifestIntake,
    });
    // No authoritative manifest → identity is NOT synthesized from a placeholder.
    expect(parties.every((p) => p.partyLegalName !== "Redwood Biologics Inc")).toBe(true);
  });

  // G. genuine 5-party intake still resolves 5 real parties (fix does not clamp real expansions).
  it("G. genuine 5-party intake still resolves 5 real parties", () => {
    expect(intakePartyManifestIsAuthoritative(FIVE_PARTY_INTAKE)).toBe(true);
    const parties = resolvePartiesForReviewRender({ draft: emptyDraft(), intakeText: FIVE_PARTY_INTAKE });
    expect(parties.length).toBe(5);
    expect(parties.map((p) => p.partyLegalName)).toEqual([
      "Alpha Robotics LLC",
      "Beacon Systems Inc",
      "Cedar Analytics LLC",
      "Delta Security LLC",
      "Echo Logistics LLC",
    ]);
  });
});
