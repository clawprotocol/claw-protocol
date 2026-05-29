/**
 * Signer setup / recipient metadata: full legal entity names vs compact display labels.
 * Priority: authoritative manifest → canonical resolver → intake extract → draft → UI/handoff.
 */

import { getAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import {
  PARTY_ENTITY_SUFFIX_RE,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { definedShortNameFromLegalEntity } from "./paidProAgreementPolish";
import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";
import { isRecipientHandoffSeedDisposable } from "./reviewPlaceholderGuard";

export type SignerIdentitySource =
  | "authoritative_manifest"
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
  /** Primary CTA label: "Continue to final review" when complete, else "Add signer details". */
  ctaLabel: string;
};

export const PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA = "Continue to final review";
export const PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA = "Add signer details";

function norm(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (/\.+$/.test(t) && PARTY_ENTITY_SUFFIX_RE.test(t.replace(/\.+$/, ""))) {
    t = t.replace(/\.+$/, "").trim();
  }
  return t;
}

function hasLegalEntitySuffix(name: string): boolean {
  return PARTY_ENTITY_SUFFIX_RE.test(norm(name));
}

function countLegalEntitySuffixes(name: string): number {
  return (name.match(new RegExp(PARTY_ENTITY_SUFFIX_RE.source, "gi")) || []).length;
}

export function isShortPrefixOfFullLegal(shortName: string, fullLegalName: string): boolean {
  const short = norm(shortName).toLowerCase();
  const full = norm(fullLegalName).toLowerCase();
  if (!short || !full || short === full) return false;
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
  const fromIdentity = norm(args.signerSetupPartyIdentities?.[index]?.legalEntityName ?? "");
  if (fromIdentity) return fromIdentity;
  const fromDraft = norm(args.draftPartyNames[index] ?? "");
  if (fromDraft) return fromDraft;
  if (index === 0) return norm(args.recipient1Name);
  if (index === 1) return norm(args.recipient2Name);
  return "";
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
  signerSetupPartyIdentities?: readonly SignerSetupPartyIdentity[];
  draftPartyNames: readonly string[];
  partySignerNames: readonly string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
};

/**
 * Paid Pro signature prep requires human signer metadata; legal entity names are prefilled
 * from canonical party identity and do not count as signer names.
 */
export function resolvePaidProSignerDetailsGate(
  args: ResolvePaidProSignerDetailsGateArgs,
): PaidProSignerDetailsGate {
  const requiredCount = Math.max(args.partyCount, 2);
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
  const firstBlocker = blockers[0] ?? null;
  return {
    complete,
    requiredCount,
    legalEntityNames,
    blockers,
    blockerMessage: formatPaidProSignerDetailsBlockerMessage(blockers, legalEntityNames),
    firstIncompleteFieldKey: firstBlocker
      ? signerDetailsFieldKey(firstBlocker.partyIndex, firstBlocker.field)
      : null,
    ctaLabel: complete
      ? PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA
      : PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  };
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

function candidateContainsMultipleEntities(name: string): boolean {
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
  return canonical;
}

export function detectSignerSlotContamination(
  slotIndex: number,
  attemptedValue: string,
  slotIdentities: readonly SignerSetupPartyIdentity[],
): SignerSlotContaminationResult {
  const canonical = slotIsolatedCanonicalEntity(slotIndex, slotIdentities);
  const current = norm(attemptedValue);
  if (!current) {
    return { contaminated: false, correctedValue: canonical };
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

/** Isolated resolver batch — never feeds editable UI state back into canonical resolution. */
export function resolveSignerSetupPartyIdentities(args: {
  parties: readonly { name?: string | null }[];
  intakeText?: string | null;
  agreementBodyText?: string | null;
  handoffSlots?: readonly { name?: string | null }[];
}): SignerSetupPartyIdentity[] {
  const draftPartyNames = args.parties.map((p) => p?.name);
  return args.parties.map((p, i) =>
    resolveSignerSetupPartyIdentity({
      partyIndex: i,
      draftPartyName: p?.name,
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
        !isRecipientHandoffSeedDisposable(c.name) &&
        !looksLikeJoinedPartyList(c.name) &&
        !candidateContainsMultipleEntities(c.name),
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
  const candidates: { name: string; source: SignerIdentitySource }[] = [];

  const authoritative = getAuthoritativeAgreementDocument();
  const manifestName = norm(authoritative?.canonicalPartyManifest?.[index]?.name ?? "");
  if (manifestName) candidates.push({ name: manifestName, source: "authoritative_manifest" });

  const intakeText = String(args.intakeText ?? "").trim();
  const bodyText = String(args.agreementBodyText ?? "").trim();
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
  const displayName = legalEntityName
    ? compactDisplayNameFromLegalEntity(legalEntityName)
    : recipientName || handoffName || draftName || `Party ${index + 1}`;
  const source: SignerIdentitySource = picked?.source ?? "display_fallback";

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
  const canonical = slotIsolatedCanonicalEntity(args.slotIndex, args.slotIdentities);
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
  // Hard invariant: the rendered legal entity is always the strictly slot-isolated canonical — it can
  // never be another slot's entity or a concatenation, regardless of what the identity/field carried.
  const canonical = slotIsolatedCanonicalEntity(args.slotIndex, args.slotIdentities);
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
  const canonical = slotIsolatedCanonicalEntity(args.slotIndex, args.slotIdentities);
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
  if (!legal) return false;
  if (!current) return true;
  if (isRecipientHandoffSeedDisposable(current)) return true;
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
