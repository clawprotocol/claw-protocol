/**
 * Local-only gate for “advanced” intakes so we don’t silently ship a thin template
 * where users expect a full instrument (OA, SAFE, etc.).
 */
import type { AgreementFamily } from "./agreementFamilyRouter";
import { resolveGuidedFlowId } from "./agreementIntakeDraftModel";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { shouldInterceptAdvancedDocumentFamily } from "./agreementLaunchFamilies";

export function needsComplexityIntercept(intakeText: string, family: AgreementFamily | undefined): boolean {
  return shouldInterceptAdvancedDocumentFamily(intakeText, family);
}

/**
 * When the user chooses “simplified” after the complexity gate, pick the safest broad
 * instant family + title (consulting / services / NDA only when dominant).
 */
export function resolveSafeSimplifiedAgreementRouting(
  rawIntake: string,
  _parsed: ParsedDraftShape,
): { agreement_family: AgreementFamily; title: string } {
  const raw = rawIntake.trim();
  const live = buildLiveDraftPreview(raw);
  const flow = resolveGuidedFlowId(raw, live);
  const low = raw.toLowerCase();

  switch (flow) {
    case "consulting":
      return { agreement_family: "consulting_agreement", title: "Consulting Agreement" };
    case "contractor":
      return { agreement_family: "independent_contractor_agreement", title: "Independent Contractor Agreement" };
    case "nda":
      return { agreement_family: "nda", title: "Non-Disclosure Agreement" };
    case "payment_plan":
      return { agreement_family: "generic_business_agreement", title: "Payment Plan Agreement" };
    default:
      if (/\bconsult(?:ing|ant)?\b/i.test(low)) {
        return { agreement_family: "consulting_agreement", title: "Consulting Agreement" };
      }
      return { agreement_family: "services_agreement", title: "Business Services Agreement" };
  }
}

/** Drop LLC / instrument shell fields and route to a safe broad instant template + title. */
export function simplifyParsedDraftForInstantPath(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const routing = resolveSafeSimplifiedAgreementRouting(rawIntake.trim(), parsed);
  const next: ParsedDraftShape = {
    ...parsed,
    agreement_family: routing.agreement_family,
    title: routing.title,
    llc_company_name: null,
    management_structure: null,
    members_ownership_summary: null,
    capital_contributions_summary: null,
    distributions_summary: null,
    transfer_restrictions_summary: null,
    dissolution_summary: null,
  };
  const pay = (next.payment_terms || "").trim();
  if (/^n\/a$/i.test(pay) || /^not applicable/i.test(pay)) {
    next.payment_terms =
      "Economics and fees to be described in the agreement body unless otherwise agreed by the parties.";
  }
  return next;
}
