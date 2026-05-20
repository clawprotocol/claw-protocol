import type { ParsedAgreementSection, SectionSemanticKind } from "../proOperationalSynthesis/types";

export type AgreementDocumentSection = ParsedAgreementSection & {
  /** Stable index for section-isolated mutation. */
  index: number;
};

export type AgreementDocument = {
  preamble: string;
  sections: AgreementDocumentSection[];
  footer: string;
};

export type AgreementOutputQualityContext = {
  intakeRaw?: string | null;
  partyNames?: readonly string[];
  agreementFamily?: string | null;
  surface: string;
  /** Starter (free) vs paid Pro authoritative body. */
  tier: "starter" | "premium";
};

export type IntegrityIssue = {
  code: string;
  message: string;
  repaired?: boolean;
};

export type IntegrityResult = {
  ok: boolean;
  text: string;
  issues: IntegrityIssue[];
  repairs: string[];
};

export type RecommendedClarifications = {
  items: string[];
  /** True when body is authoritative but counsel should confirm listed items. */
  advisoryOnly: boolean;
};

export type PremiumCompletionOutcome =
  | "authoritative_draft_complete"
  | "authoritative_draft_complete_with_recommended_clarifications"
  | "clarification_required_before_authoritative_commit"
  | "needs_details"
  | "degraded"
  | "ok";

/** Section kinds where repeated boilerplate is allowed (signature blocks, notices). */
export const BOILERPLATE_REPEAT_ALLOWED_KINDS: ReadonlySet<SectionSemanticKind> = new Set([
  "signatures",
  "contacts",
  "parties",
  "general",
]);
