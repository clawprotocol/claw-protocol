import { describe, expect, it } from "vitest";

import {
  repairKnownPartyPlaceholders,
  shouldCollapseSyntheticOrgPartyOverflow,
  textContainsUnresolvedIdentityPlaceholders,
} from "./partyPlaceholderDisplay";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromSources,
} from "../components/agreements/canonicalPartyIdentityResolver";
import { resolvePlaceholderPartyNamesWithMeta } from "../components/agreements/agreementTemplatePlaceholderSafety";
import { runIntakeDefaultsAndRoles } from "../components/agreements/intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "../components/agreements/partyRoleIntake";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { IRONCLAD_PARTIES } from "../../e2e/fixtures/ironcladFivePartyRollout";

const BLUE_CANYON_INTAKE =
  "Create a professional services agreement between Blue Canyon Analytics LLC and Iron Vale " +
  "Systems Inc. for AI workflow setup. Client will pay $5,000. Texas law. Electronic signatures allowed.";

const BLUE_CANYON_NAMES = ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."] as const;

const FIVE_PARTY_INTAKE =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. Fee $47,500. Term 4 months. Governing law Oklahoma.";

const THREE_PARTY_INTAKE = `Services agreement.
Parties: Alpha LLC, Beta Advisors, Gamma Holdings.
Scope: Joint research collaboration.
Governing law: Texas.`;

const AFFILIATE_TWO_PARTY_INTAKE = `
SERVICES AGREEMENT — Acme Labs LLC and Beacon Studios Inc.

Beacon Studios will provide services to Acme Labs and its affiliates.

Signatures. Apollo Chen signs on behalf of Acme Labs LLC and on behalf of its affiliate Acme Studios LLC.
`.trim();

function buildSyntheticOverflowGuard(
  intake: string,
  partyNames: readonly string[],
  structuredPartyCount: number,
) {
  const placeholderResolution = resolvePlaceholderPartyNamesWithMeta(
    { intakeRaw: intake, partyNames: [...partyNames] },
    null,
  );
  return {
    structuredPartyCount,
    canonicalIdentityCount: resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: intake,
      starterNames: partyNames,
    }).length,
    placeholderResolutionPartyCount: resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: intake,
      starterNames: placeholderResolution.names,
    }).length,
    intakeHasFullLegalEntities: intakeHasFullLegalEntityParties(intake, partyNames),
  };
}

const AFFILIATE_MENTION_ONLY_INTAKE = `
SERVICES AGREEMENT — Acme Labs LLC and Beacon Studios Inc.

Beacon Studios will provide services to Acme Labs and its affiliates.
`.trim();

describe("shouldCollapseSyntheticOrgPartyOverflow", () => {
  it("requires every guard to pass simultaneously", () => {
    expect(
      shouldCollapseSyntheticOrgPartyOverflow({
        realAuthoritativePartyCount: 2,
        structuredPartyCount: 2,
        canonicalIdentityCount: 2,
        placeholderResolutionPartyCount: 2,
        intakeHasFullLegalEntities: true,
      }),
    ).toBe(true);
    expect(
      shouldCollapseSyntheticOrgPartyOverflow({
        realAuthoritativePartyCount: 2,
        structuredPartyCount: 3,
        canonicalIdentityCount: 2,
        placeholderResolutionPartyCount: 2,
        intakeHasFullLegalEntities: true,
      }),
    ).toBe(false);
  });
});

describe("synthetic ORG/PARTY overflow repair", () => {
  it("1. two-party Blue Canyon/Iron Vale: ORG_1/2 resolve, ORG_3/4 collapse, no remaining ORG placeholders", () => {
    const text =
      'Between [ORG_1] ("Client") and [ORG_2] ("Service Provider"). Notice to [ORG_3] and Smith & [ORG_4].';
    const guard = buildSyntheticOverflowGuard(BLUE_CANYON_INTAKE, BLUE_CANYON_NAMES, 2);
    expect(guard.canonicalIdentityCount).toBe(2);
    expect(guard.placeholderResolutionPartyCount).toBe(2);

    const out = repairKnownPartyPlaceholders(text, [...BLUE_CANYON_NAMES], BLUE_CANYON_INTAKE, guard);
    expect(out.repairedSlots).toEqual([1, 2]);
    expect(out.collapsedExtraOrgSlots).toEqual(expect.arrayContaining([3, 4]));
    expect(out.text).toContain("Blue Canyon Analytics LLC");
    expect(out.text).toContain("Iron Vale Systems Inc.");
    expect(out.text).toContain("the applicable Party");
    expect(out.text).not.toMatch(/\[ORG_/i);
    expect(out.hasRemainingIdentityPlaceholder).toBe(false);
  });

  it("2. five-party FoundryCo-style: ORG_3 and ORG_4 resolve to real third/fourth parties", () => {
    const blankParsed = (): ParsedDraftShape =>
      ({
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: true },
      }) as ParsedDraftShape;
    const structured = runIntakeDefaultsAndRoles(
      blankParsed(),
      FIVE_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    const partyNames = (structured.parties || []).map((p) => p.name);
    expect(partyNames.length).toBe(5);

    const text =
      "The parties [ORG_1], [ORG_3], and Smith & [ORG_4] agree. Signatures: [ORG_3], Smith & [ORG_4].";
    const guard = buildSyntheticOverflowGuard(FIVE_PARTY_INTAKE, partyNames, partyNames.length);
    expect(shouldCollapseSyntheticOrgPartyOverflow({
      realAuthoritativePartyCount: partyNames.length,
      ...guard,
    })).toBe(false);

    const out = repairKnownPartyPlaceholders(text, partyNames, FIVE_PARTY_INTAKE, guard);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).toMatch(/Apollo Data Services LLC/i);
    expect(out.text).toMatch(/Smith\s*&\s*Wesson Holdings LLC/i);
    expect(out.text).not.toMatch(/\[ORG_3\]|\[ORG_4\]/i);
    expect(out.text).not.toContain("the applicable Party");
  });

  it("2b. five-party Ironclad parties: ORG_3/ORG_4 are not collapsed", () => {
    const partyNames = [...IRONCLAD_PARTIES];
    const text = "Among [ORG_1], [ORG_2], [ORG_3], and [ORG_4].";
    const guard = buildSyntheticOverflowGuard("", partyNames, 5);
    const out = repairKnownPartyPlaceholders(text, partyNames, "", guard);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).toContain("Northwind Automation Partners LLC");
    expect(out.text).toContain("Silver Mesa Analytics LP");
    expect(out.text).not.toContain("the applicable Party");
  });

  it("3. three-party intake: ORG_3 resolves to third party, not collapsed", () => {
    const blankParsed = (): ParsedDraftShape =>
      ({
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: true },
      }) as ParsedDraftShape;
    const structured = runIntakeDefaultsAndRoles(
      blankParsed(),
      THREE_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    const partyNames = (structured.parties || []).map((p) => p.name);
    expect(partyNames.length).toBeGreaterThanOrEqual(3);

    const text = "Agreement among [ORG_1], [ORG_2], and [ORG_3].";
    const guard = buildSyntheticOverflowGuard(THREE_PARTY_INTAKE, partyNames, partyNames.length);
    const out = repairKnownPartyPlaceholders(text, partyNames, THREE_PARTY_INTAKE, guard);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).not.toMatch(/\[ORG_3\]/i);
    expect(out.text).not.toContain("the applicable Party");
    expect(out.text.toLowerCase()).toMatch(/gamma/);
  });

  it("4a. two-party plus affiliate mention: collapses when canonical and placeholder counts stay at 2", () => {
    const partyNames = ["Acme Labs LLC", "Beacon Studios Inc."];
    const text = "Between [ORG_1] and [ORG_2]. Notice to [ORG_3].";
    const guard = buildSyntheticOverflowGuard(AFFILIATE_MENTION_ONLY_INTAKE, partyNames, 2);
    expect(guard.canonicalIdentityCount).toBe(2);
    expect(guard.placeholderResolutionPartyCount).toBe(2);

    const out = repairKnownPartyPlaceholders(text, partyNames, AFFILIATE_MENTION_ONLY_INTAKE, guard);
    expect(out.collapsedExtraOrgSlots).toEqual([3]);
    expect(out.text).toContain("the applicable Party");
    expect(out.text).not.toMatch(/\[ORG_3\]/i);
  });

  it("4b. two-party plus affiliate LLC in intake: does not collapse when third entity is detected", () => {
    const partyNames = ["Acme Labs LLC", "Beacon Studios Inc."];
    const text = "Between [ORG_1] and [ORG_2]. Notice to [ORG_3].";
    const guard = buildSyntheticOverflowGuard(AFFILIATE_TWO_PARTY_INTAKE, partyNames, 2);
    expect(guard.canonicalIdentityCount).toBeGreaterThanOrEqual(3);
    expect(
      shouldCollapseSyntheticOrgPartyOverflow({
        realAuthoritativePartyCount: 2,
        ...guard,
      }),
    ).toBe(false);

    const out = repairKnownPartyPlaceholders(text, partyNames, AFFILIATE_TWO_PARTY_INTAKE, guard);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).toMatch(/\[ORG_3\]/);
  });

  it("5. non-ORG placeholders remain fatal/unchanged", () => {
    const text =
      "Signer [PERSON_3], entity [ENTITY_4], {{party_3}}, [INSERT NAME], to be completed, TBD field.";
    const guard = buildSyntheticOverflowGuard(BLUE_CANYON_INTAKE, BLUE_CANYON_NAMES, 2);
    const out = repairKnownPartyPlaceholders(text, [...BLUE_CANYON_NAMES], BLUE_CANYON_INTAKE, guard);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).toContain("[PERSON_3]");
    expect(out.text).toContain("[ENTITY_4]");
    expect(out.text).toContain("{{party_3}}");
    expect(out.text).toContain("[INSERT NAME]");
    expect(out.text).toContain("to be completed");
    expect(out.text).toContain("TBD");
    expect(textContainsUnresolvedIdentityPlaceholders(out.text)).toBe(true);
  });

  it("without paid Pro guard payload, ORG_3/ORG_4 remain for hard-fail (non-paid paths unchanged)", () => {
    const text = "Between [ORG_1] and [ORG_2]. Notice to [ORG_3].";
    const out = repairKnownPartyPlaceholders(text, [...BLUE_CANYON_NAMES], BLUE_CANYON_INTAKE);
    expect(out.collapsedExtraOrgSlots).toEqual([]);
    expect(out.text).toMatch(/\[ORG_3\]/);
    expect(out.hasRemainingIdentityPlaceholder).toBe(true);
  });
});
