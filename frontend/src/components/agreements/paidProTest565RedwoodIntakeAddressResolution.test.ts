/** @vitest-environment jsdom */
/**
 * TEST565 — `[ADDRESS_1..4]` still survived after TEST564 for the *production* Redwood prompt.
 *
 * TEST564 gave `[ADDRESS_N]` an intake fallback (`resolveAuthoritativeAddressForContactSlot`), but its
 * address SOURCE (`parseAllStructuredPartyContactBlocks`) only parses `Party N` headers and em-dash
 * entity-inline lines. The live Redwood prompt uses a colon-inline shape:
 *
 *   `Redwood Biologics Inc: Emily Carter, Chief Executive Officer, emily.carter@x.com, 400 Genome Way,...`
 *
 * `parseAllStructuredPartyContactBlocks` returned ZERO blocks for that shape, so extraction was `[]`
 * and every `[ADDRESS_1..5]` survived to the boundary gate
 * (`document_boundary_blocked:unresolved_render_tokens:[ADDRESS_5]|[ADDRESS_1]|[ADDRESS_2]|[ADDRESS_3]|[ADDRESS_4]`).
 * TEST564's unit used labeled `Party N` blocks, which masked the gap.
 *
 * Hypotheses ruled out by trace: (A) TEST564 IS in HEAD; (B) intake IS threaded through
 * validatePaidProOutput_pre_freeze → applyPaidProDocumentBoundaryAuthority → applyPaidProNoticeContactAuthority
 * → enforceUserVisibleRenderTokenAuthority. The real defect is (C): colon-inline address extraction.
 *
 * Fix: `extractIntakeAddressesOrdered` parses the colon-inline production shape. `[ADDRESS_1..4]`
 * resolve from the original Redwood intake; a genuinely phantom `[ADDRESS_5]` stays unresolved.
 */
import { describe, expect, it } from "vitest";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import {
  enforceUserVisibleRenderTokenAuthority,
} from "./userVisibleRenderTokenAuthority";
import {
  extractIntakeAddressesOrdered,
  resolveAuthoritativeAddressForContactSlot,
} from "./paidProIntakeContactSubstitution";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

// EXACT production Redwood prompt shape (matches TEST550): `Entity[, form]: signer, title, email, addr`.
const P = [
  { legal: "Redwood Biologics Inc", role: "Client", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121" },
  { legal: "Summit AI Consulting LLC", form: "a Texas LLC", role: "Service Provider", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701" },
  { legal: "Blue Harbor Systems LLC", form: "an Illinois LLC", role: "Service Provider", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601" },
  { legal: "Iron Gate Security LLC", role: "Service Provider", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108" },
] as const;

const REDWOOD_INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  `${P[0].legal}, ${P[1].legal}, a Texas LLC, ${P[2].legal}, an Illinois LLC, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}${"form" in p ? `, ${(p as { form: string }).form}` : ""}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
  "Delaware governing law.",
].join("\n");

/** Authority parties WITHOUT addresses — the live pre-signer-setup freeze state. */
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

describe("TEST565 — Redwood colon-inline intake address resolution", () => {
  it("extractIntakeAddressesOrdered parses the colon-inline production shape", () => {
    const addrs = extractIntakeAddressesOrdered(REDWOOD_INTAKE);
    expect(addrs).toEqual(P.map((p) => p.addr));
  });

  it("resolveAuthoritativeAddressForContactSlot resolves 1..4 from Redwood intake, 5 stays null", () => {
    const parties = partiesNoAddress();
    for (let s = 1; s <= 4; s++) {
      expect(resolveAuthoritativeAddressForContactSlot(s, REDWOOD_INTAKE, parties)).toBe(P[s - 1].addr);
    }
    expect(resolveAuthoritativeAddressForContactSlot(5, REDWOOD_INTAKE, parties)).toBeNull();
  });

  it("terminal render-token gate resolves [ADDRESS_1..4] from Redwood intake (empty authority addresses)", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const inline =
      "Client office at [ADDRESS_1]; Providers at [ADDRESS_2], [ADDRESS_3], and [ADDRESS_4].";
    const gate = enforceUserVisibleRenderTokenAuthority(inline, {
      intakeRaw: REDWOOD_INTAKE,
      parties: partiesNoAddress(),
      partyNames: P.map((p) => p.legal),
      surface: "test565_gate",
      blockOnUnresolved: true,
    });
    expect(gate.ok).toBe(true);
    expect(gate.unresolvedTokens).toEqual([]);
    for (const p of P) expect(gate.text).toContain(p.addr);
  });

  it("boundary path resolves [ADDRESS_1..4] from intake; only phantom [ADDRESS_5] remains unresolved", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    // Inline recital references outside notice stanzas — the render-token gate (not notice rebuild)
    // must resolve them, exercising the exact boundary→notice→render chain the live freeze uses.
    const recital =
      `This Agreement is entered into by and among ${P[0].legal} (with offices at [ADDRESS_1]), ` +
      `${P[1].legal} (at [ADDRESS_2]), ${P[2].legal} (at [ADDRESS_3]), and ${P[3].legal} (at [ADDRESS_4]). ` +
      "A prior draft referenced a fifth counterparty at [ADDRESS_5].";

    const resolved = applyPaidProDocumentBoundaryAuthority(recital, {
      draft: draftNoAddress(),
      intakeText: REDWOOD_INTAKE,
      surface: "test565_boundary",
      blockOnUnresolved: false,
    });
    // 1..4 resolved from the Redwood intake; only the genuine phantom survives.
    expect(resolved.unresolvedRenderTokens).toEqual(["[ADDRESS_5]"]);
    for (const p of P) expect(resolved.text).toContain(p.addr);
    expect(resolved.text).not.toMatch(/\[ADDRESS_[1-4]\]/);
  });
});
