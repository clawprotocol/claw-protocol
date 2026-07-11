/**
 * Professional Pro intake: explicit multi-clause requests must appear substantively in accepted corpus.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { assessRepeatedSupplementalProvisionsFiller } from "./paidProSupplementalProvisionsFillerGate";

export const PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN = 2400;

/** Sanity floor for concise professional agreements once material clause coverage is proven. */
export const PROFESSIONAL_CONCISE_COMPLETE_MIN_LEN = 1200;

export type ProfessionalProClauseId =
  | "confidentiality"
  | "intellectual_property"
  | "limitation_of_liability"
  | "termination"
  | "governing_law"
  | "notices"
  | "electronic_signatures"
  | "corpus_length";

export type ProfessionalProCoverageClassification =
  | "complete_full"
  | "complete_concise"
  | "incomplete_missing_material_terms"
  | "truncated"
  | "wrong_representation"
  | "unresolved_intake_authority";

export type ProfessionalProClauseCoverageAssessment = {
  applies: boolean;
  ok: boolean;
  docLen: number;
  missingClauses: ProfessionalProClauseId[];
  requestedClauses: ProfessionalProClauseId[];
  materialClausesMissing: ProfessionalProClauseId[];
  classification: ProfessionalProCoverageClassification;
  conciseComplete: boolean;
  corpusHash: string;
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

function preWitnessBodyLines(text: string): string[] {
  const operative = text.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? text;
  return operative.replace(/\r\n/g, "\n").split("\n");
}

function isExplicitClauseHeading(line: string): boolean {
  const afterNum = line.trim().replace(/^\d+\.\s+/, "");
  if (/^[A-Z][A-Z0-9\s,&/-]{6,}$/.test(afterNum)) return true;
  return (
    /\b(?:term\s+and\s+termination|limitation\s+of\s+liability|governing\s+law|intellectual\s+property)\b/i.test(
      afterNum,
    ) && /^[A-Z]/.test(afterNum)
  );
}

function isHeadingOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!/^\d+\.\s+/.test(t)) return false;
  if (isExplicitClauseHeading(t)) return false;
  const afterNum = t.replace(/^\d+\.\s+/, "");
  if (/^[A-Za-z][^.]{0,50}\.\s+\S/.test(afterNum)) return false;
  return true;
}

function buildClauseSearchText(text: string): string {
  const kept: string[] = [];
  for (const line of preWitnessBodyLines(text)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeadingOnlyLine(trimmed)) continue;
    kept.push(trimmed);
  }
  return kept.join("\n").toLowerCase();
}

function isNonSubstantiveClauseEvidenceLine(line: string): boolean {
  const low = line.toLowerCase();
  if (/\b(?:omitted|placeholder|required but omitted|only to reproduce)\b/i.test(low)) return true;
  if (/^\s*\d+\.\s+notices?\b/i.test(line) && /\bconfidential/i.test(low)) return true;
  if (/^\s*if to\b/i.test(line)) return true;
  if (/\bnotice\s+address/i.test(line) && !/\bconfidential(?:ity)?\s+(?:obligations|provisions|terms|period)\b/i.test(low)) {
    return true;
  }
  return false;
}

/** Stable material-evidence probe for accepted-corpus preservation proof. */
export function professionalClauseMaterialEvidencePresent(
  text: string,
  clause: ProfessionalProClauseId,
): boolean {
  const clauseSearchLow = buildClauseSearchText(text);
  return bodyHasClause(text, clause, clauseSearchLow);
}

function bodyHasClause(text: string, clause: ProfessionalProClauseId, clauseSearchLow: string): boolean {
  const bodyLow = text.toLowerCase();
  switch (clause) {
    case "confidentiality":
      return clauseSearchLow
        .split("\n")
        .some(
          (line) =>
            !isNonSubstantiveClauseEvidenceLine(line) &&
            /\bconfidential(?:ity)?\b|non-?disclosure|trade\s+secret|proprietary/i.test(line),
        );
    case "intellectual_property":
      return clauseSearchLow
        .split("\n")
        .some(
          (line) =>
            !isNonSubstantiveClauseEvidenceLine(line) &&
            /\bintellectual\s+property\b|\bip\s+(?:ownership|license|assignment|rights?)\b|\blicense\s+scope\b|\bwork\s+product\b|\b(?:assign(?:s|ment)?|ownership)\b.*\b(?:deliverable|work|product|content|materials|platform)/i.test(
              line,
            ),
        );
    case "limitation_of_liability":
      return (
        /\blimitation\s+of\s+liability\b|\bliability\s+(?:is\s+)?limited\b|\bliability\s+cap\b|\bdirect damages are limited\b|\blimited to amounts paid\b/i.test(
          clauseSearchLow,
        ) ||
        /\b(?:cap(?:ped)?|exclude(?:s|d)?)\s+.*\b(?:consequential|indirect|special)\b/i.test(clauseSearchLow)
      );
    case "termination":
      return /\bterminat(?:ion|e|able)\b|\bterm\s+and\s+termination\b|\bfor\s+cause\b|\bfor\s+convenience\b|\bwithout\s+cause\b/i.test(
        clauseSearchLow,
      );
    case "governing_law":
      return /\bgoverning\s+law\b|\bgoverned\s+by\b|\blaws\s+of\b/i.test(clauseSearchLow);
    case "notices":
      return (
        /\bnotices?\b|\bnotice\s+address/i.test(clauseSearchLow) ||
        preWitnessBodyLines(text).some((line) => /^\s*\d+\.\s+notices?\b/i.test(line.trim())) ||
        /\bif to\b/i.test(clauseSearchLow)
      );
    case "electronic_signatures":
      return (
        /\belectronic\s+sign|\be-?sign\b|\bcounterparts?\b/i.test(clauseSearchLow) ||
        /\bin\s+witness\s+whereof\b/i.test(bodyLow)
      );
    default:
      return false;
  }
}

function appearsThinProfessionalBoilerplate(text: string): boolean {
  const t = text.trim();
  if (t.length < 400) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 40) {
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const max = Math.max(...freq.values());
    if (max / words.length >= 0.72) return true;
  }
  return false;
}

function qualifiesConciseProfessionalIntakeCoverage(
  text: string,
  requestedClauseCount: number,
): boolean {
  const t = text.trim();
  if (t.length < PROFESSIONAL_CONCISE_COMPLETE_MIN_LEN) return false;
  if (!/\b(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.)\b/i.test(t)) return false;
  if (!/IN WITNESS WHEREOF|executed this Agreement/i.test(t)) return false;
  if (countPaidProExecutionBlocks(t) < 1) return false;
  const sectionCount = (t.match(/^\s*\d+\.\s+[A-Za-z]/gm) ?? []).length;
  if (sectionCount < Math.min(4, Math.max(requestedClauseCount, 4))) return false;
  if (/\b(?:starter preview|live preview|preview only|fallback preview|retry pro draft)\b/i.test(t)) {
    return false;
  }
  if (appearsThinProfessionalBoilerplate(t)) return false;
  if (!assessRepeatedSupplementalProvisionsFiller(t).ok) return false;
  if (/\bplaceholder\b.*\b(?:omitted|only to reproduce)\b/i.test(t)) return false;
  return true;
}

export function assessProfessionalProClauseCoverage(args: {
  text: string;
  intake: string | null | undefined;
}): ProfessionalProClauseCoverageAssessment {
  const intake = String(args.intake ?? "").trim();
  const text = (args.text || "").trim();
  const docLen = text.length;
  const corpusHash = docLen > 0 ? fingerprintAgreementBody(text) : "";
  if (!intake.trim()) {
    return {
      applies: false,
      ok: true,
      docLen,
      missingClauses: [],
      requestedClauses: [],
      materialClausesMissing: [],
      classification: "unresolved_intake_authority",
      conciseComplete: false,
      corpusHash,
    };
  }
  if (!intakeRequestsProfessionalProClauseCoverage(intake)) {
    return {
      applies: false,
      ok: true,
      docLen,
      missingClauses: [],
      requestedClauses: [],
      materialClausesMissing: [],
      classification: "complete_full",
      conciseComplete: false,
      corpusHash,
    };
  }
  const requested = requestedClausesFromIntake(intake);
  const clauseSearchLow = buildClauseSearchText(text);
  const materialClausesMissing = requested.filter((c) => !bodyHasClause(text, c, clauseSearchLow));
  const lenOk = docLen >= PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN;
  const conciseComplete =
    materialClausesMissing.length === 0 &&
    !lenOk &&
    qualifiesConciseProfessionalIntakeCoverage(text, requested.length);
  const ok = materialClausesMissing.length === 0 && (lenOk || conciseComplete);
  const missingForReport = [...materialClausesMissing];
  if (materialClausesMissing.length === 0 && !lenOk && !conciseComplete) {
    missingForReport.push("corpus_length" as ProfessionalProClauseId);
  }
  let classification: ProfessionalProCoverageClassification;
  if (materialClausesMissing.length > 0) {
    classification = "incomplete_missing_material_terms";
  } else if (lenOk) {
    classification = "complete_full";
  } else if (conciseComplete) {
    classification = "complete_concise";
  } else if (docLen > 0 && !/IN WITNESS WHEREOF|executed this Agreement/i.test(text)) {
    classification = "truncated";
  } else {
    classification = "incomplete_missing_material_terms";
  }
  return {
    applies: true,
    ok,
    docLen,
    missingClauses: missingForReport,
    requestedClauses: requested,
    materialClausesMissing,
    classification,
    conciseComplete,
    corpusHash,
  };
}

export function shouldRejectThinProfessionalProCorpus(
  assessment: ProfessionalProClauseCoverageAssessment,
): boolean {
  if (!assessment.applies || assessment.ok) return false;
  if (assessment.classification === "complete_concise") return false;
  return (
    assessment.docLen < PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN ||
    assessment.missingClauses.includes("corpus_length")
  );
}

/** Reject any professional-intake corpus that fails clause coverage — not only thin bodies. */
export function shouldRejectProfessionalProCorpus(
  assessment: ProfessionalProClauseCoverageAssessment,
): boolean {
  if (!assessment.applies || assessment.ok) return false;
  return true;
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
