/**
 * Accepted-corpus integrity — wire evidence that authorized acceptance must survive in the freeze candidate.
 * Wire validation may prevent display-prep false negatives; it must not freeze a substantively damaged corpus.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { assessProMinimumSubstanceCached } from "./paidProPostAcceptanceValidatorCache";
import {
  assessProfessionalProClauseCoverage,
  professionalClauseMaterialEvidencePresent,
  type ProfessionalProClauseId,
} from "./paidProProfessionalClauseCoverage";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { isAuthoritativePremiumPipelineProvenance } from "./paidProCorpusAcceptance";

export type PaidProPreservationLedgerEntry = {
  topic: string;
  wireEvidence: boolean;
  normalizedEvidence: boolean;
  preserved: boolean;
  reason: string;
};

export type PaidProAcceptedCorpusPreservationProof = {
  ok: boolean;
  reasons: string[];
  ledger: PaidProPreservationLedgerEntry[];
  wireHash: string | null;
  freezeHash: string | null;
  transformationFalseNegative: boolean;
};

function trim(value: string | null | undefined): string {
  return (value || "").trim();
}

/** Lenient freeze-side probe — catches formatting-only classifier visibility loss after normalization. */
function freezeCandidateClauseMaterialPresent(
  text: string,
  clause: ProfessionalProClauseId,
  rawIntake: string,
): boolean {
  if (professionalClauseMaterialEvidencePresent(text, clause)) return true;
  const bodyLow = text.toLowerCase();
  const intakeLow = rawIntake.toLowerCase();
  switch (clause) {
    case "confidentiality":
      return /\bconfidential(?:ity)?\b|non-?disclosure|trade\s+secret|proprietary/i.test(bodyLow);
    case "intellectual_property":
      return /\bintellectual\s+property\b|\bip\s+(?:ownership|license|assignment|rights?)\b|\bwork\s+product\b/i.test(bodyLow);
    case "limitation_of_liability":
      return /\blimitation\s+of\s+liability\b|\bliability\s+cap\b|\bdirect damages are limited\b/i.test(bodyLow);
    case "termination":
      return /\bterminat(?:ion|e|able)\b|\bterm\s+and\s+termination\b|\bfor\s+cause\b/i.test(bodyLow);
    case "governing_law":
      return (
        /\bgoverning\s+law\b|\bgoverned\s+by\b|\blaws\s+of\b|\bstate of delaware\b/i.test(bodyLow) ||
        (/\bdelaware\b/i.test(bodyLow) && /\bdelaware\b/i.test(intakeLow))
      );
    case "notices":
      return /\bnotices?\b|\bif to\b|\bnotice\s+address/i.test(bodyLow);
    case "electronic_signatures":
      return /\belectronic\s+sign|\bcounterparts?\b|\bin\s+witness\s+whereof\b/i.test(bodyLow);
    default:
      return false;
  }
}

function wireAuthorizedTopics(wireAssessment: ReturnType<typeof assessProfessionalProClauseCoverage>): ProfessionalProClauseId[] {
  if (!wireAssessment.applies) return [];
  return wireAssessment.requestedClauses.filter(
    (c) => !wireAssessment.materialClausesMissing.includes(c),
  );
}

/**
 * Model B — normalized semantic marker comparison with wire-authorizing topic ledger.
 * Freeze is allowed only when every wire-authorizing professional topic retains material evidence
 * in the freeze candidate, or an existing authorized exception applies upstream.
 */
export function assessPaidProAcceptedCorpusPreservationProof(args: {
  wireText: string;
  freezeCandidateText: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  pipelineSource?: string | null;
}): PaidProAcceptedCorpusPreservationProof {
  const wireText = trim(args.wireText);
  const freezeText = trim(args.freezeCandidateText);
  const rawIntake = String(args.rawIntake || "");
  const pipelineSource = args.pipelineSource ?? null;
  const wireHash = paidProPipelineAcceptedCorpusHash(wireText);
  const freezeHash = paidProPipelineAcceptedCorpusHash(freezeText);
  const ledger: PaidProPreservationLedgerEntry[] = [];
  const reasons: string[] = [];

  if (!wireText || !freezeText) {
    return {
      ok: false,
      reasons: ["preservation_proof_missing_corpus"],
      ledger,
      wireHash,
      freezeHash,
      transformationFalseNegative: false,
    };
  }

  if (!isAuthoritativePremiumPipelineProvenance(pipelineSource)) {
    return {
      ok: true,
      reasons: [],
      ledger,
      wireHash,
      freezeHash,
      transformationFalseNegative: false,
    };
  }

  const wireProfessional = assessProfessionalProClauseCoverage({ text: wireText, intake: rawIntake });
  const freezeProfessional = assessProfessionalProClauseCoverage({ text: freezeText, intake: rawIntake });
  const authorizedTopics = wireAuthorizedTopics(wireProfessional);

  for (const topic of authorizedTopics) {
    const wireEvidence = professionalClauseMaterialEvidencePresent(wireText, topic);
    const normalizedEvidence = freezeCandidateClauseMaterialPresent(freezeText, topic, rawIntake);
    const preserved = normalizedEvidence;
    ledger.push({
      topic: `professional_${topic}`,
      wireEvidence,
      normalizedEvidence,
      preserved,
      reason: preserved
        ? "material_evidence_present_in_freeze_candidate"
        : "wire_authorizing_clause_missing_from_freeze_candidate",
    });
    if (!preserved) {
      reasons.push(`preservation_failed:professional_${topic}`);
    }
  }

  const freezeSubstance = assessProMinimumSubstanceCached({
    text: freezeText,
    rawIntake,
    draft: args.draft ?? null,
    source: "preservation_proof",
  });
  if (freezeSubstance.applies && !freezeSubstance.ok) {
    const wireSubstance = assessProMinimumSubstanceCached({
      text: wireText,
      rawIntake,
      draft: args.draft ?? null,
      source: "preservation_proof_wire",
    });
    for (const section of freezeSubstance.missingSections) {
      if (section.startsWith("professional_")) continue;
      if (wireSubstance.missingSections.includes(section)) continue;
      const topic = section.startsWith("professional_")
        ? section
        : `minimum_substance:${section}`;
      const freezeSectionPresent = section.startsWith("professional_")
        ? freezeCandidateClauseMaterialPresent(
            freezeText,
            section.slice("professional_".length) as ProfessionalProClauseId,
            rawIntake,
          )
        : !assessProMinimumSubstanceCached({
            text: freezeText,
            rawIntake,
            draft: args.draft ?? null,
            source: "preservation_proof_freeze_rescan",
          }).missingSections.includes(section);
      ledger.push({
        topic,
        wireEvidence: true,
        normalizedEvidence: freezeSectionPresent,
        preserved: freezeSectionPresent,
        reason: freezeSectionPresent
          ? "minimum_substance_marker_present_in_freeze_candidate"
          : "minimum_substance_marker_missing_from_freeze_candidate",
      });
      if (!freezeSectionPresent) {
        reasons.push(`preservation_failed:${topic}`);
      }
    }
  }

  const transformationFalseNegative =
    wireProfessional.applies &&
    wireProfessional.ok &&
    freezeProfessional.applies &&
    !freezeProfessional.ok &&
    reasons.length === 0 &&
    authorizedTopics.every((topic) => freezeCandidateClauseMaterialPresent(freezeText, topic, rawIntake));

  return {
    ok: reasons.length === 0,
    reasons,
    ledger,
    wireHash,
    freezeHash,
    transformationFalseNegative,
  };
}

export function requirePaidProAcceptedCorpusPreservationProof(
  args: Parameters<typeof assessPaidProAcceptedCorpusPreservationProof>[0],
): PaidProAcceptedCorpusPreservationProof {
  return assessPaidProAcceptedCorpusPreservationProof(args);
}
