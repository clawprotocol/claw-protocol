/** @vitest-environment jsdom */
/**
 * TEST564 — unresolved `[ADDRESS_N]` render tokens (the live
 * `document_boundary_blocked:unresolved_render_tokens:[ADDRESS_5]|[ADDRESS_1]|[ADDRESS_2]`).
 *
 * Forensic finding (proven by runtime isolation of the terminal render-token gate — the exact
 * function whose survivors drive `applyPaidProDocumentBoundaryAuthority`'s `contact.ok === false`):
 *
 *  • `[ADDRESS_N]` tokens are model/server-emitted; NO frontend code produces them.
 *  • The bracket and mustache resolvers resolved addresses ONLY from `parties[slot-1].partyAddress`,
 *    with no intake fallback — unlike `[EMAIL_N]`, which already falls back to intake-listed emails.
 *  • So a 4-party corpus whose intake explicitly lists every address still left `[ADDRESS_1]`/`[ADDRESS_2]`
 *    (real slots whose authority `partyAddress` was empty) unresolved, and `[ADDRESS_5]` (a phantom
 *    slot beyond the 4-party manifest) can never resolve — the exact 1/2/5-survive, 3/4-resolve pattern.
 *
 * Fix: `resolveAuthoritativeAddressForContactSlot` gives `[ADDRESS_N]` the same intake fallback as
 * `[EMAIL_N]`. Real slots resolve from the intake; a genuinely phantom slot with no party AND no intake
 * address stays unresolved and continues to block (validation is not weakened; tokens are not ignored).
 */
import { describe, expect, it } from "vitest";
import {
  enforceUserVisibleRenderTokenAuthority,
  scanUnresolvedRenderTokens,
} from "./userVisibleRenderTokenAuthority";
import { resolveAuthoritativeAddressForContactSlot } from "./paidProIntakeContactSubstitution";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";

const P = [
  { legal: "Redwood Biologics Inc", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121" },
  { legal: "Summit AI Consulting LLC", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701" },
  { legal: "Blue Harbor Systems LLC", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601" },
  { legal: "Iron Gate Security LLC", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108" },
] as const;

// Labeled `Party N` intake blocks — the authoritative address source the notice rebuild already uses.
// Governing law leads (a trailing line would be swallowed by the multiline-address parser).
const INTAKE = [
  "Create a professional technology services and AI integration agreement for four parties.",
  "Delaware governing law.",
  "",
  ...P.flatMap((p, i) => [
    `Party ${i + 1}:`,
    `Legal Entity: ${p.legal}`,
    `Signer Name: ${p.signer}`,
    `Title: ${p.title}`,
    `Email: ${p.email}`,
    `Address: ${p.addr}`,
    "",
  ]),
].join("\n");

/** Authority parties with EMPTY partyAddress — the pre-signer-setup freeze state. */
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

describe("TEST564 — [ADDRESS_N] intake fallback", () => {
  it("resolveAuthoritativeAddressForContactSlot: real slots resolve from intake, phantom stays null", () => {
    const parties = partiesNoAddress();
    expect(resolveAuthoritativeAddressForContactSlot(1, INTAKE, parties)).toContain(P[0].addr);
    expect(resolveAuthoritativeAddressForContactSlot(2, INTAKE, parties)).toContain(P[1].addr);
    expect(resolveAuthoritativeAddressForContactSlot(3, INTAKE, parties)).toContain(P[2].addr);
    expect(resolveAuthoritativeAddressForContactSlot(4, INTAKE, parties)).toContain(P[3].addr);
    // Phantom slot beyond the 4-party manifest has no party AND no intake address → unresolved.
    expect(resolveAuthoritativeAddressForContactSlot(5, INTAKE, parties)).toBeNull();
    // Authority partyAddress wins over intake when present.
    const withAddr = parties.map((p, i) => ({ ...p, partyAddress: `AUTH ${i + 1} St` }));
    expect(resolveAuthoritativeAddressForContactSlot(1, INTAKE, withAddr)).toBe("AUTH 1 St");
  });

  it("terminal gate resolves [ADDRESS_1..4] from intake when authority partyAddress is empty", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    // Tokens INLINE in prose (not `Address:` lines, not money) so notice/omit/money passes cannot mask them —
    // this is the exact resolver surface that feeds document-boundary `contact.ok`.
    const inline =
      "The Client's principal office is at [ADDRESS_1]; the Service Providers operate at " +
      "[ADDRESS_2], [ADDRESS_3], and [ADDRESS_4] respectively.";
    const gate = enforceUserVisibleRenderTokenAuthority(inline, {
      intakeRaw: INTAKE,
      parties: partiesNoAddress(),
      partyNames: P.map((p) => p.legal),
      surface: "test564_intake_fallback",
      blockOnUnresolved: true,
    });
    expect(gate.ok).toBe(true);
    expect(gate.unresolvedTokens).toEqual([]);
    for (const p of P) expect(gate.text).toContain(p.addr);
    expect(gate.text).not.toMatch(/\[ADDRESS_\d+\]/);
  });

  it("terminal gate still blocks a phantom [ADDRESS_5] with no party and no intake address", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const inline =
      "The Client's principal office is at [ADDRESS_1]; a prior draft referenced a fifth " +
      "counterparty at [ADDRESS_5].";
    const gate = enforceUserVisibleRenderTokenAuthority(inline, {
      intakeRaw: INTAKE,
      parties: partiesNoAddress(),
      partyNames: P.map((p) => p.legal),
      surface: "test564_phantom",
      blockOnUnresolved: true,
    });
    // Real slot 1 resolved from intake; only the genuinely phantom slot remains — not ignored.
    expect(gate.ok).toBe(false);
    expect(gate.blocked).toBe(true);
    expect(gate.text).toContain(P[0].addr);
    expect(gate.unresolvedTokens).toEqual(["[ADDRESS_5]"]);
    expect(scanUnresolvedRenderTokens(gate.text).map((m) => m.token)).toContain("[ADDRESS_5]");
  });
});
