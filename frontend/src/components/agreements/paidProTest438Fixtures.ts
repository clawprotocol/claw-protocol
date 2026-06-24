/**
 * TEST438 — Red Mesa / Harbor Peak free starter formatting regression (2-party Oklahoma consulting).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import { TEST435_HARBOR_PEAK, TEST435_RED_MESA } from "./paidProTest435Fixtures";

/** Exact manual QA prompt from TEST438. */
export const TEST438_INTAKE = [
  "Client: Red Mesa Logistics LLC",
  "Service Provider: Harbor Peak Automation LLC",
  "Workflow automation consulting, systems integration support, reporting dashboards, and operational process optimization services.",
  "Term: 12 months",
  "Fee: $5,000 per month",
  "Payment due within 15 days of invoice.",
  "Governing law: Oklahoma.",
].join("\n");

export function test438Draft(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: TEST435_RED_MESA, role: "Client" },
      { name: TEST435_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose:
      "Workflow automation consulting, systems integration support, reporting dashboards, and operational process optimization services.",
    payment_terms: "$5,000 per month. Payment due within 15 days of invoice.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 5000, cadence: "monthly", valid: true },
    agreement_family: "services_agreement",
  };
}

/** API-style draft where duration was parsed as a bare number (formatting regression trigger). */
export function test438DraftBareDuration(): ParsedDraftShape {
  return {
    ...test438Draft(),
    duration: "12",
    effective_date: "upon full execution by both parties",
  };
}

/** Structured coercion echo (~375 chars) that can beat the homepage paste in UI state. */
export function test438StructuredCoercionIntake(): string {
  return buildReviewCoercionRawIntakeFromDraft(test438Draft(), "");
}
