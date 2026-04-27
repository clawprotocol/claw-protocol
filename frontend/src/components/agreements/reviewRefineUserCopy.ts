/** Calm, proof-first user-facing copy for the below-document refine path (not legal advice). */

import { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export { REFINE_FIELD_HEADING_FREE, REFINE_FIELD_HEADING_PRO } from "./draftPreviewLabels";

export const refineFieldHeading = (isProSurface: boolean) =>
  isProSurface ? REFINE_FIELD_HEADING_PRO : REFINE_FIELD_HEADING_FREE;

export const REFINE_THIS_DRAFT_SUBCOPY =
  "Add changes here. LawDog updates this agreement — nothing new is created and nothing is sent.";

export const REFINE_THIS_DRAFT_PLACEHOLDER =
  "Example: change the title to Web Development Agreement, add Oklahoma venue, add acceptance language, and keep payment terms unchanged.";

/** When POST /agreements/{id}/refine fails; keep the instruction text in the box. */
export const REFINE_PERSISTED_UPDATE_FAIL_INLINE =
  "Smart update could not finish. You can try again, or edit the draft text directly — nothing has changed.";
