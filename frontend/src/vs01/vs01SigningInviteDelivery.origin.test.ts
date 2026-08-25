/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import {
  appendSignTokenToSigningUrl,
  buildSigningInviteTargetsFromHandoff,
  dispatchSigningInvitesFromHandoff,
} from "./vs01SigningInviteDelivery";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

describe("appendSignTokenToSigningUrl origin preservation", () => {
  it("keeps an absolute signing URL absolute with the same origin and party query", () => {
    const input = "https://example.test/app/esign/doc?counterparty_id=party_2";
    const out = appendSignTokenToSigningUrl(input, "tok_party_2");
    const parsed = new URL(out);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.host).toBe("example.test");
    expect(parsed.pathname).toBe("/app/esign/doc");
    expect(parsed.searchParams.get("counterparty_id")).toBe("party_2");
    expect(parsed.searchParams.get("t")).toBe("tok_party_2");
    expect(out.startsWith("https://example.test/")).toBe(true);
    expect(out).not.toContain("lawdog.local");
  });

  it("preserves scheme, host, and port on a localhost absolute URL", () => {
    const input = "http://127.0.0.1:4173/app/esign/doc?counterparty_id=party_0#ready";
    const out = appendSignTokenToSigningUrl(input, "tok_party_0");
    const parsed = new URL(out);
    expect(parsed.protocol).toBe("http:");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("4173");
    expect(parsed.hash).toBe("#ready");
    expect(parsed.searchParams.get("t")).toBe("tok_party_0");
    expect(out).not.toContain("lawdog.local");
  });

  it("tokenizes a relative URL without inventing a public origin", () => {
    const out = appendSignTokenToSigningUrl(
      "/app/esign/doc?counterparty_id=party_3",
      "tok_party_3",
    );
    expect(out.startsWith("/app/esign/doc?")).toBe(true);
    expect(out).toContain("counterparty_id=party_3");
    expect(out).toContain("t=tok_party_3");
    expect(out).not.toContain("://");
    expect(out).not.toContain("lawdog.local");
  });

  it("replaces an existing t= token on an absolute URL", () => {
    const input = "https://example.test/app/esign/doc?counterparty_id=party_1&t=old_tok";
    const out = appendSignTokenToSigningUrl(input, "tok_party_1");
    const parsed = new URL(out);
    expect(parsed.origin).toBe("https://example.test");
    expect(parsed.searchParams.get("t")).toBe("tok_party_1");
    expect(parsed.searchParams.getAll("t")).toEqual(["tok_party_1"]);
    expect(parsed.searchParams.get("counterparty_id")).toBe("party_1");
  });
});

const GTM_ORIGIN = "https://app.example.test";

const GTM_ROLES: Vs01PrepareSigningRole[] = [
  {
    roleId: "vs01r:ag_gtm_four_:i0:party_0",
    partyIndex: 0,
    partyId: "party_0",
    entityName: "Redwood Biologics Inc",
    partyName: "Redwood Biologics Inc",
    roleLabel: "Redwood Biologics Inc",
    signerName: "Ava Chen",
    signerTitle: "Chief Science Officer",
    signerEmail: "ava@example.test",
    reviewEmail: "ava@example.test",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: null,
    kind: "owner",
  },
  {
    roleId: "vs01r:ag_gtm_four_:i1:party_1",
    partyIndex: 1,
    partyId: "party_1",
    entityName: "Summit AI Consulting LLC",
    partyName: "Summit AI Consulting LLC",
    roleLabel: "Summit AI Consulting LLC",
    signerName: "Noah Patel",
    signerTitle: "Managing Partner",
    signerEmail: "noah@example.test",
    reviewEmail: "noah@example.test",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: "party_1",
    kind: "counterparty",
  },
  {
    roleId: "vs01r:ag_gtm_four_:i2:party_2",
    partyIndex: 2,
    partyId: "party_2",
    entityName: "Blue Harbor Systems LLC",
    partyName: "Blue Harbor Systems LLC",
    roleLabel: "Blue Harbor Systems LLC",
    signerName: "Maya Brooks",
    signerTitle: "Integration Director",
    signerEmail: "maya@example.test",
    reviewEmail: "maya@example.test",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: "party_2",
    kind: "counterparty",
  },
  {
    roleId: "vs01r:ag_gtm_four_:i3:party_3",
    partyIndex: 3,
    partyId: "party_3",
    entityName: "Iron Gate Security LLC",
    partyName: "Iron Gate Security LLC",
    roleLabel: "Iron Gate Security LLC",
    signerName: "Luis Ortega",
    signerTitle: "Security Auditor",
    signerEmail: "luis@example.test",
    reviewEmail: "luis@example.test",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: "party_3",
    kind: "counterparty",
  },
];

function gtmSigningUrl(partyId: string, roleId: string, index: number): string {
  const u = new URL(`${GTM_ORIGIN}/app/esign/doc_ag_gtm_four_party`);
  u.searchParams.set("vs01_recipient_sign", "1");
  u.searchParams.set("counterparty_id", partyId);
  u.searchParams.set("signer_role_id", roleId);
  u.searchParams.set("recipient_index", String(index));
  u.searchParams.set("agreement_id", "ag_gtm_four_party");
  return u.toString();
}

function gtmHandoff(): PaidProVs01PostSignHandoffV1 {
  const [owner, ...rest] = GTM_ROLES;
  return {
    v: 1,
    agreementId: "ag_gtm_four_party",
    agreementTitle: "Four-party professional services",
    vs01DocumentId: "doc_ag_gtm_four_party",
    receiptId: "rcpt_gtm_four_party",
    receiptHashSha256: "abc",
    savedAt: "2026-01-01T00:00:00.000Z",
    signers: rest.map((role) => ({
      counterpartyId: role.vs01CounterpartyId ?? role.partyId,
      displayName: role.entityName,
      email: role.signerEmail ?? "",
      signingUrl: gtmSigningUrl(role.partyId, role.roleId, role.partyIndex),
      signerRoleId: role.roleId,
    })),
    ownerSignerRoleId: owner.roleId,
    senderMustSignFirst: false,
    ownerSigningUrl: gtmSigningUrl(owner.partyId, owner.roleId, owner.partyIndex),
  };
}

describe("GTM four-party actor-aware invite construction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds four email targets including the packet-owner role and keeps absolute URLs after mint", async () => {
    const handoff = gtmHandoff();
    const before = buildSigningInviteTargetsFromHandoff(handoff, GTM_ROLES);
    expect(before).toHaveLength(4);
    expect(before.map((t) => t.email)).toEqual([
      "ava@example.test",
      "noah@example.test",
      "maya@example.test",
      "luis@example.test",
    ]);
    expect(before.every((t) => t.signing_url.startsWith(`${GTM_ORIGIN}/`))).toBe(true);

    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: true,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockImplementation(
      async (_agreementId, body) => {
        const partyId = String(body.recipient_party_id ?? "").trim();
        return {
          ok: true,
          data: {
            token: `tok_${partyId}`,
            expires_in_seconds: 86400,
            locked_version_id: "v1",
            recipient_party_id: partyId,
            review_url: `${GTM_ORIGIN}/sign?t=tok_${partyId}`,
          },
        };
      },
    );

    let posted: Array<{ email: string; signing_url: string; signer_role_id: string; is_owner: boolean }> =
      [];
    vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent").mockImplementation(async (_id, body) => {
      posted = (body.targets ?? []) as typeof posted;
      return { ok: true, sent_count: 0, skip_reason: "copy_share_no_email" };
    });

    const result = await dispatchSigningInvitesFromHandoff(handoff, GTM_ROLES);
    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
    expect(posted).toHaveLength(4);

    const expected = [
      {
        email: "ava@example.test",
        partyId: "party_0",
        roleId: "vs01r:ag_gtm_four_:i0:party_0",
        is_owner: true,
      },
      {
        email: "noah@example.test",
        partyId: "party_1",
        roleId: "vs01r:ag_gtm_four_:i1:party_1",
        is_owner: false,
      },
      {
        email: "maya@example.test",
        partyId: "party_2",
        roleId: "vs01r:ag_gtm_four_:i2:party_2",
        is_owner: false,
      },
      {
        email: "luis@example.test",
        partyId: "party_3",
        roleId: "vs01r:ag_gtm_four_:i3:party_3",
        is_owner: false,
      },
    ];

    for (const row of expected) {
      const target = posted.find((t) => t.email === row.email);
      expect(target, row.email).toBeTruthy();
      const url = new URL(target!.signing_url);
      expect(url.origin).toBe(GTM_ORIGIN);
      expect(url.searchParams.get("counterparty_id")).toBe(row.partyId);
      expect(url.searchParams.get("signer_role_id")).toBe(row.roleId);
      expect(url.searchParams.get("t")).toBe(`tok_${row.partyId}`);
      expect(target!.signer_role_id).toBe(row.roleId);
      expect(target!.is_owner).toBe(row.is_owner);
      expect(target!.signing_url).not.toContain("lawdog.local");
    }
  });
});
