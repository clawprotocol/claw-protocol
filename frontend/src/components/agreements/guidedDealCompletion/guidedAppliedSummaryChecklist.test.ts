import { describe, expect, it } from "vitest";
import { buildGuidedAppliedSummaryChecklist } from "./guidedAppliedSummaryChecklist";

describe("buildGuidedAppliedSummaryChecklist", () => {
  it("builds checklist from answered variable ids without DOM markers", () => {
    const checklist = buildGuidedAppliedSummaryChecklist([
      "project_fee_phase_confirmation",
      "saas_sla",
      "ip_ownership",
      "renewal_notice",
      "payment_timing",
    ]);
    expect(checklist).toContain("Fees & Payment");
    expect(checklist).toContain("Support & SLA");
    expect(checklist).toContain("Ownership");
    expect(checklist).toContain("Invoice timing & renewal");
  });

  it("returns empty when no answered ids", () => {
    expect(buildGuidedAppliedSummaryChecklist([])).toEqual([]);
  });
});
