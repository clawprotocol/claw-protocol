import type { PremiumFullDraftResult } from "./premiumFullDraftApi";

export type PremiumGenerationRetryableClassification = {
  retryable: boolean;
  errorCode: string;
  reason: "wire_flags" | "airlock_empty" | "dev_context_empty" | "degraded_empty_hard";
};

/** HTTP 200 wire body may still be a recoverable generation failure (not success, not network). */
export function classifyPremiumFullDraftGenerationRetryable(
  parsed: Partial<
    PremiumFullDraftResult & {
      generation_ok?: boolean;
      retryable?: boolean;
    }
  >,
): PremiumGenerationRetryableClassification {
  const failCode = String(parsed.server_generation_failure_code || "").trim();
  const genOut = String(parsed.generation_outcome || "").trim();
  const doc = (typeof parsed.document_text === "string" ? parsed.document_text : "").trim();
  const wireRetryable = parsed.retryable === true;
  const wireGenOk = parsed.generation_ok;

  if (wireGenOk === false && wireRetryable) {
    return {
      retryable: true,
      errorCode: failCode || "generation_failed",
      reason: "wire_flags",
    };
  }

  if (failCode === "airlock_blocked" && !doc) {
    return { retryable: true, errorCode: "airlock_blocked", reason: "airlock_empty" };
  }
  if (failCode === "dev_context_leak" && !doc) {
    return { retryable: true, errorCode: "dev_context_leak", reason: "dev_context_empty" };
  }

  const hardDegraded =
    genOut === "degraded" &&
    (failCode === "airlock_blocked" || failCode === "dev_context_leak" || !doc);
  if (hardDegraded && !doc) {
    return {
      retryable: true,
      errorCode: failCode || "degraded_empty",
      reason: "degraded_empty_hard",
    };
  }

  return { retryable: false, errorCode: failCode, reason: "wire_flags" };
}

export function logPremiumAirlockEmptyOutput(payload: Record<string, unknown>): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-airlock-empty-output]", payload);
}

export function logPremiumGenerationRetryableFailure(payload: Record<string, unknown>): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-generation-retryable-failure]", payload);
}

export function logPremiumRetryPreservedContext(payload: Record<string, unknown>): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-retry-preserved-context]", payload);
}
