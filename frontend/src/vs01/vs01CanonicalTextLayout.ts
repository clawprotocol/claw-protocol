import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import type { Vs01NormTextRect } from "./vs01PageTextLayout";
import { splitGluedSectionHeadingFromLine, splitInlineNumberedSectionMarkerFromLine } from "../components/agreements/documentSectionHeadingSplit";
import {
  createExecutionBlockHeadingScanState,
  isEntityExecutionBlockHeadingLine,
  resolveSignatureExecutionPartyIndex,
  scanExecutionBlockHeadingLine,
  type ExecutionBlockHeadingScanState,
} from "./vs01ExecutionBlockHeading";

/** First-page agreement title — mirrors paid Pro document_title classification. */
export function isCanonicalDocumentTitleLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 8 || t.length > 160) return false;
  if (/^\d+(?:\.\d+)*\.\s+/.test(t)) return false;
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+|IN WITNESS WHEREOF)\b/i.test(t)) return false;
  if (/^(?:By|Signature|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:/i.test(t)) {
    return false;
  }
  return t === t.toUpperCase() && /^[A-Z]/.test(t);
}

export type Vs01CanonicalFlowLineDescriptor = {
  text: string;
  trimmed: string;
  kind: Vs01NormTextRect["kind"];
  isSignatureExecutionLine: boolean;
  partyIndex: number | null;
  blockHeading: string | null;
};


function classifyLineKind(line: string, inWitnessBlock: boolean): Vs01NormTextRect["kind"] {
  const t = line.trim();
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return "heading";
  if (inWitnessBlock && isEntityExecutionBlockHeadingLine(t, true)) return "heading";
  if (/^(?:By|Signature|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:/i.test(t)) {
    return "signature_label";
  }
  if (/^IN WITNESS WHEREOF/i.test(t)) return "heading";
  if (/^\d+\.\s+(?!\d)/.test(t)) return "heading";
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

export function buildFlowLineDescriptors(
  flowLines: readonly string[],
  options?: {
    pageIndex?: number;
    roleEntityNames?: readonly string[];
    headingScanState?: ExecutionBlockHeadingScanState;
  },
): Vs01CanonicalFlowLineDescriptor[] {
  const headingState =
    options?.headingScanState ?? createExecutionBlockHeadingScanState();
  let documentTitleAssigned = false;
  const allowDocumentTitle = (options?.pageIndex ?? 0) === 0;
  const out: Vs01CanonicalFlowLineDescriptor[] = [];

  const pushDescriptor = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      scanExecutionBlockHeadingLine(trimmed, headingState, options?.roleEntityNames);
    }
    const isSigLine = Boolean(trimmed && isSignatureExecutionLine(trimmed));
    let partyIndex: number | null = null;
    if (isSigLine) {
      partyIndex = resolveSignatureExecutionPartyIndex({
        state: headingState,
        priorSignatureExecutionLineCount: out.filter((l) => l.isSignatureExecutionLine).length,
      });
    }
    let kind: Vs01NormTextRect["kind"] = trimmed
      ? classifyLineKind(trimmed, headingState.inWitnessBlock)
      : "body";
    if (
      allowDocumentTitle &&
      !documentTitleAssigned &&
      trimmed &&
      isCanonicalDocumentTitleLine(trimmed)
    ) {
      kind = "document_title";
      documentTitleAssigned = true;
    }
    out.push({
      text,
      trimmed,
      kind,
      isSignatureExecutionLine: isSigLine,
      partyIndex,
      blockHeading: headingState.current?.blockHeading ?? null,
    });
  };

  for (const text of flowLines) {
    const trimmed = text.trim();
    if (!trimmed) {
      pushDescriptor(text);
      continue;
    }
    const inlineExpanded = splitInlineNumberedSectionMarkerFromLine(trimmed);
    const parts =
      inlineExpanded.includes("\n") ? inlineExpanded.split("\n") : [inlineExpanded];
    for (const part of parts) {
      const split = splitGluedSectionHeadingFromLine(part);
      if (split.includes("\n")) {
        for (const sub of split.split("\n")) {
          pushDescriptor(sub);
        }
      } else {
        pushDescriptor(part === inlineExpanded ? text : part);
      }
    }
  }
  return out;
}
