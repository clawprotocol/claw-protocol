/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { PlacedSigningField } from "./signingFields";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { buildVs01PrepareSigningRoles, stampSenderFieldWithPrepareRole } from "./vs01SignerFieldAssignment";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import type { Vs01Counterparty } from "./types";
import { hydrateVs01RecipientFromServerPacket } from "./vs01RecipientServerHydration";
import * as signingPacketServer from "./vs01SigningPacketServer";
import { buildFlowLineDescriptors } from "./vs01CanonicalTextLayout";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { dispatchSigningInvitesFromHandoff } from "./vs01SigningInviteDelivery";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";

const AG = "ag_test346_red_mesa_harbor";
const DOC = "doc_test346_red_mesa";

function redMesaHarborCorpus(): string {
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

1. Services and Engagement Scope. Provider will deliver consulting services as described herein.

2. Deliverables and Acceptance To the extent deliverables are provided, Client will review within ten days.

3. Term The term begins on the Effective Date and continues for twelve months.

4. Fees, Invoicing and Payment. Client will pay fixed fees as invoiced.

${"Operational detail clause with standard commercial language and milestone acceptance criteria. ".repeat(85)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Randy Heim
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Unit Gunner
Title: Member
Date: ____________________`;
}

function redMesaParties(): Vs01Counterparty[] {
  return [
    {
      id: "cp_harbor",
      name: "Harbor Peak Automation LLC",
      email: "cryptocurated21@gmail.com",
      signerName: "Unit Gunner",
      signerTitle: "Member",
    },
  ];
}

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "anthemhayek@me.com",
    ownerSignerName: "Randy Heim",
    ownerSignerTitle: "Manager",
    counterparties: redMesaParties(),
  });
}

function completeRoleFields(role: ReturnType<typeof roles>[number]): PlacedSigningField[] {
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

describe("vs01 test346 signing packet hydration (Red Mesa / Harbor Peak)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("prepare packet retains fieldCount and uploads portable packet with signing invites", async () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: redMesaHarborCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    let sender: PlacedSigningField[] = [];
    for (const role of r) {
      sender = [...sender, ...completeRoleFields(role)];
    }
    const result = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Services Agreement",
      documentId: DOC,
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "anthemhayek@me.com",
      ownerSignerName: "Randy Heim",
      ownerSignerTitle: "Manager",
      counterparties: redMesaParties(),
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: corpus,
      initialsEnabled: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portablePacket?.fields.length ?? 0).toBeGreaterThan(0);
    expect(result.portablePacket?.roles.length).toBe(2);

    const spy = vi.spyOn(agreementWorkspaceApi, "postSigningLinksSent").mockResolvedValue({
      ok: true,
      sent_count: 2,
      skip_reason: null,
      packet_persisted: true,
    });
    await dispatchSigningInvitesFromHandoff(result.handoff, r, {
      portablePacket: result.portablePacket,
      documentId: DOC,
    });
    expect(spy).toHaveBeenCalledWith(
      AG,
      expect.objectContaining({
        document_id: DOC,
        portable_packet: expect.objectContaining({ v: 1, fields: expect.any(Array) }),
      }),
    );
  });

  it("server packet hydrates signer fields from email-style URL without creator localStorage", async () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: redMesaHarborCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    let sender: PlacedSigningField[] = [];
    for (const role of r) {
      sender = [...sender, ...completeRoleFields(role)];
    }
    const prepared = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Services Agreement",
      documentId: DOC,
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "anthemhayek@me.com",
      ownerSignerName: "Randy Heim",
      ownerSignerTitle: "Manager",
      counterparties: redMesaParties(),
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: corpus,
      initialsEnabled: true,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || !prepared.portablePacket) return;

    localStorage.clear();
    sessionStorage.clear();

    vi.spyOn(signingPacketServer, "fetchPublicVs01SigningPacket").mockResolvedValue({
      ok: true,
      portable: prepared.portablePacket,
    });

    const ownerRole = r[0]!;
    const ownerHydration = await hydrateVs01RecipientFromServerPacket({
      agreementId: AG,
      documentId: DOC,
      packetRevision: prepared.handoff.packetRevision ?? null,
      lockedCounterpartyId: ownerRole.vs01CounterpartyId ?? "owner",
      lockedSignerRoleId: ownerRole.roleId,
      recipientName: "Red Mesa Logistics LLC",
      recipientEmail: "anthemhayek@me.com",
    });
    expect(ownerHydration.ok).toBe(true);
    expect(ownerHydration.fields.length).toBeGreaterThan(0);
    expect(ownerHydration.fields.some((f) => f.type === "signature")).toBe(true);
    expect(ownerHydration.fields.some((f) => f.type === "initials")).toBe(true);

    localStorage.clear();
    sessionStorage.clear();

    const cpRole = r[1]!;
    const cpHydration = await hydrateVs01RecipientFromServerPacket({
      agreementId: AG,
      documentId: DOC,
      packetRevision: prepared.handoff.packetRevision ?? null,
      lockedCounterpartyId: cpRole.vs01CounterpartyId ?? "cp_harbor",
      lockedSignerRoleId: cpRole.roleId,
      recipientName: "Harbor Peak Automation LLC",
      recipientEmail: "cryptocurated21@gmail.com",
    });
    expect(cpHydration.ok).toBe(true);
    expect(cpHydration.fields.some((f) => f.type === "signature")).toBe(true);
    expect(cpHydration.fields.some((f) => f.type === "initials")).toBe(true);
  });

  it("signer canonical render keeps main section headings bold and avoids 20-page PDF fallback scale", () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: redMesaHarborCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeLessThan(16);
    expect(model.pages[0]!.flowLines.some((l) => /^\d+\./.test(l.trim()))).toBe(true);

    const glued =
      "2. Deliverables and Acceptance To the extent deliverables are provided, Client will review within ten days.";
    const descriptors = buildFlowLineDescriptors([glued]);
    expect(descriptors[0]?.kind).toBe("heading");
    expect(descriptors[1]?.kind).toBe("body");

    const page = model.pages[0]!;
    const { container } = render(<Vs01CanonicalSigningPage page={page} pageWidthPx={612} />);
    const heading = container.querySelector(".vs01-canonical-flow-line--heading");
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toMatch(/1\.\s+Services and Engagement Scope/i);
  });
});
