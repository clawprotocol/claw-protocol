import { describe, expect, it } from "vitest";
import {
  SIGNING_FIELD_TOOLS,
  buildAutoInitialsFields,
  createPlacedFieldAtClick,
  defaultRecipientFieldValue,
  defaultSizeForRecipientField,
  defaultSizeForType,
  labelForFieldType,
  RECIPIENT_FIELD_TOOLS,
  type PlacedSigningField,
} from "./signingFields";

describe("VS01 sender placement: Text field", () => {
  it("lists Text as its own tool after Printed name (not merged with Printed name)", () => {
    expect(SIGNING_FIELD_TOOLS.map((t) => t.type)).toEqual([
      "signature",
      "initials",
      "printed_name",
      "text",
      "email",
      "date",
    ]);
    expect(SIGNING_FIELD_TOOLS.find((t) => t.type === "text")?.label).toBe("Text");
    expect(labelForFieldType("text")).toBe("Text");
    expect(labelForFieldType("printed_name")).toBe("Printed name");
  });

  it("creates a text field with empty default for arbitrary blanks", () => {
    const ctx = { typedName: "Jane Q. Public", initials: "JQ" };
    const f = createPlacedFieldAtClick("text", 0, 0.5, 0.5, ctx);
    expect(f.type).toBe("text");
    expect(f.value).toBe("");
    expect(f.page).toBe(0);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeGreaterThanOrEqual(0);
  });

  it("creates printed_name from typed full name, distinct from free text", () => {
    const ctx = { typedName: "Jane Q. Public", initials: "JQ" };
    const printed = createPlacedFieldAtClick("printed_name", 1, 0.2, 0.3, ctx);
    expect(printed.type).toBe("printed_name");
    expect(printed.value).toBe("Jane Q. Public");
    const free = createPlacedFieldAtClick("text", 1, 0.6, 0.3, ctx);
    expect(free.type).toBe("text");
    expect(free.value).toBe("");
  });

  it("uses a wider default box for freeform Text than for Printed name (sender + recipient)", () => {
    const textS = defaultSizeForType("text");
    const printedS = defaultSizeForType("printed_name");
    expect(textS.width).toBeGreaterThan(printedS.width);
    expect(textS.height).toBeGreaterThanOrEqual(printedS.height);
    const textR = defaultSizeForRecipientField("text");
    const printedR = defaultSizeForRecipientField("printed_name");
    expect(textR.width).toBeGreaterThan(printedR.width);
  });
});

describe("VS01 sender placement: Email tool", () => {
  it("lists Email after Text in sender and recipient toolbars", () => {
    expect(RECIPIENT_FIELD_TOOLS.map((t) => t.type)).toEqual([
      "signature",
      "initials",
      "printed_name",
      "text",
      "email",
      "date",
    ]);
    expect(labelForFieldType("email")).toBe("Email");
  });

  it("prefills Email from signerEmail when provided", () => {
    const ctx = {
      typedName: "Jane Q. Public",
      initials: "JQ",
      signerEmail: "  jane@example.com ",
    };
    const f = createPlacedFieldAtClick("email", 0, 0.4, 0.4, ctx);
    expect(f.type).toBe("email");
    expect(f.value).toBe("jane@example.com");
  });

  it("uses empty Email value when signer email is unknown (like Text)", () => {
    const ctx = { typedName: "Jane Q. Public", initials: "JQ" };
    const email = createPlacedFieldAtClick("email", 0, 0.4, 0.4, ctx);
    const text = createPlacedFieldAtClick("text", 0, 0.5, 0.5, ctx);
    expect(email.value).toBe("");
    expect(text.value).toBe("");
  });

  it("defaultRecipientFieldValue prefills email from recipient row when known", () => {
    expect(defaultRecipientFieldValue("email", "R", "r@ex.com")).toBe("r@ex.com");
    expect(defaultRecipientFieldValue("email", "R", undefined)).toBe("");
    expect(defaultRecipientFieldValue("email", "R", "   ")).toBe("");
    expect(defaultRecipientFieldValue("text", "R", "r@ex.com")).toBe("");
  });

  it("nudges sender auto-initials away from placed text/date/email boxes", () => {
    const obstacle: PlacedSigningField = {
      id: "blk",
      type: "text",
      page: 0,
      x: 0.72,
      y: 0.82,
      width: 0.22,
      height: 0.12,
    };
    const autos = buildAutoInitialsFields(
      1,
      { typedName: "Sender", initials: "SX" },
      new Set(),
      [obstacle]
    );
    expect(autos).toHaveLength(1);
    const a = autos[0];
    const overlaps =
      a.x < obstacle.x + obstacle.width &&
      a.x + a.width > obstacle.x &&
      a.y < obstacle.y + obstacle.height &&
      a.y + a.height > obstacle.y;
    expect(overlaps).toBe(false);
  });
});
