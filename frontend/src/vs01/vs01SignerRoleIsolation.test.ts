/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  recipientFieldBelongsToLockedSigner,
  buildStableSignerRoleId,
} from "./vs01SignerFieldAssignment";
import { stripLockedSignerEditableValuesOnHydrate } from "./recipientSigningFieldUtils";
import type { Vs01RecipientPlacedField } from "./types";

const AG = "ag_qa363_isolation";

describe("QA363 signer-role isolation", () => {
  it("Party 2 signing link does not own Party 1 signature field", () => {
    const ownerRole = buildStableSignerRoleId(AG, 0, "owner");
    const cpRole = buildStableSignerRoleId(AG, 1, "cp_harbor");
    const ownerField: Vs01RecipientPlacedField = {
      id: "owner_sig",
      counterpartyId: "owner",
      type: "signature",
      page: 9,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.05,
      assignedPartyIndex: 0,
      assignedSignerRoleId: ownerRole,
      value: "Tom Thumb",
    };
    const cpField: Vs01RecipientPlacedField = {
      ...ownerField,
      id: "cp_sig",
      counterpartyId: "cp_harbor",
      assignedPartyIndex: 1,
      assignedSignerRoleId: cpRole,
      value: "",
    };

    expect(recipientFieldBelongsToLockedSigner(ownerField, "cp_harbor", cpRole)).toBe(false);
    expect(recipientFieldBelongsToLockedSigner(cpField, "cp_harbor", cpRole)).toBe(true);

    const stripped = stripLockedSignerEditableValuesOnHydrate([ownerField, cpField], AG, cpRole);
    const ownerAfter = stripped.find((f) => f.id === "owner_sig");
    const cpAfter = stripped.find((f) => f.id === "cp_sig");
    expect(ownerAfter?.value).toBe("");
    expect(cpAfter?.value).toBe("");
  });

  it("strips pre-filled signature on locked signer hydrate before completion", () => {
    const ownerRole = buildStableSignerRoleId(AG, 0, "owner");
    const ownerField: Vs01RecipientPlacedField = {
      id: "owner_sig",
      counterpartyId: "owner",
      type: "signature",
      page: 9,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.05,
      assignedSignerRoleId: ownerRole,
      value: "Tom Thumb",
    };
    const stripped = stripLockedSignerEditableValuesOnHydrate([ownerField], AG, ownerRole);
    expect(stripped[0]?.value).toBe("");
  });
});
