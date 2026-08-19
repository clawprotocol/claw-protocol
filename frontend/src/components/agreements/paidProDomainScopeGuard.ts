/**
 * Paid Pro domain/scope contamination guard.
 *
 * Agreement substance must trace to explicit intake terms or neutral legal clauses —
 * not app/product workflow vocabulary unless the intake requests it.
 */

import { parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";

const LOG_PREFIX = "[paid-pro-domain-scope-guard]";

export type DomainScopeCategory =
  | "ai"
  | "workflow"
  | "automation"
  | "configuration"
  | "platform"
  | "software"
  | "implementation_support"
  | "demo"
  | "acceptance_review"
  | "managed_hosting"
  | "integrations"
  | "technical_setup"
  | "data_migration"
  | "api"
  | "uptime"
  | "support_desk";

type ContaminationRule = {
  id: string;
  pattern: RegExp;
  categories: DomainScopeCategory[];
};

const CONTAMINATION_RULES: ContaminationRule[] = [
  { id: "ai_workflow", pattern: /\bAI\s+workflow\b/i, categories: ["ai", "workflow"] },
  { id: "artificial_intelligence", pattern: /\bartificial intelligence\b/i, categories: ["ai"] },
  { id: "workflow_mapping", pattern: /\bworkflow\s+mapping\b/i, categories: ["workflow"] },
  { id: "configured_workflow", pattern: /\bconfigured\s+(?:AI\s+)?workflow\b/i, categories: ["ai", "workflow", "configuration"] },
  { id: "automation_logic", pattern: /\bautomation\s+logic\b/i, categories: ["automation"] },
  { id: "configuration_support", pattern: /\bconfiguration\s+(?:planning|support|assistance|steps)\b/i, categories: ["configuration"] },
  { id: "implementation_support", pattern: /\bimplementation\s+(?:support|assistance)\b/i, categories: ["implementation_support"] },
  { id: "demonstration_review", pattern: /\bdemonstration(?:\s+or\s+acceptance\s+review)?\b/i, categories: ["demo", "acceptance_review"] },
  { id: "acceptance_review", pattern: /\bacceptance\s+(?:review|demonstration|test(?:ing)?)\b/i, categories: ["acceptance_review"] },
  { id: "acceptance_demonstration_heading", pattern: /\bACCEPTANCE\s+AND\s+DEMONSTRATION\b/i, categories: ["acceptance_review", "demo"] },
  { id: "managed_hosting", pattern: /\bmanaged\s+hosting\b/i, categories: ["managed_hosting"] },
  { id: "data_migration", pattern: /\bdata\s+migration\b/i, categories: ["data_migration"] },
  { id: "support_desk", pattern: /\bsupport\s+desk\b/i, categories: ["support_desk"] },
  { id: "uptime_commitment", pattern: /\buptime\s+(?:level|commitment|guarantee)\b/i, categories: ["uptime"] },
  { id: "technical_setup", pattern: /\btechnical\s+setup\b/i, categories: ["technical_setup"] },
  { id: "third_party_ai_tools", pattern: /\bthird[- ]party\s+AI\s+platforms?\b/i, categories: ["platform", "ai"] },
  { id: "prompt_patterns", pattern: /\bprompt\s+patterns?\b/i, categories: ["ai", "configuration"] },
];

const DOMAIN_SECTION_HEADING_RES: RegExp[] = [
  /\bACCEPTANCE\s+AND\s+DEMONSTRATION\b/i,
  /\bACCEPTANCE\s+REVIEW\b/i,
  /\bWORKFLOW\s+CONFIGURATION\b/i,
  /\bIMPLEMENTATION\s+ASSUMPTIONS\b/i,
  /\bTHIRD[- ]?PARTY\s+TOOLS\s+AND\s+OPTIONAL\s+SUPPORT\b/i,
  /\bSUPPORT\s+AND\s+THIRD[- ]?PARTY\s+DEPENDENCIES\b/i,
];

const SCOPE_SECTION_HEADING_RES = /\b(?:SERVICES|SCOPE|ENGAGEMENT|COMMERCIAL\s+OBJECTIVE)\b/i;

const PRESERVED_LEGAL_HEADING_RES =
  /\b(?:CONFIDENTIALITY|INTELLECTUAL\s+PROPERTY|PAYMENT|FEES|TERMINATION|LIABILITY|INDEMNIT|NOTICES?|GOVERNING\s+LAW|ELECTRONIC\s+SIGNATURES?|WARRANT|DISPUTE|ARBITRATION|FORCE\s+MAJEURE|INSURANCE|NON[- ]?SOLICIT|NON[- ]?COMPETE|DATA\s+(?:PRIVACY|PROTECTION)|IN\s+WITNESS)\b/i;

export function intakeRequestsAiWorkflowOrAcceptanceScope(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:acceptance\s+test(?:ing)?|demonstration\s+review|demo\s+review|configured\s+(?:ai\s+)?workflow|ai\s+workflow\s+setup|implementation\s+acceptance|acceptance\s+and\s+demonstration|workflow\s+setup\s+services|review\s+period)\b/i.test(
    text,
  );
}

export function intakeSignalsAiWorkflowDomain(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:ai|artificial intelligence|workflow|automation|setup|implementation|integration)\b/i.test(text);
}

/** True only when intake explicitly asks for AI workflow scope — not generic consulting/services. */
export function shouldApplyAiWorkflowServicesQualityFloor(blob: string): boolean {
  if (!intakeSignalsAiWorkflowDomain(blob)) return false;
  return intakeRequestsAiWorkflowOrAcceptanceScope(blob);
}

export function intakeRequestsTechnicalSoftwareScope(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:software\s+development|develop(?:ing|ment)\s+(?:a\s+)?(?:application|app|platform|system|software)|SaaS|web\s+app|mobile\s+app|API\s+development|custom\s+software|technical\s+implementation|source\s+code|deliverable\s+code)\b/i.test(
    text,
  );
}

export function intakeAllowsGenericImplementationLanguage(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:consulting\s+and\s+implementation|implementation\s+services)\b/i.test(text);
}

function intakeCategorySupport(blob: string, category: DomainScopeCategory): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  switch (category) {
    case "ai":
      return /\b(?:\bai\b|artificial intelligence)\b/i.test(text);
    case "workflow":
      return /\bworkflow\b/i.test(text);
    case "automation":
      return /\bautomation\b/i.test(text);
    case "configuration":
      return /\bconfiguration\b/i.test(text);
    case "platform":
      return /\bplatform\b/i.test(text);
    case "software":
      return /\b(?:software|SaaS|application|app|source\s+code)\b/i.test(text);
    case "implementation_support":
      return intakeAllowsGenericImplementationLanguage(text) || /\bimplementation\s+(?:support|assistance)\b/i.test(text);
    case "demo":
      return /\b(?:demo|demonstration|walkthrough)\b/i.test(text);
    case "acceptance_review":
      return intakeRequestsAiWorkflowOrAcceptanceScope(text) || /\bacceptance\s+(?:review|test|criteria)\b/i.test(text);
    case "managed_hosting":
      return /\bmanaged\s+hosting\b/i.test(text);
    case "integrations":
      return /\b(?:integration|CRM|API)\b/i.test(text);
    case "technical_setup":
      return /\btechnical\s+setup\b/i.test(text);
    case "data_migration":
      return /\bdata\s+migration\b/i.test(text);
    case "api":
      return /\bAPI\b/i.test(text);
    case "uptime":
      return /\buptime\b/i.test(text);
    case "support_desk":
      return /\bsupport\s+desk\b/i.test(text);
    default:
      return false;
  }
}

export function intakeExplicitlyRequestsDomainScope(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return shouldApplyAiWorkflowServicesQualityFloor(text) || intakeRequestsTechnicalSoftwareScope(text);
}

export function intakeSupportsDomainCategory(blob: string, category: DomainScopeCategory): boolean {
  if (intakeExplicitlyRequestsDomainScope(blob)) return true;
  return intakeCategorySupport(blob, category);
}

export function detectUnsupportedDomainContamination(
  corpus: string,
  intake: string,
): { contaminated: boolean; ruleIds: string[] } {
  const text = (corpus || "").trim();
  if (!text || intakeExplicitlyRequestsDomainScope(intake)) {
    return { contaminated: false, ruleIds: [] };
  }
  const ruleIds: string[] = [];
  for (const rule of CONTAMINATION_RULES) {
    if (!rule.pattern.test(text)) continue;
    const supported = rule.categories.every((cat) => intakeSupportsDomainCategory(intake, cat));
    if (!supported) ruleIds.push(rule.id);
  }
  return { contaminated: ruleIds.length > 0, ruleIds };
}

function isNumberedSectionHeading(line: string): boolean {
  return /^\d+(?:\.\d+)*\.?\s+[A-Z]/.test(line.trim());
}

function stripDomainSections(text: string, intake: string): { text: string; removed: string[] } {
  if (intakeExplicitlyRequestsDomainScope(intake)) return { text, removed: [] };
  const lines = text.split("\n");
  const kept: string[] = [];
  const removed: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Never strip the execution/signature tail — domain sections end at IN WITNESS.
    if (/\bIN WITNESS WHEREOF\b/i.test(trimmed)) {
      skipping = false;
    }
    if (isNumberedSectionHeading(trimmed)) {
      const isDomainSection = DOMAIN_SECTION_HEADING_RES.some((re) => re.test(trimmed));
      const isPreservedLegal = PRESERVED_LEGAL_HEADING_RES.test(trimmed);
      if (isDomainSection && !isPreservedLegal) {
        skipping = true;
        removed.push(trimmed.slice(0, 80));
        continue;
      }
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return {
    text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    removed,
  };
}

function neutralScopeBody(providerLabel: string, clientLabel: string): string {
  return `${providerLabel} will perform professional consulting and related services for ${clientLabel} as described in the parties' intake and any written statement of work. The Parties may refine service details in writing without changing the core commercial terms of this Agreement.`;
}

function neutralizeContaminatedScopeSections(
  text: string,
  intake: string,
  opts?: { providerLabel?: string; clientLabel?: string },
): { text: string; repairs: string[] } {
  if (intakeExplicitlyRequestsDomainScope(intake)) return { text, repairs: [] };
  const provider = (opts?.providerLabel || "Service Provider").trim() || "Service Provider";
  const client = (opts?.clientLabel || "Client").trim() || "Client";
  const lines = text.split("\n");
  const out: string[] = [];
  const repairs: string[] = [];
  let inScopeSection = false;
  let scopeHeadingWritten = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (isNumberedSectionHeading(trimmed) && SCOPE_SECTION_HEADING_RES.test(trimmed)) {
      inScopeSection = true;
      scopeHeadingWritten = true;
      out.push(line);
      const sectionLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (isNumberedSectionHeading(lines[j].trim())) break;
        sectionLines.push(lines[j]);
      }
      const sectionBody = sectionLines.join("\n");
      const hits = detectUnsupportedDomainContamination(sectionBody, intake);
      if (hits.contaminated) {
        out.push(neutralScopeBody(provider, client));
        repairs.push("neutralized_scope_section");
      } else {
        out.push(...sectionLines);
      }
      i = j - 1;
      inScopeSection = false;
      continue;
    }
    if (!inScopeSection) out.push(line);
  }

  if (!scopeHeadingWritten) return { text, repairs };
  return { text: out.join("\n"), repairs };
}

function neutralizeRecitalAndInlinePhrases(text: string, intake: string): { text: string; repairs: string[] } {
  if (intakeExplicitlyRequestsDomainScope(intake)) return { text, repairs: [] };
  const hits = detectUnsupportedDomainContamination(text, intake);
  if (!hits.contaminated) return { text, repairs: [] };

  let out = text;
  const repairs: string[] = [];
  const replacements: Array<[RegExp, string]> = [
    [/\bAI workflow setup services?\b/gi, "professional consulting services"],
    [/\bperform AI workflow setup services\b/gi, "perform professional consulting services"],
    [/\bassist Client with AI workflow setup\b/gi, "assist Client with professional consulting services"],
    [/\bconfigured (?:AI )?workflow setup services?\b/gi, "agreed professional services"],
    [/\bconfigured (?:AI )?workflow\b/gi, "agreed services"],
    [/\bworkflow mapping, configuration planning, implementation support\b/gi, "professional consulting services"],
    [/\bworkflow mapping\b/gi, "scope analysis"],
    [/\bconfiguration planning\b/gi, "planning"],
    [/\bimplementation support\b/gi, "professional services"],
    [/\bpractical demonstration or (?:acceptance )?review\b/gi, "delivery review"],
    [/\bacceptance demonstration\b/gi, "delivery confirmation"],
    [/\bautomation logic or prompts\b/gi, "agreed deliverables"],
    [/\bthird-party AI platforms?\b/gi, "third-party systems"],
    [/\bprompt patterns\b/gi, "methodologies"],
  ];

  for (const [re, replacement] of replacements) {
    const next = out.replace(re, replacement);
    if (next !== out) {
      out = next;
      repairs.push(`inline:${re.source.slice(0, 40)}`);
    }
  }

  return { text: out, repairs };
}

function intakeHasMultiPartySpecializedCommercialRoles(intake: string): boolean {
  const blocks = parseLabeledPartyBlocks(intake);
  if (blocks.length < 4) return false;
  const generic = new Set(["client", "service provider", "party 1", "party 2", "party 3", "party 4"]);
  const specialized = blocks.filter((block) => {
    const role = block.roleLabel.trim().toLowerCase();
    return role.length >= 3 && !generic.has(role);
  });
  return specialized.length >= 3;
}

export function sanitizePaidProDomainScopeContamination(
  corpus: string,
  intake: string | null | undefined,
  opts?: { providerLabel?: string; clientLabel?: string; logSurface?: string },
): { text: string; repairs: string[] } {
  const intakeText = (intake || "").trim();
  let text = (corpus || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { text, repairs: [] };

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(intakeText) ||
    intakeHasMultiPartySpecializedCommercialRoles(intakeText)
  ) {
    return { text, repairs: [] };
  }

  if (intakeExplicitlyRequestsDomainScope(intakeText)) {
    return { text, repairs: [] };
  }

  const before = detectUnsupportedDomainContamination(text, intakeText);
  if (!before.contaminated) {
    return { text, repairs: [] };
  }

  const repairs: string[] = [];
  const stripped = stripDomainSections(text, intakeText);
  if (stripped.removed.length > 0) {
    text = stripped.text;
    repairs.push(...stripped.removed.map((h) => `removed_section:${h}`));
  }

  const scope = neutralizeContaminatedScopeSections(text, intakeText, opts);
  if (scope.repairs.length > 0) {
    text = scope.text;
    repairs.push(...scope.repairs);
  }

  const inline = neutralizeRecitalAndInlinePhrases(text, intakeText);
  if (inline.repairs.length > 0) {
    text = inline.text;
    repairs.push(...inline.repairs);
  }

  const after = detectUnsupportedDomainContamination(text, intakeText);
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  // Never let domain-scope cleanup catastrophically shrink a substantive server corpus
  // (e.g. stripping AI-workflow wording that the draft purpose already authorized).
  const originalLen = (corpus || "").trim().length;
  if (
    originalLen >= 4_000 &&
    cleaned.length < Math.floor(originalLen * 0.55) &&
    cleaned.length < 4_000
  ) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, {
        surface: opts?.logSurface ?? "unknown",
        beforeRules: before.ruleIds,
        afterRules: after.ruleIds,
        repairs: [...repairs, "skipped_catastrophic_domain_shrink"],
        originalLen,
        cleanedLen: cleaned.length,
      });
    }
    return { text: (corpus || "").replace(/\r\n/g, "\n").trim(), repairs: [] };
  }
  if (repairs.length > 0 && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(LOG_PREFIX, {
      surface: opts?.logSurface ?? "unknown",
      beforeRules: before.ruleIds,
      afterRules: after.ruleIds,
      repairs,
    });
  }

  return { text: cleaned, repairs };
}

/** Convenience wrapper for render/acceptance pipelines. */
export function applyPaidProDomainScopeGuard(
  corpus: string,
  intake: string | null | undefined,
  opts?: { providerLabel?: string; clientLabel?: string; logSurface?: string },
): string {
  return sanitizePaidProDomainScopeContamination(corpus, intake, opts).text;
}
