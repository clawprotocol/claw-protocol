import { describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { extractAgreementParties } from "../../agreement/extractAgreementParties";
import { isShortPartyAliasOnly, resolveSignerCardPartyNames } from "./signerFullLegalName";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";

const SHORT_ALIASES = ["Ironclad", "Harborline", "Northwind", "Silver Mesa", "VertexGrid"];

describe("signerFullLegalName", () => {
  it("five-party Ironclad fixture resolves full legal entity names for signer cards", () => {
    const names = resolveSignerCardPartyNames({
      parties: SHORT_ALIASES.map((name) => ({ name, role: "party" })),
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(names).toHaveLength(5);
    for (const full of IRONCLAD_PARTIES) {
      expect(names).toContain(full);
    }
    for (const short of SHORT_ALIASES) {
      const onlyShort = names.filter((n) => n.trim() === short);
      expect(onlyShort.length).toBe(0);
    }
  });

  it("extractAgreementParties uses full legal names from intake", () => {
    const names = extractAgreementParties({
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(names).toEqual([...IRONCLAD_PARTIES]);
  });

  it("flags short alias when authoritative full name exists", () => {
    const auth = resolveFullLegalPartiesFromIntake(null, IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(isShortPartyAliasOnly("Ironclad", auth)).toBe(true);
    expect(isShortPartyAliasOnly("Ironclad Systems Group LLC", auth)).toBe(false);
  });
});
