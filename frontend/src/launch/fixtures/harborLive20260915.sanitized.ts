/**
 * Sanitized reconstruction of quality-eval-live/20260915T125731Z-69053.
 * Derived from saved parse/request/persist records. Not an exact live corpus
 * replay — the rejected premium document_text was withheld and was not captured.
 */
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../corePaidJourneyAcceptanceMatrix";

export const HARBOR_LIVE_20260915_INTAKE = CORE_PAID_JOURNEY_FILLED_INTAKE;

export const HARBOR_LIVE_20260915_BASIC_PARSE = {
  title: "Consulting Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Harbor Peak Analytics LLC", role: "Consultant" },
    { name: "Ironvale Manufacturing Inc", role: "Client" },
  ],
  purpose: "AI workflow implementation",
  payment_terms: "Fixed fee $48,000",
  duration: "twelve months",
  effective_date: "October 1, 2026",
};

export const HARBOR_LIVE_20260915_PREMIUM_PARSE = {
  title: "AI Workflow Implementation Consulting Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Harbor Peak Analytics LLC", role: "Consultant" },
    { name: "Ironvale Manufacturing Inc", role: "Client" },
    { name: "Maya Chen", role: "Consultant signer" },
    { name: "Jordan Hale", role: "Client signer" },
    { name: "maya.chen@harborpeak.test", role: "Consultant signer email" },
    { name: "jordan.hale@ironvale.test", role: "Client signer email" },
  ],
  purpose:
    "Harbor Peak Analytics LLC will provide consulting services to Ironvale Manufacturing Inc focused on AI workflow implementation.",
  payment_terms:
    "Ironvale Manufacturing Inc will pay Harbor Peak Analytics LLC a fixed fee of $48,000 for the AI workflow implementation consulting services.",
};

export const HARBOR_LIVE_20260915_PERSISTED_RECORD = {
  title: "Consulting Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    {
      name: "Harbor Peak Analytics LLC",
      role: "Client",
      email: "maya.chen@harborpeak.test",
      signerName: "Maya Chen",
    },
    {
      name: "Ironvale Manufacturing Inc.",
      role: "Service Provider",
      email: "jordan.hale@ironvale.test",
      signerName: "Jordan Hale",
    },
  ],
  purpose:
    "AI workflow implementation\n\n1. Purpose and Scope\nService Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance for Client.",
};

export const HARBOR_LIVE_20260915_PREMIUM_REQUEST_PARTIES = [
  { name: "Harbor Peak Analytics LLC", role: "Consultant" },
  { name: "Ironvale Manufacturing Inc.", role: "Client" },
];

export const HARBOR_LIVE_20260915_VALIDATION = {
  generation_outcome: "degraded",
  server_generation_failure_code: "agreement_validation_failed",
  validation_failures: ["fallback_applicable_party"],
  schema_validation_reasons: ["simple_consulting_section_bloat:sections=15>14"],
  document_text_preserved: false,
  note: "Rejected corpus was emptied on the wire and was not captured locally. Keyword summaries are not a replay.",
};
