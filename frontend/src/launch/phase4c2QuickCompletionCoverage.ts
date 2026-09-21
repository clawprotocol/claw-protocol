/**
 * Phase 4C.2 Quick completion contracts — behavioral, not source windows.
 */
import { buildVs01RecipientSignEsignPath, parseEsignDocumentPath, resolveEsignDocumentMode } from "./esignDocumentAccess";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID, ownerAndRecipientPlaced, tokenHiddenFromText } from "./simpleProduct/quickPdfEnvelope";

export function assertPhase4c2QuickCompletionContracts(): void {
  if (parseEsignDocumentPath("/app/esign/doc_phase4c2")?.documentId !== "doc_phase4c2") {
    throw new Error("/app/esign/:documentId must remain the dual-mode document surface");
  }
  if (resolveEsignDocumentMode("?vs01_recipient_sign=1") !== "recipient_sign") {
    throw new Error("Phase 4B.4 recipient mode was lost");
  }
  const href = buildVs01RecipientSignEsignPath({
    documentId: "doc_phase4c2",
    agreementId: "ag-phase4c2",
    token: "secret-token-value",
    recipientIndex: 0,
    signerRoleId: RECIPIENT_ROLE_ID,
  });
  if (!href.startsWith("/app/esign/doc_phase4c2?")) {
    throw new Error("recipient link left the 4B.4 document surface");
  }
  if (!href.includes("vs01_recipient_sign=1")) {
    throw new Error("recipient link lost vs01_recipient_sign");
  }
  if (href.includes("recipient_name=") || href.includes("recipient_email=") || href.includes("vs01_rmanifest") || href.includes("vs01_cpacket")) {
    throw new Error("recipient link carried names, emails, or paper authority");
  }
  const fields = [
    { field_id: "fld_owner_sig", signer_role_id: OWNER_ROLE_ID, field_type: "signature" as const, page_index: 1, x: 0.1, y: 0.2, w: 0.32, h: 0.1, required: true },
    { field_id: "fld_recipient_sig", signer_role_id: RECIPIENT_ROLE_ID, field_type: "signature" as const, page_index: 1, x: 0.5, y: 0.2, w: 0.32, h: 0.1, required: true },
  ];
  if (!ownerAndRecipientPlaced(fields) || fields.some((f) => f.page_index !== 1)) {
    throw new Error("placements must bind owner and recipient roles on a chosen page");
  }
  if (!tokenHiddenFromText("Link prepared. Email unavailable.", href)) {
    throw new Error("token leaked into customer-visible copy");
  }
  if (tokenHiddenFromText("secret-token-value", href)) {
    throw new Error("token guard false-negative");
  }
}
