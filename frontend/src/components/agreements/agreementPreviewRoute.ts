import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { shouldUsePremiumDynamicCommercialSections } from "./premiumDeliverableDynamicSections";

export type PreviewRoute = "operating" | "premium_dynamic" | "premium_default";

/** Subset of `AgreementPreviewBuildOptions` (avoids import cycle with agreementPreviewFromDraft). */
export type AgreementPreviewRouteOptions = {
  starterPreview?: boolean;
  premiumDeliverablePreview?: boolean;
};

/**
 * Single place to choose preview layout: LLC operating vs dynamic commercial workstreams vs default shell.
 */
export function selectAgreementPreviewRoute(
  draft: ParsedDraftShape,
  options: AgreementPreviewRouteOptions | undefined,
): PreviewRoute {
  if (draft.agreement_family === "operating_agreement") {
    return "operating";
  }
  const starterPreview = Boolean(options?.starterPreview);
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  if (premiumDeliverable && shouldUsePremiumDynamicCommercialSections(draft)) {
    return "premium_dynamic";
  }
  return "premium_default";
}
