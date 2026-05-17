import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { normalizeSignerMetadataForSave } from "./signerMetadataNormalize";
import { applyStarterRecipientUiToDraftParties } from "../components/agreements/starterRecipientDraftMerge";
import {
  buildAgreementVs01BridgeSession,
  mergeLiveDraftWithRecipientSetupForVs01Bridge,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildVs01PrepareSigningRoles } from "../vs01/vs01SignerFieldAssignment";
import { resolvePreparePrintedNameDisplay } from "../vs01/vs01PrepareSignerDisplay";
import { resolveVs01FieldValueForRole } from "../vs01/vs01FieldValueResolution";
import { seedPrepareFieldsFromRoleSignerMetadata } from "../vs01/vs01PrepareSignerMetadata";

describe("signer metadata carryover Jane Doe", () => {
  it("recipient UI arrays preserve spaces until save normalization", () => {
    const typing = "Jane ";
    expect(typing).toBe("Jane ");
    expect(normalizeSignerMetadataForSave(typing)).toBe("Jane");
    expect(normalizeSignerMetadataForSave("Jane Doe")).toBe("Jane Doe");
  });

  it("flows Jane Doe and Managing Member through draft, bridge, roles, and field values", () => {
    const draft = applyStarterRecipientUiToDraftParties(
      {
        title: "MSA",
        parties: [
          { name: "Redwood Peak Ventures LLC", role: "owner" },
          { name: "Atlas Harbor Technologies Inc.", role: "signer" },
        ],
      } as Parameters<typeof applyStarterRecipientUiToDraftParties>[0],
      {
        recipient1Name: "",
        recipient1Email: "owner@example.com",
        recipient2Name: "",
        recipient2Email: "cp@example.com",
        recipientPartyEmails: ["owner@example.com", "cp@example.com"],
        recipientPartySignerNames: ["Jane Doe", "Sam Rivera"],
        recipientPartySignerTitles: ["Managing Member", "CEO"],
        stripRecipientEmailNoise: (s) => s.trim(),
        looksLikeEmail: () => true,
      },
    );
    const p0 = draft.parties[0] as { signerName?: string; signerTitle?: string };
    expect(p0.signerName).toBe("Jane Doe");
    expect(p0.signerTitle).toBe("Managing Member");

    const merged = mergeLiveDraftWithRecipientSetupForVs01Bridge(draft as unknown as AgreementDraft, {
      recipientPartySignerNames: ["Jane Doe", "Sam Rivera"],
      recipientPartySignerTitles: ["Managing Member", "CEO"],
    });
    const bridge = buildAgreementVs01BridgeSession({
      agreementId: "ag_jane",
      vs01DocumentId: "doc_jane",
      draft: merged,
    });
    expect(bridge.creatorSignerName).toBe("Jane Doe");
    expect(bridge.creatorSignerTitle).toBe("Managing Member");

    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_jane",
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties,
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    expect(owner.partyName).toBe("Redwood Peak Ventures LLC");
    expect(owner.signerName).toBe("Jane Doe");
    expect(resolvePreparePrintedNameDisplay(owner, "prepare_display").primary).toBe("Jane Doe");
    expect(resolveVs01FieldValueForRole({
      fieldType: "text",
      role: owner,
      mode: "prepare_display",
    })).toBe("Managing Member");

    expect(cp.signerName).toBe("Sam Rivera");
    expect(resolvePreparePrintedNameDisplay(cp, "prepare_display").primary).toBe("Sam Rivera");

    const seeded = seedPrepareFieldsFromRoleSignerMetadata(
      [
        {
          id: "pn1",
          type: "printed_name",
          page: 0,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.04,
          value: "",
          assignedSignerRoleId: cp.roleId,
        },
      ],
      roles,
      () => ({ typedName: "", initials: "", signerEmail: undefined }),
    );
    expect(seeded[0]!.value).toBe("Sam Rivera");
  });

  it("Redwood Peak owner printed_name and title resolve from explicit signer metadata", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_redwood",
      creatorName: "Redwood Peak Ventures LLC",
      creatorEmail: "owner@example.com",
      ownerSignerName: "Redwood Santa",
      ownerSignerTitle: "Honcho",
      counterparties: [
        {
          id: "atlas",
          name: "Atlas Harbor Technologies Inc.",
          email: "jim@atlas.example",
          signerName: "Jim Atlas",
          signerTitle: "CEO",
        },
      ],
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    expect(owner.partyName).toBe("Redwood Peak Ventures LLC");
    expect(resolvePreparePrintedNameDisplay(owner, "prepare_display").primary).toBe("Redwood Santa");
    expect(
      resolveVs01FieldValueForRole({ fieldType: "text", role: owner, mode: "prepare_display" }),
    ).toBe("Honcho");
    expect(resolvePreparePrintedNameDisplay(cp, "prepare_display").primary).toBe("Jim Atlas");
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "printed_name",
        role: owner,
        mode: "prepare_stored",
        ownerPad: { typedName: "Script From Pad", initials: "SP" },
      }),
    ).toBe("Redwood Santa");
  });
});
