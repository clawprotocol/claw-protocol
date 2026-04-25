/**
 * Short “what we understood” bullets from live preview heuristics (max 4).
 */

import type { LivePreviewInlineField, LivePreviewModel } from "./liveDraftHeuristics";
import { getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";

export type UnderstoodBulletKind = "parties" | "type" | "payment" | "scope" | "term";

export type UnderstoodBullet = {
  kind: UnderstoodBulletKind;
  label: string;
  /** Truncated for display */
  displayValue: string;
  /** Full value for labeled-line commit */
  commitValue: string;
  inlineField?: LivePreviewInlineField;
  /** Low-confidence extraction — show “Needs confirmation” in UI. */
  needsConfirmation?: boolean;
};

/** Local quick-check confirms — clear “Needs confirmation” without waiting for re-parse. */
export type WeCapturedQuickCheckConfirmed = {
  parties?: boolean;
  scope?: boolean;
  term?: boolean;
};

const MAX_DISPLAY = 88;

function truncate(s: string, max = MAX_DISPLAY): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function paymentDisplayAndCommit(model: LivePreviewModel): { display: string; commit: string } | null {
  const sched = model.scheduleLine?.trim();
  const comp = model.compensationLine?.trim();
  const cad = model.payment?.cadence?.toLowerCase() ?? null;

  if (sched) {
    if (/monthly/i.test(sched)) return { display: "Monthly", commit: sched };
    if (/weekly/i.test(sched)) return { display: "Weekly", commit: sched };
    return { display: truncate(sched, 52), commit: sched };
  }
  if (comp) {
    return { display: truncate(comp, 52), commit: comp };
  }
  if (cad === "monthly") return { display: "Monthly", commit: "Monthly" };
  if (cad === "weekly") return { display: "Weekly", commit: "Weekly" };
  if (cad === "daily") return { display: "Daily", commit: "Daily" };
  if (cad === "quarterly") return { display: "Quarterly", commit: "Quarterly" };
  if (cad === "annually") return { display: "Annual", commit: "Annual" };
  return null;
}

/**
 * Parties → Type → Payment → Scope → Term, capped at four bullets.
 */
export function buildWhatWeUnderstoodBullets(model: LivePreviewModel): UnderstoodBullet[] {
  const slots: UnderstoodBullet[] = [];

  const partiesFull = model.partiesStructured
    ? `${model.partiesStructured.party_1} and ${model.partiesStructured.party_2}`
    : (model.partiesLine || "").trim();
  if (partiesFull) {
    slots.push({
      kind: "parties",
      label: "Parties",
      displayValue: truncate(partiesFull, 96),
      commitValue: partiesFull,
      inlineField: "Parties",
    });
  }

  const dt = (model.docTitle || "").trim();
  if (dt && dt !== "Agreement") {
    slots.push({
      kind: "type",
      label: "Type",
      displayValue: dt,
      commitValue: dt,
    });
  }

  const pay = paymentDisplayAndCommit(model);
  if (pay) {
    slots.push({
      kind: "payment",
      label: "Payment",
      displayValue: pay.display,
      commitValue: pay.commit,
      inlineField: "Payment",
    });
  }

  const scopeFull = (model.scopeLine || model.servicesLine || "").trim();
  if (scopeFull) {
    slots.push({
      kind: "scope",
      label: "Scope",
      displayValue: truncate(scopeFull),
      commitValue: scopeFull,
      inlineField: "Scope",
    });
  }

  const termFull = (model.termLine || "").trim();
  if (termFull) {
    slots.push({
      kind: "term",
      label: "Term",
      displayValue: truncate(termFull, 56),
      commitValue: termFull,
      inlineField: "Term",
    });
  }

  return slots.slice(0, 4);
}

/**
 * Compact “We captured” summary: canonical agreement type + parties, payment, scope, term only.
 * Type label is single-sourced from guided flow routing (not raw docTitle alone).
 */
export function buildWeCapturedSummaryBullets(
  raw: string,
  model: LivePreviewModel,
  quickCheckConfirmed?: WeCapturedQuickCheckConfirmed | null,
): UnderstoodBullet[] {
  const slots: UnderstoodBullet[] = [];
  const qc = quickCheckConfirmed ?? undefined;
  const canon = getCanonicalAgreementTypeForCreate(raw, model);
  slots.push({
    kind: "type",
    label: canon.isSuggested ? "Suggested agreement type" : "Agreement type",
    displayValue: canon.isSuggested ? `Suggested type: ${canon.headline}` : canon.headline,
    commitValue: canon.headline,
    needsConfirmation: canon.isSuggested,
  });

  const partiesFull = model.partiesStructured
    ? `${model.partiesStructured.party_1} and ${model.partiesStructured.party_2}`
    : (model.partiesLine || "").trim();
  if (partiesFull) {
    slots.push({
      kind: "parties",
      label: "Parties",
      displayValue: truncate(partiesFull, 96),
      commitValue: partiesFull,
      inlineField: "Parties",
      needsConfirmation: Boolean(model.partiesUncertain) && !qc?.parties,
    });
  }

  const pay = paymentDisplayAndCommit(model);
  if (pay) {
    slots.push({
      kind: "payment",
      label: "Payment",
      displayValue: pay.display,
      commitValue: pay.commit,
      inlineField: "Payment",
    });
  }

  const scopeFull = (model.scopeLine || model.servicesLine || "").trim();
  if (scopeFull) {
    const ex = model.extraction;
    const lowScope =
      Boolean(ex?.scopeInferred) || (ex && ex.scopeConfidence < 0.72) || (ex && ex.scopeSignalPresent && ex.scopeConfidence < 0.78);
    slots.push({
      kind: "scope",
      label: "Scope",
      displayValue: truncate(scopeFull),
      commitValue: scopeFull,
      inlineField: "Scope",
      needsConfirmation: lowScope && !qc?.scope,
    });
  }

  const termFull = (model.termLine || model.scheduleLine || "").trim();
  if (termFull) {
    const ex = model.extraction;
    const lowTerm = Boolean(ex?.termInferred) || (ex && ex.termConfidence < 0.72);
    slots.push({
      kind: "term",
      label: "Term",
      displayValue: truncate(termFull, 56),
      commitValue: termFull,
      inlineField: "Term",
      needsConfirmation: lowTerm && !qc?.term,
    });
  }

  return slots;
}
