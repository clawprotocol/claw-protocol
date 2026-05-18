/** Calm, proof-first user-facing copy for the below-document refine path (not legal advice). */

import type { AgreementFamily } from "./agreementFamilyRouter";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_EDIT_THIS_DRAFT,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CAN_HELP_BULLETS,
  PRO_UPGRADE_CARD_BODY,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";
import { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export const refineFieldHeading = (isProSurface: boolean) =>
  isProSurface ? REFINE_FIELD_HEADING_PRO : REFINE_FIELD_HEADING_FREE;

export const REFINE_THIS_DRAFT_SUBCOPY =
  "Add changes here. LawDog updates this agreement — nothing new is created and nothing is sent.";

export const REFINE_THIS_DRAFT_PLACEHOLDER =
  "Tell LawDog what to add or change, e.g. 'Add a change request approval clause and clarify ownership after final payment.'";

/** Placeholder for paid Pro refine instruction (draft card + finalize panel). */
export const PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER =
  'Edit the agreement OR add notes for the reviewer (e.g., "Add late fee..." or "List items the other party should review")';

export const STARTER_PRO_REFINE_IMPROVEMENT_HEADING = PRO_UPGRADE_CARD_HEADING;
/** @deprecated Use {@link STARTER_PRO_REFINE_IMPROVEMENT_HEADING} in create-flow card. */
export const STARTER_PRO_REFINE_UPSELL_HEADING = STARTER_PRO_REFINE_IMPROVEMENT_HEADING;
export const STARTER_PRO_REFINE_IMPROVEMENT_BODY = PRO_UPGRADE_CARD_BODY;
export const STARTER_PRO_REFINE_IMPROVEMENT_BULLETS = PRO_UPGRADE_CAN_HELP_BULLETS;
export const STARTER_PRO_REFINE_IMPROVEMENT_CTA = PRO_CTA_CONTINUE;
export const STARTER_PRO_REFINE_IMPROVEMENT_SECONDARY = PRO_UPGRADE_REASSURANCE;
export const STARTER_PRO_REFINE_KEEP_FREE_DRAFT_CTA = PRO_CTA_KEEP_FREE_DRAFT;
export const STARTER_PRO_REFINE_EDIT_DRAFT_CTA = PRO_CTA_EDIT_THIS_DRAFT;

export const STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT =
  "Turn your draft into a cleaner, negotiation-ready version before you share or sign.";
export const STARTER_PRO_REFINE_UPSELL_CTA = STARTER_PRO_REFINE_IMPROVEMENT_CTA;
/** CTA A/B: same product copy; experiment still routes analytics. */
export const STARTER_PRO_REFINE_UPSELL_CTA_EXPERIMENT_VARIANT = STARTER_PRO_REFINE_IMPROVEMENT_CTA;
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
