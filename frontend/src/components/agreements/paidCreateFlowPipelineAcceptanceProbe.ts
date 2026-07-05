/**
 * Pipeline acceptance probe for create-flow routing — leaf only (no review shell imports).
 */

import { readPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

export function hasPaidCreateFlowPipelineAcceptance(): boolean {
  return readPaidProPipelineAcceptedCorpusHash() !== null;
}
