import { describe, expect, it } from "vitest";
import {
  centerPrepareRectOnClick,
  computePrepareRectFromClick,
  findConservativeNonOverlappingPrepareRect,
  prepareRectsHaveSignificantOverlap,
} from "./signingFields";
import { createVs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { createPrepareStampedSenderField } from "./vs01PrepareFieldPlacement";

describe("prepare placement accuracy", () => {
  it("centers field on click", () => {
    const r = centerPrepareRectOnClick(0.5, 0.4, 0.34, 0.075);
    expect(r.x).toBeCloseTo(0.5 - 0.34 / 2, 3);
    expect(r.y).toBeCloseTo(0.4 - 0.075 / 2, 3);
  });

  it("final rect stays near click when no obstacles", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_place",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }],
    });
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(roles[1]!.roleId, "init");
    const clickX = 0.143;
    const clickY = 0.345;
    const placed = createPrepareStampedSenderField({
      authority,
      type: "signature",
      page: 0,
      clickX,
      clickY,
      valueCtx: { typedName: "Owner", initials: "O" },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const cx = placed.field.x + placed.field.width / 2;
    const cy = placed.field.y + placed.field.height / 2;
    expect(Math.abs(cx - clickX)).toBeLessThan(0.04);
    expect(Math.abs(cy - clickY)).toBeLessThan(0.05);
  });

  it("conservative nudge only on significant overlap", () => {
    const obstacle = { x: 0.14, y: 0.33, width: 0.34, height: 0.075 };
    const desired = computePrepareRectFromClick("signature", 0.143, 0.345, [], "role-a");
    expect(prepareRectsHaveSignificantOverlap(desired, obstacle)).toBe(true);
    const resolved = findConservativeNonOverlappingPrepareRect({
      desiredRect: desired,
      page: 0,
      existingFields: [{ ...obstacle, id: "o1", page: 0 }],
    });
    if (resolved.adjusted) {
      expect(
        Math.abs(resolved.x - desired.x) + Math.abs(resolved.y - desired.y),
      ).toBeLessThan(0.08);
    }
    const nearClick = centerPrepareRectOnClick(0.7, 0.7, 0.34, 0.075);
    expect(prepareRectsHaveSignificantOverlap(nearClick, obstacle)).toBe(false);
    const noHit = findConservativeNonOverlappingPrepareRect({
      desiredRect: nearClick,
      page: 0,
      existingFields: [{ ...obstacle, id: "o1", page: 0 }],
    });
    expect(noHit.adjusted).toBe(false);
  });
});
