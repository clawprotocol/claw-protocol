import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  patchCounterpartySignerMetadata,
  syncSenderFieldsForRoleSignerMetadata,
} from "./vs01PrepareSignerMetadata";

describe("prepare signer metadata sync", () => {
  it("updates printed_name for role only when signerName is set", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_meta",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "atlas", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" }],
    });
    const cp = roles[1]!;
    const fields: PlacedSigningField[] = [
      {
        id: "pn-cp",
        type: "printed_name",
        page: 0,
        x: 0.1,
        y: 0.2,
        width: 0.2,
        height: 0.04,
        value: "",
        assignedSignerRoleId: cp.roleId,
      },
      {
        id: "pn-owner",
        type: "printed_name",
        page: 0,
        x: 0.1,
        y: 0.3,
        width: 0.2,
        height: 0.04,
        value: "",
        assignedSignerRoleId: roles[0]!.roleId,
      },
    ];
    const nextCps = patchCounterpartySignerMetadata(
      [{ id: "atlas", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" }],
      "atlas",
      { signerName: "Jordan Lee" },
    );
    const rebuilt = buildVs01PrepareSigningRoles({
      agreementId: "ag_meta",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: nextCps,
    });
    const rebuiltCp = rebuilt.find((r) => r.roleId === cp.roleId)!;
    const synced = syncSenderFieldsForRoleSignerMetadata(fields, rebuiltCp, {
      typedName: "",
      initials: "",
    });
    const cpField = synced.find((f) => f.id === "pn-cp")!;
    const ownerField = synced.find((f) => f.id === "pn-owner")!;
    expect(cpField.value).toBe("Jordan Lee");
    expect(ownerField.value).toBe("");
  });
});
