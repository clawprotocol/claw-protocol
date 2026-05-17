import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import {
  evaluatePrepareFinishClick,
  fieldCountsAsTitle,
  fieldCountsAsCustomText,
} from "./vs01PreparePacketCompletion";
import {
  buildVs01PrepareSigningRoles,
  evaluatePreparePacketGateFromRoles,
} from "./vs01SignerFieldAssignment";

describe("vs01PreparePacketCompletion", () => {
  it("custom text does not satisfy title requirement", () => {
    expect(fieldCountsAsTitle({ type: "text", textPurpose: "custom" })).toBe(false);
    expect(fieldCountsAsCustomText({ type: "text", textPurpose: "custom" })).toBe(true);
    expect(fieldCountsAsTitle({ type: "text", textPurpose: "title" })).toBe(true);
    expect(fieldCountsAsTitle({ type: "text" })).toBe(true);
  });

  it("evaluatePrepareFinishClick allows when all required fields placed", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_finish",
      creatorName: "Redwood Peak Ventures LLC",
      creatorEmail: "o@x.com",
      ownerSignerName: "Redwood Santa",
      ownerSignerTitle: "Honcho",
      counterparties: [
        {
          id: "atlas",
          name: "Atlas Harbor Technologies Inc.",
          email: "a@x.com",
          signerName: "Jim Atlas",
          signerTitle: "CEO",
        },
      ],
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    const fields: PlacedSigningField[] = [
      ...["signature", "printed_name", "date", "text"] as const,
    ].flatMap((type, i) => [
      {
        id: `o_${type}`,
        type,
        page: 0,
        x: 0.1,
        y: 0.1 + i * 0.08,
        width: 0.2,
        height: 0.04,
        assignedSignerRoleId: owner.roleId,
        ...(type === "text" ? { textPurpose: "title" as const } : {}),
      },
      {
        id: `c_${type}`,
        type,
        page: 0,
        x: 0.5,
        y: 0.1 + i * 0.08,
        width: 0.2,
        height: 0.04,
        assignedSignerRoleId: cp.roleId,
        ...(type === "text" ? { textPurpose: "title" as const } : {}),
      },
    ]);
    const gate = evaluatePreparePacketGateFromRoles(roles, fields, []);
    expect(gate.canFinish, JSON.stringify(gate.missingByParty)).toBe(true);
    const result = evaluatePrepareFinishClick(gate, roles);
    expect(result.allowed).toBe(true);
  });

  it("evaluatePrepareFinishClick blocked lists missing fields by signer", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_block",
      creatorName: "Atlas Harbor Technologies Inc.",
      creatorEmail: "a@x.com",
      counterparties: [{ id: "c1", name: "Beta LLC", email: "b@x.com" }],
    });
    const gate = evaluatePreparePacketGateFromRoles(roles, [], []);
    const result = evaluatePrepareFinishClick(gate, roles);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toMatch(/still needs/i);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.focusRoleId).toBeTruthy();
    }
  });
});
