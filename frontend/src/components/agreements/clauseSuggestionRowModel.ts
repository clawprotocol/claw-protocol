/**
 * Merges context-ranked, preview smart, and generic main-clause suggestions into one row (max 3).
 */

import type { ContextClauseFamily, ContextRankedSuggestion } from "./intakeContextAutoSuggestions";
import type { MainClauseSuggestion } from "./intakeMainClauseSuggestions";
import type { LivePreviewSmartSuggestion } from "./livePreviewSmartSuggestions";

export const INTAKE_CLAUSE_SUGGESTION_ROW_MAX = 3;

export type IntakeClauseSuggestionRowItem =
  | { kind: "context"; suggestion: ContextRankedSuggestion }
  | { kind: "smart"; suggestion: LivePreviewSmartSuggestion }
  | { kind: "main"; suggestion: MainClauseSuggestion };

const FAMILY_CHIP: Partial<Record<ContextClauseFamily, string>> = {
  governing_law: "Governing law",
  termination: "Termination",
  ip_ownership: "IP ownership",
  confidentiality_duration: "Confidentiality term",
  late_fee: "Late fee",
  payment_due: "Payment timing",
  invoice_terms: "Invoice terms",
  return_destroy: "Return / destroy",
  dispute_resolution: "Dispute resolution",
  independent_contractor: "Contractor status",
  scope_detail: "Scope detail",
  work_for_hire: "Work for hire",
  deliverables: "Deliverables",
};

function stripQuestion(s: string): string {
  return s.replace(/\s*\?\s*$/, "").trim();
}

export function chipLabelForContext(s: ContextRankedSuggestion): string {
  const mapped = FAMILY_CHIP[s.clauseFamily];
  if (mapped) return mapped;
  const t = stripQuestion(s.label);
  return t.length > 40 ? `${t.slice(0, 37)}…` : t;
}

export function chipLabelForMain(m: MainClauseSuggestion): string {
  return m.label.replace(/^Add\s+/i, "").replace(/\s+clause$/i, "").trim() || m.label;
}

export function chipLabelForSmart(s: LivePreviewSmartSuggestion): string {
  return s.label.replace(/^Add\s+/i, "").trim() || s.label;
}

export function chipLabelForRowItem(item: IntakeClauseSuggestionRowItem): string {
  if (item.kind === "context") return chipLabelForContext(item.suggestion);
  if (item.kind === "main") return chipLabelForMain(item.suggestion);
  return chipLabelForSmart(item.suggestion);
}

export function tooltipForRowItem(item: IntakeClauseSuggestionRowItem): string {
  if (item.kind === "context") {
    const s = item.suggestion;
    const body = s.clauseText.replace(/\s+/g, " ").trim();
    const lead = stripQuestion(s.label);
    return body.length > 220 ? `${lead}\n\n${body.slice(0, 217)}…` : `${lead}\n\n${body}`;
  }
  const append = item.kind === "main" ? item.suggestion.append : item.suggestion.append;
  const label = item.kind === "main" ? item.suggestion.label : item.suggestion.label;
  const body = append.replace(/\s+/g, " ").trim();
  const intro = stripQuestion(label);
  return body.length > 240 ? `${intro}\n\n${body.slice(0, 237)}…` : `${intro}\n\n${body}`;
}

function smartBlocksMainId(s: LivePreviewSmartSuggestion): string | null {
  if (s.id === "suggest-late-fee") return "late_fee";
  if (s.id === "suggest-governing-law") return "governing_law";
  if (s.id === "suggest-termination-notice") return "termination";
  return null;
}

/**
 * Priority: unused context (rank order) → unused smart → unused main, deduping main ids.
 */
export function buildIntakeClauseSuggestionRowItems(opts: {
  contextTop: readonly ContextRankedSuggestion[];
  smart: readonly LivePreviewSmartSuggestion[];
  mains: readonly MainClauseSuggestion[];
  usedContextIds: ReadonlySet<string>;
  usedSmartIds: ReadonlySet<string>;
  usedMainIds: ReadonlySet<string>;
}): IntakeClauseSuggestionRowItem[] {
  const out: IntakeClauseSuggestionRowItem[] = [];
  const skipMainIds = new Set<string>();

  for (const s of opts.contextTop) {
    if (opts.usedContextIds.has(s.id)) continue;
    out.push({ kind: "context", suggestion: s });
    if (s.syncMainClauseId) skipMainIds.add(s.syncMainClauseId);
    if (out.length >= INTAKE_CLAUSE_SUGGESTION_ROW_MAX) return out;
  }

  for (const s of opts.smart) {
    if (out.length >= INTAKE_CLAUSE_SUGGESTION_ROW_MAX) break;
    if (opts.usedSmartIds.has(s.id)) continue;
    out.push({ kind: "smart", suggestion: s });
    const block = smartBlocksMainId(s);
    if (block) skipMainIds.add(block);
  }

  for (const m of opts.mains) {
    if (out.length >= INTAKE_CLAUSE_SUGGESTION_ROW_MAX) break;
    if (opts.usedMainIds.has(m.id)) continue;
    if (skipMainIds.has(m.id)) continue;
    out.push({ kind: "main", suggestion: m });
  }

  return out.slice(0, INTAKE_CLAUSE_SUGGESTION_ROW_MAX);
}
