import type { AgreementDraft } from "./agreementTypes";
import type { LivePreviewModel } from "../components/agreements/liveDraftHeuristics";

export type AgreementReadinessLevel = "early" | "usable" | "ready";

export type ReadinessChecklistState = "done" | "needs_detail" | "optional_next";

export type ReadinessChecklistRow = {
  id: string;
  label: string;
  state: ReadinessChecklistState;
  hint?: string;
};

export type AgreementReadinessResult = {
  level: AgreementReadinessLevel;
  score: number;
  maxScore: number;
  missingSignals: string[];
  strengths: string[];
  suggestions: string[];
  checklistRows: ReadinessChecklistRow[];
};

const NA_PAYMENT = /\b(no payment|n\/a|not applicable|none|unpaid|pro bono|gratis|no fee|without payment)\b/i;

function hasPaymentSignal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (NA_PAYMENT.test(t)) return true;
  if (/\$\s*[\d,]+|[\d,]+\s*(usd|eur|gbp|mo|month|yr|year|hour)/i.test(t)) return true;
  if (t.length >= 12 && /\b(pay|fee|invoice|compensat|amount|deposit|retainer)\b/i.test(t)) return true;
  return t.length >= 8;
}

function hasTimingSignal(draft: AgreementDraft): boolean {
  return Boolean(
    (draft.duration || "").trim() ||
      (draft.due_date || "").trim() ||
      (draft.effective_date || "").trim(),
  );
}

function partiesNamed(draft: AgreementDraft): boolean {
  const ps = draft.parties || [];
  if (ps.length < 2) return false;
  return ps.slice(0, 2).every((p) => (p.name || "").trim().length >= 2);
}

function titleLooksFilled(draft: AgreementDraft): boolean {
  const t = (draft.title || "").trim();
  if (t.length < 4) return false;
  if (/^agreement$/i.test(t)) return (draft.purpose || "").trim().length >= 24;
  return true;
}

function jurisdictionFilled(draft: AgreementDraft): boolean {
  const j = (draft.jurisdiction || "").trim();
  if (!j) return false;
  return !/^tbd$/i.test(j);
}

/** Product workflow signals only — not legal sufficiency. */
export function computeAgreementDraftReadiness(draft: AgreementDraft | null): AgreementReadinessResult {
  const missingSignals: string[] = [];
  const strengths: string[] = [];
  const suggestions: string[] = [];
  const checklistRows: ReadinessChecklistRow[] = [];

  if (!draft) {
    return {
      level: "early",
      score: 0,
      maxScore: 6,
      missingSignals: ["draft"],
      strengths: [],
      suggestions: [],
      checklistRows: [],
    };
  }

  let score = 0;
  const maxScore = 6;

  const titleOk = titleLooksFilled(draft);
  if (titleOk) {
    score += 1;
    strengths.push("title");
  } else {
    missingSignals.push("title");
    suggestions.push("Consider giving this agreement a short, specific title.");
  }
  checklistRows.push({
    id: "title",
    label: "Title / agreement type",
    state: titleOk ? "done" : "needs_detail",
  });

  const partiesOk = partiesNamed(draft);
  if (partiesOk) {
    score += 1;
    strengths.push("parties");
  } else {
    missingSignals.push("parties");
    suggestions.push("Consider naming both parties more clearly.");
  }
  checklistRows.push({
    id: "parties",
    label: "Parties identified",
    state: partiesOk ? "done" : "needs_detail",
  });

  const purposeOk = (draft.purpose || "").trim().length >= 16;
  if (purposeOk) {
    score += 1;
    strengths.push("scope");
  } else {
    missingSignals.push("scope");
    suggestions.push("Consider adding a bit more scope or purpose language.");
  }
  checklistRows.push({
    id: "scope",
    label: "Scope captured",
    state: purposeOk ? "done" : "needs_detail",
  });

  const payOk = hasPaymentSignal(draft.payment_terms || "");
  if (payOk) {
    score += 1;
    strengths.push("payment");
  } else {
    missingSignals.push("payment");
    suggestions.push("Consider clarifying payment terms, or note if there is no payment.");
  }
  checklistRows.push({
    id: "payment",
    label: "Payment terms noted",
    state: payOk ? "done" : "needs_detail",
    hint: "Helpful before send",
  });

  const timingOk = hasTimingSignal(draft);
  if (timingOk) {
    score += 1;
    strengths.push("timing");
  } else {
    missingSignals.push("timing");
    suggestions.push("Consider adding timing or duration.");
    if ((draft.purpose || "").trim().length > 72) {
      suggestions.push("Consider adding a termination or end condition.");
    }
  }
  checklistRows.push({
    id: "timing",
    label: "Timing / term captured",
    state: timingOk ? "done" : "needs_detail",
  });

  const jurisOk = jurisdictionFilled(draft);
  if (jurisOk) {
    score += 1;
    strengths.push("jurisdiction");
  } else {
    missingSignals.push("jurisdiction");
    suggestions.push("Consider noting governing law or jurisdiction.");
  }
  checklistRows.push({
    id: "jurisdiction",
    label: "Jurisdiction noted",
    state: jurisOk ? "done" : "needs_detail",
  });

  checklistRows.push({
    id: "signers",
    label: "Signers & send",
    state: "optional_next",
    hint: "Optional but recommended — next step after you continue.",
  });

  let level: AgreementReadinessLevel;
  if (score <= 2) level = "early";
  else if (score <= 4) level = "usable";
  else level = "ready";

  return {
    level,
    score,
    maxScore,
    missingSignals,
    strengths,
    suggestions,
    checklistRows,
  };
}

/** Heuristic readiness from intake text + live preview (create step). */
export function computeIntakeReadiness(intakeTrimmed: string, model: LivePreviewModel): AgreementReadinessResult {
  const missingSignals: string[] = [];
  const strengths: string[] = [];
  const suggestions: string[] = [];
  const checklistRows: ReadinessChecklistRow[] = [];
  const len = intakeTrimmed.length;

  let score = 0;
  const maxScore = 5;

  const titleOk = model.docTitle !== "Agreement" || len >= 80;
  if (titleOk && model.docTitle.trim().length > 2) {
    score += 1;
    strengths.push("type_signal");
  } else {
    missingSignals.push("type");
    if (len < 40) suggestions.push("A few more words help us reflect your agreement type.");
  }
  checklistRows.push({
    id: "title",
    label: "Agreement type signal",
    state: titleOk ? "done" : len >= 24 ? "needs_detail" : "needs_detail",
  });

  const partiesOk = Boolean((model.partiesLine || model.signerPlaceholdersLine || "").trim().length > 6);
  if (partiesOk) {
    score += 1;
    strengths.push("parties");
  } else {
    missingSignals.push("parties");
    suggestions.push("Consider naming both parties more clearly.");
  }
  checklistRows.push({
    id: "parties",
    label: "Parties identified",
    state: partiesOk ? "done" : "needs_detail",
  });

  const scopeOk =
    Boolean((model.scopeLine || model.servicesLine || "").trim().length > 6) ||
    Boolean(model.extraction?.scopeSignalPresent);
  if (scopeOk) {
    score += 1;
    strengths.push("scope");
  } else {
    missingSignals.push("scope");
    suggestions.push("Consider adding what needs to be done or delivered.");
  }
  checklistRows.push({
    id: "scope",
    label: model.extraction?.scopeInferred ? "Scope (review suggested)" : "Scope captured",
    state: scopeOk ? (model.extraction?.scopeInferred ? "needs_detail" : "done") : "needs_detail",
  });

  const payOk = hasPaymentSignal(`${model.compensationLine || ""} ${intakeTrimmed}`);
  if (payOk) {
    score += 1;
    strengths.push("payment");
  } else {
    missingSignals.push("payment");
    suggestions.push("Consider adding payment terms, or say there is no payment.");
  }
  checklistRows.push({
    id: "payment",
    label: "Payment terms noted",
    state: payOk ? "done" : "needs_detail",
    hint: "Helpful before send",
  });

  const timingOk =
    Boolean((model.termLine || model.scheduleLine || "").trim().length > 2) ||
    Boolean(model.extraction?.termSignalPresent);
  if (timingOk) {
    score += 1;
    strengths.push("timing");
  } else {
    missingSignals.push("timing");
    suggestions.push("Consider adding timing or duration.");
  }
  checklistRows.push({
    id: "timing",
    label: model.extraction?.termInferred ? "Timing (review suggested)" : "Timing / term captured",
    state: timingOk ? (model.extraction?.termInferred ? "needs_detail" : "done") : "needs_detail",
  });

  checklistRows.push({
    id: "signers",
    label: "Signers ready next",
    state: "optional_next",
    hint: "After your draft is generated",
  });

  let level: AgreementReadinessLevel;
  if (score <= 1 || len < 32) level = "early";
  else if (score <= 3) level = "usable";
  else level = "ready";

  return {
    level,
    score,
    maxScore,
    missingSignals,
    strengths,
    suggestions,
    checklistRows,
  };
}

export const READINESS_HEADLINES: Record<AgreementReadinessLevel, { title: string; subtitle: string }> = {
  early: {
    title: "Draft started",
    subtitle: "Good start — add detail if you want, or continue and refine on the next step.",
  },
  usable: {
    title: "Ready for review",
    subtitle: "The main terms are taking shape. Review the details, then continue when you're comfortable.",
  },
  ready: {
    title: "Ready for signature setup",
    subtitle: "This draft has the key product signals we look for before send.",
  },
};

export function readinessCtaHelper(level: AgreementReadinessLevel): string {
  if (level === "early") return "Continue when you’re ready — you can always add more on the next step.";
  if (level === "usable") return "Review details, then continue to signature setup.";
  return "You're ready to continue.";
}
