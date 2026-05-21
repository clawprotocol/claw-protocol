/**
 * Structured deal-variable extraction — converts material signals into actionable variables.
 */

import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import type { MaterialMissingItem, MaterialSeverity } from "../proAgreementCompleteness/types";
import { scanBodyMaterialPlaceholders } from "./bodyMaterialPlaceholderScanner";
import { isConsultingDevIntake } from "./consultingGuidedIntake";
import { isContractorDeveloperIntake } from "./contractorGuidedIntake";
import { analyzeServicesMigrationIntake, isServicesMigrationIntake } from "./servicesMigrationGuidedIntake";
import { detectContradictoryTerms, detectIpOwnershipContradiction } from "./detectContradictoryTerms";
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
  ip_ownership_contradiction: "ip_ownership",
  term_structure_contradiction: "termination",
  license_background_tools: "ip_ownership",
  deliverables_scope: "milestones",
  saas_sla: "sla",
  referral_economics: "referral_economics",
  milestone_schedule: "milestones",
  governing_venue: "governing_law",
  ip_allocation: "ip_ownership",
  nda_survival: "confidentiality",
  exclusivity_scope: "exclusivity",
  audit_scope: "audit",
  license_scope: "ip_ownership",
  party_legal_names: "notices",
  total_fee_confirmation: "compensation",
  phase_payment_allocation: "milestones",
  security_obligations: "general",
  renewal_notice: "termination",
  supplemental_schedule_confirmation: "milestones",
  writing_before_execution: "general",
  amount_to_be_confirmed: "compensation",
  payment_timing_to_be_confirmed: "payment_timing",
  as_specified_in_schedule_a: "milestones",
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

const PRESERVE_MATERIAL_IDS = new Set([
  "ip_ownership_contradiction",
  "term_structure_contradiction",
  "license_background_tools",
  "party_legal_names",
  "total_fee_confirmation",
  "phase_payment_allocation",
  "security_obligations",
  "renewal_notice",
  "supplemental_schedule_confirmation",
  "writing_before_execution",
  "amount_to_be_confirmed",
  "payment_timing_to_be_confirmed",
  "as_specified_in_schedule_a",
]);

function remapMaterialId(item: MaterialMissingItem, intakeRaw?: string | null): string {
  if (PRESERVE_MATERIAL_IDS.has(item.id)) return item.id;
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
  const hasIpContradiction = vars.some((v) => v.id === "ip_ownership_contradiction");
  const out: DealVariable[] = [];
  const seenQ = new Set<string>();
  const seenLabel = new Set<string>();
  for (const v of vars) {
    if (hasIpContradiction && (v.id === "ip_ownership" || v.id === "ip_allocation")) continue;
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

  if (
    !detectIpOwnershipContradiction(intakeRaw) &&
    /\b(?:ip|work product|ownership)\b/i.test(intakeLow) &&
    !/\b(?:owns|ownership|assign)\b[\s\S]{0,80}\bdeliverable/i.test(low)
  ) {
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

function inferContractorVariablesFromIntake(
  intakeRaw: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  if (!isContractorDeveloperIntake(intakeRaw)) return [];
  const low = body.toLowerCase();
  const intakeLow = intakeRaw.toLowerCase();
  const inferred: MaterialMissingItem[] = [];
  const push = (item: Omit<MaterialMissingItem, "agreementFamily">) => {
    inferred.push({ ...item, agreementFamily: family });
  };

  if (
    !/\b(?:hourly|fixed fee|retainer|milestone|per hour|monthly)\b/i.test(low) &&
    !/\b(?:hourly|fixed fee|retainer|milestone|month[-\s]?to[-\s]?month)\b/i.test(intakeLow)
  ) {
    push({
      id: "payment_structure",
      severity: "material",
      label: "Payment structure",
      question: "How should the developer be paid?",
      whyItMatters: "Clear payment structure keeps month-to-month or project billing predictable.",
      suggestedAnswerFormat: "e.g. monthly retainer, hourly, fixed fee",
      affectsSections: ["Compensation", "Fees", "Payment"],
      canProceedWithoutAnswer: true,
    });
  }

  if (
    /\b(?:work\s+product|developer|contractor)\b/i.test(intakeLow) &&
    !/\b(?:background|pre[- ]?existing|embedded|license)\b[\s\S]{0,120}\b(?:perpetual|license)\b/i.test(low)
  ) {
    push({
      id: "license_background_tools",
      severity: "material",
      label: "License / background tools",
      question: "How should background tools and embedded materials be licensed?",
      whyItMatters:
        "If the developer keeps reusable tools, the company usually needs a clear license to use deliverables that include those materials.",
      suggestedAnswerFormat: "e.g. perpetual license to embedded tools",
      affectsSections: ["Intellectual Property", "License"],
      canProceedWithoutAnswer: true,
    });
  }

  if (!/\b(?:deliverable|scope of work|services include|will deliver)\b/i.test(low)) {
    push({
      id: "deliverables_scope",
      severity: "material",
      label: "Deliverables",
      question: "What will the developer deliver?",
      whyItMatters: "Defined deliverables set expectations for what is in and out of scope.",
      suggestedAnswerFormat: "e.g. software development, product buildout",
      affectsSections: ["Services", "Deliverables", "Scope"],
      canProceedWithoutAnswer: true,
    });
  }

  return dedupeVariables(inferred.map((i) => materialItemToDealVariable(i, intakeRaw)));
}

function inferServicesMigrationVariablesFromIntake(
  intakeRaw: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  if (!isServicesMigrationIntake(intakeRaw, body)) return [];
  const signals = analyzeServicesMigrationIntake(intakeRaw, body);
  const low = body.toLowerCase();
  const inferred: MaterialMissingItem[] = [];
  const push = (item: Omit<MaterialMissingItem, "agreementFamily">) => {
    inferred.push({ ...item, agreementFamily: family });
  };

  if (signals.informalParties && !/\b(?:LLC|Inc\.|Corp\.)\b/i.test(body.slice(0, 1200))) {
    push({
      id: "party_legal_names",
      severity: "material",
      label: "Party legal names",
      question: "What are the full legal names of each party (and signer titles)?",
      whyItMatters: "Informal party labels need legal entity names for execution and notices.",
      suggestedAnswerFormat: "e.g. Lighthouse Digital LLC; Apex Ops Inc.",
      affectsSections: ["Parties", "Notices"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.vagueFee || /\bto be confirmed\b/i.test(low)) {
    push({
      id: "total_fee_confirmation",
      severity: "material",
      label: "Total fee",
      question: "What is the total contract fee and currency?",
      whyItMatters: "Fee is vague or deferred — confirm the total before execution.",
      suggestedAnswerFormat: "e.g. $120,000 USD",
      affectsSections: ["Compensation", "Schedule A"],
      canProceedWithoutAnswer: false,
    });
  }
  if (signals.mentionsPhases) {
    push({
      id: "phase_payment_allocation",
      severity: "material",
      label: "Phase payment allocation",
      question: "How should fees split across build, rollout, and support phases?",
      whyItMatters: "Phase economics belong in Schedule A with clear triggers.",
      suggestedAnswerFormat: "e.g. 40% build, 40% rollout, 20% support",
      affectsSections: ["Schedule A", "Milestones"],
      canProceedWithoutAnswer: false,
    });
  }
  if (!/\bnet\s+\d+\b/i.test(low) || /\bpayment timing:\s*to be confirmed\b/i.test(low)) {
    push({
      id: "payment_timing",
      severity: "material",
      label: "Invoice timing",
      question: "When are invoices due and what triggers each phase payment?",
      whyItMatters: "Invoice due dates must be explicit for enforcement.",
      suggestedAnswerFormat: "e.g. Net 30; due on phase acceptance",
      affectsSections: ["Payment", "Invoicing"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.mentionsSupport || signals.mentionsSla) {
    push({
      id: "saas_sla",
      severity: "material",
      label: "Support / SLA level",
      question: "What support hours, response times, and uptime target apply?",
      whyItMatters: "Support and SLA expectations must be measurable after go-live.",
      suggestedAnswerFormat: "e.g. 99.5% uptime; 4h critical response",
      affectsSections: ["Support", "SLA"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.mentionsSecurity) {
    push({
      id: "security_obligations",
      severity: "material",
      label: "Security obligations",
      question: "What security and data-protection obligations apply?",
      whyItMatters: "Migration deals need clear security baselines and breach notice.",
      suggestedAnswerFormat: "e.g. encryption; 72h breach notice",
      affectsSections: ["Security", "Data Protection"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.mentionsIp && !/\b(?:assign|owns|ownership)\b[\s\S]{0,80}\bdeliverable/i.test(low)) {
    push({
      id: "ip_ownership",
      severity: "material",
      label: "IP / deliverables ownership",
      question: "Who owns deliverables, dashboards, and custom work product?",
      whyItMatters: "IP ownership controls use, modification, and resale of deliverables.",
      suggestedAnswerFormat: "e.g. Client owns custom deliverables; vendor retains tools",
      affectsSections: ["Intellectual Property", "Work Product"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.vagueRenewal) {
    push({
      id: "renewal_notice",
      severity: "material",
      label: "Renewal / non-renewal",
      question: "How does renewal work and how much notice is required to terminate?",
      whyItMatters: "Renewal and notice periods control how either side exits.",
      suggestedAnswerFormat: "e.g. 30 days notice; auto-renew 12 months",
      affectsSections: ["Term", "Renewal"],
      canProceedWithoutAnswer: true,
    });
  }
  if (signals.vagueGoverningLaw || !/\blaws of the state of\b/i.test(low)) {
    push({
      id: "governing_law_notice",
      severity: "material",
      label: "Governing law",
      question: "Which state's law governs this agreement?",
      whyItMatters: "Governing law affects enforceability and dispute forum.",
      suggestedAnswerFormat: "e.g. Texas",
      affectsSections: ["Governing Law"],
      canProceedWithoutAnswer: true,
    });
  }

  return dedupeVariables(inferred.map((i) => materialItemToDealVariable(i, intakeRaw)));
}

function synthesizeFallbackGuidedVariables(
  intakeRaw: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  const intake = intakeRaw.trim();
  if (!intake && !body.trim()) return [];
  const items: MaterialMissingItem[] = [];
  for (const signal of detectContradictoryTerms(intake, family)) {
    items.push(signal.item);
  }
  for (const bodyItem of scanBodyMaterialPlaceholders(body, family)) {
    if (!items.some((x) => x.id === bodyItem.id)) items.push(bodyItem);
  }
  const contractor = inferContractorVariablesFromIntake(intake, body, family);
  const consulting = inferConsultingVariablesFromIntake(intake, body, family);
  const services = inferServicesMigrationVariablesFromIntake(intake, body, family);
  const vars = [
    ...items.map((m) => materialItemToDealVariable(m, intake)),
    ...contractor,
    ...consulting,
    ...services,
  ];
  return dedupeVariables(vars);
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
  const synthesized = synthesizeFallbackGuidedVariables(intake, body, family);
  for (const v of synthesized) {
    if (!vars.some((x) => x.id === v.id)) vars.push(v);
  }
  for (const bodyItem of scanBodyMaterialPlaceholders(body, family)) {
    const v = materialItemToDealVariable(bodyItem, intake);
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
