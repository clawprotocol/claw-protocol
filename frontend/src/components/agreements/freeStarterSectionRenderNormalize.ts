/**
 * Free Starter structured section rendering — heading/body separation, role labels, null guards.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import {
  extractTermDurationFromIntake,
  isAgreementRoleLabel,
  isInvalidVisibleScheduleValue,
  isSignerTitleLikeRole,
  normalizeRoleLabelToken,
  starterCommercialRoleForIndex,
} from "./starterRoleLabelGuard";
import {
  formatStarterPreviewForDisplay,
  repairInlineCollapsedStarterLayout,
} from "./starterPreviewFormatting";

const LOG_LABEL_PREFIX = "[free-starter-label-line-normalized]";

const COLLAPSED_SCHEDULE_LABEL_RES: RegExp[] = [
  /^Term:\s*(.+?)\s+Effective Date:\s*(.+)$/im,
  /^Payment Terms:\s*(.+?)\s+Effective Date:\s*(.+)$/im,
  /^Term:\s*(.+?)\s+Renewal:\s*(.+)$/im,
  /^Start Date:\s*(.+?)\s+End Date:\s*(.+)$/im,
  /^Notice:\s*(.+?)\s+Address:\s*(.+)$/im,
  /^Services Term:\s*(.+?)\s+Effective Date:\s*(.+)$/im,
];

const COLLAPSED_SCHEDULE_LABEL_PAIRS: Array<[string, string]> = [
  ["Term:", "Effective Date:"],
  ["Payment Terms:", "Effective Date:"],
  ["Term:", "Renewal:"],
  ["Start Date:", "End Date:"],
  ["Notice:", "Address:"],
  ["Services Term:", "Effective Date:"],
];

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function normalizeFreeStarterCollapsedLabelLines(text: string): {
  text: string;
  normalized: number;
} {
  let out = text || "";
  let normalized = 0;

  COLLAPSED_SCHEDULE_LABEL_RES.forEach((re, index) => {
    const pair = COLLAPSED_SCHEDULE_LABEL_PAIRS[index];
    if (!pair) return;
    const next = out.replace(re, (_match, first: string, second: string) => {
      normalized += 1;
      return `${pair[0]} ${first.trim()}\n${pair[1]} ${second.trim()}`;
    });
    out = next;
  });

  if (normalized > 0 && !isTestMode()) {
    // eslint-disable-next-line no-console
    console.info(LOG_LABEL_PREFIX, { normalized });
  }

  return { text: out, normalized };
}

export type FreeStarterSectionNormalizeResult = {
  text: string;
  fixedHeadingBodyCollapse: number;
  fixedNullLeakage: number;
  fixedRoleLabels: number;
};

const STARTER_SECTION_GLUE_PATTERNS: RegExp[] = [
  /^(\d+\.\s+Scope of Services\s*\/\s*Purpose)\s+(.+)$/i,
  /^(\d+\.\s+Payment Terms)\s+(.+)$/i,
  /^(\d+\.\s+Services Term and Effective Date)\s+(.+)$/i,
  /^(\d+\.\s+Term and Effective Date)\s+(.+)$/i,
  /^(\d+\.\s+Governing Law)\s+(.+)$/i,
  /^(\d+\.\s+Termination)\s+(.+)$/i,
  /^(\d+\.\s+Additional Terms)\s+(.+)$/i,
];

function isTestModeForSectionLog(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logFreeStarterSectionRenderNormalized(payload: {
  fixedHeadingBodyCollapse: number;
  fixedNullLeakage: number;
  fixedRoleLabels: number;
  finalLen: number;
}): void {
  if (isTestModeForSectionLog()) return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-section-render-normalized]", payload);
}

function splitGluedStarterSectionLine(line: string): { lines: string[]; fixed: number } {
  const trimmed = line.trim();
  if (!trimmed) return { lines: [line], fixed: 0 };

  for (const pattern of STARTER_SECTION_GLUE_PATTERNS) {
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
  return text.replace(/^(\d+\.\s+[^\n]{3,100})\n(?!\n)(?!\d+\.)([^\n]+)/gm, "$1\n\n$2");
}

function repairFreeStarterRecitalRoleLabels(text: string): { text: string; fixed: number } {
  let out = text;
  let fixed = 0;

  const betweenTwoParty = out.match(
    /(\bbetween\s+)(.+?)\s+\((["“']?)([^)"”']+)\3\)\s+and\s+(.+?)\s+\((["“']?)([^)"”']+)\6\)/i,
  );
  if (betweenTwoParty) {
    const role1 = betweenTwoParty[4].trim();
    const role2 = betweenTwoParty[7].trim();
    if (
      (isSignerTitleLikeRole(role1) && !isAgreementRoleLabel(role1)) ||
      (isSignerTitleLikeRole(role2) && !isAgreementRoleLabel(role2))
    ) {
      const replacement = `${betweenTwoParty[1]}${betweenTwoParty[2].trim()} ("Client") and ${betweenTwoParty[5].trim()} ("Service Provider")`;
      out = out.replace(betweenTwoParty[0], replacement);
      fixed += 1;
    }
  }

  const listTwoParty = out.match(
    /(^|\n)(.+?)\s+\((["“']?)([^)"”']+)\3\)\s+and\s+(.+?)\s+\((["“']?)([^)"”']+)\6\)/i,
  );
  if (listTwoParty && fixed === 0) {
    const role1 = listTwoParty[4].trim();
    const role2 = listTwoParty[7].trim();
    if (
      (isSignerTitleLikeRole(role1) && !isAgreementRoleLabel(role1)) ||
      (isSignerTitleLikeRole(role2) && !isAgreementRoleLabel(role2))
    ) {
      const prefix = listTwoParty[1] || "";
      const replacement = `${prefix}${listTwoParty[2].trim()} ("Client") and ${listTwoParty[5].trim()} ("Service Provider")`;
      out = out.replace(listTwoParty[0], replacement);
      fixed += 1;
    }
  }

  return { text: out, fixed };
}

function resolveVisibleTerm(
  text: string,
  intake: string,
  draft: ParsedDraftShape | null,
): string {
  const fromDraft = String(draft?.duration ?? "").trim();
  if (fromDraft && !isInvalidVisibleScheduleValue(fromDraft)) return fromDraft;
  const fromIntake = extractTermDurationFromIntake(intake);
  if (fromIntake) return fromIntake;
  const fromBody = text.match(/\bTerm:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
  if (fromBody && !isInvalidVisibleScheduleValue(fromBody)) return fromBody;
  return "";
}

function repairFreeStarterNullLeakage(
  text: string,
  intake: string,
  draft: ParsedDraftShape | null,
): { text: string; fixed: number } {
  let out = text;
  let fixed = 0;
  const term = resolveVisibleTerm(out, intake, draft);

  if (/\buntil\s+null\b/i.test(out) || /\bTerm:\s*null\b/i.test(out)) {
    if (term) {
      out = out.replace(/\bTerm:\s*until\s+null\b/gi, `Term: ${term}`);
      out = out.replace(/\buntil\s+null\b/gi, term);
    } else {
      out = out.replace(/\bTerm:\s*until\s+null\.?\s*/gi, "");
      out = out.replace(/\s*\buntil\s+null\b\.?/gi, "");
    }
    fixed += 1;
  }

  if (/\bnull\b/i.test(out)) {
    const before = out;
    out = out.replace(/\bTerm:\s*null\b/gi, term ? `Term: ${term}` : "");
    out = out.replace(/\b(null|undefined)\b/gi, "");
    out = out.replace(/\[object Object\]/gi, "");
    if (out !== before) fixed += 1;
  }

  out = out.replace(/\n{3,}/g, "\n\n");
  return { text: out.trimEnd(), fixed };
}

/** Normalize visible Free Starter body after identity/payment repair. */
export function normalizeFreeStarterSectionRender(
  text: string,
  opts?: { intake?: string; draft?: ParsedDraftShape | null },
): FreeStarterSectionNormalizeResult {
  const intake = String(opts?.intake ?? "").trim();
  const draft = opts?.draft ?? null;

  let fixedHeadingBodyCollapse = 0;
  let out = repairInlineCollapsedStarterLayout(text || "");

  const expanded: string[] = [];
  for (const line of out.split("\n")) {
    const split = splitGluedStarterSectionLine(line);
    fixedHeadingBodyCollapse += split.fixed;
    expanded.push(...split.lines);
  }
  out = expanded.join("\n");

  const roleFix = repairFreeStarterRecitalRoleLabels(out);
  out = roleFix.text;
  const fixedRoleLabels = roleFix.fixed;

  const nullFix = repairFreeStarterNullLeakage(out, intake, draft);
  out = nullFix.text;
  const fixedNullLeakage = nullFix.fixed;

  const labelFix = normalizeFreeStarterCollapsedLabelLines(out);
  out = labelFix.text;
  fixedHeadingBodyCollapse += labelFix.normalized;

  out = formatStarterPreviewForDisplay(out);
  out = ensureHeadingBodySpacing(out);

  const result: FreeStarterSectionNormalizeResult = {
    text: out.trim(),
    fixedHeadingBodyCollapse,
    fixedNullLeakage,
    fixedRoleLabels,
  };

  logFreeStarterSectionRenderNormalized({
    fixedHeadingBodyCollapse: result.fixedHeadingBodyCollapse,
    fixedNullLeakage: result.fixedNullLeakage,
    fixedRoleLabels: result.fixedRoleLabels,
    finalLen: result.text.length,
  });

  return result;
}

export function mapStarterPartyRolesForDisplay(
  parties: Array<{ name?: string; role?: string }>,
  partyCount: number,
): Array<{ name: string; role: string }> {
  return parties.map((party, index) => {
    const name = String(party?.name ?? "").trim();
    const role = normalizeRoleLabelToken(party?.role);
    if (!name) return { name: "", role: "party" };
    if (isAgreementRoleLabel(role)) return { name, role };
    if (isSignerTitleLikeRole(role) || !role || role.toLowerCase() === "party") {
      return { name, role: starterCommercialRoleForIndex(index, partyCount) };
    }
    return { name, role };
  });
}
