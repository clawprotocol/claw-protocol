/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  buildPrepareAutoInitialsForAllRoles,
  prepareAutoInitialsSkipKey,
} from "./vs01PrepareFieldPlacement";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { evaluatePreparePacketGateFromRoles } from "./vs01SignerFieldAssignment";

describe("packet-level auto initials", () => {
  it("places initials for every role on every page without duplicates", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_auto",
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: [
        { id: "c1", name: "Alpha LLC", email: "a@x.com" },
        { id: "c2", name: "Beta Inc", email: "b@x.com" },
      ],
    });
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount: 2,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "X", initials: "X" }),
    });
    expect(autos).toHaveLength(roles.length * 2);
    const ids = autos.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not count auto initials toward prepare completion gate", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_gate",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "c1", name: "Alpha", email: "a@x.com" }],
    });
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount: 3,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "O", initials: "O" }),
    });
    const gate = evaluatePreparePacketGateFromRoles(roles, autos, []);
    expect(gate.canFinish).toBe(false);
    expect(gate.missingByParty[roles[0]!.roleId]).toContain("signature");
  });

  it("respects per-role skipped slots when re-enabled", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_skip",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const roleId = roles[0]!.roleId;
    const skipped = new Set([prepareAutoInitialsSkipKey(roleId, 0)]);
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount: 2,
      skippedSlots: skipped,
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "O", initials: "O" }),
    });
    expect(autos.filter((f) => f.page === 0)).toHaveLength(0);
    expect(autos.filter((f) => f.page === 1)).toHaveLength(1);
  });
});
