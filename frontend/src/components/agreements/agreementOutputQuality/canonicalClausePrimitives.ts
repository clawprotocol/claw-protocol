/**
 * Reusable clause primitives — stable enterprise/service/SaaS blocks the model customizes, not reinvents.
 */

export type ClausePrimitiveId =
  | "multi_party_purpose"
  | "milestone_payment"
  | "term_renewal_24m"
  | "governing_law_state"
  | "confidentiality_basic"
  | "data_security_basic"
  | "ip_deliverables"
  | "termination_convenience"
  | "electronic_signatures"
  | "non_circumvention_light";

export type ClausePrimitive = {
  id: ClausePrimitiveId;
  heading: string;
  template: string;
};

export const CLAUSE_PRIMITIVES: Record<ClausePrimitiveId, ClausePrimitive> = {
  multi_party_purpose: {
    id: "multi_party_purpose",
    heading: "Purpose and Scope",
    template:
      "The Parties engage in {{project_summary}}. Each Party shall perform its assigned responsibilities in a commercially reasonable manner consistent with this Agreement.",
  },
  milestone_payment: {
    id: "milestone_payment",
    heading: "Fees and Milestone Payments",
    template:
      "Total fees are {{total_fees}} paid in {{milestone_count}} milestone payments tied to deployment stages and launch targets. Invoices are due within thirty (30) days of receipt.",
  },
  term_renewal_24m: {
    id: "term_renewal_24m",
    heading: "Term and Renewal",
    template:
      "The initial term is {{term_months}} months, with automatic yearly renewal unless a Party provides {{notice_days}} days prior written notice of non-renewal.",
  },
  governing_law_state: {
    id: "governing_law_state",
    heading: "Governing Law",
    template:
      "This Agreement is governed by the laws of the State of {{state}}, without regard to conflict-of-law principles.",
  },
  confidentiality_basic: {
    id: "confidentiality_basic",
    heading: "Confidentiality",
    template:
      "Each Party shall protect the other Parties' Confidential Information using commercially reasonable measures and use it only for purposes of this Agreement.",
  },
  data_security_basic: {
    id: "data_security_basic",
    heading: "Data Protection and Security",
    template:
      "Each Party shall implement reasonable administrative, technical, and organizational safeguards for customer and operational data accessed under this Agreement.",
  },
  ip_deliverables: {
    id: "ip_deliverables",
    heading: "Intellectual Property",
    template:
      "Ownership of pre-existing materials remains with the owning Party. Deliverables created specifically for {{project_summary}} are allocated as set forth in the schedules or statements of work.",
  },
  termination_convenience: {
    id: "termination_convenience",
    heading: "Termination",
    template:
      "Either Party may terminate for material breach not cured within thirty (30) days after written notice, or for convenience on {{notice_days}} days prior written notice.",
  },
  electronic_signatures: {
    id: "electronic_signatures",
    heading: "Electronic Signatures",
    template:
      "This Agreement may be executed electronically via LawDog or comparable e-sign platforms, with the same effect as original signatures.",
  },
  non_circumvention_light: {
    id: "non_circumvention_light",
    heading: "Non-Circumvention",
    template:
      "During the term and for twelve (12) months thereafter, no Party shall knowingly circumvent the others to avoid payment of fees owed under this Agreement.",
  },
};

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return out.replace(/\{\{[^}]+\}\}/g, "the agreed terms");
}

export function renderClausePrimitive(id: ClausePrimitiveId, vars: Record<string, string>): string {
  const p = CLAUSE_PRIMITIVES[id];
  return fillTemplate(p.template, vars);
}

/** Select primitive ids for multi-party enterprise / AI implementation intakes. */
export function selectClausePrimitivesForIntake(intakeRaw: string, partyCount: number): ClausePrimitiveId[] {
  const low = (intakeRaw || "").toLowerCase();
  const enterprise =
    partyCount >= 4 ||
    /\b(?:llc|inc\.?|corporation|joint|rollout|infrastructure|saas|api|white[- ]?label)\b/i.test(low);
  if (!enterprise) {
    return ["multi_party_purpose", "governing_law_state", "termination_convenience", "electronic_signatures"];
  }
  const ids: ClausePrimitiveId[] = [
    "multi_party_purpose",
    "milestone_payment",
    "term_renewal_24m",
    "governing_law_state",
    "confidentiality_basic",
    "data_security_basic",
    "ip_deliverables",
    "termination_convenience",
    "electronic_signatures",
  ];
  if (/\b(?:non[- ]?circumvention|non[- ]?solicit)\b/i.test(low)) ids.push("non_circumvention_light");
  return ids;
}

export function buildClausePackSeedFromIntake(intakeRaw: string, partyCount: number): string {
  const low = intakeRaw.toLowerCase();
  const vars: Record<string, string> = {
    project_summary: "the joint project described in the intake",
    total_fees: /\$[\d,]+/.exec(intakeRaw)?.[0]?.replace("$", "") ? intakeRaw.match(/\$[\d,]+/)?.[0] ?? "$0" : "$0",
    milestone_count: /\b(\d+)\s+milestone/i.test(low) ? (low.match(/\b(\d+)\s+milestone/)?.[1] ?? "six") : "six",
    term_months: /\b24\s*month/i.test(low) ? "24" : "12",
    notice_days: /\b45\s*day/i.test(low) ? "45" : "30",
    state: /texas/i.test(low) ? "Texas" : "Delaware",
  };
  return selectClausePrimitivesForIntake(intakeRaw, partyCount)
    .map((id) => {
      const p = CLAUSE_PRIMITIVES[id];
      return `${p.heading}: ${fillTemplate(p.template, vars)}`;
    })
    .join("\n");
}
