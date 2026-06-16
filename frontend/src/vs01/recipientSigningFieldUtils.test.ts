/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  isRecipientSignerMarkedComplete,
  stripLockedSignerEditableValuesOnHydrate,
  recipientEditableFieldIsComplete,
  recipientFieldStatusPill,
  recipientFieldStatusPillLabel,
  recipientFinishGateComplete,
  countRecipientSigningActions,
  recipientFinishGateEditableFields,
  recipientSigningActionsLabel,
  resolveRecipientSigningAutoValue,
  signerKeyForRecipientField,
} from "./recipientSigningFieldUtils";
import { patchSignerPacketStatus, writeSigningPacketStatus } from "./vs01SigningPacketStatusStore";

const AG = "ag_recipient_ui";

function field(
  type: Vs01RecipientPlacedField["type"],
  overrides: Partial<Vs01RecipientPlacedField> = {},
): Vs01RecipientPlacedField {
  return {
    id: "f1",
    counterpartyId: "cp1",
    type,
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
    assignedSignerRoleId: "role_cp1",
    ...overrides,
  };
}

describe("recipientSigningFieldUtils", () => {
  const cpById = new Map<string, Vs01Counterparty>([
    [
      "cp1",
      {
        id: "cp1",
        name: "Alpha LLC",
        email: "signer@x.com",
        signerName: "Pat Signer",
        signerTitle: "CEO",
      },
    ],
    [
      "cp2",
      {
        id: "cp2",
        name: "Beta Inc",
        email: "b@x.com",
        signerName: "Bob Beta",
        signerTitle: "CFO",
      },
    ],
  ]);

  beforeEach(() => {
    localStorage.clear();
  });

  it("unsigned signature shows click-to-sign, not signed", () => {
    const pill = recipientFieldStatusPill({
      field: field("signature", { counterpartyId: "cp1", value: "" }),
      isCurrentSignerField: true,
      agreementId: AG,
    });
    expect(pill).toBe("click-to-sign");
    expect(recipientFieldStatusPillLabel(pill)).toBe("Click to sign here");
    expect(pill).not.toBe("signed");
  });

  it("auto-filled metadata has no status pill for current signer", () => {
    const pill = recipientFieldStatusPill({
      field: field("printed_name"),
      isCurrentSignerField: true,
      agreementId: AG,
    });
    expect(pill).toBeNull();
    expect(resolveRecipientSigningAutoValue(field("printed_name"), cpById)).toBe("Pat Signer");
  });

  it("other signer fields show Waiting until signer marked complete in store", () => {
    writeSigningPacketStatus({
      agreementId: AG,
      updatedAt: new Date().toISOString(),
      bySignerKey: { role_cp2: "waiting" },
      fullySigned: false,
    });
    const otherField = field("printed_name", {
      counterpartyId: "cp2",
      assignedSignerRoleId: "role_cp2",
    });
    expect(
      recipientFieldStatusPill({
        field: otherField,
        isCurrentSignerField: false,
        agreementId: AG,
      }),
    ).toBe("waiting");
    expect(isRecipientSignerMarkedComplete(AG, signerKeyForRecipientField(otherField))).toBe(
      false,
    );
  });

  it("signer completion flips only that signer fields to Signed pill", () => {
    writeSigningPacketStatus({
      agreementId: AG,
      updatedAt: new Date().toISOString(),
      bySignerKey: { role_cp2: "signed", role_cp1: "waiting" },
      fullySigned: false,
    });
    const otherDone = field("date", { counterpartyId: "cp2", assignedSignerRoleId: "role_cp2" });
    const mineWaiting = field("signature", { counterpartyId: "cp1", value: "Pat" });
    expect(
      recipientFieldStatusPill({
        field: otherDone,
        isCurrentSignerField: false,
        agreementId: AG,
      }),
    ).toBe("signed");
    expect(
      recipientFieldStatusPill({
        field: mineWaiting,
        isCurrentSignerField: true,
        agreementId: AG,
      }),
    ).toBe("ready");
    patchSignerPacketStatus(AG, "role_cp1", "signed");
    expect(isRecipientSignerMarkedComplete(AG, "role_cp1")).toBe(true);
  });

  it("preserves server-persisted signature values on hydrate", () => {
    const ownerRole = "role_owner";
    const ownerField = field("signature", { assignedSignerRoleId: ownerRole, value: "Pat Signer" });
    const stripped = stripLockedSignerEditableValuesOnHydrate([ownerField], AG, ownerRole, {
      hydrationSource: "server_packet",
    });
    expect(stripped[0]?.value).toBe("Pat Signer");
  });

  it("finish gate requires signature and initials only", () => {
    const myFields = [
      field("printed_name"),
      field("date"),
      field("email"),
      field("text", { textPurpose: "title" }),
      field("signature", { value: "" }),
      field("initials", { id: "f2", value: "" }),
    ];
    const hydrated = hydrateRecipientSigningFields(myFields, cpById);
    expect(recipientFinishGateComplete(hydrated)).toBe(false);
    const editable = recipientFinishGateEditableFields(hydrated);
    expect(editable).toHaveLength(2);
    expect(editable.every((f) => isRecipientSigningEditableType(f.type))).toBe(true);
    const done = hydrated.map((f) =>
      isRecipientSigningEditableType(f.type)
        ? { ...f, value: f.type === "signature" ? "Pat Signer" : "PS" }
        : f,
    );
    expect(recipientFinishGateComplete(done)).toBe(true);
    expect(recipientEditableFieldIsComplete(field("printed_name"))).toBe(true);
  });

  it("countRecipientSigningActions counts signature plus each initials field", () => {
    const fields = [
      field("signature"),
      { ...field("initials"), id: "i1", page: 0 },
      { ...field("initials"), id: "i2", page: 1 },
    ];
    expect(countRecipientSigningActions(fields)).toBe(3);
    expect(recipientSigningActionsLabel(3)).toContain("3 actions required");
  });
});
