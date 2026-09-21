/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  extractIntakePartyManifestRows,
  intakePartyManifestIsAuthoritative,
  buildSignerMetadataPartiesFromIntakeManifest,
} from "./intakePartyManifestAuthority";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import {
  isAuthoritativeLegalEntityName,
  isPartyMetadataRoleLabel,
} from "./paidProPartyNamePreserve";
import {
  isNonAuthoritativeFreezePartyName,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import {
  TEST518_BLUE_HARBOR,
  TEST518_IRON_GATE,
  TEST518_REDWOOD,
  TEST518_SUMMIT,
} from "./paidProTest518Fixtures";
import { TEST536_SIGNER_BLOCK_INTAKE } from "./paidProTest536ManifestAuthorityGate.test";

/**
 * TEST537 — post-fc67701d, recovery still drifted a canonical 4-party manifest into a
 * 5-party / "Party 1" notice authority. Root cause: `extractIntakePartyManifestRows` parsed the
 * stacked per-party metadata lines ("Address: …", "Signer Title: …") as party manifest rows —
 * seeding phantom parties from street addresses / job titles and dropping the real legal entities.
 * That garbage manifest overrode notice/signature authority downstream.
 *
 * This exercises the exact live intake shape: `Entity (Role)` heading lines followed by stacked
 * Address / Authorized Signer / Signer Title / Email metadata.
 */
const CANONICAL_FOUR = [TEST518_REDWOOD, TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE];

const normalizeForMatch = (s: string) =>
  s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

function partyEquals(a: string, b: string): boolean {
  return normalizeForMatch(a) === normalizeForMatch(b);
}

function draftWith(names: readonly string[]): ParsedDraftShape {
  return {
    title: "Professional Technology Services and AI Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: names.map((name, i) => ({ name, role: i === 0 ? "Client" : "party" })) as never[],
    purpose: "AI implementation services.",
    payment_terms: "$450,000 milestone installments",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 450000, cadence: "milestone", valid: true },
  };
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

describe("TEST537 — manifest recovery drift (metadata lines as phantom parties)", () => {
  // Metadata field labels used as colon "roles" or paren labels are never party roles.
  it("classifies per-party metadata labels as non-party role labels", () => {
    for (const label of [
      "Address",
      "Mailing Address",
      "Authorized Signer",
      "Signer Name",
      "Signer Title",
      "Signer Email",
      "Email",
      "Phone",
      "Attn",
      "Contact",
      "Title",
    ]) {
      expect(isPartyMetadataRoleLabel(label)).toBe(true);
    }
    for (const role of ["Client", "Lead Provider", "Implementation Partner", "Cybersecurity Auditor"]) {
      expect(isPartyMetadataRoleLabel(role)).toBe(false);
    }
  });

  // A. The intake manifest resolves exactly the 4 legal parties in order — no phantom rows from
  //    Address/Signer Title lines, no dropped real party.
  it("A. extracts exactly the 4 canonical parties (no Address/Signer-Title phantom rows)", () => {
    const rows = extractIntakePartyManifestRows(TEST536_SIGNER_BLOCK_INTAKE);
    expect(rows).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(partyEquals(rows[i]!.partyLegalName, CANONICAL_FOUR[i]!)).toBe(true);
    }
    // No street address or job title leaked in as a legal entity.
    for (const row of rows) {
      expect(/discovery parkway|legacy drive|monroe|greensboro|chief|officer|manager|partner engineering/i.test(
        row.partyLegalName,
      )).toBe(false);
      expect(isAuthoritativeLegalEntityName(row.partyLegalName)).toBe(true);
    }
  });

  it("rejects numbered section headings and keeps numbered legal-party lines", () => {
    const headingBody = [
      'This Agreement is between Redwood Biologics, Inc. ("Client") and Summit AI Consulting LLC.',
      "2. SCOPE OF SERVICES. Service Provider shall perform consulting services.",
      "4. TERM AND TERMINATION. The term is twelve months.",
    ].join("\n");
    const headingRows = extractIntakePartyManifestRows(headingBody);
    expect(headingRows.some((row) => /scope of services/i.test(row.partyLegalName))).toBe(false);
    expect(headingRows.some((row) => /term and termination/i.test(row.partyLegalName))).toBe(false);
    expect(intakePartyManifestIsAuthoritative(headingBody)).toBe(false);

    const numberedParty = "2. Summit AI Consulting LLC (Lead Provider)";
    const partyRows = extractIntakePartyManifestRows(numberedParty);
    expect(partyRows).toHaveLength(1);
    expect(partyEquals(partyRows[0]!.partyLegalName, TEST518_SUMMIT)).toBe(true);
    expect(partyRows[0]!.roleLabel).toMatch(/lead provider/i);
  });

  // B. Manifest is authoritative and yields the 4 real entities (with roles), not 5/6 metadata rows.
  it("B. intake manifest is authoritative with the 4 real entities and their roles", () => {
    expect(intakePartyManifestIsAuthoritative(TEST536_SIGNER_BLOCK_INTAKE)).toBe(true);
    const parties = buildSignerMetadataPartiesFromIntakeManifest(TEST536_SIGNER_BLOCK_INTAKE);
    expect(parties).toHaveLength(4);
    const rows = extractIntakePartyManifestRows(TEST536_SIGNER_BLOCK_INTAKE);
    expect(rows.map((r) => r.roleLabel)).toEqual([
      "Client",
      "Lead Provider",
      "Implementation Partner",
      "Cybersecurity Auditor",
    ]);
  });

  // C. Notice structural validation authority stays at 4 — never inflates to 5, never a "Party 1".
  it("C. notice structural validation parties resolve to the 4-party manifest (no phantom 5th, no Party 1)", () => {
    const resolved = resolveNoticeStructuralValidationParties(reviewParties(CANONICAL_FOUR), {
      intakeText: TEST536_SIGNER_BLOCK_INTAKE,
      draftPartyNames: CANONICAL_FOUR,
      acceptedCorpus: null,
    });
    expect(resolved).toHaveLength(4);
    for (const p of resolved) {
      expect(isNonAuthoritativeFreezePartyName(p.partyLegalName)).toBe(false);
      expect(/^party\s*\d+$/i.test(p.partyLegalName.trim())).toBe(false);
    }
    // Even if a corpus-derived phantom 5th party is offered, the manifest caps authority at 4.
    const withPhantom = resolveNoticeStructuralValidationParties(
      reviewParties([...CANONICAL_FOUR, "Scope Analytics Inc."]),
      {
        intakeText: TEST536_SIGNER_BLOCK_INTAKE,
        draftPartyNames: CANONICAL_FOUR,
        acceptedCorpus: null,
      },
    );
    expect(withPhantom).toHaveLength(4);
  });

  // D/E/F. The exact live chain: canonical manifest = 4, server_full short/degraded, deterministic
  //    recovery attempt → produces a 4-party corpus (no Party 1, no partyCount 5). Either a valid
  //    4-party review renders (ok), or it stays retry-terminal for a substantive reason that is NOT
  //    missing_party_notice_stanzas.
  it("D. deterministic recovery yields a 4-party aligned corpus or a substantive retry (never missing_party_notice_stanzas / partyCount 5 / Party 1)", () => {
    const drifted = draftWith([TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE]); // Redwood dropped
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: drifted,
      intakeText: TEST536_SIGNER_BLOCK_INTAKE,
    });

    if (recovery.ok) {
      expect(recovery.parties).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(partyEquals(recovery.parties[i]!.name, CANONICAL_FOUR[i]!)).toBe(true);
      }
      for (const p of recovery.parties) {
        expect(isNonAuthoritativeFreezePartyName(p.name)).toBe(false);
      }
    } else {
      // Retry-terminal is only acceptable for a substantive reason, never the count-drift symptoms.
      expect(recovery.rejectReason).toBeTruthy();
      expect(recovery.rejectReason).not.toMatch(/missing_party_notice_stanzas/);
      expect(recovery.rejectReason).not.toMatch(/excess_party_notice_stanzas/);
    }
  });

  // Guard: a genuinely valid 4-party draft recovers cleanly (no false rejects introduced).
  it("E. a consistent 4-party draft recovers to a valid 4-party candidate", () => {
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: draftWith(CANONICAL_FOUR),
      intakeText: TEST536_SIGNER_BLOCK_INTAKE,
    });
    expect(recovery.ok).toBe(true);
    expect(recovery.parties).toHaveLength(4);
  });
});
