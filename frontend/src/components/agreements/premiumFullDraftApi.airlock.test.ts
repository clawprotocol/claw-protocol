import { describe, expect, it, vi } from "vitest";
import { postPremiumFullDraftOnce, type PremiumFullDraftContextPayload } from "./premiumFullDraftApi";
import { classifyPremiumFullDraftGenerationRetryable } from "./premiumGenerationRetryable";

describe("classifyPremiumFullDraftGenerationRetryable", () => {
  it("flags airlock_blocked with empty document", () => {
    const c = classifyPremiumFullDraftGenerationRetryable({
      generation_outcome: "degraded",
      server_generation_failure_code: "airlock_blocked",
      document_text: "",
    });
    expect(c.retryable).toBe(true);
    expect(c.errorCode).toBe("airlock_blocked");
    expect(c.reason).toBe("airlock_empty");
  });

  it("flags wire generation_ok false + retryable", () => {
    const c = classifyPremiumFullDraftGenerationRetryable({
      generation_ok: false,
      retryable: true,
      server_generation_failure_code: "airlock_blocked",
      document_text: "",
    });
    expect(c.retryable).toBe(true);
    expect(c.reason).toBe("wire_flags");
  });
});

describe("postPremiumFullDraftOnce airlock wire", () => {
  it("HTTP 200 degraded airlock empty classifies as retryable generation (WithRetry maps to ok:false)", async () => {
    const body = {
      title: "Agreement",
      document_text: "",
      generation_outcome: "degraded",
      server_generation_failure_code: "airlock_blocked",
      generation_ok: false,
      retryable: true,
      key_terms_found: [],
      missing_material_info: [],
      schema_validation_reasons: ["fallback_suppressed:airlock_blocked"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      }),
    );

    const ctx: PremiumFullDraftContextPayload = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [{ name: "Party A", role: "party" }],
      purpose: "Services",
      payment_terms: "$10,000",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      material_asks: [],
    };
    const wire = await postPremiumFullDraftOnce({
      intakeText: "SaaS between two LLCs. Fee $10,000.",
      context: ctx,
      userGapAnswers: null,
    });
    const c = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(c.retryable).toBe(true);
    expect(c.errorCode).toBe("airlock_blocked");
    expect((wire.document_text || "").trim()).toBe("");
    vi.unstubAllGlobals();
  });

  it("HTTP 503 degraded airlock empty still returns wire for retryable generation", async () => {
    const body = {
      title: "Agreement",
      document_text: "",
      generation_outcome: "degraded",
      server_generation_failure_code: "airlock_blocked",
      generation_ok: false,
      retryable: true,
      key_terms_found: [],
      missing_material_info: [],
      schema_validation_reasons: ["fallback_suppressed:airlock_blocked"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => JSON.stringify(body),
      }),
    );

    const ctx: PremiumFullDraftContextPayload = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [{ name: "Party A", role: "party" }],
      purpose: "Services",
      payment_terms: "$10,000",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      material_asks: [],
    };
    const wire = await postPremiumFullDraftOnce({
      intakeText: "SaaS between two LLCs. Fee $10,000.",
      context: ctx,
      userGapAnswers: null,
    });
    const c = classifyPremiumFullDraftGenerationRetryable(wire);
    expect(c.retryable).toBe(true);
    expect(c.errorCode).toBe("airlock_blocked");
    vi.unstubAllGlobals();
  });
});
