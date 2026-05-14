import type { LivePreviewModel } from "./liveDraftHeuristics";
import { getGuidedFlowConfig, type GuidedFlowId } from "./guidedFlowConfig";
import { resolveGuidedFlowId } from "./agreementIntakeDraftModel";
import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";

function guidedFlowIdFromExplicitHeadline(headline: string): GuidedFlowId {
  const t = headline.toLowerCase();
  if (t.includes("non-disclosure agreement") || t.includes("mutual non-disclosure")) return "nda";
  if (t.includes("independent contractor agreement")) return "contractor";
  if (/\bconsulting\s+agreement$/i.test(headline.trim()) || t === "consulting agreement") return "consulting";
  if (t.includes("payment plan agreement")) return "payment_plan";
  return "default";
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * True when the user plainly names this agreement category in the source text
 * (not merely heuristic docTitle / keyword routing).
 */
export function agreementTypeExplicitlyMatchesFlow(rawIntake: string, flowId: GuidedFlowId): boolean {
  const t = collapseWs(rawIntake);
  if (!t) return false;
  const low = t.toLowerCase();

  const consultingExplicit =
    /\bconsulting\s+agreement\b/i.test(t) ||
    /\bthis\s+is\s+(?:a\s+)?consulting\s+agreement\b/i.test(low) ||
    (/\btype\s+of\s+agreement\b/i.test(low) && /\bconsulting\s+agreement\b/i.test(low)) ||
    /\btype\s+of\s+agreement\s+is\s+(?:a\s+)?consulting\b/i.test(low) ||
    (/\b(?:agreement\s+)?type\b/i.test(low) && /\bconsulting\s+agreement\b/i.test(low)) ||
    (/\bmake\s+the\s+type\s+of\s+agreement\b/i.test(low) && /\bconsulting\b/i.test(low));

  const ndaExplicit =
    /\b(?:mutual\s+|one-way\s+|one\s+way\s+)?(?:confidentiality|non-disclosure)\s+agreement\b/i.test(t) ||
    /\bnda\s+agreement\b/i.test(low) ||
    /\bnon[-\s]?disclosure\s+agreement\b/i.test(low) ||
    /\bthis\s+is\s+(?:a\s+)?(?:mutual\s+|one-way\s+)?nda\b/i.test(low);

  const contractorExplicit =
    /\bindependent\s+contractor\s+agreement\b/i.test(low) ||
    /\bthis\s+is\s+(?:an?\s+)?independent\s+contractor\s+agreement\b/i.test(low) ||
    (/\bcontractor\s+agreement\b/i.test(low) && !/\bconsulting\s+agreement\b/i.test(low));

  const paymentPlanExplicit =
    /\bpayment\s+plan\s+agreement\b/i.test(low) ||
    /\bthis\s+is\s+(?:a\s+)?payment\s+plan\s+agreement\b/i.test(low);

  switch (flowId) {
    case "consulting":
      return consultingExplicit;
    case "nda":
      return ndaExplicit;
    case "contractor":
      return contractorExplicit;
    case "payment_plan":
      return paymentPlanExplicit;
    default:
      return false;
  }
}

/** Single source of truth for agreement type label on create surfaces (from guided flow id). */
const FLOW_HEADLINE: Record<GuidedFlowId, string> = {
  nda: "Confidentiality Agreement",
  contractor: "Independent Contractor Agreement",
  consulting: "Consulting Agreement",
  payment_plan: "Payment Plan Agreement",
  default: "Agreement",
};

export type CanonicalAgreementTypeResult = {
  /** User-facing agreement type line — same everywhere in create. */
  headline: string;
  /** When true, prefix UI with “Suggested type:” instead of asserting final. */
  isSuggested: boolean;
  flowId: GuidedFlowId;
};

/**
 * Prefer guided flow routing over heuristic docTitle when they conflict (e.g. employment vs consulting).
 */
export function getCanonicalAgreementTypeForCreate(rawIntake: string, live: LivePreviewModel): CanonicalAgreementTypeResult {
  const trimmed = rawIntake.trim();
  const explicitHeadline = explicitIntentCanonicalTitle(trimmed);
  if (explicitHeadline) {
    const flowId = guidedFlowIdFromExplicitHeadline(explicitHeadline);
    return { headline: explicitHeadline, isSuggested: false, flowId };
  }
  const flowId = resolveGuidedFlowId(trimmed, live);
  const headline = FLOW_HEADLINE[flowId] ?? FLOW_HEADLINE.default;
  const modelTitle = (live.docTitle || "").trim();
  const modelNorm = modelTitle.toLowerCase().replace(/\s+/g, " ");
  const headNorm = headline.toLowerCase();

  const employmentish = /\bemployment|hire|w-2|w2|employee\b/i.test(trimmed) || modelNorm.includes("employment");
  const consultingish =
    flowId === "consulting" || /\bconsult|retainer|sow|1099|contractor\b/i.test(trimmed.toLowerCase());

  let isSuggested = false;
  if (modelTitle === "Agreement" || !modelTitle) {
    isSuggested = true;
  } else if (employmentish && consultingish && flowId === "consulting") {
    isSuggested = true;
  } else if (modelNorm.length > 3 && !modelNorm.includes(headNorm.slice(0, Math.min(12, headNorm.length)))) {
    const flowWord = getGuidedFlowConfig(flowId).label.toLowerCase();
    if (!modelNorm.includes(flowWord) && modelTitle !== headline) {
      isSuggested = true;
    }
  }

  if (agreementTypeExplicitlyMatchesFlow(trimmed, flowId)) {
    isSuggested = false;
  }

  return { headline, isSuggested, flowId };
}
