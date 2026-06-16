/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";
import {
  countRecipientSigningActions,
  recipientFinishGateComplete,
  recipientFinishGateEditableFields,
  resolvePersistedSignerFieldDisplayValue,
} from "./recipientSigningFieldUtils";
import { isVs01InitialsEnabledForPacket } from "./vs01RecipientSignerMarksHydration";
import { RecipientSigningFieldOverlay } from "./RecipientSigningFieldOverlay";
import { patchSignerPacketStatus } from "./vs01SigningPacketStatusStore";
import type { Vs01RecipientPlacedField } from "./types";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";

const AG = "ag_test364";
const OWNER_ROLE = "vs01r:ag_test364:i0:owner";
const CP_ROLE = "vs01r:ag_test364:i1:cp";
const OWNER_CP = "owner";
const CP_CP = "cp1";

function sigField(
  id: string,
  roleId: string,
  cpId: string,
  value = "",
): Vs01RecipientPlacedField {
  return {
    id,
    counterpartyId: cpId,
    type: "signature",
    page: 9,
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.05,
    assignedSignerRoleId: roleId,
    value,
  };
}

function initialsField(id: string, roleId: string, cpId: string, page: number): Vs01RecipientPlacedField {
  return {
    id,
    counterpartyId: cpId,
    type: "initials",
    page,
    x: 0.8,
    y: 0.9,
    width: 0.08,
    height: 0.04,
    assignedSignerRoleId: roleId,
    autoInitials: true,
    value: "",
  };
}

function portableWithInitialsDisabled(): Vs01CanonicalPacketPortableV1 {
  return {
    v: 1,
    seed: {
      v: 1,
      documentId: "doc364",
      agreementId: AG,
      corpusPlain: "x".repeat(1600),
      corpusHash: "h",
      savedAt: "2026-01-01T00:00:00Z",
    },
    fields: [],
    roles: [],
    pageCount: 10,
    witnessPageIndex: 9,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 0,
  };
}

describe("Test364 recipient signing action counts", () => {
  it("does not require initials when packet initialsPolicy.enabled is false", () => {
    const portable = portableWithInitialsDisabled();
    expect(isVs01InitialsEnabledForPacket(portable)).toBe(false);

    const party2Fields = [
      sigField("cp_sig", CP_ROLE, CP_CP),
      ...Array.from({ length: 9 }, (_, i) => initialsField(`cp_i${i}`, CP_ROLE, CP_CP, i)),
    ];
    const scoped = party2Fields.filter((f) =>
      recipientFieldBelongsToLockedSigner(f, CP_CP, CP_ROLE),
    );
    const editable = recipientFinishGateEditableFields(scoped, { initialsEnabled: false });
    expect(countRecipientSigningActions(editable, { initialsEnabled: false })).toBe(1);
    expect(editable).toHaveLength(1);
    expect(editable[0]?.type).toBe("signature");
  });

  it("counts initials only when explicitly enabled", () => {
    const partyFields = [
      sigField("cp_sig", CP_ROLE, CP_CP),
      initialsField("cp_i0", CP_ROLE, CP_CP, 0),
      initialsField("cp_i1", CP_ROLE, CP_CP, 1),
    ];
    expect(countRecipientSigningActions(partyFields, { initialsEnabled: true })).toBe(3);
    expect(countRecipientSigningActions(partyFields, { initialsEnabled: false })).toBe(1);
  });

  it("party 2 can finish after signature only when initials disabled", () => {
    const party2Fields = [
      sigField("cp_sig", CP_ROLE, CP_CP, "Heath Ledger"),
      ...Array.from({ length: 9 }, (_, i) => initialsField(`cp_i${i}`, CP_ROLE, CP_CP, i)),
    ];
    expect(recipientFinishGateComplete(party2Fields, { initialsEnabled: false })).toBe(true);
  });

  it("does not count other-party fields toward party 2 actions", () => {
    const ownerSig = sigField("owner_sig", OWNER_ROLE, OWNER_CP, "Hue Lorrey");
    const cpSig = sigField("cp_sig", CP_ROLE, CP_CP);
    const cpScoped = [ownerSig, cpSig].filter((f) =>
      recipientFieldBelongsToLockedSigner(f, CP_CP, CP_ROLE),
    );
    expect(countRecipientSigningActions(cpScoped, { initialsEnabled: false })).toBe(1);
  });

  it("shows prior signer signature from persisted field value", () => {
    const ownerSig = sigField("owner_sig", OWNER_ROLE, OWNER_CP, "Hue Lorrey");
    patchSignerPacketStatus(AG, OWNER_ROLE, "signed");
    const cpById = new Map([
      [OWNER_CP, { id: OWNER_CP, name: "Owner Co", email: "o@test.com" }],
    ]);
    render(
      <RecipientSigningFieldOverlay
        field={ownerSig}
        lockedCounterpartyId={CP_CP}
        lockedSignerRoleId={CP_ROLE}
        recipientAgreementId={AG}
        cpById={cpById}
        onUpdateValue={() => {}}
        canonicalCompact
      />,
    );
    expect(resolvePersistedSignerFieldDisplayValue(ownerSig, AG, cpById)).toBe("Hue Lorrey");
    expect(screen.getByText("Hue Lorrey")).toBeTruthy();
  });
});
