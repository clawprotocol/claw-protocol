import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import type { Vs01NormTextRect } from "./vs01PageTextLayout";

export type Vs01CanonicalTextLayoutMode = "flow" | "absolute";

export type Vs01CanonicalFlowLineDescriptor = {
  text: string;
  trimmed: string;
  kind: Vs01NormTextRect["kind"];
  isSignatureExecutionLine: boolean;
  partyIndex: number | null;
  blockHeading: string | null;
};

export type Vs01CanonicalTextLayoutReport = {
  page: number;
  mode: Vs01CanonicalTextLayoutMode;
  textBlockCount: number;
  renderedLineCount: number;
  overlappingTextRects: number;
  contentRect: Vs01SigningPacketPage["contentRect"];
  initialsBandRect: Vs01SigningPacketPage["initialsBandRect"];
  textEntersInitialsBand: boolean;
};

export type Vs01MeasuredSignatureLine = {
  partyIndex: number;
  lineRect: DOMRect;
  normRect: Vs01NormalizedRect;
};

const BLOCK_HEADING_RES = [
  { re: /^\s*CLIENT\s*:?\s*$/i, partyIndex: 0, label: "CLIENT" },
  { re: /^\s*SERVICE PROVIDER\s*:?\s*$/i, partyIndex: 1, label: "SERVICE PROVIDER" },
  { re: /^\s*PARTY\s+(\d+)\s*:?\s*$/i, partyIndex: -1, label: "PARTY" },
];

function classifyLineKind(line: string): Vs01NormTextRect["kind"] {
  const t = line.trim();
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return "heading";
  if (/^(?:By|Signature|Name|Title|Date)\s*:/i.test(t)) return "signature_label";
  if (/^IN WITNESS WHEREOF/i.test(t)) return "heading";
  return "body";
}

function isSignatureExecutionLine(text: string): boolean {
  return /^(?:By|Signature)\s*:/i.test(text.trim());
}

export function flowLinesForPage(page: Pick<Vs01SigningPacketPage, "flowLines" | "textBlocks">): string[] {
  if (page.flowLines.length > 0) return page.flowLines;
  return [...page.textBlocks]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => b.text);
}

export function buildFlowLineDescriptors(flowLines: readonly string[]): Vs01CanonicalFlowLineDescriptor[] {
  let current: { partyIndex: number; blockHeading: string } | null = null;
  const out: Vs01CanonicalFlowLineDescriptor[] = [];
  for (const text of flowLines) {
    const trimmed = text.trim();
    if (trimmed) {
      for (const h of BLOCK_HEADING_RES) {
        const m = trimmed.match(h.re);
        if (m) {
          const partyIndex = h.partyIndex >= 0 ? h.partyIndex : Math.max(0, Number(m[1]) - 1);
          current = { partyIndex, blockHeading: h.label };
          break;
        }
      }
    }
    const isSigLine = Boolean(trimmed && isSignatureExecutionLine(trimmed));
    let partyIndex: number | null = null;
    if (isSigLine) {
      partyIndex =
        current?.partyIndex ?? (out.filter((l) => l.isSignatureExecutionLine).length === 0 ? 0 : 1);
    }
    out.push({
      text,
      trimmed,
      kind: trimmed ? classifyLineKind(trimmed) : "body",
      isSignatureExecutionLine: isSigLine,
      partyIndex,
      blockHeading: current?.blockHeading ?? null,
    });
  }
  return out;
}

export function textBlocksHaveOverlappingGeometry(
  blocks: readonly Vs01NormTextRect[],
  tolerance = 0.001,
): boolean {
  const visible = blocks.filter((b) => b.text.trim().length > 0);
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i]!;
      const b = visible[j]!;
      const xOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const yOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (xOverlap > tolerance && yOverlap > tolerance) return true;
    }
  }
  return false;
}

export function resolveCanonicalTextLayoutMode(
  page: Pick<Vs01SigningPacketPage, "textBlocks" | "flowLines">,
): Vs01CanonicalTextLayoutMode {
  if (page.flowLines.length > 0) return "flow";
  if (textBlocksHaveOverlappingGeometry(page.textBlocks)) return "flow";
  return "absolute";
}

function rectsOverlap(a: DOMRect, b: DOMRect, tolerancePx = 1): boolean {
  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return xOverlap > tolerancePx && yOverlap > tolerancePx;
}

export function countOverlappingDomTextRects(elements: readonly HTMLElement[]): number {
  let count = 0;
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      if (rectsOverlap(elements[i]!.getBoundingClientRect(), elements[j]!.getBoundingClientRect())) {
        count += 1;
      }
    }
  }
  return count;
}

export function domRectToNormalized(
  rect: DOMRect,
  surfaceRect: DOMRect,
): Vs01NormalizedRect {
  if (surfaceRect.width <= 0 || surfaceRect.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: (rect.left - surfaceRect.left) / surfaceRect.width,
    y: (rect.top - surfaceRect.top) / surfaceRect.height,
    width: rect.width / surfaceRect.width,
    height: rect.height / surfaceRect.height,
  };
}

export function measureCanonicalFlowTextLayout(args: {
  flowRoot: HTMLElement;
  surface: HTMLElement;
  page: Vs01SigningPacketPage;
  mode: Vs01CanonicalTextLayoutMode;
}): {
  report: Vs01CanonicalTextLayoutReport;
  signatureLines: Vs01MeasuredSignatureLine[];
  firstBadRects: Array<{ a: DOMRect; b: DOMRect }>;
} {
  const textEls = [...args.flowRoot.querySelectorAll<HTMLElement>("[data-vs01-canonical-text]")];
  const overlappingTextRects = countOverlappingDomTextRects(textEls);
  const surfaceRect = args.surface.getBoundingClientRect();
  const initialsDom = args.surface.querySelector<HTMLElement>(".vs01-canonical-initials-band");
  const initialsRect = initialsDom?.getBoundingClientRect() ?? null;
  let textEntersInitialsBand = false;
  if (initialsRect) {
    for (const el of textEls) {
      if (rectsOverlap(el.getBoundingClientRect(), initialsRect, 0)) {
        textEntersInitialsBand = true;
        break;
      }
    }
  }

  const signatureLines: Vs01MeasuredSignatureLine[] = [];
  for (const el of args.flowRoot.querySelectorAll<HTMLElement>("[data-vs01-signature-execution-line]")) {
    const partyRaw = el.getAttribute("data-vs01-signature-party");
    const partyIndex = partyRaw != null ? Number(partyRaw) : NaN;
    if (!Number.isFinite(partyIndex)) continue;
    const underline = el.querySelector<HTMLElement>(".vs01-canonical-signature-underline") ?? el;
    const lineRect = underline.getBoundingClientRect();
    signatureLines.push({
      partyIndex,
      lineRect,
      normRect: domRectToNormalized(lineRect, surfaceRect),
    });
  }

  const firstBadRects: Array<{ a: DOMRect; b: DOMRect }> = [];
  for (let i = 0; i < textEls.length && firstBadRects.length < 3; i += 1) {
    for (let j = i + 1; j < textEls.length && firstBadRects.length < 3; j += 1) {
      const a = textEls[i]!.getBoundingClientRect();
      const b = textEls[j]!.getBoundingClientRect();
      if (rectsOverlap(a, b)) firstBadRects.push({ a, b });
    }
  }

  const report: Vs01CanonicalTextLayoutReport = {
    page: args.page.pageIndex,
    mode: args.mode,
    textBlockCount: args.page.textBlocks.length,
    renderedLineCount: textEls.length,
    overlappingTextRects,
    contentRect: args.page.contentRect,
    initialsBandRect: args.page.initialsBandRect,
    textEntersInitialsBand,
  };

  return { report, signatureLines, firstBadRects };
}

export function logVs01CanonicalTextLayout(report: Vs01CanonicalTextLayoutReport): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-canonical-text-layout]", report);
}

export function logVs01CanonicalTextLayoutFail(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-canonical-text-layout-fail]", payload);
}

export function logVs01SignatureAnchorDomMeasured(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-anchor-dom-measured]", payload);
}
