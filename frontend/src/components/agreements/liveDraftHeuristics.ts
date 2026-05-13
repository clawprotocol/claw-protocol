/**
 * Client-side heuristics for Step 1 "live drafting" preview only.
 * Not authoritative — server parse on submit remains the source of truth.
 */

import { substitutePartyPlaceholdersInUserFacingText } from "../../agreement/partyPlaceholderDisplay";
import { extractIntakePayment, type IntakePaymentField } from "./intakeCurrencyParse";
import {
  extractScheduleLine,
  normalizeIntakeFieldText,
  parseIntakeToStructuredAgreement,
  structuredPartiesDisplayLine,
  structuredPartiesStructured,
} from "./intakeStructuredAgreementModel";
import { splitTwoPartiesFromJoinedLine, type StructuredTwoParties } from "./partyIntakeNormalize";

export type LivePreviewModel = {
  docTitle: string;
  partiesLine: string | null;
  /** Clean two-party split when heuristics find a pair (preview bullets + inline edit). */
  partiesStructured?: StructuredTwoParties | null;
  /** When true, UI may style the parties row as a tentative detection (see partiesLine copy). */
  partiesUncertain?: boolean;
  /** Scope of work / deliverables (same signal as legacy servicesLine). */
  scopeLine: string | null;
  /** @deprecated use scopeLine — kept for older call sites */
  servicesLine: string | null;
  /** Duration / term (distinct from calendar schedule when possible). */
  termLine: string | null;
  obligationsLine: string | null;
  compensationLine: string | null;
  scheduleLine: string | null;
  /** Soft signers line when names aren’t parsed yet — editable in review. */
  signerPlaceholdersLine: string | null;
  /** Enough signal to show structured lines vs empty state */
  hasStructuredSignal: boolean;
  /** Parsed payment hints for preview validation UX (left-side intake is source of truth). */
  payment: IntakePaymentField;
  /** Heuristic extraction confidence for tuning / tolerant UX (optional). */
  extraction?: {
    scopeConfidence: number;
    termConfidence: number;
    scopeInferred: boolean;
    termInferred: boolean;
    scopeSignalPresent: boolean;
    termSignalPresent: boolean;
  };
};

export type LiveStructuringHint = string;

/** Tidy party lines for the live preview so the first row reads calm, not like raw extraction. */
export function tidyPartiesLineForPreview(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return s;
  // Drop leading bullets or enumeration noise
  s = s.replace(/^[\s•\-–—]+/, "");
  // If "parties:" style pasted a whole paragraph, cut at first sentence boundary
  if (s.length > 96) {
    const cut = s.search(/[.!?]\s/);
    if (cut > 24 && cut < 140) s = s.slice(0, cut + 1).trim();
  }
  // Prefer two clear clauses over one endless comma chain
  if (s.length > 110) {
    const comma = s.indexOf(",", 40);
    if (comma > 0 && comma < 100) {
      const rest = s.slice(comma + 1).trim();
      const secondComma = rest.indexOf(",");
      if (secondComma > 0 && secondComma < 80) {
        s = `${s.slice(0, comma).trim()}; ${rest.slice(0, secondComma).trim()}`;
      } else {
        s = s.slice(0, comma).trim();
      }
    } else {
      s = `${s.slice(0, 100).trim()}…`;
    }
  }
  return s;
}

const EMPTY: LivePreviewModel = {
  docTitle: "Agreement",
  partiesLine: null,
  partiesStructured: null,
  scopeLine: null,
  servicesLine: null,
  termLine: null,
  obligationsLine: null,
  compensationLine: null,
  scheduleLine: null,
  signerPlaceholdersLine: null,
  hasStructuredSignal: false,
  payment: { amount: null, cadence: null, valid: true },
};

function inferDocTitle(lower: string, firstLine: string): string {
  /** Prefer commercial / consulting shapes before confidentiality heuristics (avoid “Confidentiality” substring false positives). */
  if (/\bconsult(?:ant|ing)?\b|\bretainer\b|\bfreelance\b|\bcontractor\b|\b1099\b/.test(lower)) return "Consulting Agreement";
  // Canonical NDA wording — return the canonical heading directly so downstream resolvers
  // never see a legacy "Confidentiality Agreement" string for an NDA-shaped intake (regression spec §3).
  if (/\b(?:mutual\s+)?nda\b|\bnon[-\s]?disclosure\b/i.test(lower)) {
    if (/\bmutual\b/i.test(lower) || !/\b(?:one[-\s]?way|unilateral)\b/i.test(lower)) {
      return "Mutual Non-Disclosure Agreement";
    }
    return "Non-Disclosure Agreement";
  }
  if (/\bconfidentiality\s+agreement\b|\bconfidential\s+(?:information|materials|data|records)\b/i.test(lower)) {
    return "Confidentiality Agreement";
  }
  if (/\b(lease|rent(al)?|landlord|tenant)\b/.test(lower)) return "Lease Agreement";
  if (/\b(employ|hire|salary|w-2|w2|onboarding)\b/.test(lower)) return "Employment Agreement";
  if (/\b(mow|lawn|landscap|clean(ing)?|maintain|plumb|electric|hvac)\b/.test(lower)) return "Service Agreement";
  if (/\b(saas|software|license|subscription)\b/.test(lower)) return "Software / Services Agreement";
  if (/\b(purchase|sale|buy|sell)\b/.test(lower)) return "Purchase Agreement";
  const fl = firstLine.trim();
  if (fl.length > 8 && fl.length < 72 && /agreement|contract|deal/i.test(fl)) {
    return fl.replace(/\s+/g, " ").replace(/[.…]+$/g, "").slice(0, 64);
  }
  return "Agreement";
}

function mergeObligationsFromStructured(
  structured: ReturnType<typeof parseIntakeToStructuredAgreement>,
  lower: string,
): string | null {
  const parts = [structured.confidentiality, structured.termination].filter(Boolean);
  if (parts.length) return normalizeIntakeFieldText(parts.join(" "), 280);
  if (/\bdeliverable|milestone|sla\b/.test(lower)) {
    return "Deliverables and acceptance as described above.";
  }
  return null;
}

export function buildLiveDraftPreview(raw: string): LivePreviewModel {
  const text = raw.trim();
  if (!text) return { ...EMPTY };

  const lower = text.toLowerCase();
  const firstLine = text.split(/\n/)[0] || "";
  const docTitle = inferDocTitle(lower, firstLine);
  const payment = extractIntakePayment(text);
  const structured = parseIntakeToStructuredAgreement(raw);

  const partiesLine = structuredPartiesDisplayLine(structured);
  const partiesStructured = structuredPartiesStructured(structured);
  const partiesUncertain = structured.partiesUncertain || undefined;

  const scopeText = structured.scope.trim();
  const scopeLine = scopeText ? scopeText : null;
  const termLine = structured.term.trim() || null;
  const obligationsLine = mergeObligationsFromStructured(structured, lower);
  const compensationLine = structured.payment.trim() || null;
  const scheduleLine = extractScheduleLine(lower, text);

  const gov = structured.governing_law.trim();
  const obligationsWithLaw =
    obligationsLine && gov ? `${obligationsLine} Governing law: ${gov}.` : obligationsLine || (gov ? `Governing law: ${gov}.` : null);

  const signerPlaceholdersLine =
    partiesLine || text.length < 6
      ? null
      : "Parties — add names on the left; we’ll align them when you continue.";

  const hasStructuredSignal = Boolean(
    partiesLine ||
      scopeLine ||
      termLine ||
      obligationsWithLaw ||
      compensationLine ||
      scheduleLine ||
      signerPlaceholdersLine ||
      text.length >= 24
  );

  const extraction = {
    scopeConfidence: structured.scopeConfidence,
    termConfidence: structured.termConfidence,
    scopeInferred: structured.scopeInferred,
    termInferred: structured.termInferred,
    scopeSignalPresent: structured.scopeSignalPresent,
    termSignalPresent: structured.termSignalPresent,
  };

  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.debug("[intake-extract]", { scope_confidence: extraction.scopeConfidence, term_confidence: extraction.termConfidence });
  }

  const scrub = (s: string | null) =>
    s ? substitutePartyPlaceholdersInUserFacingText(s, text) : null;
  const titleScrubbed = scrub(docTitle) || docTitle;

  return {
    docTitle: titleScrubbed,
    partiesLine: scrub(partiesLine),
    partiesStructured: partiesStructured
      ? {
          party_1: scrub(partiesStructured.party_1) ?? partiesStructured.party_1,
          party_2: scrub(partiesStructured.party_2) ?? partiesStructured.party_2,
        }
      : null,
    partiesUncertain: partiesUncertain || undefined,
    scopeLine: scrub(scopeLine),
    servicesLine: scrub(scopeLine),
    termLine: scrub(termLine),
    obligationsLine: scrub(obligationsWithLaw),
    compensationLine: scrub(compensationLine),
    scheduleLine: scrub(scheduleLine),
    signerPlaceholdersLine: scrub(signerPlaceholdersLine),
    hasStructuredSignal,
    payment,
    extraction,
  };
}

export function pickLiveStructuringHint(text: string, docTitle: string): LiveStructuringHint {
  const t = text.trim();
  if (t.length < 4) return "Structuring from your words…";
  if (docTitle && docTitle !== "Agreement") return `Suggested agreement type: ${docTitle}`;
  return "Mapping parties, term, scope, obligations, payment, and timing from your text…";
}

/** Preview rows that support click-to-edit in the live preview pane. */
export const LIVE_PREVIEW_INLINE_FIELDS = ["Parties", "Term", "Payment", "Scope"] as const;
export type LivePreviewInlineField = (typeof LIVE_PREVIEW_INLINE_FIELDS)[number];

export function isLivePreviewInlineField(label: string): label is LivePreviewInlineField {
  return (LIVE_PREVIEW_INLINE_FIELDS as readonly string[]).includes(label);
}

/** Value derived from heuristic parse only (no UI overrides). Used to drop overrides once parse matches the user’s text. */
export function getInlineParsedField(model: LivePreviewModel, field: LivePreviewInlineField): string | null {
  switch (field) {
    case "Parties":
      return model.partiesLine?.trim() || model.signerPlaceholdersLine?.trim() || null;
    case "Term":
      return model.termLine?.trim() || null;
    case "Payment":
      return model.scheduleLine?.trim() || null;
    case "Scope":
      return (model.scopeLine || model.servicesLine)?.trim() || null;
    default:
      return null;
  }
}

/** Merge inline preview edits on top of parsed heuristics so the right pane shows the user’s wording when parse lags or misses. */
export function mergeLivePreviewInlineOverrides(
  model: LivePreviewModel,
  overrides: Partial<Record<LivePreviewInlineField, string>>,
): LivePreviewModel {
  const next: LivePreviewModel = { ...model };
  let touched = false;

  const p = overrides.Parties?.trim();
  if (p) {
    next.partiesLine = p;
    next.partiesStructured = splitTwoPartiesFromJoinedLine(p);
    next.signerPlaceholdersLine = null;
    next.partiesUncertain = undefined;
    touched = true;
  }
  const te = overrides.Term?.trim();
  if (te) {
    next.termLine = te;
    touched = true;
  }
  const pay = overrides.Payment?.trim();
  if (pay) {
    next.scheduleLine = pay;
    touched = true;
  }
  const sc = overrides.Scope?.trim();
  if (sc) {
    next.scopeLine = sc;
    next.servicesLine = sc;
    if (next.extraction) {
      next.extraction = {
        ...next.extraction,
        scopeInferred: false,
        scopeConfidence: Math.max(next.extraction.scopeConfidence, 0.95),
      };
    }
    touched = true;
  }

  if (touched) {
    next.hasStructuredSignal =
      Boolean(
        next.partiesLine ||
          next.signerPlaceholdersLine ||
          next.termLine ||
          next.scheduleLine ||
          next.scopeLine ||
          next.servicesLine ||
          next.obligationsLine ||
          next.compensationLine,
      ) || model.hasStructuredSignal;
  }

  return next;
}

export type QuickCheckConfirmationFlags = {
  parties?: boolean;
  scope?: boolean;
  term?: boolean;
};

/**
 * After the user confirms a quick-check card, treat the matching preview signals as “settled”
 * so downstream UI (live preview, bullets) stops showing fake uncertainty without re-parse.
 */
export function applyQuickCheckConfirmationsToLivePreview(
  model: LivePreviewModel,
  qc: QuickCheckConfirmationFlags,
): LivePreviewModel {
  if (!qc.parties && !qc.scope && !qc.term) return model;
  let next: LivePreviewModel = { ...model };
  if (qc.parties) {
    next = { ...next, partiesUncertain: false };
  }
  if ((qc.scope || qc.term) && next.extraction) {
    const ex = { ...next.extraction };
    if (qc.scope) {
      ex.scopeInferred = false;
      ex.scopeConfidence = Math.max(ex.scopeConfidence, 0.95);
    }
    if (qc.term) {
      ex.termInferred = false;
      ex.termConfidence = Math.max(ex.termConfidence, 0.95);
    }
    next = { ...next, extraction: ex };
  }
  return next;
}
