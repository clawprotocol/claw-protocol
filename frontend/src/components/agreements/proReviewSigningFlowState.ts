/**
 * Simplified Pro review → signing flow states (review stage only).
 */

import type { UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";

export type ProReviewSigningFlowStateId =
  | "final_review"
  | "edited_version_uploaded"
  | "ready_for_signing"
  | "signing_packet_prepared";

export type ProReviewSigningFlowState = {
  id: ProReviewSigningFlowStateId;
  label: string;
  detail: string | null;
};

const EDITED_INTENT_KEY = "claw_review_edited_version_intent_v1:";

export type EditedVersionIntent = "reference" | "signing" | null;

export function readEditedVersionIntent(agreementId: string | null | undefined): EditedVersionIntent {
  if (!agreementId || typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(`${EDITED_INTENT_KEY}${agreementId.trim()}`);
    if (v === "reference" || v === "signing") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeEditedVersionIntent(agreementId: string, intent: EditedVersionIntent): void {
  if (!agreementId.trim() || typeof sessionStorage === "undefined") return;
  try {
    if (!intent) sessionStorage.removeItem(`${EDITED_INTENT_KEY}${agreementId.trim()}`);
    else sessionStorage.setItem(`${EDITED_INTENT_KEY}${agreementId.trim()}`, intent);
  } catch {
    /* ignore */
  }
}

export function resolveProReviewSigningFlowState(args: {
  uploadedSource: UploadedSourceDocumentRecord | null;
  editedIntent: EditedVersionIntent;
  packetPrepared: boolean;
  packetStale: boolean;
  signersReady: boolean;
  guidedApplied: boolean;
}): ProReviewSigningFlowState {
  if (args.packetPrepared && !args.packetStale) {
    return {
      id: "signing_packet_prepared",
      label: "Signing packet prepared",
      detail: "Review and send when you are ready",
    };
  }
  if (args.uploadedSource && args.editedIntent !== "signing") {
    return {
      id: "edited_version_uploaded",
      label: "Edited version received",
      detail: "Choose how to use the uploaded file",
    };
  }
  if (args.signersReady && args.guidedApplied) {
    return {
      id: "ready_for_signing",
      label: "Ready for signing",
      detail: "Signer details added — LawDog will prepare the packet",
    };
  }
  return {
    id: "final_review",
    label: "Final review",
    detail: args.guidedApplied
      ? "Your agreement is updated — continue when you are ready"
      : "Review your agreement, then continue to signing",
  };
}

export function logProReviewSigningFlowState(state: ProReviewSigningFlowState): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-review-signing-flow-state]", { id: state.id, label: state.label });
}
