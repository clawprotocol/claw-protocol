import { describe, expect, it } from "vitest";
import {
  SIGNING_FIELD_TOOLS,
  createPlacedFieldAtClick,
  defaultSizeForRecipientField,
  defaultSizeForType,
  labelForFieldType,
} from "./signingFields";

describe("VS01 sender placement: Text field", () => {
  it("lists Text as its own tool after Printed name (not merged with Printed name)", () => {
    expect(SIGNING_FIELD_TOOLS.map((t) => t.type)).toEqual([
      "signature",
      "initials",
      "printed_name",
      "text",
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
