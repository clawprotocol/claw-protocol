/**
 * Upload counterparty / reviewer edited version from Pro review stage.
 */

import { extractRevisedDraftPlainText } from "../../agreement/recipientRevisedDraftImportText";
import { invalidateSigningPacketPrep } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { writeUploadedSourceDocument, type UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";
import { writeEditedVersionIntent } from "./proReviewSigningFlowState";

export type ReviewEditedVersionUploadResult =
  | { ok: true; record: UploadedSourceDocumentRecord; text: string }
  | { ok: false; userMessage: string };

export async function processReviewEditedVersionUpload(args: {
  agreementId: string;
  file: File;
}): Promise<ReviewEditedVersionUploadResult> {
  // eslint-disable-next-line no-console
  console.info("[review-edited-version-upload-start]", {
    agreementIdShort: args.agreementId.slice(0, 8),
    fileName: args.file.name,
    size: args.file.size,
  });
  try {
    const extracted = await extractRevisedDraftPlainText(args.file);
    if (!extracted.ok) {
      return { ok: false, userMessage: extracted.error };
    }
    const text = (extracted.text || "").trim();
    if (text.length < 80) {
      return {
        ok: false,
        userMessage: "That file did not contain enough agreement text. Try a clearer PDF or paste a text export.",
      };
    }
    const record: UploadedSourceDocumentRecord = {
      text,
      fileName: args.file.name,
      savedAt: Date.now(),
    };
    writeUploadedSourceDocument(args.agreementId, record);
    writeEditedVersionIntent(args.agreementId, "reference");
    invalidateSigningPacketPrep("review_upload_received");
    // eslint-disable-next-line no-console
    console.info("[review-packet-invalidated-by-upload]", { agreementIdShort: args.agreementId.slice(0, 8) });
    // eslint-disable-next-line no-console
    console.info("[review-edited-version-upload-success]", {
      agreementIdShort: args.agreementId.slice(0, 8),
      textLen: text.length,
    });
    return { ok: true, record, text };
  } catch {
    return { ok: false, userMessage: "Could not read that file. Try PDF or plain text." };
  }
}

export function logReviewEditedVersionSelectedForSigning(agreementId: string): void {
  writeEditedVersionIntent(agreementId, "signing");
  invalidateSigningPacketPrep("review_upload_selected_for_signing");
  // eslint-disable-next-line no-console
  console.info("[review-edited-version-selected-for-signing]", {
    agreementIdShort: agreementId.slice(0, 8),
  });
  // eslint-disable-next-line no-console
  console.info("[review-packet-invalidated-by-upload]", { reason: "selected_for_signing" });
}

export function logReviewEditedVersionKeptAsReference(agreementId: string): void {
  writeEditedVersionIntent(agreementId, "reference");
  // eslint-disable-next-line no-console
  console.info("[review-edited-version-kept-as-reference]", {
    agreementIdShort: agreementId.slice(0, 8),
  });
}
