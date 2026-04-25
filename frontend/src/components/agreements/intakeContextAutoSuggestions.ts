/**
 * Deterministic, context-aware ranked additions for simple-create intake.
 * No auto-insert — only surfaces chips the user can tap.
 */

import type { LivePreviewModel } from "./liveDraftHeuristics";
import { hasAtLeastTwoParties, paymentCompletionMet } from "./intakeConfidenceScore";

export const CONTEXT_AUTO_SUGGESTION_MAX = 3;

/** Scored candidate surfaced in UI (top 3 by totalScore). */
export type ContextRankedSuggestion = {
  id: string;
  label: string;
  clauseText: string;
  baseWeight: number;
  contextScore: number;
  dependencyScore: number;
  /** Light boost from detected agreement “shape” (NDA, consulting, payment plan). */
  typeWeight: number;
  totalScore: number;
  /** Human-readable scoring trace for dev tooling / QA. */
  reasons: string[];
  /** Marks the matching generic main-clause chip as used so we do not duplicate. */
  syncMainClauseId?: string;
  /** Groups user-written overrides (same family hides re-suggestions). */
  clauseFamily: ContextClauseFamily;
};

/** @deprecated Use ContextRankedSuggestion — kept for call-site imports. */
export type ContextAutoSuggestion = ContextRankedSuggestion;

export type ContextClauseFamily =
  | "governing_law"
  | "termination"
  | "ip_ownership"
  | "confidentiality_duration"
  | "late_fee"
  | "payment_due"
  | "invoice_terms"
  | "return_destroy"
  | "dispute_resolution"
  | "independent_contractor"
  | "scope_detail"
  | "work_for_hire"
  | "deliverables";

export type ContextAwareSuggestionResult = {
  topSuggestions: ContextRankedSuggestion[];
  /** Hide these generic main-clause chips when a context row covers the same topic. */
  suppressMainClauseIds: Set<string>;
};

function normCorpus(raw: string, model: LivePreviewModel): string {
  const parts = [
    raw,
    model.scopeLine ?? "",
    model.servicesLine ?? "",
    model.compensationLine ?? "",
    model.scheduleLine ?? "",
    model.termLine ?? "",
    model.partiesLine ?? "",
    model.obligationsLine ?? "",
  ];
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

function mentionsLateFee(corpus: string): boolean {
  return /\b(late\s+fee|past\s+due|overdue|interest\s+on\s+(unpaid|late|overdue)|penalt(y|ies)\s+for\s+late)\b/i.test(
    corpus,
  );
}

function hasPlainGoverningLaw(corpus: string): boolean {
  return /\b(governing\s+law|jurisdiction|choice\s+of\s+law|laws\s+of\s+the\s+state|law\s+of\s+\w+|governed\s+by|under\s+the\s+laws?\s+of)\b/i.test(
    corpus,
  );
}

function hasStateGoverningLaw(corpus: string, stateWord: string): boolean {
  const st = new RegExp(`\\b${stateWord}\\b`, "i");
  if (!st.test(corpus)) return false;
  if (hasPlainGoverningLaw(corpus) && st.test(corpus)) return true;
  if (new RegExp(`\\b${stateWord}\\s+(state\\s+)?law\\b`, "i").test(corpus)) return true;
  return false;
}

function hasTerminationLanguage(corpus: string): boolean {
  return /\b(terminat(e|ion)|notice\s+period|either\s+party\s+may\s+(terminate|end)|for\s+cause|without\s+cause|end\s+this\s+agreement)\b/i.test(
    corpus,
  );
}

function hasPaymentDueSignal(corpus: string): boolean {
  return /\bdue\s+(?:on|within|in|by)\b|\bnet\s+\d+\b|\bpayment\s+is\s+due\b|\bdays\s+after\s+(?:invoice|billing)\b|\bdue\s+date\b/i.test(
    corpus,
  );
}

function hasInvoiceTermsSignal(corpus: string): boolean {
  return /\binvoice\s+terms\b|\bbilling\s+cycle\b|\binvoices?\s+(?:are|is|go|sent|issued)\b|\bupon\s+invoice\b|\bpayment\s+schedule\b/i.test(
    corpus,
  );
}

function hasIndependentContractorLanguage(corpus: string): boolean {
  return /\bindependent\s+contractor\b|\bnot\s+an\s+employee\b|\b1099\b/i.test(corpus);
}

function hasRichScopeSignal(corpus: string, model: LivePreviewModel): boolean {
  const sl = (model.scopeLine || model.servicesLine || "").trim();
  if (sl.length >= 40) return true;
  if (model.extraction?.scopeSignalPresent) return true;
  return /\bdeliverable|milestone|acceptance|phased|out\s+of\s+scope|scope\s+in\s+more\s+detail\b/i.test(corpus);
}

function hasConfidentialityDuration(corpus: string): boolean {
  return (
    (/\b(?:for|after)\s+\d+\s*(?:year|years|month|months)\b.*\bconfidential/i.test(corpus) ||
      /\bconfidential.*(?:for|after)\s+\d+\s*(?:year|years|month|months)\b/i.test(corpus) ||
      /\bsurviv(e|es|ing)\s+\d+\s*(?:year|years|month|months)\b/i.test(corpus))
  );
}

function hasReturnOrDestroyLanguage(corpus: string): boolean {
  return (
    /\breturn\s+or\s+(?:permanently\s+)?delet/i.test(corpus) ||
    /\bdestroy\s+(?:all\s+)?copies\b/i.test(corpus) ||
    /\bcertificate\s+of\s+destruction\b/i.test(corpus) ||
    /\bdelete\s+the\s+other\s+(?:side|party)/i.test(corpus)
  );
}

function hasIpOwnershipLanguage(corpus: string): boolean {
  return (
    /\bintellectual\s+property\b.*\b(belong|own|owns|ownership)\b/i.test(corpus) ||
    /\b(ip|work\s+product)\s+(?:belongs|owned)\b/i.test(corpus) ||
    /\bowns\s+the\s+(code|software|work|deliverables?)\b/i.test(corpus)
  );
}

function hasWorkForHireLanguage(corpus: string): boolean {
  return /\bwork[\s-]made[\s-]for[\s-]hire\b|\bwork\s+for\s+hire\b|\bwmfh\b/i.test(corpus);
}

function hasDeliverablesPlainLanguage(corpus: string): boolean {
  return /\bdeliverables?\s*:\s*\[/i.test(corpus) || /\bdeliverables?\s*:\s*[^{\n]{8,}/i.test(corpus);
}

function mentionsDisputeResolution(corpus: string): boolean {
  return /\b(mediation|arbitration|dispute\s+resolution|binding\s+arbitration|aaa\b|judicial\s+reference|small\s+claims\s+court)\b/i.test(
    corpus,
  );
}

const LISTED_STATES = [
  { word: "oklahoma", clauseText: "Governing law: Oklahoma." },
  { word: "delaware", clauseText: "Governing law: Delaware." },
  { word: "texas", clauseText: "Governing law: Texas." },
  { word: "california", clauseText: "Governing law: California." },
] as const;

function capitalizeStateWord(word: string): string {
  return word.replace(/^\w/, (c) => c.toUpperCase());
}

function weeklyPaymentMentioned(corpus: string): boolean {
  return /\bweekly\b/i.test(corpus);
}

/** Conversational chip copy: tie to detected context; keep lead-in short. */
function labelLateFee(corpus: string): string {
  if (monthlyPaymentMentioned(corpus)) return "Since payment is monthly, add a late fee?";
  if (weeklyPaymentMentioned(corpus)) return "Since payment is weekly, add a late fee?";
  return "Since you mention billing, add a late fee?";
}

function labelPaymentDueDate(corpus: string): string {
  if (/\binvoice\b/i.test(corpus) || /\bnet\s+\d+\b/i.test(corpus)) {
    return "Since invoicing came up, say when payment is due?";
  }
  return "Since timing matters here, say when payment is due?";
}

function labelInvoiceTerms(corpus: string): string {
  if (/\binvoice\b/i.test(corpus)) return "Since you mentioned invoices, spell out billing terms?";
  return "Since billing is on the table, spell out invoice terms?";
}

function labelIndependentContractor(corpus: string): string {
  if (/\bconsultant\b|\bconsulting\b/i.test(corpus)) {
    return "Since this looks like consulting, say it's contracting?";
  }
  return "Since you described services, say it's contracting?";
}

function labelTermination(_corpus: string): string {
  return "Since this is services-style work, add how either side exits?";
}

function labelScopeDetail(_corpus: string): string {
  return "Since scope could be clearer, list what's in and out?";
}

function labelConfDuration(_corpus: string): string {
  return "Since this involves confidential info, say how long it lasts?";
}

function labelReturnDestroy(_corpus: string): string {
  return "Since materials may be shared, add return-or-delete terms?";
}

function labelConfGoverningLaw(_corpus: string): string {
  return "Since this is confidentiality-heavy, pick governing law?";
}

function labelIpOwnership(corpus: string): string {
  if (/\bcode\b|\bcodebase\b/i.test(corpus) && !/\bsoftware\b/i.test(corpus)) {
    return "Since you're working with code, clarify who owns IP?";
  }
  if (/\bstartup\b|\bplatform\b|\bsaas\b/i.test(corpus)) {
    return "Since this is product-style work, clarify who owns IP?";
  }
  return "Since this is software work, add IP ownership?";
}

function labelWorkForHire(_corpus: string): string {
  return "Since you're handing over work product, add work-for-hire wording?";
}

function labelDeliverables(corpus: string): string {
  if (/\bbuild\b/i.test(corpus)) return "Since you're building something shippable, list deliverables clearly?";
  return "Since delivery matters here, list deliverables clearly?";
}

function labelDispute(nda: boolean, ctr: boolean, sw: boolean): string {
  if (nda) return "Since this is an NDA, pick how to settle disputes?";
  if (ctr) return "Since this is consulting work, pick how to settle disputes?";
  if (sw) return "Since this is software work, pick how to settle disputes?";
  return "If something goes wrong, pick how to settle disputes?";
}

function mentionsListedState(corpus: string): boolean {
  return LISTED_STATES.some((s) => new RegExp(`\\b${s.word}\\b`, "i").test(corpus));
}

function contractorConsultingTrigger(corpus: string): boolean {
  const low = corpus.toLowerCase();
  if (/\bcontractor\b|\bconsultant\b|\bconsulting\b/i.test(low)) return true;
  if (/\bservices\b/i.test(low) && /\b(agreement|contract|project|client|company|fee|invoice)\b/i.test(low)) return true;
  return false;
}

function ndaTrigger(corpus: string): boolean {
  return /\bnda\b|\bnon[\s-]?disclosure\b|\bconfidential(ity)?\b/i.test(corpus);
}

function softwareStartupTrigger(corpus: string): boolean {
  return /\bsoftware\b|\bstartup\b|\bplatform\b|\bcode\b|\bbuild\b|\bsaas\b|\bapplication\b|\bapp\b/i.test(corpus);
}

function paymentScheduleTrigger(corpus: string): boolean {
  return /\bmonthly\b|\bweekly\b|\binvoice\b|\bdue\s+date\b|\bnet\s+\d+\b/i.test(corpus);
}

function monthlyPaymentMentioned(corpus: string): boolean {
  return /\bmonthly\b/i.test(corpus);
}

function finalizeScore(parts: {
  id: string;
  label: string;
  clauseText: string;
  baseWeight: number;
  contextScore: number;
  dependencyScore: number;
  typeWeight: number;
  syncMainClauseId?: string;
  clauseFamily: ContextClauseFamily;
}): ContextRankedSuggestion {
  const totalScore = Math.round(
    parts.baseWeight + parts.contextScore + parts.dependencyScore + parts.typeWeight,
  );
  const reasons: string[] = [];
  reasons.push(`Base importance ("${parts.label}"): ${parts.baseWeight}`);
  if (parts.contextScore) reasons.push(`Context relevance: +${parts.contextScore}`);
  if (parts.dependencyScore) reasons.push(`Dependency boost: +${parts.dependencyScore}`);
  if (parts.typeWeight) reasons.push(`Agreement-type weighting: +${parts.typeWeight}`);
  reasons.push(`Total score: ${totalScore}`);
  return {
    id: parts.id,
    label: parts.label,
    clauseText: parts.clauseText,
    baseWeight: parts.baseWeight,
    contextScore: parts.contextScore,
    dependencyScore: parts.dependencyScore,
    typeWeight: parts.typeWeight,
    totalScore,
    reasons,
    syncMainClauseId: parts.syncMainClauseId,
    clauseFamily: parts.clauseFamily,
  };
}

/**
 * Collects contextual suggestions from live draft text + preview model fields.
 * User-written text that already covers a topic removes that suggestion (clause family / heuristics).
 */
export function computeContextAwareSuggestionResult(
  rawCombined: string,
  model: LivePreviewModel,
  usedContextSuggestionIds: ReadonlySet<string>,
): ContextAwareSuggestionResult {
  const corpus = normCorpus(rawCombined, model);
  if (!corpus) {
    return { topSuggestions: [], suppressMainClauseIds: new Set() };
  }

  const used = usedContextSuggestionIds;
  const nda = ndaTrigger(corpus);
  const ctr = contractorConsultingTrigger(corpus);
  const payTrig = paymentScheduleTrigger(corpus);
  const sw = softwareStartupTrigger(corpus);
  const monthly = monthlyPaymentMentioned(corpus);
  const partiesOk = hasAtLeastTwoParties(corpus, model);
  const paymentOk = paymentCompletionMet(corpus, model);
  const scopeRich = hasRichScopeSignal(corpus, model);

  const ranked: ContextRankedSuggestion[] = [];

  const pushRanked = (r: ContextRankedSuggestion | null) => {
    if (r && !used.has(r.id)) ranked.push(r);
  };

  // --- Jurisdiction (family: any governing law text blocks all state rows) ---
  for (const st of LISTED_STATES) {
    const mentioned = new RegExp(`\\b${st.word}\\b`, "i").test(corpus);
    const stateSatisfied = hasStateGoverningLaw(corpus, st.word);
    const familyBlocked = hasPlainGoverningLaw(corpus);
    if (!mentioned || stateSatisfied || familyBlocked) continue;

    const contextScore = 6;
    const typeWeight = nda ? 2 : 0;

    pushRanked(
      finalizeScore({
        id: `ctx_jurisdiction_${st.word}`,
        label: `Set governing law to ${capitalizeStateWord(st.word)}?`,
        clauseText: st.clauseText,
        baseWeight: 10,
        contextScore,
        dependencyScore: 0,
        typeWeight,
        syncMainClauseId: "governing_law",
        clauseFamily: "governing_law",
      }),
    );
  }

  // --- Payment (plan shape boosts) ---
  const paymentTypeBoost = payTrig ? 3 : 0;
  const consultingPayTypeBoost = ctr && payTrig ? 2 : 0;

  if (payTrig && !mentionsLateFee(corpus)) {
    let contextScore = monthly ? 5 : 3;
    if (/\bweekly\b/i.test(corpus)) contextScore = Math.max(contextScore, 4);
    pushRanked(
      finalizeScore({
        id: "ctx_payment_late_fee",
        label: labelLateFee(corpus),
        clauseText:
          "If a payment is late, the paying side may owe a late fee. Pick a simple rate (for example [X]% per month) or a flat amount.",
        baseWeight: 6,
        contextScore,
        dependencyScore: paymentOk ? 2 : 0,
        typeWeight: paymentTypeBoost + consultingPayTypeBoost,
        syncMainClauseId: "late_fee",
        clauseFamily: "late_fee",
      }),
    );
  }

  if (payTrig && !hasPaymentDueSignal(corpus)) {
    const ctx = /\binvoice\b|\bnet\s+\d+\b|\bdue\s+date\b/i.test(corpus) ? 4 : 2;
    pushRanked(
      finalizeScore({
        id: "ctx_payment_due_date",
        label: labelPaymentDueDate(corpus),
        clauseText:
          "Payment is due [number of days] days after invoice or after you hit the agreed milestone — whichever you mean here.",
        baseWeight: 7,
        contextScore: ctx,
        dependencyScore: paymentOk ? 2 : 0,
        typeWeight: paymentTypeBoost + (ctr ? 2 : 0),
        clauseFamily: "payment_due",
      }),
    );
  }

  if (payTrig && !hasInvoiceTermsSignal(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_payment_invoice_terms",
        label: labelInvoiceTerms(corpus),
        clauseText:
          "Invoices: say how often they go out and what each invoice should include. Example: invoices monthly, due within [number] days.",
        baseWeight: 6,
        contextScore: /\binvoice\b/i.test(corpus) ? 3 : 2,
        dependencyScore: paymentOk ? 2 : 0,
        typeWeight: paymentTypeBoost + (ctr ? 2 : 0),
        clauseFamily: "invoice_terms",
      }),
    );
  }

  // --- Consulting / contractor ---
  const consultingTypeBoost = ctr ? 2 : 0;

  if (ctr && !hasIndependentContractorLanguage(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_contractor_status",
        label: labelIndependentContractor(corpus),
        clauseText:
          "This is independent contracting, not employment. Each side handles its own taxes and filings unless you say otherwise.",
        baseWeight: 7,
        contextScore: 3,
        dependencyScore: 0,
        typeWeight: consultingTypeBoost + (sw ? 2 : 0),
        clauseFamily: "independent_contractor",
      }),
    );
  }

  if (ctr && !hasTerminationLanguage(corpus)) {
    const depPartiesScope = partiesOk && scopeRich ? 2 : 0;
    pushRanked(
      finalizeScore({
        id: "ctx_contractor_termination",
        label: labelTermination(corpus),
        clauseText:
          "Either side can end this with [number] days of written notice. Payment for finished work and a few basics can still apply after ending.",
        baseWeight: 10,
        contextScore: 4,
        dependencyScore: depPartiesScope,
        typeWeight: consultingTypeBoost + (payTrig ? 2 : 0),
        syncMainClauseId: "termination",
        clauseFamily: "termination",
      }),
    );
  }

  if (ctr && !hasRichScopeSignal(corpus, model)) {
    pushRanked(
      finalizeScore({
        id: "ctx_contractor_scope",
        label: labelScopeDetail(corpus),
        clauseText:
          "Scope in plain language: [list main tasks, milestones, and what is intentionally not included].",
        baseWeight: 7,
        contextScore: 4,
        dependencyScore: partiesOk ? 1 : 0,
        typeWeight: consultingTypeBoost,
        clauseFamily: "scope_detail",
      }),
    );
  }

  // --- Confidentiality ---
  const skipConfGovBecauseState = mentionsListedState(corpus);
  const ndaTypeBoost = nda ? 3 : 0;

  if (nda && !hasConfidentialityDuration(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_conf_duration",
        label: labelConfDuration(corpus),
        clauseText:
          "Confidential information stays protected for [number] years after this agreement ends (adjust the number to what you want).",
        baseWeight: 8,
        contextScore: 6,
        dependencyScore: 0,
        typeWeight: ndaTypeBoost,
        clauseFamily: "confidentiality_duration",
      }),
    );
  }

  if (nda && !hasReturnOrDestroyLanguage(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_conf_return_destroy",
        label: labelReturnDestroy(corpus),
        clauseText:
          "When this ends, each side returns or permanently deletes the other side's confidential files and materials, and confirms that if asked.",
        baseWeight: 5,
        contextScore: 4,
        dependencyScore: nda ? 2 : 0,
        typeWeight: ndaTypeBoost,
        clauseFamily: "return_destroy",
      }),
    );
  }

  if (nda && !hasPlainGoverningLaw(corpus) && !skipConfGovBecauseState) {
    pushRanked(
      finalizeScore({
        id: "ctx_conf_governing_law",
        label: labelConfGoverningLaw(corpus),
        clauseText:
          "Governing law: [state you want]. Courts in that state handle disagreements unless you change this later.",
        baseWeight: 10,
        contextScore: 4,
        dependencyScore: 0,
        typeWeight: ndaTypeBoost + 2,
        syncMainClauseId: "governing_law",
        clauseFamily: "governing_law",
      }),
    );
  }

  // --- Software / IP ---
  const swTypeBoost = sw && ctr ? 2 : 0;

  if (sw && !hasIpOwnershipLanguage(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_sw_ip_ownership",
        label: labelIpOwnership(corpus),
        clauseText:
          "Who owns the work: say whether [client / you / both] owns code, designs, drafts, and related work product after payment.",
        baseWeight: 9,
        contextScore: 7,
        dependencyScore: sw ? 2 : 0,
        typeWeight: (ctr ? 2 : 0) + swTypeBoost,
        clauseFamily: "ip_ownership",
      }),
    );
  }

  if (sw && !hasWorkForHireLanguage(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_sw_work_for_hire",
        label: labelWorkForHire(corpus),
        clauseText:
          "Work-for-hire: when [client] pays, they own the finished work you list here (code, designs, documents) unless you say something different below.",
        baseWeight: 8,
        contextScore: 5,
        dependencyScore: sw ? 2 : 0,
        typeWeight: ctr ? 2 : 0,
        clauseFamily: "work_for_hire",
      }),
    );
  }

  if (sw && !hasDeliverablesPlainLanguage(corpus) && !hasRichScopeSignal(corpus, model)) {
    pushRanked(
      finalizeScore({
        id: "ctx_sw_deliverables",
        label: labelDeliverables(corpus),
        clauseText:
          "Deliverables: [what ships, in what format, and rough timing]. Keep it in everyday words you can edit later.",
        baseWeight: 7,
        contextScore: 4,
        dependencyScore: 0,
        typeWeight: ctr ? 1 : 0,
        clauseFamily: "deliverables",
      }),
    );
  }

  // --- Dispute resolution (lower base; surfaces on substantive drafts) ---
  if ((nda || ctr || sw) && corpus.length > 72 && !mentionsDisputeResolution(corpus)) {
    pushRanked(
      finalizeScore({
        id: "ctx_general_dispute",
        label: labelDispute(nda, ctr, sw),
        clauseText:
          "If you disagree, say whether you want informal talks first, mediation, or arbitration in [city / state], and who pays filing costs.",
        baseWeight: 5,
        contextScore: nda ? 3 : ctr ? 2 : 1,
        dependencyScore: partiesOk ? 1 : 0,
        typeWeight: nda ? 1 : 0,
        syncMainClauseId: "dispute_resolution",
        clauseFamily: "dispute_resolution",
      }),
    );
  }

  // --- Clause family: user text overrides future chips in the same family ---
  const familySatisfied: Partial<Record<ContextClauseFamily, boolean>> = {
    governing_law: hasPlainGoverningLaw(corpus),
    termination: hasTerminationLanguage(corpus),
    ip_ownership: hasIpOwnershipLanguage(corpus),
    confidentiality_duration: hasConfidentialityDuration(corpus),
    late_fee: mentionsLateFee(corpus),
    payment_due: hasPaymentDueSignal(corpus),
    invoice_terms: hasInvoiceTermsSignal(corpus),
    return_destroy: hasReturnOrDestroyLanguage(corpus),
    dispute_resolution: mentionsDisputeResolution(corpus),
    independent_contractor: hasIndependentContractorLanguage(corpus),
    scope_detail: hasRichScopeSignal(corpus, model),
    work_for_hire: hasWorkForHireLanguage(corpus),
    deliverables: hasDeliverablesPlainLanguage(corpus) || hasRichScopeSignal(corpus, model),
  };

  const qualified = ranked.filter((r) => !familySatisfied[r.clauseFamily]);

  const suppressMainClauseIds = new Set<string>();
  for (const c of qualified) {
    if (c.syncMainClauseId) suppressMainClauseIds.add(c.syncMainClauseId);
  }

  qualified.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.id.localeCompare(b.id);
  });

  return {
    topSuggestions: qualified.slice(0, CONTEXT_AUTO_SUGGESTION_MAX),
    suppressMainClauseIds,
  };
}
