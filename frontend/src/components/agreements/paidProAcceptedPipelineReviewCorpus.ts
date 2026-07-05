/**
 * Session-scoped pipeline-accepted corpus for paid Pro review render when SoT is not yet frozen.
 * Leaf module — no review shell / AgreementBuilderIntake imports.
 */

import {
  readPaidProPipelineAcceptedCorpusBody,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { hasPaidProPipelineValidationForCorpus } from "./paidProPostAcceptanceValidatorCache";

/** Matches GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN — inlined to avoid simpleProFinalReviewCorpus cycle. */
export const ACCEPTED_PIPELINE_REVIEW_CORPUS_MIN_LEN = 1500;

/** Matches PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN — inlined to avoid paidProDocumentBodyRouter cycle. */
export const ACCEPTED_PIPELINE_REVIEW_MOUNT_MIN_LEN = 1000;

export function readAcceptedPipelineReviewCorpusPlain(): string {
  const body = readPaidProPipelineAcceptedCorpusBody()?.trim() ?? "";
  if (body.length < ACCEPTED_PIPELINE_REVIEW_CORPUS_MIN_LEN) return "";
  if (readPaidProPipelineAcceptedCorpusHash() === null) return "";
  if (
    !hasPaidProPipelineValidationForCorpus({
      text: body,
      source: "server_full_draft",
    })
  ) {
    return "";
  }
  return body;
}

export function hasProfessionallyValidatedPipelineReviewCorpusForRender(): boolean {
  return readAcceptedPipelineReviewCorpusPlain().length >= ACCEPTED_PIPELINE_REVIEW_MOUNT_MIN_LEN;
}

export function hasAcceptedPipelineReviewCorpusForRender(): boolean {
  return readAcceptedPipelineReviewCorpusPlain().length >= ACCEPTED_PIPELINE_REVIEW_MOUNT_MIN_LEN;
}

export function acceptedPipelineReviewCorpusLen(): number {
  return readAcceptedPipelineReviewCorpusPlain().length;
}
