import { describe, expect, it } from "vitest";
import { applyIntakePartyRoleOverlay, inferRelationshipOptionOrder, type IntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const baseParsed = (): ParsedDraftShape => ({
  title: "T",
  jurisdiction: "DE",
  parties: [
    { name: "Alpha LLC", role: "party" },
    { name: "Beta Inc", role: "party" },
  ],
  purpose: "p",
  payment_terms: "x",
  duration: "1y",
  due_date: null,
  effective_date: "sig",
  payment: { amount: null, cadence: null, valid: true },
});

describe("applyIntakePartyRoleOverlay", () => {
  it("uses generic party roles when relationship is unset", () => {
    const roles: IntakePartyRoleLabels = { relationship: "unset", label1: "", label2: "" };
    const out = applyIntakePartyRoleOverlay(baseParsed(), roles);
    expect(out.parties[0]?.role).toBe("party");
    expect(out.parties[1]?.role).toBe("party");
  });

  it("applies custom labels when set", () => {
    const roles: IntakePartyRoleLabels = {
      relationship: "services",
      label1: "Service Provider",
      label2: "Client",
    };
    const out = applyIntakePartyRoleOverlay(baseParsed(), roles);
    expect(out.parties[0]?.role).toBe("Service Provider");
    expect(out.parties[1]?.role).toBe("Client");
  });
});

describe("inferRelationshipOptionOrder", () => {
  it("prioritizes confidentiality when NDA language appears", () => {
    const o = inferRelationshipOptionOrder("Mutual NDA between Acme and Bob.");
    expect(o[0]).toBe("confidentiality");
  });
});
