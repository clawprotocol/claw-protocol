/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM } from "./signingFields";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import {
  buildPreparePlacementValueContext,
  buildVs01PrepareSigningRoles,
  canFinishPreparePacketSignerCentric,
  evaluatePreparePacketGateFromRoles,
  findPrepareSigningRole,
  stampAndLogSenderFieldForPrepareRole,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_vs01_prepare_flow";

describe("vs01 prepare placement flow", () => {
  it("findPrepareSigningRole uses ref role id at click time (stale closure regression)", () => {
    const cps: Vs01Counterparty[] = [
      { id: "c1", name: "Atlas LLC", email: "a@x.com" },
      { id: "c2", name: "Beta LLC", email: "b@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const atlas = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const beta = roles.find((r) => r.vs01CounterpartyId === "c2")!;

    let activeRoleIdRef = owner.roleId;
    const resolveAtClick = () => findPrepareSigningRole(roles, activeRoleIdRef);

    const base: PlacedSigningField = {
      id: "f1",
      type: "email",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.03,
    };

    const ownerField = stampAndLogSenderFieldForPrepareRole(
      { ...base, id: "o-email" },
      resolveAtClick()!,
      activeRoleIdRef,
    );
    expect(ownerField.assignedPartyIndex).toBe(0);

    activeRoleIdRef = atlas.roleId;
    const atlasField = stampAndLogSenderFieldForPrepareRole(
      { ...base, id: "a-email" },
      resolveAtClick()!,
      activeRoleIdRef,
    );
    expect(atlasField.assignedPartyIndex).toBe(atlas.partyIndex);
    expect(atlasField.assignedPartyId).toBe("c1");

    activeRoleIdRef = beta.roleId;
    const ctx = buildPreparePlacementValueContext(beta, {
      typedName: "Owner",
      initials: "O",
      signerEmail: "o@x.com",
    });
    expect(ctx.signerEmail).toBeUndefined();
    const betaField = stampAndLogSenderFieldForPrepareRole(
      { ...base, id: "b-sig", type: "signature" },
      resolveAtClick()!,
      activeRoleIdRef,
    );
    expect(betaField.assignedPartyIndex).toBe(beta.partyIndex);
    expect(betaField.assignedPartyId).toBe("c2");
  });

  it("role switch placement: each field stamped for selected role", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const atlas = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const base: PlacedSigningField = {
      id: "x",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
    };
    const sender = [
      stampSenderFieldWithPrepareRole(base, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "a1", type: "email" }, atlas),
      stampSenderFieldWithPrepareRole({ ...base, id: "a2", type: "date", value: "2026-01-01" }, atlas),
      stampSenderFieldWithPrepareRole({ ...base, id: "a3", type: "printed_name" }, atlas),
      stampSenderFieldWithPrepareRole({ ...base, id: "a4", type: "text" }, atlas),
    ];
    expect(sender[0].assignedPartyIndex).toBe(0);
    expect(sender[1].assignedPartyIndex).toBe(atlas.partyIndex);
    expect(sender[1].assignedSignerRoleId).toBe(atlas.roleId);
  });

  it("5-party commercial agreement requires all parties signature, printed_name, date, and entity title", () => {
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
      width: 0.32,
      height: 0.072,
    };
    const incomplete = evaluatePreparePacketGateFromRoles(roles, [], []);
    expect(incomplete.canFinish).toBe(false);
    expect(Object.keys(incomplete.missingByParty).length).toBe(5);

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
    expect(gate.totalRequiredRoles).toBe(5);
  });

  it("signature field default dimensions are large enough for entity-style signatures", () => {
    const sig = VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.signature;
    expect(sig.width).toBeGreaterThanOrEqual(0.3);
    expect(sig.height).toBeGreaterThanOrEqual(0.065);
  });

  it("StepPrepareSignature prepare path does not call createSignSession before onContinue", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("if (agreementBridgePlacementCopy) {");
    expect(src).toContain("onContinue?.()");
    const handleSignBlock = src.slice(src.indexOf("const handleSign = useCallback"));
    const earlyReturn = handleSignBlock.slice(0, handleSignBlock.indexOf("createSignSession"));
    expect(earlyReturn).toContain("agreementBridgePlacementCopy");
    expect(earlyReturn).toContain("onContinue?.()");
  });

  it("mergeRecipientManifestFieldsForSignerRole scopes by signer_role_id", async () => {
    const { mergeRecipientManifestFieldsForSignerRole } = await import("./vs01SignerFieldAssignment");
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
        { id: "owner-s", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        owner,
      ),
      stampSenderFieldWithPrepareRole(
        { id: "cp-s", type: "signature", page: 0, x: 0.2, y: 0.2, width: 0.2, height: 0.05 },
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
});
