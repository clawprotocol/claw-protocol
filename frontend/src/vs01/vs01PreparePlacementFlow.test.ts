/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getVs01DefaultFieldGeometry, normalizePlacedFieldGeometryIfBelowMinimum } from "./signingFields";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import { createVs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import {
  buildPrepareAutoInitialsEveryPage,
  createPrepareStampedSenderField,
} from "./vs01PrepareFieldPlacement";
import { Vs01PrepareRoleAuthorityProvider } from "./Vs01PrepareRoleAuthorityContext";
import {
  buildVs01PrepareSigningRoles,
  canFinishPreparePacketSignerCentric,
  mergeRecipientManifestFieldsForSignerRole,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_vs01_prepare_flow";

describe("vs01 prepare placement flow", () => {
  it("manual next signer then placement stamps counterparty not owner", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(roles[0]!.roleId, "init");
    authority.advanceToNextIncompleteRole([], [], "next_signer");
    const placed = createPrepareStampedSenderField({
      authority,
      type: "signature",
      page: 0,
      clickX: 0.2,
      clickY: 0.2,
      valueCtx: { typedName: "Signer", initials: "S" },
      visualRoleId: authority.getActiveRoleId(),
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.field.assignedPartyId).toBe("c1");
    expect(placed.field.assignedSignerRoleKind).toBe("counterparty");
    expect(String(placed.field.value ?? "")).toBe("");
  });

  it("role advances owner through four counterparties when each bucket completes", () => {
    const cps: Vs01Counterparty[] = [
      { id: "p1", name: "Alpha Corp", email: "1@x.com" },
      { id: "p2", name: "Beta LLC", email: "2@x.com" },
      { id: "p3", name: "Gamma Inc", email: "3@x.com" },
      { id: "p4", name: "Delta LP", email: "4@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner Co LLC",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(roles[0]!.roleId, "init");
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };
    const completeRole = (role: (typeof roles)[number]) => {
      const sender = [
        stampSenderFieldWithPrepareRole(base, role),
        stampSenderFieldWithPrepareRole({ ...base, id: `${role.roleId}-pn`, type: "printed_name" }, role),
        stampSenderFieldWithPrepareRole(
          { ...base, id: `${role.roleId}-dt`, type: "date", value: "2026-05-01" },
          role,
        ),
      ];
      if (role.isEntityParty) {
        sender.push(
          stampSenderFieldWithPrepareRole({ ...base, id: `${role.roleId}-tt`, type: "text" }, role),
        );
      }
      return sender;
    };
    let sender: PlacedSigningField[] = [];
    const order: string[] = [roles[0]!.roleId];
    for (const role of roles) {
      sender = [...sender, ...completeRole(role)];
      authority.afterPlacement(sender, []);
      order.push(authority.getActiveRoleId());
    }
    expect(order[0]).toBe(roles[0]!.roleId);
    expect(order[1]).toBe(roles[1]!.roleId);
    expect(order[2]).toBe(roles[2]!.roleId);
    expect(order[3]).toBe(roles[3]!.roleId);
    expect(order[4]).toBe(roles[4]!.roleId);
    expect(order[5]).toBe(roles[4]!.roleId);
  });

  it("five-party agreement gate passes when all roles complete", () => {
    const cps: Vs01Counterparty[] = [
      { id: "p1", name: "Alpha Corp", email: "1@x.com" },
      { id: "p2", name: "Beta LLC", email: "2@x.com" },
      { id: "p3", name: "Gamma Inc", email: "3@x.com" },
      { id: "p4", name: "Delta LP", email: "4@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner Co LLC",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };
    const sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender.push(stampSenderFieldWithPrepareRole(base, role));
      sender.push(
        stampSenderFieldWithPrepareRole({ ...base, id: `${role.roleId}-pn`, type: "printed_name" }, role),
      );
      sender.push(
        stampSenderFieldWithPrepareRole(
          { ...base, id: `${role.roleId}-dt`, type: "date", value: "2026-05-01" },
          role,
        ),
      );
      if (role.isEntityParty) {
        sender.push(
          stampSenderFieldWithPrepareRole({ ...base, id: `${role.roleId}-tt`, type: "text" }, role),
        );
      }
    }
    const gate = canFinishPreparePacketSignerCentric({
      agreementId: AG,
      creatorName: "Owner Co LLC",
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(gate.canFinish).toBe(true);
  });

  it("prepare path does not call createSignSession before onContinue", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const handleSignBlock = src.slice(src.indexOf("const handleSign = useCallback"));
    const earlyReturn = handleSignBlock.slice(0, handleSignBlock.indexOf("createSignSession"));
    expect(earlyReturn).toContain("agreementBridgePlacementCopy");
    expect(earlyReturn).toContain("onContinue?.()");
  });

  it("recipient URL scope by signer_role_id", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Acme LLC", email: "x@y.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const r1 = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const sender: PlacedSigningField[] = [
      stampSenderFieldWithPrepareRole(
        { id: "owner-s", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.34, height: 0.075 },
        owner,
      ),
      stampSenderFieldWithPrepareRole(
        { id: "cp-s", type: "signature", page: 0, x: 0.2, y: 0.2, width: 0.34, height: 0.075 },
        r1,
      ),
    ];
    const merged = mergeRecipientManifestFieldsForSignerRole({
      ownerRole: owner,
      roles,
      counterpartyId: "c1",
      signerRoleId: r1.roleId,
      recipientPlacedFields: [],
      senderPlacedFields: sender,
    });
    expect(merged.some((f) => f.id.startsWith("s2r_cp-s"))).toBe(true);
    expect(merged.some((f) => f.id.startsWith("s2r_owner-s"))).toBe(false);
  });

  it("authority provider module exports context for wizard", () => {
    expect(Vs01PrepareRoleAuthorityProvider).toBeTruthy();
  });

  it("initials every page scopes to owner and counterparty separately", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    const ownerAuto = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 2,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "O", initials: "O" },
    });
    const cpAuto = buildPrepareAutoInitialsEveryPage({
      role: cp,
      pageCount: 2,
      skippedPages: new Set(),
      existingFields: ownerAuto,
      valueCtx: { typedName: "O", initials: "O" },
    });
    expect(ownerAuto.every((f) => f.assignedSignerRoleId === owner.roleId)).toBe(true);
    expect(cpAuto.every((f) => f.assignedSignerRoleId === cp.roleId)).toBe(true);
    expect(cpAuto.length).toBe(2);
  });

  it("geometry normalization bumps tiny signature fields", () => {
    const tiny: PlacedSigningField = {
      id: "t",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.05,
      height: 0.02,
    };
    const { field, normalized } = normalizePlacedFieldGeometryIfBelowMinimum(tiny);
    expect(normalized).toBe(true);
    expect(field.width).toBeGreaterThanOrEqual(getVs01DefaultFieldGeometry("signature").width);
  });

  it("widening signature field keeps normalized minimum footprint for contain rendering", () => {
    const sig = getVs01DefaultFieldGeometry("signature");
    const wide: PlacedSigningField = {
      id: "w",
      type: "signature",
      page: 0,
      x: 0.05,
      y: 0.1,
      width: 0.55,
      height: 0.12,
    };
    const { field } = normalizePlacedFieldGeometryIfBelowMinimum(wide);
    expect(field.width).toBeGreaterThanOrEqual(sig.width);
    expect(field.height).toBeGreaterThanOrEqual(sig.height);
    expect(field.x + field.width).toBeLessThanOrEqual(1.001);
    expect(field.y + field.height).toBeLessThanOrEqual(1.001);
  });
});

describe("reviewer approve dialog copy", () => {
  it("does not imply signing on Looks good confirm", () => {
    const src = readFileSync(join(__dirname, "../agreement/AgreementRecipientReview.tsx"), "utf8");
    expect(src).toContain("Nothing is signed yet");
    expect(src).not.toContain("ready for signing");
  });
});
