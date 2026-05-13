/**
 * Strategic Posture Review — additive, opt-in only.
 *
 * Developer note:
 *   This layer models "operational reality vs. document language" — it is NOT a legal
 *   conclusion engine. It surfaces calm, founder/operator-style observations that an
 *   experienced reviewer would jot in the margin: missing further-assurances clauses,
 *   absent return-or-destruction mechanics on confidentiality, payment governance gaps,
 *   contributor-assignment exposure, and so on. Severity labels reflect diligence
 *   relevance — not enforceability. Public copy MUST avoid the words "invalid",
 *   "unenforceable", "noncompliant", and "critical failure" unless an upstream system
 *   pattern already supports them.
 *
 * Boundaries (mandatory):
 *   • Frontend-only, fully synchronous, no LLM, no network, no persistence, no analytics.
 *   • All inputs and outputs are optional — fail-soft when nothing is supplied.
 *   • Existing review experience is unaffected unless a caller explicitly passes a
 *     {@link StrategicPostureReview} value into the optional panel.
 *   • Heuristics here use only locally available document text. They never throw.
 */

export type StrategicPostureFindingSeverity = "low" | "medium" | "high";

export type StrategicPostureFinding = {
  /** Short label for the diligence area (e.g., "IP chain-of-title"). */
  category: string;
  severity: StrategicPostureFindingSeverity;
  /** Calm, factual observation — what we noticed in the document. */
  observation: string;
  /** Why a founder / counsel / acquirer might care, written plainly. */
  why_it_matters: string;
  /** Drop-in suggested update language the user can copy. Plain prose, no internal jargon. */
  suggested_update: string;
  /** Optional verbatim excerpt that triggered the observation. */
  evidence_excerpt?: string;
};

export type StrategicPostureReview = {
  summary?: string;
  /**
   * Optional 0–100 self-rating of how investor / acquirer-ready the operational posture
   * looks — purely informational. Callers may omit this field; the panel renders without it.
   */
  posture_score?: number;
  findings?: StrategicPostureFinding[];
  /**
   * Documents an experienced reviewer would expect to see alongside this one but did not
   * find — e.g., "Contributor IP Assignment Packet", "Board Resolution ratifying prior IP".
   */
  missing_companion_documents?: string[];
  /**
   * If true, callers acknowledge a degraded source (e.g. partial OCR) and the panel renders
   * a calmer header with no scoring chip. Findings still render normally.
   */
  fail_soft?: boolean;
};

export const STRATEGIC_POSTURE_DISCLAIMER =
  "Software assistance, not legal advice. These notes are operator/founder-style observations to help with diligence prep — please confirm anything material with counsel.";

/* ──────────────────────────── Heuristic detectors ─────────────────────────────
 * Each detector is a small synchronous function over plain document text. Detectors
 * NEVER throw; they return null when the relevant pattern isn't observable. The wrapping
 * {@link buildStrategicPostureReviewFromText} composes detectors and skips any that
 * return null — guaranteeing fail-soft behavior when input is empty / unstructured.
 *
 * These checks are intentionally simple and conservative. They flag absences of common
 * companion clauses; they do NOT claim a clause is invalid or unenforceable.
 * ───────────────────────────────────────────────────────────────────────────── */

const RE_IP_OWNERSHIP =
  /\b(?:work[-\s]?made[-\s]?for[-\s]?hire|work\s+for\s+hire|assign(?:s|ment)?\s+(?:all\s+)?(?:right|title|interest|ownership)|intellectual\s+property\s+(?:rights?|ownership)|ip\s+ownership)\b/i;
const RE_FURTHER_ASSURANCES = /\bfurther\s+assurances?\b/i;
const RE_BACKGROUND_TECH =
  /\b(?:background\s+(?:technology|tech|ip|materials|works?)|pre[-\s]?existing\s+(?:ip|technology|materials))\b/i;
const RE_CONFIDENTIALITY = /\b(?:confidential(?:ity)?|nda|non[-\s]?disclosure)\b/i;
const RE_RETURN_DESTROY = /\b(?:return\s+or\s+destroy|return\s+and\s+destroy|destruction\s+of\s+(?:materials|information)|return\s+of\s+(?:materials|information)|destroy\s+all\s+copies)\b/i;
const RE_INDEMNIFICATION = /\bindemnif(?:y|ication|ies|ied)\b/i;
const RE_LIABILITY_CAP = /\b(?:limitation\s+of\s+liability|liability\s+cap|cap\s+on\s+liability|aggregate\s+liability)\b/i;
const RE_COMPENSATION =
  /\b(?:fee|fees|compensation|payment|invoice|invoicing|retainer|monthly\s+rate|hourly\s+rate)\b/i;
const RE_INVOICE_APPROVAL =
  /\b(?:invoice\s+approval|approved\s+invoice|payment\s+approval|invoice\s+(?:cycle|terms|process)|net\s+\d+|days?\s+from\s+invoice)\b/i;
const RE_AUTHORITY_TO_BIND =
  /\b(?:authoriz(?:e|ed)\s+to\s+bind|authority\s+to\s+(?:bind|execute)|duly\s+authoriz(?:e|ed)|signed\s+on\s+behalf\s+of)\b/i;
const RE_CONTRIBUTOR_ASSIGNMENT =
  /\b(?:contributor\s+(?:assignment|agreement)|cla\b|contributor\s+ip\s+packet|individual\s+(?:contributor|developer)\s+assignment)\b/i;
/**
 * Matches "ratify prior work", "ratify of prior work", "ratify all prior work",
 * "ratification of prior contributions", "confirms prior assignment", etc. Allows up to
 * a short connector ("all", "the", "of any") between the verb and the noun.
 */
const RE_RATIFICATION_PRIOR_WORK =
  /\bratif(?:y|ication|ies|ied)\b[\s\S]{0,40}\bprior\s+(?:work|contributions?|assignment|deliverables?)\b/i;
const RE_RELATED_ENTITIES =
  /\b(?:affiliate|parent\s+company|subsidiary|related\s+entity|same\s+individual\s+signs?\s+for)\b/i;

function asExcerpt(text: string, re: RegExp, span = 140): string | undefined {
  const m = text.match(re);
  if (!m || m.index == null) return undefined;
  const start = Math.max(0, m.index - Math.floor(span / 2));
  const end = Math.min(text.length, m.index + m[0].length + Math.floor(span / 2));
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function detectIpChainOfTitle(text: string): StrategicPostureFinding | null {
  if (!RE_IP_OWNERSHIP.test(text)) return null;
  if (RE_FURTHER_ASSURANCES.test(text)) return null;
  return {
    category: "IP chain-of-title",
    severity: "medium",
    observation:
      "The document assigns IP ownership but does not include a further-assurances clause for downstream filings or recordings.",
    why_it_matters:
      "Acquirer or investor diligence often expects a brief further-assurances commitment so post-closing patent, copyright, or domain transfers can be executed without re-negotiating.",
    suggested_update:
      "Each party agrees to execute such further documents and take such further actions as may reasonably be necessary to give full effect to the assignments and other rights granted in this agreement, including filings, recordings, and registrations.",
    evidence_excerpt: asExcerpt(text, RE_IP_OWNERSHIP),
  };
}

function detectBackgroundTechCarveout(text: string): StrategicPostureFinding | null {
  if (!RE_IP_OWNERSHIP.test(text)) return null;
  if (RE_BACKGROUND_TECH.test(text)) return null;
  return {
    category: "Background technology carveout",
    severity: "medium",
    observation:
      "Work-made-for-hire / assignment language is present, but there is no explicit carveout for pre-existing background technology or materials.",
    why_it_matters:
      "Without a background-technology carveout, contributor-owned tools, snippets, or libraries reused on the project can be inadvertently swept into the assignment, complicating future licensing or open-sourcing.",
    suggested_update:
      "Notwithstanding the assignment above, each party retains all right, title, and interest in its background technology and pre-existing materials, and grants the other party a non-exclusive, royalty-free license to use such background materials solely as embedded in the deliverables.",
    evidence_excerpt: asExcerpt(text, RE_IP_OWNERSHIP),
  };
}

function detectConfidentialityReturnDestroy(text: string): StrategicPostureFinding | null {
  if (!RE_CONFIDENTIALITY.test(text)) return null;
  if (RE_RETURN_DESTROY.test(text)) return null;
  return {
    category: "Confidentiality return / destruction mechanics",
    severity: "low",
    observation:
      "Confidentiality language is present but no return-or-destruction mechanic is described for end-of-engagement.",
    why_it_matters:
      "Diligence reviewers commonly look for an explicit return-or-destroy step so disclosed materials are not retained indefinitely after the engagement ends.",
    suggested_update:
      "Upon termination of this agreement or earlier written request, the receiving party will promptly return or destroy all confidential materials in its possession, and confirm in writing that it has done so, except as required for archival or compliance purposes.",
    evidence_excerpt: asExcerpt(text, RE_CONFIDENTIALITY),
  };
}

function detectCompensationGovernance(text: string): StrategicPostureFinding | null {
  if (!RE_COMPENSATION.test(text)) return null;
  if (RE_INVOICE_APPROVAL.test(text)) return null;
  return {
    category: "Compensation governance",
    severity: "low",
    observation:
      "Compensation is referenced but the document does not describe an invoice cadence or payment-approval process.",
    why_it_matters:
      "Operational separateness and audit-readiness improve when the agreement names a clear invoicing cycle and an approver — this also reduces ambiguity if related entities share signatories.",
    suggested_update:
      "Invoices will be submitted monthly within five (5) business days after month-end and will be approved by an authorized representative of the paying party. Approved invoices will be paid net thirty (30) days from approval.",
    evidence_excerpt: asExcerpt(text, RE_COMPENSATION),
  };
}

/**
 * Heuristic gate: the indemnity / liability detector only fires when the document
 * otherwise reads like a contract — i.e., it has IP, confidentiality, compensation,
 * scope, or governing-law signals. This prevents flagging stray non-contract text
 * (e.g. casual notes) where indemnity language would be irrelevant.
 */
const RE_CONTRACT_MARKERS =
  /\b(?:scope|deliverables?|services?\s+agreement|term\s+of\s+\d|effective\s+date|governing\s+law|signed\s+on\s+behalf\s+of)\b/i;

function detectIndemnityLiability(text: string): StrategicPostureFinding | null {
  const looksLikeContract =
    RE_IP_OWNERSHIP.test(text) ||
    RE_CONFIDENTIALITY.test(text) ||
    RE_COMPENSATION.test(text) ||
    RE_CONTRACT_MARKERS.test(text);
  if (!looksLikeContract) return null;
  if (RE_INDEMNIFICATION.test(text) || RE_LIABILITY_CAP.test(text)) return null;
  return {
    category: "Indemnification & liability structure",
    severity: "medium",
    observation:
      "No indemnification or limitation-of-liability framework is described.",
    why_it_matters:
      "Even at the early stage, a calm allocation of risk (mutual indemnity for IP infringement claims, a reasonable liability cap) reduces back-and-forth during later diligence and limits surprise exposure.",
    suggested_update:
      "Each party will indemnify the other for third-party claims arising from its own negligent acts or breach of this agreement. Except for breaches of confidentiality or indemnification obligations, neither party's aggregate liability under this agreement will exceed the fees paid or payable in the prior twelve (12) months.",
  };
}

function detectAuthorityToBind(text: string): StrategicPostureFinding | null {
  if (RE_AUTHORITY_TO_BIND.test(text)) return null;
  if (!RE_RELATED_ENTITIES.test(text)) return null;
  return {
    category: "Authority to bind",
    severity: "low",
    observation:
      "Affiliated or related entities are referenced, but the document does not include an explicit authority-to-bind representation for each signatory.",
    why_it_matters:
      "When the same individual signs across related entities, an explicit authority-to-bind line plus separate books, invoices, and approvals helps preserve operational separateness without requiring restructuring.",
    suggested_update:
      "Each signatory represents that he or she is duly authorized to execute this agreement on behalf of the entity for which he or she signs, and that such entity maintains its own books, records, and approvals separate from any affiliated entity.",
    evidence_excerpt: asExcerpt(text, RE_RELATED_ENTITIES),
  };
}

function detectContributorAssignment(text: string): StrategicPostureFinding | null {
  if (!RE_IP_OWNERSHIP.test(text)) return null;
  if (RE_CONTRIBUTOR_ASSIGNMENT.test(text)) return null;
  return {
    category: "Contributor assignment packet",
    severity: "medium",
    observation:
      "IP assignment is committed at the entity level but the document does not reference an individual-contributor assignment packet.",
    why_it_matters:
      "Investor and acquirer diligence routinely asks for contributor-level assignments (employees, contractors, advisors) so the chain-of-title is provable end-to-end, not only at the entity layer.",
    suggested_update:
      "Each party will use commercially reasonable efforts to obtain and maintain individual contributor IP assignments and confidentiality undertakings from its employees, contractors, and other contributors whose work materially contributed to the deliverables.",
  };
}

function detectRatificationOfPriorWork(text: string): StrategicPostureFinding | null {
  if (!/\b(?:platform|prior\s+work|previously\s+developed|existing\s+codebase|project\s+\w+)\b/i.test(text)) {
    return null;
  }
  if (RE_RATIFICATION_PRIOR_WORK.test(text)) return null;
  return {
    category: "Ratification of prior work",
    severity: "medium",
    observation:
      "The document references an existing platform or prior work but does not ratify or confirm the assignment of that earlier work.",
    why_it_matters:
      "Diligence reviewers often expect a short ratification line so the agreement covers both go-forward and historic contributions to the same product or platform.",
    suggested_update:
      "The parties confirm and ratify that all prior work, contributions, and deliverables provided by either party in connection with the subject platform or project are subject to the assignment and confidentiality terms of this agreement as if performed hereunder.",
  };
}

const DETECTORS: Array<(text: string) => StrategicPostureFinding | null> = [
  detectIpChainOfTitle,
  detectBackgroundTechCarveout,
  detectConfidentialityReturnDestroy,
  detectCompensationGovernance,
  detectIndemnityLiability,
  detectAuthorityToBind,
  detectContributorAssignment,
  detectRatificationOfPriorWork,
];

function suggestMissingCompanionDocuments(text: string): string[] {
  const out: string[] = [];
  if (RE_IP_OWNERSHIP.test(text) && !RE_CONTRIBUTOR_ASSIGNMENT.test(text)) {
    out.push("Contributor IP Assignment Packet (employee + contractor)");
  }
  if (
    /\b(?:platform|prior\s+work|previously\s+developed|existing\s+codebase)\b/i.test(text) &&
    !RE_RATIFICATION_PRIOR_WORK.test(text)
  ) {
    out.push("Board / Member Resolution ratifying prior contributions");
  }
  if (RE_RELATED_ENTITIES.test(text)) {
    out.push("Intercompany services memo (separateness of books, invoices, and approvals)");
  }
  return out;
}

/**
 * Compose detectors over plain document text and produce a {@link StrategicPostureReview}.
 *
 * Always fail-soft: any non-string / empty input yields a review with no findings, which
 * the optional panel renders as nothing. Callers are not required to use this helper —
 * they may construct a {@link StrategicPostureReview} from any source they choose.
 */
export function buildStrategicPostureReviewFromText(
  text: string | null | undefined,
): StrategicPostureReview {
  const t = (text || "").toString();
  if (!t.trim()) return { fail_soft: true };
  const findings: StrategicPostureFinding[] = [];
  for (const d of DETECTORS) {
    try {
      const f = d(t);
      if (f) findings.push(f);
    } catch {
      // Detectors are written to never throw; this guard exists purely for fail-soft safety.
    }
  }
  const missing = suggestMissingCompanionDocuments(t);
  const out: StrategicPostureReview = {};
  if (findings.length) out.findings = findings;
  if (missing.length) out.missing_companion_documents = missing;
  if (findings.length || missing.length) {
    out.summary =
      "Operator-style notes attached to your existing review — areas an investor or acquirer would typically want tightened before deeper diligence.";
  }
  return out;
}
