/**
 * Professional Pro intake: explicit multi-clause requests must appear substantively in accepted corpus.
 */

import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

export const PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN = 2400;

export type ProfessionalProClauseId =
  | "confidentiality"
  | "intellectual_property"
  | "limitation_of_liability"
  | "termination"
  | "governing_law"
  | "notices"
  | "electronic_signatures"
  | "corpus_length";

export type ProfessionalProClauseCoverageAssessment = {
  applies: boolean;
  ok: boolean;
  docLen: number;
  missingClauses: ProfessionalProClauseId[];
  requestedClauses: ProfessionalProClauseId[];
};

/** True when intake explicitly asks for multiple professional operative clauses (Red Mesa class). */
export function intakeRequestsProfessionalProClauseCoverage(intake: string | null | undefined): boolean {
  const low = String(intake ?? "").toLowerCase();
  if (!low.trim()) return false;
  let hits = 0;
  if (/\bconfidential/i.test(low)) hits++;
  if (/\bintellectual\s+property\b|\b(?:\bib\b|ip\s+assignment)\b/i.test(low)) hits++;
  if (/\blimitation\s+of\s+liability\b|\bliability\s+cap\b/i.test(low)) hits++;
  if (/\bterminat/i.test(low)) hits++;
  if (/\bgoverning\s+law\b|\b(?:delaware|texas|new\s+york)\b/i.test(low)) hits++;
  if (/\bnotice/i.test(low)) hits++;
  if (/\bsignature\s+block|\belectronic\s+sign/i.test(low)) hits++;
  return hits >= 4;
}

function requestedClausesFromIntake(intake: string): ProfessionalProClauseId[] {
  const low = intake.toLowerCase();
  const out: ProfessionalProClauseId[] = [];
  if (/\bconfidential/i.test(low)) out.push("confidentiality");
  if (/\bintellectual\s+property\b|\b(?:\bib\b|ip\s+assignment)\b/i.test(low)) out.push("intellectual_property");
  if (/\blimitation\s+of\s+liability\b|\bliability\s+cap\b/i.test(low)) out.push("limitation_of_liability");
  if (/\bterminat/i.test(low)) out.push("termination");
  if (/\bgoverning\s+law\b|\b(?:delaware|texas|new\s+york)\b/i.test(low)) out.push("governing_law");
  if (/\bnotice/i.test(low)) out.push("notices");
  if (/\bsignature\s+block|\belectronic\s+sign|\bcounterparts?\b/i.test(low)) out.push("electronic_signatures");
  return out;
}

function bodyHasClause(bodyLow: string, clause: ProfessionalProClauseId): boolean {
  switch (clause) {
    case "confidentiality":
      return /\bconfidential(?:ity)?\b|non-?disclosure|trade\s+secret|proprietary/i.test(bodyLow);
    case "intellectual_property":
      return /\bintellectual\s+property\b|\bip\s+(?:ownership|license|assignment|rights?)\b|\blicense\s+scope\b|\bwork\s+product\b|\b(?:assign(?:s|ment)?|ownership)\b.*\b(?:deliverable|work|product|content|materials|platform)/i.test(
        bodyLow,
      );
    case "limitation_of_liability":
      return /\blimitation\s+of\s+liability\b|\bliability\s+cap\b|\b(?:cap(?:ped)?|exclude(?:s|d)?)\s+.*\b(?:consequential|indirect|special)\b/i.test(
        bodyLow,
      );
    case "termination":
      return /\bterminat(?:ion|e|able)\b|\bfor\s+cause\b|\bfor\s+convenience\b/i.test(bodyLow);
    case "governing_law":
      return /\bgoverning\s+law\b|\bgoverned\s+by\b|\blaws\s+of\b/i.test(bodyLow);
    case "notices":
      return /\bnotices?\b|\bnotice\s+address/i.test(bodyLow);
    case "electronic_signatures":
      return /\belectronic\s+sign|\be-?sign\b|\bcounterparts?\b|\bin\s+witness\s+whereof\b/i.test(bodyLow);
    default:
      return false;
  }
}

export function assessProfessionalProClauseCoverage(args: {
  text: string;
  intake: string | null | undefined;
}): ProfessionalProClauseCoverageAssessment {
  const intake = String(args.intake ?? "").trim();
  const text = (args.text || "").trim();
  const docLen = text.length;
  if (!intakeRequestsProfessionalProClauseCoverage(intake)) {
    return { applies: false, ok: true, docLen, missingClauses: [], requestedClauses: [] };
  }
  const requested = requestedClausesFromIntake(intake);
  const bodyLow = text.toLowerCase();
  const missingClauses = requested.filter((c) => !bodyHasClause(bodyLow, c));
  const lenOk = docLen >= PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN;
  const missingForReport = [...missingClauses];
  if (missingClauses.length === 0 && !lenOk) {
    missingForReport.push("corpus_length" as ProfessionalProClauseId);
  }
  const ok = missingClauses.length === 0 && lenOk;
  return { applies: true, ok, docLen, missingClauses: missingForReport, requestedClauses: requested };
}

export function shouldRejectThinProfessionalProCorpus(
  assessment: ProfessionalProClauseCoverageAssessment,
): boolean {
  if (!assessment.applies || assessment.ok) return false;
  return (
    assessment.docLen < PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN ||
    assessment.missingClauses.includes("corpus_length")
  );
}

export function logProfessionalProClauseCoverageDecision(payload: {
  accepted: boolean;
  docLen: number;
  missingClauses: string[];
  source?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[professional-pro-clause-coverage]", payload);
}

/** Resolve legal entities from between-clause only — never authorized-signer bullets. */
export function resolveIntakeBetweenClauseLegalEntities(intake: string | null | undefined): string[] {
  return extractBetweenPartyNameList(String(intake ?? ""))
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => isAuthoritativeLegalEntityName(n));
}

export function partyNamesMatchIntakeBetweenClause(
  partyName: string,
  intake: string | null | undefined,
): boolean {
  const entities = resolveIntakeBetweenClauseLegalEntities(intake);
  return entities.some((e) => partyLegalNamesMatch(e, partyName));
}
