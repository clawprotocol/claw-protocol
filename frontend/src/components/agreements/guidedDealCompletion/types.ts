import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";

export type DealVariableCategory =
  | "compensation"
  | "sla"
  | "payment_timing"
  | "governing_law"
  | "support"
  | "ip_ownership"
  | "audit"
  | "uptime"
  | "notices"
  | "termination"
  | "referral_economics"
  | "milestones"
  | "exclusivity"
  | "confidentiality"
  | "governance"
  | "general";

export type DealVariableSeverity = "critical" | "important" | "optional";

export type DealVariableUiControl = "pills" | "text" | "select";

export type DealVariableDefault = {
  id: string;
  label: string;
  value: string;
  /** Hint shown under pills, e.g. "Most SaaS MSAs use 99.9% uptime." */
  rationale?: string;
};

export type DealVariable = {
  id: string;
  category: DealVariableCategory;
  label: string;
  question: string;
  severity: DealVariableSeverity;
  suggestedDefaults: DealVariableDefault[];
  agreementImpact: string;
  requiredForExecution: boolean;
  applicableAgreementFamilies: CommercialFamilyHint[];
  uiControlType: DealVariableUiControl;
  currentValue: string | null;
  confidence: number;
  affectsSections: string[];
};

export type GuidedCompletionSession = {
  variables: DealVariable[];
  /** Ordered queue for one-at-a-time UX (highest priority first). */
  queue: string[];
  answered: Record<string, string>;
  skipped: Set<string>;
  currentIndex: number;
  completenessPercent: number;
  agreementFamily: CommercialFamilyHint;
  /** Binds queue to premium generation + intake fingerprint. */
  sessionKey?: string;
  /** Frozen at first lock — stable "Question X of Y" for the review session. */
  frozenTotalQuestions?: number;
};

export type GuidedCompletionIntro = {
  headline: string;
  subline: string;
  completenessPercent: number;
  remainingLabels: string[];
};
