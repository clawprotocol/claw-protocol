import { describe, expect, it } from "vitest";
import { classifyPremiumFullDraftGenerationRetryable } from "./premiumGenerationRetryable";

describe("premiumGenerationRetryable classification", () => {
  it("does not retry when degraded has a non-empty document without suppress codes", () => {
    const c = classifyPremiumFullDraftGenerationRetryable({
      generation_outcome: "degraded",
      server_generation_failure_code: "openai_timeout",
      document_text: "A".repeat(500),
    });
    expect(c.retryable).toBe(false);
  });
});
