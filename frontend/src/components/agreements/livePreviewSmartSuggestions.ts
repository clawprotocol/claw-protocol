import type { LivePreviewModel } from "./liveDraftHeuristics";

export type LivePreviewSuggestionSection = "Parties" | "Term" | "Payment" | "Scope";

export type LivePreviewSmartSuggestion = {
  id: string;
  label: string;
  /** Appended to intake (new paragraph) — plain language clause stubs the user can edit on the left. */
  append: string;
  section: LivePreviewSuggestionSection;
};

const MAX_SUGGESTIONS = 3;

function hasGoverningLawMention(raw: string): boolean {
  return /\b(governing\s+law|jurisdiction|choice\s+of\s+law|laws\s+of\s+the\s+state|law\s+of\s+\w+|delaware|new\s+york|california|texas|florida|illinois|nevada|georgia|washington)\b/i.test(
    raw,
  );
}

function mentionsLatePaymentTerms(raw: string): boolean {
  return /\b(late\s+fee|past\s+due|overdue|interest\s+on\s+(unpaid|late)|penalt(y|ies)\s+for\s+late)\b/i.test(raw);
}

function mentionsPaymentMethod(raw: string): boolean {
  return /\b(ach|wire\s+transfer|wire|check|credit\s+card|debit|zelle|venmo|paypal|stripe|invoice\s+payment)\b/i.test(
    raw,
  );
}

function mentionsTermination(raw: string): boolean {
  return /\b(terminat(e|ion)|notice\s+period|either\s+party\s+may\s+end|for\s+cause|without\s+cause)\b/i.test(raw);
}

export function paymentLooksPresent(model: LivePreviewModel): boolean {
  return Boolean(
    model.scheduleLine?.trim() ||
      model.compensationLine?.trim() ||
      (model.payment.amount != null && model.payment.valid),
  );
}

export function termLooksPresent(model: LivePreviewModel): boolean {
  return Boolean(model.termLine?.trim());
}

export function partiesLookIncomplete(model: LivePreviewModel): boolean {
  if (model.signerPlaceholdersLine?.trim()) return true;
  if (model.partiesUncertain) return true;
  const p = model.partiesLine?.trim() || "";
  if (!p) return false;
  return /\[|your\s+company|other\s+party|tbd|\btodo\b|\?\]/i.test(p);
}

export function scopeLooksVague(model: LivePreviewModel): boolean {
  const s = (model.scopeLine || model.servicesLine || "").trim();
  if (!s) return false;
  if (s.length < 40) return true;
  if (/\b(stuff|things|various|misc|etc\.?|tbd|todo|xx|lorem)\b/i.test(s)) return true;
  if (/\[describe|\[insert|placeholder/i.test(s)) return true;
  return false;
}

export type BuildSmartSuggestionsOpts = {
  model: LivePreviewModel;
  rawIntake: string;
  /** Suggestion ids the user already applied — hide until refresh/natural drop. */
  usedIds?: ReadonlySet<string>;
};

/**
 * Context-aware clause stubs for the live preview (max 3). Kept short so the pane stays calm.
 */
export function buildLivePreviewSmartSuggestions(opts: BuildSmartSuggestionsOpts): LivePreviewSmartSuggestion[] {
  const { model, rawIntake } = opts;
  const used = opts.usedIds ?? new Set<string>();
  const raw = rawIntake.trim();
  if (raw.length < 24) return [];

  const candidates: LivePreviewSmartSuggestion[] = [];

  const hasAnchorRow = Boolean(
    model.partiesLine?.trim() || model.signerPlaceholdersLine?.trim() || model.termLine?.trim(),
  );
  if (!hasGoverningLawMention(raw) && hasAnchorRow) {
    const section: LivePreviewSuggestionSection = model.termLine?.trim() ? "Term" : "Parties";
    candidates.push({
      id: "suggest-governing-law",
      section,
      label: "Add governing law",
      append:
        "Governing law: This agreement is governed by the laws of [State], without regard to conflict-of-law rules.",
    });
  }

  if (partiesLookIncomplete(model) && (model.partiesLine?.trim() || model.signerPlaceholdersLine?.trim())) {
    candidates.push({
      id: "suggest-party-legal-names",
      section: "Parties",
      label: "Use legal entity names",
      append:
        "Parties: [Legal name 1] (“[Short name 1]”) and [Legal name 2] (“[Short name 2]”), each a party to this agreement.",
    });
  }

  if (paymentLooksPresent(model)) {
    if (!mentionsLatePaymentTerms(raw)) {
      candidates.push({
        id: "suggest-late-fee",
        section: "Payment",
        label: "Add late fee",
        append:
          "Late payment: Overdue amounts accrue interest at 1.5% per month (or the maximum rate permitted by law, whichever is lower) until paid in full.",
      });
    }
    if (!mentionsPaymentMethod(raw)) {
      candidates.push({
        id: "suggest-payment-method",
        section: "Payment",
        label: "Add payment method",
        append: "Payment method: Invoices are payable by ACH or wire transfer to the account designated on each invoice unless otherwise agreed in writing.",
      });
    }
  }

  if (scopeLooksVague(model)) {
    candidates.push({
      id: "suggest-scope-detail",
      section: "Scope",
      label: "Sharpen scope",
      append:
        "Scope: [List concrete deliverables, milestones, acceptance criteria, and what is explicitly out of scope.]",
    });
  }

  if (termLooksPresent(model) && !mentionsTermination(raw)) {
    candidates.push({
      id: "suggest-termination-notice",
      section: "Term",
      label: "Add termination notice",
      append:
        "Termination: Either party may terminate this agreement with [30] days’ prior written notice. Obligations that reasonably should survive termination (including confidentiality and payment for work performed) will survive.",
    });
  }

  const fresh = candidates.filter((c) => !used.has(c.id));
  return fresh.slice(0, MAX_SUGGESTIONS);
}
