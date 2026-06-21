/**
 * Paid Pro display section rendering — separate glued headings from body text before visible render.
 */

import { repairGluedSectionHeadingsInText, splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";

export type PaidProSectionNormalizeResult = {
  text: string;
  fixedHeadingBodyCollapse: number;
};

const PRO_SECTION_GLUE_PATTERNS: RegExp[] = [
  /^(\d+\.\s+Services and Engagement)\s+((?:Consultant|Service Provider|Client|Either|Each|The)\b.+)$/i,
  /^(\d+\.\d+\s+Invoicing and Payment Timing)\s+((?:Consultant|Service Provider|Client)\b.+)$/i,
  /^(\d+\.\d+\s+Taxes)\s+((?:Consultant|Service Provider|Client|Each|Either)\b.+)$/i,
  /^(\d+\.\s+Independent Contractor)\s+((?:Consultant|Service Provider|Client)\b.+)$/i,
  /^(\d+\.\s+Limitation of Liability)\s+((?:Except|Neither|In no event|To the)\b.+)$/i,
];

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logPaidProSectionRenderNormalized(payload: PaidProSectionNormalizeResult): void {
  if (isTestMode() || !payload.fixedHeadingBodyCollapse) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-section-render-normalized]", payload);
}

function splitGluedProSectionLine(line: string): { lines: string[]; fixed: number } {
  const trimmed = line.trim();
  if (!trimmed) return { lines: [line], fixed: 0 };

  for (const pattern of PRO_SECTION_GLUE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1] && match[2]?.trim()) {
      return { lines: [match[1].trim(), "", match[2].trim()], fixed: 1 };
    }
  }

  const split = splitGluedSectionHeadingFromLine(line);
  if (split !== line) {
    const parts = split
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return { lines: [parts[0], "", parts.slice(1).join("\n")], fixed: 1 };
    }
  }

  return { lines: [line], fixed: 0 };
}

function ensureHeadingBodySpacing(text: string): string {
  return text.replace(/^(\d+(?:\.\d+)*\.\s+[^\n]{3,120})\n(?!\n)(?!\d+\.)([^\n]+)/gm, "$1\n\n$2");
}

export function normalizePaidProSectionRender(text: string): PaidProSectionNormalizeResult {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";

  let fixedHeadingBodyCollapse = 0;
  const glued = repairGluedSectionHeadingsInText(head);
  const expanded: string[] = [];
  for (const line of glued.split("\n")) {
    const split = splitGluedProSectionLine(line);
    fixedHeadingBodyCollapse += split.fixed;
    expanded.push(...split.lines);
  }

  const beforeSpacing = expanded.join("\n");
  let normalizedHead = ensureHeadingBodySpacing(beforeSpacing.replace(/\n{3,}/g, "\n\n"));
  if (normalizedHead !== beforeSpacing) {
    fixedHeadingBodyCollapse += 1;
  }
  const result: PaidProSectionNormalizeResult = {
    text: `${normalizedHead}${tail ? `\n\n${tail.trimStart()}` : ""}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    fixedHeadingBodyCollapse,
  };
  logPaidProSectionRenderNormalized(result);
  return result;
}
