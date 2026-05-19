/**
 * Lightweight section semantic validation — keyword-based dominant topic per section.
 */

import type { ParsedAgreementSection, SectionPurityIssue, SectionSemanticKind } from "./types";

const HEADING_KIND: readonly { kind: SectionSemanticKind; re: RegExp }[] = [
  { kind: "parties", re: /^(?:parties|the parties|definitions)\b/i },
  { kind: "scope", re: /^(?:scope|services|deliverables|work\s+scope|statement\s+of\s+work)\b/i },
  { kind: "payment", re: /^(?:payment|fees|compensation|pricing)\b/i },
  { kind: "milestones", re: /^(?:milestones?|implementation\s+schedule|project\s+plan)\b/i },
  { kind: "governance", re: /^(?:governance|project\s+management|steering|coordination)\b/i },
  { kind: "sla", re: /^(?:service\s+level|sla|uptime|availability|support)\b/i },
  { kind: "ip", re: /^(?:intellectual\s+property|ip|ownership|license)\b/i },
  { kind: "confidentiality", re: /^(?:confidential|non[-\s]?disclosure|nda)\b/i },
  { kind: "termination", re: /^(?:term(?:ination)?|expiration)\b/i },
  { kind: "dispute", re: /^(?:dispute|arbitration|governing\s+law|jurisdiction|mediation)\b/i },
  { kind: "contacts", re: /^(?:notices?|contact|communications?)\b/i },
  { kind: "signatures", re: /^(?:signatures?|execution|in\s+witness)\b/i },
];

const SENTENCE_TOPIC: readonly { kind: SectionSemanticKind; re: RegExp }[] = [
  { kind: "dispute", re: /\b(?:arbitrat|mediat|governing\s+law|jurisdiction|venue|dispute\s+resolution|\bdispute\s+shall)\b/i },
  { kind: "confidentiality", re: /\b(?:confidential\s+information|non[-\s]?disclosure|trade\s+secret)\b/i },
  { kind: "sla", re: /\b(?:uptime|service\s+level|response\s+time|availability\s+target|monthly\s+uptime)\b/i },
  { kind: "ip", re: /\b(?:intellectual\s+property|work\s+product|license\s+grant|ownership\s+of\s+(?:all|any))\b/i },
  { kind: "payment", re: /\b(?:invoice|payment\s+due|late\s+fee|installment)\b/i },
  {
    kind: "termination",
    re: /\b(?:notice\s+of\s+termination|terminat(?:e|ion)\s+of\s+this|upon\s+termination|expires?\s+on)\b/i,
  },
];

const STRICT_SECTIONS: ReadonlySet<SectionSemanticKind> = new Set(["contacts", "signatures", "confidentiality", "ip"]);

function classifyHeading(heading: string): SectionSemanticKind {
  const h = heading.trim();
  for (const { kind, re } of HEADING_KIND) {
    if (re.test(h)) return kind;
  }
  return "general";
}

function classifySentence(sentence: string): SectionSemanticKind | null {
  for (const { kind, re } of SENTENCE_TOPIC) {
    if (re.test(sentence)) return kind;
  }
  return null;
}

/** Split agreement into numbered / titled sections. */
export function parseAgreementSections(text: string): ParsedAgreementSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: ParsedAgreementSection[] = [];
  let current: ParsedAgreementSection | null = null;
  const numberedHeadingRe = /^(?:\d+\.?\s+)([A-Z][A-Za-z0-9\s/&-]{2,60})\s*\.?\s*$/;
  const allCapsHeadingRe = /^([A-Z][A-Z0-9\s/&-]{2,60})\s*\.?\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(numberedHeadingRe) || line.match(allCapsHeadingRe);
    const trimmed = line.replace(/\.\s*$/, "");
    const isAllCapsTitle = Boolean(line.match(allCapsHeadingRe));
    const isHeading =
      Boolean(m) &&
      trimmed.length < 72 &&
      (isAllCapsTitle || !line.includes(".")) &&
      !/\b(?:shall|are|is|will|must|agreed|below|listed|resolved|provided)\b/i.test(trimmed);
    if (isHeading && m) {
      if (current) sections.push(current);
      current = {
        heading: m[1].trim(),
        kind: classifyHeading(m[1].trim()),
        body: "",
        startLine: i,
      };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function sentencesFromBody(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
}

function isAllowedCrossTopic(section: SectionSemanticKind, sentence: SectionSemanticKind): boolean {
  if (section === "scope" && sentence === "sla") return true;
  if (section === "governance" && sentence === "contacts") return true;
  if (section === "milestones" && sentence === "payment") return true;
  if (section === "confidentiality" && sentence === "sla") return true;
  return false;
}

/**
 * Remove outlier sentences whose dominant topic mismatches strict sections (contacts, signatures, IP, confidentiality).
 */
export function applySectionPurityPass(text: string): { text: string; issues: SectionPurityIssue[] } {
  const sections = parseAgreementSections(text);
  const issues: SectionPurityIssue[] = [];
  let out = text;

  const protectedEnterprise = /target\s+monthly\s+uptime|fifteen\s*\(\s*15\s*\)\s+business\s+days|attorneys[''\u2019]?\s+fees|survive\s+expiration\s+or\s+termination/i;

  const processSentences = (sentences: string[], secKind: SectionSemanticKind, heading: string) => {
    for (const sent of sentences) {
      if (protectedEnterprise.test(sent) || /\bsurvive\b/i.test(sent)) continue;
      const detected = classifySentence(sent);
      if (!detected || detected === secKind || isAllowedCrossTopic(secKind, detected)) continue;
      if (!STRICT_SECTIONS.has(secKind)) continue;
      issues.push({
        sectionKind: secKind,
        heading,
        outlierSentence: sent.slice(0, 120),
        detectedAs: detected,
        action: "removed",
      });
      const esc = sent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(esc, "i"), "").replace(/\n{3,}/g, "\n\n");
    }
  };

  for (const sec of sections) {
    processSentences(sentencesFromBody(sec.body), sec.kind, sec.heading);
  }

  const noticesBody = out.match(/\bNOTICES?\b\s*([\s\S]*?)(?=\bSIGNATURES?\b|\bIN WITNESS WHEREOF\b|$)/i)?.[1];
  if (noticesBody) {
    processSentences(sentencesFromBody(noticesBody), "contacts", "NOTICES");
  }
  const sigBody = out.match(/\b(?:IN WITNESS WHEREOF|SIGNATURES?)\b\s*([\s\S]*)$/i)?.[1];
  if (sigBody) {
    processSentences(sentencesFromBody(sigBody), "signatures", "SIGNATURES");
  }

  return { text: out, issues };
}
