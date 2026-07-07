/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  resolveAuthoritativeIntakePartyNames,
  resolveDeclaredExplicitPartyCount,
} from "./partySlotIdentityNormalize";
import {
  isAuthoritativeLegalEntityName,
  isPartyMetadataFieldLabelValue,
} from "./paidProPartyNamePreserve";
import {
  assertPaidProFreezeCandidateManifestCountAgreement,
  evaluatePaidProFreezeCandidateGates,
  isNonAuthoritativeFreezePartyName,
  previewRecoverPaidProFreezeCandidate,
  resolveAuthoritativeIntakeManifestCount,
  type PaidProFreezeCandidatePrepResult,
} from "./paidProFreezeCandidate";
import {
  TEST518_BLUE_HARBOR,
  TEST518_BLUE_HARBOR_ADDRESS,
  TEST518_IRON_GATE,
  TEST518_IRON_GATE_ADDRESS,
  TEST518_REDWOOD,
  TEST518_REDWOOD_ADDRESS,
  TEST518_SUMMIT,
  TEST518_SUMMIT_ADDRESS,
} from "./paidProTest518Fixtures";

/**
 * TEST536 production intake shape: `Entity (Role)` headings followed by stacked
 * `Address:` / `Authorized Signer:` / `Signer Title:` / `Email:` metadata blocks.
 * This is the shape that drifted the manifest to 2/3/5 parties (Party 1 dropped, the
 * address line and signer name leaking in as phantom parties).
 */
export const TEST536_SIGNER_BLOCK_INTAKE = [
  "Create a Professional Technology Services and AI Implementation Agreement between the following four parties:",
  "",
  `${TEST518_REDWOOD} (Client)`,
  `Address: ${TEST518_REDWOOD_ADDRESS}`,
  "Authorized Signer: Dana Whitfield",
  "Signer Title: Chief Executive Officer",
  "Email: dana.whitfield@redwoodbio.com",
  "",
  `${TEST518_SUMMIT} (Lead Provider)`,
  `Address: ${TEST518_SUMMIT_ADDRESS}`,
  "Authorized Signer: Marcus Lee",
  "Signer Title: Managing Partner",
  "Email: marcus.lee@summitai.com",
  "",
  `${TEST518_BLUE_HARBOR} (Implementation Partner)`,
  `Address: ${TEST518_BLUE_HARBOR_ADDRESS}`,
  "Authorized Signer: Priya Nair",
  "Signer Title: VP Engineering",
  "Email: priya.nair@blueharbor.com",
  "",
  `${TEST518_IRON_GATE} (Cybersecurity Auditor)`,
  `Address: ${TEST518_IRON_GATE_ADDRESS}`,
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

const CANONICAL_FOUR = [TEST518_REDWOOD, TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE];

const normalizeForMatch = (s: string) =>
  s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

function partyEquals(a: string, b: string): boolean {
  return normalizeForMatch(a) === normalizeForMatch(b);
}

function snapshotParties(names: readonly string[]): CanonicalAgreementSnapshotParty[] {
  return names.map((name) => ({ name, role: null, email: null, partyAddress: null }));
}

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

function makePrep(names: readonly string[]): PaidProFreezeCandidatePrepResult {
  return {
    text: "PLACEHOLDER CORPUS",
    hash: "0:test",
    reviewParties: reviewParties(names),
    parties: snapshotParties(names),
    repairs: [],
  };
}

function draftWith(names: readonly string[]): ParsedDraftShape {
  return {
    title: "Professional Technology Services and AI Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: names.map((name, i) => ({
      name,
      role: i === 0 ? "Client" : "party",
    })) as never[],
    purpose: "AI implementation services.",
    payment_terms: "$450,000 milestone installments",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 450000, cadence: "milestone", valid: true },
  };
}

describe("TEST536 — authoritative intake manifest party count", () => {
  // A. Full prompt with 4 legal parties plus signer names/titles/emails produces intakeManifestCount 4.
  it("A. resolves exactly the 4 declared legal parties in canonical order (signer/email blocks ignored)", () => {
    expect(resolveDeclaredExplicitPartyCount(TEST536_SIGNER_BLOCK_INTAKE)).toBe(4);
    expect(resolveAuthoritativeIntakeManifestCount(TEST536_SIGNER_BLOCK_INTAKE)).toBe(4);

    const names = resolveAuthoritativeIntakePartyNames(TEST536_SIGNER_BLOCK_INTAKE);
    expect(names).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(partyEquals(names[i]!, CANONICAL_FOUR[i]!)).toBe(true);
    }
    // Redwood (Party 1 / Client) is present and first — no role-shift, no dropped party.
    expect(partyEquals(names[0]!, TEST518_REDWOOD)).toBe(true);
  });

  // B. Authorized Signer / Email / Address lines do not become parties.
  it("B. signer/contact metadata field lines are never treated as legal entities", () => {
    for (const meta of [
      `Address: ${TEST518_REDWOOD_ADDRESS}`,
      "Authorized Signer: Dana Whitfield",
      "Signer Title: Chief Executive Officer",
      "Email: dana.whitfield@redwoodbio.com",
    ]) {
      expect(isPartyMetadataFieldLabelValue(meta)).toBe(true);
      expect(isAuthoritativeLegalEntityName(meta)).toBe(false);
    }
    const names = resolveAuthoritativeIntakePartyNames(TEST536_SIGNER_BLOCK_INTAKE);
    for (const n of names) {
      expect(isPartyMetadataFieldLabelValue(n)).toBe(false);
      expect(/discovery parkway|whitfield|@/i.test(n)).toBe(false);
    }
  });

  // C. deterministic_recovery_freeze_candidate cannot be accepted when the corpus party count
  //    disagrees with the 4-party intake manifest (phantom fifth party, or a dropped party).
  it("C. rejects a freeze candidate whose corpus party count disagrees with the 4-party intake manifest", () => {
    // Phantom fifth party (canonical 5) for a 4-party intake.
    const fivePartyPrep = makePrep([...CANONICAL_FOUR, "Scope Inc."]);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(fivePartyPrep, {
        text: fivePartyPrep.text,
        intakeText: TEST536_SIGNER_BLOCK_INTAKE,
        draft: draftWith(CANONICAL_FOUR.slice(0, 3)),
      }),
    ).toThrow(/authority_party_count_mismatch/);

    // Dropped party (corpus 3) — the exact production drift that was wrongly accepted:true.
    const threePartyPrep = makePrep([TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE]);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(threePartyPrep, {
        text: threePartyPrep.text,
        intakeText: TEST536_SIGNER_BLOCK_INTAKE,
        draft: draftWith(CANONICAL_FOUR.slice(0, 3)),
      }),
    ).toThrow(/authority_party_count_mismatch/);

    // Via the non-throwing pipeline evaluator, the mismatch surfaces as ok:false with a reason.
    const gated = evaluatePaidProFreezeCandidateGates(fivePartyPrep, {
      text: fivePartyPrep.text,
      intakeText: TEST536_SIGNER_BLOCK_INTAKE,
      draft: draftWith(CANONICAL_FOUR.slice(0, 3)),
    });
    expect(gated.ok).toBe(false);
    expect(gated.rejectReason).toBeTruthy();
  });

  // D. "Party 1" cannot be used as resolvedLegal in notice/party authority.
  it("D. rejects a freeze candidate that carries a 'Party 1' placeholder legal entity", () => {
    expect(isNonAuthoritativeFreezePartyName("Party 1")).toBe(true);
    expect(isNonAuthoritativeFreezePartyName(TEST518_REDWOOD)).toBe(false);

    const placeholderPrep = makePrep([TEST518_REDWOOD, TEST518_SUMMIT, TEST518_BLUE_HARBOR, "Party 1"]);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(placeholderPrep, {
        text: placeholderPrep.text,
        intakeText: TEST536_SIGNER_BLOCK_INTAKE,
        draft: draftWith(CANONICAL_FOUR),
      }),
    ).toThrow(/authority_placeholder_legal_entity/);
  });

  // E. A rejected deterministic recovery candidate returns ok:false (routes to premium retry, not blank review).
  it("E. deterministic recovery on a drifted draft is rejected, not silently accepted", () => {
    const drifted = draftWith([TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE]); // Redwood dropped
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: drifted,
      intakeText: TEST536_SIGNER_BLOCK_INTAKE,
    });
    expect(recovery.ok).toBe(false);
    expect(recovery.rejectReason).toBeTruthy();
  });

  // F. A valid, fully-consistent 4-party candidate passes the manifest gate (no false rejects).
  it("F. a consistent 4-party candidate/draft satisfies the manifest gate", () => {
    const prep = makePrep(CANONICAL_FOUR);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(prep, {
        text: prep.text,
        intakeText: TEST536_SIGNER_BLOCK_INTAKE,
        draft: draftWith(CANONICAL_FOUR),
      }),
    ).not.toThrow();
  });

  // Guard: 2-party intakes are outside the multi-party manifest gate (no over-reach).
  it("does not activate the manifest gate for non-multi-party intakes", () => {
    const twoPartyIntake =
      "Create a services agreement between Acme Robotics LLC and Beacon Systems Inc.";
    expect(resolveAuthoritativeIntakeManifestCount(twoPartyIntake)).toBe(0);
    const prep = makePrep(["Acme Robotics LLC"]);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(prep, {
        text: prep.text,
        intakeText: twoPartyIntake,
        draft: draftWith(["Acme Robotics LLC", "Beacon Systems Inc."]),
      }),
    ).not.toThrow();
  });
});
