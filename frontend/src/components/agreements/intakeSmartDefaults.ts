import { detectAgreementFamily, type AgreementFamily } from "./agreementFamilyRouter";
import { formatPaymentTermsLine, type IntakePaymentField } from "./intakeCurrencyParse";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import { extractBetweenPartyPair } from "./partyBetweenParse";
import { resolveCanonicalAgreementTitle } from "./canonicalAgreementTitle";
import { isPaymentSemanticallySafe } from "./paymentSemanticGuard";

export type { AgreementFamily } from "./agreementFamilyRouter";

/** Parsed draft shape from /api/agreements/parse (subset used for create). */
export type ParsedDraftShape = {
  title: string;
  jurisdiction: string;
  parties: { name: string; role: string; email?: string }[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  /** Client-side payment hints; omitted from POST /api/agreements/draft body. */
  payment: IntakePaymentField;
  /** Client-side: normalized termination language; omitted from POST /api/agreements/draft body. */
  termination_summary?: string | null;
  /** Client-side: supplemental clauses text; omitted from POST /api/agreements/draft body. */
  additional_terms?: string | null;
  /** Local routing for defaults + preview; omitted from POST /api/agreements/draft body. */
  agreement_family?: AgreementFamily;
  /**
   * One-shot LawDog Pro full document from POST /api/agreements/premium-full-draft.
   * When set and passes quality bar, this is the premium readonly body (not stitched preview only).
   * Omitted from POST /draft.
   */
  premium_full_document_text?: string | null;
  /** First-pass premium full draft (POST /premium-full-draft primary output). */
  premium_server_full_document_text?: string | null;
  /** Quality-gate repair pass output when primary failed structural checks (server). */
  premium_server_repair_document_text?: string | null;
  /** Audit labels from the full-draft model. Omitted from POST /draft. */
  premium_full_draft_key_terms?: string[] | null;
  premium_full_draft_missing_info?: string[] | null;
  /** Premium parse extract: grounded bullets; merged into additional_terms for review. Omitted from POST /draft. */
  material_asks?: string[];
  /** Operating-agreement shell: company display name when known. */
  llc_company_name?: string | null;
  management_structure?: string | null;
  members_ownership_summary?: string | null;
  capital_contributions_summary?: string | null;
  distributions_summary?: string | null;
  transfer_restrictions_summary?: string | null;
  dissolution_summary?: string | null;
};

const MAX_PARTY_NAME_LEN = 280;

function splitPartiesFromLiveLine(line: string | null): { name: string; role: string }[] | null {
  if (!line) return null;
  const t = line
    .replace(/^\[You\]\s+and\s+/i, "")
    .replace(/^Party detected:\s*/i, "")
    .replace(/\s*\(\?\)\s*$/i, "")
    .trim();
  const parts = t.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((name) => ({ name: name.slice(0, MAX_PARTY_NAME_LEN), role: "party" }));
  }
  const comma = t.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (comma.length >= 3) {
    return comma.map((name) => ({ name: name.slice(0, MAX_PARTY_NAME_LEN), role: "party" }));
  }
  const segments = t.split(/\s+and\s+/i).filter(Boolean);
  if (segments.length >= 2) {
    const b = segments[segments.length - 1].trim();
    const a = segments.slice(0, -1).join(" and ").trim();
    if (a.length > 0 && b.length > 0) {
      return [
        { name: a.slice(0, MAX_PARTY_NAME_LEN), role: "party" },
        { name: b.slice(0, MAX_PARTY_NAME_LEN), role: "party" },
      ];
    }
  }
  return null;
}

/**
 * Fills common gaps for the simple product path so users skip multi-step follow-ups
 * when the model is thin but intake text has enough signal.
 */
export function applySimpleFlowSmartDefaults(parsed: ParsedDraftShape, intakeText: string): ParsedDraftShape {
  const live = buildLiveDraftPreview(intakeText);
  const structured = parseIntakeToStructuredAgreement(intakeText);
  const payment = live.payment;
  let next: ParsedDraftShape = { ...parsed, payment };

  {
    const family = (next.agreement_family ?? detectAgreementFamily(intakeText)) as AgreementFamily;
    const resolved = resolveCanonicalAgreementTitle({
      currentTitle: next.title,
      liveDocTitle: live.docTitle,
      family,
    });
    next.title = resolved.title;
  }

  const j = (next.jurisdiction || "").trim().toLowerCase();
  if (!j || j === "tbd") {
    const gl = structured.governing_law.trim();
    next.jurisdiction = gl || "Delaware";
  }

  if ((next.parties || []).length < 2) {
    const explicitSigners = tryInferNamedPartiesFromIntake(intakeText);
    if (explicitSigners && explicitSigners.length >= 2) {
      next.parties = explicitSigners;
    } else if (!structured.partiesUncertain && structured.parties.length >= 2) {
      // Honor the multi-party output of the structured extractor (Parties: A, B, C, D).
      next.parties = structured.parties.map((name) => ({
        name: name.slice(0, MAX_PARTY_NAME_LEN),
        role: "party" as const,
      }));
    } else {
      const fromBetween = extractBetweenPartyPair(intakeText);
      const fromLive =
        fromBetween && fromBetween.left.trim().length > 1 && fromBetween.right.trim().length > 1
          ? [
              { name: fromBetween.left.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" as const },
              { name: fromBetween.right.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" as const },
            ]
          : splitPartiesFromLiveLine(live.partiesLine);
      if (fromLive) {
        next.parties = fromLive;
      } else {
        next.parties = [
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ];
      }
    }
  }

  if (!(next.purpose || "").trim()) {
    const structuredScope = structured.scope.trim();
    const scopeOnly = (live.scopeLine || "").trim();
    next.purpose = structuredScope || scopeOnly || "Scope and deliverables to be refined in review.";
  }

  if (!(next.payment_terms || "").trim()) {
    const fromStructured = formatPaymentTermsLine(payment);
    const structuredPayment = structured.payment.trim();
    /**
     * Semantic suppression (regression spec §4): never let confidentiality / NDA tokens
     * leak into Payment Terms via the live compensation heuristic. If structured + live
     * are both empty/contaminated, fall through to a neutral no-payment line.
     */
    const safeStructuredPayment = isPaymentSemanticallySafe(structuredPayment) ? structuredPayment : "";
    const liveComp = (live.compensationLine || "").trim();
    const safeLiveComp = isPaymentSemanticallySafe(liveComp) ? liveComp : "";
    next.payment_terms =
      (fromStructured && payment.valid) || (fromStructured && payment.amount != null)
        ? fromStructured
        : safeStructuredPayment || safeLiveComp ||
          "Payment schedule to be agreed with the other party — add specifics in review.";
  }

  if (!(next.duration || "").trim() && !(next.due_date || "").trim()) {
    const structuredTerm = structured.term.trim();
    next.duration =
      structuredTerm || live.termLine ||
      live.scheduleLine ||
      "12 months unless terminated earlier as agreed in writing.";
  }

  if (!(next.effective_date || "").trim()) {
    next.effective_date = "Upon full execution by all parties";
  }

  if (!(next.termination_summary || "").trim()) {
    const structuredTermination = structured.termination.trim();
    if (structuredTermination) {
      next.termination_summary = structuredTermination;
    }
  }

  return next;
}
