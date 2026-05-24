import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import type { Vs01NormTextRect } from "./vs01PageTextLayout";

export type Vs01CanonicalFlowLineDescriptor = {
  text: string;
  trimmed: string;
  kind: Vs01NormTextRect["kind"];
  isSignatureExecutionLine: boolean;
  partyIndex: number | null;
  blockHeading: string | null;
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
  if (/^\d+(?:\.\d+)*\.\s+/.test(t)) return "heading";
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
