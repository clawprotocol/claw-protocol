/**
 * Read-only QA scorer for paid Pro agreement plain text (no mutations).
 * For Test239-style legal ceiling and closing-sequence audits.
 */

export type ProAgreementProvisionStatus = "present" | "thin" | "missing";

export type ProAgreementProvisionId =
  | "notices"
  | "miscellaneous_counterparts_esign"
  | "ip_ownership"
  | "ip_warranty_non_infringement"
  | "acceptance_procedure"
  | "change_orders"
  | "data_protection_confidentiality"
  | "force_majeure"
  | "audit_rights_records"
  | "subcontractors"
  | "dispute_resolution"
  | "assignment"
  | "survival"
  | "limitation_of_liability"
  | "governing_law_venue";

export type ProAgreementProvisionScore = {
  id: ProAgreementProvisionId;
  label: string;
  status: ProAgreementProvisionStatus;
  sectionRef: string | null;
  evidence: string | null;
};

export type ProAgreementClosingSequenceAudit = {
  thinClosingSequence: boolean;
  witnessIndex: number | null;
  preWitnessWindow: string | null;
  hasNearbyClosingSignals: boolean;
  reason: string | null;
};

export type ProAgreementQualityQaScore = {
  corpusLen: number;
  provisions: ProAgreementProvisionScore[];
  closing: ProAgreementClosingSequenceAudit;
};

type ProvisionRule = {
  id: ProAgreementProvisionId;
  label: string;
  presentRe: RegExp;
  thinRe?: RegExp;
  sectionHeadingRe?: RegExp;
};

const PROVISION_RULES: readonly ProvisionRule[] = [
  {
    id: "notices",
    label: "Notices",
    presentRe: /\bnotices?\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?NOTICES?\b/im,
    thinRe: /\bnotices?\b[\s\S]{0,120}\./i,
  },
  {
    id: "miscellaneous_counterparts_esign",
    label: "Miscellaneous / counterparts / e-sign",
    presentRe: /\b(?:miscellaneous|counterpart|electronic\s+sign|entire\s+agreement)\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?(?:MISCELLANEOUS|GENERAL)\b/im,
  },
  {
    id: "ip_ownership",
    label: "IP ownership",
    presentRe: /\b(?:intellectual\s+property|work\s+product|ownership\s+of\s+deliverables)\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?(?:INTELLECTUAL\s+PROPERTY|IP)\b/im,
  },
  {
    id: "ip_warranty_non_infringement",
    label: "IP warranty / non-infringement",
    presentRe: /\b(?:non-?infring|infringement|warrant(?:y|ies))\b/i,
    thinRe: /\bwarrant(?:y|ies)\b[\s\S]{0,200}\b(?:perform|authority)\b/i,
  },
  {
    id: "acceptance_procedure",
    label: "Acceptance procedure",
    presentRe: /\b(?:acceptance|accept\s+(?:deliverables?|work|services)|UAT|user\s+acceptance)\b/i,
  },
  {
    id: "change_orders",
    label: "Change orders",
    presentRe: /\b(?:change\s+order|change\s+control|written\s+change|change\s+request)\b/i,
  },
  {
    id: "data_protection_confidentiality",
    label: "Data protection / confidentiality",
    presentRe: /\b(?:confidential|data\s+protection|privacy|personal\s+data|safeguards?)\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?(?:CONFIDENTIAL|DATA\s+PROTECTION)\b/im,
  },
  {
    id: "force_majeure",
    label: "Force majeure",
    presentRe: /\bforce\s+majeure\b/i,
  },
  {
    id: "audit_rights_records",
    label: "Audit rights / records",
    presentRe: /\b(?:\baudit\b|books\s+and\s+records|financial\s+records)\b/i,
  },
  {
    id: "subcontractors",
    label: "Subcontractors",
    presentRe: /\b(?:subcontract|sub-?contract|delegate\s+(?:performance|obligations))\b/i,
  },
  {
    id: "dispute_resolution",
    label: "Dispute resolution",
    presentRe: /\b(?:dispute|arbitrat|mediat|escalat(?:e|ion))\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?DISPUTE\b/im,
  },
  {
    id: "assignment",
    label: "Assignment",
    presentRe: /\b(?:assign(?:ment|able)|transfer\s+(?:rights|obligations)|successors?\s+and\s+assigns)\b/i,
  },
  {
    id: "survival",
    label: "Survival",
    presentRe: /\bsurviv(?:e|al|es)\b/i,
  },
  {
    id: "limitation_of_liability",
    label: "Limitation of liability / exclusions",
    presentRe: /\b(?:limitation\s+of\s+liability|liability\s+cap|consequential\s+damages)\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?LIMITATION\s+OF\s+LIABILITY\b/im,
  },
  {
    id: "governing_law_venue",
    label: "Governing law / venue",
    presentRe: /\b(?:governing\s+law|exclusive\s+jurisdiction|venue|choice\s+of\s+law)\b/i,
    sectionHeadingRe: /^\s*(?:\d+\.\s*)?GOVERNING\s+LAW\b/im,
  },
];

const CLOSING_SIGNAL_RE =
  /\b(?:surviv(?:e|al|es)|counterpart|electronic\s+sign|entire\s+agreement|miscellaneous|no\s+other\s+obligations)\b/i;

const GOVERNING_OR_NOTICES_RE = /\b(?:GOVERNING\s+LAW|NOTICES?)\b/i;

function normalizePlain(text: string): string {
  return (text || "").replace(/\r\n?/g, "\n").trim();
}

function findSectionRef(text: string, headingRe?: RegExp, fallbackRe?: RegExp): string | null {
  if (headingRe) {
    const m = text.match(headingRe);
    if (m?.index != null) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index);
      return text.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined).trim().slice(0, 120) || null;
    }
  }
  if (fallbackRe) {
    const m = text.match(fallbackRe);
    if (m?.index != null) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index);
      return text.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined).trim().slice(0, 120) || null;
    }
  }
  return null;
}

function scoreProvision(text: string, rule: ProvisionRule): ProAgreementProvisionScore {
  const present = rule.presentRe.test(text);
  if (!present) {
    return {
      id: rule.id,
      label: rule.label,
      status: "missing",
      sectionRef: null,
      evidence: null,
    };
  }
  const sectionRef = findSectionRef(text, rule.sectionHeadingRe, rule.presentRe);
  const hitIndex = text.search(rule.presentRe);
  const local = hitIndex >= 0 ? text.slice(hitIndex, hitIndex + 500) : "";
  let status: ProAgreementProvisionStatus = "present";
  if (rule.thinRe != null && !rule.thinRe.test(text)) {
    status = "thin";
  } else if (!sectionRef && local.replace(/\s+/g, " ").trim().length < 100) {
    status = "thin";
  }
  const evidence =
    hitIndex >= 0
      ? text
          .slice(hitIndex, hitIndex + 160)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140)
      : null;
  return {
    id: rule.id,
    label: rule.label,
    status,
    sectionRef,
    evidence,
  };
}

/** Read-only: does not modify input text. */
export function auditProAgreementClosingSequence(plain: string): ProAgreementClosingSequenceAudit {
  const text = normalizePlain(plain);
  if (!text) {
    return {
      thinClosingSequence: false,
      witnessIndex: null,
      preWitnessWindow: null,
      hasNearbyClosingSignals: false,
      reason: null,
    };
  }
  const witnessIndex = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIndex < 0) {
    return {
      thinClosingSequence: false,
      witnessIndex: null,
      preWitnessWindow: null,
      hasNearbyClosingSignals: false,
      reason: "no_witness_block",
    };
  }
  const windowStart = Math.max(0, witnessIndex - 900);
  const preWitnessWindow = text.slice(windowStart, witnessIndex);
  const hasGovOrNotices = GOVERNING_OR_NOTICES_RE.test(preWitnessWindow);
  const hasNearbyClosingSignals = CLOSING_SIGNAL_RE.test(preWitnessWindow);
  const thinClosingSequence = hasGovOrNotices && !hasNearbyClosingSignals;
  return {
    thinClosingSequence,
    witnessIndex,
    preWitnessWindow: preWitnessWindow.slice(-400).trim() || null,
    hasNearbyClosingSignals,
    reason: thinClosingSequence
      ? "governing_law_or_notices_immediately_before_witness_without_misc_survival_counterparts_esign"
      : null,
  };
}

/** Read-only: scores provision coverage and closing transition for QA. */
export function scoreProAgreementQualityForQa(plain: string): ProAgreementQualityQaScore {
  const text = normalizePlain(plain);
  return {
    corpusLen: text.length,
    provisions: PROVISION_RULES.map((rule) => scoreProvision(text, rule)),
    closing: auditProAgreementClosingSequence(text),
  };
}
