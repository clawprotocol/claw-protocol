import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  splitMergedSubclauseLine,
  stripGuidedInstructionLeakLines,
  stripStaleExecutionPlacementCorpusCopy,
} from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  resolveFinalVs01CorpusOrBlock,
  type FinalVs01CorpusResolution,
  type ResolveFinalVs01CorpusOrBlockArgs,
} from "./vs01SigningCorpus";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import { buildFlowLineDescriptors, flowLinesForPage, isCanonicalDocumentTitleLine } from "./vs01CanonicalTextLayout";
import {
  parseSignatureLineWidth,
  signatureLinePrefixNormX,
  type Vs01ByLinePlacement,
  type Vs01NormTextRect,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import {
  newSigningFieldId,
  prepareAutoInitialsPlacementDims,
  type PlacedSigningField,
} from "./signingFields";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { PREPARE_FIELD_ASSIGNMENT_SOURCE } from "./vs01PrepareFieldPlacement";
import { defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";
import {
  VS01_EXECUTION_SPACER_FRAC,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./vs01PacketLayoutConstants";

export {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./vs01PacketLayoutConstants";

export type Vs01SigningPacketMode = "guided_pro" | "free" | "uploaded_pdf";

export type Vs01SigningPacketPage = {
  pageIndex: number;
  contentRect: Vs01NormalizedRect;
  /** Source lines for flow layout (preferred over absolute textBlocks). */
  flowLines: string[];
  textBlocks: Vs01NormTextRect[];
  initialsBandRect: Vs01NormalizedRect;
  reservedInitialsBandRect: Vs01NormalizedRect;
  signatureAnchorRects: Vs01ByLinePlacement[];
  signatureLineAnchors: Vs01ByLinePlacement[];
  footerRect: Vs01NormalizedRect;
};

export type Vs01SigningPacketDiagnostics = {
  corpusGate: FinalVs01CorpusResolution;
  textIntersectsInitialsBand: boolean;
  signatureAnchorCount: number;
  signatureFieldCount: number;
  initialsFieldCount: number;
  validationErrors: string[];
};

export type Vs01SigningPacketModel = {
  allowed: boolean;
  pages: Vs01SigningPacketPage[];
  fields: PlacedSigningField[];
  corpus: string;
  diagnostics: Vs01SigningPacketDiagnostics;
};

export const VS01_PACKET_MARGIN_LEFT_PT = 54;
export const VS01_PACKET_MARGIN_TOP_PT = 44;
export const VS01_PACKET_MARGIN_RIGHT_PT = 54;
export const VS01_PACKET_MARGIN_BOTTOM_PT = 20;
/** Compact footer reservation: enough for auto-initials without creating a half-empty page. */
export const VS01_PACKET_INITIALS_BAND_PT = 80;
/** Witness-only pages skip initials — keep modest legal bottom margin instead. */
export const VS01_PACKET_WITNESS_BOTTOM_MARGIN_PT = 28;
export const VS01_PACKET_LINE_HEIGHT_PT = 17.5;
/** Extra lines withheld from pagination estimates (DOM flow pad; primary guard is safety margin). */
export const VS01_PACKET_FLOW_LINE_DOM_BUFFER = 1;
/** Conservative clearance between flow stack bottom and initials band top (in line heights). */
export const VS01_PACKET_PAGINATION_SAFETY_MARGIN_LINE_HEIGHTS = 1.5;
export const VS01_PACKET_ESTIMATED_BODY_CHAR_WIDTH_PT = 6.3;

const CONTENT_X = VS01_PACKET_MARGIN_LEFT_PT / VS01_PACKET_PAGE_WIDTH_PT;
const CONTENT_TOP = VS01_PACKET_MARGIN_TOP_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const CONTENT_WIDTH =
  (VS01_PACKET_PAGE_WIDTH_PT - VS01_PACKET_MARGIN_LEFT_PT - VS01_PACKET_MARGIN_RIGHT_PT) /
  VS01_PACKET_PAGE_WIDTH_PT;
const BAND_TOP =
  (VS01_PACKET_PAGE_HEIGHT_PT - VS01_PACKET_MARGIN_BOTTOM_PT - VS01_PACKET_INITIALS_BAND_PT) /
  VS01_PACKET_PAGE_HEIGHT_PT;
const BAND_HEIGHT = VS01_PACKET_INITIALS_BAND_PT / VS01_PACKET_PAGE_HEIGHT_PT;
export const VS01_PACKET_RESERVED_INITIALS_BAND_TOP_NORM = BAND_TOP;
const FOOTER_TOP = (VS01_PACKET_PAGE_HEIGHT_PT - VS01_PACKET_MARGIN_BOTTOM_PT) / VS01_PACKET_PAGE_HEIGHT_PT;
const LINE_HEIGHT = VS01_PACKET_LINE_HEIGHT_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const CONTENT_BOTTOM_LIMIT = BAND_TOP;
const PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM =
  BAND_TOP - VS01_PACKET_PAGINATION_SAFETY_MARGIN_LINE_HEIGHTS * LINE_HEIGHT;
export const VS01_PACKET_PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM = PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM;
const CHARS_PER_LINE = Math.floor(
  (VS01_PACKET_PAGE_WIDTH_PT - VS01_PACKET_MARGIN_LEFT_PT - VS01_PACKET_MARGIN_RIGHT_PT) /
  VS01_PACKET_ESTIMATED_BODY_CHAR_WIDTH_PT,
);
/** Georgia 13px @ canonical content width — DOM pre-wrap wraps sooner than corpus CHARS_PER_LINE. */
export const VS01_CANONICAL_DOM_VISUAL_CHARS_PER_LINE = Math.floor(
  (VS01_PACKET_PAGE_WIDTH_PT - VS01_PACKET_MARGIN_LEFT_PT - VS01_PACKET_MARGIN_RIGHT_PT) / 7.0,
);

function domVisualWrapLineCount(line: string): number {
  const t = line.trim();
  if (!t) return 1;
  return Math.max(1, Math.ceil(t.length / VS01_CANONICAL_DOM_VISUAL_CHARS_PER_LINE));
}

/** Execution-block metadata rows — must stay on separate flow lines (not paragraph-merged). */
const EXECUTION_METADATA_FIELD_LINE_RE =
  /^(?:By|Signature|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:/i;

function isStandaloneCanonicalLine(line: string): boolean {
  const t = line.trim();
  return (
    /^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t) ||
    EXECUTION_METADATA_FIELD_LINE_RE.test(t) ||
    /^IN WITNESS WHEREOF/i.test(t) ||
    /^\d+(?:\.\d+)*\.\s+[A-Z]/.test(t) ||
    /^[-*]\s+/.test(t)
  );
}

function wrapCanonicalTextLine(line: string): string[] {
  const trimmed = line.trimEnd();
  if (trimmed.length <= CHARS_PER_LINE || isStandaloneCanonicalLine(trimmed)) return [trimmed];
  const out: string[] = [];
  let rest = trimmed;
  while (rest.length > CHARS_PER_LINE) {
    const cut = rest.lastIndexOf(" ", CHARS_PER_LINE);
    const idx = cut > 32 ? cut : CHARS_PER_LINE;
    out.push(rest.slice(0, idx).trimEnd());
    rest = rest.slice(idx).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function canonicalFlowLineHeightUnits(line: string): number {
  const t = line.trim();
  if (!t) return 0.5;
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return 1.02;
  if (/^IN WITNESS WHEREOF/i.test(t)) return 1.08;
  if (EXECUTION_METADATA_FIELD_LINE_RE.test(t)) return 1.02;
  if (/^\d+(?:\.\d+)*\.\s+/.test(t)) return 1.04;
  return 1;
}

function domVisualStackPadUnits(line: string): number {
  const t = line.trim();
  if (!t) return 0;
  if (t.length > CHARS_PER_LINE) {
    const corpusWrap = Math.max(1, Math.ceil(t.length / CHARS_PER_LINE));
    const domWrap = domVisualWrapLineCount(t);
    return Math.max(0, domWrap - corpusWrap) * 0.95;
  }
  if (t.length > VS01_CANONICAL_DOM_VISUAL_CHARS_PER_LINE) {
    return 1.0;
  }
  return 0;
}

/** DOM flow stack units — must stay in sync with Vs01CanonicalSigningPage CSS (pre-wrapped flow lines). */
export function canonicalFlowLineStackStepUnits(line: string): number {
  const t = line.trim();
  if (!t) return VS01_EXECUTION_SPACER_FRAC;
  let units = canonicalFlowLineHeightUnits(line);
  if (t.length > CHARS_PER_LINE) {
    units *= Math.max(1, Math.ceil(t.length / CHARS_PER_LINE));
  }
  units += domVisualStackPadUnits(line);
  if (isCanonicalDocumentTitleLine(t)) units += 0.42;
  if (/^\d+(?:\.\d+)*\.\s+/.test(t)) units += 0.06;
  return units;
}

export function canonicalFlowStackBottomNorm(
  page: Pick<Vs01SigningPacketPage, "flowLines" | "contentRect" | "textBlocks">,
): number {
  const flowLines = flowLinesForPage(page);
  const stackHeight = flowLines.reduce(
    (sum, line) => sum + canonicalFlowLineStackStepUnits(line) * LINE_HEIGHT,
    0,
  );
  return page.contentRect.y + stackHeight;
}

/** Flow-zone fill percentage (stack bottom vs content rect height above initials band). */
export function canonicalFlowZoneUtilizationPct(
  page: Pick<Vs01SigningPacketPage, "flowLines" | "contentRect" | "textBlocks">,
): number {
  const zoneHeight = page.contentRect.height;
  if (zoneHeight <= 0.0001) return 0;
  const stackBottom = canonicalFlowStackBottomNorm(page);
  return ((stackBottom - page.contentRect.y) / zoneHeight) * 100;
}

export function vs01PaginationTextRectBottomLimitNorm(initialsBandTop: number): number {
  return initialsBandTop - VS01_PACKET_PAGINATION_SAFETY_MARGIN_LINE_HEIGHTS * LINE_HEIGHT;
}

const SIGNATURE_UNDERLINE_BASELINE_FRAC = 0.8;
const SIGNATURE_UNDERLINE_HEIGHT_FRAC = 0.12;
export const VS01_CANONICAL_SIGNATURE_UNDERLINE_WIDTH_NORM = 190 / VS01_PACKET_PAGE_WIDTH_PT;

/**
 * Signature anchors from flow line stack geometry (same vertical rhythm as Vs01CanonicalSigningPage).
 * Do not use pagination textRects — they use different line-height units and drift from flow render.
 */
export function findSignatureLinePlacementsFromFlowPage(
  page: Pick<Vs01SigningPacketPage, "flowLines" | "contentRect" | "textBlocks" | "pageIndex">,
): Vs01ByLinePlacement[] {
  const flowLines = flowLinesForPage(page);
  const descriptors = buildFlowLineDescriptors(flowLines, { pageIndex: page.pageIndex ?? 0 });
  const contentTop = page.contentRect.y;
  const contentX = page.contentRect.x;
  let cursorY = contentTop;
  const out: Vs01ByLinePlacement[] = [];

  for (const descriptor of descriptors) {
    const step = canonicalFlowLineStackStepUnits(descriptor.text);
    const lineTop = cursorY;
    const lineStackHeight = step * LINE_HEIGHT;

    if (descriptor.isSignatureExecutionLine && descriptor.partyIndex != null) {
      const partyIndex = descriptor.partyIndex;
      if (!out.some((anchor) => anchor.partyIndex === partyIndex)) {
        const lineText = descriptor.trimmed;
        const width = Math.max(
          VS01_CANONICAL_SIGNATURE_UNDERLINE_WIDTH_NORM,
          parseSignatureLineWidth(lineText, lineWidth(lineText)),
        );
        const x = signatureLinePrefixNormX(lineText, contentX);
        out.push({
          partyIndex,
          blockHeading: descriptor.blockHeading ?? (partyIndex === 0 ? "CLIENT" : "SERVICE PROVIDER"),
          x,
          y: lineTop + lineStackHeight * SIGNATURE_UNDERLINE_BASELINE_FRAC,
          width,
          height: lineStackHeight * SIGNATURE_UNDERLINE_HEIGHT_FRAC,
          lineText,
        });
      }
    }

    cursorY += lineStackHeight;
  }

  return out.sort((a, b) => a.partyIndex - b.partyIndex);
}

function normalizeLines(corpus: string): string[] {
  const out: string[] = [];
  let paragraph: string[] = [];
  let previousWasBlank = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (joined) out.push(...wrapCanonicalTextLine(joined));
    paragraph = [];
  };

  for (const raw of corpus.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = raw.trimEnd();
    if (!trimmed.trim()) {
      flushParagraph();
      if (!previousWasBlank) out.push("");
      previousWasBlank = true;
      continue;
    }
    previousWasBlank = false;
    const expanded = splitMergedSubclauseLine(trimmed);
    for (const piece of expanded) {
      const line = piece.trimEnd();
      if (!line.trim()) continue;
      if (isStandaloneCanonicalLine(line)) {
        flushParagraph();
        out.push(...wrapCanonicalTextLine(line));
        continue;
      }
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return out;
}

/** Test/diagnostic entry: corpus → standalone flow lines before pagination (Prepare packet path). */
export function normalizeSigningPacketCorpusLines(corpus: string): string[] {
  const instructionStripped = stripGuidedInstructionLeakLines(corpus);
  return normalizeLines(instructionStripped.text);
}

function canonicalWitnessBlockFromRoles(roles: readonly Vs01PrepareSigningRole[]): string {
  const [owner, ...others] = roles;
  const blocks: string[] = ["IN WITNESS WHEREOF, the Parties execute this Agreement."];
  if (owner) {
    blocks.push(
      [
        "CLIENT:",
        owner.entityName || owner.partyName || "Client",
        "By: ______________________",
        `Name: ${owner.signerName || owner.entityName || owner.partyName || ""}`.trim(),
        ...(owner.signerTitle ? [`Title: ${owner.signerTitle}`] : []),
        "Date: ____________________",
      ].join("\n"),
    );
  }
  others.forEach((role, i) => {
    blocks.push(
      [
        i === 0 ? "SERVICE PROVIDER:" : `PARTY ${i + 2}:`,
        role.entityName || role.partyName || `Party ${i + 2}`,
        "By: ______________________",
        `Name: ${role.signerName || role.entityName || role.partyName || ""}`.trim(),
        ...(role.signerTitle ? [`Title: ${role.signerTitle}`] : []),
        "Date: ____________________",
      ].join("\n"),
    );
  });
  return blocks.join("\n\n");
}

function standardizeWitnessSignatureLines(corpus: string): string {
  return corpus.replace(/^(\s*)Signature(\s*:\s*)_{2,}\s*$/gim, "$1By$2______________________");
}

function ensureWitnessBlockFromRoles(corpus: string, roles: readonly Vs01PrepareSigningRole[]): string {
  const cleaned = standardizeWitnessSignatureLines(stripStaleExecutionPlacementCorpusCopy(corpus).text.trim());
  const signerCount = Math.max(2, roles.length);
  if (
    corpusHasVisibleSignatureExecutionLines(cleaned) &&
    corpusSignatureBlocksHaveRequiredByLines(cleaned, signerCount)
  ) {
    return cleaned;
  }
  return `${cleaned.replace(/\n+$/g, "")}\n\n${canonicalWitnessBlockFromRoles(roles)}`.trim();
}

function classifyText(line: string, options?: { allowDocumentTitle?: boolean }): Vs01NormTextRect["kind"] {
  const t = line.trim();
  if (options?.allowDocumentTitle && isCanonicalDocumentTitleLine(t)) return "document_title";
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return "heading";
  if (EXECUTION_METADATA_FIELD_LINE_RE.test(t)) return "signature_label";
  if (/^IN WITNESS WHEREOF/i.test(t)) return "heading";
  if (/^\d+(?:\.\d+)*\.\s+/.test(t)) return "heading";
  return "body";
}

export function isWitnessSigningPacketPage(page: Pick<Vs01SigningPacketPage, "flowLines">): boolean {
  return page.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line));
}

/** Normalized blank below witness flow stack — for layout regression tests. */
export function witnessPageTrailingBlankNorm(
  page: Pick<Vs01SigningPacketPage, "flowLines" | "contentRect" | "textBlocks">,
): number {
  const stackBottom = canonicalFlowStackBottomNorm(page);
  const pageBottom = page.contentRect.y + page.contentRect.height;
  const marginNorm = VS01_PACKET_WITNESS_BOTTOM_MARGIN_PT / VS01_PACKET_PAGE_HEIGHT_PT;
  return Math.max(0, pageBottom - stackBottom - marginNorm);
}

function compactWitnessPageLayout(page: Vs01SigningPacketPage): Vs01SigningPacketPage {
  if (!isWitnessSigningPacketPage(page)) return page;
  const stackBottom = canonicalFlowStackBottomNorm(page);
  const compactBottom = Math.min(
    FOOTER_TOP,
    stackBottom + VS01_PACKET_WITNESS_BOTTOM_MARGIN_PT / VS01_PACKET_PAGE_HEIGHT_PT,
  );
  const collapsedBand = {
    x: CONTENT_X,
    y: compactBottom,
    width: CONTENT_WIDTH,
    height: 0,
  };
  return {
    ...page,
    contentRect: {
      ...page.contentRect,
      height: compactBottom - page.contentRect.y,
    },
    initialsBandRect: collapsedBand,
    reservedInitialsBandRect: collapsedBand,
  };
}

function lineWidth(line: string): number {
  return Math.min(
    CONTENT_WIDTH,
    Math.max(0.08, (line.trim().length * VS01_PACKET_ESTIMATED_BODY_CHAR_WIDTH_PT) / VS01_PACKET_PAGE_WIDTH_PT),
  );
}

function textRectIntersects(a: Vs01NormalizedRect, b: Vs01NormalizedRect): boolean {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x > 0 && y > 0;
}

type PaginatedCorpusSlice = {
  pageIndex: number;
  flowLines: string[];
  textRects: Vs01NormTextRect[];
};

export function maxFlowLinesPerSigningPacketPage(): number {
  const raw = Math.floor((PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM - CONTENT_TOP) / LINE_HEIGHT);
  return Math.max(1, raw - VS01_PACKET_FLOW_LINE_DOM_BUFFER);
}

function paginateCorpus(corpus: string): PaginatedCorpusSlice[] {
  const instructionStripped = stripGuidedInstructionLeakLines(corpus);
  const lines = normalizeLines(instructionStripped.text);
  const maxStackUnitsPerPage = (PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM - CONTENT_TOP) / LINE_HEIGHT;
  const pages: PaginatedCorpusSlice[] = [];
  let pageIndex = 0;
  let stackUnits = 0;
  let pageLines: string[] = [];
  let rects: Vs01NormTextRect[] = [];

  let documentTitleAssigned = false;

  const flush = () => {
    pages.push({ pageIndex, flowLines: pageLines, textRects: rects });
    pageIndex += 1;
    stackUnits = 0;
    pageLines = [];
    rects = [];
  };

  const nextFlowStackBottomNorm = (line: string) =>
    CONTENT_TOP + (stackUnits + canonicalFlowLineStackStepUnits(line)) * LINE_HEIGHT;

  const lineWouldExceedFlowStackLimit = (line: string) =>
    nextFlowStackBottomNorm(line) > PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM + 0.0001;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const nextNonBlank = lines.slice(i + 1).find((l) => l.trim())?.trim() ?? "";
    const startsExecutionBlock =
      /^IN WITNESS WHEREOF/i.test(trimmed) ||
      /^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(trimmed);
    const startsSectionHeading =
      /^[A-Z][A-Z0-9 ,;:'"()/&.-]{3,}$/.test(trimmed) && trimmed.length <= 90;
    const nextStartsExecutionLine = EXECUTION_METADATA_FIELD_LINE_RE.test(nextNonBlank);
    const witnessLinesRemaining = /^IN WITNESS WHEREOF/i.test(trimmed)
      ? lines.slice(i).filter((l) => l.trim()).length
      : 0;
    const minKeepTogether = /^IN WITNESS WHEREOF/i.test(trimmed)
      ? Math.min(14, Math.max(witnessLinesRemaining, 6))
      : startsExecutionBlock
        ? 7
        : startsSectionHeading
          ? 3
          : nextStartsExecutionLine
            ? 4
            : 0;
    if (/^IN WITNESS WHEREOF/i.test(trimmed) && stackUnits > 0) {
      const meaningfulOnPage = pageLines.filter((l) => l.trim()).length;
      if (meaningfulOnPage > 2) {
        flush();
      }
    }
    if (
      stackUnits > 0 &&
      minKeepTogether > 0 &&
      maxStackUnitsPerPage - stackUnits < minKeepTogether * 1.05
    ) {
      flush();
    }
    if (stackUnits > 0 && lineWouldExceedFlowStackLimit(line)) {
      flush();
    }
    const stepUnits = canonicalFlowLineStackStepUnits(line);
    pageLines.push(line);
    if (line.trim()) {
      const allowDocumentTitle = pageIndex === 0 && !documentTitleAssigned;
      const kind = classifyText(line, { allowDocumentTitle });
      if (kind === "document_title") documentTitleAssigned = true;
      rects.push({
        x: CONTENT_X,
        y: CONTENT_TOP + stackUnits * LINE_HEIGHT,
        width: lineWidth(line),
        height: LINE_HEIGHT * Math.min(stepUnits, 1.35) * 0.72,
        text: line,
        kind,
      });
    }
    stackUnits += stepUnits;
  }
  flush();
  const finalPages = pages.length ? pages : [{ pageIndex: 0, flowLines: [], textRects: [] }];
  for (const page of finalPages) {
    const contentRect = {
      x: CONTENT_X,
      y: CONTENT_TOP,
      width: CONTENT_WIDTH,
      height: CONTENT_BOTTOM_LIMIT - CONTENT_TOP,
    };
    const stackBottom = canonicalFlowStackBottomNorm({
      flowLines: page.flowLines,
      textBlocks: page.textRects,
      contentRect,
    });
    const flowZoneUtilizationPct = canonicalFlowZoneUtilizationPct({
      flowLines: page.flowLines,
      textBlocks: page.textRects,
      contentRect,
    });
    if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.info("[vs01-canonical-pagination-page]", {
        page: page.pageIndex,
        lineCount: page.flowLines.filter((line) => line.trim()).length,
        visualLastLineBottom: Math.max(0, ...page.textRects.map((r) => r.y + r.height)),
        flowStackBottom: stackBottom,
        flowZoneUtilizationPct: Math.round(flowZoneUtilizationPct * 10) / 10,
        initialsBandTop: BAND_TOP,
        flowStackBottomLimit: PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM,
        ok: stackBottom <= PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM + 0.0001,
      });
    }
  }
  return finalPages;
}

function fieldBase(role: Vs01PrepareSigningRole, page: number): Pick<
  PlacedSigningField,
  | "page"
  | "assignedPartyId"
  | "assignedPartyIndex"
  | "assignedSignerEmail"
  | "assignedSignerRoleId"
  | "assignedSignerRoleLabel"
  | "assignedSignerRoleKind"
  | "assignmentSource"
> {
  return {
    page,
    assignedPartyId: role.partyId,
    assignedPartyIndex: role.partyIndex,
    assignedSignerEmail: role.signerEmail,
    assignedSignerRoleId: role.roleId,
    assignedSignerRoleLabel: role.entityName,
    assignedSignerRoleKind: role.kind,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
}

export const VS01_SIGNATURE_FIELD_HEIGHT_NORM = 0.0228;

/** Underline band on the By line (for intersection checks; matches flow baseline geometry). */
export function signatureUnderlineBandFromAnchor(
  anchor: Pick<Vs01ByLinePlacement, "x" | "y" | "width" | "height">,
): Pick<PlacedSigningField, "x" | "y" | "width" | "height"> {
  const byLineTop = anchor.y - LINE_HEIGHT * SIGNATURE_UNDERLINE_BASELINE_FRAC;
  return {
    x: anchor.x,
    y: byLineTop + LINE_HEIGHT * 0.58,
    width: anchor.width,
    height: LINE_HEIGHT * 0.3,
  };
}

export function signatureFieldRectOnUnderlineAnchor(
  anchor: Pick<Vs01ByLinePlacement, "x" | "y" | "width" | "height">,
  fieldHeight = VS01_SIGNATURE_FIELD_HEIGHT_NORM,
): Pick<PlacedSigningField, "x" | "y" | "width" | "height"> {
  const leftInset = Math.min(0.038, Math.max(0.032, anchor.width * 0.11));
  const usableWidth = Math.max(0.18, anchor.width - leftInset);
  const fieldWidth = Math.min(usableWidth, Math.max(anchor.width * 0.7, 0.21));
  const underlineBand = signatureUnderlineBandFromAnchor(anchor);
  const underlineCenter = underlineBand.y + underlineBand.height / 2;
  const preferredY = underlineCenter - fieldHeight / 2 - 0.0037;
  return {
    x: anchor.x + leftInset,
    y: Math.max(0, preferredY),
    width: fieldWidth,
    height: fieldHeight,
  };
}

function signatureFieldForAnchor(role: Vs01PrepareSigningRole, anchor: Vs01ByLinePlacement, page: number): PlacedSigningField {
  const geom = signatureFieldRectOnUnderlineAnchor(anchor);
  return {
    id: `canonical_sig_${role.roleId}_${page}_${newSigningFieldId()}`,
    type: "signature",
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    value: defaultPrepareTemplateStoredValue("signature", role, {
      typedName: role.signerName || role.entityName,
      initials: "",
      signerEmail: role.signerEmail,
    }),
    ...fieldBase(role, page),
  };
}

function initialsFieldForRole(role: Vs01PrepareSigningRole, page: number, roleIndex: number, roleCount: number): PlacedSigningField {
  const { width: boxWidth, height: boxHeight } = prepareAutoInitialsPlacementDims();
  const gap = 0.014;
  const cols = Math.min(2, Math.max(1, roleCount));
  const col = roleIndex % cols;
  const row = Math.floor(roleIndex / cols);
  const rows = Math.ceil(roleCount / cols);
  const right = CONTENT_X + CONTENT_WIDTH - 0.035 - boxWidth - (cols - 1 - col) * (boxWidth + gap);
  const bandBottom = BAND_TOP + BAND_HEIGHT;
  const groupHeight = rows * boxHeight + Math.max(0, rows - 1) * gap;
  const top = bandBottom - 0.022 - groupHeight + row * (boxHeight + gap);
  return {
    id: `canonical_initials_${role.roleId}_${page}`,
    type: "initials",
    x: right,
    y: Math.max(BAND_TOP + 0.012, Math.min(BAND_TOP + BAND_HEIGHT - boxHeight - 0.012, top)),
    width: boxWidth,
    height: boxHeight,
    value: defaultPrepareTemplateStoredValue("initials", role, {
      typedName: role.signerName || role.entityName,
      initials: "",
      signerEmail: role.signerEmail,
    }),
    autoInitials: true,
    ...fieldBase(role, page),
  };
}

export function signingPacketLayoutsFromModel(model: Pick<Vs01SigningPacketModel, "pages">): Vs01PageTextLayout[] {
  return model.pages.map((p) => ({
    pageIndex: p.pageIndex,
    source: "corpus_sim",
    textRects: p.textBlocks,
  }));
}

export function validateVs01SigningPacketGeometry(args: {
  pages: readonly Vs01SigningPacketPage[];
  fields: readonly PlacedSigningField[];
  roleCount: number;
}): string[] {
  const errors: string[] = [];
  const textIntersectsInitialsBand = args.pages.some((page) =>
    page.textBlocks.some((text) => textRectIntersects(text, page.initialsBandRect)),
  );
  if (textIntersectsInitialsBand) {
    for (const page of args.pages) {
      const offenders = page.textBlocks.filter((text) => textRectIntersects(text, page.initialsBandRect));
      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-text-in-initials-band-fail]", {
          page: page.pageIndex,
          text: offenders.slice(0, 3).map((t) => t.text),
          count: offenders.length,
        });
      }
    }
    errors.push("text_intersects_initials_band");
  }

  const flowStackIntersectsInitialsBand = args.pages.some(
    (page) =>
      canonicalFlowStackBottomNorm(page) >
      vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y) + 0.0001,
  );
  if (flowStackIntersectsInitialsBand) {
    errors.push("flow_stack_intersects_initials_band");
  }

  const signatureAnchorCount = args.pages.reduce((sum, p) => sum + p.signatureLineAnchors.length, 0);
  if (signatureAnchorCount < args.roleCount) errors.push("signature_anchor_count_below_roles");

  for (const field of args.fields.filter((f) => f.type === "initials")) {
    const page = args.pages.find((p) => p.pageIndex === field.page);
    if (!page || !textRectIntersects(field, page.initialsBandRect)) {
      errors.push(`initials_outside_reserved_band:${field.page}`);
    }
  }
  return [...new Set(errors)];
}

export function buildVs01SigningPacketModel(args: {
  mode: Vs01SigningPacketMode;
  authoritativeCorpusPlain?: string | null;
  roles: readonly Vs01PrepareSigningRole[];
  /** When false, body-page initials fields are omitted from the canonical model. */
  initialsEnabled?: boolean;
  corpusGateArgs?: Omit<ResolveFinalVs01CorpusOrBlockArgs, "agreementCorpusText" | "guidedPro">;
  bridge?: AgreementVs01BridgeSession | null;
  draft?: AgreementDraft | null;
}): Vs01SigningPacketModel {
  const guidedPro = args.mode === "guided_pro";
  const authoritativeCorpusPlain = guidedPro
    ? ensureWitnessBlockFromRoles(args.authoritativeCorpusPlain ?? "", args.roles)
    : (args.authoritativeCorpusPlain ?? "");
  const corpusGate = resolveFinalVs01CorpusOrBlock({
    ...(args.corpusGateArgs ?? {}),
    agreementCorpusText: authoritativeCorpusPlain,
    bridge: args.bridge ?? args.corpusGateArgs?.bridge ?? null,
    draft: args.draft ?? args.corpusGateArgs?.draft ?? null,
    guidedPro,
  });
  const validationErrors: string[] = [];
  if (!corpusGate.allowed) validationErrors.push(corpusGate.blockReason ?? "corpus_gate_blocked");
  const layouts = corpusGate.allowed ? paginateCorpus(corpusGate.corpus) : [];
  const roles = [...args.roles];
  const fields: PlacedSigningField[] = [];
  const pages: Vs01SigningPacketPage[] = layouts.map((slice) => {
    const signatureLineAnchors = findSignatureLinePlacementsFromFlowPage({
      pageIndex: slice.pageIndex,
      flowLines: slice.flowLines,
      textBlocks: slice.textRects,
      contentRect: {
        x: CONTENT_X,
        y: CONTENT_TOP,
        width: CONTENT_WIDTH,
        height: CONTENT_BOTTOM_LIMIT - CONTENT_TOP,
      },
    });
    const contentRect = {
      x: CONTENT_X,
      y: CONTENT_TOP,
      width: CONTENT_WIDTH,
      height: CONTENT_BOTTOM_LIMIT - CONTENT_TOP,
    };
    const initialsBandRect = {
      x: CONTENT_X,
      y: BAND_TOP,
      width: CONTENT_WIDTH,
      height: BAND_HEIGHT,
    };
    return compactWitnessPageLayout({
      pageIndex: slice.pageIndex,
      contentRect,
      flowLines: slice.flowLines,
      textBlocks: slice.textRects,
      initialsBandRect,
      reservedInitialsBandRect: initialsBandRect,
      signatureAnchorRects: signatureLineAnchors,
      signatureLineAnchors,
      footerRect: {
        x: CONTENT_X,
        y: FOOTER_TOP,
        width: CONTENT_WIDTH,
        height: VS01_PACKET_MARGIN_BOTTOM_PT / VS01_PACKET_PAGE_HEIGHT_PT,
      },
    });
  });

  for (const role of roles) {
    const anchorPage = pages.find((p) => p.signatureLineAnchors.some((a) => a.partyIndex === role.partyIndex));
    const anchor = anchorPage?.signatureLineAnchors.find((a) => a.partyIndex === role.partyIndex) ?? null;
    if (!anchor || !anchorPage) {
      validationErrors.push(`missing_signature_anchor:${role.partyIndex}`);
      continue;
    }
    fields.push(signatureFieldForAnchor(role, anchor, anchorPage.pageIndex));
  }

  const witnessPageIndex =
    pages.find((p) => p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)))?.pageIndex ??
    (pages.length ? pages.length - 1 : 0);
  const initialsEnabled = args.initialsEnabled !== false;
  if (initialsEnabled) {
    for (const page of pages) {
      if (page.pageIndex === witnessPageIndex) continue;
      roles.forEach((role, roleIndex) => {
        fields.push(initialsFieldForRole(role, page.pageIndex, roleIndex, roles.length));
      });
    }
  }

  const totalVisibleChars = pages.reduce(
    (sum, p) =>
      sum +
      p.flowLines.reduce((lineSum, line) => lineSum + line.trim().length, 0),
    0,
  );
  if (corpusGate.allowed && totalVisibleChars < 80) {
    validationErrors.push("canonical_pages_blank");
  }
  const hasWitnessInPages = pages.some((p) =>
    p.textBlocks.some((b) => /\bIN WITNESS WHEREOF\b/i.test(b.text)),
  );
  if (corpusGate.allowed && guidedPro && !hasWitnessInPages) {
    validationErrors.push("witness_block_not_in_pages");
  }

  const signatureAnchorCount = pages.reduce((sum, p) => sum + p.signatureLineAnchors.length, 0);
  const geometryErrors = validateVs01SigningPacketGeometry({
    pages,
    fields,
    roleCount: roles.length,
  });
  validationErrors.push(...geometryErrors);

  const diagnostics: Vs01SigningPacketDiagnostics = {
    corpusGate,
    textIntersectsInitialsBand: geometryErrors.includes("text_intersects_initials_band"),
    signatureAnchorCount,
    signatureFieldCount: fields.filter((f) => f.type === "signature").length,
    initialsFieldCount: fields.filter((f) => f.type === "initials").length,
    validationErrors: [...new Set(validationErrors)],
  };

  return {
    allowed: corpusGate.allowed && diagnostics.validationErrors.length === 0,
    pages,
    fields,
    corpus: corpusGate.corpus,
    diagnostics,
  };
}
