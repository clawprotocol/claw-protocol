/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import {
  buildSigningInviteTargetsFromHandoff,
  dispatchSigningInvitesFromHandoff,
} from "./vs01SigningInviteDelivery";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import { buildVs01PrepareSigningRoles, stampSenderFieldWithPrepareRole } from "./vs01SignerFieldAssignment";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

const AG = "ag_invite_fail_closed";

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

function twoPartyHandoff() {
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
    documentId: "doc_fail_closed",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    counterparties,
    senderPlacedFields: sender,
    recipientPlacedFields: [],
  });
  if (!result.ok) throw new Error("prepare failed");
  return { roles, handoff: result.handoff };
}

describe("signing invite delivery fail-closed", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not post tokenless targets when recipient token mint fails", async () => {
    const { roles, handoff } = twoPartyHandoff();
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: true,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: false,
      status: 503,
      code: "recipient_invite_registry_unavailable",
      message: "Invite delivery registry could not be persisted.",
    });
    const spy = vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent");

    const result = await dispatchSigningInvitesFromHandoff(handoff, roles);
    expect(result.ok).toBe(false);
    expect(result.skipReason).toBe("recipient_token_mint_failed");
    expect(spy).not.toHaveBeenCalled();
  });

  it("after-pay Send posts after_pay_ceremony so the server persists the packet", async () => {
    const { roles, handoff } = twoPartyHandoff();
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: false,
      signing_token_configured: false,
    });
    const spy = vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent").mockResolvedValue({
      ok: true,
      sent_count: 2,
      skip_reason: null,
    });
    const portable = {
      v: 1 as const,
      seed: {
        v: 1 as const,
        documentId: "doc_fail_closed",
        agreementId: AG,
        corpusPlain: "SERVICES AGREEMENT\n\nPriya and Diego painted deal for a logo.",
        corpusHash: "hash",
        savedAt: "2026-08-25T00:00:00Z",
      },
      fields: [],
      roles: [],
      pageCount: 1,
      witnessPageIndex: 0,
      initialsPolicy: { enabled: false, bodyPagesOnly: true },
      fieldCount: 0,
    };
    await dispatchSigningInvitesFromHandoff(handoff, roles, {
      portablePacket: portable,
      documentId: "doc_fail_closed",
      afterPayCeremony: true,
    });
    expect(spy).toHaveBeenCalledWith(
      AG,
      expect.objectContaining({
        document_id: "doc_fail_closed",
        after_pay_ceremony: true,
        portable_packet: expect.objectContaining({ v: 1 }),
      }),
    );
  });

  it("buildSigningInviteTargetsFromHandoff does not attach recipient access tokens", () => {
    const { roles, handoff } = twoPartyHandoff();
    const targets = buildSigningInviteTargetsFromHandoff(handoff, roles);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      const u = new URL(t.signing_url, "https://lawdog.local");
      expect(u.searchParams.get("t")).toBeNull();
      expect(u.searchParams.get("token")).toBeNull();
    }
  });
});
