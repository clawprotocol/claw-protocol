/**
 * Sanitized committed fixtures for Harbor customer-meaning regressions.
 * Original captured evidence remains under
 * evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037
 * and is not required to run these checks from a clean checkout.
 */
export const HARBOR_SANITIZED_OUTGOING_CONTEXT = {
  purpose: "Biotech, manufacturing workflow implementation plus CRM campaign operations",
  additional_terms: "CRM campaigns, sales representative coverage, and configuration support",
  effective_date: "October 1, 2026",
  termination_summary:
    "Either party may terminate this Agreement for material breach not cured within thirty (30) days after written notice, or for convenience upon thirty (30) days prior written notice to the other party.",
};

export const HARBOR_SANITIZED_PREMIUM_DOCUMENT = [
  "CONSULTING SERVICES AGREEMENT",
  'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
  "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation and also manage CRM campaigns, sales outreach, and configuration support.",
  "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
  "4. TERM AND DURATION. The initial term is twelve (12) months beginning October 1, 2026.",
  "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
].join("\n");

export const HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE = [
  "CONSULTING SERVICES AGREEMENT",
  'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
  "2. SCOPE OF SERVICES. Consultant shall perform professional consulting.",
  "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
  "4. TERM AND DURATION. The initial term is twelve (12) months beginning October 1, 2026.",
  "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
].join("\n");
