/** @vitest-environment jsdom */
/**
 * TEST566 — chronic live blank-review after TEST565. The 41k/39k substantive server_full_draft was
 * rejected because `[ADDRESS_1]`, `[ADDRESS_2]`, `[ADDRESS_5]` survived into the boundary/placeholder
 * gates. TEST565 fixed the *colon-inline* shape; the live prompt is the **role-header multiline** shape:
 *
 *   Client:
 *   Redwood Biologics, Inc., a Delaware corporation, 710 Discovery Parkway, Raleigh, NC 27609.
 *   Authorized signer: Emily Carter, Chief Executive Officer, emily.carter@redwoodbiologics.com
 *
 * Here the address is on the *entity* line (no email) and the email is on a separate `Authorized signer:`
 * line. `parseAllStructuredPartyContactBlocks` returned ZERO blocks and the TEST565 colon-inline parser
 * did not match, so `extractIntakeAddressesOrdered` was `[]` and every `[ADDRESS_1..5]` survived to
 * `validatePaidProOutput_pre_freeze`
 * (`document_boundary_blocked:unresolved_render_tokens:[ADDRESS_5]|[ADDRESS_1]|[ADDRESS_2]`).
 *
 * Trace verdict: (A) TEST564/565 are in HEAD; (B) intake IS threaded through the boundary/notice/
 * render chain. The defect was (C): address extraction could not read the role-header entity-line shape.
 *
 * Fix: `extractIntakeAddressesOrdered` parses the role-header entity line (street-tail after the legal
 * form). `[ADDRESS_1..4]` resolve from intake; a genuinely phantom `[ADDRESS_5]` stays unresolved and
 * the block reason is specific to it, with a location context window in the diagnostics.
 */
import { describe, expect, it } from "vitest";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { enforceUserVisibleRenderTokenAuthority } from "./userVisibleRenderTokenAuthority";
import {
  extractIntakeAddressesOrdered,
  resolveAuthoritativeAddressForContactSlot,
} from "./paidProIntakeContactSubstitution";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const P = [
  { legal: "Redwood Biologics, Inc.", role: "Client", roleHeader: "Client", form: "a Delaware corporation", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "710 Discovery Parkway, Raleigh, NC 27609" },
  { legal: "Summit AI Consulting LLC", role: "Service Provider", roleHeader: "Lead Provider", form: "a Texas LLC", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1880 Legacy Drive, Plano, TX 75024" },
  { legal: "Blue Harbor Systems LLC", role: "Service Provider", roleHeader: "Implementation Partner", form: "an Illinois LLC", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "210 West Monroe Street, Chicago, IL 60606" },
  { legal: "Iron Gate Security LLC", role: "Service Provider", roleHeader: "Cybersecurity Auditor", form: "a Virginia LLC", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "8300 Greensboro Drive, McLean, VA 22102" },
] as const;

// EXACT live role-header multiline prompt shape.
const REDWOOD_INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  "",
  ...P.flatMap((p) => [
    `${p.roleHeader}:`,
    `${p.legal}, ${p.form}, ${p.addr}.`,
    `Authorized signer: ${p.signer}, ${p.title}, ${p.email}`,
    "",
  ]),
  "Delaware governing law.",
].join("\n");

function partiesNoAddress(): PaidProSignerMetadataParty[] {
  return P.map((p, i) => ({
    partyIndex: i,
    partyLegalName: p.legal,
    signerEmail: p.email,
    signerName: p.signer,
    signerTitle: p.title,
    partyAddress: "",
  }));
}

function draftNoAddress(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: P.map((p) => ({ name: p.legal, role: p.role, email: p.email })) as never,
    purpose: "AI workflow automation, ERP integration, and cybersecurity services across four parties.",
    payment_terms: "Milestone-based fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 480000, cadence: "monthly", valid: true },
  } as ParsedDraftShape;
}

describe("TEST566 — role-header multiline intake address resolution", () => {
  it("extractIntakeAddressesOrdered parses all four addresses from the role-header entity lines", () => {
    expect(extractIntakeAddressesOrdered(REDWOOD_INTAKE)).toEqual(P.map((p) => p.addr));
  });

  it("resolveAuthoritativeAddressForContactSlot: authority partyAddress wins, else intake, phantom stays null", () => {
    // Authority partyAddress wins when present.
    const withOne = partiesNoAddress();
    withOne[0]!.partyAddress = "999 Override Blvd, Nowhere, NV 00000";
    expect(resolveAuthoritativeAddressForContactSlot(1, REDWOOD_INTAKE, withOne)).toBe(
      "999 Override Blvd, Nowhere, NV 00000",
    );
    // Empty authority → intake fallback for 1..4; 5 is phantom.
    const empty = partiesNoAddress();
    for (let s = 1; s <= 4; s++) {
      expect(resolveAuthoritativeAddressForContactSlot(s, REDWOOD_INTAKE, empty)).toBe(P[s - 1].addr);
    }
    expect(resolveAuthoritativeAddressForContactSlot(5, REDWOOD_INTAKE, empty)).toBeNull();
  });

  it("terminal gate resolves [ADDRESS_1..4] from the role-header intake (empty authority addresses)", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const inline = "Client at [ADDRESS_1]; providers at [ADDRESS_2], [ADDRESS_3], and [ADDRESS_4].";
    const gate = enforceUserVisibleRenderTokenAuthority(inline, {
      intakeRaw: REDWOOD_INTAKE,
      parties: partiesNoAddress(),
      partyNames: P.map((p) => p.legal),
      surface: "test566_gate",
      blockOnUnresolved: true,
    });
    expect(gate.ok).toBe(true);
    expect(gate.unresolvedTokens).toEqual([]);
    for (const p of P) expect(gate.text).toContain(p.addr);
  });

  it("FULL boundary path resolves [ADDRESS_1..4]; only phantom [ADDRESS_5] remains, location-aware", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const recital =
      `This Agreement is entered into among ${P[0].legal} (with offices at [ADDRESS_1]), ` +
      `${P[1].legal} (at [ADDRESS_2]), ${P[2].legal} (at [ADDRESS_3]), and ${P[3].legal} (at [ADDRESS_4]). ` +
      "A prior draft referenced a fifth counterparty at [ADDRESS_5].";
    const res = applyPaidProDocumentBoundaryAuthority(recital, {
      draft: draftNoAddress(),
      intakeText: REDWOOD_INTAKE,
      surface: "test566_boundary",
      blockOnUnresolved: false,
    });
    expect(res.unresolvedRenderTokens).toEqual(["[ADDRESS_5]"]);
    for (const p of P) expect(res.text).toContain(p.addr);
    expect(res.text).not.toMatch(/\[ADDRESS_[1-4]\]/);
    // [ADDRESS_5] survivor is still present in the final corpus (real body clause → keep rejection).
    expect(res.text).toContain("[ADDRESS_5]");
  });

  it("clean 4-party corpus (all [ADDRESS_1..4], no phantom) has zero unresolved tokens through the boundary path", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const recital =
      `This Agreement is entered into among ${P[0].legal} (at [ADDRESS_1]), ` +
      `${P[1].legal} (at [ADDRESS_2]), ${P[2].legal} (at [ADDRESS_3]), and ${P[3].legal} (at [ADDRESS_4]).`;
    const res = applyPaidProDocumentBoundaryAuthority(recital, {
      draft: draftNoAddress(),
      intakeText: REDWOOD_INTAKE,
      surface: "test566_boundary_clean",
      blockOnUnresolved: false,
    });
    expect(res.unresolvedRenderTokens).toEqual([]);
    expect(res.text).not.toMatch(/\[ADDRESS_\d+\]/);
    for (const p of P) expect(res.text).toContain(p.addr);
  });
});
