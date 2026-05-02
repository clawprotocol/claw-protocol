import { describe, expect, it } from "vitest";
import type { Vs01RecipientPlacedField } from "./types";
import {
  SIGNING_FIELD_TOOLS,
  autoInitialsPlacementDims,
  buildAutoInitialsFields,
  createPlacedFieldAtClick,
  defaultRecipientFieldValue,
  defaultSizeForRecipientField,
  defaultSizeForType,
  labelForFieldType,
  rebuildRecipientAutoInitialsEveryPage,
  RECIPIENT_FIELD_TOOLS,
  type PlacedSigningField,
} from "./signingFields";

function normRectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad: number
): boolean {
  return (
    a.x - pad < b.x + b.width + pad &&
    a.x + a.width + pad > b.x - pad &&
    a.y - pad < b.y + b.height + pad &&
    a.y + a.height + pad > b.y - pad
  );
}

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
    expect(textS.height).toBeGreaterThan(0.04);
    const textR = defaultSizeForRecipientField("text");
    const printedR = defaultSizeForRecipientField("printed_name");
    expect(textR.width).toBeGreaterThan(printedR.width);
  });

  it("uses compact line-like default heights for Text and Email", () => {
    expect(defaultSizeForType("text").height).toBeLessThanOrEqual(0.052);
    expect(defaultSizeForType("email").height).toBeLessThanOrEqual(0.054);
    expect(defaultSizeForType("email").width).toBeGreaterThanOrEqual(defaultSizeForType("text").width);
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

  it("nudges sender auto-initials away from placed text boxes", () => {
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

  it("nudges sender auto-initials away from placed signature fields", () => {
    const obstacle: PlacedSigningField = {
      id: "sig",
      type: "signature",
      page: 0,
      x: 0.65,
      y: 0.78,
      width: 0.3,
      height: 0.14,
      value: "Signer",
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

describe("VS01 auto initials placement", () => {
  it("uses a smaller box for gray auto initials than for tool-placed initials", () => {
    const auto = autoInitialsPlacementDims();
    const manual = defaultSizeForRecipientField("initials");
    expect(auto.width).toBeLessThan(manual.width);
    expect(auto.height).toBeLessThan(manual.height);
  });

  it("keeps recipient gray auto initials clear of sender signature on the same page", () => {
    const senderPlacedFields: PlacedSigningField[] = [
      {
        id: "sig",
        type: "signature",
        page: 0,
        x: 0.64,
        y: 0.78,
        width: 0.32,
        height: 0.14,
        value: "X",
      },
    ];
    const out = rebuildRecipientAutoInitialsEveryPage([], "cp1", 1, new Set(), senderPlacedFields, [
      { id: "cp1", name: "Party A" },
    ]);
    const auto = out.find((f) => f.autoInitials);
    expect(auto).toBeDefined();
    const sig = senderPlacedFields[0];
    const a = auto!;
    const overlaps =
      a.x < sig.x + sig.width &&
      a.x + a.width > sig.x &&
      a.y < sig.y + sig.height &&
      a.y + a.height > sig.y;
    expect(overlaps).toBe(false);
  });

  it("skips gray auto initials when the right margin lane has no collision-free slot", () => {
    const senderPlacedFields: PlacedSigningField[] = [
      {
        id: "lane_wall",
        type: "text",
        page: 0,
        x: 0.86,
        y: 0,
        width: 0.14,
        height: 1,
        value: "",
      },
    ];
    const out = rebuildRecipientAutoInitialsEveryPage([], "cp1", 1, new Set(), senderPlacedFields, [
      { id: "cp1", name: "Party A" },
    ]);
    expect(out.some((f) => f.autoInitials)).toBe(false);
  });

  it("keeps gray auto initials clear of recipient email and date obstacles", () => {
    const obstacles: Vs01RecipientPlacedField[] = [
      {
        id: "em1",
        counterpartyId: "cp1",
        type: "email",
        page: 0,
        x: 0.88,
        y: 0.72,
        width: 0.1,
        height: 0.052,
        value: "x@y.z",
      },
      {
        id: "dt1",
        counterpartyId: "cp1",
        type: "date",
        page: 0,
        x: 0.88,
        y: 0.5,
        width: 0.12,
        height: 0.052,
        value: "2026-04-30",
      },
    ];
    const out = rebuildRecipientAutoInitialsEveryPage(obstacles, "cp1", 1, new Set(), [], [
      { id: "cp1", name: "Party A" },
    ]);
    const auto = out.find((f) => f.autoInitials);
    expect(auto).toBeDefined();
    const pad = 0.024;
    for (const o of obstacles) {
      const overlaps = normRectsOverlap(
        { x: auto!.x, y: auto!.y, width: auto!.width, height: auto!.height },
        { x: o.x, y: o.y, width: o.width, height: o.height },
        pad
      );
      expect(overlaps).toBe(false);
    }
  });
});
