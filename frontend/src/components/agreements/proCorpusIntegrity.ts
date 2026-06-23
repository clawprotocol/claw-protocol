import type { GuidedSemanticFacts } from "./guidedDealCompletion/guidedAnswerSemanticMerger";
import { cleanProCorpusLine, repairBareProSkeletonClauses } from "./proCorpusSkeletonSafety";
import {
  MINIMUM_COMMERCIAL_SPECIFICITY_SCORE,
  preserveProtectedCommercialFacts,
  scoreCommercialSpecificity,
  type CommercialSpecificityScore,
} from "./commercialSpecificity";
import { forbiddenSemanticFactForLine, reconstructProSectionsFromSemanticBlocks } from "./proSemanticBlocks";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import { assertNoPostAcceptanceStructuralMutation } from "./authoritativeAgreementDocument";
import { shouldBlockPaidProStructuralMutationAfterAcceptance } from "./paidProAuthoritativeRenderGate";
import { logPaidProPostFreezeMutationAttempt } from "./paidProFreezeDiagnostics";

export type ProCorpusArchetype =
  | "monthly_consulting"
  | "fixed_fee_project"
  | "milestone_services"
  | "marketing_services"
  | "ai_automation_services"
  | "generic_services";

export type ProCorpusIntegrityCounters = {
  reorderedSections: number;
  relocatedClauses: number;
  removedSemanticDuplicates: number;
  removedArchetypeContradictions: number;
  removedBareHeadings: number;
  unresolvedPlaceholders: number;
};

export type ProCorpusIntegrityReport = {
  ok: boolean;
  archetype: ProCorpusArchetype;
  warnings: string[];
  counters: ProCorpusIntegrityCounters;
  commercialSpecificity: CommercialSpecificityScore;
};

export type ProCorpusIntegrityContext = {
  intakeText?: string | null;
  semanticFacts?: GuidedSemanticFacts | null;
  archetype?: ProCorpusArchetype | null;
  canonicalPartyNames?: readonly string[];
  surface?: string;
};

export type ProCorpusIntegrityResult = {
  text: string;
  repairs: string[];
  report: ProCorpusIntegrityReport;
};

type SectionCategory =
  | "preamble"
  | "purpose"
  | "fees"
  | "ownership"
  | "confidentiality"
  | "support"
  | "termination"
  | "liability"
  | "notices"
  | "misc"
  | "esign"
  | "signature"
  | "unknown";

type SemanticFingerprint =
  | "invoice_timing"
  | "milestone_allocation"
  | "monthly_fee"
  | "termination_notice"
  | "governing_law"
  | "ownership_assignment"
  | "background_tools_retained"
  | "confidentiality_obligation"
  | "required_disclosure"
  | "notices_email"
  | "electronic_signatures"
  | "support_uptime"
  | "support_exclusions"
  | "acceptance_terms"
  | "misc_amendment_waiver"
  | "force_majeure";

type CorpusSection = {
  heading: string | null;
  lines: string[];
  category: SectionCategory;
  originalIndex: number;
};

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+?)\.?\s*$/;
const SUBSECTION_PREFIX_RE = /^(\d+)\.(\d+)(\.?)\s+/;
const SIGNATURE_START_RE = /^\s*(?:IN WITNESS WHEREOF|SIGNATURES?|CLIENT:|SERVICE PROVIDER:|PROVIDER:|PARTY\s+\d+:)/i;

const SECTION_ORDER: readonly SectionCategory[] = [
  "purpose",
  "fees",
  "ownership",
  "confidentiality",
  "support",
  "termination",
  "liability",
  "notices",
  "misc",
  "esign",
  "signature",
];

const FINGERPRINT_OWNER: Record<SemanticFingerprint, SectionCategory> = {
  invoice_timing: "fees",
  milestone_allocation: "fees",
  monthly_fee: "fees",
  termination_notice: "termination",
  governing_law: "misc",
  ownership_assignment: "ownership",
  background_tools_retained: "ownership",
  confidentiality_obligation: "confidentiality",
  required_disclosure: "confidentiality",
  notices_email: "notices",
  electronic_signatures: "esign",
  support_uptime: "support",
  support_exclusions: "support",
  acceptance_terms: "support",
  misc_amendment_waiver: "misc",
  force_majeure: "misc",
};

const SECTION_HEADING_BY_CATEGORY: Partial<Record<SectionCategory, string>> = {
  purpose: "Purpose and Scope",
  fees: "Fees and Payment",
  ownership: "Ownership",
  confidentiality: "Confidentiality",
  support: "Support",
  termination: "Termination",
  liability: "Liability",
  notices: "Notices",
  misc: "Miscellaneous",
  esign: "Electronic Signatures",
};

function blankCounters(): ProCorpusIntegrityCounters {
  return {
    reorderedSections: 0,
    relocatedClauses: 0,
    removedSemanticDuplicates: 0,
    removedArchetypeContradictions: 0,
    removedBareHeadings: 0,
    unresolvedPlaceholders: 0,
  };
}

function orderRank(category: SectionCategory): number {
  if (category === "preamble") return -1;
  const idx = SECTION_ORDER.indexOf(category);
  return idx >= 0 ? idx : SECTION_ORDER.indexOf("misc") + 0.5;
}

function normalizeText(s: string): string {
  return cleanProCorpusLine(s).toLowerCase();
}

function classifyHeading(line: string): SectionCategory {
  const title = (line.match(TOP_LEVEL_HEADING_RE)?.[2] ?? line).replace(/\.\s*$/, "").trim();
  if (/^(?:purpose|scope|services|services and scope|purpose and scope)\b/i.test(title)) return "purpose";
  if (/\b(?:fees?|payment|compensation|commercial terms|billing)\b/i.test(title)) return "fees";
  if (/\b(?:deliverables?|ownership|work product|intellectual property|ip)\b/i.test(title)) return "ownership";
  if (/\bconfidential/i.test(title)) return "confidentiality";
  if (/\b(?:support|service levels?|sla|uptime|maintenance)\b/i.test(title)) return "support";
  if (/\b(?:term|termination|renewal)\b/i.test(title)) return "termination";
  if (/\b(?:liability|disclaimers?|remedies|indemnity|warrant)\b/i.test(title)) return "liability";
  if (/\bnotices?\b/i.test(title)) return "notices";
  if (/\b(?:miscellaneous|general provisions|governing law|law|venue|jurisdiction)\b/i.test(title)) return "misc";
  if (/\b(?:electronic signatures?|e-?signatures?|counterparts?)\b/i.test(title)) return "esign";
  if (/\bsignatures?\b/i.test(title)) return "signature";
  return "unknown";
}

function parseSections(text: string): CorpusSection[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: CorpusSection[] = [];
  let current: CorpusSection = { heading: null, lines: [], category: "preamble", originalIndex: 0 };
  let signatureStarted = false;

  const pushCurrent = () => {
    if (current.heading || current.lines.some((line) => line.trim())) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const t = cleanProCorpusLine(line);
    const top = t.match(TOP_LEVEL_HEADING_RE);
    if (!signatureStarted && SIGNATURE_START_RE.test(t) && !top) {
      pushCurrent();
      signatureStarted = true;
      current = {
        heading: null,
        lines: [line],
        category: "signature",
        originalIndex: sections.length,
      };
      continue;
    }
    if (!signatureStarted && top) {
      pushCurrent();
      current = {
        heading: line,
        lines: [],
        category: classifyHeading(line),
        originalIndex: sections.length,
      };
      continue;
    }
    current.lines.push(line);
  }
  pushCurrent();
  return sections;
}

function sectionToText(section: CorpusSection, newNumber: number | null): string {
  const parts: string[] = [];
  let oldNumber: string | null = null;
  if (section.heading) {
    const match = cleanProCorpusLine(section.heading).match(TOP_LEVEL_HEADING_RE);
    oldNumber = match?.[1] ?? null;
    if (newNumber != null) {
      parts.push(section.heading.replace(/^\s*\d+\./, `${newNumber}.`));
    } else {
      parts.push(section.heading);
    }
  }
  for (const line of section.lines) {
    if (newNumber != null && oldNumber) {
      parts.push(line.replace(SUBSECTION_PREFIX_RE, (_m, n, sub, dot) => (n === oldNumber ? `${newNumber}.${sub}${dot} ` : _m)));
    } else {
      parts.push(line);
    }
  }
  return parts.join("\n").trim();
}

function serializeSections(sections: readonly CorpusSection[], counters: ProCorpusIntegrityCounters): string {
  const before = sections.map((s) => s.category).join("|");
  const preamble = sections.filter((s) => s.category === "preamble");
  const rest = sections
    .filter((s) => s.category !== "preamble")
    .sort((a, b) => orderRank(a.category) - orderRank(b.category) || a.originalIndex - b.originalIndex);
  const ordered = [...preamble, ...rest];
  const after = ordered.map((s) => s.category).join("|");
  if (before !== after) counters.reorderedSections += 1;

  let sectionNo = 1;
  return ordered
    .map((section) => {
      const newNumber = section.heading && section.category !== "signature" ? sectionNo++ : null;
      return sectionToText(section, newNumber);
    })
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionHasMaterial(section: CorpusSection): boolean {
  return section.lines.some((line) => cleanProCorpusLine(line).length > 0);
}

function mergeDuplicateSections(sections: CorpusSection[], counters: ProCorpusIntegrityCounters): CorpusSection[] {
  const firstByCategory = new Map<SectionCategory, CorpusSection>();
  const out: CorpusSection[] = [];
  for (const section of sections) {
    const mergeable =
      section.category !== "preamble" &&
      section.category !== "unknown";
    if (!mergeable) {
      out.push(section);
      continue;
    }
    const first = firstByCategory.get(section.category);
    if (!first) {
      firstByCategory.set(section.category, section);
      out.push(section);
      continue;
    }
    const nonEmpty = section.lines.filter((line) => cleanProCorpusLine(line));
    if (nonEmpty.length > 0) {
      first.lines.push("", ...nonEmpty);
      counters.relocatedClauses += nonEmpty.length;
    }
    counters.removedSemanticDuplicates += 1;
  }
  return out.filter((section) => section.heading || sectionHasMaterial(section));
}

function stripNestedSignatureHeadings(sections: CorpusSection[], counters: ProCorpusIntegrityCounters): CorpusSection[] {
  for (const section of sections) {
    if (section.category !== "signature") continue;
    section.lines = section.lines.filter((line) => {
      const t = cleanProCorpusLine(line);
      if (TOP_LEVEL_HEADING_RE.test(t) && classifyHeading(t) === "signature") {
        counters.removedSemanticDuplicates += 1;
        return false;
      }
      return true;
    });
  }
  return sections;
}

function classifySemanticFingerprint(line: string): SemanticFingerprint | null {
  const t = normalizeText(line);
  if (!t || TOP_LEVEL_HEADING_RE.test(cleanProCorpusLine(line))) return null;
  if (/^\s*Milestone[-\s]?based\.?\s*$/i.test(line)) return "milestone_allocation";
  if (/\b(?:governing law|laws? of (?:the state of )?(?:delaware|texas|oklahoma|new york|california)|(?:delaware|texas|oklahoma|new york|california) law)\b/i.test(t)) {
    return "governing_law";
  }
  if (/\b(?:terminat|expiration|renewal)\w*\b/i.test(t) && /\b(?:\d{1,3}|o)\s+days?\b|\bnotice\b/i.test(t)) {
    return "termination_notice";
  }
  if (/\b(?:invoices?|invoice timing|payment is due|payable|net\s*\d{1,3})\b/i.test(t)) return "invoice_timing";
  if (/\b(?:milestone|phase allocation|schedule a|40\s*%|30\s*%|build\/configuration|rollout\/onboarding|support\/acceptance|three milestones)\b/i.test(t)) {
    return "milestone_allocation";
  }
  if (/\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month\b|\bmonthly (?:fee|retainer|support fee|service fee)\b/i.test(t)) {
    return "monthly_fee";
  }
  if (/\b(?:uptime|service levels?|sla|response time|support hours)\b/i.test(t)) return "support_uptime";
  if (/\b(?:support excludes|support does not include|third-party (?:ai )?platforms?|platform limits?|model provider)\b/i.test(t)) {
    return "support_exclusions";
  }
  if (/\b(?:acceptance testing|acceptance criteria|support\/acceptance|support and acceptance|client acceptance|acceptance milestone|acceptance period)\b/i.test(t)) {
    return "acceptance_terms";
  }
  if (/\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)|\bretains? (?:its )?(?:tools|templates|know-how)\b/i.test(t)) {
    return "background_tools_retained";
  }
  if (/\b(?:owns?|assigned|assignment|belong)\b.{0,80}\b(?:deliverables?|work product|project deliverables?)\b|\b(?:deliverables?|work product)\b.{0,80}\b(?:owns?|assigned|belong)\b/i.test(t)) {
    return "ownership_assignment";
  }
  if (/\b(?:required by law|required disclosure|compelled disclosure|subpoena|court order)\b/i.test(t)) return "required_disclosure";
  if (/\bconfidential(?:ity| information)|\bprotect confidential\b/i.test(t)) return "confidentiality_obligation";
  if (/\bnotices?\b/i.test(t) && /\b(?:email|e-mail|electronically|addresses? on file|delivered|attention|attn)\b/i.test(t)) {
    return "notices_email";
  }
  if (/\b(?:electronic signatures?|e-?signatures?|counterparts?)\b/i.test(t)) return "electronic_signatures";
  if (/\b(?:amendments?|waivers?|severability|entire agreement|counterparts)\b/i.test(t)) return "misc_amendment_waiver";
  if (/\bforce majeure\b|\bacts of god\b|\beyond (?:a party's|the parties') reasonable control\b/i.test(t)) {
    return "force_majeure";
  }
  return null;
}

function hasTargetSection(sections: readonly CorpusSection[], category: SectionCategory): boolean {
  return sections.some((section) => section.category === category);
}

function firstTargetSection(sections: CorpusSection[], category: SectionCategory): CorpusSection | null {
  return sections.find((section) => section.category === category) ?? null;
}

function ensureTargetSection(sections: CorpusSection[], category: SectionCategory): CorpusSection | null {
  const existing = firstTargetSection(sections, category);
  if (existing) return existing;
  const heading = SECTION_HEADING_BY_CATEGORY[category];
  if (!heading) return null;
  const created: CorpusSection = {
    heading: `1. ${heading}`,
    lines: [],
    category,
    originalIndex: sections.length,
  };
  sections.push(created);
  return created;
}

function sameSemanticExistsInOwner(sections: readonly CorpusSection[], fp: SemanticFingerprint): boolean {
  const owner = FINGERPRINT_OWNER[fp];
  return sections.some((section) =>
    section.category === owner && section.lines.some((line) => classifySemanticFingerprint(line) === fp),
  );
}

function relocateMisplacedClauses(sections: CorpusSection[], counters: ProCorpusIntegrityCounters): CorpusSection[] {
  const moved: Array<{ target: SectionCategory; line: string }> = [];
  for (const section of sections) {
    if (section.category === "preamble" || section.category === "signature") continue;
    const kept: string[] = [];
    for (const line of section.lines) {
      const fp = classifySemanticFingerprint(line);
      if (!fp) {
        kept.push(line);
        continue;
      }
      const owner = FINGERPRINT_OWNER[fp];
      if (section.category === owner) {
        kept.push(line);
        continue;
      }
      if (sameSemanticExistsInOwner(sections, fp)) {
        counters.removedSemanticDuplicates += 1;
        continue;
      }
      moved.push({ target: owner, line });
      counters.relocatedClauses += 1;
    }
    section.lines = kept;
  }
  for (const item of moved) {
    const target = ensureTargetSection(sections, item.target);
    if (target && !target.lines.some((line) => normalizeText(line) === normalizeText(item.line))) {
      if (target.lines.some((line) => cleanProCorpusLine(line))) target.lines.push("");
      target.lines.push(item.line);
    }
  }
  return sections;
}

function lineReflectsGuidedFact(line: string, fp: SemanticFingerprint, context: ProCorpusIntegrityContext): boolean {
  const semantic = context.semanticFacts;
  const t = normalizeText(line);
  if (!semantic) return false;
  if (fp === "invoice_timing") {
    const guidedNet = String(semantic.facts.payment_timing ?? "").match(/\bnet\s*(\d{1,3})\b/i)?.[1];
    return Boolean(guidedNet && new RegExp(`\\bnet\\s*${guidedNet}\\b`, "i").test(t));
  }
  if (fp === "governing_law" && semantic.governingLaw) return t.includes(semantic.governingLaw.toLowerCase());
  if (fp === "termination_notice" && semantic.terminationDays != null) {
    return new RegExp(`\\b${semantic.terminationDays}\\s+days?\\b`, "i").test(t);
  }
  if (fp === "milestone_allocation" && semantic.milestoneSplit === "40_30_30") {
    return /\b40\s*%/.test(t) && /\b30\s*%/.test(t);
  }
  const factText = Object.values(semantic.facts).filter(Boolean).join(" ").toLowerCase();
  if (!factText) return false;
  const tokens = t.split(/[^a-z0-9$%]+/i).filter((token) => token.length >= 4).slice(0, 5);
  return tokens.some((token) => factText.includes(token));
}

function normalizeGuidedPaymentAndTerminationFacts(
  text: string,
  context: ProCorpusIntegrityContext,
  counters: ProCorpusIntegrityCounters,
): string {
  const semantic = context.semanticFacts;
  if (!semantic) return text;
  const guidedNet = String(semantic.facts.payment_timing ?? "").match(/\bnet\s*(\d{1,3})\b/i)?.[1] ?? null;
  const guidedDays = semantic.terminationDays;
  return text
    .split("\n")
    .map((line) => {
      let next = line;
      const fp = classifySemanticFingerprint(next);
      if (guidedNet && fp === "invoice_timing" && /\bnet\s*\d{1,3}\b/i.test(next)) {
        const before = next;
        next = next.replace(/\bnet\s*\d{1,3}\b/gi, `Net ${guidedNet}`);
        if (next !== before) counters.removedSemanticDuplicates += 1;
      }
      if (guidedDays != null && fp === "termination_notice") {
        const before = next;
        next = next.replace(/\b(?:O|0|\d{1,3})\s+days?\b/gi, `${guidedDays} days`);
        if (next !== before) counters.removedSemanticDuplicates += 1;
      }
      if (semantic.milestoneSplit === "40_30_30" && fp === "milestone_allocation" && !lineReflectsGuidedFact(next, fp, context)) {
        next =
          "Schedule A phase allocation is 40% build/configuration, 30% rollout/onboarding, and 30% support/acceptance.";
        counters.removedArchetypeContradictions += 1;
      }
      return next;
    })
    .join("\n");
}

function removeRawGuidedAnswerLabelLines(text: string, counters: ProCorpusIntegrityCounters): string {
  const rawLabel =
    /^\s*(?:99\.9%\s+uptime|99\.9%\s+monthly\s+uptime|Software development and bug fixes|Client gets perpetual license to embedded tools|On acceptance|Milestone[-\s]?based|Monthly\s+retainer|Net\s*(?:15|30)|Delaware|Texas|Oklahoma|Company owns project deliverables|30\s+days?\s+notice|15\s+days?\s+notice|Even\s+thirds|Build[-\s]?heavy|As\s+specified\s+in\s+Schedule\s+A)\.?\s*$/i;
  return text
    .split("\n")
    .filter((line) => {
      if (!rawLabel.test(line)) return true;
      counters.removedSemanticDuplicates += 1;
      return false;
    })
    .join("\n");
}

function dedupeSemanticFingerprints(
  sections: CorpusSection[],
  counters: ProCorpusIntegrityCounters,
  context: ProCorpusIntegrityContext,
): CorpusSection[] {
  const occurrences = new Map<SemanticFingerprint, Array<{ section: CorpusSection; lineIndex: number; line: string }>>();
  for (const section of sections) {
    section.lines.forEach((line, lineIndex) => {
      const fp = classifySemanticFingerprint(line);
      if (!fp) return;
      const arr = occurrences.get(fp) ?? [];
      arr.push({ section, lineIndex, line });
      occurrences.set(fp, arr);
    });
  }

  const remove = new WeakMap<CorpusSection, Set<number>>();
  for (const [fp, items] of occurrences.entries()) {
    if (items.length <= 1) continue;
    const owner = FINGERPRINT_OWNER[fp];
    const scored = items
      .map((item, index) => ({
        ...item,
        index,
        score:
          (item.section.category === owner ? 100 : 0) +
          (lineReflectsGuidedFact(item.line, fp, context) ? 25 : 0) +
          (cleanProCorpusLine(item.line).length > 35 ? 5 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.section.originalIndex - b.section.originalIndex || a.index - b.index);
    const keep = scored[0];
    for (const item of scored.slice(1)) {
      if (item.section === keep.section && item.lineIndex === keep.lineIndex) continue;
      const set = remove.get(item.section) ?? new Set<number>();
      set.add(item.lineIndex);
      remove.set(item.section, set);
      counters.removedSemanticDuplicates += 1;
    }
  }

  for (const section of sections) {
    const set = remove.get(section);
    if (!set) continue;
    section.lines = section.lines.filter((_, index) => !set.has(index));
  }
  return sections;
}

function inferArchetypeFromText(text: string, context: ProCorpusIntegrityContext): ProCorpusArchetype {
  if (context.archetype) return context.archetype;
  const semantic = context.semanticFacts;
  const blob = `${context.intakeText ?? ""}\n${text}`.toLowerCase();
  if (/\bmarketing|campaign|ad spend|advertising|media buying\b/.test(blob)) return "marketing_services";
  if (/\bai automation|automation|workflow automation|ai platform|model provider|bot\b/.test(blob)) {
    return "ai_automation_services";
  }
  if (semantic?.paymentMode === "monthly_retainer" || /\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month\b|month-to-month|monthly retainer/i.test(blob)) {
    return "monthly_consulting";
  }
  if (semantic?.paymentMode === "milestone_project" || /\b(?:milestone|40\s*%|30\s*%|phase allocation|schedule a)\b/i.test(blob)) {
    return "milestone_services";
  }
  if (/\bfixed fee|total project fee|\$[\d,]+(?:\.\d{2})?\s+(?:total|fixed)\b/i.test(blob)) {
    return "fixed_fee_project";
  }
  return "generic_services";
}

export function inferProCorpusArchetype(text: string, context: ProCorpusIntegrityContext = {}): ProCorpusArchetype {
  return inferArchetypeFromText(text, context);
}

function removeArchetypeContradictions(
  sections: CorpusSection[],
  archetype: ProCorpusArchetype,
  context: ProCorpusIntegrityContext,
  counters: ProCorpusIntegrityCounters,
): CorpusSection[] {
  const intake = `${context.intakeText ?? ""} ${Object.values(context.semanticFacts?.facts ?? {}).join(" ")}`;
  const milestoneRequested = /\b(?:milestone|40\s*%|30\s*%|phase allocation|build\/configuration|rollout\/onboarding)\b/i.test(intake);
  const supportRetainerRequested = /\b(?:optional|support).{0,40}\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month\b|\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month.{0,40}\bsupport\b/i.test(intake);
  const softwareSlaRequested = /\b(?:sla|uptime|service level|response time)\b/i.test(intake);
  const noThirdPartyUptimeGuarantee =
    /\bno\s+(?:guaranteed?|guarantee)\s+(?:uptime|availability|sla)\b|\bthird[-\s]?party\s+ai\s+platforms?\.?.{0,60}(?:no|without)\s+guarantee/i.test(intake);

  for (const section of sections) {
    section.lines = section.lines.filter((line) => {
      const t = cleanProCorpusLine(line);
      if (!t) return true;
      const forbiddenFact = forbiddenSemanticFactForLine(
        t,
        archetype === "monthly_consulting" ? "monthly_consulting" : archetype,
        intake,
      );
      if (forbiddenFact) {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      if (archetype === "monthly_consulting" && !milestoneRequested && classifySemanticFingerprint(line) === "milestone_allocation") {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      if (archetype === "marketing_services" && !softwareSlaRequested && /\b(?:uptime|sla|service level|software platform|production automation)\b/i.test(t)) {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      if (archetype === "marketing_services" && !/\bmonthly\s+(?:arrears|retainer|fee)|per\s+month\b/i.test(intake) && /\bmonthly arrears\b/i.test(t)) {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      if (noThirdPartyUptimeGuarantee && /\b99\.(?:9|5)\s*%|\buptime\s+target\b/i.test(t)) {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      if (archetype === "milestone_services" && !supportRetainerRequested && /\b(?:monthly arrears|monthly retainer|\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month)\b/i.test(t)) {
        counters.removedArchetypeContradictions += 1;
        return false;
      }
      return true;
    });
  }
  return sections;
}

function removeEmptySections(sections: CorpusSection[], counters: ProCorpusIntegrityCounters): CorpusSection[] {
  return sections.filter((section) => {
    if (section.category === "preamble" || section.category === "signature") return section.heading || sectionHasMaterial(section);
    if (!section.heading) return sectionHasMaterial(section);
    if (sectionHasMaterial(section)) return true;
    counters.removedBareHeadings += 1;
    return false;
  });
}

function ensureRequiredIntegritySections(
  sections: CorpusSection[],
  context: ProCorpusIntegrityContext,
  counters: ProCorpusIntegrityCounters,
): CorpusSection[] {
  const blob = `${context.intakeText ?? ""}\n${sections.flatMap((s) => s.lines).join("\n")}`;
  const needsConfidentiality =
    /\bconfidential(?:ity| information)?\b/i.test(blob) ||
    /(?:services_agreement|consulting|automation|marketing|support)/i.test(context.archetype ?? "");
  if (needsConfidentiality && !sections.some((s) => s.category === "confidentiality")) {
    const section = ensureTargetSection(sections, "confidentiality");
    if (section && !section.lines.some((line) => /confidential/i.test(line))) {
      section.lines.push(
        "Each Party will protect confidential information using reasonable care and use it only to perform or receive services under this Agreement.",
      );
      counters.relocatedClauses += 1;
    }
  }
  return sections;
}

function countUnresolvedPlaceholders(text: string): number {
  const matches = text.match(
    /\bparty[_\s-]?[ab]\b|\bparty\s+[ab]\b|\[(?:ORG|PERSON|ADDRESS|PARTY|ENTITY|CLIENT|PROVIDER|COMPANY|ORGANIZATION)[_\s-]*\d*\]|\[(?:[^\]]*placeholder[^\]]*|your company name|service provider name|client name|provider name)\]/gi,
  );
  return matches?.length ?? 0;
}

function buildWarnings(text: string, archetype: ProCorpusArchetype): string[] {
  const warnings: string[] = [];
  const sections = parseSections(text);
  for (const section of sections) {
    for (const line of section.lines) {
      const fp = classifySemanticFingerprint(line);
      if (fp && section.category !== FINGERPRINT_OWNER[fp] && hasTargetSection(sections, FINGERPRINT_OWNER[fp])) {
        warnings.push(`misplaced_${fp}`);
      }
    }
  }
  if (/^\s*(?:99\.9%\s+uptime|Software development and bug fixes|Client gets perpetual license to embedded tools|On acceptance|Milestone[-\s]?based|Delaware|Texas|Oklahoma|Company owns project deliverables)\.?\s*$/im.test(text)) {
    warnings.push("raw_guided_answer_label");
  }
  if (/\bO\s+days?\b/i.test(text) || /\b0\s+days?\s+written\s+notice\b/i.test(text)) {
    warnings.push("broken_termination_notice_days");
  }
  if (archetype === "monthly_consulting" && /\b(?:Milestone[-\s]?based|phase allocation|build\/configuration|rollout\/onboarding)\b/i.test(text)) {
    warnings.push("monthly_milestone_contradiction");
  }
  if (countUnresolvedPlaceholders(text) > 0) warnings.push("unresolved_placeholders");
  return [...new Set(warnings)];
}

export function verifyProCorpusIntegrity(
  text: string,
  context: ProCorpusIntegrityContext = {},
  counters: ProCorpusIntegrityCounters = blankCounters(),
): ProCorpusIntegrityReport {
  const archetype = inferArchetypeFromText(text, context);
  const unresolvedPlaceholders = countUnresolvedPlaceholders(text);
  const warnings = buildWarnings(text, archetype);
  const commercialSpecificity = scoreCommercialSpecificity(
    `${context.intakeText ?? ""}\n${Object.values(context.semanticFacts?.facts ?? {}).join("\n")}`,
    text,
  );
  const report: ProCorpusIntegrityReport = {
    ok:
      warnings.length === 0 &&
      unresolvedPlaceholders === 0 &&
      commercialSpecificity.score >= MINIMUM_COMMERCIAL_SPECIFICITY_SCORE,
    archetype,
    warnings,
    commercialSpecificity,
    counters: {
      ...counters,
      unresolvedPlaceholders,
    },
  };
  if (typeof import.meta === "undefined" || import.meta.env?.DEV || import.meta.env?.MODE === "test") {
    // eslint-disable-next-line no-console
    console.info("[pro-corpus-integrity-verified]", {
      ok: report.ok,
      archetype: report.archetype,
      warnings: report.warnings,
      commercialSpecificityScore: report.commercialSpecificity.score,
      counters: report.counters,
      surface: context.surface ?? null,
    });
  }
  return report;
}

export function applyProCorpusIntegrity(
  text: string,
  context: ProCorpusIntegrityContext = {},
): ProCorpusIntegrityResult {
  if (shouldBlockPaidProStructuralMutationAfterAcceptance(context.surface)) {
    logPaidProPostFreezeMutationAttempt({
      caller: "applyProCorpusIntegrity",
      blocked: true,
      surface: context.surface ?? null,
    });
    const counters = blankCounters();
    const trimmed = (text || "").replace(/\r\n?/g, "\n").trim();
    const report = verifyProCorpusIntegrity(trimmed, context, counters);
    return { text: trimmed, repairs: [], report };
  }
  const counters = blankCounters();
  const repairs: string[] = [];
  let out = (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!out) {
    const report = verifyProCorpusIntegrity(out, context, counters);
    return { text: out, repairs, report };
  }
  const softNormalizationInput = out;

  const skeleton = repairBareProSkeletonClauses(out);
  out = skeleton.text;
  counters.removedBareHeadings += skeleton.repairs.filter((r) => r.startsWith("empty_heading:")).length;
  repairs.push(...skeleton.repairs.map((r) => `integrity:${r}`));
  out = normalizeGuidedPaymentAndTerminationFacts(out, context, counters);
  out = removeRawGuidedAnswerLabelLines(out, counters);

  const archetype = inferArchetypeFromText(out, context);
  let sections = parseSections(out);
  sections = mergeDuplicateSections(sections, counters);
  sections = stripNestedSignatureHeadings(sections, counters);
  sections = relocateMisplacedClauses(sections, counters);
  sections = removeArchetypeContradictions(sections, archetype, context, counters);
  sections = dedupeSemanticFingerprints(sections, counters, context);
  sections = ensureRequiredIntegritySections(sections, { ...context, archetype }, counters);
  sections = removeEmptySections(sections, counters);
  out = serializeSections(sections, counters);
  const commercialSpecificity = preserveProtectedCommercialFacts({
    text: out,
    intakeText: context.intakeText,
    draftText: text,
    normalizationMode: "soft",
    surface: context.surface,
  });
  out = commercialSpecificity.text;
  repairs.push(...commercialSpecificity.repairs);

  const finalSkeleton = repairBareProSkeletonClauses(out);
  out = finalSkeleton.text;
  counters.removedBareHeadings += finalSkeleton.repairs.filter((r) => r.startsWith("empty_heading:")).length;
  repairs.push(...finalSkeleton.repairs.map((r) => `integrity_final:${r}`));
  if (counters.reorderedSections) repairs.push("integrity:sections_reordered");
  if (counters.relocatedClauses) repairs.push(`integrity:relocated_${counters.relocatedClauses}_clauses`);
  if (counters.removedSemanticDuplicates) repairs.push(`integrity:removed_${counters.removedSemanticDuplicates}_semantic_duplicates`);
  if (counters.removedArchetypeContradictions) {
    repairs.push(`integrity:removed_${counters.removedArchetypeContradictions}_archetype_contradictions`);
  }

  out = out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  const finalSpecificity = preserveProtectedCommercialFacts({
    text: out,
    intakeText: context.intakeText,
    draftText: text,
    normalizationMode: "soft",
    surface: context.surface,
  });
  out = finalSpecificity.text;
  repairs.push(...finalSpecificity.repairs.map((r) => `final_${r}`));
  const reconstructed = reconstructProSectionsFromSemanticBlocks(out, {
    intakeText: context.intakeText,
    draftText: text,
    archetype,
  });
  out = reconstructed.text;
  repairs.push(...reconstructed.repairs);
  const stabilized = stabilizeFinalAgreementCompilerOutput(out, {
    intakeText: context.intakeText,
    draftText: text,
    surface: context.surface ?? "pro_corpus_integrity",
  });
  out = stabilized.text;
  repairs.push(...stabilized.repairs.map((r) => `compiler:${r}`));
  assertNoPostAcceptanceStructuralMutation({
    surface: context.surface ?? "pro_corpus_integrity",
    mutation: "integrity_repair_mutation",
    inputText: text,
    outputText: out,
  });
  if (finalSpecificity.score.score < MINIMUM_COMMERCIAL_SPECIFICITY_SCORE) {
    const hardSpecificityFallback = preserveProtectedCommercialFacts({
      text: softNormalizationInput,
      intakeText: context.intakeText,
      draftText: text,
      normalizationMode: "hard",
      surface: context.surface,
    });
    if (hardSpecificityFallback.score.score >= MINIMUM_COMMERCIAL_SPECIFICITY_SCORE) {
      out = hardSpecificityFallback.text;
      repairs.push("commercial_specificity:rejected_overcompressed_soft_normalization");
    }
  }
  const report = verifyProCorpusIntegrity(out, { ...context, archetype }, counters);
  return { text: out, repairs: [...new Set(repairs)], report };
}
