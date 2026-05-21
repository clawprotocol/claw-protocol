/**
 * Structured deal-variable extraction — converts material signals into actionable variables.
 */

import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import type { MaterialMissingItem, MaterialSeverity } from "../proAgreementCompleteness/types";
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

function categoryForItem(item: MaterialMissingItem): DealVariableCategory {
  return ID_TO_CATEGORY[item.id] ?? "general";
}

function normalizeLabel(item: MaterialMissingItem): string {
  return item.label.trim() || item.question.slice(0, 80);
}

function materialItemToDealVariable(item: MaterialMissingItem): DealVariable {
  const category = categoryForItem(item);
  const severity = MATERIAL_TO_SEVERITY[item.severity] ?? "optional";
  return {
    id: item.id,
    category,
    label: normalizeLabel(item),
    question: item.question,
    severity,
    suggestedDefaults: suggestedDefaultsForVariable({
      id: item.id,
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
  const vars = material.map(materialItemToDealVariable);
  return dedupeVariables(vars);
}

export function dealVariablesFromMaterialItems(items: readonly MaterialMissingItem[]): DealVariable[] {
  return dedupeVariables(items.map(materialItemToDealVariable));
}
