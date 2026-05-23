/**
 * Map agreement corpus signature-block text lines → normalized PDF page coordinates.
 */

import { signaturePatchStartIndex } from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  PREPARE_PAGE_FOOTER_BAND_Y,
  clampPrepareFieldRectToSafeBounds,
} from "./signingFields";

export type SignatureLineAnchor = {
  partyIndex: number;
  blockHeading: string;
  /** Absolute line index within the signature tail (0-based). */
  byLineIndexInTail: number;
  /** Total lines in the signature tail (including blanks). */
  tailLineCount: number;
  /** 0–1 position within signature tail where "By:" appears */
  byLineRatio: number;
  nameLineRatio: number;
  dateLineRatio: number;
};

const BLOCK_HEADINGS = [
  { re: /^\s*CLIENT\s*:?\s*$/i, partyIndex: 0, label: "CLIENT" },
  { re: /^\s*SERVICE PROVIDER\s*:?\s*$/i, partyIndex: 1, label: "SERVICE PROVIDER" },
  { re: /^\s*PARTY\s+(\d+)\s*:?\s*$/i, partyIndex: -1, label: "PARTY" },
];

/** Normalized band where signature blocks render on the last PDF page. */
export const SIGNATURE_BLOCK_REGION_TOP = 0.52;
export const SIGNATURE_BLOCK_REGION_BOTTOM = PREPARE_PAGE_FOOTER_BAND_Y - 0.035;
export const SIGNATURE_BY_LINE_X = 0.118;
export const SIGNATURE_BY_LINE_WIDTH = 0.36;
export const SIGNATURE_BY_LINE_HEIGHT = 0.065;

function parseSignatureTailAnchors(tailText: string): SignatureLineAnchor[] {
  const lines = tailText.replace(/\r\n/g, "\n").split("\n");
  const tailLineCount = Math.max(1, lines.length);
  const out: SignatureLineAnchor[] = [];
  let current: { partyIndex: number; blockHeading: string; start: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    for (const h of BLOCK_HEADINGS) {
      const m = trimmed.match(h.re);
      if (m) {
        const partyIndex = h.partyIndex >= 0 ? h.partyIndex : Math.max(0, Number(m[1]) - 1);
        current = { partyIndex, blockHeading: h.label, start: i };
        break;
      }
    }
    if (!current) continue;
    if (/^By\s*:/i.test(trimmed) && !out.some((a) => a.partyIndex === current!.partyIndex)) {
      const rel = i / Math.max(1, tailLineCount - 1);
      out.push({
        partyIndex: current.partyIndex,
        blockHeading: current.blockHeading,
        byLineIndexInTail: i,
        tailLineCount,
        byLineRatio: Math.min(0.95, rel),
        nameLineRatio: Math.min(0.98, rel + 0.06),
        dateLineRatio: Math.min(0.99, rel + 0.12),
      });
    }
  }
  return out.sort((a, b) => a.partyIndex - b.partyIndex);
}

export function findSignatureLineAnchorsFromCorpusText(corpusText: string): SignatureLineAnchor[] {
  const text = (corpusText || "").trim();
  if (text.length < 80) return [];
  const start = signaturePatchStartIndex(text);
  const tail = start >= 0 ? text.slice(start) : text.slice(Math.floor(text.length * 0.72));
  return parseSignatureTailAnchors(tail);
}

/** True when corpus signature blocks already include human Name/Title lines (no editable fields needed). */
export function corpusHasPrefilledSignatureIdentity(corpusText: string | null | undefined): boolean {
  const text = (corpusText || "").trim();
  if (text.length < 80) return false;
  const anchors = findSignatureLineAnchorsFromCorpusText(text);
  if (anchors.length < 1) return false;
  const tailStart = signaturePatchStartIndex(text);
  const tail = tailStart >= 0 ? text.slice(tailStart) : text.slice(Math.floor(text.length * 0.72));
  return /\bName\s*:\s*\S+/i.test(tail) && /\b(?:Title\s*:\s*\S+|Date\s*:\s*[_\-\s]+)/i.test(tail);
}

export function logSignatureAnchorPlacementMiss(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-signature-anchor-miss]", payload);
}

function fallbackSignatureY(partyIndex: number, roleCount: number, height: number): number {
  const regionH = SIGNATURE_BLOCK_REGION_BOTTOM - SIGNATURE_BLOCK_REGION_TOP;
  const slot = partyIndex / Math.max(1, roleCount);
  return SIGNATURE_BLOCK_REGION_TOP + slot * regionH * 0.55 - height * 0.25;
}

/** Map semantic anchor to normalized rect on the last page signature band. */
export function signatureAnchorToPrepareRect(args: {
  anchor: SignatureLineAnchor | null;
  partyIndex: number;
  roleCount: number;
  fieldType: "signature" | "printed_name" | "text" | "date";
  fallbackLaneY?: number;
}): { x: number; y: number; width: number; height: number } {
  const roleCount = Math.max(1, args.roleCount);
  const regionH = SIGNATURE_BLOCK_REGION_BOTTOM - SIGNATURE_BLOCK_REGION_TOP;

  if (args.fieldType === "signature") {
    let y: number;
    if (args.anchor) {
      const lineRatio = args.anchor.byLineIndexInTail / Math.max(1, args.anchor.tailLineCount - 1);
      y =
        SIGNATURE_BLOCK_REGION_TOP +
        lineRatio * regionH -
        SIGNATURE_BY_LINE_HEIGHT * 0.4;
    } else {
      logSignatureAnchorPlacementMiss({
        partyIndex: args.partyIndex,
        roleCount,
        reason: "missing_by_anchor",
      });
      y = args.fallbackLaneY ?? fallbackSignatureY(args.partyIndex, roleCount, SIGNATURE_BY_LINE_HEIGHT);
    }
    return clampPrepareFieldRectToSafeBounds(
      {
        x: SIGNATURE_BY_LINE_X,
        y,
        width: SIGNATURE_BY_LINE_WIDTH,
        height: SIGNATURE_BY_LINE_HEIGHT,
      },
      { kind: "signature" },
    );
  }

  const ratio =
    args.fieldType === "printed_name"
      ? args.anchor?.nameLineRatio ?? 0.22
      : args.fieldType === "date"
        ? args.anchor?.dateLineRatio ?? 0.34
        : args.anchor?.nameLineRatio ?? 0.28;
  const y =
    (args.anchor
      ? SIGNATURE_BLOCK_REGION_TOP + ratio * regionH
      : args.fallbackLaneY ?? fallbackSignatureY(args.partyIndex, roleCount, 0.04)) - 0.01;
  const width = 0.3;
  const height = 0.04;

  return clampPrepareFieldRectToSafeBounds(
    { x: SIGNATURE_BY_LINE_X, y, width, height },
    { kind: "signature" },
  );
}

export function resolveSignaturePlacementY(args: {
  corpusText?: string | null;
  partyIndex: number;
  roleCount: number;
  fieldType: "signature" | "printed_name" | "text" | "date";
  fallbackY: number;
}): number {
  const anchors = args.corpusText ? findSignatureLineAnchorsFromCorpusText(args.corpusText) : [];
  const anchor = anchors.find((a) => a.partyIndex === args.partyIndex) ?? null;
  const rect = signatureAnchorToPrepareRect({
    anchor,
    partyIndex: args.partyIndex,
    roleCount: args.roleCount,
    fieldType: args.fieldType,
    fallbackLaneY: args.fallbackY,
  });
  if (rect.y + rect.height > PREPARE_PAGE_FOOTER_BAND_Y) {
    return Math.min(args.fallbackY, PREPARE_PAGE_FOOTER_BAND_Y - rect.height - 0.02);
  }
  return rect.y;
}

/** Compare two signature rects — client block should sit above service provider on stacked layouts. */
export function signatureRectsFollowBlockOrder(
  clientRect: { y: number },
  providerRect: { y: number },
): boolean {
  return clientRect.y < providerRect.y;
}
