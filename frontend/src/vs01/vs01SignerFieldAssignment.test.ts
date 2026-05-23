/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  buildStableSignerRoleId,
  buildVs01PrepareSigningRoles,
  canFinishPreparePacketSignerCentric,
  hideSenderTemplateFieldForRecipientSigner,
  mergeRecipientManifestFieldsForSignerRole,
  migrateLegacyRecipientPlacedFields,
  migrateLegacySenderPlacedFields,
  recipientFieldBelongsToLockedSigner,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_vs01_assign_test";

describe("vs01SignerFieldAssignment", () => {
  it("migrateLegacySenderPlacedFields assigns owner without crashing on empty list", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const owner = roles[0]!;
    expect(migrateLegacySenderPlacedFields([], owner)).toEqual([]);
  });

  it("active role switch: stamped sender fields bucket per signer role in gate", () => {
    const cps: Vs01Counterparty[] = [
      { id: "c1", name: "Alpha LLC", email: "a@x.com" },
      { id: "c2", name: "Beta LLC", email: "b@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const r1 = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const r2 = roles.find((r) => r.vs01CounterpartyId === "c2")!;
    const base: PlacedSigningField = {
      id: "f1",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
    };
    const sender: PlacedSigningField[] = [
      stampSenderFieldWithPrepareRole(base, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "f1b", type: "printed_name" }, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "f1c", type: "date", value: "2026-01-03" }, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "f2" }, r1),
      stampSenderFieldWithPrepareRole({ ...base, id: "f3", type: "printed_name" }, r1),
      stampSenderFieldWithPrepareRole({ ...base, id: "f4", type: "date", value: "2026-01-01" }, r1),
      stampSenderFieldWithPrepareRole({ ...base, id: "f5", type: "text" }, r1),
      stampSenderFieldWithPrepareRole({ ...base, id: "f6" }, r2),
      stampSenderFieldWithPrepareRole({ ...base, id: "f7", type: "printed_name" }, r2),
      stampSenderFieldWithPrepareRole({ ...base, id: "f8", type: "date", value: "2026-01-02" }, r2),
      stampSenderFieldWithPrepareRole({ ...base, id: "f9", type: "text" }, r2),
    ];
    const gate = canFinishPreparePacketSignerCentric({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(gate.canFinish).toBe(true);
  });

  it("mergeRecipientManifestFieldsForSignerRole pulls sender-layer fields for owner role", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const owner = roles[0]!;
    const sender: PlacedSigningField[] = [
      stampSenderFieldWithPrepareRole(
        { id: "sx", type: "signature", page: 0, x: 0.2, y: 0.2, width: 0.2, height: 0.05 },
        owner,
      ),
    ];
    const merged = mergeRecipientManifestFieldsForSignerRole({
      ownerRole: owner,
      roles,
      counterpartyId: owner.partyId,
      signerRoleId: owner.roleId,
      recipientPlacedFields: [],
      senderPlacedFields: sender,
    });
    expect(merged.some((f) => f.id.startsWith("s2r_"))).toBe(true);
  });

  it("mergeRecipientManifestFieldsForSignerRole pulls sender-layer fields for counterparty roles", () => {
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
        { id: "sx", type: "signature", page: 0, x: 0.2, y: 0.2, width: 0.2, height: 0.05 },
        r1,
      ),
    ];
    const rec: Vs01RecipientPlacedField[] = [
      {
        id: "r1",
        counterpartyId: "c1",
        type: "printed_name",
        page: 0,
        x: 0.3,
        y: 0.2,
        width: 0.2,
        height: 0.03,
      },
    ];
    const merged = mergeRecipientManifestFieldsForSignerRole({
      ownerRole: owner,
      roles,
      counterpartyId: "c1",
      signerRoleId: r1.roleId,
      recipientPlacedFields: rec,
      senderPlacedFields: sender,
    });
    expect(merged.some((f) => f.id === "r1")).toBe(true);
    expect(merged.some((f) => f.id.startsWith("s2r_"))).toBe(true);
  });

  it("recipientFieldBelongsToLockedSigner blocks mismatched role when lock is set", () => {
    const f: Vs01RecipientPlacedField = {
      id: "x",
      counterpartyId: "cp",
      type: "signature",
      page: 0,
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.05,
      assignedSignerRoleId: "role_a",
    };
    expect(recipientFieldBelongsToLockedSigner(f, "cp", "role_a")).toBe(true);
    expect(recipientFieldBelongsToLockedSigner(f, "cp", "role_b")).toBe(false);
  });

  it("hideSenderTemplateFieldForRecipientSigner hides only the locked signer’s slots", () => {
    const ownerRid = buildStableSignerRoleId(AG, 0, "owner");
    const fOwner: PlacedSigningField = {
      id: "o1",
      type: "signature",
      page: 0,
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.05,
    };
    const fCp: PlacedSigningField = {
      ...fOwner,
      id: "c1",
      assignedSignerRoleId: buildStableSignerRoleId(AG, 1, "cp1"),
    };
    expect(hideSenderTemplateFieldForRecipientSigner(fOwner, AG, fCp.assignedSignerRoleId)).toBe(false);
    expect(hideSenderTemplateFieldForRecipientSigner(fCp, AG, fCp.assignedSignerRoleId)).toBe(true);
    expect(hideSenderTemplateFieldForRecipientSigner(fOwner, AG, ownerRid)).toBe(true);
  });

  it("migrateLegacyRecipientPlacedFields maps counterparty rows to role ids", () => {
    const cps: Vs01Counterparty[] = [{ id: "c9", name: "Zed LLC", email: "z@z.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "O",
      creatorEmail: "o@o.com",
      counterparties: cps,
    });
    const raw: Vs01RecipientPlacedField[] = [
      { id: "r", counterpartyId: "c9", type: "signature", page: 0, x: 0, y: 0, width: 0.1, height: 0.05 },
    ];
    const m = migrateLegacyRecipientPlacedFields(raw, roles);
    expect(m[0].assignedSignerRoleId?.length).toBeGreaterThan(4);
  });
});
