import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import type { PlacedSigningField } from "../vs01/signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "../vs01/types";
import {
  buildPartySigningRolesFromAgreementHandoff,
  canFinishPreparingSigningPacket,
  isActualSignerCompletionAllowed,
  looksLikeLegalEntityPartyName,
  shouldBlockVs01SignatureCompleteTelemetry,
} from "./partySigningRoles";
import { buildStableSignerRoleId } from "../vs01/vs01SignerFieldAssignment";

function draftFixture(parties: AgreementDraft["parties"]): AgreementDraft {
  return {
    id: "a1",
    title: "Test",
    jurisdiction: "US",
    parties,
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [],
  };
}

describe("looksLikeLegalEntityPartyName", () => {
  it("detects common entity suffixes", () => {
    expect(looksLikeLegalEntityPartyName("Atlas Harbor Technologies Inc.")).toBe(true);
    expect(looksLikeLegalEntityPartyName("Jane Smith")).toBe(false);
  });
});

describe("buildPartySigningRolesFromAgreementHandoff", () => {
  it("does not copy entity name into signerName", () => {
    const d = draftFixture([
      { id: "o1", name: "Redwood Peak Ventures LLC", role: "owner", email: "owner@example.com" },
      { id: "c1", name: "Jane Smith", role: "counterparty", email: "jane@example.com", signerName: "Jane Smith" },
    ]);
    const roles = buildPartySigningRolesFromAgreementHandoff({
      agreementId: "a1",
      draft: d,
      bridge: { reviewerApprovedCleanHandoff: true } as AgreementVs01BridgeSession,
    });
    const owner = roles.find((r) => r.role === "owner");
    expect(owner?.signerName).toBeUndefined();
    expect(owner?.partyName).toBe("Redwood Peak Ventures LLC");
  });

  it("keeps explicit signer distinct from entity", () => {
    const d = draftFixture([
      { id: "o1", name: "Acme LLC", role: "owner", signerName: "Pat Lee", signerTitle: "President" },
    ]);
    const roles = buildPartySigningRolesFromAgreementHandoff({ agreementId: "x", draft: d, bridge: null });
    expect(roles[0]?.signerName).toBe("Pat Lee");
    expect(roles[0]?.entityName).toBe("Acme LLC");
  });

  it("separates review vs signer email when provided", () => {
    const d = draftFixture([
      {
        id: "o1",
        name: "Owner Co LLC",
        role: "owner",
        email: "review@owner.com",
        reviewEmail: "review@owner.com",
        signerEmail: "signer@owner.com",
      },
    ]);
    const r = buildPartySigningRolesFromAgreementHandoff({ agreementId: "x", draft: d, bridge: null })[0]!;
    expect(r.reviewEmail).toBe("review@owner.com");
    expect(r.signerEmail).toBe("signer@owner.com");
  });
});

describe("canFinishPreparingSigningPacket", () => {
  const AG = "agreement_test_gate_xx";
  const gateArgsBase = {
    agreementId: AG,
    creatorName: "Owner Person",
    creatorEmail: "owner@example.com",
  };

  const cp = (id: string, name: string): Vs01Counterparty => ({ id, name, email: "r@x.com" });

  it("requires owner + each named counterparty signature, printed name, and date", () => {
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      { id: "p1", type: "printed_name", page: 0, x: 0.1, y: 0.2, width: 0.2, height: 0.03, value: "" },
      { id: "d1", type: "date", page: 0, x: 0.1, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-01" },
    ];
    const cps = [cp("c1", "Human Person")];
    const rec: Vs01RecipientPlacedField[] = [
      { id: "r1", counterpartyId: "c1", type: "signature", page: 0, x: 0.5, y: 0.1, width: 0.2, height: 0.05 },
      { id: "r2", counterpartyId: "c1", type: "printed_name", page: 0, x: 0.5, y: 0.2, width: 0.2, height: 0.03 },
      { id: "r3", counterpartyId: "c1", type: "date", page: 0, x: 0.5, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-02" },
    ];
    expect(
      canFinishPreparingSigningPacket({
        ...gateArgsBase,
        counterparties: cps,
        senderPlacedFields: sender,
        recipientPlacedFields: rec,
      }).canFinish,
    ).toBe(true);
  });

  it("requires title (text) for entity counterparties", () => {
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      { id: "p1", type: "printed_name", page: 0, x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
      { id: "d1", type: "date", page: 0, x: 0.1, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-01" },
    ];
    const cps = [cp("c1", "Meridian Workforce Group LLC")];
    const rec: Vs01RecipientPlacedField[] = [
      { id: "r1", counterpartyId: "c1", type: "signature", page: 0, x: 0.5, y: 0.1, width: 0.2, height: 0.05 },
      { id: "r2", counterpartyId: "c1", type: "printed_name", page: 0, x: 0.5, y: 0.2, width: 0.2, height: 0.03 },
      { id: "r3", counterpartyId: "c1", type: "date", page: 0, x: 0.5, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-02" },
    ];
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: rec,
    });
    expect(g.canFinish).toBe(false);
    const c1RoleId = buildStableSignerRoleId(AG, 1, "c1");
    expect(g.missingByParty[c1RoleId]).toContain("title");
    const rec2 = [...rec, { id: "r4", counterpartyId: "c1", type: "text" as const, page: 0, x: 0.5, y: 0.4, width: 0.2, height: 0.03 }];
    expect(
      canFinishPreparingSigningPacket({
        ...gateArgsBase,
        counterparties: cps,
        senderPlacedFields: sender,
        recipientPlacedFields: rec2,
      }).canFinish,
    ).toBe(true);
  });

  it("owner-only: no named counterparties still requires sender trio", () => {
    const sender: PlacedSigningField[] = [{ id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 }];
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: [{ id: "x", name: "", email: "" }],
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(g.canFinish).toBe(false);
  });

  it("finish disabled when party 3 missing fields in a 5-role agreement", () => {
    const cps = [
      cp("c1", "Party One LLC"),
      cp("c2", "Party Two LLC"),
      cp("c3", "Party Three LLC"),
      cp("c4", "Party Four LLC"),
    ];
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      { id: "p1", type: "printed_name", page: 0, x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
      { id: "d1", type: "date", page: 0, x: 0.1, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-01" },
      { id: "t1", type: "text", page: 0, x: 0.1, y: 0.4, width: 0.2, height: 0.03 },
    ];
    const rec: Vs01RecipientPlacedField[] = [];
    for (const c of cps) {
      if (c.id === "c3") continue;
      rec.push(
        { id: `${c.id}_sig`, counterpartyId: c.id, type: "signature", page: 0, x: 0.5, y: 0.1, width: 0.2, height: 0.05 },
        { id: `${c.id}_pn`, counterpartyId: c.id, type: "printed_name", page: 0, x: 0.5, y: 0.2, width: 0.2, height: 0.03 },
        { id: `${c.id}_dt`, counterpartyId: c.id, type: "date", page: 0, x: 0.5, y: 0.3, width: 0.15, height: 0.03, value: "2026-01-02" },
        { id: `${c.id}_tt`, counterpartyId: c.id, type: "text", page: 0, x: 0.5, y: 0.4, width: 0.2, height: 0.03 },
      );
    }
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: rec,
    });
    expect(g.canFinish).toBe(false);
    expect(Object.keys(g.missingByParty).length).toBeGreaterThan(0);
  });
});

describe("prepare vs signer execution", () => {
  it("blocks signature-complete telemetry in prepare mode", () => {
    expect(
      shouldBlockVs01SignatureCompleteTelemetry({
        agreementBridgeMode: "prepare_signing_packet",
        ownerIsPreparingPacket: true,
      }),
    ).toBe(true);
  });

  it("disallows actual signer completion in prepare mode even with receipt flag", () => {
    expect(
      isActualSignerCompletionAllowed({
        agreementBridgeMode: "prepare_signing_packet",
        ownerIsPreparingPacket: true,
        hasSignerSessionReceipt: true,
      }),
    ).toBe(false);
  });

  it("allows signer completion outside prepare mode when receipt exists", () => {
    expect(
      isActualSignerCompletionAllowed({
        agreementBridgeMode: undefined,
        ownerIsPreparingPacket: false,
        hasSignerSessionReceipt: true,
      }),
    ).toBe(true);
  });
});
