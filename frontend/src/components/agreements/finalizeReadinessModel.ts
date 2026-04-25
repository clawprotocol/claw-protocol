import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumCompletenessRow } from "./premiumReviewCompleteness";
import type { PremiumRefineResponse, SuggestedNextStep } from "./premiumRefineApi";
import { scanDocumentPlaceholderLines } from "./documentPlaceholderScan";

export type FinalizeReadiness = "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature";

const READINESS_COPY: Record<FinalizeReadiness, string> = {
  needs_details: "Needs details",
  good_draft: "Good draft",
  ready_for_review: "Ready for review",
  ready_for_signature: "Ready for signature",
};

export function formatFinalizeReadiness(r: FinalizeReadiness): string {
  return READINESS_COPY[r];
}

function mergePlaceholderSources(auditPlaceholders: string[] | undefined, documentText: string): string[] {
  const fromScan = scanDocumentPlaceholderLines(documentText, 5);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const x of auditPlaceholders || []) {
    if (out.length >= 5) break;
    add(x);
  }
  for (const x of fromScan) {
    if (out.length >= 5) break;
    add(x);
  }
  return out;
}

/**
 * Max 3 lines, priority: audit deal terms → placeholder (audit + scan) → premium review → checklist.
 */
export function buildFinalizeMissingLinesPriority(
  audit: PremiumFinalizeAudit | null,
  documentText: string,
  review: PremiumAgreementReview | null,
  rows: PremiumCompletenessRow[],
  max = 3,
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  if (audit) {
    for (const x of audit.deal_specific_missing_terms) {
      if (out.length >= max) break;
      add(x);
    }
  }
  const mergedPh = mergePlaceholderSources(audit?.placeholder_terms_found, documentText);
  for (const x of mergedPh) {
    if (out.length >= max) break;
    add(x);
  }
  if (review) {
    for (const x of review.missing_or_weak_terms || []) {
      if (out.length >= max) break;
      add(x);
    }
    for (const x of review.questions_for_user || []) {
      if (out.length >= max) break;
      add(x);
    }
    for (const x of review.suggested_clause_upgrades || []) {
      if (out.length >= max) break;
      add(x);
    }
  }
  for (const r of rows) {
    if (out.length >= max) break;
    if (!r.ok) add(r.hint ? `${r.label} — ${r.hint}` : r.label);
  }
  return out.slice(0, max);
}

/** @deprecated use buildFinalizeMissingLinesPriority */
export function buildFinalizeMissingLines(
  review: PremiumAgreementReview | null,
  rows: PremiumCompletenessRow[],
  max = 3,
): string[] {
  return buildFinalizeMissingLinesPriority(null, "", review, rows, max);
}

function countAuditBlockers(audit: PremiumFinalizeAudit | null, documentText: string): {
  deal: number;
  ph: number;
} {
  const d = (audit?.deal_specific_missing_terms || []).length;
  const p = mergePlaceholderSources(audit?.placeholder_terms_found, documentText).length;
  return { deal: d, ph: p };
}

export function resolveFinalizeReadiness(args: {
  sendMode: "review" | "signature";
  sendModeTouched: boolean;
  notOkCount: number;
  priorityScore: number;
  lastRefine: Pick<PremiumRefineResponse, "suggested_next_step" | "readiness_score"> | null;
  audit: PremiumFinalizeAudit | null;
  documentText: string;
}): FinalizeReadiness {
  const { deal, ph } = countAuditBlockers(args.audit, args.documentText);
  const blockerCount = deal + ph;

  if (args.sendModeTouched) {
    if (args.sendMode === "review") {
      return "ready_for_review";
    }
    if (args.sendMode === "signature") {
      if (blockerCount >= 1) {
        if (ph >= 1) {
          return "needs_details";
        }
        if (blockerCount >= 3) {
          return "needs_details";
        }
        return "good_draft";
      }
      if (args.audit?.best_next_step === "edit" && args.audit?.confidence === "low") {
        return "good_draft";
      }
      if (args.audit == null) {
        return "ready_for_signature";
      }
      if (args.audit.best_next_step === "send" && (args.audit.confidence === "high" || args.audit.confidence === "medium")) {
        return "ready_for_signature";
      }
      if (args.audit.best_next_step === "review" || args.audit.confidence === "low") {
        return "ready_for_review";
      }
      if (args.audit.best_next_step === "edit") {
        return "ready_for_review";
      }
      return "ready_for_signature";
    }
  }

  if (blockerCount >= 1) {
    if (ph >= 1) {
      if (ph >= 2 || deal + ph >= 3) return "needs_details";
      return "good_draft";
    }
    if (deal >= 1) {
      if (blockerCount >= 3) return "needs_details";
      return "good_draft";
    }
  }

  if (args.audit && blockerCount === 0) {
    if (args.audit.best_next_step === "edit") {
      if (args.audit.confidence === "high") {
        return "good_draft";
      }
      return "ready_for_review";
    }
    if (args.audit.best_next_step === "review") {
      return "ready_for_review";
    }
    if (args.audit.best_next_step === "send" && args.audit.confidence === "high") {
      return "ready_for_signature";
    }
    if (args.audit.best_next_step === "send") {
      return "ready_for_review";
    }
  }

  const lr = args.lastRefine;
  if (lr) {
    const step: SuggestedNextStep = lr.suggested_next_step;
    if (step === "send" && lr.readiness_score >= 78) {
      return "ready_for_signature";
    }
    if (step === "send") {
      return "ready_for_review";
    }
    if (step === "review") {
      return "ready_for_review";
    }
    if (step === "edit") {
      return "needs_details";
    }
  }
  if (args.notOkCount >= 3 || args.priorityScore >= 62) {
    return "needs_details";
  }
  if (args.notOkCount >= 1 || args.priorityScore >= 38) {
    return "good_draft";
  }
  return "ready_for_review";
}

export function finalizeTagline(missingCount: number, readiness: FinalizeReadiness): string {
  if (readiness === "ready_for_signature") {
    return "You chose the signature path — add tweaks below if you need them.";
  }
  if (readiness === "ready_for_review") {
    return missingCount > 0
      ? "Close the remaining gaps, then move to review when you are ready."
      : "Strong draft — move to review or signature when you are ready.";
  }
  if (readiness === "good_draft") {
    return missingCount > 0 ? "A few things to double-check before you continue." : "Strong draft created.";
  }
  return missingCount > 0
    ? "Tighten the items below, then update the agreement or pick a path."
    : "Strong draft created.";
}
