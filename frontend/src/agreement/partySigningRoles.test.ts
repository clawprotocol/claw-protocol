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

  it("requires only signature per signer (printed name and date optional)", () => {
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
    ];
    const cps = [cp("c1", "Human Person")];
    const rec: Vs01RecipientPlacedField[] = [
      { id: "r1", counterpartyId: "c1", type: "signature", page: 0, x: 0.5, y: 0.1, width: 0.2, height: 0.05 },
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

  it("entity counterparties do not require title without explicit template keys", () => {
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
    ];
    const cps = [cp("c1", "Meridian Workforce Group LLC")];
    const rec: Vs01RecipientPlacedField[] = [
      { id: "r1", counterpartyId: "c1", type: "signature", page: 0, x: 0.5, y: 0.1, width: 0.2, height: 0.05 },
    ];
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: rec,
    });
    expect(g.canFinish).toBe(true);
    expect(g.missingByParty[buildStableSignerRoleId(AG, 1, "c1")]).toBeUndefined();
  });

  it("owner-only: signature on owner completes when no named counterparties", () => {
    const sender: PlacedSigningField[] = [{ id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 }];
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: [{ id: "x", name: "", email: "" }],
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(g.canFinish).toBe(true);
  });

  it("finish disabled when party 3 missing signature in a 5-role agreement", () => {
    const cps = [
      cp("c1", "Party One LLC"),
      cp("c2", "Party Two LLC"),
      cp("c3", "Party Three LLC"),
      cp("c4", "Party Four LLC"),
    ];
    const sender: PlacedSigningField[] = [
      { id: "s1", type: "signature", page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
    ];
    const rec: Vs01RecipientPlacedField[] = [];
    for (const c of cps) {
      if (c.id === "c3") continue;
      rec.push({
        id: `${c.id}_sig`,
        counterpartyId: c.id,
        type: "signature",
        page: 0,
        x: 0.5,
        y: 0.1,
        width: 0.2,
        height: 0.05,
      });
    }
    const g = canFinishPreparingSigningPacket({
      ...gateArgsBase,
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: rec,
    });
    expect(g.canFinish).toBe(false);
    expect(g.missingSignatureRoles.length).toBeGreaterThan(0);
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
