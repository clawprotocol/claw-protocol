/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { Vs01Counterparty } from "./types";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  resolveRolePlausibleEmail,
  resolveVs01FieldValueForRole,
  todayIsoDateLocal,
} from "./vs01FieldValueResolution";

const AG = "agreement_field_value_resolution";

describe("resolveVs01FieldValueForRole", () => {
  it("preserves counterparty email from party row email field", () => {
    const cps: Vs01Counterparty[] = [
      { id: "atlas", name: "Atlas LLC", email: "atlas@harbor.example", phone: "" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Redwood",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles[1]!;
    expect(resolveRolePlausibleEmail(cp)).toBe("atlas@harbor.example");
    const stored = resolveVs01FieldValueForRole({
      fieldType: "email",
      role: cp,
      mode: "prepare_stored",
    });
    expect(stored).toBe("atlas@harbor.example");
  });

  it("stores signing date for counterparty date fields at prepare time", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Co", email: "c@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles[1]!;
    const stored = resolveVs01FieldValueForRole({
      fieldType: "date",
      role: cp,
      mode: "prepare_stored",
    });
    expect(stored).toBe(todayIsoDateLocal());
  });

  it("keeps counterparty signature template empty", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Co", email: "c@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles[1]!;
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "signature",
        role: cp,
        mode: "prepare_stored",
        ownerPad: { typedName: "Redwood Signer", initials: "RS" },
      }),
    ).toBe("");
  });

  it("counterparty printed_name stored empty when only entity name on party row", () => {
    const cps: Vs01Counterparty[] = [
      { id: "ent", name: "Atlas LLC", email: "a@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles[1]!;
    expect(cp.partyName).toBe("Atlas LLC");
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "printed_name",
        role: cp,
        mode: "prepare_stored",
      }),
    ).toBe("");
  });

  it("five-party handoff keeps distinct emails on roles", () => {
    const cps: Vs01Counterparty[] = [
      { id: "p1", name: "Alpha", email: "1@x.com" },
      { id: "p2", name: "Beta", email: "2@x.com" },
      { id: "p3", name: "Gamma", email: "3@x.com" },
      { id: "p4", name: "Delta", email: "4@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "owner@x.com",
      counterparties: cps,
    });
    const emails = roles.slice(1).map((r) => resolveRolePlausibleEmail(r));
    expect(emails).toEqual(["1@x.com", "2@x.com", "3@x.com", "4@x.com"]);
  });
});
