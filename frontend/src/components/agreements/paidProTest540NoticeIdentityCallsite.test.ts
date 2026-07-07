/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  enforceUserVisibleRenderTokenAuthority,
} from "./userVisibleRenderTokenAuthority";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { intakePartyManifestIsAuthoritative } from "./intakePartyManifestAuthority";
import {
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";

/**
 * TEST540 — the live "Party 1" regression that survived TEST539.
 *
 * Root cause (found by instrumenting every `resolveNoticeStanzaLegalEntity()` callsite): the
 * terminal render-token gate `enforceUserVisibleRenderTokenAuthority` called
 * `repairIncompleteIfToNoticeStanzas(out, parties)` WITHOUT a role context — dropping the
 * authoritative intake identity even though `ctx.intakeRaw` was in scope. When `parties` was
 * rebuilt from a contaminated consumed-authority snapshot (a "Party 1" placeholder in slot 0), the
 * notice resolver had no manifest to recover the real entity and degraded slot 0 to "Party 1",
 * producing `[paid-pro-notice-entity-missing] { partyIndex: 0, resolvedLegal: "Party 1" }` and a
 * `missing_party_notice_stanzas` rejection.
 *
 * Fix (in the CALLER, not the resolver): thread a role context carrying `ctx.intakeRaw` into the
 * notice repair so the manifest can restore the canonical entity for the contaminated slot.
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
    hash: "test540",
    updatedAt: Date.now(),
  } as never);
}

function placeholderNoticesCorpus(): string {
  return [
    "10. NOTICES",
    "All notices under this Agreement shall be in writing and delivered to the following:",
    "",
    "If to Party 1:",
    "Party 1",
    "",
  ].join("\n");
}

describe("TEST540 — notice identity callsite threads intake authority", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  // A. The exact failing callsite: enforceUserVisibleRenderTokenAuthority rebuilds parties from a
  //    contaminated consumed authority (Party 1 @ slot 0) but the intake manifest is threaded, so
  //    the notice repair restores the real entity instead of emitting "Party 1".
  it("A. enforceUserVisibleRenderTokenAuthority restores slot-0 identity from intake (no Party 1)", () => {
    contaminateConsumedAuthority(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]);
    // No `parties` passed → the gate falls back to the contaminated consumed authority snapshot.
    const out = enforceUserVisibleRenderTokenAuthority(placeholderNoticesCorpus(), {
      intakeRaw: INTAKE,
      surface: "test540_gate",
      blockOnUnresolved: false,
    });
    expect(out.text).toContain("If to Redwood Biologics Inc:");
    expect(out.text).not.toMatch(/If to Party 1:/);
    expect(out.text).not.toMatch(/^Party 1$/m);
  });

  // B. Without any authoritative intake, a genuine placeholder is NOT synthesized into a real entity
  //    (fix does not fabricate identities; professional/thin fallbacks are untouched).
  it("B. no authoritative intake => placeholder is not turned into a real entity", () => {
    contaminateConsumedAuthority(["Party 1", "Party 2"]);
    const noManifest = "Draft a simple two-party services agreement.";
    expect(intakePartyManifestIsAuthoritative(noManifest)).toBe(false);
    const out = enforceUserVisibleRenderTokenAuthority(placeholderNoticesCorpus(), {
      intakeRaw: noManifest,
      surface: "test540_gate_no_manifest",
      blockOnUnresolved: false,
    });
    expect(out.text).not.toContain("Redwood Biologics Inc");
  });

  // C. repairIncompleteIfToNoticeStanzas — when the caller threads a role context with intake, a
  //    contaminated slot-0 party resolves to the real manifest entity; without it, it cannot.
  it("C. repairIncompleteIfToNoticeStanzas uses threaded intake to restore slot-0", () => {
    const contaminated = reviewParties(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]);
    const withIntake = repairIncompleteIfToNoticeStanzas(placeholderNoticesCorpus(), contaminated, {
      intakeText: INTAKE,
      draftPartyNames: FOUR,
      acceptedCorpus: null,
    });
    expect(withIntake.text).toContain("If to Redwood Biologics Inc:");
    expect(withIntake.text).not.toMatch(/If to Party 1:/);
  });

  // D. applyPaidProNoticeContactAuthority (the production wrapper that calls the render-token gate)
  //    produces no "Party 1" in the final notices even with a contaminated consumed authority.
  it("D. applyPaidProNoticeContactAuthority keeps canonical identities through the token gate", () => {
    contaminateConsumedAuthority(["Party 1", "Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC"]);
    const result = applyPaidProNoticeContactAuthority(placeholderNoticesCorpus(), {
      draft: null,
      intakeText: INTAKE,
      surface: "test540_notice_contact",
      blockOnUnresolved: false,
    });
    expect(result.text).not.toMatch(/If to Party 1:/);
    expect(result.text).not.toMatch(/^Party 1$/m);
    expect(result.text).toContain("Redwood Biologics Inc");
  });

  // E. Genuine 5-party intake is unaffected: the caller fix restores real entities for all slots
  //    and does not clamp/limit real expansions.
  it("E. genuine 5-party intake still resolves 5 real entities through the gate", () => {
    expect(intakePartyManifestIsAuthoritative(FIVE_PARTY_INTAKE)).toBe(true);
    contaminateConsumedAuthority(["Party 1", "Party 2", "Party 3", "Party 4", "Party 5"]);
    const corpus = [
      "10. NOTICES",
      "All notices under this Agreement shall be in writing and delivered to the following:",
      "",
      "If to Party 1:",
      "Party 1",
      "",
    ].join("\n");
    const out = enforceUserVisibleRenderTokenAuthority(corpus, {
      intakeRaw: FIVE_PARTY_INTAKE,
      surface: "test540_five",
      blockOnUnresolved: false,
    });
    for (const name of [
      "Alpha Robotics LLC",
      "Beacon Systems Inc",
      "Cedar Analytics LLC",
      "Delta Security LLC",
      "Echo Logistics LLC",
    ]) {
      expect(out.text).toContain(`If to ${name}:`);
    }
    expect(out.text).not.toMatch(/If to Party \d+:/);
  });
});
