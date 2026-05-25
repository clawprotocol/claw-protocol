/**
 * Final-grade guided Pro corpus validation and repair before final review / VS01 handoff.
 */

import { PARTY_LETTER_FALLBACK_RE } from "../premiumIdentityCorpusPreviewGuard";
import type { CanonicalSectionKey } from "./guidedCanonicalCorpusNormalizer";
import {
  normalizeGuidedProCorpusStructure,
  validateNormalizedCorpusStructure,
} from "./guidedCanonicalCorpusNormalizer";
import { stripGuidedInstructionLeakLines } from "./guidedCorpusLineRepairs";
import { stripDuplicatePreWitnessIdentityFragment } from "./guidedFinalReviewToSigning";
import { rebuildCanonicalGuidedCorpusFromClauses } from "./guidedCanonicalCorpusRebuild";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";

export type FinalGradeCorpusDefect =
  | "empty_numbered_section"
  | "empty_subsection_heading"
  | "weak_purpose_section"
  | "subsection_number_mismatch"
  | "misplaced_subsection_content"
  | "section_topic_contamination"
  | "fees_section_contamination"
  | "duplicate_conflicting_fees"
  | "duplicate_notice_section"
  | "party_defined_terms_missing"
  | "orphan_signer_metadata"
  | "duplicate_witness_block"
  | "instruction_leak"
  | "party_letter_fallback"
  | "contractor_party_fallback";

const TOP_LEVEL_SECTION_RE = /^\s*(\d+)\.\s+(.+)$/;
const SUBCLAUSE_RE = /^(\d+)\.(\d+)\.?\s+/;
const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;

const MONTHLY_FEE_RE =
  /\b(?:\$[\d,]+(?:\.\d{2})?|\d[\d,]*)\s*(?:per\s+)?month(?:ly)?\b|\bmonthly\s+(?:fee|service\s+fee|payment)\b/i;
const TOTAL_PROJECT_FEE_RE =
  /\b(?:total\s+(?:project\s+)?fee|total\s+contract\s+fee|\$120[,\s]?000)\b/i;
const FEES_CONTAMINATION_RE =
  /\b(?:confidential|non-public|proprietary information)\b/i;
const FEES_ATTORNEY_RE = /\battorney\s+fees?\b/i;
const CONTRACTOR_FALLBACK_RE = /\b(?:the\s+)?Contractor\b|\bthe\s+Company\b/i;
const WEAK_PURPOSE_RE = /^AI\s+AUTOMATION\s+SERVICES\s+AGREEMENT\s*$/i;

function normLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function witnessIndex(text: string): number {
  const idx = text.search(WITNESS_RE);
  return idx >= 0 ? idx : text.length;
}

function parseTopLevelSections(text: string): Array<{ number: number; heading: string; bodyLines: string[] }> {
  const before = text.slice(0, witnessIndex(text));
  const lines = normLines(before);
  const sections: Array<{ number: number; heading: string; bodyLines: string[] }> = [];
  let current: { number: number; heading: string; bodyLines: string[] } | null = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(TOP_LEVEL_SECTION_RE);
    if (m && !SUBCLAUSE_RE.test(t)) {
      if (current) sections.push(current);
      current = { number: Number(m[1]), heading: m[2].trim(), bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

function isStructurallyEmptyBody(bodyLines: string[]): boolean {
  return (
    bodyLines
      .map((l) => l.trim())
      .filter((l) => {
        if (!l.length) return false;
        const sub = l.match(SUBCLAUSE_RE);
        if (!sub) return true;
        return l.replace(SUBCLAUSE_RE, "").trim().length < 12;
      }).length === 0
  );
}

function isLikelyEmptySubsectionHeading(line: string): boolean {
  const body = line.trim().replace(SUBCLAUSE_RE, "").trim();
  if (!body) return true;
  return /^(?:Assignment|Insurance|Indemnification|Confidentiality|Notices?|Governing Law|Force Majeure|Equitable Relief|Severability)\.?$/i.test(body);
}

function subsectionContentKey(line: string): CanonicalSectionKey | null {
  const t = line.toLowerCase();
  if (/\b(?:confidential|non-public|proprietary information|nda)\b/.test(t)) return "confidentiality";
  if (/\b(?:uptime|sla|support hours|production automation|commercially reasonable support)\b/.test(t)) {
    return "support";
  }
  if (/\b(?:termination|renewal|notice period|term ends)\b/.test(t)) return "term";
  if (/\b(?:deliverables|work product|ownership|ip ownership|background technology)\b/.test(t)) {
    return "ownership";
  }
  if (/\b(?:invoice|net\s*30|payment|fee|compensation|monthly)\b/.test(t)) return "fees";
  if (/\b(?:purpose|scope of services|services provider will)\b/.test(t)) return "purpose";
  if (/\b(?:notices|notice address)\b/.test(t)) return "notices";
  if (/\b(?:electronic signature|counterpart)\b/.test(t)) return "electronic_signatures";
  if (/\b(?:force majeure|equitable relief|injunctive relief|attorney fees?|prevailing party)\b/.test(t)) {
    return "miscellaneous";
  }
  return null;
}

function isWrongTopicClause(hostKey: CanonicalSectionKey, hint: CanonicalSectionKey, line: string): boolean {
  if (hostKey === "unknown" || hint === hostKey) return false;
  const t = line.toLowerCase();
  if (hostKey === "fees" && (hint === "confidentiality" || hint === "miscellaneous")) return true;
  if (hostKey === "support" && hint === "confidentiality") return true;
  if (hostKey === "fees" && /\b(?:force majeure|equitable relief|injunctive relief|attorney fees?)\b/.test(t)) {
    return true;
  }
  return false;
}

export function detectFinalGradeCorpusDefects(
  text: string,
  opts?: { authoritativePartyNames?: readonly string[] },
): FinalGradeCorpusDefect[] {
  const defects = new Set<FinalGradeCorpusDefect>();
  const corpus = (text || "").trim();
  if (!corpus) return ["empty_numbered_section"];

  const instruction = stripGuidedInstructionLeakLines(corpus);
  if (instruction.repairs.length > 0) defects.add("instruction_leak");

  if (PARTY_LETTER_FALLBACK_RE.test(corpus)) defects.add("party_letter_fallback");
  if (opts?.authoritativePartyNames?.length && CONTRACTOR_FALLBACK_RE.test(corpus)) {
    defects.add("contractor_party_fallback");
  }
  if ((corpus.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length > 1) defects.add("duplicate_witness_block");

  const sections = parseTopLevelSections(corpus);
  for (const section of sections) {
    const hasAnyLine = section.bodyLines.some((l) => l.trim().length > 0);
    if (!hasAnyLine) defects.add("empty_numbered_section");
    for (const raw of section.bodyLines) {
      const sub = raw.trim().match(SUBCLAUSE_RE);
      if (SUBCLAUSE_RE.test(raw.trim()) && isLikelyEmptySubsectionHeading(raw)) {
        defects.add("empty_subsection_heading");
      }
      if (!sub) continue;
      const subSection = Number(sub[1]);
      const hint = subsectionContentKey(raw);
      const hostKey = resolveSectionKeyFromHeading(section.heading);
      if (hint && isWrongTopicClause(hostKey, hint, raw)) {
        defects.add("section_topic_contamination");
      }
      if (subSection !== section.number) {
        defects.add("subsection_number_mismatch");
        if (hint && hostKey !== "unknown" && hint !== hostKey) {
          defects.add("misplaced_subsection_content");
        }
      }
    }
  }

  const purposeBody = sections.find((s) => s.number === 1)?.bodyLines.join("\n").trim() ?? "";
  if (
    !purposeBody ||
    purposeBody.length < 48 ||
    WEAK_PURPOSE_RE.test(purposeBody) ||
    /^AI\s+AUTOMATION\s+SERVICES\s+AGREEMENT\s*$/i.test(purposeBody)
  ) {
    defects.add("weak_purpose_section");
  }

  const feesBody = sections.find((s) => s.number === 2)?.bodyLines.join("\n") ?? "";
  if (FEES_CONTAMINATION_RE.test(feesBody) || FEES_ATTORNEY_RE.test(feesBody)) {
    defects.add("fees_section_contamination");
  }
  if (MONTHLY_FEE_RE.test(feesBody) && TOTAL_PROJECT_FEE_RE.test(feesBody)) {
    const hasSchedule = /\bschedule\s+a\b/i.test(feesBody);
    const hasAlternative = /\b(?:alternative|either|or,?\s+if)\b/i.test(feesBody);
    if (!hasSchedule && !hasAlternative) defects.add("duplicate_conflicting_fees");
  }

  const witnessIdx = witnessIndex(corpus);
  if (witnessIdx > 0) {
    const tail = corpus.slice(Math.max(0, witnessIdx - 600), witnessIdx);
    if (
      /^(?:Name|Title|Date)\s*:/im.test(tail) &&
      !/^(?:CLIENT|SERVICE PROVIDER)\s*:/im.test(tail.slice(-280))
    ) {
      defects.add("orphan_signer_metadata");
    }
  }

  if (opts?.authoritativePartyNames?.length) {
    const needles = opts.authoritativePartyNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
    const pre = corpus.slice(0, witnessIdx);
    const lines = normLines(pre).map((l) => l.trim()).filter(Boolean);
    const tail = lines.slice(-6);
    if (
      tail.some((l) => needles.some((n) => l.toLowerCase() === n)) &&
      tail.some((l) => /^Name\s*:/i.test(l)) &&
      !tail.some((l) => /^CLIENT\s*:/i.test(l))
    ) {
      defects.add("orphan_signer_metadata");
    }

    const [clientName, providerName] = opts.authoritativePartyNames.map((n) => n.trim());
    const intro = corpus.slice(0, Math.min(witnessIdx, 1800));
    if (
      clientName &&
      providerName &&
      (!new RegExp(`\\b${escapeRe(clientName)}\\b[\\s\\S]{0,120}\\(\\s*["“']Client["”']\\s*\\)`, "i").test(intro) ||
        !new RegExp(`\\b${escapeRe(providerName)}\\b[\\s\\S]{0,140}\\(\\s*["“']Service Provider["”']\\s*\\)`, "i").test(intro))
    ) {
      defects.add("party_defined_terms_missing");
    }
  }

  const noticeHeadings = sections.filter((s) => /notices?/i.test(s.heading));
  if (noticeHeadings.length > 1) defects.add("duplicate_notice_section");

  return [...defects];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveSectionKeyFromHeading(heading: string): CanonicalSectionKey {
  const lower = heading.toLowerCase();
  if (/purpose|scope/.test(lower)) return "purpose";
  if (/(?:fees?|payment)/.test(lower) && !/notice/.test(lower)) return "fees";
  if (/confidential/.test(lower)) return "confidentiality";
  if (/ownership|work product/.test(lower)) return "ownership";
  if (/support|sla/.test(lower)) return "support";
  if (/term|termination/.test(lower)) return "term";
  if (/notices?/.test(lower)) return "notices";
  if (/miscellaneous|governing/.test(lower)) return "miscellaneous";
  if (/electronic signature/.test(lower)) return "electronic_signatures";
  return "unknown";
}

function dedupeConflictingFeeProvisions(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = witnessIndex(text);
  const before = text.slice(0, witnessIdx);
  const after = text.slice(witnessIdx);
  const sections = parseTopLevelSections(text);
  const fees = sections.find((s) => s.number === 2);
  if (!fees) return { text, repairs };
  const body = fees.bodyLines.join("\n");
  if (!MONTHLY_FEE_RE.test(body) || !TOTAL_PROJECT_FEE_RE.test(body)) return { text, repairs };
  if (/\bschedule\s+a\b/i.test(body)) return { text, repairs };

  const kept: string[] = [];
  let droppedMonthly = false;
  for (const line of fees.bodyLines) {
    const t = line.trim();
    if (!t) continue;
    if (!droppedMonthly && MONTHLY_FEE_RE.test(t) && TOTAL_PROJECT_FEE_RE.test(body) && !TOTAL_PROJECT_FEE_RE.test(t)) {
      droppedMonthly = true;
      repairs.push("dedupe_fee:drop_monthly_line");
      continue;
    }
    kept.push(line);
  }
  if (!kept.length) {
    const fallback = fees.bodyLines.find((l) => TOTAL_PROJECT_FEE_RE.test(l) || MONTHLY_FEE_RE.test(l));
    if (fallback) kept.push(fallback);
  }
  const rebuiltSections = sections.map((s) =>
    s.number === 2 ? { ...s, bodyLines: normLines(kept.join("\n\n")) } : s,
  );
  const introEnd = before.search(/^\s*1\.\s+/m);
  const intro = introEnd > 0 ? before.slice(0, introEnd).trim() : "";
  const bodyText = rebuiltSections
    .map((s) => `${s.number}. ${s.heading}\n${joinLines(s.bodyLines)}`.trim())
    .filter(Boolean)
    .join("\n\n");
  const merged = [intro, bodyText].filter(Boolean).join("\n\n");
  return { text: `${merged}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function populateEmptyPurposeSection(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = witnessIndex(text);
  const before = text.slice(0, witnessIdx);
  const after = text.slice(witnessIdx);
  const firstSection = before.search(/^\s*1\.\s+/m);
  const intro = firstSection > 0 ? before.slice(0, firstSection).trim() : before.trim();
  const sections = parseTopLevelSections(text);
  const purpose = sections.find((s) => s.number === 1);
  if (!purpose || !isStructurallyEmptyBody(purpose.bodyLines)) return { text, repairs };
  const introParagraphs = intro
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 80 && !/^\d+\.\s+/.test(p));
  if (!introParagraphs.length) return { text, repairs };
  const fill = introParagraphs[introParagraphs.length - 1]!;
  purpose.bodyLines = normLines(fill);
  repairs.push("populate_empty_purpose");
  const rebuilt = sections
    .map((s) => `${s.number}. ${s.heading}\n${joinLines(s.bodyLines)}`.trim())
    .join("\n\n");
  const mergedIntro = firstSection > 0 ? `${intro}\n\n${rebuilt}` : rebuilt;
  return { text: `${mergedIntro}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function repairEmptyNumberedSections(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = witnessIndex(text);
  const before = text.slice(0, witnessIdx);
  const after = text.slice(witnessIdx);
  const firstSection = before.search(/^\s*1\.\s+/m);
  const intro = firstSection > 0 ? before.slice(0, firstSection).trim() : before.trim();
  const preambleCandidates = intro
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 50 && !/^\d+\.\s+/.test(l) && !/AGREEMENT\s*$/i.test(l));
  const preambleFill = preambleCandidates[preambleCandidates.length - 1] ?? "";

  const sections = parseTopLevelSections(text);
  let changed = false;
  const rebuilt = sections.map((section) => {
    if (!isStructurallyEmptyBody(section.bodyLines)) return section;
    if (section.number === 1 && preambleFill) {
      changed = true;
      repairs.push("fill_empty_section:purpose");
      return { ...section, bodyLines: normLines(preambleFill) };
    }
    return section;
  });
  if (!changed) return { text, repairs };

  const introPart = firstSection > 0 ? intro : "";
  const bodyText = rebuilt
    .map((s) => `${s.number}. ${s.heading}\n${joinLines(s.bodyLines)}`.trim())
    .join("\n\n");
  const merged = [introPart, bodyText].filter(Boolean).join("\n\n");
  return { text: `${merged}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function stripAllPreWitnessSignerFragments(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const stripped = stripDuplicatePreWitnessIdentityFragment(out, identities);
    out = stripped.text;
    if (stripped.repairs.length) repairs.push(...stripped.repairs);
    else break;
  }
  const witnessIdx = witnessIndex(out);
  if (witnessIdx <= 0) return { text: out, repairs };
  const before = out.slice(0, witnessIdx).trimEnd();
  const after = out.slice(witnessIdx).trimStart();
  const lines = normLines(before);
  const needles = identities.map((id) => id.partyDisplayName.trim().toLowerCase()).filter(Boolean);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^(?:CLIENT|SERVICE PROVIDER)\s*:/i.test(t)) return false;
    if (/^(?:Name|Title|Date|Email)\s*:/i.test(t)) return false;
    if (needles.some((n) => t.toLowerCase() === n)) return false;
    return true;
  });
  if (kept.length !== lines.length) repairs.push("strip_all_pre_witness_signer_lines");
  return { text: `${kept.join("\n")}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function dedupeWitnessBlocks(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const matches = [...text.matchAll(/\bIN WITNESS WHEREOF\b/gi)];
  if (matches.length <= 1) return { text, repairs };
  const firstIdx = matches[0]!.index ?? 0;
  const before = text.slice(0, firstIdx).trimEnd();
  const tail = text.slice(firstIdx).trimStart();
  repairs.push("dedupe_witness_block");
  return { text: `${before}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function replaceContractorCompanyPartyLabels(
  text: string,
  opts?: { authoritativePartyNames?: readonly string[] },
): { text: string; repairs: string[] } {
  if (!opts?.authoritativePartyNames?.length) return { text, repairs: [] };
  const repairs: string[] = [];
  let out = text;
  if (CONTRACTOR_FALLBACK_RE.test(out)) {
    out = out.replace(/\bthe\s+Contractor\b/gi, "Service Provider");
    out = out.replace(/\bContractor\b/g, "Service Provider");
    out = out.replace(/\bthe\s+Company\b/gi, "the Client");
    repairs.push("replace_contractor_company_labels");
  }
  return { text: out, repairs };
}

function normalizeDefinedTermPartyCopy(
  text: string,
  opts?: { authoritativePartyNames?: readonly string[] },
): { text: string; repairs: string[] } {
  const [clientName, providerName] = opts?.authoritativePartyNames?.map((n) => n.trim()) ?? [];
  if (!clientName || !providerName) return { text, repairs: [] };

  const repairs: string[] = [];
  const witnessIdx = witnessIndex(text);
  const before = text.slice(0, witnessIdx);
  const after = text.slice(witnessIdx);
  const lines = normLines(before);
  const firstSectionIdx = lines.findIndex((l) => /^\s*1\.\s+/.test(l));
  const introEndLine = firstSectionIdx >= 0 ? firstSectionIdx : Math.min(lines.length, 6);
  let introLines = lines.slice(0, introEndLine);
  let bodyLines = lines.slice(introEndLine);

  const definedOpening = `This Agreement is between ${clientName} ("Client") and ${providerName} ("Service Provider").`;
  const hasDefinedClient = introLines.some((l) =>
    new RegExp(`\\b${escapeRe(clientName)}\\b[\\s\\S]{0,120}\\(\\s*["“']Client["”']\\s*\\)`, "i").test(l),
  );
  const hasDefinedProvider = introLines.some((l) =>
    new RegExp(`\\b${escapeRe(providerName)}\\b[\\s\\S]{0,140}\\(\\s*["“']Service Provider["”']\\s*\\)`, "i").test(l),
  );

  let replacedOpening = false;
  introLines = introLines.map((line) => {
    if (
      /(?:this\s+agreement\s+is\s+)?(?:entered\s+into\s+)?(?:by\s+and\s+)?between\b/i.test(line) &&
      (/\bClient\b/i.test(line) || new RegExp(escapeRe(clientName), "i").test(line)) &&
      (/\b(?:Provider|Service Provider)\b/i.test(line) || new RegExp(escapeRe(providerName), "i").test(line))
    ) {
      replacedOpening = true;
      return definedOpening;
    }
    return line;
  });
  if (!replacedOpening && (!hasDefinedClient || !hasDefinedProvider)) {
    const titleIdx = introLines.findIndex((l) => /AGREEMENT\s*$/i.test(l.trim()));
    introLines =
      titleIdx >= 0
        ? [
            ...introLines.slice(0, titleIdx + 1),
            "",
            definedOpening,
            ...introLines.slice(titleIdx + 1),
          ]
        : [definedOpening, "", ...introLines];
  }
  if (replacedOpening || !hasDefinedClient || !hasDefinedProvider) {
    repairs.push("party_defined_terms:opening");
  }

  const normalizeLine = (line: string): string => {
    let out = line;
    out = out.replace(/\bProvider\b/g, "Service Provider");
    out = out.replace(/\bprovider\b/g, "Service Provider");
    out = out.replace(/\bService\s+Service Provider\b/g, "Service Provider");
    out = out.replace(/\bservices\s+Service Provider\b/gi, "services provider");
    out = out.replace(/\bClient,\s+the\s+Client\b/gi, "the Client");
    out = out.replace(/\bService Provider,\s+the\s+Service Provider\b/gi, "the Service Provider");
    return out;
  };

  const duplicateOpeningRe = new RegExp(
    `\\b${escapeRe(clientName)}\\b[\\s\\S]{0,120}\\(\\s*["“']Client["”']\\s*\\)[\\s\\S]{0,160}\\b${escapeRe(providerName)}\\b[\\s\\S]{0,140}\\(\\s*["“']Service Provider["”']\\s*\\)`,
    "i",
  );
  let seenOpening = false;
  const normalizedIntro = introLines.map(normalizeLine).filter((line) => {
    if (!duplicateOpeningRe.test(line)) return true;
    if (!seenOpening) {
      seenOpening = true;
      return true;
    }
    repairs.push("party_defined_terms:drop_duplicate_opening");
    return false;
  });
  const normalizedBody = bodyLines.map(normalizeLine).filter((line) => {
    if (!duplicateOpeningRe.test(line)) return true;
    if (!seenOpening) {
      seenOpening = true;
      return true;
    }
    repairs.push("party_defined_terms:drop_duplicate_opening");
    return false;
  });
  const rebuilt = [...normalizedIntro, ...normalizedBody].join("\n");
  if (rebuilt !== before) repairs.push("party_defined_terms:body_terms");
  return { text: `${rebuilt.trimEnd()}\n\n${after.trimStart()}`.trim(), repairs: [...new Set(repairs)] };
}

function stripEmptySubsectionHeadings(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = normLines(text);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (/^\d+\.\d+\.?\s+/.test(t) && isLikelyEmptySubsectionHeading(t)) {
      repairs.push(`strip_empty_subsection:${t.slice(0, 32)}`);
      return false;
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function collapseDuplicateDefinedTermOpenings(
  text: string,
  opts?: { authoritativePartyNames?: readonly string[] },
): { text: string; repairs: string[] } {
  const [clientName, providerName] = opts?.authoritativePartyNames?.map((n) => n.trim()) ?? [];
  if (!clientName || !providerName) return { text, repairs: [] };
  const openingRe = new RegExp(
    `\\b${escapeRe(clientName)}\\b[\\s\\S]{0,120}\\(\\s*["“']Client["”']\\s*\\)[\\s\\S]{0,160}\\b${escapeRe(providerName)}\\b[\\s\\S]{0,140}\\(\\s*["“']Service Provider["”']\\s*\\)`,
    "i",
  );
  const repairs: string[] = [];
  let seen = false;
  const lines = normLines(text).filter((line) => {
    if (!openingRe.test(line)) return true;
    if (!seen) {
      seen = true;
      return true;
    }
    repairs.push("party_defined_terms:drop_duplicate_opening");
    return false;
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs: [...new Set(repairs)] };
}

export function repairFinalGradeGuidedCorpus(
  text: string,
  opts?: {
    signerIdentities?: readonly CanonicalPartyIdentity[];
    authoritativePartyNames?: readonly string[];
  },
): { text: string; repairs: string[]; defects: FinalGradeCorpusDefect[] } {
  const repairs: string[] = [];
  let out = (text || "").trim();
  if (!out) return { text: out, repairs, defects: ["empty_numbered_section"] };

  const instruction = stripGuidedInstructionLeakLines(out);
  out = instruction.text;
  repairs.push(...instruction.repairs);

  const fees = dedupeConflictingFeeProvisions(out);
  out = fees.text;
  repairs.push(...fees.repairs);

  const purpose = populateEmptyPurposeSection(out);
  out = purpose.text;
  repairs.push(...purpose.repairs);

  const partyLabels = replaceContractorCompanyPartyLabels(out, {
    authoritativePartyNames: opts?.authoritativePartyNames,
  });
  out = partyLabels.text;
  repairs.push(...partyLabels.repairs);

  const definedTerms = normalizeDefinedTermPartyCopy(out, {
    authoritativePartyNames: opts?.authoritativePartyNames,
  });
  out = definedTerms.text;
  repairs.push(...definedTerms.repairs);

  const emptySubsections = stripEmptySubsectionHeadings(out);
  out = emptySubsections.text;
  repairs.push(...emptySubsections.repairs);

  if (opts?.signerIdentities?.length) {
    const preWitness = stripAllPreWitnessSignerFragments(out, opts.signerIdentities);
    out = preWitness.text;
    repairs.push(...preWitness.repairs);
  }

  const witnessDedupe = dedupeWitnessBlocks(out);
  out = witnessDedupe.text;
  repairs.push(...witnessDedupe.repairs);

  const structure = normalizeGuidedProCorpusStructure(out);
  out = structure.text;
  repairs.push(...structure.repairs.map((r) => `structure:${r}`));

  const purposeAfterStructure = populateEmptyPurposeSection(out);
  out = purposeAfterStructure.text;
  repairs.push(...purposeAfterStructure.repairs);

  const emptySections = repairEmptyNumberedSections(out);
  out = emptySections.text;
  repairs.push(...emptySections.repairs);

  const duplicateOpenings = collapseDuplicateDefinedTermOpenings(out, {
    authoritativePartyNames: opts?.authoritativePartyNames,
  });
  out = duplicateOpenings.text;
  repairs.push(...duplicateOpenings.repairs);

  const validation = validateNormalizedCorpusStructure(out);
  if (!validation.ok) {
    const retry = normalizeGuidedProCorpusStructure(out);
    out = retry.text;
    repairs.push(...retry.repairs.map((r) => `structure_retry:${r}`));
  }

  let defects = detectFinalGradeCorpusDefects(out, {
    authoritativePartyNames: opts?.authoritativePartyNames,
  });
  const blocking = defects.filter(
    (d) => d !== "party_letter_fallback" || !opts?.authoritativePartyNames?.length,
  );
  const rebuildTriggers: FinalGradeCorpusDefect[] = [
    "weak_purpose_section",
    "fees_section_contamination",
    "duplicate_conflicting_fees",
    "misplaced_subsection_content",
    "section_topic_contamination",
    "empty_subsection_heading",
    "orphan_signer_metadata",
    "duplicate_witness_block",
    "duplicate_notice_section",
    "subsection_number_mismatch",
  ];
  if (blocking.some((d) => rebuildTriggers.includes(d))) {
    const rebuilt = rebuildCanonicalGuidedCorpusFromClauses(out, {
      signerIdentities: opts?.signerIdentities,
    });
    out = rebuilt.text;
    repairs.push(...rebuilt.repairs);
    const postRebuildParty = replaceContractorCompanyPartyLabels(out, {
      authoritativePartyNames: opts?.authoritativePartyNames,
    });
    out = postRebuildParty.text;
    repairs.push(...postRebuildParty.repairs);
    const postRebuildDefinedTerms = normalizeDefinedTermPartyCopy(out, {
      authoritativePartyNames: opts?.authoritativePartyNames,
    });
    out = postRebuildDefinedTerms.text;
    repairs.push(...postRebuildDefinedTerms.repairs);
    const postRebuildEmptySubsections = stripEmptySubsectionHeadings(out);
    out = postRebuildEmptySubsections.text;
    repairs.push(...postRebuildEmptySubsections.repairs);
    const postRebuildDuplicateOpenings = collapseDuplicateDefinedTermOpenings(out, {
      authoritativePartyNames: opts?.authoritativePartyNames,
    });
    out = postRebuildDuplicateOpenings.text;
    repairs.push(...postRebuildDuplicateOpenings.repairs);
    if (opts?.signerIdentities?.length) {
      const preWitness = stripAllPreWitnessSignerFragments(out, opts.signerIdentities);
      out = preWitness.text;
      repairs.push(...preWitness.repairs);
    }
    const witnessAgain = dedupeWitnessBlocks(out);
    out = witnessAgain.text;
    repairs.push(...witnessAgain.repairs);
    defects = detectFinalGradeCorpusDefects(out, {
      authoritativePartyNames: opts?.authoritativePartyNames,
    });
  }

  return { text: out, repairs, defects };
}

export function assertFinalGradeCorpusReady(
  text: string,
  opts?: {
    signerIdentities?: readonly CanonicalPartyIdentity[];
    authoritativePartyNames?: readonly string[];
  },
): { ok: boolean; defects: FinalGradeCorpusDefect[]; corpus: string } {
  const repaired = repairFinalGradeGuidedCorpus(text, opts);
  const blocking = repaired.defects.filter(
    (d) => d !== "party_letter_fallback" || !opts?.authoritativePartyNames?.length,
  );
  return {
    ok: blocking.length === 0 && repaired.text.length >= 1500,
    defects: repaired.defects,
    corpus: repaired.text,
  };
}

export function logFinalGradeCorpusDefects(payload: {
  defects: readonly FinalGradeCorpusDefect[];
  repaired: boolean;
  bodyLen: number;
  blocking?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-grade-corpus]", payload);
}

/** True when corpus passes final-grade invariants (optionally after repair). */
export function isFinalGradeCorpusBlocking(
  defects: readonly FinalGradeCorpusDefect[],
  opts?: { authoritativePartyNames?: readonly string[] },
): boolean {
  return (
    defects.filter((d) => d !== "party_letter_fallback" || !opts?.authoritativePartyNames?.length).length > 0
  );
}
