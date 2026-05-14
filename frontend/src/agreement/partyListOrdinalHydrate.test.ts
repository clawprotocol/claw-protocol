import { describe, expect, it } from "vitest";

import {
  hydrateIdentityPlaceholdersInAgreementPreviewPlain,
} from "../components/agreements/agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "../components/agreements/intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "../components/agreements/partyRoleIntake";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import {
  hydratePartyListAndSignatureOrdinals,
  hydratePartyListLinesByOrdinal,
} from "./partyListOrdinalHydrate";
import { substitutePartyPlaceholdersInUserFacingText } from "./partyPlaceholderDisplay";

const EXACT_PROMPT =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. Fee $47,500. Term 4 months. Governing law Oklahoma. Include confidentiality, ownership of deliverables after payment, termination rights, dispute resolution, and electronic signatures.";

const AUTH = [
  "FoundryCo Inc.",
  "Beacon Operations And Logistics Group LLC",
  "Apollo Data Services LLC",
  "Smith & Wesson Holdings LLC",
  "Coastal Reserve Partners LP",
] as const;

const CORRUPT_PARTY_LIST = `
1. [ORG_1].
2. Beacon Operations and [ORG_6]
3. [ORG_3]
4. Smith & [ORG_4]
5. Coastal Reserve Partners Lp
`.trim();

const CORRUPT_SIGS = `
Signature page:
_________________________
[ORG_1]

_________________________
BEACON OPERATIONS AND Coastal Reserve Partners Lp

_________________________
[ORG_3]

_________________________
Smith & [ORG_4]

_________________________
COASTAL RESERVE PARTNERS LP
`.trim();

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

function structuredFromPrompt(): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(blankParsed(), EXACT_PROMPT, true, defaultIntakePartyRoleLabels());
}

describe("partyListOrdinalHydrate", () => {
  it("repairs numbered party list by ordinal (production corrupt list)", () => {
    const out = hydratePartyListLinesByOrdinal(CORRUPT_PARTY_LIST, AUTH);
    expect(out).toContain("1. FoundryCo Inc.");
    expect(out).toContain("2. Beacon Operations And Logistics Group LLC");
    expect(out).toContain("3. Apollo Data Services LLC");
    expect(out).toContain("4. Smith & Wesson Holdings LLC");
    expect(out).toContain("5. Coastal Reserve Partners LP");
    expect(out.toLowerCase()).not.toContain("beacon operations and coastal reserve");
  });

  it("repairs signature underline headings by ordinal order", () => {
    const out = hydratePartyListAndSignatureOrdinals(CORRUPT_SIGS, AUTH);
    expect(out).toContain("FoundryCo Inc.");
    expect(out).toContain("Beacon Operations And Logistics Group LLC");
    expect(out).toContain("Apollo Data Services LLC");
    expect(out).toContain("Smith & Wesson Holdings LLC");
    expect(out).toContain("Coastal Reserve Partners LP");
    expect(out).not.toMatch(/Foundryco Inc\.\./i);
    expect(out).not.toMatch(/SMITH &\s*Wesson.*SMITH &/i);
  });

  it("never emits Beacon Operations and Coastal Reserve Frankenstein on full hydrate pipeline", () => {
    const draft = structuredFromPrompt();
    const names = (draft.parties || []).map((p) => p.name);
    expect(names.length).toBe(5);
    const blob = `
${CORRUPT_PARTY_LIST}

Between [ORG_1] and Beacon Operations and [ORG_6].

${CORRUPT_SIGS}
`.trim();
    const out = hydrateIdentityPlaceholdersInAgreementPreviewPlain(blob, draft, EXACT_PROMPT);
    expect(out.toLowerCase()).not.toContain("beacon operations and coastal reserve");
    expect(out).not.toMatch(/Foundryco Inc\.\./i);
    expect(out).not.toMatch(/Smith\s*&\s*Smith\s*&/i);
    for (const n of names) {
      expect(out).toContain(n);
    }
  });

  it("ordinary prose still substitutes standalone bracket tokens", () => {
    const auth = ["Alpha LLC", "Beta LLC"];
    expect(substitutePartyPlaceholdersInUserFacingText("Payment from [ORG_2] to vendor.", "x", auth)).toBe(
      "Payment from Beta LLC to vendor.",
    );
  });
});
