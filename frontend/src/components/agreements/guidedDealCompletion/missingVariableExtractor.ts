/**
 * Structured deal-variable extraction — converts material signals into actionable variables.
 */

import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import type { MaterialMissingItem, MaterialSeverity } from "../proAgreementCompleteness/types";
import { isConsultingDevIntake } from "./consultingGuidedIntake";
import { enrichDealVariables } from "./intakeRecommendationEngine";
import { suggestedDefaultsForVariable } from "./suggestedDefaultsEngine";
import type { DealVariable, DealVariableCategory, DealVariableSeverity } from "./types";

const MATERIAL_TO_SEVERITY: Record<MaterialSeverity, DealVariableSeverity> = {
  critical: "critical",
  material: "important",
  recommended: "optional",
  polish: "optional",
};

const ID_TO_CATEGORY: Record<string, DealVariableCategory> = {
  payment_timing: "payment_timing",
  payment_structure: "compensation",
  support_obligations: "support",
  scope_change_approval: "general",
  governing_law_notice: "governing_law",
  ip_ownership: "ip_ownership",
  saas_sla: "sla",
  referral_economics: "referral_economics",
  milestone_schedule: "milestones",
  governing_venue: "governing_law",
  ip_allocation: "ip_ownership",
  nda_survival: "confidentiality",
  exclusivity_scope: "exclusivity",
  audit_scope: "audit",
  license_scope: "ip_ownership",
  jv_contributions: "governance",
  jv_ip_governance: "governance",
  ai_deployment: "milestones",
  ai_ops_economics: "sla",
};

const MATERIAL_GAP_FALLBACK_RULES: readonly {
  id: string;
  re: RegExp;
}[] = [
  { id: "payment_structure", re: /\b(?:fee structure|payment structure|compensation|how.*paid|no fee)\b/i },
  { id: "support_obligations", re: /\b(?:support obligation|post[- ]?delivery|maintenance|handoff)\b/i },
  { id: "scope_change_approval", re: /\b(?:scope approval|change order|evolving scope|flexible scope|scope may)\b/i },
  { id: "ip_ownership", re: /\b(?:ip ownership|work product|deliverable ownership|intellectual property)\b/i },
  { id: "governing_law_notice", re: /\b(?:governing law|notice address|venue|jurisdiction)\b/i },
];

function categoryForItem(item: MaterialMissingItem): DealVariableCategory {
  return ID_TO_CATEGORY[item.id] ?? "general";
}

function normalizeLabel(item: MaterialMissingItem): string {
  return item.label.trim() || item.question.slice(0, 80);
}

function remapMaterialId(item: MaterialMissingItem, intakeRaw?: string | null): string {
  const text = `${item.id} ${item.label} ${item.question}`.toLowerCase();
  for (const rule of MATERIAL_GAP_FALLBACK_RULES) {
    if (rule.re.test(text)) return rule.id;
  }
  if (item.id === "payment_timing" && isConsultingDevIntake(intakeRaw)) {
    return "payment_structure";
  }
  if (item.id === "ip_allocation") return "ip_ownership";
  if (item.id === "governing_venue") return "governing_law_notice";
  return item.id;
}

function materialItemToDealVariable(item: MaterialMissingItem, intakeRaw?: string | null): DealVariable {
  const id = remapMaterialId(item, intakeRaw);
  const category = categoryForItem({ ...item, id });
  const severity = MATERIAL_TO_SEVERITY[item.severity] ?? "optional";
  return {
    id,
    category,
    label: normalizeLabel(item),
    question: item.question,
    severity,
    suggestedDefaults: suggestedDefaultsForVariable({
      id,
      category,
      family: item.agreementFamily,
    }),
    agreementImpact: item.whyItMatters,
    requiredForExecution: severity === "critical" || (severity === "important" && !item.canProceedWithoutAnswer),
    applicableAgreementFamilies: [item.agreementFamily],
    uiControlType: "pills",
    currentValue: null,
    confidence: severity === "critical" ? 0.35 : severity === "important" ? 0.55 : 0.75,
    affectsSections: item.affectsSections,
  };
}

function dedupeVariables(vars: DealVariable[]): DealVariable[] {
  const out: DealVariable[] = [];
  const seenQ = new Set<string>();
  const seenLabel = new Set<string>();
  for (const v of vars) {
    const qKey = v.question.toLowerCase().replace(/\W+/g, " ").trim();
    const lKey = v.label.toLowerCase();
    if (seenQ.has(qKey) || seenLabel.has(lKey)) continue;
    seenQ.add(qKey);
    seenLabel.add(lKey);
    out.push(v);
  }
  return out;
}

function inferConsultingVariablesFromIntake(
  intakeRaw: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  if (!isConsultingDevIntake(intakeRaw, body)) return [];
  const low = body.toLowerCase();
  const intakeLow = intakeRaw.toLowerCase();
  const inferred: MaterialMissingItem[] = [];

  const push = (item: Omit<MaterialMissingItem, "agreementFamily">) => {
    inferred.push({ ...item, agreementFamily: family });
  };

  if (
    !/\b(?:hourly|fixed fee|retainer|milestone|per hour|project fee)\b/i.test(low) ||
    /\b(?:to be agreed|tbd|confirm in writing)\b/i.test(low)
  ) {
    push({
      id: "payment_structure",
      severity: "material",
      label: "Payment structure",
      question: "How should the developer be paid?",
      whyItMatters: "Clear payment structure reduces disputes if scope expands later.",
      suggestedAnswerFormat: "e.g. monthly retainer, milestone-based, hourly",
      affectsSections: ["Compensation", "Fees", "Payment"],
      canProceedWithoutAnswer: true,
    });
  }

  if (
    /\bsupport\b/i.test(intakeLow) &&
    !/\b(?:support|maintenance|handoff)\b[\s\S]{0,100}\b(?:included|hours|days|period|business)\b/i.test(low)
  ) {
    push({
      id: "support_obligations",
      severity: "material",
      label: "Support obligations",
      question: "What support should be included after delivery?",
      whyItMatters: "This determines whether bug fixes and maintenance are included after delivery.",
      suggestedAnswerFormat: "e.g. 30-day business-hours support, handoff only",
      affectsSections: ["Support", "Services"],
      canProceedWithoutAnswer: true,
    });
  }

  if (
    /\b(?:evolv|flexib|chang|scope may)\b/i.test(intakeLow) &&
    !/\b(?:change order|sow|written approval|email approval)\b/i.test(low)
  ) {
    push({
      id: "scope_change_approval",
      severity: "material",
      label: "Scope change approvals",
      question: "How should evolving scope be approved?",
      whyItMatters: "This helps prevent disagreements when requirements evolve.",
      suggestedAnswerFormat: "e.g. email approval, signed change order",
      affectsSections: ["Scope", "Change Control"],
      canProceedWithoutAnswer: true,
    });
  }

  if (/\b(?:ip|work product|ownership)\b/i.test(intakeLow) && !/\b(?:owns|ownership|assign)\b[\s\S]{0,80}\bdeliverable/i.test(low)) {
    push({
      id: "ip_ownership",
      severity: "material",
      label: "IP ownership",
      question: "Who should own the work product?",
      whyItMatters: "Ownership rules control who can use, modify, and resell the work product.",
      suggestedAnswerFormat: "e.g. company owns deliverables",
      affectsSections: ["Intellectual Property", "Work Product"],
      canProceedWithoutAnswer: true,
    });
  }

  return dedupeVariables(inferred.map((i) => materialItemToDealVariable(i, intakeRaw)));
}

export function extractDealVariables(args: {
  intakeRaw?: string | null;
  body?: string;
  materialItems?: readonly MaterialMissingItem[];
  structuralIssues?: readonly { code: string; message: string }[];
  serverMissing?: readonly string[];
}): DealVariable[] {
  const material =
    args.materialItems ??
    buildMaterialMissingItems({
      intakeRaw: args.intakeRaw,
      body: args.body ?? "",
      structuralIssues: args.structuralIssues,
      serverMissing: args.serverMissing,
    });
  const intake = (args.intakeRaw || "").trim();
  const body = (args.body ?? "").trim();
  const family = material[0]?.agreementFamily ?? "generic_business_agreement";
  let vars = dedupeVariables(material.map((m) => materialItemToDealVariable(m, intake)));
  const inferred = inferConsultingVariablesFromIntake(intake, body, family);
  for (const v of inferred) {
    if (!vars.some((x) => x.id === v.id)) vars.push(v);
  }
  vars = dedupeVariables(vars);
  return enrichDealVariables(intake || null, vars);
}

export function dealVariablesFromMaterialItems(
  items: readonly MaterialMissingItem[],
  intakeRaw?: string | null,
): DealVariable[] {
  return enrichDealVariables(intakeRaw ?? null, dedupeVariables(items.map((m) => materialItemToDealVariable(m, intakeRaw))));
}
