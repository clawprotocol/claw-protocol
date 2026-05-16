/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVs01DefaultFieldGeometry,
  normalizePlacedFieldGeometryIfBelowMinimum,
  VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM,
} from "./signingFields";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import {
  buildVs01PrepareSigningRoles,
  canFinishPreparePacketSignerCentric,
  evaluatePreparePacketGateFromRoles,
  findNextIncompletePrepareRole,
  mergeRecipientManifestFieldsForSignerRole,
  stampPrepareSenderFieldOrReject,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_vs01_prepare_flow";

describe("vs01 prepare placement flow", () => {
  it("click role 1 then role 2: second field stamps role 2 not role 1", () => {
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
    const base: PlacedSigningField = {
      id: "f1",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };

    let activeRoleIdRef = owner.roleId;
    const stampAtClick = () => {
      const role = roles.find((r) => r.roleId === activeRoleIdRef)!;
      return stampPrepareSenderFieldOrReject(base, role, activeRoleIdRef)!;
    };

    const f1 = stampAtClick();
    expect(f1.assignedPartyIndex).toBe(0);

    activeRoleIdRef = atlas.roleId;
    const f2 = stampAtClick();
    expect(f2.assignedPartyIndex).toBe(atlas.partyIndex);
    expect(f2.assignedPartyId).toBe("c1");
    expect(f2.assignedSignerRoleKind).toBe("counterparty");

    activeRoleIdRef = beta.roleId;
    const f3 = stampAtClick();
    expect(f3.assignedPartyIndex).toBe(beta.partyIndex);
    expect(f3.assignedPartyId).toBe("c2");
    expect(f3.assignedSignerRoleId).toBe(beta.roleId);
  });

  it("rejects field when expected role id does not match resolved role", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }],
    });
    const atlas = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const field: PlacedSigningField = {
      id: "x",
      type: "email",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.045,
    };
    const rejected = stampPrepareSenderFieldOrReject(field, atlas, roles[0]!.roleId);
    expect(rejected).toBeNull();
  });

  it("five-party agreement: all roles completable and gate passes", () => {
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
    expect(gate.totalRequiredRoles).toBe(5);
  });

  it("auto-advance helper selects next incomplete signer", () => {
    const cps: Vs01Counterparty[] = [
      { id: "c1", name: "A LLC", email: "a@x.com" },
      { id: "c2", name: "B LLC", email: "b@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const c1 = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };
    const ownerComplete = [
      stampSenderFieldWithPrepareRole(base, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "o2", type: "printed_name" }, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "o3", type: "date", value: "2026-01-01" }, owner),
    ];
    const gate = evaluatePreparePacketGateFromRoles(roles, ownerComplete, []);
    expect(gate.missingByParty[owner.roleId]).toBeUndefined();
    const next = findNextIncompletePrepareRole(roles, gate);
    expect(next?.roleId).toBe(c1.roleId);
  });

  it("signature default geometry is wide enough and uses contain-friendly size", () => {
    const sig = getVs01DefaultFieldGeometry("signature");
    expect(sig.width).toBeGreaterThanOrEqual(0.34);
    expect(sig.height).toBeGreaterThanOrEqual(0.075);
    expect(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.signature).toEqual(sig);
  });

  it("normalizePlacedFieldGeometryIfBelowMinimum bumps tiny legacy signature fields", () => {
    const tiny: PlacedSigningField = {
      id: "t",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.08,
      height: 0.02,
    };
    const { field, normalized } = normalizePlacedFieldGeometryIfBelowMinimum(tiny);
    expect(normalized).toBe(true);
    expect(field.width).toBeGreaterThanOrEqual(0.34);
    expect(field.height).toBeGreaterThanOrEqual(0.075);
  });

  it("prepare path does not call createSignSession before onContinue", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const handleSignBlock = src.slice(src.indexOf("const handleSign = useCallback"));
    const earlyReturn = handleSignBlock.slice(0, handleSignBlock.indexOf("createSignSession"));
    expect(earlyReturn).toContain("agreementBridgePlacementCopy");
    expect(earlyReturn).toContain("onContinue?.()");
  });

  it("recipient URL scope: merge only locked signer fields", () => {
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
});

describe("reviewer approve dialog copy", () => {
  it("does not imply document is signed on Looks good confirm", () => {
    const src = readFileSync(join(__dirname, "../agreement/AgreementRecipientReview.tsx"), "utf8");
    expect(src).toContain("Nothing is signed yet");
    expect(src).not.toContain("ready for signing");
  });
});
