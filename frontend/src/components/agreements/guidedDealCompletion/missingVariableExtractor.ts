/**
 * Structured deal-variable extraction — converts material signals into actionable variables.
 */

import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import type { MaterialMissingItem, MaterialSeverity } from "../proAgreementCompleteness/types";
import { validateProAgreementConfidenceGate } from "../proFullAgreementCandidate";
import { scanBodyMaterialPlaceholders } from "./bodyMaterialPlaceholderScanner";
import { isConsultingDevIntake } from "./consultingGuidedIntake";
import { isContractorDeveloperIntake } from "./contractorGuidedIntake";
import {
  analyzeServicesMigrationIntake,
  intakeDisclaimsThirdPartyUptimeGuarantee,
  intakeSpecifies403030PhaseSplit,
  isAutomationServicesIntake,
  isServicesMigrationIntake,
} from "./servicesMigrationGuidedIntake";
import { isGuidedVariableSatisfiedByIntake } from "./guidedIntakeFactPrefill";
import { parseMonthlyPaymentUsdHint } from "./intakeRecommendationEngine";
import {
  detectSemanticContractGaps,
  hasSemanticMaterialGaps,
  semanticGapsToMaterialItems,
} from "./semanticContractCompleteness";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";
import { detectContradictoryTerms, detectIpOwnershipContradiction } from "./detectContradictoryTerms";
import { enrichDealVariables } from "./intakeRecommendationEngine";
import { suggestedDefaultsForVariable } from "./suggestedDefaultsEngine";
import type { DealVariable, DealVariableCategory, DealVariableSeverity } from "./types";

const AI_AUTOMATION_ALLOWED_GUIDED_IDS = new Set([
  "payment_timing",
  "payment_structure",
  "total_fee_confirmation",
  "project_fee_phase_confirmation",
  "amount_to_be_confirmed",
  "payment_timing_to_be_confirmed",
  "phase_payment_allocation",
  "milestone_schedule",
  "supplemental_schedule_confirmation",
  "as_specified_in_schedule_a",
  "ip_ownership",
  "ip_allocation",
  "license_background_tools",
  "support_obligations",
  "saas_sla",
  "renewal_notice",
  "termination",
  "governing_law_notice",
  "governing_venue",
  "security_obligations",
  "nda_survival",
  "party_legal_names",
  "deal_terms_confirmation",
]);

const AI_AUTOMATION_BLOCKED_GUIDED_ID_RE = /^(?:ai_ops_economics|ai_deployment|license_scope|deliverables_scope)$/i;

const AI_AUTOMATION_BLOCKED_GUIDED_TEXT_RE =
  /\b(?:hardware|energy|site costs?|deployment site|data center|insurance|sublicens|what will the developer deliver|software development and bug fixes|bug fixes and maintenance included)\b/i;

function filterAiAutomationGuidedVariables(
  variables: DealVariable[],
  intake: string,
  body: string,
): DealVariable[] {
  if (!isAutomationServicesIntake(intake, body)) return variables;
  return variables.filter((v) => {
    const blob = `${v.id} ${v.label} ${v.question} ${v.agreementImpact}`.toLowerCase();
    if (!AI_AUTOMATION_ALLOWED_GUIDED_IDS.has(v.id)) return false;
    if (AI_AUTOMATION_BLOCKED_GUIDED_ID_RE.test(v.id)) return false;
    if (AI_AUTOMATION_BLOCKED_GUIDED_TEXT_RE.test(blob)) return false;
    if (v.id === "saas_sla" && intakeDisclaimsThirdPartyUptimeGuarantee(intake, body)) return false;
    if (v.id === "payment_structure" && intakeSpecifies403030PhaseSplit(intake, body)) return false;
    return true;
  });
}

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
  "deal_terms_confirmation",
  "project_fee_phase_confirmation",
  "governing_venue",
  "duplicate_boilerplate_cleanup",
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

function inferAutomationServicesVariablesFromIntake(
  intakeRaw: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  if (!isAutomationServicesIntake(intakeRaw, body)) return [];
  const signals = analyzeServicesMigrationIntake(intakeRaw, body);
  const low = body.toLowerCase();
  const inferred: MaterialMissingItem[] = [];
  const push = (item: Omit<MaterialMissingItem, "agreementFamily">) => {
    inferred.push({ ...item, agreementFamily: family });
  };
  const monthly = parseMonthlyPaymentUsdHint(intakeRaw);
  if (monthly || signals.vagueFee || /\bmonthly\b/i.test(intakeRaw)) {
    push({
      id: "payment_timing",
      severity: "material",
      label: "Monthly fee and invoicing",
      question: monthly
        ? `Confirm the monthly fee (about $${monthly.toLocaleString()}/month) and when invoices are due.`
        : "Confirm the monthly fee and when invoices are due.",
      whyItMatters: "Monthly services need a clear fee and payment timing before execution.",
      suggestedAnswerFormat: "e.g. $6,000/month, Net 15, due on the 1st",
      affectsSections: ["Compensation", "Payment", "Invoicing"],
      canProceedWithoutAnswer: false,
    });
  }
  if (
    signals.mentionsIp ||
    /\bownership\b/i.test(intakeRaw) ||
    /\bto be confirmed\b/i.test(low)
  ) {
    push({
      id: "ip_ownership",
      severity: "material",
      label: "Ownership of work product",
      question: "Who owns workflows, dashboards, automations, and other deliverables built under this agreement?",
      whyItMatters: "Ownership of what gets built should be explicit for AI/automation work.",
      suggestedAnswerFormat: "e.g. Client owns custom deliverables; provider retains reusable tools",
      affectsSections: ["Intellectual Property", "Work Product"],
      canProceedWithoutAnswer: false,
    });
  }
  if (
    (signals.mentionsSupport || /\bsupport\b/i.test(intakeRaw)) &&
    !intakeDisclaimsThirdPartyUptimeGuarantee(intakeRaw, body)
  ) {
    push({
      id: "saas_sla",
      severity: "material",
      label: "Support expectations",
      question: "What support coverage and response expectations apply after go-live?",
      whyItMatters: "Support scope and response times prevent disputes after launch.",
      suggestedAnswerFormat: "e.g. business-hours email support; 1 business day response",
      affectsSections: ["Support", "SLA"],
      canProceedWithoutAnswer: true,
    });
  }
  if (/\bterminat/i.test(intakeRaw) || signals.vagueRenewal) {
    push({
      id: "renewal_notice",
      severity: "material",
      label: "Termination notice",
      question: "How much notice does either side need to terminate if the arrangement is not working?",
      whyItMatters: "A clear notice period keeps exit expectations practical and fair.",
      suggestedAnswerFormat: "e.g. 30 days written notice",
      affectsSections: ["Term", "Termination"],
      canProceedWithoutAnswer: false,
    });
  }
  if (!/\bconfidential/i.test(low) && /\bconfidential/i.test(intakeRaw)) {
    push({
      id: "security_obligations",
      severity: "material",
      label: "Confidentiality baseline",
      question: "Confirm confidentiality covers shared business data and automation configurations.",
      whyItMatters: "Confidentiality should match what each side will share during the engagement.",
      suggestedAnswerFormat: "Standard mutual confidentiality with reasonable care",
      affectsSections: ["Confidentiality"],
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
  if (!isServicesMigrationIntake(intakeRaw, body) && !isAutomationServicesIntake(intakeRaw, body)) return [];
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
  if (
    (signals.vagueFee || /\bto be confirmed\b/i.test(low)) &&
    (signals.mentionsPhases || /\b(?:TBD|\?\?\?)\b/i.test(intakeRaw))
  ) {
    push({
      id: "project_fee_phase_confirmation",
      severity: "material",
      label: "Project fee and phases",
      question: "Confirm the total project fee and how it splits across build, rollout, and support phases.",
      whyItMatters: "Fee and phase economics are still open — confirm before execution.",
      suggestedAnswerFormat: "e.g. $120,000 total: 40% build, 40% rollout, 20% support",
      affectsSections: ["Compensation", "Schedule A", "Milestones"],
      canProceedWithoutAnswer: false,
    });
  } else if (signals.vagueFee || /\bto be confirmed\b/i.test(low)) {
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
  if (signals.mentionsPhases && !intakeSpecifies403030PhaseSplit(intakeRaw, body)) {
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
  if (
    (signals.mentionsSupport || signals.mentionsSla) &&
    !intakeDisclaimsThirdPartyUptimeGuarantee(intakeRaw, body)
  ) {
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
  for (const semItem of semanticGapsToMaterialItems(
    detectSemanticContractGaps({ body, intakeRaw: intake, agreementFamily: family }),
    family,
  )) {
    if (!items.some((x) => x.id === semItem.id)) items.push(semItem);
  }
  const contractor = inferContractorVariablesFromIntake(intake, body, family);
  const consulting = inferConsultingVariablesFromIntake(intake, body, family);
  const services = inferServicesMigrationVariablesFromIntake(intake, body, family);
  const automation = isAutomationServicesIntake(intake, body)
    ? inferAutomationServicesVariablesFromIntake(intake, body, family)
    : [];
  const vars = [
    ...items.map((m) => materialItemToDealVariable(m, intake)),
    ...contractor,
    ...consulting,
    ...services,
    ...automation,
  ];
  return dedupeVariables(vars);
}

function resolveMaterialItemsForExtraction(args: {
  intakeRaw?: string | null;
  body?: string;
  materialItems?: readonly MaterialMissingItem[];
  structuralIssues?: readonly { code: string; message: string }[];
  serverMissing?: readonly string[];
}): MaterialMissingItem[] {
  const built = buildMaterialMissingItems({
    intakeRaw: args.intakeRaw,
    body: args.body ?? "",
    structuralIssues: args.structuralIssues,
    serverMissing: args.serverMissing,
  });
  const extra = args.materialItems;
  if (extra && extra.length > 0) return [...extra];
  return built;
}

function hasCorePaidProTermsAlreadyCovered(intakeRaw: string, body: string): boolean {
  const text = `${intakeRaw}\n${body}`.toLowerCase();
  return (
    /\b(?:scope|services?|deliverables?|provide|perform)\b/.test(text) &&
    /\b(?:payment|fees?|compensation|invoice|\$[\d,]+)\b/.test(text) &&
    /\b(?:own|ownership|work product|deliverables|pre-existing|background)\b/.test(text) &&
    /\bconfidential/.test(text) &&
    /\b(?:terminat|notice)\b/.test(text) &&
    /\b(?:oklahoma|texas|delaware|california|new york)\s+law\b/.test(text) &&
    /\bnotices?\b/.test(text) &&
    /\b(?:electronic signature|e-signature|counterparts?)\b/.test(text)
  );
}

function intakeHasUnresolvedMaterialMarkers(intakeRaw: string): boolean {
  return /\b(?:TBD|to be confirmed|to be determined|unknown|not sure|\?\?\?|maybe)\b/i.test(intakeRaw);
}

export function extractDealVariables(args: {
  intakeRaw?: string | null;
  body?: string;
  materialItems?: readonly MaterialMissingItem[];
  structuralIssues?: readonly { code: string; message: string }[];
  serverMissing?: readonly string[];
}): DealVariable[] {
  const explicitMaterial = Boolean(args.materialItems && args.materialItems.length > 0);
  const intake = (args.intakeRaw || "").trim();
  const body = (args.body ?? "").trim();
  if (
    !explicitMaterial &&
    !intakeHasUnresolvedMaterialMarkers(intake) &&
    body.length >= 500 &&
    validateProAgreementConfidenceGate(body, { intakeText: intake }).ok
  ) {
    return [];
  }
  const material = resolveMaterialItemsForExtraction(args);
  const family = material[0]?.agreementFamily ?? "generic_business_agreement";
  let vars = dedupeVariables(material.map((m) => materialItemToDealVariable(m, intake)));
  if (isAutomationServicesIntake(intake, body)) {
    for (const v of inferAutomationServicesVariablesFromIntake(intake, body, family)) {
      if (!vars.some((x) => x.id === v.id)) vars.push(v);
    }
    vars = dedupeVariables(vars);
  }
  if (!explicitMaterial) {
    const synthesized = synthesizeFallbackGuidedVariables(intake, body, family);
    for (const v of synthesized) {
      if (!vars.some((x) => x.id === v.id)) vars.push(v);
    }
    for (const bodyItem of scanBodyMaterialPlaceholders(body, family)) {
      const v = materialItemToDealVariable(bodyItem, intake);
      if (!vars.some((x) => x.id === v.id)) vars.push(v);
    }
    vars = dedupeVariables(vars);
  }
  if (!vars.length && body.length >= 400 && hasSemanticMaterialGaps(body, intake) && !hasCorePaidProTermsAlreadyCovered(intake, body)) {
    const familyHint = family;
    const fallbackItems = semanticGapsToMaterialItems(
      detectSemanticContractGaps({ body, intakeRaw: intake, agreementFamily: familyHint }),
      familyHint,
    );
    if (!fallbackItems.length) {
      fallbackItems.push({
        id: "deal_terms_confirmation",
        severity: "material",
        agreementFamily: familyHint,
        label: "Confirm remaining deal terms",
        question: "Do you want LawDog to fill standard practical terms for the unresolved items?",
        whyItMatters: "The draft still contains unresolved business language.",
        suggestedAnswerFormat: "Practical standard terms, key questions, or custom details",
        affectsSections: ["General"],
        canProceedWithoutAnswer: true,
      });
    }
    vars = dedupeVariables(fallbackItems.map((m) => materialItemToDealVariable(m, intake)));
  }
  vars = ensureRenderableGuidedVariables(vars, intake, body, family);
  vars = filterAiAutomationGuidedVariables(vars, intake, body);
  vars = vars.filter((v) => !isGuidedVariableSatisfiedByIntake(v.id, intake, body));
  return enrichDealVariables(intake || null, vars);
}

/** Guarantee at least one variable with selectable pills when gaps exist. */
export function ensureRenderableGuidedVariables(
  variables: DealVariable[],
  intake: string,
  body: string,
  family: MaterialMissingItem["agreementFamily"],
): DealVariable[] {
  if (variables.some((v) => variableHasSelectableAnswerPath(v))) return variables;
  if (hasCorePaidProTermsAlreadyCovered(intake, body)) return variables;
  if (!hasSemanticMaterialGaps(body, intake) && body.length < 400) return variables;
  const fallback: MaterialMissingItem = {
    id: "deal_terms_confirmation",
    severity: "material",
    agreementFamily: family,
    label: "Confirm remaining deal terms",
    question: "Do you want LawDog to fill standard practical terms for the unresolved items?",
    whyItMatters: "The draft still contains unresolved business language.",
    suggestedAnswerFormat: "Practical standard terms, key questions, or custom details",
    affectsSections: ["General"],
    canProceedWithoutAnswer: true,
  };
  return dedupeVariables([...variables, materialItemToDealVariable(fallback, intake)]);
}

export function dealVariablesFromMaterialItems(
  items: readonly MaterialMissingItem[],
  intakeRaw?: string | null,
): DealVariable[] {
  return enrichDealVariables(intakeRaw ?? null, dedupeVariables(items.map((m) => materialItemToDealVariable(m, intakeRaw))));
}
