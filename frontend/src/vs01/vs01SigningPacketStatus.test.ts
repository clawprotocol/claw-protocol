/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildPacketStatusCards,
  cardHeadlineText,
  countSignedSigners,
} from "./vs01SigningPacketStatusCards";
import { toVs01LifecyclePersistRow } from "./vs01LifecycleAuditPersist";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
  readSigningPacketStatus,
} from "./vs01SigningPacketStatusStore";
import { logVs01LifecycleEvent } from "./vs01LifecycleAudit";
import { drainProductEventsForTests } from "../lib/experimentation/productEvents";
import { workspaceSigningStatusLabel } from "./vs01WorkspaceSigningStatus";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";

const AG = "ag_packet_status_ui";

function buildRolesAndHandoff() {
  const roles = buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Redwood Peak Ventures LLC",
    creatorEmail: "o@x.com",
    counterparties: [
      { id: "c1", name: "Atlas Harbor Technologies Inc", email: "a@x.com" },
      { id: "c2", name: "Meridian Workforce Group LLC", email: "b@x.com" },
      { id: "c3", name: "Prairie Signal Holdings LP", email: "c@x.com" },
      { id: "c4", name: "NovaGrid Systems LLC", email: "d@x.com" },
    ],
  });
  const owner = roles[0]!;
  const handoff: PaidProVs01PostSignHandoffV1 = {
    v: 1,
    agreementId: AG,
    agreementTitle: "Test",
    vs01DocumentId: "doc1",
    receiptId: "",
    receiptHashSha256: null,
    packetPrepareOnly: true,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: owner.roleId,
    senderMustSignFirst: false,
    ownerSigningUrl: "https://example.com/?vs01_recipient_sign=1",
    signers: roles.slice(1).map((r) => ({
      counterpartyId: r.vs01CounterpartyId!,
      displayName: r.entityName,
      email: r.signerEmail ?? "",
      signingUrl: `https://example.com/?vs01_recipient_sign=1&signer_role_id=${encodeURIComponent(r.roleId)}`,
      signerRoleId: r.roleId,
    })),
  };
  return { roles, handoff };
}

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: AG,
    title: "T",
    updated_at: "2026-01-01T00:00:00Z",
    party_count: 5,
    signer_count: 4,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("vs01 signing packet status cards", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders one owner and four counterparty cards", () => {
    const { roles, handoff: h } = buildRolesAndHandoff();
    const snap = ensureSigningPacketStatusFromHandoff(h, roles[0]!.roleId);
    const cards = buildPacketStatusCards({
      handoff: h,
      roles,
      statusByKey: snap.bySignerKey,
      ownerSigningUrl: h.ownerSigningUrl ?? "",
    });
    expect(cards.filter((c) => c.isOwner)).toHaveLength(1);
    expect(cards.filter((c) => !c.isOwner)).toHaveLength(4);
    expect(cards[0]?.primaryLabel).toBe("Open my signing view");
    expect(cards[1]?.primaryLabel).toBe("Open signer view");
  });

  it("renders Acme LLC and Joe Smith as independent signer cards", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Acme LLC",
      creatorEmail: "anthem@acme.com",
      ownerSignerName: "Anthem Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [
        { id: "cp_joe", name: "Joe Smith", email: "js2345@gmail.com", signerName: "Joe Smith" },
      ],
    });
    const owner = roles[0]!;
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId: AG,
      agreementTitle: "AI Automation Services Agreement",
      vs01DocumentId: "doc_acme",
      receiptId: "",
      receiptHashSha256: null,
      packetPrepareOnly: true,
      savedAt: new Date().toISOString(),
      ownerSignerRoleId: owner.roleId,
      senderMustSignFirst: false,
      ownerSigningUrl: "https://example.com/?vs01_recipient_sign=1",
      signers: [
        {
          counterpartyId: "cp_joe",
          displayName: "Joe Smith",
          email: "js2345@gmail.com",
          signingUrl: "https://example.com/?vs01_recipient_sign=1&signer_role_id=cp",
          signerRoleId: roles[1]!.roleId,
        },
      ],
    };
    const cards = buildPacketStatusCards({
      handoff,
      roles,
      statusByKey: {},
      ownerSigningUrl: handoff.ownerSigningUrl ?? "",
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]?.partyName).toBe("Acme LLC");
    expect(cards[0]?.signerName).toBe("Anthem Blanchard");
    expect(cards[0]?.showSignerMetaLine).toBe(true);
    expect(cards[1]?.partyName).toBe("Joe Smith");
    expect(cards[1]?.showSignerMetaLine).toBe(false);
    expect(cards[1]?.signerName).toBe("Joe Smith");
    expect(JSON.stringify(cards)).not.toMatch(/Also included|nested/i);
  });

  it("does not concatenate party name and status pill", () => {
    const { roles, handoff: h } = buildRolesAndHandoff();
    const cards = buildPacketStatusCards({
      handoff: h,
      roles,
      statusByKey: {},
      ownerSigningUrl: h.ownerSigningUrl ?? "",
    });
    for (const card of cards) {
      const headline = cardHeadlineText(card);
      expect(headline).not.toMatch(/LLCWaiting|IncWaiting|LPWaiting/);
      expect(headline).toContain(" ");
      expect(card.partyName).not.toContain("Waiting");
      expect(card.partyName).not.toContain("Signed");
    }
  });

  it("owner card has no sender-first hint in parallel mode", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Redwood Peak Ventures LLC",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const h = buildRolesAndHandoff().handoff;
    const cards = buildPacketStatusCards({
      handoff: { ...h, signers: [] },
      roles,
      statusByKey: {},
      ownerSigningUrl: h.ownerSigningUrl ?? "",
    });
    expect(cards[0]?.hint).toBeNull();
  });
});

describe("workspace signing status labels", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows Signing in progress when packet prepared locally", () => {
    const { roles, handoff: h } = buildRolesAndHandoff();
    ensureSigningPacketStatusFromHandoff(h, roles[0]!.roleId);
    expect(workspaceSigningStatusLabel(indexRow({ id: AG }))).toBe("Signing in progress");
  });

  it("shows Fully signed when local snapshot is complete", () => {
    const { roles, handoff: h } = buildRolesAndHandoff();
    const snap = ensureSigningPacketStatusFromHandoff(h, roles[0]!.roleId);
    for (const key of Object.keys(snap.bySignerKey)) {
      patchSignerPacketStatus(AG, key, "signed");
    }
    expect(workspaceSigningStatusLabel(indexRow({ id: AG }))).toBe("Fully signed");
  });
});

describe("signer completion updates status", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("increments signed count after patch", () => {
    const { roles, handoff: h } = buildRolesAndHandoff();
    const snap = ensureSigningPacketStatusFromHandoff(h, roles[0]!.roleId);
    const keys = Object.keys(snap.bySignerKey);
    patchSignerPacketStatus(AG, keys[0]!, "signed");
    const after = readSigningPacketStatus(AG)!;
    const { signed, total } = countSignedSigners(after.bySignerKey, keys);
    expect(signed).toBe(1);
    expect(total).toBe(keys.length);
  });
});

describe("lifecycle audit persist row", () => {
  beforeEach(() => {
    drainProductEventsForTests();
  });

  it("contains metadata only", () => {
    const row = toVs01LifecyclePersistRow({
      event: "vs01_signer_completed",
      agreementId: AG,
      documentId: "doc1",
      signerRoleId: "role-abc",
      partyIndex: 1,
      status: "signed",
    });
    expect(row.agreement_id).toBe(AG);
    expect(row.document_id).toBe("doc1");
    expect(row.event_type).toBe("vs01_signer_completed");
    expect(row.signer_role_id).toBe("role-abc");
    expect(row.status).toBe("signed");
    expect(JSON.stringify(row)).not.toMatch(/document.body|agreement text/i);
  });

  it("mirrors VS01 lifecycle milestones into product funnel events without signer PII", () => {
    logVs01LifecycleEvent({
      event: "vs01_signer_completed",
      agreementId: AG,
      documentId: "doc1",
      signerRoleId: "role-abc-1234567890",
      partyIndex: 1,
      status: "signed",
    });

    const [event] = drainProductEventsForTests();
    expect(event?.name).toBe("vs01_signer_completed");
    expect(event?.payload?.surface).toBe("vs01_lifecycle");
    expect(event?.payload?.flow).toBe("vs01");
    expect(event?.payload?.vs01_stage).toBe("sign");
    expect(event?.payload?.agreementId).toBe(AG);
    expect(event?.payload?.signer_role_id).toBe("role-abc-1234567");
    expect(JSON.stringify(event?.payload)).not.toMatch(/@|document.body|agreement text|Sam Example/i);
  });
});
