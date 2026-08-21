import { describe, expect, it } from "vitest";
import {
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
  isOkPaidGenerationSoTResponse,
  isTruncatedKeepSoTResponse,
} from "./premiumAcceptancePolicy";

describe("isOkPaidGenerationSoTResponse (live Mike-paint 2026-08-21)", () => {
  it("latches the live 12k ok body", () => {
    expect(
      isOkPaidGenerationSoTResponse({
        generationOutcome: "ok",
        documentTextLen: 12182,
      }),
    ).toBe(true);
  });

  it("does not latch degraded truncated-keep cases (those have their own latch)", () => {
    expect(
      isOkPaidGenerationSoTResponse({
        generationOutcome: "degraded",
        documentTextLen: 12182,
      }),
    ).toBe(false);
    expect(
      isTruncatedKeepSoTResponse({
        generationOk: true,
        retryable: false,
        generationOutcome: "degraded",
        failureCode: "output_truncated",
        documentTextLen: 1800,
      }),
    ).toBe(true);
  });

  it("does not latch a thin starter or a hard reject", () => {
    expect(
      isOkPaidGenerationSoTResponse({
        generationOutcome: "ok",
        documentTextLen: 937,
      }),
    ).toBe(false);
    expect(
      isOkPaidGenerationSoTResponse({
        generationOutcome: "ok",
        documentTextLen: 12182,
        hardRejected: true,
      }),
    ).toBe(false);
    expect(PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN).toBe(4000);
  });
});
