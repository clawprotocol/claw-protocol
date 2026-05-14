/**
 * Premium / Pro identity placeholder hydration — regression for internal tokens
 * ([ORG_n], ORG_1, {{entity_1}}, etc.) leaking into user-visible agreement text.
 *
 * Root cause addressed elsewhere:
 *   • Context-only substitution used `extractAgreementEntityCandidates`, which does not
 *     reliably produce an ordered slot list for multi-party Oxford intakes.
 *   • `normalizeAgreementDraftFromApi` did not scrub `premium_full_document_text` and
 *     related corpus fields — only title/purpose/payment_terms.
 *
 * This file pins the invariant: structured `parties[]` drives slot hydration at the
 * final API-normalize + review/recipient display boundaries.
 */

import { describe, expect, it } from "vitest";

import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import { resolveStarterPartyCountGuard } from "./starterPartyLimits";

const EXACT_SOFTWARE_INTEGRATION_PROMPT =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. Fee $47,500. Term 4 months. Governing law Oklahoma. Include confidentiality, ownership of deliverables after payment, termination rights, dispute resolution, and electronic signatures.";

function blankParsed(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  } as ParsedDraftShape;
}

function runStarterIntake(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(blankParsed(), intake, true, defaultIntakePartyRoleLabels());
}

describe("Premium identity placeholder hydration — exact production-failure prompt", () => {
  it("normalizeAgreementDraftFromApi scrubs [ORG_*] from premium body using structured parties + intake", () => {
    const structured = runStarterIntake(EXACT_SOFTWARE_INTEGRATION_PROMPT);
    const partyNames = (structured.parties || []).map((p) => p.name);
    expect(partyNames.length).toBe(5);
    expect(partyNames.some((n) => n.toLowerCase() === "foundryco inc.")).toBe(true);
    expect(partyNames.some((n) => n.includes("Beacon Operations"))).toBe(true);
    expect(partyNames.some((n) => n.toLowerCase().includes("apollo data services"))).toBe(true);
    expect(partyNames.some((n) => /Smith\s*&\s*Wesson/i.test(n))).toBe(true);
    expect(partyNames.some((n) => n.toLowerCase().includes("coastal reserve partners"))).toBe(true);

    const corruptPremiumBody = `
SOFTWARE INTEGRATION AGREEMENT

Between [ORG_1] and Beacon Operations and [ORG_6].

The parties [ORG_1], [ORG_3], and Smith & [ORG_4] agree to integrate systems.

Signature page:
_________________________
[ORG_1]

_________________________
[ORG_3]

_________________________
Smith & [ORG_4]

_________________________
{{entity_2}}
`.trim();

    const raw = {
      id: "ag_placeholder_hydration_test",
      title: structured.title || "Software Integration Agreement",
      jurisdiction: "Oklahoma",
      parties: structured.parties.map((p) => ({ name: p.name, role: p.role || "party" })),
      purpose: structured.purpose || "Integration scope.",
      payment_terms: structured.payment_terms || "Fee $47,500.",
      duration: structured.duration ?? "4 months",
      due_date: null,
      effective_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      versions: [],
      audit_log: [],
      intake_text: EXACT_SOFTWARE_INTEGRATION_PROMPT,
      premium_full_document_text: corruptPremiumBody,
      premium_server_full_document_text: null,
      server_full_document_text: null,
      document_text: null,
      rendered_document_text: null,
    };

    const draft = normalizeAgreementDraftFromApi(raw);
    expect(draft).toBeTruthy();
    const body = (draft!.premium_full_document_text || "").trim();

    expect(textContainsUnresolvedIdentityPlaceholders(body)).toBe(false);
    expect(body).not.toMatch(/\[ORG_\d+\]/i);
    expect(body).not.toMatch(/\{\{\s*entity/i);
    expect(body.toLowerCase()).toContain("foundryco");
    expect(body).toMatch(/Smith\s*&\s*Wesson/i);
    expect(body).not.toMatch(/Smith\s*&\s*Smith\s*&/i);
    expect(body).toMatch(/Beacon Operations.*Logistics Group LLC/i);
    expect((draft!.payment_terms || "").toLowerCase()).toMatch(/47|500/);
    expect((draft!.duration || "").toLowerCase()).toMatch(/4|month/);
    expect(draft!.jurisdiction).toMatch(/Oklahoma/i);

    // Party order: FoundryCo appears before Apollo in the hydrated body
    const iFoundry = body.toLowerCase().indexOf("foundryco");
    const iApollo = body.toLowerCase().indexOf("apollo data services");
    expect(iFoundry).toBeGreaterThanOrEqual(0);
    expect(iApollo).toBeGreaterThanOrEqual(0);
    expect(iFoundry).toBeLessThan(iApollo);
  });
});

describe("substitutePartyPlaceholdersInUserFacingText — authoritative party list", () => {
  it("maps [ORG_2] to the second authoritative party", () => {
    const auth = ["Alpha LLC", "Beta LLC", "Gamma LLC"];
    const out = substitutePartyPlaceholdersInUserFacingText(
      "Second party is [ORG_2].",
      "ignored when auth is complete",
      auth,
    );
    expect(out).toBe("Second party is Beta LLC.");
    expect(textContainsUnresolvedIdentityPlaceholders(out)).toBe(false);
  });

  it("does not split Smith & Wesson when hydrating [ORG_4] in the middle of a phrase", () => {
    const auth = ["A", "B", "C", "Smith & Wesson Holdings LLC", "E"];
    const out = substitutePartyPlaceholdersInUserFacingText(
      "Counterparty: Smith & [ORG_4] hereby agrees.",
      "",
      auth,
    );
    expect(out).toContain("Smith & Wesson Holdings LLC");
    expect(textContainsUnresolvedIdentityPlaceholders(out)).toBe(false);
  });
});

describe("Premium hydration — multi-party tier continuity unchanged", () => {
  it("7-party caution: guard still caution, all parties in structured draft", () => {
    const names = Array.from({ length: 7 }, (_, i) => `Atlas ${i + 1} LLC`);
    const intake = `Services agreement between ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}. Fee $7,500/month.`;
    const d = runStarterIntake(intake);
    const guard = resolveStarterPartyCountGuard(d.parties);
    expect(guard.status).toBe("caution");
    expect(d.parties.length).toBe(7);
  });

  it("13-party Pro-required: guard still requires_pro, all parties preserved", () => {
    const names = Array.from({ length: 13 }, (_, i) => `Delta ${i + 1} LLC`);
    const intake = `Services agreement between ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}. Fee $12,000/month.`;
    const d = runStarterIntake(intake);
    const guard = resolveStarterPartyCountGuard(d.parties);
    expect(guard.status).toBe("requires_pro");
    expect(d.parties.length).toBe(13);
  });
});
