/**
 * Document Composition Authority — Clause Family Registry (layer 2).
 *
 * Scans the authoritative corpus for operative clause families. Composition,
 * enrichment, fallback, and repair passes must consult this registry before
 * appending a standalone clause family block.
 *
 * Presence is determined by registry patterns — never by a lone jurisdiction
 * string, party name, role label, or incidental keyword outside clause context.
 */

export type OperativeClauseFamily =
  | "governing_law"
  | "venue"
  | "notices"
  | "confidentiality"
  | "indemnification"
  | "limitation_of_liability"
  | "payment_terms"
  | "intellectual_property"
  | "termination"
  | "definitions"
  | "assignment"
  | "dispute_resolution"
  | "force_majeure"
  | "services_scope"
  | "term"
  | "independent_contractor"
  | "warranties_disclaimers"
  | "electronic_signatures"
  | "survival"
  | "execution_block";

const FAMILY_PATTERNS: Record<OperativeClauseFamily, RegExp> = {
  governing_law:
    /\b(?:governing\s+law|choice\s+of\s+law|laws?\s+of\s+(?:the\s+)?(?:state|commonwealth)\s+of|governed\s+by(?:\s+the)?\s+laws?\s+of|oklahoma\s+law\s+governs)\b/i,
  venue: /\b(?:venue|exclusive\s+jurisdiction|forum\s+(?:selection|non\s+conveniens))\b/i,
  notices:
    /\b(?:notices?\s+and\s+dispute|notice\s+(?:provisions?|addresses?)|party\s+notice\s+details|if\s+to\s+(?:the\s+)?[A-Za-z])/i,
  confidentiality:
    /\b(?:confidential(?:ity| information)|non[\s-]*disclosure|confidential\s+information\s+means)\b/i,
  indemnification: /\bindemnif(?:y|ication)\b/i,
  limitation_of_liability: /\b(?:limitation\s+of\s+liability|liability\s+cap|consequential\s+damages)\b/i,
  payment_terms:
    /\b(?:payment\s+terms?|compensation|fees?\s+and\s+payment|invoice|consideration|late\s+payment)\b/i,
  intellectual_property:
    /\b(?:intellectual\s+property|work\s+product|ownership\s+of\s+(?:work\s+product|deliverables))\b/i,
  termination:
    /\b(?:terminat(?:ion|e|ing)(?:\s+for\s+(?:cause|convenience))?|termination\s+for\s+(?:cause|convenience))\b/i,
  definitions: /\b(?:definitions?|defined\s+terms?)\b/i,
  assignment: /\b(?:assign(?:ment|ability)|subcontract(?:ing)?)\b/i,
  dispute_resolution: /\b(?:dispute\s+resolution|arbitrat(?:ion|e)|mediat(?:ion|e))\b/i,
  force_majeure: /\bforce\s+majeure\b/i,
  services_scope:
    /\b(?:scope\s+of\s+services|project\s+scope|services\s+and\s+deliverables|professional\s+services)\b/i,
  term: /\b(?:term\s+of\s+(?:agreement|engagement)|commencement\s+date|effective\s+date)\b/i,
  independent_contractor:
    /\b(?:independent\s+contractor|contractor\s+status|not\s+an\s+employee)\b/i,
  warranties_disclaimers: /\b(?:warrant(?:y|ies)|representations?\s+and\s+warranties|disclaimer)\b/i,
  electronic_signatures:
    /\b(?:electronic\s+signatures?|e-sign(?:ature)?s?|counterparts?|executed\s+electronically)\b/i,
  survival: /\b(?:surviv(?:e|al|ing)|survive\s+termination)\b/i,
  execution_block: /\b(?:IN\s+WITNESS\s+WHEREOF|SIGNATURES?\s*(?:\n|$))\b/i,
};

/** Top-level numbered section heading (excludes 6.1 / 10.2 subsections). */
const TOP_LEVEL_SECTION_NUM = String.raw`\d+\.(?!\d)`;

/** Numbered standalone section headings used for duplicate-heading audits. */
export const STANDALONE_FAMILY_HEADING_RES: Partial<Record<OperativeClauseFamily, RegExp>> = {
  governing_law:
    new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*(?:GOVERNING\s+LAW(?:\s+AND\s+VENUE)?)\b`, "gim"),
  venue: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*VENUE\b`, "gim"),
  notices: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*NOTICES?\b`, "gim"),
  confidentiality: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*CONFIDENTIALITY\b`, "gim"),
  indemnification: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*INDEMNIF(?:ICATION|Y)\b`, "gim"),
  limitation_of_liability: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*LIMITATION\s+OF\s+LIABILITY\b`,
    "gim",
  ),
  payment_terms: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*(?:PAYMENT\s+TERMS?|COMPENSATION|FEES?\s+AND\s+PAYMENT)\b`,
    "gim",
  ),
  intellectual_property: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*(?:INTELLECTUAL\s+PROPERTY|OWNERSHIP(?:\s+AND)?\s+WORK\s+PRODUCT)\b`,
    "gim",
  ),
  termination: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*TERMINATION\b`, "gim"),
  definitions: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*DEFINITIONS?\b`, "gim"),
  services_scope: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*(?:SCOPE\s+OF\s+SERVICES|SERVICES)\b`,
    "gim",
  ),
  term: new RegExp(String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*TERM\b`, "gim"),
  independent_contractor: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*INDEPENDENT\s+CONTRACTOR\b`,
    "gim",
  ),
  electronic_signatures: new RegExp(
    String.raw`^\s*${TOP_LEVEL_SECTION_NUM}\s*(?:ELECTRONIC\s+SIGNATURES?|MISCELLANEOUS\s+AND\s+ELECTRONIC)\b`,
    "gim",
  ),
  execution_block: /^\s*(?:IN\s+WITNESS\s+WHEREOF|SIGNATURES?)\b/gim,
};

/** Mutual-consulting quality-floor topic → registry family (all topics gated). */
export const MUTUAL_CONSULTING_TOPIC_FAMILY: Record<string, OperativeClauseFamily> = {
  services_scope: "services_scope",
  term: "term",
  compensation: "payment_terms",
  confidentiality: "confidentiality",
  ownership_work_product: "intellectual_property",
  independent_contractor: "independent_contractor",
  warranties_compliance: "warranties_disclaimers",
  termination_suspension: "termination",
  limitation_liability: "limitation_of_liability",
  notices: "notices",
  governing_law_venue: "governing_law",
  miscellaneous_esignatures: "electronic_signatures",
};

export function scanOperativeClauseFamilies(corpus: string): Set<OperativeClauseFamily> {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const found = new Set<OperativeClauseFamily>();
  for (const family of Object.keys(FAMILY_PATTERNS) as OperativeClauseFamily[]) {
    if (FAMILY_PATTERNS[family].test(text)) found.add(family);
  }
  if (found.has("governing_law") && /\bvenue\b/i.test(text)) {
    found.add("venue");
  }
  return found;
}

export function isOperativeClauseFamilyPresent(
  corpus: string,
  family: OperativeClauseFamily,
): boolean {
  return scanOperativeClauseFamilies(corpus).has(family);
}

export function countStandaloneClauseFamilyHeadings(
  corpus: string,
  family: OperativeClauseFamily,
): number {
  const re = STANDALONE_FAMILY_HEADING_RES[family];
  if (!re) return 0;
  const text = (corpus || "").replace(/\r\n/g, "\n");
  return [...text.matchAll(re)].length;
}

/**
 * Composition passes may append a standalone clause family only when the registry
 * reports it absent from the current corpus.
 */
export function canAppendOperativeClauseFamily(
  corpus: string,
  family: OperativeClauseFamily,
): boolean {
  return !isOperativeClauseFamilyPresent(corpus, family);
}
