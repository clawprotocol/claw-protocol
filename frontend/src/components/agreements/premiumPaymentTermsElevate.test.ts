import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { elevatePremiumPaymentTermsFromIntake } from "./premiumPaymentTermsElevate";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function baseDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Acme Co", role: "party" },
      { name: "Beta LLC", role: "party" },
    ],
    purpose: "Marketing support.",
    payment_terms: "s if sales targets are hit",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-01-01",
    payment: emptyPayment,
    ...over,
  };
}

describe("elevatePremiumPaymentTermsFromIntake", () => {
  it("replaces weak payment_terms when intake has a concrete amount", () => {
    const intake = "We agreed on $5000 per month between Acme and Beta for the campaign.";
    const out = elevatePremiumPaymentTermsFromIntake(baseDraft(), intake);
    expect(out.payment_terms).toContain("$5,000");
    expect(out.payment_terms.toLowerCase()).toContain("compensation");
  });

  it("does not overwrite substantive payment language", () => {
    const d = baseDraft({ payment_terms: "Net 30 on all invoices; late fees at 1.5% per month." });
    const out = elevatePremiumPaymentTermsFromIntake(d, "any intake");
    expect(out.payment_terms).toContain("Net 30");
  });

  it("adds commission and retainer language when intake signals exist and terms are weak", () => {
    const intake =
      "10% commission on net sales, $2k monthly retainer against hours, milestone payments on delivery.";
    const out = elevatePremiumPaymentTermsFromIntake(baseDraft({ payment_terms: "TBD" }), intake);
    expect(out.payment_terms.toLowerCase()).toMatch(/commission|retainer|milestone/);
  });

  it("mentions subscription and revenue share when intake signals exist", () => {
    const intake = "Revenue share on net receipts plus $49 monthly SaaS subscription with auto-renew.";
    const out = elevatePremiumPaymentTermsFromIntake(baseDraft({ payment_terms: "TBD" }), intake);
    const low = out.payment_terms.toLowerCase();
    expect(low).toMatch(/revenue|subscription|recurring/);
  });

  it("preserves explicit referral commission timing and exclusions over generic placeholders", () => {
    const intake =
      "Need referral agreement with 7% on closed jobs they source, paid after deposit clears, no commission on house accounts and no commission on existing clients, with clawback refund offsets.";
    const out = elevatePremiumPaymentTermsFromIntake(baseDraft({ payment_terms: "Payment schedule to be agreed." }), intake);
    const low = out.payment_terms.toLowerCase();
    expect(low).toMatch(/7%/);
    expect(low).toMatch(/closed.*jobs|sourced opportunities/);
    expect(low).toMatch(/after deposit clears|cleared customer funds/);
    expect(low).toMatch(/house accounts/);
    expect(low).toMatch(/existing clients/);
    expect(low).toMatch(/clawback|offset/);
    expect(low).not.toMatch(/payment schedule to be agreed|to be determined|to be specified/);
  });
});
