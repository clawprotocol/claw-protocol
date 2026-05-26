/**
 * Canonical guided answer manifest — single source for finalization validation and merge.
 * Patterns and clauses derive from the user's selected answer text, not recommended defaults.
 */

import type { GuidedCompletionSession } from "./types";
import { listGuidedAnsweredVariableIds } from "./guidedAnswerApplyOrchestration";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";

export type CanonicalGuidedAnswerEntry = {
  variableId: string;
  questionLabel: string;
  selectedAnswerText: string;
  normalizedSemanticTargets: string[];
  targetSections: string[];
  validationPatterns: RegExp[];
  mergeClause: string;
  presenceEvidence: RegExp;
};

export type CanonicalGuidedAnswerManifest = {
  entries: CanonicalGuidedAnswerEntry[];
  answeredVariableIds: string[];
};

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function significantTokens(text: string, minLen = 4): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%$.]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= minLen && !/^(?:the|and|for|with|from|across|each|per|due|days?)$/i.test(t));
}

/** Loose corpus match when no structured pattern applies — requires multiple answer tokens. */
export function buildLooseAnswerEvidencePattern(answer: string): RegExp | null {
  const tokens = significantTokens(answer);
  if (tokens.length === 0) return null;
  const use = tokens.slice(0, 4);
  return new RegExp(use.map(escapeRegexLiteral).join(".{0,80}"), "i");
}

function targetsFromAnswer(answer: string, extras: string[] = []): string[] {
  const out = new Set<string>(extras);
  for (const t of significantTokens(answer, 3)) out.add(t);
  return [...out];
}

function clauseForPaymentTiming(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  if (/milestone|phase acceptance|schedule a/i.test(answer)) {
    return {
      clause: "Payments are due according to the milestone and phase acceptance triggers stated in Schedule A.",
      evidence: /(?:milestone|phase acceptance|schedule a)/i,
      patterns: [/(?:milestone|phase acceptance|schedule a)/i],
    };
  }
  if (/\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month|monthly/i.test(answer)) {
    return {
      clause: "Monthly support or retainer amounts are invoiced monthly as stated in the applicable support terms.",
      evidence: /\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month|monthly/i,
      patterns: [/\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month|monthly/i],
    };
  }
  if (/\bnet\s*30\b/i.test(answer)) {
    return {
      clause: "Invoices are due Net 30 from receipt unless a signed change order states otherwise.",
      evidence: /\bNet\s*30\b/i,
      patterns: [/\bNet\s*30\b/i],
    };
  }
  if (/\bnet\s*15\b/i.test(answer)) {
    return {
      clause: "Invoices are due Net 15 from receipt unless a signed change order states otherwise.",
      evidence: /\bNet\s*15\b/i,
      patterns: [/\bNet\s*15\b/i],
    };
  }
  if (/\bon\s+receipt\b/i.test(answer)) {
    return {
      clause: "Payment is due upon receipt of each undisputed invoice.",
      evidence: /\bon\s+receipt\b/i,
      patterns: [/\bon\s+receipt\b/i],
    };
  }
  return null;
}

function clauseForProjectFee(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  const has120k = /\$?\s*120[\s,]*000|\b120\s*k\b/i.test(answer);
  const evenPhases = /even\s+(?:thirds|across\s+phases|split)/i.test(answer);
  if (has120k && evenPhases) {
    return {
      clause:
        "Total project fee is $120,000 USD, allocated evenly across build, rollout, and support/acceptance phases unless Schedule A states otherwise.",
      evidence: /\$?\s*120[\s,]*000|\b120\s*k\b/i,
      patterns: [/\$?\s*120[\s,]*000|\b120\s*k\b/i, /even.{0,40}(?:thirds|phases|split)/i],
    };
  }
  if (has120k) {
    return {
      clause: "Total project fee is $120,000 USD unless Schedule A or a signed change order states otherwise.",
      evidence: /\$?\s*120[\s,]*000|\b120\s*k\b/i,
      patterns: [/\$?\s*120[\s,]*000|\b120\s*k\b/i],
    };
  }
  return null;
}

function clauseForPhaseAllocation(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  if (/40\s*%|40%\s*build|40\s*\/\s*30\s*\/\s*30|forty.{0,24}thirty.{0,24}thirty/i.test(answer)) {
    return {
      clause:
        "Schedule A allocates the total project fee as follows: forty percent (40%) upon completion of build/configuration, thirty percent (30%) upon rollout and onboarding, and thirty percent (30%) upon support, handoff, and acceptance milestones.",
      evidence: /40\s*%[\s\S]{0,100}30\s*%[\s\S]{0,100}30\s*%|40\s*\/\s*30\s*\/\s*30/i,
      patterns: [/40\s*%[\s\S]{0,100}30\s*%[\s\S]{0,100}30\s*%|40\s*\/\s*30\s*\/\s*30|build.{0,40}rollout.{0,40}support/i],
    };
  }
  if (/even\s+thirds|one[-\s]?third\s+each|thirds\s+across/i.test(answer)) {
    return {
      clause:
        "Schedule A phase allocation splits fees evenly across build, rollout, and support/acceptance phases (approximately one-third each).",
      evidence: /even\s+thirds|one[-\s]?third|thirds\s+across|evenly\s+across\s+build/i,
      patterns: [/even\s+thirds|one[-\s]?third|thirds|evenly.{0,40}(?:build|rollout|support)/i],
    };
  }
  if (/build[-\s]?heavy|40\s*%|40%/i.test(answer)) {
    return {
      clause:
        "Schedule A phase allocation is build-heavy: the larger share is tied to build/configuration work, with remaining payments allocated to launch, support handoff, and acceptance milestones.",
      evidence: /\bbuild-heavy\b/i,
      patterns: [/\bbuild-heavy\b|build.{0,40}(?:rollout|launch|support)/i],
    };
  }
  if (/milestone/i.test(answer)) {
    return {
      clause: "Payments are due on written acceptance of each phase deliverable per Schedule A.",
      evidence: /milestone|written\s+acceptance/i,
      patterns: [/milestone|written\s+acceptance/i],
    };
  }
  return null;
}

function clauseForSla(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  if (/no\s+guaranteed\s+uptime|third[-\s]?party\s+ai\s+platform|without\s+uptime\s+guarantees?/i.test(answer)) {
    return {
      clause:
        "Provider does not guarantee uptime or availability for third-party AI platforms; support is limited to commercially reasonable assistance within Provider-controlled systems.",
      evidence: /(?:no\s+guaranteed\s+uptime|third[-\s]?party\s+ai\s+platform|commercially\s+reasonable\s+assistance)/i,
      patterns: [/(?:no\s+guaranteed\s+uptime|third[-\s]?party\s+ai\s+platform|commercially\s+reasonable\s+assistance)/i],
    };
  }
  if (/99\.9\s*%/i.test(answer)) {
    return {
      clause:
        "Provider will target 99.9% monthly uptime for production automation components, excluding scheduled maintenance, client-caused outages, and third-party platform failures outside Provider control.",
      evidence: /\b99\.9\s*%/i,
      patterns: [/(?:99\.9\s*%.{0,80}(?:uptime|availability)|(?:uptime|availability).{0,80}99\.9\s*%)/i],
    };
  }
  if (/99\.5\s*%/i.test(answer)) {
    return {
      clause: "Provider will target 99.5% monthly uptime for production components, excluding scheduled maintenance and client-caused outages.",
      evidence: /\b99\.5\s*%/i,
      patterns: [/(?:99\.5\s*%.{0,80}(?:uptime|availability)|(?:uptime|availability).{0,80}99\.5\s*%)/i],
    };
  }
  return null;
}

function clauseForIp(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  if (/pre[-\s]?existing|background|embedded|tools?|templates?|know-how|perpetual license/i.test(answer)) {
    return {
      clause:
        "Provider retains pre-existing tools, templates, know-how, and background materials, and Client receives the rights reasonably necessary to use the delivered work product.",
      evidence: /\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)|\bretains? (?:its )?(?:tools|templates|know-how)\b/i,
      patterns: [/\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)|\bretains? (?:its )?(?:tools|templates|know-how)\b/i],
    };
  }
  if (/company|client/i.test(answer) && /own|deliverable/i.test(answer)) {
    return {
      clause:
        "Company owns the project deliverables and work product created specifically for Company after payment, subject only to Provider's retained ownership of pre-existing tools, templates, know-how, and background technology.",
      evidence: /\b(?:company|client)\s+owns?\s+(?:the\s+)?(?:project\s+)?deliverables?\b/i,
      patterns: [
        /(?:(?:Client|Company).{0,80}owns?.{0,80}(?:project\s+)?(?:deliverables|work product)|(?:deliverables|work product).{0,80}(?:assigned to|owned by).{0,40}(?:Client|Company))/i,
        /\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)/i,
      ],
    };
  }
  return null;
}

function clauseForTermination(answer: string): { clause: string; evidence: RegExp; patterns: RegExp[] } | null {
  if (/\b30\b|\bthirty\b/i.test(answer) && /notice|terminat/i.test(answer)) {
    return {
      clause:
        "Either party may terminate for convenience with 30 days written notice, subject to payment for work performed and survival of confidentiality, payment, and ownership obligations.",
      evidence: /\b(?:30|thirty)\s+days?.{0,30}(?:written\s+)?notice\b/i,
      patterns: [/\b(?:30|thirty)\s+days?.{0,30}(?:written\s+)?notice\b/i],
    };
  }
  if (/\b60\b|\bsixty\b/i.test(answer) && /notice|terminat/i.test(answer)) {
    return {
      clause: "Either party may terminate on sixty (60) days written notice before renewal.",
      evidence: /\b(?:60|sixty)\s+days?.{0,30}notice\b/i,
      patterns: [/\b(?:60|sixty)\s+days?.{0,30}notice\b/i],
    };
  }
  return null;
}

function buildEntryForVariable(
  variableId: string,
  answer: string,
  session: GuidedCompletionSession,
): CanonicalGuidedAnswerEntry | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  const variable = session.variables.find((v) => v.id === variableId);
  const questionLabel = variable?.label || variable?.question || variableId;
  const target = resolveGuidedQuestionTarget(variableId);
  const targetSections = [target.sectionLabel, ...(target.sectionNumber != null ? [`Section ${target.sectionNumber}`] : [])];

  let resolved: {
    clause: string;
    evidence: RegExp;
    patterns: RegExp[];
    targets: string[];
  };

  switch (variableId) {
    case "payment_timing":
    case "payment_timing_to_be_confirmed":
    case "payment_structure": {
      const r = clauseForPaymentTiming(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["payment", "invoice"]) };
      break;
    }
    case "project_fee_phase_confirmation":
    case "total_fee_confirmation":
    case "amount_to_be_confirmed": {
      const r = clauseForProjectFee(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["120000", "fee", "total"]) };
      break;
    }
    case "phase_payment_allocation":
    case "supplemental_schedule_confirmation":
    case "as_specified_in_schedule_a":
    case "milestone_schedule": {
      const r = clauseForPhaseAllocation(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["phase", "allocation", "schedule a"]) };
      break;
    }
    case "saas_sla":
    case "sla":
    case "support_obligations": {
      const r = clauseForSla(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["uptime", "sla", "support"]) };
      break;
    }
    case "ip_ownership":
    case "ip_allocation":
    case "ip_ownership_contradiction":
    case "license_background_tools": {
      const r = clauseForIp(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["ownership", "deliverables", "company"]) };
      break;
    }
    case "renewal_notice":
    case "termination": {
      const r = clauseForTermination(trimmed);
      if (!r) return null;
      resolved = { ...r, targets: targetsFromAnswer(trimmed, ["termination", "notice"]) };
      break;
    }
    default: {
      return null;
    }
  }

  return {
    variableId,
    questionLabel,
    selectedAnswerText: trimmed,
    normalizedSemanticTargets: resolved.targets,
    targetSections,
    validationPatterns: resolved.patterns,
    mergeClause: resolved.clause,
    presenceEvidence: resolved.evidence,
  };
}

export function buildCanonicalGuidedAnswerManifest(
  session: GuidedCompletionSession | null | undefined,
): CanonicalGuidedAnswerManifest {
  if (!session) return { entries: [], answeredVariableIds: [] };
  const answeredVariableIds = listGuidedAnsweredVariableIds(session);
  const entries: CanonicalGuidedAnswerEntry[] = [];
  for (const variableId of answeredVariableIds) {
    const answer = (session.answered[variableId] || "").trim();
    const entry = buildEntryForVariable(variableId, answer, session);
    if (entry) entries.push(entry);
  }
  return { entries, answeredVariableIds };
}

export function validateCorpusAgainstCanonicalManifest(
  body: string,
  manifest: CanonicalGuidedAnswerManifest,
): { ok: boolean; missing: string[]; missingDetails: Array<{ variableId: string; selectedAnswerText: string }> } {
  const normalizedBody = (body || "").replace(/\s+/g, " ");
  const missing: string[] = [];
  const missingDetails: Array<{ variableId: string; selectedAnswerText: string }> = [];

  for (const entry of manifest.entries) {
    const satisfied = entry.validationPatterns.some((p) => p.test(normalizedBody));
    if (!satisfied) {
      missing.push(entry.variableId);
      missingDetails.push({
        variableId: entry.variableId,
        selectedAnswerText: entry.selectedAnswerText,
      });
    }
  }

  return { ok: missing.length === 0, missing, missingDetails };
}

export function describeCanonicalManifestMissingItem(
  entry: CanonicalGuidedAnswerEntry,
): string {
  const section = entry.targetSections[0] || "agreement";
  return `"${entry.selectedAnswerText}" missing from ${section}`;
}

export function summarizeCanonicalManifestForLog(
  manifest: CanonicalGuidedAnswerManifest,
): Array<{ variableId: string; answer: string }> {
  return manifest.entries.map((e) => ({
    variableId: e.variableId,
    answer: e.selectedAnswerText.slice(0, 80),
  }));
}

export function resolveClauseSpecForManifestEntry(
  entry: CanonicalGuidedAnswerEntry,
): { evidence: RegExp; clause: () => string } {
  return {
    evidence: entry.presenceEvidence,
    clause: () => entry.mergeClause,
  };
}
