/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import { createPrepareStampedSenderField } from "./vs01PrepareFieldPlacement";
import { placementSuccessMessage } from "./vs01PreparePlacementControl";
import { createVs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import {
  buildVs01PrepareSigningRoles,
  evaluatePreparePacketGateFromRoles,
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_vs01_placement_sticky";

function dateFieldForRole(role: Vs01PrepareSigningRole, id: string): PlacedSigningField {
  return stampSenderFieldWithPrepareRole(
    {
      id,
      type: "date",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.04,
      value: "2026-05-16",
    },
    role,
  );
}

describe("vs01 prepare placement sticky", () => {
  it("afterPlacement never changes active signer when a role bucket completes", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(owner.roleId, "user_select");
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };
    const sender = [
      stampSenderFieldWithPrepareRole(base, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "pn", type: "printed_name" }, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "dt", type: "date", value: "2026-01-01" }, owner),
    ];
    authority.afterPlacement(sender, []);
    expect(authority.getActiveRoleId()).toBe(owner.roleId);
  });

  it("places date for signers 2–5 while signer-1 field is selected in UI state (authority on later signers)", () => {
    const cps: Vs01Counterparty[] = [
      { id: "p1", name: "Meridian LLC", email: "1@x.com" },
      { id: "p2", name: "Prairie LP", email: "2@x.com" },
      { id: "p3", name: "NovaGrid LLC", email: "3@x.com" },
      { id: "p4", name: "Echo Inc", email: "4@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Atlas Harbor Technologies Inc",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);

    let sender: PlacedSigningField[] = [
      dateFieldForRole(owner, "atlas-date-selected"),
    ];

    for (let i = 1; i < roles.length; i++) {
      const role = roles[i]!;
      authority.setActiveRole(role.roleId, "user_select");
      const placed = createPrepareStampedSenderField({
        authority,
        type: "date",
        page: 0,
        clickX: 0.2 + i * 0.05,
        clickY: 0.2,
        valueCtx: { typedName: "X", initials: "X" },
        existingFields: sender,
        visualRoleId: owner.roleId,
      });
      expect(placed.ok).toBe(true);
      if (!placed.ok) return;
      expect(placed.field.assignedSignerRoleId).toBe(role.roleId);
      sender = [...sender, placed.field];
      authority.afterPlacement(sender, []);
      expect(authority.getActiveRoleId()).toBe(role.roleId);
    }

    const gate = evaluatePreparePacketGateFromRoles(roles, sender, []);
    for (const role of roles.slice(1)) {
      expect(gate.fieldsByRole[role.roleId]?.date).toBeGreaterThanOrEqual(1);
      expect(gate.missingByParty[role.roleId]?.includes("date")).not.toBe(true);
    }
    expect(gate.missingByParty[owner.roleId]).toContain("signature");
  });

  it("duplicate date fields still satisfy completion for that signer", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "NovaGrid LLC", email: "n@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles[1]!;
    const sender = [
      dateFieldForRole(cp, "d1"),
      dateFieldForRole(cp, "d2"),
    ];
    const gate = evaluatePreparePacketGateFromRoles(roles, sender, []);
    expect(gate.fieldsByRole[cp.roleId]?.date).toBe(2);
    expect(gate.missingByParty[cp.roleId]?.includes("date")).not.toBe(true);
  });

  it("placementSuccessMessage is concise", () => {
    expect(placementSuccessMessage("Date", "NovaGrid Systems LLC")).toBe(
      "Date added for NovaGrid Systems LLC.",
    );
  });

  it("StepPrepareSignature arms on tool click and disarms after place", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("vs01DevKeepPlacingEnabled");
    expect(src).not.toContain("Keep placing this field");
    expect(src).not.toContain("Switch to this signer");
    expect(src).not.toContain("vs01-sign-place-cta");
    expect(src).toMatch(/setArmedTool\(t\)/);
    expect(src).toContain("setArmedTextPurpose(undefined)");
  });

  it("removeField does not call setActiveRole", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const removeBlock = src.slice(src.indexOf("const removeField = useCallback"), src.indexOf("/** Add/remove auto-initials"));
    expect(removeBlock).not.toContain("setActiveRole");
  });
});
