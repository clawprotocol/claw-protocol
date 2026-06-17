/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import type { AgreementParty } from "../agreement/agreementTypes";
import { buildVs01PrepareSigningRolesForBridge } from "../components/agreements/paidProNPartySignerSetup";
import type { PlacedSigningField } from "./signingFields";
import {
  handlePreparePacketContinue,
  recomputePreparePacketGate,
  resolvePreparePacketSigningRoles,
} from "./vs01PreparePacketContinue";
import {
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import { buildSigningInviteTargetsFromHandoff } from "./vs01SigningInviteDelivery";
import type { Vs01Counterparty } from "./types";

const AG_COORD = "ag-coord-packet";
const CREATOR_NAME = "Coordinator User";
const CREATOR_EMAIL = "coord@example.test";

const LEGAL_PARTIES_TWO: AgreementParty[] = [
  {
    id: "p1",
    name: "Alpha LLC",
    role: "party",
    signerEmail: "alpha@example.test",
    signerName: "Alice Alpha",
    requiresSignature: true,
  },
  {
    id: "p2",
    name: "Beta Inc",
    role: "party",
    signerEmail: "beta@example.test",
    signerName: "Bob Beta",
    requiresSignature: true,
  },
];

const LEGAL_PARTIES_THREE: AgreementParty[] = [
  {
    id: "p1",
    name: "Alpha LLC",
    role: "owner",
    signerEmail: "alpha@example.test",
    signerName: "Alice Alpha",
    requiresSignature: true,
  },
  {
    id: "p2",
    name: "Beta Inc",
    role: "party",
    signerEmail: "beta@example.test",
    signerName: "Bob Beta",
    requiresSignature: true,
  },
  {
    id: "p3",
    name: "Gamma Corp",
    role: "party",
    signerEmail: "gamma@example.test",
    signerName: "Carol Gamma",
    requiresSignature: true,
  },
];

function twoPartyCorpus(): string {
  return `${"Premium operational clause with detailed duties and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

PARTY 1:
Alpha LLC
By: ______________________

PARTY 2:
Beta Inc
By: ______________________`;
}

function threePartyCorpus(): string {
  return `${"Premium operational clause with detailed duties and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

PARTY 1:
Alpha LLC
By: ______________________

PARTY 2:
Beta Inc
By: ______________________

PARTY 3:
Gamma Corp
By: ______________________`;
}

function completeRoleFields(role: Vs01PrepareSigningRole): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: `f-${role.roleId}`,
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1 + role.partyIndex * 0.1,
    width: 0.34,
    height: 0.075,
    assignedSignerRoleId: role.roleId,
  };
  return [stampSenderFieldWithPrepareRole(base, role)];
}

function bridgeInput(args: {
  agreementId: string;
  creatorIsParty: boolean;
  legalParties: AgreementParty[];
  counterparties?: Vs01Counterparty[];
}) {
  const bridge = { creatorIsParty: args.creatorIsParty, legalParties: args.legalParties };
  const counterparties = args.counterparties ?? [];
  return {
    agreementId: args.agreementId,
    agreementTitle: "N-party packet test",
    documentId: "doc_nparty",
    creatorName: CREATOR_NAME,
    creatorEmail: CREATOR_EMAIL,
    counterparties,
    bridge,
  };
}

describe("vs01PreparePacketContinue bridge-aware roles", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("coordinator-only + 2 legal parties: placement, gate, packet, and dispatch share 2 roleIds", () => {
    const base = bridgeInput({
      agreementId: AG_COORD,
      creatorIsParty: false,
      legalParties: LEGAL_PARTIES_TWO,
    });

    const placementRoles = buildVs01PrepareSigningRolesForBridge({
      ...base,
      ownerSignerName: undefined,
      ownerSignerTitle: undefined,
      bridge: base.bridge,
    });
    expect(placementRoles).toHaveLength(2);
    expect(placementRoles.every((r) => r.kind === "counterparty")).toBe(true);
    expect(placementRoles.every((r) => r.signerEmail !== CREATOR_EMAIL)).toBe(true);
    expect(placementRoles.every((r) => r.entityName !== CREATOR_NAME)).toBe(true);

    const senderPlacedFields = placementRoles.flatMap((role) => completeRoleFields(role));
    const { roles: gateRoles } = recomputePreparePacketGate({
      ...base,
      senderPlacedFields,
      recipientPlacedFields: [],
      prepareCorpusPlain: twoPartyCorpus(),
    });
    expect(gateRoles.map((r) => r.roleId)).toEqual(placementRoles.map((r) => r.roleId));

    const resolvedRoles = resolvePreparePacketSigningRoles({
      ...base,
      senderPlacedFields,
      recipientPlacedFields: [],
    });
    expect(resolvedRoles.map((r) => r.roleId)).toEqual(placementRoles.map((r) => r.roleId));

    const result = handlePreparePacketContinue({
      ...base,
      senderPlacedFields,
      recipientPlacedFields: [],
      prepareCorpusPlain: twoPartyCorpus(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.roles).toHaveLength(2);
    expect(result.roles.map((r) => r.roleId)).toEqual(placementRoles.map((r) => r.roleId));
    expect(result.portablePacket?.roles).toHaveLength(2);
    expect(result.portablePacket?.roles.map((r) => r.roleId)).toEqual(placementRoles.map((r) => r.roleId));

    const inviteTargets = buildSigningInviteTargetsFromHandoff(result.handoff, result.roles);
    const inviteRoleIds = inviteTargets.map((t) => t.signer_role_id).sort();
    const packetRoleIds = [...(result.portablePacket?.roles.map((r) => r.roleId) ?? [])].sort();
    expect(inviteRoleIds).toEqual(packetRoleIds);
    expect(inviteTargets.every((t) => t.email !== CREATOR_EMAIL)).toBe(true);
    expect(result.handoff.ownerSigningUrl).not.toContain(encodeURIComponent(CREATOR_EMAIL));
  });

  it("coordinator-off + 3 legal parties: portable packet has exactly 3 roles", () => {
    const base = bridgeInput({
      agreementId: "ag-triple-packet",
      creatorIsParty: true,
      legalParties: LEGAL_PARTIES_THREE,
    });

    const placementRoles = buildVs01PrepareSigningRolesForBridge({
      ...base,
      bridge: base.bridge,
    });
    expect(placementRoles).toHaveLength(3);
    expect(placementRoles[0]?.kind).toBe("owner");

    const senderPlacedFields = placementRoles.flatMap((role) => completeRoleFields(role));
    const result = handlePreparePacketContinue({
      ...base,
      senderPlacedFields,
      recipientPlacedFields: [],
      prepareCorpusPlain: threePartyCorpus(),
      initialsEnabled: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.roles).toHaveLength(3);
    expect(result.portablePacket?.roles).toHaveLength(3);
    expect(result.roles.map((r) => r.roleId)).toEqual(placementRoles.map((r) => r.roleId));

    const inviteTargets = buildSigningInviteTargetsFromHandoff(result.handoff, result.roles);
    expect(inviteTargets.map((t) => t.signer_role_id).sort()).toEqual(
      placementRoles.map((r) => r.roleId).sort(),
    );
  });

  it("default two-party without bridge remains owner + one counterparty", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = resolvePreparePacketSigningRoles({
      agreementId: "ag-two-default",
      agreementTitle: "Two party",
      documentId: "doc2",
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: [],
      recipientPlacedFields: [],
    });
    expect(roles).toHaveLength(2);
    expect(roles[0]?.kind).toBe("owner");
    expect(roles[1]?.kind).toBe("counterparty");
  });
});
