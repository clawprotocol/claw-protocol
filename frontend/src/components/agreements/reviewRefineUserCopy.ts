/** Calm, proof-first user-facing copy for the below-document refine path (not legal advice). */

import type { AgreementFamily } from "./agreementFamilyRouter";
import { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export const refineFieldHeading = (isProSurface: boolean) =>
  isProSurface ? REFINE_FIELD_HEADING_PRO : REFINE_FIELD_HEADING_FREE;

export const REFINE_THIS_DRAFT_SUBCOPY =
  "Add changes here. LawDog updates this agreement — nothing new is created and nothing is sent.";

export const REFINE_THIS_DRAFT_PLACEHOLDER =
  "Tell LawDog what to add or change, e.g. 'Add a change request approval clause and clarify ownership after final payment.'";

/** Placeholder for paid Pro refine instruction (draft card + finalize panel). */
export const PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER = REFINE_THIS_DRAFT_PLACEHOLDER;

/** @deprecated Use {@link STARTER_PRO_REFINE_IMPROVEMENT_HEADING} in create-flow card. */
export const STARTER_PRO_REFINE_UPSELL_HEADING = "Want LawDog to improve this draft?";
export const STARTER_PRO_REFINE_IMPROVEMENT_HEADING = "Want LawDog to improve this draft?";
export const STARTER_PRO_REFINE_IMPROVEMENT_BODY =
  "Upgrade to have LawDog expand, revise, and strengthen this agreement before you send it.";
export const STARTER_PRO_REFINE_IMPROVEMENT_BULLETS: readonly string[] = [
  "Add missing clauses",
  "Tighten payment, scope, and delivery terms",
  "Preserve key business terms while improving the language",
] as const;
export const STARTER_PRO_REFINE_IMPROVEMENT_CTA = "Upgrade to improve draft";
export const STARTER_PRO_REFINE_IMPROVEMENT_SECONDARY =
  "You can still continue with this starter draft as-is.";

export const STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT =
  "Turn this starter draft into a stronger send-ready agreement.";
export const STARTER_PRO_REFINE_UPSELL_CTA = "Upgrade to improve draft";
/** CTA A/B: same product copy; experiment still routes analytics. */
export const STARTER_PRO_REFINE_UPSELL_CTA_EXPERIMENT_VARIANT = "Upgrade to improve draft";
/** @deprecated Replaced by {@link STARTER_PRO_REFINE_IMPROVEMENT_SECONDARY} on the card. */
export const STARTER_PRO_REFINE_UPSELL_MICRO_PROOF =
  "Keeps your names, price, dates, and core terms. Improves structure.";

/**
 * When `agreement_family` is set (or detectable from intake), tailor the Pro upsell body; otherwise default.
 * Not legal advice; conversion copy only.
 */
export function resolveStarterProRefineUpsellBody(agreementFamily: AgreementFamily | null | undefined): string {
  switch (agreementFamily) {
    case "consulting_agreement":
      return "Add scope protection, payment clarity, ownership terms.";
    case "nda":
    case "confidentiality_commercial_protections_agreement":
      return "Tighten confidentiality, remedies, survival terms.";
    case "independent_contractor_agreement":
      return "Add IP ownership, contractor status, payment clarity.";
    default:
      return STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT;
  }
}

/** When POST /agreements/{id}/refine fails; keep the instruction text in the box. */
export const REFINE_PERSISTED_UPDATE_FAIL_INLINE =
  "Smart update could not finish. You can try again, or edit the draft text directly — nothing has changed.";
