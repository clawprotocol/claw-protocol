/**
 * Compact “What LawDog understood” checkpoint from live preview + structured extraction.
 * Confidence stays internal — customer labels are Confirmed / Inferred / Still needed.
 */

import type { LivePreviewInlineField, LivePreviewModel } from "./liveDraftHeuristics";
import { getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";

export type UnderstoodBulletKind = "parties" | "type" | "payment" | "scope" | "term" | "special";

export type UnderstoodProvenance = "confirmed" | "inferred" | "still_needed";

export const UNDERSTOOD_PROVENANCE_LABEL: Record<UnderstoodProvenance, string> = {
  confirmed: "Confirmed from your description",
  inferred: "Inferred—please check",
  still_needed: "Still needed",
};

export type UnderstoodBullet = {
  kind: UnderstoodBulletKind;
  label: string;
  /** Truncated for display */
  displayValue: string;
  /** Full value for labeled-line commit */
  commitValue: string;
  inlineField?: LivePreviewInlineField;
  /** Low-confidence extraction — show “Inferred—please check” in UI. */
  needsConfirmation?: boolean;
  provenance: UnderstoodProvenance;
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

function partiesDisplayFromModel(raw: string, model: LivePreviewModel): string {
  const structured = parseIntakeToStructuredAgreement(raw);
  if (structured.parties.length >= 2) {
    if (structured.parties.length === 2) return `${structured.parties[0]} and ${structured.parties[1]}`;
    const head = structured.parties.slice(0, -1).join(", ");
    return `${head}, and ${structured.parties[structured.parties.length - 1]}`;
  }
  if (model.partiesStructured) {
    return `${model.partiesStructured.party_1} and ${model.partiesStructured.party_2}`;
  }
  return (model.partiesLine || "").trim();
}

function provenanceFor(args: {
  hasValue: boolean;
  inferred?: boolean;
  confirmed?: boolean;
}): UnderstoodProvenance {
  if (!args.hasValue) return "still_needed";
  if (args.confirmed) return "confirmed";
  if (args.inferred) return "inferred";
  return "confirmed";
}

/**
 * Parties → Type → Payment → Scope → Term, capped at four bullets (legacy compact).
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
      provenance: "confirmed",
    });
  }

  const dt = (model.docTitle || "").trim();
  if (dt && dt !== "Agreement") {
    slots.push({
      kind: "type",
      label: "Type",
      displayValue: dt,
      commitValue: dt,
      provenance: "confirmed",
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
      provenance: "confirmed",
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
      provenance: "confirmed",
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
      provenance: "confirmed",
    });
  }

  return slots.slice(0, 4);
}

function bullet(
  kind: UnderstoodBulletKind,
  label: string,
  display: string,
  commit: string,
  provenance: UnderstoodProvenance,
  inlineField?: LivePreviewInlineField,
): UnderstoodBullet {
  return {
    kind,
    label,
    displayValue: display,
    commitValue: commit,
    inlineField,
    needsConfirmation: provenance === "inferred",
    provenance,
  };
}

/**
 * Compact “What LawDog understood” summary: type, parties, scope, payment, timing, special terms.
 */
export function buildWeCapturedSummaryBullets(
  raw: string,
  model: LivePreviewModel,
  quickCheckConfirmed?: WeCapturedQuickCheckConfirmed | null,
): UnderstoodBullet[] {
  const slots: UnderstoodBullet[] = [];
  const qc = quickCheckConfirmed ?? undefined;
  const canon = getCanonicalAgreementTypeForCreate(raw, model);
  const structured = parseIntakeToStructuredAgreement(raw);
  slots.push(
    bullet(
      "type",
      canon.isSuggested ? "Suggested agreement type" : "Agreement type",
      canon.isSuggested ? `Suggested type: ${canon.headline}` : canon.headline,
      canon.headline,
      provenanceFor({ hasValue: Boolean(canon.headline), inferred: canon.isSuggested }),
    ),
  );

  const partiesFull = partiesDisplayFromModel(raw, model);
  slots.push(
    bullet(
      "parties",
      "Contracting parties",
      partiesFull ? truncate(partiesFull, 96) : "Still needed",
      partiesFull,
      provenanceFor({
        hasValue: Boolean(partiesFull),
        inferred: Boolean(model.partiesUncertain) && !qc?.parties,
        confirmed: Boolean(partiesFull) && (!model.partiesUncertain || Boolean(qc?.parties)),
      }),
      "Parties",
    ),
  );

  const scopeFull = (model.scopeLine || model.servicesLine || structured.scope || "").trim();
  const ex = model.extraction;
  const lowScope =
    Boolean(ex?.scopeInferred) || (ex && ex.scopeConfidence < 0.72) || (ex && ex.scopeSignalPresent && ex.scopeConfidence < 0.78);
  slots.push(
    bullet(
      "scope",
      "Scope",
      scopeFull ? truncate(scopeFull) : "Still needed",
      scopeFull,
      provenanceFor({
        hasValue: Boolean(scopeFull),
        inferred: Boolean(lowScope) && !qc?.scope,
        confirmed: Boolean(scopeFull) && (!lowScope || Boolean(qc?.scope)),
      }),
      "Scope",
    ),
  );

  const pay = paymentDisplayAndCommit(model);
  const payValue = pay?.display || structured.payment.trim();
  slots.push(
    bullet(
      "payment",
      "Payment",
      payValue ? truncate(payValue, 52) : "Still needed",
      pay?.commit || payValue,
      provenanceFor({ hasValue: Boolean(payValue) }),
      "Payment",
    ),
  );

  const termFull = (model.termLine || model.scheduleLine || structured.term || "").trim();
  const lowTerm = Boolean(ex?.termInferred) || (ex && ex.termConfidence < 0.72);
  slots.push(
    bullet(
      "term",
      "Timing",
      termFull ? truncate(termFull, 56) : "Still needed",
      termFull,
      provenanceFor({
        hasValue: Boolean(termFull),
        inferred: Boolean(lowTerm) && !qc?.term,
        confirmed: Boolean(termFull) && (!lowTerm || Boolean(qc?.term)),
      }),
      "Term",
    ),
  );

  const special = (model.obligationsLine || structured.confidentiality || structured.termination || "").trim();
  slots.push(
    bullet(
      "special",
      "Important special terms",
      special ? truncate(special) : "Still needed",
      special,
      provenanceFor({ hasValue: Boolean(special) }),
    ),
  );

  return slots;
}
