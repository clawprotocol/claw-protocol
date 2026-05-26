/**
 * Canonical guided Pro final corpus finalizer.
 * This is the single body allowed into final review, copy/export, review send, and signing.
 */

import { corpusMatchesFreeBasicDraft } from "../premiumReadonlyRenderCorpus";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
  rebuildSignatureBlocksWithPartyIdentities,
  shouldRejectSignerIdentityCorpusShrink,
  type CanonicalPartyIdentity,
} from "./signerPartyIdentity";
import type { CanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { GuidedCompletionSession } from "./types";
import { listGuidedAnsweredVariableIds } from "./guidedAnswerApplyOrchestration";
import { applyProBodyHardIntegrityGate } from "./proBodyHardIntegrityGate";
import {
  GUIDED_FINAL_REVIEW_SOURCE_PRIORITY,
  isRejectedGuidedFinalReviewSource,
} from "./guidedFinalReviewAuthoritativeBody";
import {
  applyCanonicalManifestPlaceholdersToCorpus,
  buildCanonicalFinalPartyManifestFromIdentities,
  scanFatalPartyPlaceholdersAfterManifestApply,
  type CanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";
import {
  GUIDED_FINALIZER_HYDRATED_ONLY_SOURCES,
  normalizeGuidedCorpusHeadingArtifacts,
  normalizePartyNameSpacingInCorpus,
  removeDraftTemplateBannerFromCorpus,
  stripDuplicatePreWitnessIdentityFragment,
  stripGuidedPlaceholderBracketArtifacts,
} from "./guidedFinalReviewToSigning";
import { corpusSignatureBlocksHaveRequiredByLines } from "./signatureRegion";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import { prepareCanonicalWorkingDraftForFinalization } from "./canonicalWorkingAgreementDraft";
import {
  buildCanonicalGuidedAnswerManifest,
  describeCanonicalManifestMissingItem,
  validateCorpusAgainstCanonicalManifest,
} from "./guidedCanonicalAnswerManifest";
import {
  logGuidedCorpusIntegrityWarn,
  logGuidedCorpusSectionNormalized,
  normalizeGuidedProCorpusStructure,
  validateNormalizedCorpusStructure,
} from "./guidedCanonicalCorpusNormalizer";
import {
  logFinalGradeCorpusDefects,
  repairFinalGradeGuidedCorpus,
} from "./guidedFinalGradeCorpus";
import { canonicalizeProAgreementText } from "../proAgreementCanonicalizer";
import {
  buildCanonicalAgreementSnapshot,
  freezeCanonicalAgreementSnapshot,
} from "../canonicalAgreementSnapshot";
import { stabilizeFinalAgreementCompilerOutput } from "../finalAgreementCompilerIntegrity";
import {
  corpusHasPaymentStructureContradictions,
  extractGuidedSemanticFacts,
  reconcileGuidedSemanticCorpus,
} from "./guidedAnswerSemanticMerger";
import { filterManifestMissingWithSemanticEvidence } from "./guidedSemanticManifestValidation";
import { MINIMUM_COMMERCIAL_SPECIFICITY_SCORE } from "../commercialSpecificity";

export const GUIDED_FINAL_CORPUS_MIN_LEN = 1500;

export type GuidedFinalCorpusCandidateSource =
  | "canonical_working_draft"
  | "finalized_signer_applied_guided_corpus"
  | "hydrated_premium_with_signers"
  | "finalized_guided_corpus"
  | "finalized_signing"
  | "accepted_review"
  | "authoritative_snapshot"
  | "server_full_document_text"
  | "last_accepted_premium_candidate"
  | "last_known_good_authoritative"
  | "hydrated_premium"
  | "agreement_document"
  | "picker_authoritative"
  | "rendered_preview"
  | "draft_fallback";

export type GuidedFinalCorpusCandidate = {
  source: GuidedFinalCorpusCandidateSource;
  body: string | null | undefined;
  paid?: boolean;
};

export type GuidedFinalCorpusDiagnostics = {
  selectedSource: GuidedFinalCorpusCandidateSource | "none";
  selectedLen: number;
  rejected: Array<{ source: GuidedFinalCorpusCandidateSource; reason: string; len: number }>;
  appliedAnswerIds: string[];
  signaturePolishCount: number;
  signatureRebuilt: boolean;
  signerIdentityRejected?: boolean;
  repairs: string[];
  finalHash: string;
  validationMissing: string[];
  validationContradictions: string[];
  structureDefects: string[];
  commercialSpecificityScore: number;
};

export type FinalizeGuidedProAgreementCorpusArgs = {
  candidates: readonly GuidedFinalCorpusCandidate[];
  guidedSession: GuidedCompletionSession | null | undefined;
  signerIdentities: readonly CanonicalPartyIdentity[];
  signerManifest: CanonicalSignerManifest | null;
  partyManifest?: CanonicalFinalPartyManifest | null;
  draft?: { agreement_family?: unknown } | null;
  reviewDraft?: { agreement_family?: unknown } | null;
  originalIntake: string;
  freeBasicDraftPlain?: string | null;
};

export type FinalizeGuidedProAgreementCorpusResult = {
  ok: boolean;
  body: string;
  signerManifest: CanonicalSignerManifest | null;
  appliedAnswerIds: string[];
  unresolvedPlaceholders: string[];
  diagnostics: GuidedFinalCorpusDiagnostics;
};

function norm(s: string | null | undefined): string {
  return (s || "").trim();
}

function guidedTerminationNoticeDays(session: GuidedCompletionSession | null | undefined): string | null {
  const answered = session?.answered ?? {};
  const candidates = Object.entries(answered)
    .filter(([id]) => /renewal|termination|notice/i.test(id))
    .sort(([a], [b]) => {
      const atA = session?.answeredAt?.[a] ?? 0;
      const atB = session?.answeredAt?.[b] ?? 0;
      return atB - atA;
    })
    .map(([, answer]) => String(answer ?? ""));
  for (const answer of candidates) {
    const numeric = answer.match(/\b(\d{1,3})\s+days?\b/i)?.[1];
    if (numeric) return numeric;
    const word = answer.match(/\b(thirty|sixty|fourteen|fifteen)\b/i)?.[1]?.toLowerCase();
    if (word === "thirty") return "30";
    if (word === "sixty") return "60";
    if (word === "fourteen") return "14";
    if (word === "fifteen") return "15";
  }
  return null;
}

function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

function isPaidSource(source: GuidedFinalCorpusCandidateSource): boolean {
  return !isRejectedGuidedFinalReviewSource(source);
}

function sourceSelectionPriority(source: GuidedFinalCorpusCandidateSource): number {
  const idx = GUIDED_FINAL_REVIEW_SOURCE_PRIORITY.indexOf(source);
  return idx >= 0 ? idx : GUIDED_FINAL_REVIEW_SOURCE_PRIORITY.length + 1;
}

export type FinalGuidedProCorpusValidation = {
  ok: boolean;
  missing: string[];
  contradictions: string[];
};

export function describeGuidedValidationMissingItems(
  missing: readonly string[],
  guidedSession?: GuidedCompletionSession | null,
): string[] {
  const manifest = buildCanonicalGuidedAnswerManifest(guidedSession);
  return missing.map((id) => {
    const entry = manifest.entries.find((e) => e.variableId === id);
    if (entry) return describeCanonicalManifestMissingItem(entry);
    if (id === "provider_preexisting_carveout") {
      return "Provider pre-existing IP carveout missing from Ownership section";
    }
    return `Missing guided answer evidence: ${id}`;
  });
}

function sessionRequiresIpOwnershipCheck(session: GuidedCompletionSession | null | undefined): boolean {
  if (!session) return false;
  return Object.entries(session.answered).some(([id, answer]) => {
    const a = (answer || "").trim();
    if (!a) return false;
    if (!/^(?:ip_ownership|ip_allocation|ip_ownership_contradiction)$/i.test(id)) return false;
    return /company|client/i.test(a) && /own|deliverable/i.test(a);
  });
}

export function validateFinalGuidedProCorpusBeforeFreeze(args: {
  body: string;
  guidedSession: GuidedCompletionSession | null | undefined;
  originalIntake?: string;
}): FinalGuidedProCorpusValidation {
  const body = (args.body || "").replace(/\s+/g, " ");
  const contradictions: string[] = [];
  const manifest = buildCanonicalGuidedAnswerManifest(args.guidedSession);
  const validation = validateCorpusAgainstCanonicalManifest(body, manifest);
  const missing = filterManifestMissingWithSemanticEvidence({
    missing: validation.missing,
    body: args.body,
    guidedSession: args.guidedSession,
    originalIntake: args.originalIntake,
  });

  const needsIp = sessionRequiresIpOwnershipCheck(args.guidedSession);
  if (
    needsIp &&
    !/\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)/i.test(body)
  ) {
    if (!missing.includes("provider_preexisting_carveout")) {
      missing.push("provider_preexisting_carveout");
    }
  }

  if (needsIp && /\b(?:Service Provider|Provider)\s+owns?\s+(?:all\s+)?(?:project\s+)?(?:deliverables|work product)\b/i.test(body)) {
    contradictions.push("provider_owns_project_deliverables");
  }
  if (needsIp && /\b(?:all\s+)?(?:deliverables|work product)\s+(?:belong|belongs|are assigned)\s+to\s+(?:Service Provider|Provider)\b/i.test(body)) {
    contradictions.push("deliverables_assigned_to_provider");
  }

  const semantic = extractGuidedSemanticFacts(args.guidedSession, args.originalIntake ?? "");
  contradictions.push(...corpusHasPaymentStructureContradictions(body, semantic));

  return { ok: missing.length === 0 && contradictions.length === 0, missing, contradictions };
}

function applyGuidedAnswersDeterministically(
  body: string,
  session: GuidedCompletionSession | null | undefined,
  intakeRaw = "",
): { body: string; appliedAnswerIds: string[]; repairs: string[] } {
  const appliedAnswerIds = listGuidedAnsweredVariableIds(session);
  const merged = mergeAllGuidedAnswersIntoCorpus(body, session);
  const semantic = extractGuidedSemanticFacts(session, intakeRaw);
  const reconciled = reconcileGuidedSemanticCorpus(merged.body, semantic, intakeRaw);
  return {
    body: reconciled.text,
    appliedAnswerIds,
    repairs: [...merged.repairs, ...reconciled.repairs],
  };
}

function buildPartyManifestFromIdentities(
  identities: readonly CanonicalPartyIdentity[],
  manifest?: CanonicalFinalPartyManifest | null,
): CanonicalFinalPartyManifest {
  if (manifest?.parties?.length) return manifest;
  return buildCanonicalFinalPartyManifestFromIdentities(identities);
}

function replaceIdentityPlaceholders(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
  partyManifest?: CanonicalFinalPartyManifest | null,
): { body: string; repairs: string[] } {
  const manifest = buildPartyManifestFromIdentities(identities, partyManifest);
  const patched = applyCanonicalManifestPlaceholdersToCorpus(text, manifest);
  return { body: patched.text, repairs: patched.repairs };
}

function selectFinalCorpusCandidate(
  args: FinalizeGuidedProAgreementCorpusArgs,
  diagnostics: GuidedFinalCorpusDiagnostics,
): { source: GuidedFinalCorpusCandidateSource | "none"; body: string } {
  const paidExists = args.candidates.some((c) => isPaidSource(c.source) && norm(c.body).length >= GUIDED_FINAL_CORPUS_MIN_LEN);
  const frozenExists = args.candidates.some(
    (c) =>
      (c.source === "finalized_signer_applied_guided_corpus" ||
        c.source === "finalized_signing" ||
        c.source === "accepted_review" ||
        c.source === "authoritative_snapshot" ||
        c.source === "finalized_guided_corpus") &&
      norm(c.body).length >= GUIDED_FINAL_CORPUS_MIN_LEN,
  );
  const eligible: Array<{ source: GuidedFinalCorpusCandidateSource; body: string }> = [];
  for (const c of args.candidates) {
    const body = norm(c.body);
    if (!body) continue;
    if (frozenExists && GUIDED_FINALIZER_HYDRATED_ONLY_SOURCES.has(c.source)) {
      diagnostics.rejected.push({ source: c.source, reason: "hydrated_preview_when_frozen_exists", len: body.length });
      continue;
    }
    if (paidExists && !isPaidSource(c.source)) {
      diagnostics.rejected.push({ source: c.source, reason: "free_or_preview_after_paid_candidate", len: body.length });
      continue;
    }
    if (paidExists && body.length < GUIDED_FINAL_CORPUS_MIN_LEN) {
      diagnostics.rejected.push({ source: c.source, reason: "under_final_min_after_paid_candidate", len: body.length });
      continue;
    }
    if (args.freeBasicDraftPlain && corpusMatchesFreeBasicDraft(body, args.freeBasicDraftPlain) && paidExists) {
      if (c.source === "canonical_working_draft" && body.length >= GUIDED_FINAL_CORPUS_MIN_LEN) {
        eligible.push({ source: c.source, body });
        continue;
      }
      diagnostics.rejected.push({ source: c.source, reason: "matches_free_basic_draft", len: body.length });
      continue;
    }
    eligible.push({ source: c.source, body });
  }
  eligible.sort(
    (a, b) =>
      sourceSelectionPriority(a.source) - sourceSelectionPriority(b.source) ||
      b.body.length - a.body.length,
  );
  const best = eligible[0];
  return best ? { source: best.source, body: best.body } : { source: "none", body: "" };
}

function eligiblePaidCandidates(
  args: FinalizeGuidedProAgreementCorpusArgs,
): Array<{ source: GuidedFinalCorpusCandidateSource; body: string }> {
  const paidExists = args.candidates.some((c) => isPaidSource(c.source) && norm(c.body).length >= GUIDED_FINAL_CORPUS_MIN_LEN);
  const out: Array<{ source: GuidedFinalCorpusCandidateSource; body: string }> = [];
  for (const c of args.candidates) {
    const body = norm(c.body);
    if (!body) continue;
    if (paidExists && !isPaidSource(c.source)) continue;
    if (paidExists && body.length < GUIDED_FINAL_CORPUS_MIN_LEN) continue;
    if (args.freeBasicDraftPlain && corpusMatchesFreeBasicDraft(body, args.freeBasicDraftPlain) && paidExists) {
      if (c.source === "canonical_working_draft" && body.length >= GUIDED_FINAL_CORPUS_MIN_LEN) {
        out.push({ source: c.source, body });
        continue;
      }
      continue;
    }
    out.push({ source: c.source, body });
  }
  return out.sort(
    (a, b) =>
      sourceSelectionPriority(a.source) - sourceSelectionPriority(b.source) ||
      b.body.length - a.body.length,
  );
}

export function logGuidedFinalCorpusBlockedPlaceholderIdentityMismatch(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-corpus-blocked-placeholder-identity-mismatch]", payload);
}

export function logGuidedFinalCorpusFinalized(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-corpus-finalized]", payload);
}

export function resolveGuidedFinalCorpusFailureReason(
  result: Pick<FinalizeGuidedProAgreementCorpusResult, "unresolvedPlaceholders" | "diagnostics">,
): "party_placeholders_unresolved" | "guided_validation_incomplete" | "authoritative_body_missing" {
  if (result.unresolvedPlaceholders.length > 0) return "party_placeholders_unresolved";
  if (result.diagnostics.validationMissing.length > 0 || result.diagnostics.validationContradictions.length > 0) {
    return "guided_validation_incomplete";
  }
  if (result.diagnostics.selectedLen < GUIDED_FINAL_CORPUS_MIN_LEN) return "authoritative_body_missing";
  return "authoritative_body_missing";
}

export function finalizeGuidedProAgreementCorpus(
  args: FinalizeGuidedProAgreementCorpusArgs,
): FinalizeGuidedProAgreementCorpusResult {
  const diagnostics: GuidedFinalCorpusDiagnostics = {
    selectedSource: "none",
    selectedLen: 0,
    rejected: [],
    appliedAnswerIds: [],
    signaturePolishCount: 0,
    signatureRebuilt: false,
    repairs: [],
    finalHash: "",
    validationMissing: [],
    validationContradictions: [],
    structureDefects: [],
    commercialSpecificityScore: 100,
  };

  const workingSeed = args.candidates
    .map((c) => norm(c.body))
    .filter((body) => body.length >= 500)
    .sort((a, b) => b.length - a.length)[0];
  const augmentedCandidates: GuidedFinalCorpusCandidate[] = [...args.candidates];
  if (workingSeed) {
    const prepared = prepareCanonicalWorkingDraftForFinalization({
      body: workingSeed,
      guidedSession: args.guidedSession,
      originalIntake: args.originalIntake,
    });
    if (prepared.body.length >= 500) {
      augmentedCandidates.unshift({
        source: "canonical_working_draft",
        body: prepared.body,
        paid: true,
      });
      diagnostics.repairs.push(...prepared.repairs.map((r) => `canonical_working_draft:${r}`));
    }
  }

  let selected = selectFinalCorpusCandidate({ ...args, candidates: augmentedCandidates }, diagnostics);
  const preValidation = validateFinalGuidedProCorpusBeforeFreeze({
    body: selected.body,
    guidedSession: args.guidedSession,
    originalIntake: args.originalIntake,
  });
  if (!preValidation.ok) {
    const recovery = eligiblePaidCandidates({ ...args, candidates: augmentedCandidates }).find((candidate) =>
      validateFinalGuidedProCorpusBeforeFreeze({
        body: candidate.body,
        guidedSession: args.guidedSession,
        originalIntake: args.originalIntake,
      }).ok,
    );
    if (recovery && recovery.source !== selected.source) {
      diagnostics.rejected.push({
        source: selected.source === "none" ? "last_accepted_premium_candidate" : selected.source,
        reason: "missing_guided_answer_evidence",
        len: selected.body.length,
      });
      selected = recovery;
    }
  }
  diagnostics.selectedSource = selected.source;
  diagnostics.selectedLen = selected.body.length;

  let body = selected.body;
  const partyManifest = buildPartyManifestFromIdentities(args.signerIdentities, args.partyManifest);
  const earlyManifestPatch = applyCanonicalManifestPlaceholdersToCorpus(body, partyManifest);
  body = earlyManifestPatch.text;
  diagnostics.repairs.push(...earlyManifestPatch.repairs);

  const hard = applyProBodyHardIntegrityGate(body, {
    intakeRaw: args.originalIntake,
    agreementFamily: undefined,
    surface: "guided_final_corpus_finalizer",
  });
  body = hard.text;
  diagnostics.repairs.push(...hard.repairs);

  const guided = applyGuidedAnswersDeterministically(body, args.guidedSession, args.originalIntake);
  body = guided.body;
  diagnostics.appliedAnswerIds = guided.appliedAnswerIds;
  diagnostics.repairs.push(...guided.repairs);

  const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
    body,
    args.signerIdentities,
    args.originalIntake,
  );
  diagnostics.signerIdentityRejected = Boolean(identityApply.rejected);
  body = identityApply.rejected ? body : identityApply.text;
  if (identityApply.rejected) {
    const recoveryManifest = applyCanonicalManifestPlaceholdersToCorpus(body, partyManifest);
    body = recoveryManifest.text;
    diagnostics.repairs.push(...recoveryManifest.repairs.map((r) => `identity_recovery:${r}`));
  }
  diagnostics.signaturePolishCount = identityApply.signaturePolishCount;
  diagnostics.repairs.push(...identityApply.repaired.map((r) => `identity:${r}`));

  const identityDirect = replaceIdentityPlaceholders(body, args.signerIdentities, partyManifest);
  body = identityDirect.body;
  diagnostics.repairs.push(...identityDirect.repairs);

  if (args.signerIdentities.length >= 2) {
    const lacksByAnchors = !corpusSignatureBlocksHaveRequiredByLines(body, args.signerIdentities.length);
    if (
      lacksByAnchors ||
      (args.signerManifest && diagnostics.signaturePolishCount === 0)
    ) {
      const rebuilt = rebuildSignatureBlocksWithPartyIdentities(body, args.signerIdentities);
      if (!shouldRejectSignerIdentityCorpusShrink(body.length, rebuilt.text.length)) {
        body = rebuilt.text;
        diagnostics.signaturePolishCount += rebuilt.count;
        diagnostics.signatureRebuilt = rebuilt.count > 0;
        if (rebuilt.count > 0) {
          diagnostics.repairs.push(lacksByAnchors ? "signature:by_lines_added" : "signature_blocks_rebuilt");
        }
      }
    }
  }

  if (
    diagnostics.appliedAnswerIds.some((id) => /renewal|termination|notice/i.test(id)) &&
    !/\b(?:30|thirty)\s+days?.{0,24}notice\b/i.test(body)
  ) {
    const noticeMerge = mergeAllGuidedAnswersIntoCorpus(body, args.guidedSession);
    body = noticeMerge.body;
    diagnostics.repairs.push(...noticeMerge.repairs.map((r) => `final_guard:${r}`));
  }

  const semanticValidation = validateFinalGuidedProCorpusBeforeFreeze({
    body,
    guidedSession: args.guidedSession,
    originalIntake: args.originalIntake,
  });
  diagnostics.validationMissing = semanticValidation.missing;
  diagnostics.validationContradictions = semanticValidation.contradictions;
  if (!semanticValidation.ok) {
    diagnostics.repairs.push(
      ...semanticValidation.missing.map((m) => `validation_missing:${m}`),
      ...semanticValidation.contradictions.map((c) => `validation_contradiction:${c}`),
    );
    const repaired = applyGuidedAnswersDeterministically(body, args.guidedSession, args.originalIntake);
    body = repaired.body;
    diagnostics.repairs.push(...repaired.repairs.map((r) => `validation_repair:${r}`));
    const repairedValidation = validateFinalGuidedProCorpusBeforeFreeze({
      body,
      guidedSession: args.guidedSession,
      originalIntake: args.originalIntake,
    });
    diagnostics.validationMissing = repairedValidation.missing;
    diagnostics.validationContradictions = repairedValidation.contradictions;
  }

  const headingArtifacts = normalizeGuidedCorpusHeadingArtifacts(body);
  body = headingArtifacts.text;
  diagnostics.repairs.push(...headingArtifacts.repairs);
  body = normalizePartyNameSpacingInCorpus(body);
  diagnostics.repairs.push("spacing:party_names");
  const banner = removeDraftTemplateBannerFromCorpus(body);
  body = banner.text;
  diagnostics.repairs.push(...banner.repairs);
  const stripped = stripGuidedPlaceholderBracketArtifacts(body);
  body = stripped.text;
  diagnostics.repairs.push(...stripped.repairs);
  const preWitnessIdentity = stripDuplicatePreWitnessIdentityFragment(body, args.signerIdentities);
  body = preWitnessIdentity.text;
  diagnostics.repairs.push(...preWitnessIdentity.repairs);
  const finalGrade = repairFinalGradeGuidedCorpus(body, {
    signerIdentities: args.signerIdentities,
    authoritativePartyNames: args.signerIdentities.map((id) => id.partyDisplayName).filter(Boolean),
  });
  body = finalGrade.text;
  diagnostics.repairs.push(...finalGrade.repairs.map((r) => `final_grade:${r}`));
  logFinalGradeCorpusDefects({
    defects: finalGrade.defects,
    repaired: true,
    bodyLen: body.length,
    blocking: finalGrade.defects.filter((d) => d !== "party_letter_fallback").length > 0,
  });
  const structureNormalized = normalizeGuidedProCorpusStructure(body);
  body = structureNormalized.text;
  diagnostics.repairs.push(...structureNormalized.repairs.map((r) => `structure:${r}`));
  const finalSemanticFacts = extractGuidedSemanticFacts(args.guidedSession, args.originalIntake);
  const canonicalized = canonicalizeProAgreementText(body, {
    canonicalPartyNames: args.signerIdentities.map((id) => id.partyDisplayName).filter(Boolean),
    canonicalRoles: ["Client", "Service Provider"],
    canonicalTerminationNoticeDays: guidedTerminationNoticeDays(args.guidedSession),
    intakeText: args.originalIntake,
    semanticFacts: finalSemanticFacts,
    surface: "guided_final_corpus_finalizer",
  });
  body = canonicalized.text;
  diagnostics.commercialSpecificityScore = canonicalized.commercialSpecificity?.score ?? 100;
  diagnostics.repairs.push(...canonicalized.repairs.map((r) => `canonical:${r}`));
  diagnostics.repairs.push(...canonicalized.warnings.map((w) => `canonical_warning:${w}`));
  const canonicalSnapshot = buildCanonicalAgreementSnapshot({
    surface: "guided_final_corpus_finalizer",
    tier: "pro",
    candidates: [{ source: diagnostics.selectedSource, text: body }],
    intakeText: args.originalIntake,
    guidedSession: args.guidedSession,
    semanticFacts: finalSemanticFacts,
    parties: args.signerIdentities.map((id) => ({
      name: id.partyDisplayName,
      role: id.blockHeading,
      email: id.email,
    })),
    signerState: {
      complete: args.signerIdentities.length >= 2,
      signerCount: args.signerIdentities.length,
      requireSignerBlocks: args.signerIdentities.length >= 2 || Boolean(args.signerManifest),
    },
    minLen: GUIDED_FINAL_CORPUS_MIN_LEN,
  });
  body = canonicalSnapshot.canonicalText;
  diagnostics.commercialSpecificityScore = canonicalSnapshot.commercialSpecificity.score;
  diagnostics.finalHash = canonicalSnapshot.hash;
  diagnostics.repairs.push(
    ...(canonicalSnapshot.integrityReport?.warnings ?? []).map((w) => `canonical_snapshot_warning:${w}`),
    ...canonicalSnapshot.placeholderIssues.map((p) => `canonical_snapshot_placeholder:${p}`),
    ...canonicalSnapshot.blockerIssues.map((b) => `canonical_snapshot_blocker:${b}`),
  );
  if (!canonicalSnapshot.integrityOk) {
    diagnostics.validationMissing = [
      ...diagnostics.validationMissing,
      ...(canonicalSnapshot.placeholderIssues.length ? canonicalSnapshot.placeholderIssues : []),
      ...(canonicalSnapshot.blockerIssues.length ? canonicalSnapshot.blockerIssues : []),
      ...(canonicalSnapshot.integrityReport?.ok === false ? ["pro_corpus_integrity_failed"] : []),
      ...(canonicalSnapshot.commercialSpecificity.score < MINIMUM_COMMERCIAL_SPECIFICITY_SCORE
        ? ["commercial_specificity_below_threshold"]
        : []),
      ...(canonicalSnapshot.len < GUIDED_FINAL_CORPUS_MIN_LEN ? ["canonical_corpus_missing"] : []),
    ].filter((value, index, arr) => arr.indexOf(value) === index);
  } else {
    freezeCanonicalAgreementSnapshot(canonicalSnapshot, "finalized_signer_applied_guided_corpus");
  }
  logGuidedCorpusSectionNormalized({
    beforeSections: structureNormalized.repairs.filter((r) => r.startsWith("canonical_section:")).length,
    afterSections: (body.match(/^\s*\d+\.\s+[A-Za-z]/gm) ?? []).length,
    dedupedClauses: structureNormalized.repairs.filter((r) => r.startsWith("dedupe")).length,
    reordered: structureNormalized.repairs.some((r) => r.includes("orphan") || r.includes("merge_duplicate")),
    repairs: structureNormalized.repairs.length,
    bodyLen: body.length,
  });
  let structureCheck = validateNormalizedCorpusStructure(body);
  if (!structureCheck.ok) {
    const retry = normalizeGuidedProCorpusStructure(body);
    body = retry.text;
    diagnostics.repairs.push(...retry.repairs.map((r) => `structure_retry:${r}`));
    structureCheck = validateNormalizedCorpusStructure(body);
  }
  diagnostics.structureDefects = structureCheck.defects;
  if (!structureCheck.ok) {
    logGuidedCorpusIntegrityWarn({
      defects: structureCheck.defects,
      bodyLen: body.length,
      note: "non_fatal_progression_allowed",
    });
  }
  body = normalizePartyNameSpacingInCorpus(body);
  if (
    args.signerIdentities.length >= 2 &&
    !corpusSignatureBlocksHaveRequiredByLines(body, args.signerIdentities.length)
  ) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(body, args.signerIdentities);
    if (!shouldRejectSignerIdentityCorpusShrink(body.length, rebuilt.text.length)) {
      body = rebuilt.text;
      diagnostics.signatureRebuilt = true;
      diagnostics.repairs.push("signature:final_by_line_guard");
    }
  }
  const stabilizedForSigning = stabilizeFinalAgreementCompilerOutput(body, {
    intakeText: args.originalIntake,
    freeText: args.freeBasicDraftPlain,
    signerIdentities: args.signerIdentities,
    surface: "guided_final_corpus_finalizer_post_signature",
  });
  body = stabilizedForSigning.text;
  diagnostics.repairs.push(...stabilizedForSigning.repairs.map((r) => `compiler:${r}`));

  const fatalScan =
    args.signerIdentities.length > 0 || Boolean(args.signerManifest)
      ? scanFatalPartyPlaceholdersAfterManifestApply({ body, manifest: partyManifest })
      : { ok: true, fatalPlaceholders: [] as string[], missingPartyReason: null };
  const unresolvedPlaceholders = fatalScan.missingPartyReason
    ? [fatalScan.missingPartyReason, ...fatalScan.fatalPlaceholders]
    : fatalScan.fatalPlaceholders;
  diagnostics.finalHash = hashText(body);

  if (diagnostics.validationMissing.length > 0 || diagnostics.validationContradictions.length > 0) {
    const workingRecovery = eligiblePaidCandidates({ ...args, candidates: augmentedCandidates })
      .filter(
        (c) =>
          c.source === "canonical_working_draft" ||
          c.source === "hydrated_premium_with_signers" ||
          c.source === "last_known_good_authoritative" ||
          c.source === "authoritative_snapshot" ||
          c.source === "agreement_document",
      )
      .sort((a, b) => b.body.length - a.body.length)[0];
    if (workingRecovery) {
      const prepared = prepareCanonicalWorkingDraftForFinalization({
        body: workingRecovery.body,
        guidedSession: args.guidedSession,
        originalIntake: args.originalIntake,
      });
      if (prepared.body.length >= GUIDED_FINAL_CORPUS_MIN_LEN) {
        const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
          prepared.body,
          args.signerIdentities,
          args.originalIntake,
        );
        let recoveredBody = identityApply.rejected ? prepared.body : identityApply.text;
        const identityDirect = replaceIdentityPlaceholders(recoveredBody, args.signerIdentities, partyManifest);
        recoveredBody = identityDirect.body;
        const recoveredGuided = applyGuidedAnswersDeterministically(
          recoveredBody,
          args.guidedSession,
          args.originalIntake,
        );
        recoveredBody = recoveredGuided.body;
        diagnostics.repairs.push(...recoveredGuided.repairs.map((r) => `working_draft_recovery:${r}`));
        if (args.signerManifest && args.signerIdentities.length > 0) {
          const rebuilt = rebuildSignatureBlocksWithPartyIdentities(recoveredBody, args.signerIdentities);
          if (!shouldRejectSignerIdentityCorpusShrink(recoveredBody.length, rebuilt.text.length)) {
            recoveredBody = rebuilt.text;
            diagnostics.signatureRebuilt = rebuilt.count > 0;
          }
        }
        recoveredBody = normalizePartyNameSpacingInCorpus(recoveredBody);
        const recoveredCanonical = canonicalizeProAgreementText(recoveredBody, {
          canonicalPartyNames: args.signerIdentities.map((id) => id.partyDisplayName).filter(Boolean),
          canonicalRoles: ["Client", "Service Provider"],
          canonicalTerminationNoticeDays: guidedTerminationNoticeDays(args.guidedSession),
          intakeText: args.originalIntake,
          semanticFacts: finalSemanticFacts,
          surface: "guided_final_corpus_finalizer_recovery",
        });
        recoveredBody = recoveredCanonical.text;
        diagnostics.repairs.push(...recoveredCanonical.repairs.map((r) => `working_draft_recovery_canonical:${r}`));
        const recoveredStabilized = stabilizeFinalAgreementCompilerOutput(recoveredBody, {
          intakeText: args.originalIntake,
          freeText: args.freeBasicDraftPlain,
          signerIdentities: args.signerIdentities,
          surface: "guided_final_corpus_finalizer_recovery",
        });
        recoveredBody = recoveredStabilized.text;
        diagnostics.repairs.push(...recoveredStabilized.repairs.map((r) => `working_draft_recovery_compiler:${r}`));
        const recoveredValidation = validateFinalGuidedProCorpusBeforeFreeze({
          body: recoveredBody,
          guidedSession: args.guidedSession,
          originalIntake: args.originalIntake,
        });
        const recoveredFatal = scanFatalPartyPlaceholdersAfterManifestApply({
          body: recoveredBody,
          manifest: partyManifest,
        });
        if (recoveredValidation.ok && recoveredFatal.ok) {
          body = recoveredBody;
          diagnostics.selectedSource = "canonical_working_draft";
          diagnostics.validationMissing = [];
          diagnostics.validationContradictions = [];
          diagnostics.repairs.push(...prepared.repairs.map((r) => `working_draft_recovery:${r}`));
        }
      }
    }
  }

  if (diagnostics.validationMissing.length > 0 || diagnostics.validationContradictions.length > 0) {
    return {
      ok: false,
      body,
      signerManifest: args.signerManifest,
      appliedAnswerIds: diagnostics.appliedAnswerIds,
      unresolvedPlaceholders,
      diagnostics,
    };
  }

  if (!fatalScan.ok) {
    logGuidedFinalCorpusBlockedPlaceholderIdentityMismatch({
      placeholders: unresolvedPlaceholders,
      bodyLen: body.length,
      selectedSource: diagnostics.selectedSource,
      finalHash: diagnostics.finalHash,
    });
    return {
      ok: false,
      body,
      signerManifest: args.signerManifest,
      appliedAnswerIds: diagnostics.appliedAnswerIds,
      unresolvedPlaceholders,
      diagnostics,
    };
  }

  const ok =
    body.length >= GUIDED_FINAL_CORPUS_MIN_LEN &&
    diagnostics.validationMissing.length === 0 &&
    diagnostics.validationContradictions.length === 0 &&
    fatalScan.ok;
  if (
    ok &&
    args.signerIdentities.length >= 2 &&
    !diagnostics.signerIdentityRejected &&
    (diagnostics.signatureRebuilt || diagnostics.signaturePolishCount > 0)
  ) {
    diagnostics.selectedSource = "finalized_signer_applied_guided_corpus";
  }

  logGuidedFinalCorpusFinalized({
    ok,
    bodyLen: body.length,
    selectedSource: diagnostics.selectedSource,
    finalHash: diagnostics.finalHash,
    signatureRebuilt: diagnostics.signatureRebuilt,
    repairs: diagnostics.repairs,
  });

  return {
    ok,
    body,
    signerManifest: args.signerManifest,
    appliedAnswerIds: diagnostics.appliedAnswerIds,
    unresolvedPlaceholders,
    diagnostics,
  };
}
