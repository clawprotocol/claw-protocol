import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizePremiumAgreement, postPremiumFullDraftOnce } from "./premiumFullDraftApi";

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

describe("finalizePremiumAgreement", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to premium finalize endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          finalized: true,
          reason: "clarifications_answered",
          document_text: "final agreement text",
          agreement_validation: {
            passed: true,
            failures: [],
            warnings: [],
            minimum_contract_elements: {
              identifiable_parties: true,
              agreement_purpose_or_scope: true,
              exchange_of_value_or_consideration: true,
              obligations_or_performance: true,
              execution_or_acceptance_mechanism: true,
            },
            summary: { failure_count: 0, warning_count: 0, checked_at: "now" },
          },
          agreement_intelligence: {
            extracted_terms: { parties: [], party_roles: [] },
            ambiguities: [],
            conflicts: [],
            missing_material_terms: [],
            recommended_questions: [],
            quality_flags: [],
          },
          model_call_count: 1,
          repair_attempted: true,
          repair_succeeded: true,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await finalizePremiumAgreement({
      original_intake: "intake",
      first_draft: "draft",
      agreement_intelligence: null,
      agreement_validation: null,
      clarification_answers: [{ question: "Q?", answer: "A" }],
    });

    expect(result.repair_succeeded).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/agreements/premium/finalize");
    expect(JSON.parse(String(init.body))).toMatchObject({
      original_intake: "intake",
      first_draft: "draft",
    });
  });

  it("handles malformed response safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ nope: true }),
      }),
    );

    await expect(
      finalizePremiumAgreement({
        original_intake: "intake",
        first_draft: "draft",
      }),
    ).rejects.toThrow("premium_finalization_malformed_response");
  });

  it("throws a safe error for non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ detail: { message: "bad request" } }),
      }),
    );

    await expect(
      finalizePremiumAgreement({
        original_intake: "intake",
        first_draft: "draft",
      }),
    ).rejects.toThrow("bad request");
  });
});
