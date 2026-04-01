/**
 * VS01 signing step — placed field model (client). Maps to API field_manifest on submit.
 */
import type { Vs01Counterparty, Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";
import type { FieldManifestEntry } from "./vs01Api";

export type SigningFieldType = "signature" | "initials" | "text" | "date";

export type PlacedSigningField = {
  id: string;
  type: SigningFieldType;
  /** 0-based page index (matches API page_index). */
  page: number;
  /** Normalized 0..1 within page / preview surface. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text/date content; initials auto-fields store initials string */
  value?: string;
  /** True for per-page auto initials from “Put my initials on every page” */
  autoInitials?: boolean;
};

export const SIGNING_FIELD_TOOLS: { type: SigningFieldType; label: string }[] = [
  { type: "signature", label: "Signature" },
  { type: "initials", label: "Initials" },
  { type: "text", label: "Text" },
  { type: "date", label: "Date" },
];

/** Step 4 only — “Printed name” replaces generic text for recipients. */
export const RECIPIENT_FIELD_TOOLS: { type: Vs01RecipientFieldType; label: string }[] = [
  { type: "signature", label: "Signature" },
  { type: "initials", label: "Initials" },
  { type: "printed_name", label: "Printed name" },
  { type: "date", label: "Date" },
];

export function labelForRecipientFieldType(t: Vs01RecipientFieldType): string {
  const m = RECIPIENT_FIELD_TOOLS.find((x) => x.type === t);
  return m?.label ?? t;
}

export function defaultSizeForRecipientField(t: Vs01RecipientFieldType): { width: number; height: number } {
  switch (t) {
    case "signature":
      return defaultSizeForType("signature");
    case "initials":
      return defaultSizeForType("initials");
    case "printed_name":
      return defaultSizeForType("text");
    case "date":
      return defaultSizeForType("date");
    default:
      return defaultSizeForType("text");
  }
}

/**
 * Recipient field placement — same click semantics as signing fields, separate type axis.
 */
export function computeRecipientRectFromClick(
  type: Vs01RecipientFieldType,
  clickX: number,
  clickY: number
): { x: number; y: number; width: number; height: number } {
  const { width, height } = defaultSizeForRecipientField(type);
  const cx = Math.min(1, Math.max(0, clickX));
  const cy = Math.min(1, Math.max(0, clickY));
  const x = Math.max(0, Math.min(cx, 1 - width));
  const y = Math.max(0, Math.min(cy, 1 - height));
  return { x, y, width, height };
}

export function newSigningFieldId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Normalized sizes tuned for legibility in the preview overlay. */
export function defaultSizeForType(t: SigningFieldType): { width: number; height: number } {
  switch (t) {
    case "signature":
      return { width: 0.26, height: 0.064 };
    case "initials":
      return { width: 0.11, height: 0.052 };
    case "text":
      return { width: 0.2, height: 0.052 };
    case "date":
      return { width: 0.17, height: 0.052 };
    default:
      return { width: 0.2, height: 0.055 };
  }
}

/**
 * Map a click (normalized 0..1 on the page surface) to a top-left rect.
 * Top-left of the field is anchored at the click point (clamped so the box stays on-page).
 */
export function computeRectFromClick(
  type: SigningFieldType,
  clickX: number,
  clickY: number
): { x: number; y: number; width: number; height: number } {
  const { width, height } = defaultSizeForType(type);
  const cx = Math.min(1, Math.max(0, clickX));
  const cy = Math.min(1, Math.max(0, clickY));
  const x = Math.max(0, Math.min(cx, 1 - width));
  const y = Math.max(0, Math.min(cy, 1 - height));
  return { x, y, width, height };
}

/** Bottom-right auto initials: normalized margins from page edges (x = 1 - marginX - width). */
const AUTO_INITIALS_MARGIN_X = 0.038;
const AUTO_INITIALS_MARGIN_Y = 0.044;

export function autoInitialsLayout(): { x: number; y: number; width: number; height: number } {
  const { width, height } = defaultSizeForType("initials");
  let x = 1 - AUTO_INITIALS_MARGIN_X - width;
  let y = 1 - AUTO_INITIALS_MARGIN_Y - height;
  x = Math.max(0, Math.min(x, 1 - width));
  y = Math.max(0, Math.min(y, 1 - height));
  return { width, height, x, y };
}

export function defaultValueForType(t: SigningFieldType, ctx: { typedName: string; initials: string }): string {
  switch (t) {
    case "signature":
      return ctx.typedName.trim() || "Signature";
    case "initials":
      return ctx.initials.trim() || "AB";
    case "text":
      return "";
    case "date": {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }
    default:
      return "";
  }
}

/** Recipient placement (Step 4): signature/initials blank; printed name stores label snapshot; date defaults to today. */
export function defaultRecipientFieldValue(t: Vs01RecipientFieldType, recipientDisplayName: string): string {
  switch (t) {
    case "signature":
    case "initials":
      return "";
    case "printed_name":
      return recipientDisplayName.trim();
    case "date": {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }
    default:
      return "";
  }
}

const RCP_AUTO_ID_SAFE = /[^a-zA-Z0-9_-]/g;

/** Horizontal gap between the two bottom-right initials slots (Step 4). */
export const RECIPIENT_AUTO_INITIALS_GAP_NORM = 0.014;

/**
 * Gray auto-initials flush to bottom-right margin + placed initials to their left, fixed gap.
 * Auto sits at the right anchor (sequential column grows leftward for multiple recipients).
 */
export function layoutRecipientInitialsBottomRightPair(): {
  auto: { x: number; y: number; width: number; height: number };
  manual: { x: number; y: number; width: number; height: number };
} {
  const { width: w, height: h } = defaultSizeForRecipientField("initials");
  const gap = RECIPIENT_AUTO_INITIALS_GAP_NORM;
  const y = Math.max(0, Math.min(1 - AUTO_INITIALS_MARGIN_Y - h, 1 - h));

  let xAuto = Math.max(0, Math.min(1 - AUTO_INITIALS_MARGIN_X - w, 1 - w));
  let xManual = xAuto - gap - w;
  if (xManual < 0) {
    xManual = 0;
    xAuto = Math.min(1 - w, xManual + gap + w);
  }
  xManual = Math.max(0, Math.min(xManual, 1 - w));
  xAuto = Math.max(0, Math.min(xAuto, 1 - w));
  if (xManual + w + gap > xAuto + 1e-9) {
    xAuto = Math.min(1 - w, xManual + gap + w);
  }

  return {
    auto: { x: xAuto, y, width: w, height: h },
    manual: { x: xManual, y, width: w, height: h },
  };
}

function pickSenderInitialsForPage(
  senderPlacedFields: PlacedSigningField[],
  page: number
): PlacedSigningField | undefined {
  const list = senderPlacedFields.filter((f) => f.page === page && f.type === "initials");
  if (list.length === 0) return undefined;
  return list.reduce((a, b) => (a.x + a.width >= b.x + b.width ? a : b));
}

/**
 * Gray auto-initial abuts sender initials (one gap); manual initials sit to the left of gray.
 * Same y as sender; clamped in-bounds.
 */
export function layoutRecipientInitialsPairLeftOfSender(
  sender: Pick<PlacedSigningField, "x" | "y" | "width" | "height">
): {
  auto: { x: number; y: number; width: number; height: number };
  manual: { x: number; y: number; width: number; height: number };
} {
  const gap = RECIPIENT_AUTO_INITIALS_GAP_NORM;
  const { width: w, height: h } = defaultSizeForRecipientField("initials");
  const y = Math.max(0, Math.min(sender.y, 1 - h));

  let xAuto = sender.x - gap - w;
  let xManual = xAuto - gap - w;

  if (xManual < 0) {
    xManual = 0;
    xAuto = Math.min(sender.x - gap - w, xManual + gap + w);
  }
  xManual = Math.max(0, Math.min(xManual, 1 - w));
  xAuto = Math.max(0, Math.min(xAuto, 1 - w));

  if (xManual + gap + w > xAuto + 1e-9) {
    xAuto = Math.min(1 - w, sender.x - gap - w, xManual + gap + w);
    xAuto = Math.max(0, xAuto);
  }

  if (xAuto + w + gap > sender.x + 1e-9) {
    xAuto = Math.max(0, sender.x - gap - w);
    xManual = Math.max(0, xAuto - gap - w);
    if (xManual < 0) {
      xManual = 0;
      xAuto = Math.min(sender.x - gap - w, xManual + gap + w);
      xAuto = Math.max(0, xAuto);
    }
  }

  xManual = Math.max(0, Math.min(xManual, 1 - w));
  xAuto = Math.max(0, Math.min(xAuto, 1 - w));

  return {
    auto: { x: xAuto, y, width: w, height: h },
    manual: { x: xManual, y, width: w, height: h },
  };
}

/**
 * Step 4 “initials every page”: pair layout from sender initials on this page, else bottom-right fallback.
 */
export function layoutRecipientInitialsPairForPage(
  page: number,
  senderPlacedFields: PlacedSigningField[]
): ReturnType<typeof layoutRecipientInitialsBottomRightPair> {
  const sender = pickSenderInitialsForPage(senderPlacedFields, page);
  if (!sender) {
    return layoutRecipientInitialsBottomRightPair();
  }
  return layoutRecipientInitialsPairLeftOfSender(sender);
}

/**
 * Dedupe recipient auto-initials to at most one per (counterpartyId, page). Prefers canonical id.
 */
export function dedupeRecipientAutoInitialsByRecipientPage(
  fields: Vs01RecipientPlacedField[]
): Vs01RecipientPlacedField[] {
  const byKey = new Map<string, Vs01RecipientPlacedField>();
  const out: Vs01RecipientPlacedField[] = [];
  for (const f of fields) {
    if (!(f.autoInitials && f.type === "initials")) {
      out.push(f);
      continue;
    }
    const k = `${f.counterpartyId}:${f.page}`;
    const canonical = recipientAutoInitialsFieldId(f.counterpartyId, f.page);
    const cur = byKey.get(k);
    if (!cur || f.id === canonical) {
      byKey.set(k, f);
    }
  }
  const autos = Array.from(byKey.values()).sort((a, b) => a.page - b.page);
  return [...out, ...autos];
}

/**
 * Step 4: drop stale auto-initials for this recipient, dedupe manual initials per page, snap to
 * bottom-right pair, append exactly one gray auto per non-skipped page.
 */
export function rebuildRecipientAutoInitialsEveryPage(
  prev: Vs01RecipientPlacedField[],
  counterpartyId: string,
  numPages: number,
  skippedPages: Set<number>,
  senderPlacedFields: PlacedSigningField[]
): Vs01RecipientPlacedField[] {
  let rest = prev.filter((f) => {
    if (f.autoInitials && f.type === "initials" && f.counterpartyId === counterpartyId) {
      return false;
    }
    return true;
  });

  const seenPage = new Set<number>();
  rest = rest.filter((f) => {
    if (f.counterpartyId !== counterpartyId || f.type !== "initials" || f.autoInitials) return true;
    if (seenPage.has(f.page)) return false;
    seenPage.add(f.page);
    return true;
  });

  rest = rest.map((f) => {
    if (
      f.counterpartyId !== counterpartyId ||
      f.type !== "initials" ||
      f.autoInitials ||
      f.page < 0 ||
      f.page >= numPages ||
      skippedPages.has(f.page)
    ) {
      return f;
    }
    const pair = layoutRecipientInitialsPairForPage(f.page, senderPlacedFields);
    return { ...f, ...pair.manual };
  });

  const autos: Vs01RecipientPlacedField[] = [];
  for (let p = 0; p < numPages; p++) {
    if (skippedPages.has(p)) continue;
    const pair = layoutRecipientInitialsPairForPage(p, senderPlacedFields);
    autos.push(createRecipientAutoInitialsField(counterpartyId, p, pair.auto));
  }

  return dedupeRecipientAutoInitialsByRecipientPage([...rest, ...autos]);
}

/**
 * Spread gray auto-initials for multiple recipients on the same page so they do not overlap:
 * one column stepping left from the default auto slot (right-to-left order matches named counterparty order).
 */
export function repositionAllRecipientAutoInitialsNonOverlapping(
  fields: Vs01RecipientPlacedField[],
  counterparties: Pick<Vs01Counterparty, "id" | "name">[],
  senderPlacedFields: PlacedSigningField[]
): Vs01RecipientPlacedField[] {
  const namedOrder = counterparties.filter((c) => c.name.trim()).map((c) => c.id);
  const cpRank = new Map(namedOrder.map((id, i) => [id, i]));

  const autosByPage = new Map<number, Vs01RecipientPlacedField[]>();
  for (const f of fields) {
    if (f.autoInitials && f.type === "initials") {
      const list = autosByPage.get(f.page) ?? [];
      list.push(f);
      autosByPage.set(f.page, list);
    }
  }

  const rankOf = (cpId: string) => (cpRank.has(cpId) ? (cpRank.get(cpId) as number) : 9999);

  let changed = false;
  const next = fields.map((f) => {
    if (!(f.autoInitials && f.type === "initials")) return f;

    const group = (autosByPage.get(f.page) ?? [])
      .slice()
      .sort((a, b) => {
        const da = rankOf(a.counterpartyId);
        const db = rankOf(b.counterpartyId);
        if (da !== db) return da - db;
        return a.counterpartyId.localeCompare(b.counterpartyId);
      });

    const idx = group.findIndex((x) => x.id === f.id);
    if (idx < 0) return f;

    const pair = layoutRecipientInitialsPairForPage(f.page, senderPlacedFields);
    const { width: w, height: h, y } = pair.auto;
    const gap = RECIPIENT_AUTO_INITIALS_GAP_NORM;
    let x = pair.auto.x - idx * (w + gap);
    x = Math.max(0, Math.min(x, 1 - w));

    const same =
      Math.abs(f.x - x) < 1e-6 &&
      Math.abs(f.y - y) < 1e-6 &&
      Math.abs(f.width - w) < 1e-6 &&
      Math.abs(f.height - h) < 1e-6;
    if (!same) changed = true;
    return same ? f : { ...f, x, y, width: w, height: h };
  });

  return changed ? next : fields;
}

export function recipientAutoInitialsFieldId(counterpartyId: string, page: number): string {
  const safe = counterpartyId.replace(RCP_AUTO_ID_SAFE, "_");
  return `rcp_auto_${safe}_${page}`;
}

/** One bottom-right auto-initials slot for a recipient on a page (blank value). */
export function createRecipientAutoInitialsField(
  counterpartyId: string,
  page: number,
  layout?: { x: number; y: number; width: number; height: number }
): {
  id: string;
  counterpartyId: string;
  type: "initials";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  autoInitials: true;
} {
  const { x, y, width, height } = layout ?? autoInitialsLayout();
  return {
    id: recipientAutoInitialsFieldId(counterpartyId, page),
    counterpartyId,
    type: "initials",
    page,
    x,
    y,
    width,
    height,
    value: "",
    autoInitials: true,
  };
}

export function buildRecipientAutoInitialsFields(
  counterpartyId: string,
  pageCount: number,
  skippedPages: Set<number>,
  layout?: { x: number; y: number; width: number; height: number }
): ReturnType<typeof createRecipientAutoInitialsField>[] {
  const out: ReturnType<typeof createRecipientAutoInitialsField>[] = [];
  for (let p = 0; p < pageCount; p++) {
    if (skippedPages.has(p)) continue;
    out.push(createRecipientAutoInitialsField(counterpartyId, p, layout));
  }
  return out;
}

/**
 * Create a field from a normalized click position (uses center / intuitive anchoring).
 */
export function createPlacedFieldAtClick(
  type: SigningFieldType,
  page: number,
  clickX: number,
  clickY: number,
  ctx: { typedName: string; initials: string },
  options?: { autoInitials?: boolean }
): PlacedSigningField {
  const { x, y, width, height } = computeRectFromClick(type, clickX, clickY);
  return {
    id: newSigningFieldId(),
    type,
    page,
    x,
    y,
    width,
    height,
    value: defaultValueForType(type, ctx),
    autoInitials: options?.autoInitials,
  };
}

/**
 * One auto initials field for a page (stable id). Position is deterministic bottom-right.
 */
export function createAutoInitialsField(
  page: number,
  ctx: { typedName: string; initials: string }
): PlacedSigningField {
  const { width, height, x, y } = autoInitialsLayout();
  return {
    id: `auto_initials_${page}`,
    type: "initials",
    page,
    x,
    y,
    width,
    height,
    value: defaultValueForType("initials", ctx),
    autoInitials: true,
  };
}

/**
 * Build all auto-initials fields for pages 0 .. pageCount-1, skipping pages in skippedPages.
 */
export function buildAutoInitialsFields(
  pageCount: number,
  ctx: { typedName: string; initials: string },
  skippedPages: Set<number>
): PlacedSigningField[] {
  const out: PlacedSigningField[] = [];
  for (let p = 0; p < pageCount; p++) {
    if (skippedPages.has(p)) continue;
    out.push(createAutoInitialsField(p, ctx));
  }
  return out;
}

/** API field_id: short stable slug */
function apiFieldId(f: PlacedSigningField): string {
  const raw = `${f.type}_${f.page}_${f.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}

/**
 * Build manifest for completeSignSession. Sorted for stable receipts.
 */
export function fieldsToManifest(fields: PlacedSigningField[]): FieldManifestEntry[] {
  const sorted = [...fields].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((f) => ({
    field_id: apiFieldId(f),
    page_index: f.page,
    x: f.x,
    y: f.y,
    w: f.width,
    h: f.height,
  }));
}

export function labelForFieldType(t: SigningFieldType): string {
  const m = SIGNING_FIELD_TOOLS.find((x) => x.type === t);
  return m?.label ?? t;
}
