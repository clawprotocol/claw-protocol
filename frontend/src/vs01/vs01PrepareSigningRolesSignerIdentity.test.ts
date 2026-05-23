import { describe, expect, it } from "vitest";
import { buildAgreementVs01BridgeSession, mergePaidProRecipientSetupSignerMetadataIntoDraft } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { resolvePreparePrintedNameDisplay } from "./vs01PrepareSignerDisplay";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";

const FIVE_ENTITIES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Northwind Capital Partners LP",
  "Summit Ridge Holdings Corp.",
  "Blue Mesa Advisory LLC",
];

function fivePartyEntityDraft(): AgreementDraft {
  return {
    id: "ag_five",
    title: "Multi-party MSA",
    jurisdiction: "Delaware",
    parties: FIVE_ENTITIES.map((name, i) => ({
      id: `p${i}`,
      name,
      role: i === 0 ? "owner" : "signer",
      email: i === 0 ? "owner@example.com" : `party${i}@example.com`,
    })),
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [],
  } as AgreementDraft;
}

describe("buildVs01PrepareSigningRoles signer identity", () => {
  it("5-party entity-only: partyName stays entity, signerName blank, owner not initials", () => {
    const draft = fivePartyEntityDraft();
    const bridge = buildAgreementVs01BridgeSession({
      agreementId: "ag_five",
      vs01DocumentId: "doc_five",
      draft,
      senderFirstLawdogHandoff: true,
    });
    expect(bridge.creatorName).toBe("Redwood Peak Ventures LLC");
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_five",
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties,
    });
    expect(roles).toHaveLength(5);
    const owner = roles[0]!;
    expect(owner.partyName).toBe("Redwood Peak Ventures LLC");
    expect(owner.signerName).toBeUndefined();
    expect(owner.partyName).not.toBe("j");
    const cp = roles[1]!;
    expect(cp.partyName).toBe("Atlas Harbor Technologies Inc.");
    expect(cp.signerName).toBeUndefined();
    const printed = resolvePreparePrintedNameDisplay(cp, "prepare_display");
    expect(printed.primary).toBe("Signer name");
    expect(printed.sublabel).toBe("for Atlas Harbor Technologies Inc.");
  });

  it("carries representative names and titles from draft parties through bridge and roles", () => {
    const draft = fivePartyEntityDraft();
    draft.parties[0] = { ...draft.parties[0]!, signerName: "Jordan Lee", signerTitle: "Managing Member" };
    draft.parties[1] = { ...draft.parties[1]!, signerName: "Sam Rivera", signerTitle: "CEO" };
    const bridge = buildAgreementVs01BridgeSession({
      agreementId: "ag_five",
      vs01DocumentId: "doc_five",
      draft,
    });
    expect(bridge.creatorSignerName).toBe("Jordan Lee");
    expect(bridge.creatorSignerTitle).toBe("Managing Member");
    expect(bridge.counterparties[0]?.signerName).toBe("Sam Rivera");
    expect(bridge.counterparties[0]?.signerTitle).toBe("CEO");
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_five",
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties,
    });
    expect(roles[0]!.signerName).toBe("Jordan Lee");
    expect(roles[0]!.signerTitle).toBe("Managing Member");
    expect(resolvePreparePrintedNameDisplay(roles[1]!, "prepare_display").primary).toBe("Sam Rivera");
  });

  it("mergePaidProRecipientSetupSignerMetadataIntoDraft applies UI signer rows by index", () => {
    const draft = fivePartyEntityDraft();
    const merged = mergePaidProRecipientSetupSignerMetadataIntoDraft(draft, {
      recipientPartySignerNames: ["", "Alex Kim", "", "", ""],
      recipientPartySignerTitles: ["", "General Counsel", "", "", ""],
    });
    expect(merged?.parties[1]?.signerName).toBe("Alex Kim");
    expect(merged?.parties[1]?.signerTitle).toBe("General Counsel");
    expect(merged?.parties[0]?.signerName).toBeUndefined();
  });

  it("individual counterparty uses party name as signer, not email local part", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_individual",
      creatorName: "Acme LLC",
      creatorEmail: "anthem@acme.com",
      ownerSignerName: "Anthem Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joem@gmail.com" }],
    });
    expect(roles[1]!.signerName).toBe("Joe Smith");
    const display = resolvePreparePrintedNameDisplay(roles[1]!, "prepare_display");
    expect(display.primary).toBe("Joe Smith");
    expect(display.isPlaceholder).toBe(false);
  });
});
