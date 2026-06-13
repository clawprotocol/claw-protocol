/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import {
  buildVs01PrepareSigningRoles,
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import type { Vs01Counterparty } from "./types";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import {
  PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL,
  resolvePreparePacketBridgePrimaryCta,
} from "./vs01PreparePacketCompletion";
import {
  buildSigningInviteTargetsFromHandoff,
  dispatchSigningInvitesFromHandoff,
} from "./vs01SigningInviteDelivery";
import {
  isVs01SenderFirstSigningExplicitlyEnabled,
  resolveVs01SenderMustSignFirst,
} from "./vs01SigningOrderPolicy";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
  readSigningPacketStatus,
} from "./vs01SigningPacketStatusStore";
import { buildPacketStatusCards } from "./vs01SigningPacketStatusCards";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";

const AG = "ag_parallel_signing";

function completeRoleFields(role: Vs01PrepareSigningRole): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: `sig-${role.roleId}`,
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.34,
    height: 0.075,
    assignedSignerRoleId: role.roleId,
  };
  return [stampSenderFieldWithPrepareRole(base, role)];
}

function twoPartyHandoff(): { roles: Vs01PrepareSigningRole[]; handoff: PaidProVs01PostSignHandoffV1 } {
  const counterparties: Vs01Counterparty[] = [
    { id: "p_cp", name: "Harbor Peak Automation LLC", email: "cp@example.com" },
  ];
  const roles = buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    counterparties,
  });
  let sender: PlacedSigningField[] = [];
  for (const role of roles) {
    sender = [...sender, ...completeRoleFields(role)];
  }
  const result = handlePreparePacketContinue({
    agreementId: AG,
    agreementTitle: "Services Agreement",
    documentId: "doc_parallel",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    counterparties,
    senderPlacedFields: sender,
    recipientPlacedFields: [],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("prepare failed");
  return { roles, handoff: result.handoff };
}

describe("VS01 parallel signing default", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.removeItem("lawdogVs01SenderFirst");
  });

  it("defaults senderMustSignFirst to false on packet prepare", () => {
    const { handoff } = twoPartyHandoff();
    expect(handoff.senderMustSignFirst).toBe(false);
    expect(resolveVs01SenderMustSignFirst()).toBe(false);
    expect(isVs01SenderFirstSigningExplicitlyEnabled()).toBe(false);
  });

  it("uses Send signing links CTA in parallel mode", () => {
    expect(resolvePreparePacketBridgePrimaryCta()).toBe(PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL);
    expect(resolvePreparePacketBridgePrimaryCta({ senderMustSignFirst: false })).toBe(
      PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL,
    );
  });

  it("builds independent signing URLs for owner and counterparty", () => {
    const { handoff } = twoPartyHandoff();
    expect(handoff.ownerSigningUrl).toMatch(/doc_parallel/);
    expect(handoff.signers).toHaveLength(1);
    expect(handoff.signers[0]?.signingUrl).toMatch(/doc_parallel/);
    expect(handoff.signers[0]?.signingUrl).not.toBe(handoff.ownerSigningUrl);
  });

  it("Party 2 can complete before Party 1 without blocking", () => {
    const { roles, handoff } = twoPartyHandoff();
    const snap = ensureSigningPacketStatusFromHandoff(handoff, roles[0]!.roleId);
    const ownerKey = roles[0]!.roleId;
    const cpKey = handoff.signers[0]!.signerRoleId!;
    patchSignerPacketStatus(AG, cpKey, "signed");
    const mid = readSigningPacketStatus(AG)!;
    expect(mid.bySignerKey[cpKey]).toBe("signed");
    expect(mid.bySignerKey[ownerKey]).toBe("waiting");
    expect(mid.fullySigned).toBe(false);
    patchSignerPacketStatus(AG, ownerKey, "signed");
    const done = readSigningPacketStatus(AG)!;
    expect(done.fullySigned).toBe(true);
  });

  it("Party 1 can complete after Party 2", () => {
    const { roles, handoff } = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, roles[0]!.roleId);
    const ownerKey = roles[0]!.roleId;
    const cpKey = handoff.signers[0]!.signerRoleId!;
    patchSignerPacketStatus(AG, ownerKey, "signed");
    let snap = readSigningPacketStatus(AG)!;
    expect(snap.fullySigned).toBe(false);
    patchSignerPacketStatus(AG, cpKey, "signed");
    snap = readSigningPacketStatus(AG)!;
    expect(snap.fullySigned).toBe(true);
  });

  it("status cards do not show sender-first hints", () => {
    const { roles, handoff } = twoPartyHandoff();
    const cards = buildPacketStatusCards({
      handoff,
      roles,
      statusByKey: {},
      ownerSigningUrl: handoff.ownerSigningUrl ?? "",
    });
    expect(cards.every((c) => !c.hint)).toBe(true);
  });

  it("buildSigningInviteTargetsFromHandoff includes owner and counterparty emails", () => {
    const { roles, handoff } = twoPartyHandoff();
    const targets = buildSigningInviteTargetsFromHandoff(handoff, roles);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.email).sort()).toEqual(["cp@example.com", "owner@example.com"]);
    expect(targets.every((t) => t.signing_url.includes("doc_parallel"))).toBe(true);
  });

  it("dispatchSigningInvitesFromHandoff posts all signer targets at prepare time", async () => {
    const { roles, handoff } = twoPartyHandoff();
    const spy = vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent").mockResolvedValue({
      ok: true,
      sent_count: 2,
      skip_reason: null,
    });
    const result = await dispatchSigningInvitesFromHandoff(handoff, roles);
    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(2);
    expect(spy).toHaveBeenCalledWith(
      AG,
      expect.objectContaining({
        targets: expect.arrayContaining([
          expect.objectContaining({ email: "owner@example.com", is_owner: true }),
          expect.objectContaining({ email: "cp@example.com", is_owner: false }),
        ]),
      }),
    );
    spy.mockRestore();
  });

  it("skips email dispatch when sender-first is explicitly enabled", async () => {
    localStorage.setItem("lawdogVs01SenderFirst", "1");
    const { roles, handoff } = twoPartyHandoff();
    const spy = vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent");
    const result = await dispatchSigningInvitesFromHandoff(
      { ...handoff, senderMustSignFirst: true },
      roles,
    );
    expect(result.skipReason).toBe("sender_first_explicit");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
