/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE } from "./ironcladJointRolloutFixtures";
import { extractIntakeContacts } from "./paidProIntakeContactSubstitution";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
import { buildPremiumRecipientCandidatesFromIntake } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { extractBetweenPartyNameListForAuthority } from "./partyBetweenParse";

const SILVER_MESA_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
] as const;

const INTENDED = [
  { company: SILVER_MESA_PARTIES[0], email: "ethan.cole@ironcladsg.com" },
  { company: SILVER_MESA_PARTIES[1], email: "maya.bennett@harborlinedata.com" },
  { company: SILVER_MESA_PARTIES[2], email: "lucas.reed@northwindap.io" },
  { company: SILVER_MESA_PARTIES[3], email: "olivia.hart@silvermesaanalytics.com" },
] as const;

describe("Silver Mesa four-party recipient mapping (initial, before UI fill)", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  it("captures bullet contacts before the notices line is considered", () => {
    const contacts = extractIntakeContacts(IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE);
    expect(contacts.map((c) => ({ name: c.name, email: c.email, companyHint: c.companyHint }))).toEqual([
      { name: "Ethan Cole", email: INTENDED[0].email, companyHint: "Ironclad" },
      { name: "Maya Bennett", email: INTENDED[1].email, companyHint: "Harborline" },
      { name: "Lucas Reed", email: INTENDED[2].email, companyHint: "Northwind" },
      { name: "Olivia Hart", email: INTENDED[3].email, companyHint: "Silver Mesa" },
    ]);
  });

  it("keeps between-clause order even when the entity pool is length-sorted", () => {
    const between = extractBetweenPartyNameListForAuthority(IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE);
    expect(between.slice(0, 4)).toEqual([...SILVER_MESA_PARTIES]);
    const pool = resolveFullLegalPartiesFromIntake([...SILVER_MESA_PARTIES], IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE);
    expect(pool[0], "length-sorted pool must not be treated as UI slot 0").toBe(
      "Northwind Automation Partners LLC",
    );
  });

  it("binds reviewer candidates to the UI/draft company, not the length-sorted pool index", () => {
    const rc = buildPremiumRecipientCandidatesFromIntake(
      [...SILVER_MESA_PARTIES],
      IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE,
    );
    expect(rc.map((row, i) => ({ uiParty: SILVER_MESA_PARTIES[i], email: row.email, name: row.name }))).toEqual(
      INTENDED.map((row) => ({ uiParty: row.company, email: row.email, name: row.company })),
    );
    expect(rc[0]?.email).not.toBe("lucas.reed@northwindap.io");
  });

  it("does not fall back to positional contact assignment when identity already matched Harborline", () => {
    const rc = buildPremiumRecipientCandidatesFromIntake(
      [...SILVER_MESA_PARTIES],
      IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE,
    );
    expect(rc[1]?.email).toBe("maya.bennett@harborlinedata.com");
    expect(rc[2]?.email).toBe("lucas.reed@northwindap.io");
    expect(rc[3]?.email).toBe("olivia.hart@silvermesaanalytics.com");
  });
});
