/**
 * Signer setup / recipient metadata: full legal entity names vs compact display labels.
 * Priority: authoritative manifest → canonical resolver → intake extract → draft → UI/handoff.
 */

import { getAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import {
  PARTY_ENTITY_SUFFIX_RE,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import {
  detectExecutionBlockRoleInversion,
  partyLegalNamesMatch,
  resolvePaidProPartyRolesFromAcceptedCorpus,
} from "./paidProAcceptedCorpusPartyRoles";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { definedShortNameFromLegalEntity } from "./paidProAgreementPolish";
import { looksLikeEmail, shouldShowRecipientEmailFormatError, stripRecipientEmailNoise } from "./recipientEmailValidation";
import { isRecipientHandoffSeedDisposable } from "./reviewPlaceholderGuard";
import {
  hasSignerPartyLegalEntityDisplayPollution,
  sanitizeSignerPartyLegalEntityDisplay,
} from "./signerPartyLegalEntityDisplaySanitizer";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import {
  hasPartyMetadataLabelContamination,
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
  isPartyMetadataRoleLabel,
  isPartyMetadataToken,
} from "./paidProPartyNamePreserve";
import { resolveAuthoritativeLegalPartyIdentities } from "./legalPartyIdentityAuthority";
import {
  collapsePartySlotCandidates,
  isInvalidPartySlotLegalEntity,
  partySlotListHasDriftFragments,
  resolveAuthoritativePartySlotCount,
  selectAuthoritativeTwoPartySlots,
} from "./partySlotIdentityNormalize";
import {
  extractIntakePartyManifestRows,
  findIntakePartyManifestRowForEntity,
  intakePartyManifestIsAuthoritative,
} from "./intakePartyManifestAuthority";

export type SignerIdentitySource =
  | "sot_signature_block"
  | "authoritative_manifest"
  | "intake_manifest"
  | "canonical_resolver"
  | "intake_extract"
  | "draft_party"
  | "handoff"
  | "recipient_ui"
  | "display_fallback";

export type SignerSetupPartyIdentity = {
  legalEntityName: string;
  displayName: string;
  source: SignerIdentitySource;
};

export type ResolveSignerSetupPartyIdentityArgs = {
  partyIndex: number;
  draftPartyName?: string | null;
  recipientDisplayName?: string | null;
  handoffName?: string | null;
  intakeText?: string | null;
  agreementBodyText?: string | null;
  draftPartyNames?: readonly (string | null | undefined)[] | null;
  /** When false, skips [signer-identity-source] console log (tests). */
  log?: boolean;
};

export type SignerSlotContaminationResult = {
  contaminated: boolean;
  correctedValue: string;
  reason?: "multiple_entities" | "other_slot" | "joined_list";
};

export type SignerSetupRenderSlot = {
  /** Immutable slot-isolated legal entity used by editable legal entity input and manifests. */
  canonicalLegalEntity: string;
  /** Compact UI-only label for chips, cards, and headers. */
  compactDisplayLabel: string;
  /** Mutable signer metadata, never a legal entity source. */
  persistedSignerMetadata: {
    email?: string;
    signerName?: string;
    signerTitle?: string;
    partyAddress?: string;
  };
};

export type PaidProSignerDetailsBlocker = {
  partyIndex: number;
  field: "legal_entity" | "signer_name" | "email";
  reason: "missing" | "invalid_email";
};

export type PaidProSignerDetailsGate = {
  complete: boolean;
  requiredCount: number;
  legalEntityNames: string[];
  blockers: PaidProSignerDetailsBlocker[];
  blockerMessage: string;
  /** `data-claw-recipient-field` key of the first incomplete required signer field. */
  firstIncompleteFieldKey: string | null;
  /** Primary CTA label describing the NEXT action (not the current screen). */
  ctaLabel: string;
};

export const PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA = "Complete signer details";
/** Green CTA on inline signer setup — finalizes metadata and opens review/decision, not e-sign placement. */
export const PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA =
  "Finalize signer details and continue to review decision";
/** Explicit signing decision on the review/decision screen (sets signaturePreparationRequested). */
export const PAID_PRO_PREPARE_ESIGN_DECISION_CTA = "Prepare for signing";

/** Dashboard Complete signer details resume — sticky footer while metadata is incomplete. */
export const DASHBOARD_SIGNER_SETUP_RESUME_INCOMPLETE_CTA = "Save signer details";
/** Dashboard Complete signer details resume — sticky footer once name/title/email are complete. */
export const DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA = "Continue to signature links";

export function resolveDashboardSignerSetupResumePrimaryCta(args: {
  signerDetailsComplete: boolean;
}): { label: string; action: "guided_continue" | "complete_recipient_details"; reason: string } {
  if (args.signerDetailsComplete) {
    return {
      label: DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
      action: "guided_continue",
      reason: "dashboard_signer_setup_resume_complete",
    };
  }
  return {
    label: DASHBOARD_SIGNER_SETUP_RESUME_INCOMPLETE_CTA,
    action: "complete_recipient_details",
    reason: "dashboard_signer_setup_resume_incomplete",
  };
}

function norm(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (/\.+$/.test(t) && PARTY_ENTITY_SUFFIX_RE.test(t.replace(/\.+$/, ""))) {
    t = t.replace(/\.+$/, "").trim();
  }
  return t;
}

function sanitizeSlotLegalEntityDisplay(
  raw: string,
  partyIndex: number,
  source: string,
): string {
  return sanitizeSignerPartyLegalEntityDisplay(norm(raw), { partyIndex, source });
}

function isDeliberateSignerLegalEntityUserOverride(
  current: string,
  canonical: string,
  slotIndex: number,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): boolean {
  if (!current || current === canonical) return false;
  if (partyLegalNamesMatch(current, canonical)) return false;
  const contamination = detectSignerSlotContamination(slotIndex, current, slotIdentities);
  if (contamination.contaminated) return false;
  if (hasSignerPartyLegalEntityDisplayPollution(canonical)) return true;
  if (!hasLegalEntitySuffix(current)) return false;
  return true;
}

/** Resolved display/persist value for signer legal-entity fields (metadata only — not corpus). */
export function resolveSignerPartyLegalEntityDisplayValue(args: {
  slotIndex: number;
  currentInputValue?: string | null;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  source?: string;
}): string {
  const canonical = sanitizeSlotLegalEntityDisplay(
    safeSignerSlotCanonicalEntity(args.slotIndex, args.slotIdentities),
    args.slotIndex,
    "canonical_slot",
  );
  const current = sanitizeSlotLegalEntityDisplay(
    String(args.currentInputValue ?? ""),
    args.slotIndex,
    args.source || "user_input",
  );
  if (!current) return canonical;
  const contamination = detectSignerSlotContamination(args.slotIndex, current, args.slotIdentities);
  if (contamination.contaminated) {
    const corrected = sanitizeSlotLegalEntityDisplay(
      contamination.correctedValue,
      args.slotIndex,
      "contamination_corrected",
    );
    return corrected || canonical;
  }
  if (isDeliberateSignerLegalEntityUserOverride(current, canonical, args.slotIndex, args.slotIdentities)) {
    return current;
  }
  return canonical || current;
}

function hasLegalEntitySuffix(name: string): boolean {
  return PARTY_ENTITY_SUFFIX_RE.test(norm(name));
}

function countLegalEntitySuffixes(name: string): number {
  return (name.match(new RegExp(PARTY_ENTITY_SUFFIX_RE.source, "gi")) || []).length;
}

/** Opening recital / sentence fragments must never seed signer legal-entity fields. */
const RECITAL_PARTY_NAME_PREFIX_RE =
  /^(?:this\s+(?:mutual\s+[\w\s]+?\s+)?agreement|agreement|entered\s+into|between)\b/i;

const TRAILING_LEGAL_ENTITY_FROM_RECITAL_RE =
  /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\.?\s*$/i;

export function isRecitalSentenceFragmentPartyName(name: string): boolean {
  const t = norm(name);
  if (!t) return false;
  if (RECITAL_PARTY_NAME_PREFIX_RE.test(t)) return true;
  if (/^this agreement is between\b/i.test(t)) return true;
  if (isDisallowedPartyPhrase(t)) return true;
  if (/\bwill\s+(?:sign|provide)\b/i.test(t)) return true;
  if (/\bengagement\s+term\b/i.test(t)) return true;
  return false;
}

function extractLegalEntityFromRecitalPollution(name: string): string {
  const t = norm(name);
  if (!t || !isRecitalSentenceFragmentPartyName(t)) return t;
  const m = t.match(TRAILING_LEGAL_ENTITY_FROM_RECITAL_RE);
  const entity = m ? norm(m[1]) : "";
  if (!entity || isRecitalSentenceFragmentPartyName(entity)) return "";
  return entity;
}

function resolveFallbackSignerSlotLegalEntity(
  slotIndex: number,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): string {
  const bodyText = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText() : "";
  if (bodyText) {
    const roles = resolvePaidProPartyRolesFromAcceptedCorpus(bodyText);
    const rolePick =
      slotIndex === 0
        ? roles.find((r) => r.role === "client")?.legalName
        : slotIndex === 1
          ? roles.find((r) => r.role === "service_provider")?.legalName
          : roles[slotIndex]?.legalName;
    const fromRole = norm(rolePick ?? roles[slotIndex]?.legalName ?? "");
    if (
      fromRole &&
      !isRecitalSentenceFragmentPartyName(fromRole) &&
      !candidateContainsMultipleEntities(fromRole)
    ) {
      return fromRole;
    }
    const signatureEntities = extractSignerEntitiesFromSignatureBlock(bodyText);
    const fromSig = norm(signatureEntities[slotIndex] ?? "");
    if (
      fromSig &&
      !isRecitalSentenceFragmentPartyName(fromSig) &&
      !candidateContainsMultipleEntities(fromSig)
    ) {
      return fromSig;
    }
  }

  const manifestName = norm(
    String(getAuthoritativeAgreementDocument()?.canonicalPartyManifest?.[slotIndex]?.name ?? ""),
  );
  if (
    manifestName &&
    !isRecitalSentenceFragmentPartyName(manifestName) &&
    !candidateContainsMultipleEntities(manifestName)
  ) {
    return manifestName;
  }

  const polluted = norm(slotIdentities[slotIndex]?.legalEntityName ?? "");
  const extracted = extractLegalEntityFromRecitalPollution(polluted);
  if (
    extracted &&
    !isRecitalSentenceFragmentPartyName(extracted) &&
    !candidateContainsMultipleEntities(extracted)
  ) {
    return extracted;
  }

  return "";
}

function safeSignerSlotCanonicalEntity(
  slotIndex: number,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): string {
  const canonical = slotIsolatedCanonicalEntity(slotIndex, slotIdentities);
  if (canonical && !isRecitalSentenceFragmentPartyName(canonical)) return canonical;
  return resolveFallbackSignerSlotLegalEntity(slotIndex, slotIdentities);
}

const signerAutoCorrectAppliedKeys = new Set<string>();

export function clearSignerSetupAutoCorrectLatch(): void {
  signerAutoCorrectAppliedKeys.clear();
}

/** Idempotent auto-correct target — null when no state write is needed. */
export function resolveSignerSetupAutoCorrectTarget(args: {
  slotIndex: number;
  currentRecipientName: string;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  corpusHash?: string | null;
}): string | null {
  const current = norm(args.currentRecipientName);
  const canonical = safeSignerSlotCanonicalEntity(args.slotIndex, args.slotIdentities);
  if (!canonical || isRecitalSentenceFragmentPartyName(canonical)) return null;
  if (current === canonical) return null;
  if (
    isDeliberateSignerLegalEntityUserOverride(
      current,
      canonical,
      args.slotIndex,
      args.slotIdentities,
    )
  ) {
    return null;
  }
  if (
    hasLegalEntitySuffix(current) &&
    !isRecitalSentenceFragmentPartyName(current) &&
    !candidateContainsMultipleEntities(current) &&
    !containsOtherSlotCanonicalLegalEntity(current, args.slotIndex, args.slotIdentities) &&
    partyLegalNamesMatch(current, canonical)
  ) {
    return null;
  }

  let target: string | null = null;
  if (shouldUpgradeRecipientNameToLegalEntity(current, canonical)) {
    target = canonical;
  } else {
    const contamination = detectSignerSlotContamination(
      args.slotIndex,
      current,
      args.slotIdentities,
    );
    if (contamination.contaminated) target = canonical;
  }
  if (!target || isRecitalSentenceFragmentPartyName(target) || current === target) return null;
  const latchKey = `${args.corpusHash ?? ""}|${args.slotIndex}|${target}`;
  if (signerAutoCorrectAppliedKeys.has(latchKey)) return null;
  signerAutoCorrectAppliedKeys.add(latchKey);
  return target;
}

export function isShortPrefixOfFullLegal(shortName: string, fullLegalName: string): boolean {
  const short = norm(shortName).toLowerCase();
  const full = norm(fullLegalName).toLowerCase();
  if (!short || !full || short === full) return false;
  if (isRecitalSentenceFragmentPartyName(short) || isRecitalSentenceFragmentPartyName(full)) {
    return false;
  }
  if (full.startsWith(`${short} `)) return true;
  const shortWords = short.split(/\s+/).filter(Boolean);
  const fullWords = full.split(/\s+/).filter(Boolean);
  if (shortWords.length < 1 || shortWords.length >= fullWords.length) return false;
  return shortWords.every((word, index) => fullWords[index] === word);
}

export function compactDisplayNameFromLegalEntity(legalEntityName: string): string {
  const full = norm(legalEntityName);
  if (!full) return "";
  const short = definedShortNameFromLegalEntity(full);
  if (short && short !== full && short.length >= 2) return short;
  if (hasLegalEntitySuffix(full)) {
    const withoutSuffix = full.replace(PARTY_ENTITY_SUFFIX_RE, "").trim();
    if (withoutSuffix.length >= 2) return withoutSuffix;
  }
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]} ${words[1]}`;
  return full;
}

function paidProEmailForIndex(args: ResolvePaidProSignerDetailsGateArgs, index: number): string {
  if (index === 0) return stripRecipientEmailNoise(args.recipient1Email);
  if (index === 1) return stripRecipientEmailNoise(args.recipient2Email);
  return stripRecipientEmailNoise(args.extraPartyReviewEmails[index - 2] ?? "");
}

function paidProLegalEntityForIndex(args: ResolvePaidProSignerDetailsGateArgs, index: number): string {
  const slotIdentities =
    args.signerSetupPartyIdentities ??
    resolveSignerSetupPartyIdentities({
      parties: args.draftPartyNames.map((name) => ({ name })),
      intakeText: args.intakeText,
    });
  const fromRecipient =
    index === 0
      ? args.recipient1Name
      : index === 1
        ? args.recipient2Name
        : args.extraPartyLegalNames?.[index - 2] ?? "";
  return resolveSignerPartyLegalEntityDisplayValue({
    slotIndex: index,
    currentInputValue: fromRecipient,
    slotIdentities,
    source: "signer_details_gate",
  });
}

function partyLabelForBlocker(
  partyIndex: number,
  legalEntityNames: readonly string[],
): string {
  const legal = norm(legalEntityNames[partyIndex] ?? "");
  return legal || `Party ${partyIndex + 1}`;
}

/** `data-claw-recipient-field` key for a given party slot + signer field. */
export function signerDetailsFieldKey(
  partyIndex: number,
  field: PaidProSignerDetailsBlocker["field"],
): string {
  const fieldSuffix =
    field === "legal_entity" ? "name" : field === "signer_name" ? "signer-name" : "email";
  if (partyIndex === 0) return `r1-${fieldSuffix}`;
  if (partyIndex === 1) return `r2-${fieldSuffix}`;
  return `party-${partyIndex}-${fieldSuffix === "name" ? "name" : fieldSuffix}`;
}

function formatPaidProSignerDetailsBlockerMessage(
  blockers: readonly PaidProSignerDetailsBlocker[],
  legalEntityNames: readonly string[],
): string {
  if (!blockers.length) return "";
  const first = blockers[0]!;
  const partyIndex = first.partyIndex;
  const label = partyLabelForBlocker(partyIndex, legalEntityNames);
  const partyBlockers = blockers.filter((b) => b.partyIndex === partyIndex);
  const hasInvalidEmail = partyBlockers.some((b) => b.field === "email" && b.reason === "invalid_email");
  if (first.field === "legal_entity") {
    return `Confirm the legal name for Party ${partyIndex + 1} before adding signer details.`;
  }
  if (hasInvalidEmail) {
    return `Enter a valid signer email for ${label}.`;
  }
  const needsName = partyBlockers.some((b) => b.field === "signer_name");
  const needsEmail = partyBlockers.some((b) => b.field === "email");
  if (needsName && needsEmail) return `Add signer name and email for ${label}.`;
  if (needsName) return `Add a signer name for ${label}.`;
  return `Add a signer email for ${label}.`;
}

export type ResolvePaidProSignerDetailsGateArgs = {
  partyCount: number;
  intakeText?: string | null;
  signerSetupPartyIdentities?: readonly SignerSetupPartyIdentity[];
  draftPartyNames: readonly string[];
  partySignerNames: readonly string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
  extraPartyLegalNames?: readonly string[];
  userExpandedPartyCount?: number;
};

/**
 * Paid Pro signature prep requires human signer metadata; legal entity names are prefilled
 * from canonical party identity and do not count as signer names.
 */
export function resolvePaidProSignerDetailsGate(
  args: ResolvePaidProSignerDetailsGateArgs,
): PaidProSignerDetailsGate {
  const requiredCount = resolveAuthoritativePartySlotCount({
    intakeText: args.intakeText,
    draftPartyNames: args.draftPartyNames,
    rawPartyCount: args.partyCount,
    userExpandedPartyCount: args.userExpandedPartyCount,
  });
  const legalEntityNames: string[] = [];
  const blockers: PaidProSignerDetailsBlocker[] = [];

  for (let i = 0; i < requiredCount; i++) {
    const legal = paidProLegalEntityForIndex(args, i);
    legalEntityNames.push(legal);
    const signerName = norm(args.partySignerNames[i] ?? "");
    const email = paidProEmailForIndex(args, i);
    if (!legal) blockers.push({ partyIndex: i, field: "legal_entity", reason: "missing" });
    if (!signerName) blockers.push({ partyIndex: i, field: "signer_name", reason: "missing" });
    if (!email) {
      blockers.push({ partyIndex: i, field: "email", reason: "missing" });
    } else if (!looksLikeEmail(email)) {
      blockers.push({ partyIndex: i, field: "email", reason: "invalid_email" });
    }
  }

  const complete = blockers.length === 0;
  const visibleBlockers = blockers.filter((blocker) => {
    if (blocker.field !== "email" || blocker.reason !== "invalid_email") return true;
    return shouldShowRecipientEmailFormatError(paidProEmailForIndex(args, blocker.partyIndex));
  });
  const firstBlocker = visibleBlockers[0] ?? null;
  return {
    complete,
    requiredCount,
    legalEntityNames,
    blockers,
    blockerMessage: formatPaidProSignerDetailsBlockerMessage(visibleBlockers, legalEntityNames),
    firstIncompleteFieldKey: firstBlocker
      ? signerDetailsFieldKey(firstBlocker.partyIndex, firstBlocker.field)
      : null,
    ctaLabel: complete
      ? PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA
      : PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  };
}

export type ResolvePaidProInlineSignerSetupMountedArgs = {
  hasAcceptedPaidProAuthority: boolean;
  /** Pipeline corpus accepted by validatePaidProOutput — may mount review before SoT freeze. */
  hasProfessionallyValidatedReviewCorpus?: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createUiStageIsDraft: boolean;
  /** Latched true when the user enters inline signer setup; stays true until Prepare signature links. */
  signerSetupLatched: boolean;
  signaturePreparationRequested: boolean;
  /**
   * TEST576: true once the user finalized signer metadata (authoritative signing snapshot exists or the
   * sticky finalize latch is set). When finalized, inline signer setup must stay unmounted even if a
   * stale `signerSetupLatched` lingers — only "Edit signer details" (which clears the finalize latch)
   * re-mounts it.
   */
  signerMetadataFinalized?: boolean;
  /**
   * Dashboard Complete signer details resume: mount signer fields even when paid review authority /
   * subscription probes are transiently false. Latched setup is the task — not Pro draft recovery.
   */
  forceDashboardSignerSetupResume?: boolean;
};

/**
 * Inline signer setup on the canonical paid Pro final-review shell. Visibility must NOT flip off when
 * the signer-details gate becomes complete — only when the user explicitly proceeds to Prepare signature
 * links (signaturePreparationRequested), finalizes signer metadata, or the latch is cleared on re-entry.
 */
export function resolvePaidProInlineSignerSetupMounted(
  args: ResolvePaidProInlineSignerSetupMountedArgs,
): boolean {
  if (args.signerMetadataFinalized) return false;
  if (
    args.forceDashboardSignerSetupResume &&
    args.signerSetupLatched &&
    args.createUiStageIsDraft &&
    !args.signaturePreparationRequested &&
    !args.premiumRecipientUxActive
  ) {
    return true;
  }
  const reviewAuthority =
    args.hasAcceptedPaidProAuthority || Boolean(args.hasProfessionallyValidatedReviewCorpus);
  return Boolean(
    reviewAuthority &&
      args.premiumPaidDocumentSurface &&
      !args.premiumRecipientUxActive &&
      args.createUiStageIsDraft &&
      args.signerSetupLatched &&
      !args.signaturePreparationRequested,
  );
}

/** Arm the inline signer-setup latch when setup is first shown (details incomplete on accepted SoT). */
export function shouldArmPaidProInlineSignerSetupLatch(args: {
  hasAcceptedPaidProAuthority: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createUiStageIsDraft: boolean;
  simpleProFinalReviewShellActive: boolean;
  paidProSignatureDetailsReady: boolean;
  signaturePreparationRequested: boolean;
  alreadyLatched: boolean;
}): boolean {
  if (args.alreadyLatched) return true;
  return Boolean(
    args.hasAcceptedPaidProAuthority &&
      args.premiumPaidDocumentSurface &&
      !args.premiumRecipientUxActive &&
      args.createUiStageIsDraft &&
      args.simpleProFinalReviewShellActive &&
      !args.paidProSignatureDetailsReady,
  );
}

/** First paid Pro review entry — arm latch until user explicitly finalizes signer metadata. */
export function shouldArmPaidProFirstReviewSignerSetupLatch(args: {
  hasAcceptedPaidProAuthority: boolean;
  hasProfessionallyValidatedReviewCorpus?: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createUiStageIsDraft: boolean;
  firstReviewSurfaceActive: boolean;
  hasCanonicalReviewCorpus: boolean;
  paidProSignatureDetailsReady: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested: boolean;
  alreadyLatched: boolean;
  /**
   * TEST570: the review_ready delivery-track decision (Send for review / Prepare signature links) is
   * available. When true, that decision WINS over signer setup — the inline signer form must NOT
   * auto-arm on first review; it mounts only after the user explicitly chooses Prepare signature
   * links (which arms the latch directly, satisfying `alreadyLatched`).
   */
  deliveryTrackDecisionActive?: boolean;
}): boolean {
  // TEST576: finalize + explicit signing-prep MUST win over a stale `alreadyLatched`. A lingering
  // `paidProInlineSignerSetupLatched` (e.g. from the edit phase) used to short-circuit to `true` here
  // even after the user finalized signer details, which re-armed signer setup and re-emitted
  // `arm_latch signerMetadataFinalized:false`. Once the user has finalized (or moved on to signing
  // prep), signer setup stays disarmed until they explicitly click "Edit signer details" (which clears
  // both the finalize latch and the inline setup latch).
  if (args.signaturePreparationRequested) return false;
  if (args.signerMetadataFinalized) return false;
  // Decision 1 must win over a stale auto-armed latch from the pre-decision render frame.
  if (args.deliveryTrackDecisionActive) return false;
  if (args.alreadyLatched) return true;
  const reviewAuthority =
    args.hasAcceptedPaidProAuthority || Boolean(args.hasProfessionallyValidatedReviewCorpus);
  return Boolean(
    reviewAuthority &&
      args.premiumPaidDocumentSurface &&
      !args.premiumRecipientUxActive &&
      args.createUiStageIsDraft &&
      args.firstReviewSurfaceActive &&
      args.hasCanonicalReviewCorpus,
  );
}

export function logPaidProSignerSetupAutofinalizeDecision(payload: {
  action: "arm_latch" | "skip_latch" | "show_track_chooser" | "hide_track_chooser";
  reason: string;
  intakePrefillComplete: boolean;
  signerMetadataFinalized: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-setup-autofinalize-decision]", payload);
}

/** Legal entity + address prefill from intake manifest — signer name/email may remain blank. */
export function resolvePaidProIntakeLegalEntityAddressPrefillComplete(args: {
  intakeText?: string | null;
  partyCount: number;
  recipient1Name: string;
  recipient2Name: string;
  extraPartyLegalNames?: readonly string[];
  partyAddresses?: readonly string[];
}): boolean {
  if (!intakePartyManifestIsAuthoritative(args.intakeText)) return false;
  const rows = extractIntakePartyManifestRows(args.intakeText);
  const count = Math.max(args.partyCount, rows.length);
  for (let i = 0; i < count; i += 1) {
    const expected = rows[i]?.partyLegalName ?? "";
    const actual =
      i === 0
        ? args.recipient1Name
        : i === 1
          ? args.recipient2Name
          : args.extraPartyLegalNames?.[i - 2] ?? "";
    if (expected && !partyLegalNamesMatch(actual, expected)) return false;
    const expectedAddr = rows[i]?.partyAddress ?? "";
    const actualAddr = args.partyAddresses?.[i] ?? "";
    if (expectedAddr.trim() && !actualAddr.trim()) return false;
  }
  return rows.length >= 2;
}

/**
 * Delivery-track chooser (review decision) on the forced document route.
 *
 * TEST570: the review decision must be shown FIRST — before signer setup — whenever the review_ready
 * delivery-track decision is available (`deliveryTrackDecisionActive`), so the user chooses "Send for
 * review" or "Prepare signature links" up front. It also remains visible post-finalize
 * (`signerMetadataFinalized`). It is hidden while inline signer setup is mounted or signing has been
 * requested.
 */
export function shouldShowPaidProForcedFirstReviewTrackChooser(args: {
  forcedFirstReviewActive: boolean;
  inlineSignerSetupMounted: boolean;
  signerDetailsReady: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested: boolean;
  deliveryTrackDecisionActive?: boolean;
}): boolean {
  if (args.inlineSignerSetupMounted || args.signaturePreparationRequested) return false;
  if (args.deliveryTrackDecisionActive) return true;
  return Boolean(args.forcedFirstReviewActive && args.signerMetadataFinalized);
}

export function logSignerIdentitySource(args: {
  partyIndex: number;
  legalEntityName: string;
  displayName: string;
  source: SignerIdentitySource;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-identity-source]", args);
}

export function logSignerSlotContaminationBlocked(args: {
  slot: number;
  attemptedValue: string;
  correctedValue: string;
  source: string;
  reason?: string;
}): void {
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "signer-slot-contamination-blocked",
      surface: `slot:${args.slot}`,
      hash: args.correctedValue,
      source: args.source,
      payloadSignature: JSON.stringify({
        attemptedValue: args.attemptedValue,
        reason: args.reason ?? null,
      }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[signer-slot-contamination-blocked]", args);
}

export function logIllegalSignerRenderBindingBlocked(args: {
  slot: number;
  attemptedValue: string;
  correctedValue: string;
  source: string;
  reason?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (isRecitalSentenceFragmentPartyName(args.correctedValue)) return;
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "illegal-signer-render-binding-blocked",
      surface: `slot:${args.slot}`,
      hash: args.correctedValue,
      source: args.source,
      payloadSignature: JSON.stringify({
        attemptedValue: args.attemptedValue,
        reason: args.reason ?? null,
      }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[illegal-signer-render-binding-blocked]", args);
}

function looksLikeJoinedPartyList(name: string): boolean {
  const t = norm(name);
  if (!/\band\b/i.test(t)) return false;
  const suffixHits = countLegalEntitySuffixes(t);
  return suffixHits >= 2 || t.length > 72;
}

/**
 * A strong corporate suffix (LLC / Inc / Corp / Ltd / LP / LLP / PLLC) sitting in the INTERIOR of a
 * value (i.e. followed by more words) means two entities were concatenated, e.g.
 * "Blue Canyon Analytics LLC Iron Vale Systems Inc". The shared {@link PARTY_ENTITY_SUFFIX_RE} is
 * `$`-anchored, so `countLegalEntitySuffixes` alone cannot see the leading entity's suffix — this is
 * the actual source of the signer-slot contamination. Weak tokens (Co/Company/Foundation/Trust/
 * Limited) are intentionally excluded to avoid flagging legitimate single names.
 */
const INTERIOR_STRONG_ENTITY_SUFFIX_RE =
  /\s(?:LLC|L\.L\.C\.|Inc|Incorporated|Corp|Corporation|Ltd|LP|L\.P\.|LLP|PLLC)\.?\s+\S/i;

function hasInteriorLegalEntitySuffix(name: string): boolean {
  return INTERIOR_STRONG_ENTITY_SUFFIX_RE.test(norm(name));
}

/** First single legal entity from a possibly-concatenated value (cuts after the first suffix token). */
const FIRST_LEGAL_ENTITY_RE =
  /^.*?\b(?:LLC|L\.L\.C\.|Inc|Incorporated|Corp|Corporation|Ltd|Limited|LP|L\.P\.|LLP|PLLC|Co|Company|Foundation|Trust)\.?(?=\s|$)/i;

function firstSingleLegalEntity(name: string): string {
  const t = norm(name);
  if (!t) return "";
  const m = t.match(FIRST_LEGAL_ENTITY_RE);
  return m ? norm(m[0]) : t;
}

/** Never write concatenated multi-entity names into paid Pro signing corpus. */
export function sanitizeAuthorityPartyLegalName(name: string): string {
  const t = norm(name);
  if (!t) return "";
  if (!candidateContainsMultipleEntities(t)) return t;
  return firstSingleLegalEntity(t);
}

/** True when a line looks like two+ legal entities fused (QA: Blue Canyon…LLC Iron Vale…Inc Analytics LLC). */
export function isFusedOrConcatenatedPartyLegalName(name: string): boolean {
  return candidateContainsMultipleEntities(norm(name));
}

export const QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE =
  "Blue Canyon Analytics LLC Iron Vale Systems Inc Analytics LLC";

export function candidateContainsMultipleEntities(name: string): boolean {
  const t = norm(name);
  if (!t) return false;
  if (looksLikeJoinedPartyList(t)) return true;
  if (hasInteriorLegalEntitySuffix(t)) return true;
  return countLegalEntitySuffixes(t) >= 2;
}

export function containsMultipleCanonicalLegalEntities(
  value: string,
  canonicalNames: readonly string[],
): boolean {
  const v = norm(value);
  if (!v) return false;
  if (candidateContainsMultipleEntities(v)) return true;
  let distinctHits = 0;
  for (const legal of canonicalNames) {
    const n = norm(legal);
    if (n.length < 3) continue;
    if (v.toLowerCase().includes(n.toLowerCase())) distinctHits += 1;
  }
  return distinctHits >= 2;
}

export function containsOtherSlotCanonicalLegalEntity(
  value: string,
  slotIndex: number,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): boolean {
  const v = norm(value).toLowerCase();
  if (!v) return false;
  for (let i = 0; i < slotIdentities.length; i++) {
    if (i === slotIndex) continue;
    const other = norm(slotIdentities[i]?.legalEntityName ?? "").toLowerCase();
    if (other.length >= 3 && v.includes(other)) return true;
  }
  return false;
}

/**
 * Strictly slot-isolated canonical entity for a slot. Hard invariant: the returned value can never
 * contain another slot's canonical entity, and can never be a concatenation of two entities. If the
 * slot identity leaked an adjacent slot's entity, that substring is removed (not merged); if it is
 * still multi-entity, only the first single entity is kept. Never combines / stitches entities.
 */
export function slotIsolatedCanonicalEntity(
  slotIndex: number,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): string {
  let canonical = norm(slotIdentities[slotIndex]?.legalEntityName ?? "");
  if (!canonical) return "";
  for (let i = 0; i < slotIdentities.length; i++) {
    if (i === slotIndex) continue;
    const other = norm(slotIdentities[i]?.legalEntityName ?? "");
    if (other.length < 3 || candidateContainsMultipleEntities(other)) continue;
    if (canonical.toLowerCase() === other.toLowerCase()) continue;
    if (canonical.toLowerCase().includes(other.toLowerCase())) {
      const re = new RegExp(other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      canonical = norm(canonical.replace(re, " "));
    }
  }
  if (candidateContainsMultipleEntities(canonical)) {
    canonical = firstSingleLegalEntity(canonical);
  }
  if (isRecitalSentenceFragmentPartyName(canonical)) {
    const extracted = extractLegalEntityFromRecitalPollution(canonical);
    canonical =
      extracted && !isRecitalSentenceFragmentPartyName(extracted) ? extracted : "";
  }
  return sanitizeSlotLegalEntityDisplay(canonical, slotIndex, "slot_isolated_canonical");
}

export function detectSignerSlotContamination(
  slotIndex: number,
  attemptedValue: string,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): SignerSlotContaminationResult {
  const canonical = safeSignerSlotCanonicalEntity(slotIndex, slotIdentities);
  const current = norm(attemptedValue);
  if (!current) {
    return { contaminated: false, correctedValue: canonical };
  }
  if (hasSignerPartyLegalEntityDisplayPollution(current)) {
    const sanitized = sanitizeSlotLegalEntityDisplay(current, slotIndex, "verb_prefix_contamination");
    return {
      contaminated: true,
      correctedValue: sanitized || canonical,
      reason: "multiple_entities",
    };
  }
  if (isRecitalSentenceFragmentPartyName(current)) {
    return { contaminated: true, correctedValue: canonical, reason: "multiple_entities" };
  }
  if (candidateContainsMultipleEntities(current)) {
    return { contaminated: true, correctedValue: canonical, reason: "multiple_entities" };
  }
  const canonicalNames = slotIdentities.map((s) => s.legalEntityName).filter(Boolean);
  if (containsMultipleCanonicalLegalEntities(current, canonicalNames)) {
    return { contaminated: true, correctedValue: canonical, reason: "multiple_entities" };
  }
  if (containsOtherSlotCanonicalLegalEntity(current, slotIndex, slotIdentities)) {
    return { contaminated: true, correctedValue: canonical, reason: "other_slot" };
  }
  if (looksLikeJoinedPartyList(current)) {
    return { contaminated: true, correctedValue: canonical, reason: "joined_list" };
  }
  return { contaminated: false, correctedValue: current || canonical };
}

const SIG_ROLE_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|PROVIDER|CONTRACTOR|CONSULTANT|COMPANY|VENDOR|CUSTOMER|SUPPLIER|LICENSOR|LICENSEE|DISCLOSING\s+PARTY|RECEIVING\s+PARTY|EMPLOYER|EMPLOYEE|LANDLORD|TENANT|BUYER|SELLER|PARTY(?:\s+(?:\d+|[A-Z]|ONE|TWO|THREE|FOUR|FIVE))?)\s*:?\s*$/i;
const SIG_FIELD_RE =
  /^(?:By|Name|Printed?\s*Name|Print\s*Name|Title|Date|Email|E-?mail|Signature|Signed|Address|Role|Attn|Attention|Contact)\s*[:_]?|^_{3,}|^[_\s]+$/i;
const SIG_ROLE_TAG_TAIL_RE =
  /\s*\(\s*["“]?(?:the\s+)?(?:client|service\s+provider|provider|contractor|consultant|company|vendor|customer|supplier|licensor|licensee|disclosing\s+party|receiving\s+party|employer|employee|landlord|tenant|buyer|seller|party(?:\s+\w+)?)["”]?\s*\)\s*$/i;

/**
 * Extract canonical signer legal entities, in slot order, from the accepted paid Pro SoT signature
 * block (the region at/after "IN WITNESS WHEREOF" or a CLIENT:/SERVICE PROVIDER: heading). This is
 * the authoritative source for signer setup slots: it reflects exactly which parties the Pro document
 * binds, so a stale/duplicated party manifest, draft, or recipient hydration can never collapse
 * Party 2 into Party 1. Returns [] when no real signature region exists (callers then fall back to
 * the manifest, then intake).
 */
export function extractSignerEntitiesFromSignatureBlock(
  bodyText: string | null | undefined,
): string[] {
  const body = String(bodyText ?? "").trim();
  if (body.length < 80) return [];
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const headingIdx = body.search(/\n\s*(?:CLIENT|SERVICE\s+PROVIDER)\s*:?\s*(?:\n|$)/i);
  let start = -1;
  if (witnessIdx >= 0) start = witnessIdx;
  else if (headingIdx >= 0) start = headingIdx;
  if (start < 0) return [];

  const lines = body.slice(start).split("\n");
  const entities: string[] = [];
  const seen = new Set<string>();
  let afterRoleHeading = false;
  for (const raw of lines) {
    const line = norm(String(raw).replace(/^\s*[•\-*]\s*/, "").replace(/^\s*\d+[.)]\s*/, ""));
    if (!line) continue;
    if (/^IN WITNESS WHEREOF\b/i.test(line)) {
      afterRoleHeading = false;
      continue;
    }
    if (SIG_ROLE_HEADING_RE.test(line)) {
      afterRoleHeading = true;
      continue;
    }
    if (SIG_FIELD_RE.test(line)) {
      afterRoleHeading = false;
      continue;
    }
    const inlineParty = line.match(/^PARTY(?:\s+\d+)?\s*:\s*(.+)$/i);
    const candidate = norm(
      (inlineParty ? inlineParty[1] : line).replace(SIG_ROLE_TAG_TAIL_RE, ""),
    );
    if (
      hasPartyMetadataLabelContamination(candidate) ||
      isPartyMetadataRoleLabel(candidate) ||
      isPartyMetadataToken(candidate)
    ) {
      afterRoleHeading = false;
      continue;
    }
    const isEntity =
      candidate.length >= 2 &&
      candidate.length <= 90 &&
      !candidateContainsMultipleEntities(candidate) &&
      (hasLegalEntitySuffix(candidate) || afterRoleHeading);
    afterRoleHeading = false;
    if (!isEntity) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push(candidate);
  }
  return entities;
}

/** Isolated resolver batch — never feeds editable UI state back into canonical resolution. */
export function resolveSignerSetupPartyIdentities(args: {
  parties: readonly { name?: string | null }[];
  intakeText?: string | null;
  agreementBodyText?: string | null;
  handoffSlots?: readonly { name?: string | null }[];
}): SignerSetupPartyIdentity[] {
  const rowNames = args.parties.map((p) => String(p?.name ?? "").trim()).filter(Boolean);
  const authorityIdentities = resolveAuthoritativeLegalPartyIdentities({
    intakeText: args.intakeText,
    draftParties: args.parties.map((p) => ({ name: String(p?.name ?? "") })),
    consumerPartyCount: rowNames.length,
    surface: "signer_setup_party_identities",
  });
  if (authorityIdentities.length >= 2) {
    const draftPartyNames = authorityIdentities.map((a) => a.legalEntityName);
    return authorityIdentities.map((identity, i) =>
      resolveSignerSetupPartyIdentity({
        partyIndex: i,
        draftPartyName: identity.legalEntityName,
        handoffName: args.handoffSlots?.[i]?.name,
        intakeText: args.intakeText,
        agreementBodyText: args.agreementBodyText,
        draftPartyNames,
        recipientDisplayName: "",
        log: false,
      }),
    );
  }
  const hasDrift = partySlotListHasDriftFragments(rowNames);
  const intakeNames = collapsePartySlotCandidates(
    extractBetweenPartyNameList(String(args.intakeText ?? "")),
  );
  const intakeAuthoritative = intakeNames.filter(isAuthoritativeLegalEntityName);
  const collapsedRows = collapsePartySlotCandidates(rowNames);
  const draftPartyNames =
    intakeAuthoritative.length === 2
      ? intakeAuthoritative
      : hasDrift && intakeNames.length >= 2
        ? intakeNames
        : hasDrift && collapsedRows.length >= 2
          ? selectAuthoritativeTwoPartySlots(collapsedRows)
          : rowNames;
  const slotCount = resolveAuthoritativePartySlotCount({
    intakeText: args.intakeText,
    draftPartyNames,
    rawPartyCount: draftPartyNames.length,
  });
  return draftPartyNames.slice(0, slotCount).map((name, i) =>
    resolveSignerSetupPartyIdentity({
      partyIndex: i,
      draftPartyName: name,
      handoffName: args.handoffSlots?.[i]?.name,
      intakeText: args.intakeText,
      agreementBodyText: args.agreementBodyText,
      draftPartyNames,
      recipientDisplayName: "",
      log: false,
    }),
  );
}

function pickBestLegalCandidate(
  candidates: { name: string; source: SignerIdentitySource }[],
): { name: string; source: SignerIdentitySource } | null {
  const usable = candidates
    .map((c) => ({ name: norm(c.name), source: c.source }))
    .filter(
      (c) =>
        c.name.length >= 2 &&
        !isInvalidPartySlotLegalEntity(c.name) &&
        !isDisallowedPartyPhrase(c.name) &&
        !isRecipientHandoffSeedDisposable(c.name) &&
        !looksLikeJoinedPartyList(c.name) &&
        !candidateContainsMultipleEntities(c.name) &&
        !isRecitalSentenceFragmentPartyName(c.name),
    );
  if (usable.length === 0) return null;

  const withSuffix = usable.filter((c) => hasLegalEntitySuffix(c.name));
  const pool = withSuffix.length > 0 ? withSuffix : usable;

  pool.sort((a, b) => {
    const suffixDelta = Number(hasLegalEntitySuffix(b.name)) - Number(hasLegalEntitySuffix(a.name));
    if (suffixDelta !== 0) return suffixDelta;
    return b.name.length - a.name.length;
  });

  const best = pool[0]!;
  const upgraded = pool.find(
    (c) =>
      c.name.length > best.name.length &&
      isShortPrefixOfFullLegal(best.name, c.name) &&
      !candidateContainsMultipleEntities(c.name) &&
      countLegalEntitySuffixes(c.name) <= countLegalEntitySuffixes(best.name),
  );
  return upgraded ?? best;
}

export function resolveSignerSetupPartyIdentity(
  args: ResolveSignerSetupPartyIdentityArgs,
): SignerSetupPartyIdentity {
  const index = args.partyIndex;
  const intakeText = String(args.intakeText ?? "").trim();
  const bodyText = String(args.agreementBodyText ?? "").trim();

  if (intakePartyManifestIsAuthoritative(intakeText)) {
    const manifestRows = extractIntakePartyManifestRows(intakeText);
    const manifestRow = findIntakePartyManifestRowForEntity(manifestRows, "", index);
    if (manifestRow?.partyLegalName) {
      const legalEntityName = sanitizeSlotLegalEntityDisplay(
        manifestRow.partyLegalName,
        index,
        "resolve_signer_identity",
      );
      const displayName = legalEntityName
        ? compactDisplayNameFromLegalEntity(legalEntityName)
        : `Party ${index + 1}`;
      if (args.log !== false) {
        logSignerIdentitySource({
          partyIndex: index,
          legalEntityName,
          displayName,
          source: "intake_manifest",
        });
      }
      return { legalEntityName, displayName, source: "intake_manifest" };
    }
  }

  const candidates: { name: string; source: SignerIdentitySource }[] = [];

  const authoritative = getAuthoritativeAgreementDocument();
  const manifestEntries = authoritative?.canonicalPartyManifest ?? [];
  const manifestName = norm(manifestEntries[index]?.name ?? "");
  if (manifestName) candidates.push({ name: manifestName, source: "authoritative_manifest" });
  // A stale/compact frozen manifest can duplicate one party across both slots. Detect duplication so
  // a distinct per-slot extraction can override it (never collapse two real parties into one).
  const manifestNameDuplicatedAcrossSlots =
    manifestName.length > 0 &&
    manifestEntries.some(
      (p, j) => j !== index && norm(String(p?.name ?? "")).toLowerCase() === manifestName.toLowerCase(),
    );

  const intakeManifestAuthoritative = intakePartyManifestIsAuthoritative(intakeText);
  const starterNames = (args.draftPartyNames ?? [])
    .map((n) => norm(String(n ?? "")))
    .filter((n) => n.length >= 2);

  const records = resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: intakeText || null,
    generatedBody: bodyText || null,
    starterNames,
    source: "signer_setup",
    surface: "signerSetupPartyIdentity",
  });
  const record = records[index];
  if (record?.fullLegalName && !candidateContainsMultipleEntities(record.fullLegalName)) {
    candidates.push({ name: record.fullLegalName, source: "canonical_resolver" });
  }

  const draftName = norm(String(args.draftPartyName ?? ""));
  const draftSlotName = norm(String(args.draftPartyNames?.[index] ?? ""));
  if (draftSlotName && !candidateContainsMultipleEntities(draftSlotName)) {
    candidates.push({ name: draftSlotName, source: "draft_party" });
  } else if (draftName && !candidateContainsMultipleEntities(draftName)) {
    candidates.push({ name: draftName, source: "draft_party" });
  }

  const handoffName = norm(String(args.handoffName ?? ""));
  if (handoffName && !candidateContainsMultipleEntities(handoffName)) {
    candidates.push({ name: handoffName, source: "handoff" });
  }

  const recipientName = norm(String(args.recipientDisplayName ?? ""));
  if (recipientName && !candidateContainsMultipleEntities(recipientName)) {
    candidates.push({ name: recipientName, source: "recipient_ui" });
  }

  const picked = pickBestLegalCandidate(candidates);
  let legalEntityName = picked?.name ?? "";
  if (candidateContainsMultipleEntities(legalEntityName)) {
    const slotDraft = norm(String(args.draftPartyNames?.[index] ?? args.draftPartyName ?? ""));
    legalEntityName =
      slotDraft && !candidateContainsMultipleEntities(slotDraft) ? slotDraft : "";
  }
  // Authoritative manifest wins per-slot. pickBestLegalCandidate ranks by suffix+length only, so a
  // longer wrong candidate (e.g. a draft/handoff/recipient slot that duplicated another party's
  // entity) could otherwise override the canonical slot entity and collapse two parties into one.
  // Only a fuller form of the SAME manifest entity may upgrade it (e.g. "Red Mesa" → "Red Mesa
  // Logistics LLC"); a different entity never replaces the canonical slot.
  //
  // EXCEPTION: when the frozen manifest is stale and duplicates this slot's entity across slots
  // (e.g. manifest=[Blue Canyon, Blue Canyon]) while the per-slot canonical extraction yields a
  // DISTINCT real entity (e.g. Iron Vale Systems Inc), trust the distinct extraction so we never
  // collapse two genuinely different parties into Party 1.
  const canonicalSlotEntity =
    record?.fullLegalName && !candidateContainsMultipleEntities(record.fullLegalName)
      ? norm(record.fullLegalName)
      : "";
  const canonicalEntityIsDistinctFromManifest =
    canonicalSlotEntity.length > 0 &&
    hasLegalEntitySuffix(canonicalSlotEntity) &&
    canonicalSlotEntity.toLowerCase() !== manifestName.toLowerCase();
  if (manifestName && !candidateContainsMultipleEntities(manifestName)) {
    const current = norm(legalEntityName);
    if (manifestNameDuplicatedAcrossSlots && canonicalEntityIsDistinctFromManifest) {
      legalEntityName = canonicalSlotEntity;
    } else if (!current || !isShortPrefixOfFullLegal(manifestName, current)) {
      legalEntityName = manifestName;
    }
  }

  // CORE RULE: the accepted paid Pro SoT signature block is the AUTHORITATIVE source for signer slot
  // legal entities. When the SoT binds distinct parties in its signature block, it wins over every
  // other source — a stale/duplicated manifest, draft party, guided state, or recipient hydration can
  // never collapse Party 2 into Party 1 once the document itself names them distinctly.
  const signatureEntities = extractSignerEntitiesFromSignatureBlock(bodyText);
  const signatureSlotEntity = norm(signatureEntities[index] ?? "");
  const signatureEntitiesClean = signatureEntities.filter(
    (entity) =>
      hasLegalEntitySuffix(entity) &&
      !isDisallowedPartyPhrase(entity) &&
      !isInvalidPartySlotLegalEntity(entity) &&
      !candidateContainsMultipleEntities(entity),
  );
  // Never trust signature-block slot order when CLIENT/SERVICE PROVIDER entities disagree with
  // opening recital roles — that reverses signer-form labels relative to the canonical manifest.
  const signatureRolesInverted = detectExecutionBlockRoleInversion(bodyText);
  const signatureBlockAuthoritative =
    !signatureRolesInverted &&
    signatureEntitiesClean.length >= 2 &&
    signatureEntities.length > index &&
    signatureSlotEntity.length >= 2 &&
    hasLegalEntitySuffix(signatureSlotEntity) &&
    !candidateContainsMultipleEntities(signatureSlotEntity) &&
    !isDisallowedPartyPhrase(signatureSlotEntity) &&
    new Set(signatureEntitiesClean.map((e) => e.toLowerCase())).size >= 2;
  if (signatureBlockAuthoritative && !intakeManifestAuthoritative) {
    legalEntityName = signatureSlotEntity;
  } else if (signatureRolesInverted) {
    const roles = resolvePaidProPartyRolesFromAcceptedCorpus(bodyText);
    const rolePick =
      index === 0
        ? roles.find((r) => r.role === "client")?.legalName
        : index === 1
          ? roles.find((r) => r.role === "service_provider")?.legalName
          : roles[index]?.legalName;
    const fromRole = norm(rolePick ?? "");
    if (
      fromRole &&
      !isRecitalSentenceFragmentPartyName(fromRole) &&
      !candidateContainsMultipleEntities(fromRole)
    ) {
      legalEntityName = fromRole;
    }
  }

  if (isRecitalSentenceFragmentPartyName(legalEntityName)) {
    legalEntityName =
      extractLegalEntityFromRecitalPollution(legalEntityName) ||
      canonicalSlotEntity ||
      (signatureSlotEntity && !isRecitalSentenceFragmentPartyName(signatureSlotEntity)
        ? signatureSlotEntity
        : "") ||
      (manifestName && !isRecitalSentenceFragmentPartyName(manifestName) ? manifestName : "") ||
      draftSlotName;
  }
  if (isRecitalSentenceFragmentPartyName(legalEntityName)) {
    legalEntityName = resolveFallbackSignerSlotLegalEntity(index, [
      {
        legalEntityName: canonicalSlotEntity || manifestName || draftSlotName,
        displayName: "",
        source: "display_fallback",
      },
    ]);
  }

  const displayName = legalEntityName
    ? compactDisplayNameFromLegalEntity(legalEntityName)
    : recipientName || handoffName || draftName || `Party ${index + 1}`;
  const source: SignerIdentitySource = signatureBlockAuthoritative
    ? "sot_signature_block"
    : picked?.source ?? "display_fallback";

  legalEntityName = sanitizeSlotLegalEntityDisplay(legalEntityName, index, "resolve_signer_identity");

  if (args.log !== false) {
    logSignerIdentitySource({
      partyIndex: index,
      legalEntityName,
      displayName,
      source,
    });
  }

  return { legalEntityName, displayName, source };
}

/** Editable signer field value — canonical per slot; never another slot or joined summary. */
export function resolveEditableSignerLegalEntityForSlot(args: {
  slotIndex: number;
  currentInputValue: string;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  source?: string;
}): string {
  const canonical = safeSignerSlotCanonicalEntity(args.slotIndex, args.slotIdentities);
  const contamination = detectSignerSlotContamination(
    args.slotIndex,
    args.currentInputValue,
    args.slotIdentities,
  );
  if (contamination.contaminated) {
    logSignerSlotContaminationBlocked({
      slot: args.slotIndex,
      attemptedValue: args.currentInputValue,
      correctedValue: contamination.correctedValue,
      source: args.source || "editable_field",
      reason: contamination.reason,
    });
    return contamination.correctedValue;
  }
  const current = norm(args.currentInputValue);
  if (!canonical) return current;
  if (!current) return canonical;
  if (
    containsOtherSlotCanonicalLegalEntity(current, args.slotIndex, args.slotIdentities) ||
    containsMultipleCanonicalLegalEntities(
      current,
      args.slotIdentities.map((s) => s.legalEntityName),
    )
  ) {
    logSignerSlotContaminationBlocked({
      slot: args.slotIndex,
      attemptedValue: args.currentInputValue,
      correctedValue: canonical,
      source: args.source || "editable_field",
      reason: "other_slot",
    });
    return canonical;
  }
  if (isDeliberateSignerLegalEntityUserOverride(current, canonical, args.slotIndex, args.slotIdentities)) {
    return current;
  }
  return canonical;
}

export function resolveSignerSetupRenderSlot(args: {
  slotIndex: number;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  currentLegalEntityValue?: string | null;
  email?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  partyAddress?: string | null;
  source?: string;
}): SignerSetupRenderSlot {
  const identity = args.slotIdentities[args.slotIndex];
  const canonical = resolveSignerPartyLegalEntityDisplayValue({
    slotIndex: args.slotIndex,
    currentInputValue: args.currentLegalEntityValue,
    slotIdentities: args.slotIdentities,
    source: args.source || "signer_setup_render",
  });
  const current = norm(String(args.currentLegalEntityValue ?? ""));
  if (canonical && current && current !== canonical) {
    const contamination = detectSignerSlotContamination(
      args.slotIndex,
      current,
      args.slotIdentities,
    );
    if (
      contamination.contaminated ||
      containsOtherSlotCanonicalLegalEntity(current, args.slotIndex, args.slotIdentities)
    ) {
      logIllegalSignerRenderBindingBlocked({
        slot: args.slotIndex,
        attemptedValue: current,
        correctedValue: canonical,
        source: args.source || "signer_setup_render",
        reason: contamination.reason || "render_binding_mismatch",
      });
    }
  }
  return {
    canonicalLegalEntity: canonical,
    compactDisplayLabel:
      (canonical && compactDisplayNameFromLegalEntity(canonical)) || identity?.displayName?.trim() || "",
    persistedSignerMetadata: {
      email: norm(String(args.email ?? "")) || undefined,
      signerName: norm(String(args.signerName ?? "")) || undefined,
      signerTitle: norm(String(args.signerTitle ?? "")) || undefined,
      partyAddress: norm(String(args.partyAddress ?? "")) || undefined,
    },
  };
}

export function assertEditableSignerRenderValueInvariant(args: {
  slotIndex: number;
  renderedValue: string;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  source: string;
}): void {
  const canonical = safeSignerSlotCanonicalEntity(args.slotIndex, args.slotIdentities);
  const rendered = norm(args.renderedValue);
  if (canonical && rendered !== canonical) {
    throw new Error(
      `[editable-signer-render-invariant] slot=${args.slotIndex} source=${args.source}`,
    );
  }
  if (containsOtherSlotCanonicalLegalEntity(rendered, args.slotIndex, args.slotIdentities)) {
    throw new Error(
      `[editable-signer-render-cross-slot] slot=${args.slotIndex} source=${args.source}`,
    );
  }
}

export function assertSignerSlotLegalEntityForPersist(args: {
  slotIndex: number;
  attemptedValue: string;
  slotIdentities: readonly SignerSetupPartyIdentity[];
  source: string;
}): string {
  const sanitized = resolveEditableSignerLegalEntityForSlot({
    slotIndex: args.slotIndex,
    currentInputValue: args.attemptedValue,
    slotIdentities: args.slotIdentities,
    source: args.source,
  });
  const attempted = norm(args.attemptedValue);
  const clean = norm(sanitized);
  if (attempted && attempted !== clean) {
    const contamination = detectSignerSlotContamination(
      args.slotIndex,
      args.attemptedValue,
      args.slotIdentities,
    );
    if (contamination.contaminated) {
      const isTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
      const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
      if (isTest || isDev) {
        throw new Error(
          `[signer-slot-contamination-persist] slot=${args.slotIndex} source=${args.source}`,
        );
      }
    }
  }
  return sanitized;
}

/** True when UI/handoff short label should be upgraded to canonical legal entity on hydrate. */
export function shouldUpgradeRecipientNameToLegalEntity(
  currentName: string,
  legalEntityName: string,
): boolean {
  const current = norm(currentName);
  const legal = norm(legalEntityName);
  if (!legal || isRecitalSentenceFragmentPartyName(legal)) return false;
  if (!current) return true;
  if (hasSignerPartyLegalEntityDisplayPollution(current)) return true;
  if (isRecitalSentenceFragmentPartyName(current)) return true;
  if (isRecipientHandoffSeedDisposable(current)) return true;
  if (hasSignerPartyLegalEntityDisplayPollution(legal)) return false;
  if (isShortPrefixOfFullLegal(current, legal)) return true;
  if (candidateContainsMultipleEntities(current)) return true;
  return false;
}

/** Prefer full legal entity for handoff slot `name` (never persist contaminated joined names). */
export function resolveLegalEntityNameForHandoffSlot(args: {
  partyIndex: number;
  currentSlotName?: string | null;
  draftPartyName?: string | null;
  recipientDisplayName?: string | null;
  intakeText?: string | null;
  agreementBodyText?: string | null;
  draftPartyNames?: readonly (string | null | undefined)[] | null;
  slotIdentities?: readonly SignerSetupPartyIdentity[];
}): string {
  const slotIdentities =
    args.slotIdentities ??
    resolveSignerSetupPartyIdentities({
      parties: (args.draftPartyNames ?? []).map((name) => ({ name })),
      intakeText: args.intakeText,
      agreementBodyText: args.agreementBodyText,
    });

  const identity = resolveSignerSetupPartyIdentity({
    partyIndex: args.partyIndex,
    draftPartyName: args.draftPartyName,
    recipientDisplayName: "",
    handoffName: args.currentSlotName,
    intakeText: args.intakeText,
    agreementBodyText: args.agreementBodyText,
    draftPartyNames: args.draftPartyNames,
    log: false,
  });
  const legal = norm(identity.legalEntityName);
  const current = norm(String(args.currentSlotName ?? ""));

  if (!legal) return current;
  if (!current) return legal;

  const contamination = detectSignerSlotContamination(args.partyIndex, current, slotIdentities);
  if (contamination.contaminated) {
    return contamination.correctedValue || legal;
  }

  if (shouldUpgradeRecipientNameToLegalEntity(current, legal)) return legal;

  if (
    containsOtherSlotCanonicalLegalEntity(current, args.partyIndex, slotIdentities) ||
    containsMultipleCanonicalLegalEntities(
      current,
      slotIdentities.map((s) => s.legalEntityName),
    )
  ) {
    return contamination.correctedValue || slotIdentities[args.partyIndex]?.legalEntityName || legal;
  }

  if (norm(current) === norm(legal)) return legal;
  if (hasLegalEntitySuffix(legal) && !hasLegalEntitySuffix(current)) return legal;
  if (isShortPrefixOfFullLegal(current, legal)) return legal;

  return current;
}

export function hydrateLegalEntityNameFromHandoff(
  localName: string,
  handoffName: string,
  legalEntityName?: string,
  slotIdentities?: readonly SignerSetupPartyIdentity[],
  slotIndex?: number,
): string {
  const legal = norm(legalEntityName ?? "");
  const slot =
    slotIndex ?? 0;
  const identities =
    slotIdentities ??
    (legal
      ? [{ legalEntityName: legal, displayName: compactDisplayNameFromLegalEntity(legal), source: "handoff" as const }]
      : []);

  const fromLocal = resolveEditableSignerLegalEntityForSlot({
    slotIndex: slot,
    currentInputValue: localName,
    slotIdentities: identities.length ? identities : [{ legalEntityName: legal, displayName: legal, source: "handoff" }],
    source: "hydrate_local",
  });
  if (fromLocal) return fromLocal;

  const fromHandoff = resolveEditableSignerLegalEntityForSlot({
    slotIndex: slot,
    currentInputValue: handoffName,
    slotIdentities: identities.length ? identities : [{ legalEntityName: legal, displayName: legal, source: "handoff" }],
    source: "hydrate_handoff",
  });
  if (fromHandoff) return fromHandoff;

  return legal;
}
