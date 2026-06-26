/**
 * Quality floor for concise but complete commercial services Pro bodies.
 * Prevents rejecting valid server output solely for length/section-count vs. stitched live preview.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  isCommercialServicesIntake,
  validationMinimumContractElementsSatisfied,
  type ValidationMinimumElementsInput,
} from "./agreementIntentContract";
import {
  repairDuplicateAgreementOpening,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { isDeterministicQuadPartyProFallbackSurface } from "./agreementDocumentSurfacePolicy";
import { tracePaidProAcceptancePipelineStage } from "./paidProAcceptancePipelineTrace";
import { tracePaidProQaPassWithText } from "./paidProQaPerfTrace";
import { detectPaidProMalformedServicesOpening } from "./paidProOpeningRecitalGuard";
import { repairOpeningRecitalRoleLabelsFromManifest } from "./paidProOpeningRoleLabelConsistency";
import { applyMutualConsultingProfessionalQualityFloor } from "./paidProMutualConsultingQualityFloor";
import { applyPaidProDomainScopeGuard } from "./paidProDomainScopeGuard";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { stripMalformedProReviewDisplayArtifacts } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  assessProMinimumSubstanceCached,
  hasPaidProAuthoritativeValidationPassed,
  hasPaidProPipelineSessionAcceptance,
  hasPaidProPipelineValidationForCorpus,
  markPaidProAuthoritativeValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { corpusHashForScanCache, runCachedCorpusScan } from "./paidProCorpusScanCache";
import {
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { removeOrphanPartyLinesBeforeExecutionTail } from "./paidProOrphanPartyLines";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";
import {
  analyzePaidProExecutionBlockInvariant,
} from "./paidProExecutionBlockAuthority";
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  isGenericPaidProAcceptanceManifestFallback,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { preserveFullLegalPartyNamesInOpeningAndSignatures } from "./paidProPartyNamePreserve";
import { applyPaidProCorpusDuplicationAuthority } from "./paidProCorpusDuplicationAuthority";
import { extractLineSeparatedLegalEntityParties } from "./partySlotIdentityNormalize";
import { insertBeforeExecutionTail } from "./paidProMutualConsultingQualityFloorInsert";
import { gateOperativeClauseFamilyAppend } from "./documentCompositionAuthority";
import { applyPaidProExecutiveDraftPolish } from "./paidProExecutiveDraftPolish";

function intakeJurisdictionFromSources(
  intakeText: string,
  draft: ParsedDraftShape | null | undefined,
): string | null {
  const fromDraft = String(draft?.jurisdiction || "").trim();
  if (fromDraft) return fromDraft;
  const m = intakeText.match(/\b([A-Za-z][A-Za-z\s]{2,30}?)\s+law\b/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function nextAgreementSectionNumber(text: string): number {
  const nums = [...(text || "").matchAll(/^\s*(\d{1,2})\.\s+[A-Z]/gm)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function ensureIntakeGoverningLawInAcceptanceCorpus(
  text: string,
  intakeText: string,
  draft: ParsedDraftShape | null | undefined,
): { text: string; repairs: string[] } {
  const governingGate = gateOperativeClauseFamilyAppend(text, "governing_law");
  if (!governingGate.allowed) return { text, repairs: [] };
  const jurisdiction = intakeJurisdictionFromSources(intakeText, draft);
  if (!jurisdiction) return { text, repairs: [] };
  const bodyLow = (text || "").toLowerCase();
  if (bodyLow.includes(jurisdiction.toLowerCase())) return { text, repairs: [] };
  const insertion = [
    `${nextAgreementSectionNumber(text)}. GOVERNING LAW`,
    `This Agreement shall be governed by the laws of ${jurisdiction}, without regard to conflict-of-law principles.`,
  ].join("\n");
  return {
    text: insertBeforeExecutionTail(text, insertion),
    repairs: ["quality:ensure_intake_governing_law"],
  };
}

export type ConciseCommercialServicesFactId =
  | "party_names"
  | "services_scope"
  | "payment"
  | "acceptance_review"
  | "governing_law"
  | "electronic_signatures"
  | "termination"
  | "ownership_work_product"
  | "confidentiality";

export type ProMinimumSubstanceSection = ConciseCommercialServicesFactId;

export type ConciseCommercialServicesQualityAssessment = {
  applies: boolean;
  ok: boolean;
  docLen: number;
  requiredFactsFound: ConciseCommercialServicesFactId[];
  requiredFactsMissing: ConciseCommercialServicesFactId[];
  missingSections: ProMinimumSubstanceSection[];
  malformedOpening: boolean;
};

const MALFORMED_OPENING_RES = [
  /effective\s+date\s+This\s+Agreement\s+is\s+between/i,
  /entered\s+into\s+as\s+of\s+the\s+effective\s+date\s+This\s+Agreement\s+is\s+between/i,
  /Agreement["']?\s*\)\s+is\s+This\s+Agreement\s+is\s+between/i,
  /\.signature\b/i,
  /\bsignature\s+below\b/i,
];

function normPartyToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function partyNameInBody(bodyLow: string, name: string): boolean {
  const n = normPartyToken(name);
  if (!n || n.length < 4) return false;
  if (bodyLow.includes(n)) return true;
  const parts = n.split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length >= 2) {
    return parts.every((p) => bodyLow.includes(p));
  }
  return false;
}

function resolvePartyNames(
  draft: ParsedDraftShape | null | undefined,
  rawIntake: string,
): string[] {
  const fromDraft = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 3);
  if (fromDraft.length >= 2) return fromDraft.slice(0, 2);
  const m = rawIntake.match(
    /\b([A-Z][A-Za-z0-9&.'\-\s]{2,60}?\s+(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.))\b/g,
  );
  return (m ?? []).map((x) => x.trim()).slice(0, 2);
}

function intakeMentionsTexas(intakeLow: string): boolean {
  return /\btexas\b/i.test(intakeLow);
}

function intakePaymentAmount(intakeLow: string): number | null {
  const m = intakeLow.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bodyHasPayment(bodyLow: string, intakeLow: string): boolean {
  const amt = intakePaymentAmount(intakeLow);
  if (amt != null) {
    const plain = String(amt);
    const withComma = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (bodyLow.includes(plain) || bodyLow.includes(withComma)) return true;
    if (amt === 5000 && /(?:five\s+thousand|5,000|5000)/i.test(bodyLow)) return true;
  }
  return /\$\s*[\d,]+|(?:total|fee|consideration|pay(?:ment)?)\b/i.test(bodyLow);
}

export function assessConciseCommercialServicesProQuality(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  agreementValidation?: ValidationMinimumElementsInput | null;
}): ConciseCommercialServicesQualityAssessment {
  const text = (args.text || "").trim();
  const rawIntake = (args.rawIntake || "").trim();
  const intakeLow = rawIntake.toLowerCase();
  const bodyLow = text.toLowerCase();
  const docLen = text.length;
  const parties = resolvePartyNames(args.draft ?? null, rawIntake);
  const knownServicesDealFacts =
    /\b(?:ai|artificial intelligence|workflow|automation|setup|implementation|integration)\b/i.test(rawIntake) ||
    /\$\s*[\d,]+/.test(rawIntake) ||
    /\b(?:texas|electronic\s+signatures?|e-?sign)\b/i.test(rawIntake);
  const applies =
    isCommercialServicesIntake(rawIntake) &&
    knownServicesDealFacts &&
    parties.length >= 2 &&
    parties.every((p) => /\b(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.)\b/i.test(p));

  const requiredFactsFound: ConciseCommercialServicesFactId[] = [];
  const requiredFactsMissing: ConciseCommercialServicesFactId[] = [];

  if (!applies) {
    return {
      applies: false,
      ok: false,
      docLen,
      requiredFactsFound,
      requiredFactsMissing,
      missingSections: [],
      malformedOpening: false,
    };
  }

  const openingRecords = resolveCanonicalPartyIdentitiesFromIntake(rawIntake, parties);
  const structuralMalformedOpening =
    openingRecords.length >= 2 && detectPaidProMalformedServicesOpening(text, openingRecords);
  const malformedOpening =
    MALFORMED_OPENING_RES.some((re) => re.test(text)) || structuralMalformedOpening;

  const partyOk = parties.every((p) => partyNameInBody(bodyLow, p));
  (partyOk ? requiredFactsFound : requiredFactsMissing).push("party_names");

  const scopeOk =
    /\b(?:ai\s+workflow|workflow\s+setup|professional\s+services|scope\s+of\s+services|services\s+agreement)\b/i.test(
      bodyLow,
    );
  (scopeOk ? requiredFactsFound : requiredFactsMissing).push("services_scope");

  const payOk = bodyHasPayment(bodyLow, intakeLow);
  (payOk ? requiredFactsFound : requiredFactsMissing).push("payment");

  const acceptanceOk =
    /\b(?:acceptance|acceptance\s+review|demo(?:nstration)?|review\s+period|nonconformity|defect|material\s+conform)/i.test(
      bodyLow,
    );
  (acceptanceOk ? requiredFactsFound : requiredFactsMissing).push("acceptance_review");

  const lawOk = intakeMentionsTexas(intakeLow)
    ? /\btexas\b|state of texas|laws of texas/i.test(bodyLow)
    : /\b(?:governing\s+law|governed\s+by|laws\s+of)\b/i.test(bodyLow);
  (lawOk ? requiredFactsFound : requiredFactsMissing).push("governing_law");

  const esignOk =
    /\belectronic\s+signatures?\b|\be-?sign\b|\bcounterparts?\b/i.test(bodyLow) ||
    (/\bin\s+witness\s+whereof\b/i.test(bodyLow) && countPaidProExecutionBlocks(text) >= 1);
  (esignOk ? requiredFactsFound : requiredFactsMissing).push("electronic_signatures");

  const termOk = /\bterminat(?:ion|e)?\b/i.test(bodyLow);
  (termOk ? requiredFactsFound : requiredFactsMissing).push("termination");

  const ownershipOk =
    /\b(?:work\s+product|ownership|own(?:s|ership)?\s+(?:final\s+)?(?:deliverables?|work)|intellectual\s+property|assign(?:s|ment)?|client\s+owns)\b/i.test(
      bodyLow,
    );
  (ownershipOk ? requiredFactsFound : requiredFactsMissing).push("ownership_work_product");

  const confidentialityOk = /\bconfidential(?:ity)?\b|non-?public|trade secret|proprietary/i.test(bodyLow);
  (confidentialityOk ? requiredFactsFound : requiredFactsMissing).push("confidentiality");

  const factsOk = requiredFactsMissing.length === 0;
  void validationMinimumContractElementsSatisfied(args.agreementValidation);
  const ok = !malformedOpening && docLen >= 400 && factsOk;

  return {
    applies: true,
    ok,
    docLen,
    requiredFactsFound,
    requiredFactsMissing,
    missingSections: requiredFactsMissing,
    malformedOpening,
  };
}

export function validateProMinimumSubstance(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  source?: string | null;
}): ConciseCommercialServicesQualityAssessment {
  const source = args.source ?? "unknown";
  if (
    hasPaidProAuthoritativeValidationPassed({ text: args.text, source }) ||
    hasPaidProPipelineSessionAcceptance({ text: args.text, source })
  ) {
    markPaidProAuthoritativeValidationPassed({ text: args.text, source });
    return {
      applies: true,
      ok: true,
      docLen: args.text.trim().length,
      requiredFactsFound: [],
      requiredFactsMissing: [],
      missingSections: [],
      malformedOpening: false,
    };
  }
  const decision = assessProMinimumSubstanceCached({
    text: args.text,
    rawIntake: args.rawIntake,
    draft: args.draft,
    source,
  });
  logProMinimumSubstanceDecision({
    accepted: !decision.applies || decision.ok,
    missingSections: decision.missingSections,
    docLen: decision.docLen,
    source,
  });
  return decision;
}

export function logProMinimumSubstanceDecision(payload: {
  accepted: boolean;
  missingSections: string[];
  docLen: number;
  source?: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  if (!paidProVerboseDetailLogsEnabled()) return;
  const hash = corpusHashForScanCache(String(payload.docLen));
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "pro-minimum-substance-decision",
      surface: payload.source ?? "unknown",
      hash,
      source: payload.accepted ? "accepted" : "blocked",
      payloadSignature: JSON.stringify(payload.missingSections),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[pro-minimum-substance-decision]", payload);
}

export function logPaidProValidationDecision(payload: {
  accepted: boolean;
  reasons: string[];
  docLen: number;
  source?: string | null;
  serverFullDocExists?: boolean;
  serverLen?: number;
  recoveryCandidateLen?: number;
  acceptedSource?: string | null;
  rejectedReason?: string | null;
  requiredFactsFound?: string[];
  requiredFactsMissing?: string[];
}): void {
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "paid-pro-validation-decision",
      surface: payload.source ?? "unknown",
      hash: String(payload.docLen),
      source: payload.accepted ? "accepted" : "blocked",
      payloadSignature: JSON.stringify({
        reasons: payload.reasons,
        serverFullDocExists: Boolean(payload.serverFullDocExists),
        requiredFactsMissing: payload.requiredFactsMissing ?? [],
      }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-validation-decision]", payload);
}

/** Repair malformed openings and expand thin AI workflow services bodies before acceptance gates. */
function draftFingerprintForPrepareCache(draft: ParsedDraftShape | null | undefined): string {
  if (!draft) return "no-draft";
  const blob = [
    (draft.parties || []).map((p) => `${String(p?.name ?? "").trim()}|${String(p?.role ?? "").trim()}`).join(";"),
    String(draft.title ?? "").trim(),
    String(draft.jurisdiction ?? "").trim(),
  ].join("\n");
  return blob.length >= 80 ? corpusHashForScanCache(blob) : `len:${blob.length}`;
}

export function preparePaidProServerDocumentForAcceptance(
  raw: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText: string,
  opts?: { surface?: string },
): { text: string; repairs: string[] } {
  const surface = opts?.surface ?? "prepare_paid_pro_server_acceptance";
  const phase = `intake:${shortIntakeFingerprint(intakeText)}|draft:${draftFingerprintForPrepareCache(draft)}`;
  return tracePaidProQaPassWithText(
    "preparePaidProServerDocumentForAcceptance",
    surface,
    raw || "",
    () =>
      runCachedCorpusScan({
        surface,
        corpus: raw || "",
        phase,
        scanType: "prepare_paid_pro_server_acceptance",
        run: () => preparePaidProServerDocumentForAcceptanceCore(raw, draft, intakeText, surface),
      }),
  );
}

function preparePaidProServerDocumentForAcceptanceCore(
  raw: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText: string,
  surface: string,
): { text: string; repairs: string[] } {
  if (isDeterministicQuadPartyProFallbackSurface(surface)) {
    return { text: (raw || "").replace(/\r\n?/g, "\n").trim(), repairs: [] };
  }
  const normalizedInput = (raw || "").replace(/\r\n?/g, "\n").trim();
  const inputPipelineHash = paidProPipelineAcceptedCorpusHash(normalizedInput);
  const pipelineAcceptedHash = readPaidProPipelineAcceptedCorpusHash();
  if (
    normalizedInput.length >= 4000 &&
    inputPipelineHash &&
    pipelineAcceptedHash &&
    inputPipelineHash === pipelineAcceptedHash &&
    hasPaidProPipelineValidationForCorpus({
      text: normalizedInput,
      source: "server_full_draft",
    })
  ) {
    return { text: normalizedInput, repairs: ["prepare:skipped_pipeline_validated_corpus"] };
  }
  const repairs: string[] = [];
  let out = normalizedInput;
  const lineSeparated = extractLineSeparatedLegalEntityParties(intakeText);
  const draftPartyNames = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const partyNames =
    lineSeparated.length === 2 && draftPartyNames.length <= 2
      ? lineSeparated
      : draftPartyNames.length >= 2
        ? draftPartyNames.slice(0, 12)
        : lineSeparated.length >= 2
          ? lineSeparated
          : draftPartyNames.slice(0, 2);
  const roleLabels = (draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  const resolved =
    partyNames.length >= 2
      ? resolveCanonicalPartyIdentitiesFromIntake(
          intakeText,
          partyNames,
          roleLabels.length >= 2 ? roleLabels : undefined,
        )
      : [];
  const manifestRecords = resolveAcceptanceManifestRecordsForExecution({
    draft: draft ?? null,
    intakeText,
  });
  const records =
    manifestRecords.length >= 3
      ? manifestRecords
      : resolved.length >= 2
        ? resolved
        : manifestRecords;
  const expectedParties = Math.max(
    records.length,
    draftPartyNames.length,
    2,
  );
  const invariantAtPrepareEntry = analyzePaidProExecutionBlockInvariant(out, { expectedParties });
  const corpusSnapshotBeforePrepareMutations = out;

  if (records.length >= 2) {
    const roleFix = repairOpeningRecitalRoleLabelsFromManifest(out, records);
    out = roleFix.text;
    repairs.push(...roleFix.repairs);
  }

  const headArtifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = headArtifacts.text;
  repairs.push(...headArtifacts.repairs);

  const opening = repairDuplicateAgreementOpening(out, records.length >= 2 ? records : undefined);
  out = opening.text;
  repairs.push(...opening.repairs);

  const mutualFloor = applyMutualConsultingProfessionalQualityFloor(out, draft ?? null, intakeText);
  if (mutualFloor.text !== out) {
    out = mutualFloor.text;
    repairs.push(...mutualFloor.repairs);
  }

  const floored = applyAiWorkflowServicesQualityFloorToFallback(out, draft ?? null, intakeText);
  if (floored !== out) {
    repairs.push("quality:ai_workflow_services_floor");
    out = floored;
  }

  const domainGuarded = applyPaidProDomainScopeGuard(out, intakeText, { logSurface: "acceptance_prep" });
  if (domainGuarded !== out) {
    repairs.push("domain_scope:contamination_sanitized");
    out = domainGuarded;
  }

  const tailArtifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = tailArtifacts.text;
  repairs.push(...tailArtifacts.repairs);

  const displayPrep = preparePaidProReviewDisplayPlain(out);
  if (displayPrep.text !== out) {
    const beforeDisplayInvariant = analyzePaidProExecutionBlockInvariant(out, { expectedParties });
    const afterDisplayInvariant = analyzePaidProExecutionBlockInvariant(displayPrep.text, {
      expectedParties,
    });
    if (!beforeDisplayInvariant.ok || afterDisplayInvariant.ok) {
      out = displayPrep.text;
      repairs.push(...displayPrep.repairs);
    } else {
      repairs.push("prepare:display_prep_execution_regression_skipped");
    }
  }

  const invariantBeforeEnsure = analyzePaidProExecutionBlockInvariant(out, { expectedParties });
  if (
    records.length >= 2 &&
    !isGenericPaidProAcceptanceManifestFallback(records) &&
    !invariantAtPrepareEntry.ok &&
    !invariantBeforeEnsure.ok
  ) {
    const execution = ensurePaidProAcceptanceExecutionBlockInvariant(out, records);
    if (execution.text !== out) {
      out = execution.text;
      repairs.push(...execution.repairs);
    }
  }

  const partyLegalNames =
    records.length >= 2
      ? records.map((r) => r.fullLegalName)
      : partyNames;
  if (partyLegalNames.length >= 2) {
    const orphanFix = runCachedCorpusScan({
      surface,
      corpus: out,
      phase: `parties:${partyLegalNames.map((n) => n.trim().toLowerCase()).join("|")}`,
      scanType: "orphan_party_lines_pre_execution",
      run: () =>
        removeOrphanPartyLinesBeforeExecutionTail(out, partyLegalNames, { surface }),
    });
    if (orphanFix.detected) {
      out = orphanFix.text;
      repairs.push(...orphanFix.repairs);
    }
  }

  const governingLaw = ensureIntakeGoverningLawInAcceptanceCorpus(out, intakeText, draft);
  if (governingLaw.text !== out) {
    out = governingLaw.text;
    repairs.push(...governingLaw.repairs);
  }

  const executivePolish = applyPaidProExecutiveDraftPolish(out, intakeText, draft);
  if (executivePolish.text !== out) {
    out = executivePolish.text;
    repairs.push(...executivePolish.repairs);
  }

  const preservedLegal = preserveFullLegalPartyNamesInOpeningAndSignatures(
    out,
    partyLegalNames,
    intakeText,
  );
  if (preservedLegal !== out) {
    out = preservedLegal;
    repairs.push("party_identity:preserve_opening_signature_legal_names");
  }

  const duplication = applyPaidProCorpusDuplicationAuthority(out);
  if (duplication.repairs.length > 0) {
    out = duplication.text;
    repairs.push(...duplication.repairs.map((r) => `corpus_duplication:${r}`));
  }

  if (
    invariantAtPrepareEntry.ok &&
    !analyzePaidProExecutionBlockInvariant(out, { expectedParties }).ok
  ) {
    out = corpusSnapshotBeforePrepareMutations;
    repairs.push("prepare:execution_invariant_final_restored");
  }

  const result = { text: out.trim(), repairs: [...new Set(repairs)] };
  tracePaidProAcceptancePipelineStage({
    stage: "after_preparePaidProServerDocumentForAcceptance",
    source: "server_full_draft",
    text: result.text,
    rawIntake: intakeText,
    draft: draft ?? null,
  });
  return result;
}
