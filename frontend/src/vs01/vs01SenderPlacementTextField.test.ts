import { describe, expect, it } from "vitest";
import type { Vs01RecipientPlacedField } from "./types";
import {
  SIGNING_FIELD_TOOLS,
  VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM,
  autoInitialsPlacementDims,
  buildAutoInitialsFields,
  createPlacedFieldAtClick,
  defaultValueForType,
  defaultRecipientFieldValue,
  defaultSizeForRecipientField,
  defaultSizeForType,
  findAutoInitialsMarginSlotOrNull,
  labelForFieldType,
  rebuildRecipientAutoInitialsEveryPage,
  RECIPIENT_FIELD_TOOLS,
  resizeBoundsForPlacementField,
  resolveRecipientEmailForEmailFieldPlacement,
  resolveSenderEmailForEmailFieldPlacement,
  signingFieldResizeBoundsNorm,
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
    expect(textS.height).toBeGreaterThan(0.028);
    const textR = defaultSizeForRecipientField("text");
    const printedR = defaultSizeForRecipientField("printed_name");
    expect(textR.width).toBeGreaterThan(printedR.width);
  });

  it("uses compact line-like default heights for Text and Email", () => {
    expect(defaultSizeForType("text").height).toBeLessThanOrEqual(0.036);
    expect(defaultSizeForType("email").height).toBeLessThanOrEqual(0.036);
    expect(defaultSizeForType("email").width).toBeGreaterThanOrEqual(defaultSizeForType("text").width);
  });
});

describe("VS01 manual field sizing map and resize bounds", () => {
  it("exposes one manual default map aligned for sender and recipient tools", () => {
    for (const t of [
      "signature",
      "initials",
      "printed_name",
      "text",
      "email",
      "date",
    ] as const) {
      expect(defaultSizeForType(t)).toEqual(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM[t]);
      expect(defaultSizeForRecipientField(t)).toEqual(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM[t]);
    }
  });

  it("keeps gray auto-initials dims separate and smaller than manual initials", () => {
    const auto = autoInitialsPlacementDims();
    const manual = VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.initials;
    expect(auto.width).toBe(0.048);
    expect(auto.height).toBe(0.024);
    expect(auto.width).toBeLessThan(manual.width);
    expect(auto.height).toBeLessThan(manual.height);
  });

  it("defaults line-like text, email, date, and printed_name (not oversized blocks)", () => {
    const { text, email, date, printed_name } = VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM;
    expect(text.height).toBeLessThanOrEqual(0.034);
    expect(email.height).toBe(text.height);
    expect(date.height).toBe(text.height);
    expect(printed_name.height).toBe(text.height);
    expect(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.signature.height).toBeLessThanOrEqual(0.056);
  });

  it("orders default widths: email >= text >= printed_name and email > date", () => {
    const { text, email, printed_name, date } = VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM;
    expect(email.width).toBeGreaterThanOrEqual(text.width);
    expect(text.width).toBeGreaterThanOrEqual(printed_name.width);
    expect(email.width).toBeGreaterThan(date.width);
  });

  it("allows Text/Email to grow on resize up to generous max while enforcing mins", () => {
    const tb = signingFieldResizeBoundsNorm("text");
    const eb = signingFieldResizeBoundsNorm("email");
    expect(tb.maxW).toBeGreaterThan(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.text.width);
    expect(tb.maxH).toBeGreaterThan(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.text.height);
    expect(eb.maxH).toBeGreaterThan(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.email.height);
    expect(tb.minW).toBeLessThanOrEqual(VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM.text.width);
    expect(resizeBoundsForPlacementField({ type: "initials", autoInitials: true }).maxW).toBeLessThanOrEqual(0.09);
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

  it("defaultValueForType email uses signerEmail when plausible", () => {
    const ctx = { typedName: "A B", initials: "AB", signerEmail: "a@example.com" };
    expect(defaultValueForType("email", ctx)).toBe("a@example.com");
  });

  it("defaultValueForType email stays empty for invalid signerEmail", () => {
    const ctx = { typedName: "A B", initials: "AB", signerEmail: "not-valid" };
    expect(defaultValueForType("email", ctx)).toBe("");
  });

  it("createPlacedFieldAtClick email uses resolved sender email from ref when creator prop absent", () => {
    const resolved = resolveSenderEmailForEmailFieldPlacement(undefined, "You · me@deal.com");
    const ctx = { typedName: "You", initials: "YO", signerEmail: resolved || undefined };
    const f = createPlacedFieldAtClick("email", 0, 0.2, 0.2, ctx);
    expect(f.value).toBe("me@deal.com");
  });

  it("defaultRecipientFieldValue prefills email from recipient row when known", () => {
    expect(defaultRecipientFieldValue("email", "R", "r@ex.com")).toBe("r@ex.com");
    expect(defaultRecipientFieldValue("email", "R", undefined)).toBe("");
    expect(defaultRecipientFieldValue("email", "R", "   ")).toBe("");
    expect(defaultRecipientFieldValue("email", "R", "not-an-email")).toBe("");
    expect(defaultRecipientFieldValue("text", "R", "r@ex.com")).toBe("");
  });

  it("resolveSenderEmail prefers creator over signer-ref segment", () => {
    expect(
      resolveSenderEmailForEmailFieldPlacement("owner@firm.com", "Other · other@co.com")
    ).toBe("owner@firm.com");
    expect(resolveSenderEmailForEmailFieldPlacement("", "Signer · fallback@co.com")).toBe("fallback@co.com");
    expect(resolveSenderEmailForEmailFieldPlacement(undefined, "No email here")).toBe("");
  });

  it("resolveRecipientEmail only accepts plausible counterparty emails", () => {
    expect(resolveRecipientEmailForEmailFieldPlacement("  signer@deal.com  ")).toBe("signer@deal.com");
    expect(resolveRecipientEmailForEmailFieldPlacement("bogus")).toBe("");
    expect(resolveRecipientEmailForEmailFieldPlacement(undefined)).toBe("");
  });

  it("preserves same email when creator and ref agree", () => {
    expect(
      resolveSenderEmailForEmailFieldPlacement("same@x.org", "Name · same@x.org")
    ).toBe("same@x.org");
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
  /** Matches `AUTO_INITIALS_MARGIN_BOTTOM` in signingFields (reserved page-bottom band). */
  const marginBottom = 0.058;

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
        y: 0.58,
        width: 0.32,
        height: 0.12,
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

  it("skips gray auto initials when the reserved bottom band has no collision-free slot", () => {
    const senderPlacedFields: PlacedSigningField[] = [
      {
        id: "bottom_fill",
        type: "text",
        page: 0,
        x: 0,
        y: 0.75,
        width: 1,
        height: 0.25,
        value: "",
      },
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

  it("when bottom-right is clear, places auto initials in the bottom-right footer-safe band", () => {
    const dims = autoInitialsPlacementDims();
    const slot = findAutoInitialsMarginSlotOrNull(dims, []);
    expect(slot).not.toBeNull();
    const yBottom = 1 - marginBottom - dims.height;
    expect(slot!.y).toBeCloseTo(yBottom, 2);
    expect(slot!.x + slot!.width).toBeGreaterThan(0.94);
  });

  it("when bottom-right is blocked, steps left along the reserved bottom band (no mid-page placement)", () => {
    const dims = autoInitialsPlacementDims();
    const yBottom = 1 - marginBottom - dims.height;
    const obstacles = [
      {
        x: 0.72,
        y: Math.max(0, yBottom - 0.02),
        width: 0.28,
        height: 0.08,
      },
      {
        x: 0.88,
        y: 0.12,
        width: 0.12,
        height: 0.58,
      },
    ];
    const slot = findAutoInitialsMarginSlotOrNull(dims, obstacles);
    expect(slot).not.toBeNull();
    expect(slot!.y).toBeGreaterThanOrEqual(yBottom - 0.045);
    expect(slot!.y).toBeLessThanOrEqual(yBottom + 0.01);
    expect(slot!.x + dims.width).toBeLessThanOrEqual(0.72 + 1e-6);
  });

  it("returns null when the bottom band is fully blocked (no mid-page or right-margin fallback)", () => {
    const dims = autoInitialsPlacementDims();
    const yBottom = 1 - marginBottom - dims.height;
    const obstacles = [{ x: 0.05, y: yBottom - 0.04, width: 0.92, height: 0.07 }];
    expect(findAutoInitialsMarginSlotOrNull(dims, obstacles)).toBeNull();
  });

  it("does not place gray auto initials mid-page when only a mid-page right lane is clear", () => {
    const dims = autoInitialsPlacementDims();
    const yBottom = 1 - marginBottom - dims.height;
    const obstacles = [
      { x: 0.05, y: yBottom - 0.04, width: 0.92, height: 0.07 },
      { x: 0.88, y: 0.1, width: 0.12, height: 0.55 },
    ];
    expect(findAutoInitialsMarginSlotOrNull(dims, obstacles)).toBeNull();
  });

  it("when bottom-right is clear, ignores a mid-page right obstacle (no right-lane fallback)", () => {
    const dims = autoInitialsPlacementDims();
    const yBottom = 1 - marginBottom - dims.height;
    const obstacles = [{ x: 0.88, y: 0.12, width: 0.12, height: 0.5 }];
    const slot = findAutoInitialsMarginSlotOrNull(dims, obstacles);
    expect(slot).not.toBeNull();
    expect(slot!.y).toBeGreaterThanOrEqual(yBottom - 0.04);
    expect(slot!.x + dims.width).toBeGreaterThan(0.9);
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

describe("manual initials placement (armed tool path)", () => {
  const ctx = { typedName: "Test User", initials: "TU", signerEmail: "test@example.com" };

  it("createPlacedFieldAtClick creates a manual initials field without autoInitials flag", () => {
    const field = createPlacedFieldAtClick("initials", 0, 0.5, 0.5, ctx);
    expect(field.type).toBe("initials");
    expect(field.autoInitials).toBeUndefined();
    expect(field.page).toBe(0);
    expect(field.value).toBe("TU");
  });

  it("auto-initials fields have autoInitials: true", () => {
    const autoFields = buildAutoInitialsFields(3, ctx, new Set());
    expect(autoFields.length).toBeGreaterThan(0);
    for (const f of autoFields) {
      expect(f.autoInitials).toBe(true);
      expect(f.type).toBe("initials");
    }
  });

  it("manual initials are preserved when toggling auto-initials off (filter by autoInitials flag)", () => {
    const manual = createPlacedFieldAtClick("initials", 0, 0.3, 0.3, ctx);
    const sig = createPlacedFieldAtClick("signature", 0, 0.5, 0.5, ctx);
    const autoFields = buildAutoInitialsFields(2, ctx, new Set(), [manual, sig]);
    const all = [manual, sig, ...autoFields];

    const afterToggleOff = all.filter((f) => !f.autoInitials);
    expect(afterToggleOff).toHaveLength(2);
    expect(afterToggleOff.find((f) => f.id === manual.id)).toBeDefined();
    expect(afterToggleOff.find((f) => f.id === sig.id)).toBeDefined();
  });

  it("initials tool is in SIGNING_FIELD_TOOLS and follows same placement pattern as signature", () => {
    const initialsTool = SIGNING_FIELD_TOOLS.find((t) => t.type === "initials");
    expect(initialsTool).toBeDefined();
    expect(initialsTool!.label).toBe("Initials");

    const sigTool = SIGNING_FIELD_TOOLS.find((t) => t.type === "signature");
    expect(sigTool).toBeDefined();

    expect(RECIPIENT_FIELD_TOOLS.find((t) => t.type === "initials")).toBeDefined();
  });

  it("manual initials default size is in range (compact, not signature-sized)", () => {
    const size = defaultSizeForType("initials");
    expect(size.width).toBeLessThan(defaultSizeForType("signature").width);
    expect(size.height).toBeLessThan(defaultSizeForType("signature").height);
    expect(size.width).toBeGreaterThan(0.04);
    expect(size.height).toBeGreaterThan(0.02);
  });
});

describe("recipient manual initials: rebuild preserves user placement", () => {
  const senderFields: PlacedSigningField[] = [];
  const cps = [{ id: "cp1", name: "Party A" }];

  it("rebuildRecipientAutoInitialsEveryPage does NOT snap manual initials to bottom-right layout", () => {
    const userX = 0.15;
    const userY = 0.22;
    const manual: Vs01RecipientPlacedField = {
      id: "man_init_1",
      counterpartyId: "cp1",
      type: "initials",
      page: 0,
      x: userX,
      y: userY,
      width: 0.074,
      height: 0.034,
      value: "",
    };
    const rebuilt = rebuildRecipientAutoInitialsEveryPage(
      [manual], "cp1", 1, new Set(), senderFields, cps
    );
    const found = rebuilt.find((f) => f.id === "man_init_1");
    expect(found).toBeDefined();
    expect(found!.x).toBe(userX);
    expect(found!.y).toBe(userY);
  });

  it("rebuild creates auto-initials separately alongside user-placed manual initials", () => {
    const manual: Vs01RecipientPlacedField = {
      id: "man_init_2",
      counterpartyId: "cp1",
      type: "initials",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.074,
      height: 0.034,
      value: "",
    };
    const rebuilt = rebuildRecipientAutoInitialsEveryPage(
      [manual], "cp1", 2, new Set(), senderFields, cps
    );
    const manualResult = rebuilt.filter((f) => !f.autoInitials && f.type === "initials");
    const autoResult = rebuilt.filter((f) => f.autoInitials && f.type === "initials");
    expect(manualResult).toHaveLength(1);
    expect(manualResult[0].id).toBe("man_init_2");
    expect(manualResult[0].x).toBe(0.1);
    expect(autoResult.length).toBeGreaterThanOrEqual(1);
    for (const a of autoResult) expect(a.autoInitials).toBe(true);
  });

  it("manual initials survive multiple rebuilds at the user-placed position", () => {
    const manual: Vs01RecipientPlacedField = {
      id: "man_survive",
      counterpartyId: "cp1",
      type: "initials",
      page: 0,
      x: 0.35,
      y: 0.42,
      width: 0.074,
      height: 0.034,
      value: "",
    };
    let fields: Vs01RecipientPlacedField[] = [manual];
    for (let i = 0; i < 3; i++) {
      fields = rebuildRecipientAutoInitialsEveryPage(fields, "cp1", 1, new Set(), senderFields, cps);
    }
    const found = fields.find((f) => f.id === "man_survive");
    expect(found).toBeDefined();
    expect(found!.x).toBe(0.35);
    expect(found!.y).toBe(0.42);
  });

  it("removing auto-initials (toggle off) does not remove manual initials", () => {
    const manual: Vs01RecipientPlacedField = {
      id: "man_keep",
      counterpartyId: "cp1",
      type: "initials",
      page: 0,
      x: 0.2,
      y: 0.3,
      width: 0.074,
      height: 0.034,
      value: "",
    };
    const rebuilt = rebuildRecipientAutoInitialsEveryPage(
      [manual], "cp1", 2, new Set(), senderFields, cps
    );
    expect(rebuilt.some((f) => f.autoInitials)).toBe(true);

    const afterOff = rebuilt.filter((f) => !(f.autoInitials && f.counterpartyId === "cp1"));
    expect(afterOff.find((f) => f.id === "man_keep")).toBeDefined();
    expect(afterOff.find((f) => f.id === "man_keep")!.x).toBe(0.2);
  });
});

describe("sender placement: each tool type creates a field via click", () => {
  const ctx = { typedName: "Jane Doe", initials: "JD", signerEmail: "jane@example.com" };
  const allTools: Array<{ type: "signature" | "initials" | "printed_name" | "text" | "email" | "date"; expectValue: string }> = [
    { type: "signature", expectValue: "Jane Doe" },
    { type: "initials", expectValue: "JD" },
    { type: "printed_name", expectValue: "Jane Doe" },
    { type: "text", expectValue: "" },
    { type: "email", expectValue: "jane@example.com" },
    { type: "date", expectValue: new Date().toISOString().slice(0, 10) },
  ];

  for (const { type, expectValue } of allTools) {
    it(`clicking PDF with armed "${type}" tool creates a field at the click point`, () => {
      const field = createPlacedFieldAtClick(type, 2, 0.4, 0.6, ctx);
      expect(field.type).toBe(type);
      expect(field.page).toBe(2);
      expect(field.x).toBeGreaterThanOrEqual(0);
      expect(field.x).toBeLessThanOrEqual(1);
      expect(field.y).toBeGreaterThanOrEqual(0);
      expect(field.y).toBeLessThanOrEqual(1);
      expect(field.width).toBeGreaterThan(0);
      expect(field.height).toBeGreaterThan(0);
      expect(field.value).toBe(expectValue);
      expect(field.autoInitials).toBeUndefined();
      expect(field.id).toBeTruthy();
    });
  }

  it("simulated controlled-component setFields adds field to parent state", () => {
    let parentFields: PlacedSigningField[] = [];
    const fieldsRef = { current: parentFields };
    const onFieldsChange = (next: PlacedSigningField[]) => {
      parentFields = next;
    };
    const onFieldsChangeRef = { current: onFieldsChange };

    const setFields = (next: PlacedSigningField[] | ((prev: PlacedSigningField[]) => PlacedSigningField[])) => {
      const resolved = typeof next === "function" ? next(fieldsRef.current) : next;
      onFieldsChangeRef.current(resolved);
    };

    const nf = createPlacedFieldAtClick("signature", 0, 0.5, 0.5, ctx);
    setFields((prev) => [...prev, nf]);
    expect(parentFields).toHaveLength(1);
    expect(parentFields[0].type).toBe("signature");

    fieldsRef.current = parentFields;
    const nf2 = createPlacedFieldAtClick("email", 1, 0.3, 0.4, ctx);
    setFields((prev) => [...prev, nf2]);
    expect(parentFields).toHaveLength(2);
    expect(parentFields[1].type).toBe("email");
  });

  it("all 6 sender tools are present in SIGNING_FIELD_TOOLS", () => {
    const types = SIGNING_FIELD_TOOLS.map((t) => t.type);
    for (const { type } of allTools) {
      expect(types).toContain(type);
    }
  });

  it("each tool has a non-empty label in SIGNING_FIELD_TOOLS", () => {
    for (const tool of SIGNING_FIELD_TOOLS) {
      expect(tool.label.length).toBeGreaterThan(0);
      expect(labelForFieldType(tool.type)).toBe(tool.label);
    }
  });
});
