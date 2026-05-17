/**
 * VS01 signing step — placed field model (client). Maps to API field_manifest on submit.
 */
import { firstPlausibleEmailInSignerRef, isPlausibleEmail } from "./detailsStepValidation";
import type { Vs01Counterparty, Vs01RecipientFieldType, Vs01RecipientPlacedField, Vs01SignerFieldAssignmentSource } from "./types";
import type { FieldManifestEntry } from "./vs01Api";

export type SigningFieldType = "signature" | "initials" | "printed_name" | "text" | "email" | "date";

/** When {@link SigningFieldType} is `text`, distinguishes role title vs freeform custom copy. */
export type Vs01TextFieldPurpose = "title" | "custom";

/** Context for default values when placing sender signing fields. */
export type SigningPlacementValueContext = {
  typedName: string;
  initials: string;
  /** Creator/signer email when known (Step 3 Email tool default). */
  signerEmail?: string;
};

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
  /** For `type: "text"` — title (signer role) vs custom freeform copy. Legacy rows omit → title. */
  textPurpose?: Vs01TextFieldPurpose;
  /** Signer-centric placement (prepare packet / execution scope). */
  assignedPartyId?: string;
  assignedPartyIndex?: number;
  assignedSignerEmail?: string;
  assignedSignerRoleId?: string;
  assignedSignerRoleLabel?: string;
  assignedSignerRoleKind?: "owner" | "counterparty";
  assignmentSource?: Vs01SignerFieldAssignmentSource;
};

export const SIGNING_FIELD_TOOLS: { type: SigningFieldType; label: string }[] = [
  { type: "signature", label: "Signature" },
  { type: "initials", label: "Initials" },
  { type: "printed_name", label: "Printed name" },
  { type: "text", label: "Text" },
  { type: "email", label: "Email" },
  { type: "date", label: "Date" },
];

export type PreparePacketFieldTool = {
  type: SigningFieldType;
  label: string;
  textPurpose?: Vs01TextFieldPurpose;
};

/** Prepare_signing_packet toolbar — Title and Custom text are separate tools (both stored as `text`). */
export const PREPARE_PACKET_FIELD_TOOLS: PreparePacketFieldTool[] = [
  { type: "signature", label: "Signature" },
  { type: "initials", label: "Initials" },
  { type: "printed_name", label: "Printed name" },
  { type: "text", label: "Title", textPurpose: "title" },
  { type: "email", label: "Email" },
  { type: "date", label: "Date" },
  { type: "text", label: "Custom text", textPurpose: "custom" },
];

export function preparePacketToolKey(tool: Pick<PreparePacketFieldTool, "type" | "textPurpose">): string {
  return tool.textPurpose ? `${tool.type}:${tool.textPurpose}` : tool.type;
}

export function matchesPreparePacketTool(
  activeType: SigningFieldType,
  activeTextPurpose: Vs01TextFieldPurpose | undefined,
  tool: PreparePacketFieldTool,
): boolean {
  if (activeType !== tool.type) return false;
  if (tool.textPurpose) return activeTextPurpose === tool.textPurpose;
  return !activeTextPurpose;
}

/** Step 4 only — “Printed name” replaces generic text for recipients. */
export const RECIPIENT_FIELD_TOOLS: { type: Vs01RecipientFieldType; label: string }[] = [
  { type: "signature", label: "Signature" },
  { type: "initials", label: "Initials" },
  { type: "printed_name", label: "Printed name" },
  { type: "text", label: "Text" },
  { type: "email", label: "Email" },
  { type: "date", label: "Date" },
];

/**
 * Sender Step 3 Email placement: prefer creator email, then a plausible address parsed from the signer ref.
 * Never fabricates an address; rejects non-plausible strings.
 */
export function resolveSenderEmailForEmailFieldPlacement(
  creatorEmail: string | undefined | null,
  defaultSignerRef: string | undefined | null
): string {
  const fromCreator = (creatorEmail ?? "").trim();
  if (isPlausibleEmail(fromCreator)) return fromCreator;
  const fromRef = (firstPlausibleEmailInSignerRef(defaultSignerRef ?? "") ?? "").trim();
  return isPlausibleEmail(fromRef) ? fromRef : "";
}

/**
 * Recipient Step 4 Email placement: only the selected counterparty’s email when it is plausible.
 * Returns empty string when unknown (callers may pass `undefined` into {@link defaultRecipientFieldValue}).
 */
export function resolveRecipientEmailForEmailFieldPlacement(counterpartyEmail: string | undefined | null): string {
  const raw = (counterpartyEmail ?? "").trim();
  return isPlausibleEmail(raw) ? raw : "";
}

/** Canonical default geometry (normalized 0..1) for all manual sender/recipient placements. */
export function getVs01DefaultFieldGeometry(
  fieldType: SigningFieldType | Vs01RecipientFieldType,
): { width: number; height: number } {
  switch (fieldType) {
    case "signature":
      return { width: 0.34, height: 0.075 };
    case "printed_name":
      return { width: 0.28, height: 0.045 };
    case "text":
      return { width: 0.28, height: 0.045 };
    case "date":
      return { width: 0.18, height: 0.04 };
    case "email":
      return { width: 0.3, height: 0.045 };
    case "initials":
      return { width: 0.1, height: 0.045 };
    default:
      return { width: 0.28, height: 0.045 };
  }
}

/**
 * Single source of truth for **manual** signing-field default footprint (normalized 0..1 on the page).
 * Derived from {@link getVs01DefaultFieldGeometry}; gray auto-initials use {@link autoInitialsPlacementDims} only.
 */
export const VS01_MANUAL_FIELD_DEFAULT_SIZE_NORM: Record<SigningFieldType, { width: number; height: number }> = {
  signature: getVs01DefaultFieldGeometry("signature"),
  initials: getVs01DefaultFieldGeometry("initials"),
  printed_name: getVs01DefaultFieldGeometry("printed_name"),
  text: getVs01DefaultFieldGeometry("text"),
  email: getVs01DefaultFieldGeometry("email"),
  date: getVs01DefaultFieldGeometry("date"),
};

/** Hard page caps for resize (geometry stays on-page). */
const VS01_FIELD_RESIZE_PAGE_CAP_NORM = { maxW: 0.92, maxH: 0.5 } as const;

export type Vs01FieldResizeBoundsNorm = {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
};

const VS01_MANUAL_FIELD_RESIZE_BOUNDS_NORM: Record<SigningFieldType, Vs01FieldResizeBoundsNorm> = {
  signature: { minW: 0.22, minH: 0.055, maxW: 0.92, maxH: 0.32 },
  initials: { minW: 0.08, minH: 0.035, maxW: 0.2, maxH: 0.11 },
  printed_name: { minW: 0.14, minH: 0.028, maxW: 0.55, maxH: 0.09 },
  text: { minW: 0.14, minH: 0.026, maxW: 0.92, maxH: 0.45 },
  email: { minW: 0.14, minH: 0.026, maxW: 0.92, maxH: 0.45 },
  date: { minW: 0.09, minH: 0.026, maxW: 0.34, maxH: 0.12 },
};

/** Sender gray auto-initials only — tight bounds so manual rules do not stretch autos. */
const VS01_AUTO_INITIALS_RESIZE_BOUNDS_NORM: Vs01FieldResizeBoundsNorm = {
  minW: 0.036,
  minH: 0.018,
  maxW: 0.08,
  maxH: 0.042,
};

export function labelForRecipientFieldType(t: Vs01RecipientFieldType): string {
  const m = RECIPIENT_FIELD_TOOLS.find((x) => x.type === t);
  return m?.label ?? t;
}

export function defaultSizeForRecipientField(t: Vs01RecipientFieldType): { width: number; height: number } {
  return getVs01DefaultFieldGeometry(t);
}

export function signingFieldResizeBoundsNorm(t: SigningFieldType): Vs01FieldResizeBoundsNorm {
  const b = VS01_MANUAL_FIELD_RESIZE_BOUNDS_NORM[t];
  return {
    minW: b.minW,
    minH: b.minH,
    maxW: Math.min(b.maxW, VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxW),
    maxH: Math.min(b.maxH, VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxH),
  };
}

export function recipientFieldResizeBoundsNorm(t: Vs01RecipientFieldType): Vs01FieldResizeBoundsNorm {
  return signingFieldResizeBoundsNorm(t);
}

/** Step 3 sender fields + Step 4 recipient fields (auto initials use tight caps). */
export function resizeBoundsForPlacementField(f: {
  type: SigningFieldType | Vs01RecipientFieldType;
  autoInitials?: boolean;
}): Vs01FieldResizeBoundsNorm {
  if (f.autoInitials && f.type === "initials") {
    return {
      minW: VS01_AUTO_INITIALS_RESIZE_BOUNDS_NORM.minW,
      minH: VS01_AUTO_INITIALS_RESIZE_BOUNDS_NORM.minH,
      maxW: Math.min(VS01_AUTO_INITIALS_RESIZE_BOUNDS_NORM.maxW, VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxW),
      maxH: Math.min(VS01_AUTO_INITIALS_RESIZE_BOUNDS_NORM.maxH, VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxH),
    };
  }
  return signingFieldResizeBoundsNorm(f.type as SigningFieldType);
}

/**
 * Recipient field placement — same click semantics as signing fields, separate type axis.
 */
export function computeRecipientRectFromClick(
  type: Vs01RecipientFieldType,
  clickX: number,
  clickY: number
): { x: number; y: number; width: number; height: number } {
  const { width, height } = getVs01DefaultFieldGeometry(type);
  const cx = Math.min(1, Math.max(0, clickX));
  const cy = Math.min(1, Math.max(0, clickY));
  return clampFieldRectToPage(cx, cy, width, height);
}

export function newSigningFieldId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Normalized defaults for sender manual tools (same map as recipient manual fields). */
export function defaultSizeForType(t: SigningFieldType): { width: number; height: number } {
  return getVs01DefaultFieldGeometry(t);
}

export function clampFieldRectToPage(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const w = Math.min(Math.max(width, 0.01), VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxW);
  const h = Math.min(Math.max(height, 0.01), VS01_FIELD_RESIZE_PAGE_CAP_NORM.maxH);
  const xClamped = Math.max(0, Math.min(x, 1 - w));
  const yClamped = Math.max(0, Math.min(y, 1 - h));
  return { x: xClamped, y: yClamped, width: w, height: h };
}

type FieldWithGeometry = {
  type: SigningFieldType | Vs01RecipientFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  autoInitials?: boolean;
};

/**
 * Bump legacy/tiny fields up to minimum geometry without shrinking user-resized fields above minimum.
 */
export function normalizePlacedFieldGeometryIfBelowMinimum<T extends FieldWithGeometry>(
  field: T,
): { field: T; normalized: boolean } {
  if (field.autoInitials && field.type === "initials") {
    return { field, normalized: false };
  }
  const def = getVs01DefaultFieldGeometry(field.type);
  const bounds = signingFieldResizeBoundsNorm(field.type as SigningFieldType);
  const minW = Math.max(bounds.minW, def.width * 0.85);
  const minH = Math.max(bounds.minH, def.height * 0.85);
  let normalized = false;
  let { width, height, x, y } = field;
  if (width < minW) {
    width = def.width;
    normalized = true;
  }
  if (height < minH) {
    height = def.height;
    normalized = true;
  }
  const clamped = clampFieldRectToPage(x, y, width, height);
  if (
    clamped.x !== field.x ||
    clamped.y !== field.y ||
    clamped.width !== field.width ||
    clamped.height !== field.height
  ) {
    normalized = true;
  }
  if (!normalized) return { field, normalized: false };
  return {
    field: { ...field, ...clamped },
    normalized: true,
  };
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
  const { width, height } = getVs01DefaultFieldGeometry(type);
  const cx = Math.min(1, Math.max(0, clickX));
  const cy = Math.min(1, Math.max(0, clickY));
  return clampFieldRectToPage(cx, cy, width, height);
}

export function fieldRectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 0.008,
): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

const PREPARE_ROW_FIELD_TYPES = new Set<SigningFieldType>([
  "signature",
  "printed_name",
  "text",
  "date",
]);

/** Center the field on the click point (predictable anchor). */
export function centerPrepareRectOnClick(
  clickX: number,
  clickY: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const cx = Math.min(1, Math.max(0, clickX));
  const cy = Math.min(1, Math.max(0, clickY));
  return clampFieldRectToPage(cx - width / 2, cy - height / 2, width, height);
}

/**
 * Vertical snap for signature-row tools: align to same-role row on page or common line bands.
 * Horizontal position is preserved from the click.
 */
export function snapPreparePlacementClickY(
  clickY: number,
  fieldType: SigningFieldType,
  existingOnPage: ReadonlyArray<{
    y: number;
    height: number;
    type?: SigningFieldType;
    assignedSignerRoleId?: string;
  }>,
  roleId: string,
): { clickY: number; snapped: boolean; reason?: string } {
  if (!PREPARE_ROW_FIELD_TYPES.has(fieldType)) {
    return { clickY, snapped: false };
  }
  const rid = roleId.trim();
  const peers = existingOnPage.filter(
    (f) =>
      (f.assignedSignerRoleId ?? "").trim() === rid &&
      f.type &&
      PREPARE_ROW_FIELD_TYPES.has(f.type),
  );
  for (const p of peers) {
    const centerY = p.y + p.height / 2;
    if (Math.abs(clickY - centerY) < 0.04) {
      return { clickY: centerY, snapped: true, reason: "same_role_row" };
    }
  }
  const bands = [0.32, 0.38, 0.41, 0.45, 0.48, 0.52, 0.55, 0.62, 0.68, 0.74, 0.78];
  for (const band of bands) {
    if (Math.abs(clickY - band) < 0.02) {
      return { clickY: band, snapped: true, reason: "line_band" };
    }
  }
  return { clickY, snapped: false };
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ix * iy;
}

/** True only when overlap area exceeds a small threshold (ignore hairline touches). */
export function prepareRectsHaveSignificantOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  minArea = 0.00065,
): boolean {
  return intersectionArea(a, b) > minArea;
}

const PREPARE_MANUAL_NUDGE_STEP = 0.009;
const PREPARE_MANUAL_MAX_NUDGES = 8;

/**
 * Conservative deconflict: preserve click anchor; nudge vertically first, then minimally horizontally.
 */
export function findConservativeNonOverlappingPrepareRect(args: {
  desiredRect: { x: number; y: number; width: number; height: number };
  page: number;
  existingFields: ReadonlyArray<PrepareRectObstacle>;
  excludeFieldId?: string;
}): {
  x: number;
  y: number;
  width: number;
  height: number;
  adjusted: boolean;
  nudgeSteps: number;
} {
  const { width, height } = args.desiredRect;
  const obstacles = args.existingFields
    .filter((f) => (f.page == null || f.page === args.page) && f.id !== args.excludeFieldId)
    .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
  let rect = clampFieldRectToPage(args.desiredRect.x, args.desiredRect.y, width, height);
  const overlaps = () => obstacles.some((o) => prepareRectsHaveSignificantOverlap(rect, o));
  if (!overlaps()) {
    return { ...rect, adjusted: false, nudgeSteps: 0 };
  }
  const anchorX = rect.x;
  const anchorY = rect.y;
  let steps = 0;
  const deltas: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: PREPARE_MANUAL_NUDGE_STEP },
    { dx: 0, dy: -PREPARE_MANUAL_NUDGE_STEP },
    { dx: PREPARE_MANUAL_NUDGE_STEP, dy: 0 },
    { dx: -PREPARE_MANUAL_NUDGE_STEP, dy: 0 },
    { dx: 0, dy: PREPARE_MANUAL_NUDGE_STEP * 2 },
    { dx: 0, dy: -PREPARE_MANUAL_NUDGE_STEP * 2 },
    { dx: PREPARE_MANUAL_NUDGE_STEP * 2, dy: 0 },
    { dx: -PREPARE_MANUAL_NUDGE_STEP * 2, dy: 0 },
  ];
  for (const d of deltas) {
    if (steps >= PREPARE_MANUAL_MAX_NUDGES) break;
    const candidate = clampFieldRectToPage(anchorX + d.dx, anchorY + d.dy, width, height);
    if (!obstacles.some((o) => prepareRectsHaveSignificantOverlap(candidate, o))) {
      rect = candidate;
      steps += 1;
      break;
    }
    steps += 1;
  }
  const adjusted =
    Math.abs(rect.x - args.desiredRect.x) > 1e-6 || Math.abs(rect.y - args.desiredRect.y) > 1e-6;
  return { ...rect, adjusted, nudgeSteps: steps };
}

/** Prepare-mode placement: center on click; same-role peer nudge only when significantly overlapping. */
export function computePrepareRectFromClick(
  type: SigningFieldType,
  clickX: number,
  clickY: number,
  existingOnPage: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    assignedSignerRoleId?: string;
    type?: SigningFieldType;
  }>,
  roleId: string,
): { x: number; y: number; width: number; height: number } {
  const { width, height } = getVs01DefaultFieldGeometry(type);
  const snappedY = snapPreparePlacementClickY(clickY, type, existingOnPage, roleId);
  let cx = Math.min(1, Math.max(0, clickX));
  let cy = Math.min(1, Math.max(0, snappedY.clickY));
  const rid = roleId.trim();
  const peers = existingOnPage.filter((f) => (f.assignedSignerRoleId ?? "").trim() === rid);
  let rect = centerPrepareRectOnClick(cx, cy, width, height);
  let attempts = 0;
  while (attempts < 6 && peers.some((p) => prepareRectsHaveSignificantOverlap(rect, p))) {
    cy = Math.min(1 - height / 2, cy + 0.018);
    rect = centerPrepareRectOnClick(cx, cy, width, height);
    attempts += 1;
  }
  return rect;
}

export function logVs01FieldOverlapAdjusted(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage?.getItem("lawdogVs01FieldDiag") !== "1") {
      if (!(typeof import.meta !== "undefined" && import.meta.env?.DEV)) return;
    }
  } catch {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[vs01-field-overlap-adjusted]", payload);
}

/** Bottom-right auto initials: normalized margins from page edges (x = 1 - marginX - width). */
const AUTO_INITIALS_MARGIN_X = 0.056;
/** Bottom anchor: gray auto slots sit above draft footer band and clear typical signature rows. */
const AUTO_INITIALS_MARGIN_Y = 0.1;

const AUTO_INITIALS_MARGIN_RIGHT = 0.02;
/**
 * Normalized clearance from physical page bottom to the bottom edge of the gray auto box.
 * Tuned with VS01 signing PDF seed bottom inset (~72pt / 792pt) so initials sit in reserved blank,
 * not over agreement body.
 */
const AUTO_INITIALS_MARGIN_BOTTOM = 0.058;
const AUTO_INITIALS_Y_SCAN_STEP = 0.017;
const AUTO_INITIALS_OBSTACLE_PAD = 0.024;
const AUTO_INITIALS_COLUMN_GAP = 0.006;
/** Vertical span (upward from yBottom) scanned inside the reserved bottom band only (no mid-page fallback). */
const AUTO_INITIALS_BOTTOM_BAND_HEIGHT = 0.038;
/** Left extent for bottom-band sweep (~Story left inset on Letter, keeps initials out of left body column). */
const AUTO_INITIALS_BOTTOM_SWEEP_X_MIN = 0.055;
const AUTO_INITIALS_X_SCAN_STEP = 0.01;

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

/**
 * Nudge a bottom-anchored initials rect up (then left) so it does not overlap normalized obstacle rects.
 */
export function nudgeAutoInitialsRectClearOfNormRects(
  rect: { x: number; y: number; width: number; height: number },
  obstacles: Array<{ x: number; y: number; width: number; height: number }>,
  pad = 0.018
): { x: number; y: number; width: number; height: number } {
  const { width: rw, height: rh } = rect;
  let { x, y } = rect;
  const overlaps = () => obstacles.some((b) => normRectsOverlap({ x, y, width: rw, height: rh }, b, pad));
  if (!overlaps()) return { x, y, width: rw, height: rh };

  const step = 0.014;
  const startX = x;
  const startY = y;
  for (let leg = 0; leg < 140; leg++) {
    if (!overlaps()) return { x, y, width: rw, height: rh };
    if (y - step >= 0) {
      y -= step;
      continue;
    }
    if (x - step >= 0) {
      x -= step;
      y = startY;
      continue;
    }
    break;
  }
  return { x: startX, y: startY, width: rw, height: rh };
}

/** Normalized rect for gray “initials on every page” slots only — smaller than tool-placed initials. */
export function autoInitialsPlacementDims(): { width: number; height: number } {
  return { width: 0.048, height: 0.024 };
}

/** Prepare packet auto-initials every page — compact canonical footprint. */
export function prepareAutoInitialsPlacementDims(): { width: number; height: number } {
  return { width: 0.075, height: 0.035 };
}

const PREPARE_SIGNATURE_OBSTACLE_PAD = 0.028;

function expandNormRectForPad(
  rect: { x: number; y: number; width: number; height: number },
  pad: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: Math.min(1, rect.width + pad * 2),
    height: Math.min(1, rect.height + pad * 2),
  };
}

/** Obstacle rects for prepare auto-initials layout (signatures padded to avoid overlap). */
export function buildPreparePageObstacleRects(
  fields: ReadonlyArray<
    Pick<PlacedSigningField, "page" | "x" | "y" | "width" | "height" | "type" | "id" | "assignedSignerRoleId" | "autoInitials">
  >,
  page: number,
  options?: { excludeFieldId?: string; excludeRoleAutoInitialsId?: string },
): Array<{ x: number; y: number; width: number; height: number }> {
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const f of fields) {
    if (f.page !== page) continue;
    if (options?.excludeFieldId && f.id === options.excludeFieldId) continue;
    if (
      options?.excludeRoleAutoInitialsId &&
      f.autoInitials &&
      f.type === "initials" &&
      (f.assignedSignerRoleId ?? "").trim() === options.excludeRoleAutoInitialsId
    ) {
      continue;
    }
    const pad =
      f.type === "signature" ? PREPARE_SIGNATURE_OBSTACLE_PAD : AUTO_INITIALS_OBSTACLE_PAD;
    out.push(expandNormRectForPad({ x: f.x, y: f.y, width: f.width, height: f.height }, pad));
  }
  return out;
}

/** True when a rect sits in the reserved bottom-right initials band (prepare packet). */
export function isRectInPrepareAutoInitialsSafeZone(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): boolean {
  const yBottom = 1 - AUTO_INITIALS_MARGIN_BOTTOM - rect.height;
  const yLow = yBottom - AUTO_INITIALS_BOTTOM_BAND_HEIGHT;
  return (
    rect.y >= yLow - 1e-5 &&
    rect.y <= yBottom + 1e-5 &&
    rect.x >= AUTO_INITIALS_BOTTOM_SWEEP_X_MIN - 1e-5 &&
    rect.x + rect.width <= 1 - AUTO_INITIALS_MARGIN_RIGHT + 1e-5
  );
}

export type PrepareAutoInitialsLayoutResult = {
  rect: { x: number; y: number; width: number; height: number } | null;
  lane: number;
  collisionCount: number;
};

/**
 * Deterministic bottom-right initials slot for one prepare signer on one page.
 * Uses the same margin-band scanner as legacy auto-initials (no upward scatter).
 */
export function layoutPrepareAutoInitialsRectOnPage(args: {
  partyIndex: number;
  page: number;
  existingFields: ReadonlyArray<PlacedSigningField>;
  roleId: string;
  dims?: { width: number; height: number };
}): PrepareAutoInitialsLayoutResult {
  const dims = args.dims ?? prepareAutoInitialsPlacementDims();
  const lane = Math.max(0, Math.floor(args.partyIndex));
  const obstacles = buildPreparePageObstacleRects(args.existingFields, args.page, {
    excludeRoleAutoInitialsId: args.roleId,
  });
  const probe = findAutoInitialsMarginSlotOrNull(dims, obstacles, { columnOffset: lane });
  let collisionCount = 0;
  if (probe) {
    for (const o of obstacles) {
      if (fieldRectsOverlap(probe, o, AUTO_INITIALS_OBSTACLE_PAD)) collisionCount += 1;
    }
  }
  return { rect: probe, lane, collisionCount };
}

export type PrepareRectObstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
  page?: number;
  assignedSignerRoleId?: string;
};

/**
 * Resolve collisions on one page: nudge up/left from desired anchor, clamped in-bounds.
 * Compares against all obstacles on the page (any role).
 */
export function findNonOverlappingPrepareRect(args: {
  desiredRect: { x: number; y: number; width: number; height: number };
  page: number;
  roleId?: string;
  existingFields: ReadonlyArray<PrepareRectObstacle>;
  excludeFieldId?: string;
  /** Manual click placement uses conservative nudge; auto-initials keeps legacy sweep. */
  placementMode?: "manual" | "auto_initials";
}): { x: number; y: number; width: number; height: number; adjusted: boolean } {
  if (args.placementMode === "manual") {
    const conservative = findConservativeNonOverlappingPrepareRect({
      desiredRect: args.desiredRect,
      page: args.page,
      existingFields: args.existingFields,
      excludeFieldId: args.excludeFieldId,
    });
    return { ...conservative, adjusted: conservative.adjusted };
  }
  const { width, height } = args.desiredRect;
  const obstacles = args.existingFields
    .filter((f) => (f.page == null || f.page === args.page) && f.id !== args.excludeFieldId)
    .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
  const start = clampFieldRectToPage(args.desiredRect.x, args.desiredRect.y, width, height);
  const cleared = nudgeAutoInitialsRectClearOfNormRects(start, obstacles);
  const adjusted =
    Math.abs(cleared.x - start.x) > 1e-6 || Math.abs(cleared.y - start.y) > 1e-6;
  return { ...cleared, adjusted };
}

/**
 * @deprecated Use {@link layoutPrepareAutoInitialsRectOnPage} (bottom margin-band scanner).
 */
export function prepareAutoInitialsLaneAnchor(partyIndex: number, dims: { width: number; height: number }): {
  x: number;
  y: number;
} {
  const lane = Math.max(0, Math.floor(partyIndex));
  const slot = findAutoInitialsMarginSlotOrNull(dims, [], { columnOffset: lane });
  if (slot) return { x: slot.x, y: slot.y };
  const y = Math.max(0, 1 - AUTO_INITIALS_MARGIN_BOTTOM - dims.height);
  const x = Math.max(AUTO_INITIALS_BOTTOM_SWEEP_X_MIN, 1 - AUTO_INITIALS_MARGIN_RIGHT - dims.width - lane * (dims.width + AUTO_INITIALS_COLUMN_GAP));
  return { x, y };
}

/**
 * Gray auto-initials only: reserved bottom safe band (matches VS01 signing PDF seed bottom inset).
 * Order: bottom-right anchor, then move left along the same bottom band (small vertical wiggle).
 * No mid-page or right-margin vertical fallback — returns null if no clean slot (caller skips page).
 */
export function findAutoInitialsMarginSlotOrNull(
  dims: { width: number; height: number },
  obstacles: Array<{ x: number; y: number; width: number; height: number }>,
  options?: { columnOffset?: number }
): { x: number; y: number; width: number; height: number } | null {
  const { width: w, height: h } = dims;
  const col = Math.max(0, Math.floor(options?.columnOffset ?? 0));
  const xRightAnchor =
    1 - AUTO_INITIALS_MARGIN_RIGHT - w - col * (w + AUTO_INITIALS_COLUMN_GAP);
  if (xRightAnchor + 1e-9 < AUTO_INITIALS_BOTTOM_SWEEP_X_MIN) return null;

  const yBottom = 1 - AUTO_INITIALS_MARGIN_BOTTOM - h;
  const yLow = yBottom - AUTO_INITIALS_BOTTOM_BAND_HEIGHT;
  const pad = AUTO_INITIALS_OBSTACLE_PAD;
  const overlapsObstacle = (rect: { x: number; y: number; width: number; height: number }) =>
    obstacles.some((b) => normRectsOverlap(rect, b, pad));

  for (let yRow = yBottom; yRow >= yLow - 1e-9; yRow -= AUTO_INITIALS_Y_SCAN_STEP) {
    const y = Math.max(0, Math.min(yRow, 1 - h));
    for (
      let x = Math.min(xRightAnchor, 1 - w);
      x >= AUTO_INITIALS_BOTTOM_SWEEP_X_MIN - 1e-9;
      x -= AUTO_INITIALS_X_SCAN_STEP
    ) {
      const xx = Math.max(0, Math.min(x, 1 - w));
      const rect = { x: xx, y, width: w, height: h };
      if (!overlapsObstacle(rect)) return rect;
    }
  }
  return null;
}

/** Column index for a recipient’s gray auto among all gray autos on the same page (left = higher rank). */
export function autoInitialsColumnIndexOnPage(
  fields: Vs01RecipientPlacedField[],
  counterparties: Pick<Vs01Counterparty, "id" | "name">[],
  counterpartyId: string,
  page: number
): number {
  const namedOrder = counterparties.filter((c) => c.name.trim()).map((c) => c.id);
  const cpRank = new Map(namedOrder.map((id, i) => [id, i]));
  const rankOf = (id: string) => (cpRank.has(id) ? (cpRank.get(id) as number) : 9999);
  const group = fields
    .filter((f) => f.autoInitials && f.type === "initials" && f.page === page)
    .slice()
    .sort((a, b) => {
      const da = rankOf(a.counterpartyId);
      const db = rankOf(b.counterpartyId);
      if (da !== db) return da - db;
      return a.counterpartyId.localeCompare(b.counterpartyId);
    });
  const idx = group.findIndex((x) => x.counterpartyId === counterpartyId);
  return idx < 0 ? 0 : idx;
}

export function autoInitialsLayout(): { x: number; y: number; width: number; height: number } {
  const dims = autoInitialsPlacementDims();
  const slot = findAutoInitialsMarginSlotOrNull(dims, []);
  if (slot) return slot;
  const { width, height } = dims;
  const x = Math.max(
    AUTO_INITIALS_BOTTOM_SWEEP_X_MIN,
    Math.min(1 - AUTO_INITIALS_MARGIN_RIGHT - width, 1 - width)
  );
  const y = Math.max(0, Math.min(1 - AUTO_INITIALS_MARGIN_BOTTOM - height, 1 - height));
  return { width, height, x, y };
}

export function defaultValueForType(t: SigningFieldType, ctx: SigningPlacementValueContext): string {
  switch (t) {
    case "signature":
      return ctx.typedName.trim() || "Signature";
    case "initials":
      return ctx.initials.trim() || "AB";
    case "printed_name":
      return ctx.typedName.trim();
    case "text":
      return "";
    case "email": {
      const raw = (ctx.signerEmail ?? "").trim();
      return isPlausibleEmail(raw) ? raw : "";
    }
    case "date": {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }
    default:
      return "";
  }
}

/** Recipient placement (Step 4): signature/initials blank; printed name stores label snapshot; date defaults to today. */
export function defaultRecipientFieldValue(
  t: Vs01RecipientFieldType,
  recipientDisplayName: string,
  recipientEmail?: string
): string {
  switch (t) {
    case "signature":
    case "initials":
      return "";
    case "printed_name":
      return recipientDisplayName.trim();
    case "text":
      return "";
    case "email": {
      const raw = (recipientEmail ?? "").trim();
      return isPlausibleEmail(raw) ? raw : "";
    }
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
  const { width: wM, height: hM } = defaultSizeForRecipientField("initials");
  const { width: wA, height: hA } = autoInitialsPlacementDims();
  const gap = RECIPIENT_AUTO_INITIALS_GAP_NORM;
  const bottom = 1 - AUTO_INITIALS_MARGIN_Y;
  const yM = Math.max(0, bottom - hM);
  const yA = Math.max(0, bottom - hA);

  let xAuto = Math.max(0, Math.min(1 - AUTO_INITIALS_MARGIN_X - wA, 1 - wA));
  let xManual = xAuto - gap - wM;
  if (xManual < 0) {
    xManual = 0;
    xAuto = Math.min(1 - wA, xManual + gap + wM);
  }
  xManual = Math.max(0, Math.min(xManual, 1 - wM));
  xAuto = Math.max(0, Math.min(xAuto, 1 - wA));
  if (xManual + wM + gap > xAuto + 1e-9) {
    xAuto = Math.min(1 - wA, xManual + gap + wM);
  }

  return {
    auto: { x: xAuto, y: yA, width: wA, height: hA },
    manual: { x: xManual, y: yM, width: wM, height: hM },
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
  const { width: wM, height: hM } = defaultSizeForRecipientField("initials");
  const { width: wA, height: hA } = autoInitialsPlacementDims();
  const bottom = Math.min(1, sender.y + sender.height);
  const yM = Math.max(0, bottom - hM);
  const yA = Math.max(0, bottom - hA);

  let xAuto = sender.x - gap - wA;
  let xManual = xAuto - gap - wM;

  if (xManual < 0) {
    xManual = 0;
    xAuto = Math.min(sender.x - gap - wA, xManual + gap + wM);
  }
  xManual = Math.max(0, Math.min(xManual, 1 - wM));
  xAuto = Math.max(0, Math.min(xAuto, 1 - wA));

  if (xManual + gap + wM > xAuto + 1e-9) {
    xAuto = Math.min(1 - wA, sender.x - gap - wA, xManual + gap + wM);
    xAuto = Math.max(0, xAuto);
  }

  if (xAuto + wA + gap > sender.x + 1e-9) {
    xAuto = Math.max(0, sender.x - gap - wA);
    xManual = Math.max(0, xAuto - gap - wM);
    if (xManual < 0) {
      xManual = 0;
      xAuto = Math.min(sender.x - gap - wA, xManual + gap + wM);
      xAuto = Math.max(0, xAuto);
    }
  }

  xManual = Math.max(0, Math.min(xManual, 1 - wM));
  xAuto = Math.max(0, Math.min(xAuto, 1 - wA));

  return {
    auto: { x: xAuto, y: yA, width: wA, height: hA },
    manual: { x: xManual, y: yM, width: wM, height: hM },
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
  senderPlacedFields: PlacedSigningField[],
  counterparties: Pick<Vs01Counterparty, "id" | "name">[],
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

  const autos: Vs01RecipientPlacedField[] = [];
  for (let p = 0; p < numPages; p++) {
    if (skippedPages.has(p)) continue;
    const rObs = rest
      .filter((o) => o.page === p && !o.autoInitials)
      .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
    const sObs = senderPlacedFields
      .filter((s) => s.page === p)
      .map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
    const obstacles = [...rObs, ...sObs];
    const dims = autoInitialsPlacementDims();
    const col = autoInitialsColumnIndexOnPage(
      [...rest, ...autos],
      counterparties,
      counterpartyId,
      p
    );
    const slot = findAutoInitialsMarginSlotOrNull(dims, obstacles, { columnOffset: col });
    if (slot) autos.push(createRecipientAutoInitialsField(counterpartyId, p, slot));
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

  const omit = new Set<string>();
  let changed = false;
  const dims = autoInitialsPlacementDims();
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

    const pageObs = [
      ...fields
        .filter((o) => o.page === f.page && !o.autoInitials)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
      ...senderPlacedFields
        .filter((s) => s.page === f.page)
        .map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
    ];
    const slot = findAutoInitialsMarginSlotOrNull(dims, pageObs, { columnOffset: idx });
    if (!slot) {
      omit.add(f.id);
      changed = true;
      return f;
    }
    const same =
      Math.abs(f.x - slot.x) < 1e-6 &&
      Math.abs(f.y - slot.y) < 1e-6 &&
      Math.abs(f.width - slot.width) < 1e-6 &&
      Math.abs(f.height - slot.height) < 1e-6;
    if (!same) changed = true;
    return same ? f : { ...f, ...slot };
  });

  const filtered = omit.size > 0 ? next.filter((f) => !omit.has(f.id)) : next;
  if (omit.size > 0) return filtered;
  return changed ? filtered : fields;
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
  ctx: SigningPlacementValueContext,
  options?: { autoInitials?: boolean }
): PlacedSigningField {
  const { x, y, width, height } = computeRectFromClick(type, clickX, clickY);
  const auto = options?.autoInitials === true;
  return {
    id: newSigningFieldId(),
    type,
    page,
    x,
    y,
    width,
    height,
    value: defaultValueForType(type, ctx),
    ...(auto ? { autoInitials: true } : {}),
  };
}

/**
 * One auto initials field for a page (stable id). Position is deterministic bottom-right.
 */
export function createAutoInitialsField(
  page: number,
  ctx: SigningPlacementValueContext,
  layout?: { x: number; y: number; width: number; height: number }
): PlacedSigningField {
  const { width, height, x, y } = layout ?? autoInitialsLayout();
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
 * Optional `manualFields` avoids overlapping gray auto slots with placed text/date/email boxes.
 */
export function buildAutoInitialsFields(
  pageCount: number,
  ctx: SigningPlacementValueContext,
  skippedPages: Set<number>,
  manualFields: PlacedSigningField[] = []
): PlacedSigningField[] {
  const out: PlacedSigningField[] = [];
  for (let p = 0; p < pageCount; p++) {
    if (skippedPages.has(p)) continue;
    const obstacles = manualFields
      .filter((f) => f.page === p && !f.autoInitials)
      .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
    const dims = autoInitialsPlacementDims();
    const slot = findAutoInitialsMarginSlotOrNull(dims, obstacles);
    if (slot) out.push(createAutoInitialsField(p, ctx, slot));
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

/** Prepare-mode corner label for a placed field (respects {@link Vs01TextFieldPurpose}). */
export function labelForPreparePlacedField(
  t: SigningFieldType,
  textPurpose?: Vs01TextFieldPurpose,
): string {
  if (t === "text" && textPurpose === "custom") return "Custom text";
  if (t === "text") return "Title";
  return labelForFieldType(t);
}
