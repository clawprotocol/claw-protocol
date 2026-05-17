/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  recipientSigningFieldIsComplete,
  resolveRecipientSigningAutoValue,
} from "./recipientSigningFieldUtils";

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
  ]);

  it("only signature and initials are editable types", () => {
    expect(isRecipientSigningEditableType("signature")).toBe(true);
    expect(isRecipientSigningEditableType("initials")).toBe(true);
    expect(isRecipientSigningEditableType("printed_name")).toBe(false);
    expect(isRecipientSigningEditableType("date")).toBe(false);
  });

  it("auto-fills printed name, title, email, and date", () => {
    expect(resolveRecipientSigningAutoValue(field("printed_name"), cpById)).toBe("Pat Signer");
    expect(resolveRecipientSigningAutoValue(field("text", { textPurpose: "title" }), cpById)).toBe(
      "CEO",
    );
    expect(resolveRecipientSigningAutoValue(field("email"), cpById)).toBe("signer@x.com");
    expect(resolveRecipientSigningAutoValue(field("date"), cpById)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("treats read-only metadata fields as complete for finish gate", () => {
    const hydrated = hydrateRecipientSigningFields(
      [field("printed_name"), field("date"), field("signature", { value: "Pat Signer" })],
      cpById,
    );
    expect(hydrated.every((f) => recipientSigningFieldIsComplete(f, cpById))).toBe(true);
  });
});
