/**
 * Pipeline acceptance probe for create-flow routing — leaf only (no review shell imports).
 * Hash alone is NOT acceptance: professional validation must have passed (TEST522).
 */

import {
  readPaidProPipelineAcceptedCorpusBody,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { hasPaidProPipelineValidationForCorpus } from "./paidProPostAcceptanceValidatorCache";

export function hasPaidCreateFlowPipelineAcceptance(): boolean {
  const body = readPaidProPipelineAcceptedCorpusBody()?.trim() ?? "";
  if (!body || readPaidProPipelineAcceptedCorpusHash() === null) return false;
  return hasPaidProPipelineValidationForCorpus({
    text: body,
    source: "server_full_draft",
  });
}
