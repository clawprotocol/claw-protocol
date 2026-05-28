/** Internal structures for Pro operational agreement synthesis (client-side). */
import type { CommercialFactGraph } from "./commercialFactGraph";

export type PartyResponsibilityProfile = {
  party: string;
  shortName: string;
  inferredRole: string;
  responsibilities: string[];
};

export type DealDnaArchetype =
  | "multi_party_implementation_consortium"
  | "vendor_saas_agreement"
  | "managed_services_agreement"
  | "contractor_services_agreement"
  | "reseller_agreement"
  | "licensing_agreement"
  | "nda_confidentiality"
  | "joint_venture_rollout"
  | "generic_commercial";

export type DealDnaProfile = {
  archetype: DealDnaArchetype;
  confidence: "high" | "medium" | "low";
  specificityLevel: "high" | "medium" | "standard";
  governanceComplexity: "light" | "standard" | "enterprise";
  draftingStyle: "operational" | "balanced" | "conservative";
  clauseWeights: Record<string, number>;
  signals: string[];
};

export type SectionSemanticKind =
  | "parties"
  | "scope"
  | "payment"
  | "milestones"
  | "governance"
  | "sla"
  | "ip"
  | "confidentiality"
  | "termination"
  | "dispute"
  | "contacts"
  | "signatures"
  | "general";

export type ParsedAgreementSection = {
  heading: string;
  kind: SectionSemanticKind;
  body: string;
  startLine: number;
};

export type SectionPurityIssue = {
  sectionKind: SectionSemanticKind;
  heading: string;
  outlierSentence: string;
  detectedAs: SectionSemanticKind;
  action: "relocated" | "removed" | "kept";
};

export type ProOperationalSynthesisResult = {
  responsibilities: PartyResponsibilityProfile[];
  dealDna: DealDnaProfile;
  commercialFactGraph: CommercialFactGraph;
  materialAskLines: string[];
  modelGuidanceBlock: string;
};

export type ProOperationalSynthesisPassLog = {
  operationalSpecificity: { replaced: number };
  repetitionCompression: { diversified: number };
  sectionPurity: { issues: number; relocated: number };
  milestoneTable: { inserted: boolean };
  enterpriseReadability: { hedgesReduced: number };
};
