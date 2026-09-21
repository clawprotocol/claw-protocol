/**
 * Phase 4C.2.1 Quick integrity contracts — uploaded PDF authority, not drafted paper.
 */
import { assertPhase4c2QuickCompletionContracts } from "./phase4c2QuickCompletionCoverage";
import { ownerAndRecipientPlaced, tokenHiddenFromText } from "./simpleProduct/quickPdfEnvelope";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "./simpleProduct/quickPdfEnvelope";

export function assertPhase4c21QuickIntegrityContracts(): void {
  assertPhase4c2QuickCompletionContracts();
  const placed = [
    { field_id: "fld_owner_sig", signer_role_id: OWNER_ROLE_ID, field_type: "signature" as const, page_index: 1, x: 0.12, y: 0.2, w: 0.32, h: 0.1, required: true },
    { field_id: "fld_recipient_sig", signer_role_id: RECIPIENT_ROLE_ID, field_type: "signature" as const, page_index: 1, x: 0.52, y: 0.2, w: 0.32, h: 0.1, required: true },
  ];
  if (!ownerAndRecipientPlaced(placed)) {
    throw new Error("4C.2.1 lost owner-chosen placement binding");
  }
  if (placed.every((f) => f.page_index === 0)) {
    throw new Error("4C.2.1 still uses a static page-1 default");
  }
  const href = "/app/esign/doc?vs01_recipient_sign=1&t=secret-reissue-token";
  if (!tokenHiddenFromText("Link prepared. Email unavailable.", href)) {
    throw new Error("reissued token leaked into customer-visible copy");
  }
}
