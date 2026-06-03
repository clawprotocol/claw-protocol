import { paidProVerboseQaLogsEnabled } from "./paidProPerfLogging";

/**
 * One prefix for operator/DEV grepping: [premium-completion-debug]
 * Never log full intake or document text — lengths and codes only.
 */
export type PremiumCompletionDebugPayload = {
  stage: string;
  intakeLen?: number;
  currentDocLen?: number;
  responseBodyLen?: number;
  generationOutcome?: string;
  degraded?: boolean;
  failureCode?: string;
  qualityGateOk?: boolean;
  qualityGateReasons?: string[];
  validationOk?: boolean;
  validationReasons?: string[];
  accStructuralOk?: boolean;
  accStructuralReasons?: string[];
  accepted?: boolean;
  rejectedReason?: string;
  snapshotWritten?: boolean;
  premiumRenderSource?: string;
  httpStatus?: number;
  errSnippet?: string;
  lastClientGate?: {
    accOk: boolean;
    accReasons: string[];
    vPaidOk: boolean;
    vPaidReasons: string[];
    docLen: number;
    effGen: string;
  } | null;
  [key: string]: unknown;
};

export function logPremiumCompletionDebug(payload: PremiumCompletionDebugPayload): void {
  if (import.meta.env.MODE === "test") return;
  if (!paidProVerboseQaLogsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[premium-completion-debug]", {
    t: new Date().toISOString(),
    ...payload,
  });
}
