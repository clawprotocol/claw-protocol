import { describe, expect, it } from "vitest";
import type { Vs01RecipientPlacedField } from "./types";
import {
  partyIndexFromSignerRoleId,
  scopeRecipientManifestToLockedSigner,
} from "./vs01RecipientFieldScope";
import { buildStableSignerRoleId } from "./vs01SignerFieldAssignment";

const AG = "ag_qa363_scope";

function field(
  id: string,
  partyIndex: number,
  roleId: string,
  cpId: string,
): Vs01RecipientPlacedField {
  return {
    id,
    counterpartyId: cpId,
    type: "signature",
    page: 9,
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.05,
    assignedPartyIndex: partyIndex,
    assignedSignerRoleId: roleId,
  };
}

describe("vs01RecipientFieldScope", () => {
  it("parses party index from stable signer role id", () => {
    const owner = buildStableSignerRoleId(AG, 0, "owner");
    const cp = buildStableSignerRoleId(AG, 1, "cp_harbor");
    expect(partyIndexFromSignerRoleId(owner)).toBe(0);
    expect(partyIndexFromSignerRoleId(cp)).toBe(1);
  });

  it("scopes canonical packet fields to one signer role", () => {
    const ownerRole = buildStableSignerRoleId(AG, 0, "owner");
    const cpRole = buildStableSignerRoleId(AG, 1, "cp_harbor");
    const all = [
      field("owner_sig", 0, ownerRole, "owner"),
      field("cp_sig", 1, cpRole, "cp_harbor"),
    ];
    const ownerOnly = scopeRecipientManifestToLockedSigner({
      fields: all,
      lockedCounterpartyId: "owner",
      lockedSignerRoleId: ownerRole,
    });
    expect(ownerOnly).toHaveLength(1);
    expect(ownerOnly[0]?.id).toBe("owner_sig");

    const cpOnly = scopeRecipientManifestToLockedSigner({
      fields: all,
      lockedCounterpartyId: "cp_harbor",
      lockedSignerRoleId: cpRole,
    });
    expect(cpOnly).toHaveLength(1);
    expect(cpOnly[0]?.id).toBe("cp_sig");
  });

  it("does not assign counterparty fields to owner role lock", () => {
    const ownerRole = buildStableSignerRoleId(AG, 0, "owner");
    const cpRole = buildStableSignerRoleId(AG, 1, "cp_harbor");
    const scoped = scopeRecipientManifestToLockedSigner({
      fields: [field("cp_sig", 1, cpRole, "cp_harbor")],
      lockedCounterpartyId: "owner",
      lockedSignerRoleId: ownerRole,
    });
    expect(scoped).toHaveLength(0);
  });
});
