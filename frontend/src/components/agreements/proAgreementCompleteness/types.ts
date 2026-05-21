import type { AgreementFamily } from "../agreementFamilyRouter";

export type MaterialSeverity = "critical" | "material" | "recommended" | "polish";

export type CommercialFamilyHint =
  | AgreementFamily
  | "saas_msa"
  | "referral"
  | "licensing"
  | "partnership"
  | "vendor"
  | "employment"
  | "procurement"
  | "ai_infrastructure";

export type MaterialMissingItem = {
  id: string;
  severity: MaterialSeverity;
  agreementFamily: CommercialFamilyHint;
  label: string;
  question: string;
  whyItMatters: string;
  suggestedAnswerFormat: string;
  affectsSections: string[];
  canProceedWithoutAnswer: boolean;
};

export type ProStructuralIssue = {
  code: string;
  message: string;
  repaired?: boolean;
  catastrophic?: boolean;
};

export type ProAgreementCompletenessResult = {
  text: string;
  structuralOk: boolean;
  structuralCatastrophic: boolean;
  issues: ProStructuralIssue[];
  repairs: string[];
  materialMissingItems: MaterialMissingItem[];
};

export type ProCompletenessContext = {
  intakeRaw?: string | null;
  partyNames?: readonly string[];
  agreementFamily?: AgreementFamily | null;
  surface: string;
};
