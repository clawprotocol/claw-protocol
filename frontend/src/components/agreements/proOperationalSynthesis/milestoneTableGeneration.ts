/**
 * Synthesize implementation milestone table shells when intake mentions milestones/payments.
 */

import { intakeSpecifiesSimpleFixedFee } from "../canonicalPartyIdentityResolver";
import { definedShortNameFromLegalEntity } from "../paidProAgreementPolish";
import type { PartyResponsibilityProfile } from "./types";

const MILESTONE_INTAKE_RE =
  /\b(?:milestones?|phase\s+\d|deliverables?|acceptance|payment\s+upon|installment|implementation\s+schedule)\b/i;

const EXISTING_TABLE_RE = /\|\s*milestone\s*\|/i;
const EXISTING_SECTION_RE = /\bIMPLEMENTATION\s+MILESTONES\b/i;

function intakeHasMilestones(intake: string, paymentTerms: string): boolean {
  if (intakeSpecifiesSimpleFixedFee(intake, paymentTerms)) return false;
  return MILESTONE_INTAKE_RE.test(intake) || MILESTONE_INTAKE_RE.test(paymentTerms);
}

function defaultRows(parties: readonly PartyResponsibilityProfile[]): string[] {
  const lead = parties[0]?.shortName ?? "Lead Party";
  const impl = parties[1]?.shortName ?? "Counterparty";
  return [
    `| Milestone | Owner | Target | Acceptance Criteria | Dependencies |`,
    `| --- | --- | --- | --- | --- |`,
    `| Kickoff & environment readiness | ${lead} | TBD | Environments provisioned; access granted | Contract Effective Date |`,
    `| Core integration / build | ${impl} | TBD | APIs integrated per agreed scope | Kickoff complete |`,
    `| User acceptance testing | Parties | TBD | UAT sign-off by designated contacts | Core build complete |`,
    `| Production launch | ${lead} | TBD | Go-live approval; rollback plan documented | UAT sign-off |`,
    `| Final payment (if applicable) | Parties | TBD | Invoice per Payment section | Launch acceptance |`,
  ];
}

/**
 * Insert milestone table section when missing and intake signals milestones.
 */
export function applyMilestoneTableGeneration(
  text: string,
  intakeRaw: string,
  paymentTerms: string,
  responsibilities: readonly PartyResponsibilityProfile[],
): { text: string; inserted: boolean } {
  if (!intakeHasMilestones(intakeRaw, paymentTerms)) {
    return { text, inserted: false };
  }
  if (EXISTING_TABLE_RE.test(text) || EXISTING_SECTION_RE.test(text)) {
    return { text, inserted: false };
  }

  const block = [
    "",
    "IMPLEMENTATION MILESTONES",
    "",
    "The following schedule is a draft implementation framework. Dates and amounts are placeholders for party confirmation.",
    "",
    ...defaultRows(responsibilities),
    "",
    "Acceptance: Each milestone is deemed accepted when the designated party representative confirms completion in writing (email sufficient unless Notices requires otherwise).",
    "",
  ].join("\n");

  const sigIdx = text.search(/\b(?:IN WITNESS WHEREOF|SIGNATURES?)\b/i);
  if (sigIdx >= 0) {
    return {
      text: `${text.slice(0, sigIdx).trimEnd()}\n\n${block}\n\n${text.slice(sigIdx)}`,
      inserted: true,
    };
  }
  return { text: `${text.trimEnd()}\n\n${block}`, inserted: true };
}

/** Enrich draft party roles from responsibility profiles (pre-API). */
export function mergePartyRolesFromResponsibilities(
  parties: { name: string; role: string }[],
  profiles: readonly PartyResponsibilityProfile[],
): { name: string; role: string }[] {
  if (!parties.length || !profiles.length) return parties;
  const byNorm = new Map(profiles.map((p) => [p.party.toLowerCase(), p.inferredRole]));
  return parties.map((p) => {
    const role = byNorm.get((p.name || "").toLowerCase());
    if (role && (!p.role || p.role === "party")) {
      return { ...p, role };
    }
    const short = definedShortNameFromLegalEntity(p.name);
    const byShort = profiles.find((pr) => pr.shortName === short);
    if (byShort && (!p.role || p.role === "party")) {
      return { ...p, role: byShort.inferredRole };
    }
    return p;
  });
}
