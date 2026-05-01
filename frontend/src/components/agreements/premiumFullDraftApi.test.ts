import { afterEach, describe, expect, it, vi } from "vitest";
import { postPremiumFullDraftOnce } from "./premiumFullDraftApi";

const minimalContext = {
  title: "T",
  jurisdiction: "DE",
  parties: [{ name: "A", role: "a" }],
  purpose: "p",
  payment_terms: "",
  duration: null as string | null,
  due_date: null as string | null,
  effective_date: null as string | null,
  agreement_family: "",
  material_asks: [] as string[],
};

describe("postPremiumFullDraftOnce", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs status and structured detail when server returns 503 JSON (dev)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({
            detail: {
              code: "premium_full_draft_response_serialization_failed",
              message: "TypeError",
              stage: "response_serialize",
            },
          }),
      }),
    );
    await expect(
      postPremiumFullDraftOnce({
        intakeText: "x".repeat(80),
        context: minimalContext,
      }),
    ).rejects.toThrow();
    const joined = JSON.stringify(warn.mock.calls);
    expect(joined).toContain("503");
    expect(joined).toContain("premium_full_draft_response_serialization_failed");
    warn.mockRestore();
  });
});
