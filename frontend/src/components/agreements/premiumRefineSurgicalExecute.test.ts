import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./premiumRefineApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./premiumRefineApi")>();
  return {
    ...actual,
    postPremiumRefine: vi.fn(),
  };
});

import { postPremiumRefine } from "./premiumRefineApi";
import { executePremiumRefineUpdate } from "./premiumRefineLateFeeFallback";

function buildLongProDoc(): string {
  const filler = Array.from(
    { length: 220 },
    (_, i) => `Scope line ${i} with obligations, invoicing, and deliverables context filler.\n`,
  ).join("");
  return (
    "# Agreement\n\n## Parties\n\nA and B.\n\n## Scope\n\n" +
    filler +
    "\n## 3.4 Client sign-off\n\nVendor submits work; Client completes checklist in Exhibit A.\n\n" +
    "## 4 Final Payment\n\nClient pays the final invoice within thirty days following sign-off.\n\n" +
    "## Termination\n\nThirty days written notice.\n\nIN WITNESS WHEREOF\n\n__ /s/ __\n"
  );
}

describe("executePremiumRefineUpdate (surgical retry + deliverables fallback)", () => {
  beforeEach(() => {
    vi.mocked(postPremiumRefine).mockReset();
  });

  it("QA: two short API responses then deterministic fallback accepts; preserves headings and witness", async () => {
    const baselineText = buildLongProDoc();
    expect(baselineText.length).toBeGreaterThanOrEqual(15_000);
    const instruction =
      "add in the client will need to approve deliverables before final payment is due";

    const short = baselineText.slice(0, Math.floor(baselineText.length * 0.22));

    vi.mocked(postPremiumRefine)
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["(stub) first pass"],
        readiness_score: 50,
        suggested_next_step: "review",
      })
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["(stub) retry"],
        readiness_score: 50,
        suggested_next_step: "review",
      });

    const out = await executePremiumRefineUpdate({
      baselineText,
      baselineLen: baselineText.length,
      intakeText: "B2B services.",
      userInstruction: instruction,
    });

    expect(out.acceptance.decision).toBe("accepted");
    expect(out.usedClientDeliverablesFinalPaymentFallback).toBe(true);
    expect(out.usedSurgicalPreserveRetry).toBe(true);
    expect(out.surgicalRejectedShortExhausted).toBe(false);
    expect(out.finalText.length).toBeGreaterThanOrEqual(Math.floor(baselineText.length * 0.95));
    const low = out.finalText.toLowerCase();
    expect(low).toContain("deliverables");
    expect(low).toContain("final payment");
    expect(low).toContain("approval");
    expect(out.finalText).toContain("## 3.4");
    expect(out.finalText).toContain("IN WITNESS WHEREOF");
    expect(postPremiumRefine).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postPremiumRefine).mock.calls[1][0]).toMatchObject({ surgical_preserve_retry: true });
  });
});
