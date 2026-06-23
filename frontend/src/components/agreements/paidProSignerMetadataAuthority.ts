/**
 * Single authority model for paid Pro signer metadata — live edits, freeze, and snapshot parity.
 */

import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import type { CanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  isIndividualPartyName,
  type CanonicalPartyIdentity,
} from "./guidedDealCompletion/signerPartyIdentity";
import { sanitizeSignerPartyLegalEntityDisplay } from "./signerPartyLegalEntityDisplaySanitizer";
import {
  sanitizeAuthorityPartyLegalName,
  slotIsolatedCanonicalEntity,
  type SignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { stripRecipientEmailNoise } from "./recipientEmailValidation";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import { resolveAcceptedCorpusRoleLabelForLegalName } from "./paidProAcceptedCorpusPartyRoles";
import { labeledPartyBlocksForSignerMetadata } from "./labeledPartyBlockParse";
import {
  authorityPartiesFromIntakeSignerMetadata,
  mergeIntakeSignerMetadataIntoAuthorityParties,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { resolveAuthoritativeLegalPartyIdentities } from "./legalPartyIdentityAuthority";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  fromRecipientMetadata,
  normalizePartyIdentities,
  toPaidProSignerMetadataParties,
  toRecipientMetadata,
} from "./canonicalPartyIdentityModel";


/** Slot-indexed signer metadata from labeled Party N intake blocks. */
export function authorityPartiesFromLabeledPartyIntake(
  intakeText: string | null | undefined,
): PaidProSignerMetadataParty[] {
  return labeledPartyBlocksForSignerMetadata(intakeText ?? "").map((block, partyIndex) => ({
    partyIndex,
    partyLegalName: block.legalEntity,
    signerEmail: block.signerEmail,
    signerTitle: block.signerTitle,
    signerName: block.signerName,
    partyAddress: block.address,
  }));
}

/** Preserve slot-index consumed signer metadata when intake merge would blank legal names or contact fields. */
export function preserveSlotIndexedSignerMetadataParties(
  merged: readonly PaidProSignerMetadataParty[],
  source: readonly PaidProSignerMetadataParty[],
  maxSlots?: number,
): PaidProSignerMetadataParty[] {
  const max = Math.max(merged.length, source.length);
  const cap = maxSlots != null && maxSlots >= 2 ? Math.min(max, maxSlots) : max;
  const out: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < cap; i++) {
    const slot = merged[i];
    const auth = source.find((p) => (p.partyIndex ?? 0) === i) ?? source[i];
    if (!auth && slot) {
      out.push({ ...slot, partyIndex: i });
      continue;
    }
    if (!slot && auth) {
      out.push({ ...auth, partyIndex: i });
      continue;
    }
    if (!slot || !auth) continue;
    out.push({
      partyIndex: i,
      partyLegalName: resolveAuthorityPartyLegalNameField(
        slot.partyLegalName.trim() || auth.partyLegalName.trim(),
        "",
      ) || resolveAuthorityPartyLegalNameField(auth.partyLegalName.trim(), ""),
      signerEmail: slot.signerEmail.trim() || auth.signerEmail.trim(),
      signerName: slot.signerName.trim() || auth.signerName.trim(),
      signerTitle: slot.signerTitle.trim() || auth.signerTitle.trim(),
      partyAddress: slot.partyAddress.trim() || auth.partyAddress.trim(),
    });
  }
  return out;
}

/** Merge labeled intake authority into review parties — slot index is authoritative; UI fills gaps only. */
export function mergeLabeledPartyAuthorityIntoParties(
  parties: readonly PaidProSignerMetadataParty[],
  intakeText?: string | null,
  legalEntities?: readonly string[],
): PaidProSignerMetadataParty[] {
  const intakeParties = authorityPartiesFromIntakeSignerMetadata(
    intakeText,
    legalEntities?.length
      ? legalEntities
      : parties.map((p) => p.partyLegalName).filter(Boolean),
  );
  if (intakeParties.length >= 2 && !parties.length) {
    return intakeParties;
  }
  const normalized = normalizePartyIdentities({
    intakeText,
    authorityParties: parties.length ? parties : intakeParties,
  });
  if (normalized.length < 2 && parties.length >= 2) {
    return mergeIntakeSignerMetadataIntoAuthorityParties(
      parties,
      intakeText,
      legalEntities ?? parties.map((p) => p.partyLegalName),
    );
  }
  const merged = toPaidProSignerMetadataParties(normalized) as PaidProSignerMetadataParty[];
  if (!parties.length) return merged;
  const slotMerged = preserveSlotIndexedSignerMetadataParties(merged, parties);
  return mergeIntakeSignerMetadataIntoAuthorityParties(
    slotMerged,
    intakeText,
    legalEntities ?? slotMerged.map((p) => p.partyLegalName),
  );
}

export function labeledPartyIntakeHasHydratableExecutionFields(intakeText?: string | null): boolean {
  return authorityPartiesFromLabeledPartyIntake(intakeText).some(
    (p) =>
      p.signerName.trim() ||
      p.signerTitle.trim() ||
      p.signerEmail.trim() ||
      p.partyAddress.trim(),
  );
}

export type PaidProPartyRoleContext = {
  intakeText?: string | null;
  draftPartyNames?: readonly string[] | null;
  /** Accepted Pro corpus — opening recital role parentheticals override slot index. */
  acceptedCorpus?: string | null;
};

function normalizedLegalNameKey(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, "");
}

export function partyLegalNamesMatch(a: string, b: string): boolean {
  const na = normalizedLegalNameKey(a);
  const nb = normalizedLegalNameKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

function resolveIntakeRoleLabelForLegalName(
  legalName: string,
  context?: PaidProPartyRoleContext | null,
): string | null {
  const intake = (context?.intakeText ?? "").trim();
  if (!intake) return null;
  const records = resolveCanonicalPartyIdentitiesFromIntake(intake, context?.draftPartyNames ?? null);
  const hit = records.find((rec) => partyLegalNamesMatch(legalName, rec.fullLegalName));
  return hit?.roleLabel?.trim() || null;
}

function resolveRoleLabelForAuthorityParty(
  legalName: string,
  partyIndex: number,
  context?: PaidProPartyRoleContext | null,
): string {
  const corpusRole = resolveAcceptedCorpusRoleLabelForLegalName(
    legalName,
    context?.acceptedCorpus ?? null,
  );
  if (corpusRole) return corpusRole;
  const intakeRole = resolveIntakeRoleLabelForLegalName(legalName, context);
  if (intakeRole) return intakeRole;
  return displayRoleLabelFromRoleLabel("", partyIndex);
}

function blockHeadingFromRoleLabel(roleLabel: string, partyIndex: number): string {
  const r = roleLabel.trim().toLowerCase();
  if (r === "client" || r === "buyer" || r === "customer" || r === "purchaser") {
    return r.toUpperCase();
  }
  if (r === "vendor" || r === "supplier" || r === "contractor" || r === "consultant" || r === "agency") {
    return r.toUpperCase();
  }
  if (r.includes("service") && r.includes("provider")) return "SERVICE PROVIDER";
  if (r.includes("analytics") && r.includes("provider")) return "ANALYTICS PROVIDER";
  if (partyIndex === 0) return "CLIENT";
  if (partyIndex === 1) return "SERVICE PROVIDER";
  return roleLabel.trim().toUpperCase() || `PARTY ${partyIndex + 1}`;
}

/** True when execution blocks must use legal-entity headings (3+ finalized authority parties). */
export function shouldUseAuthorityEntityExecutionHeadings(
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  if (parties.length < 3) return false;
  return parties.every((p) => sanitizeAuthorityPartyLegalName(p.partyLegalName).length >= 2);
}

/** Execution-block heading from frozen authority — legal entity uppercase for N-party flows. */
export function authorityExecutionBlockHeading(party: PaidProSignerMetadataParty): string {
  return sanitizeAuthorityPartyLegalName(party.partyLegalName).toUpperCase();
}

function manifestRoleFromRoleLabel(
  roleLabel: string,
  partyIndex: number,
): "client" | "service_provider" | `party_${number}` {
  const r = roleLabel.trim().toLowerCase();
  if (r === "client") return "client";
  if (r.includes("service") && r.includes("provider")) return "service_provider";
  return partyIndex === 0 ? "client" : partyIndex === 1 ? "service_provider" : (`party_${partyIndex + 1}` as const);
}

function displayRoleLabelFromRoleLabel(roleLabel: string, partyIndex: number): string {
  const r = roleLabel.trim().toLowerCase();
  if (r === "client") return "Client";
  if (r.includes("service") && r.includes("provider")) return "Service Provider";
  return roleLabel.trim() || `Party ${partyIndex + 1}`;
}

/** Role label for notice blocks — intake/recital wins over recipient slot index. */
export function partyDisplayRoleLabelForAuthorityParty(
  party: PaidProSignerMetadataParty,
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const legal = sanitizeAuthorityPartyLegalName(party.partyLegalName);
  return resolveRoleLabelForAuthorityParty(legal, party.partyIndex, roleContext);
}

export const PAID_PRO_SIGNER_METADATA_FIELDS = [
  "partyLegalName",
  "signerEmail",
  "signerName",
  "signerTitle",
  "partyAddress",
] as const;

export type PaidProSignerMetadataField = (typeof PAID_PRO_SIGNER_METADATA_FIELDS)[number];

export type PaidProSignerMetadataParty = {
  partyIndex: number;
  partyLegalName: string;
  signerEmail: string;
  signerName: string;
  signerTitle: string;
  partyAddress: string;
};

export type PaidProSignerMetadataAuthoritySource =
  | "live_ui"
  | "authoritative_snapshot"
  | "authoritative_write"
  | "server_full_draft";

export type PaidProSignerMetadataAuthority = {
  parties: PaidProSignerMetadataParty[];
  source: PaidProSignerMetadataAuthoritySource;
  hash: string;
  updatedAt: number;
};

export type LiveSignerMetadataUiState = {
  partyCount: number;
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
  /** Legal entity names for party indices 2+ (agreement order). */
  extraPartyLegalNames?: readonly string[];
  partySignerNames: readonly string[];
  partySignerTitles: readonly string[];
  partyAddresses: readonly string[];
};

export type SignerMetadataLifecycleEvent =
  | "metadata-input-change"
  | "authoritative-write"
  | "metadata-freeze"
  | "cta-evaluation";

const LEGACY_PAID_PRO_SIGNER_CTA_REASONS = new Set([
  "continue_to_recipients",
  "premium_continue_to_signers",
  "guided_final_review_hidden",
]);

let consumedLiveAuthority: PaidProSignerMetadataAuthority | null = null;

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function partyLegalNameForIndex(ui: LiveSignerMetadataUiState, index: number): string {
  if (index === 0) return norm(ui.recipient1Name);
  if (index === 1) return norm(ui.recipient2Name);
  return norm(ui.extraPartyLegalNames?.[index - 2]);
}

function fillPartyLegalNamesFromFrozenManifestAndIntake(
  parties: PaidProSignerMetadataParty[],
  opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] },
): PaidProSignerMetadataParty[] {
  const frozen = readFrozenCanonicalManifestPartyNames();
  const intakeRecords = (opts?.intakeText ?? "").trim()
    ? resolveCanonicalPartyIdentitiesFromIntake(opts!.intakeText!, opts?.draftPartyNames ?? null)
    : [];
  return parties.map((party, i) => {
    const resolved =
      party.partyLegalName.trim() ||
      frozen[i]?.trim() ||
      intakeRecords[i]?.fullLegalName?.trim() ||
      "";
    if (resolved.length < 2 || resolved === party.partyLegalName) return party;
    return {
      ...party,
      partyLegalName: sanitizeSignerPartyLegalEntityDisplay(resolved, {
        partyIndex: i,
        source: "metadata_authority",
      }),
    };
  });
}

function signerEmailForIndex(ui: LiveSignerMetadataUiState, index: number): string {
  if (index === 0) return stripRecipientEmailNoise(ui.recipient1Email);
  if (index === 1) return stripRecipientEmailNoise(ui.recipient2Email);
  return stripRecipientEmailNoise(ui.extraPartyReviewEmails[index - 2] ?? "");
}

export function buildPaidProSignerMetadataParties(
  ui: LiveSignerMetadataUiState,
  opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] },
): PaidProSignerMetadataParty[] {
  const authorityIdentities = resolveAuthoritativeLegalPartyIdentities({
    intakeText: opts?.intakeText,
    draftPartyNames: opts?.draftPartyNames,
    consumerPartyCount: ui.partyCount,
    surface: "metadata_authority_parties",
  });
  const count =
    authorityIdentities.length >= 2
      ? authorityIdentities.length
      : consumeAuthoritativeSignerCount(
          "metadata_authority_parties",
          {
            intakeText: opts?.intakeText,
            draftPartyNames: opts?.draftPartyNames,
            rawPartyCount: ui.partyCount,
            userExpandedPartyCount: ui.partyCount,
          },
          ui.partyCount,
        );
  const parties: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < count; i++) {
    const authorityLegal = authorityIdentities[i]?.legalEntityName ?? "";
    const uiLegal = partyLegalNameForIndex(ui, i);
    const resolvedLegal = authorityLegal || uiLegal;
    parties.push({
      partyIndex: i,
      partyLegalName: sanitizeSignerPartyLegalEntityDisplay(resolvedLegal, {
        partyIndex: i,
        source: "metadata_authority",
      }),
      signerEmail: signerEmailForIndex(ui, i),
      signerName: norm(ui.partySignerNames[i]),
      signerTitle: norm(ui.partySignerTitles[i]),
      partyAddress: norm(ui.partyAddresses[i]),
    });
  }
  const filled = fillPartyLegalNamesFromFrozenManifestAndIntake(parties, opts);
  return mergeIntakeSignerMetadataIntoAuthorityParties(
    filled,
    opts?.intakeText,
    filled.map((p) => p.partyLegalName),
  );
}

export function hashPaidProSignerMetadataAuthority(
  parties: readonly PaidProSignerMetadataParty[],
): string {
  const payload = JSON.stringify(
    parties.map((p) => ({
      i: p.partyIndex,
      legal: p.partyLegalName,
      email: p.signerEmail,
      name: p.signerName,
      title: p.signerTitle,
      address: p.partyAddress,
    })),
  );
  return hashPaidProCorpus(payload) || fingerprintAgreementBody(payload);
}

/** Reverse map consumed/snapshot authority parties into inline signer-setup React state. */
export function authorityPartiesToLiveSignerMetadataUi(
  parties: readonly PaidProSignerMetadataParty[],
): LiveSignerMetadataUiState {
  const authoritativeCount = parties.filter((p) =>
    resolveAuthorityPartyLegalNameField(p.partyLegalName, "").length >= 2,
  ).length;
  const count = Math.max(Math.min(parties.length, authoritativeCount >= 2 ? authoritativeCount : parties.length), 2);
  const capped = parties.slice(0, count);
  const padded = [...capped];
  while (padded.length < count) {
    padded.push({
      partyIndex: padded.length,
      partyLegalName: "",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    });
  }
  const p0 = padded[0];
  const p1 = padded[1];
  return {
    partyCount: count,
    recipient1Name: norm(p0?.partyLegalName),
    recipient2Name: norm(p1?.partyLegalName),
    recipient1Email: norm(p0?.signerEmail),
    recipient2Email: norm(p1?.signerEmail),
    extraPartyReviewEmails: padded.slice(2).map((p) => norm(p.signerEmail)),
    extraPartyLegalNames: padded.slice(2).map((p) => norm(p.partyLegalName)),
    partySignerNames: padded.map((p) => norm(p.signerName)),
    partySignerTitles: padded.map((p) => norm(p.signerTitle)),
    partyAddresses: padded.map((p) => norm(p.partyAddress)),
  };
}

/** Seed signer-setup fields when reopening post-finalize review for corrections. */
export function resolvePaidProPostFinalizeSignerDetailsEditSeed(): PaidProSignerMetadataParty[] | null {
  const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  if (consumed.length >= 2) return consumed;
  const snap = buildSnapshotPaidProSignerMetadataAuthority()?.parties ?? [];
  if (snap.length >= 2) return snap;
  return null;
}

export function buildLivePaidProSignerMetadataAuthority(
  ui: LiveSignerMetadataUiState,
  source: PaidProSignerMetadataAuthoritySource = "live_ui",
  opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] },
): PaidProSignerMetadataAuthority {
  const parties = buildPaidProSignerMetadataParties(ui, opts);
  return {
    parties,
    source,
    hash: hashPaidProSignerMetadataAuthority(parties),
    updatedAt: Date.now(),
  };
}

export function recipientMetadataToAuthorityParties(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): PaidProSignerMetadataParty[] {
  return toPaidProSignerMetadataParties(fromRecipientMetadata(meta)) as PaidProSignerMetadataParty[];
}

export function authorityPartiesToRecipientMetadata(
  parties: readonly PaidProSignerMetadataParty[],
  extraEmails: readonly string[] = [],
): AuthoritativeSigningSnapshotRecipientMetadata {
  return toRecipientMetadata(
    normalizePartyIdentities({ authorityParties: parties }),
    extraEmails,
  );
}

export function buildSnapshotPaidProSignerMetadataAuthority(): PaidProSignerMetadataAuthority | null {
  const snap = getAuthoritativeSigningSnapshot();
  if (!snap) return null;
  const parties = recipientMetadataToAuthorityParties(snap.signerMetadata);
  return {
    parties,
    source: "authoritative_snapshot",
    hash: hashPaidProSignerMetadataAuthority(parties),
    updatedAt: snap.frozenAt,
  };
}

/** Promote live UI edits into the consumed authority store (all downstream surfaces read this). */
export function setConsumedPaidProSignerMetadataAuthority(
  authority: PaidProSignerMetadataAuthority,
): void {
  consumedLiveAuthority = authority;
  clearPaidProVisibleRenderMemo();
}

export function clearConsumedPaidProSignerMetadataAuthority(): void {
  consumedLiveAuthority = null;
}

/** Snapshot wins after finalize; otherwise the last promoted live authority. */
export function readConsumedPaidProSignerMetadataAuthority(): PaidProSignerMetadataAuthority | null {
  return buildSnapshotPaidProSignerMetadataAuthority() ?? consumedLiveAuthority;
}

export function readPaidProSignerMetadataFieldFromConsumedAuthority(
  partyIndex: number,
  field: PaidProSignerMetadataField,
): string {
  const party = readConsumedPaidProSignerMetadataAuthority()?.parties[partyIndex];
  if (!party) return "";
  switch (field) {
    case "partyLegalName":
      return party.partyLegalName;
    case "signerEmail":
      return party.signerEmail;
    case "signerName":
      return party.signerName;
    case "signerTitle":
      return party.signerTitle;
    case "partyAddress":
      return party.partyAddress;
    default:
      return "";
  }
}

export function authorityPartiesToCanonicalPartyIdentities(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): CanonicalPartyIdentity[] {
  const slots: SignerSetupPartyIdentity[] = parties.map((p) => ({
    legalEntityName: p.partyLegalName,
    displayName: p.partyLegalName,
    source: "authoritative_manifest",
  }));
  return parties.map((p) => {
    const authorityLegal = sanitizeAuthorityPartyLegalName(p.partyLegalName);
    const legal = authorityLegal || slotIsolatedCanonicalEntity(p.partyIndex, slots);
    const isIndividual = legal ? isIndividualPartyName(legal) : false;
    const roleLabel = resolveRoleLabelForAuthorityParty(legal, p.partyIndex, roleContext);
    const blockHeading = shouldUseAuthorityEntityExecutionHeadings(parties)
      ? authorityExecutionBlockHeading(p)
      : blockHeadingFromRoleLabel(roleLabel, p.partyIndex);
    return {
      index: p.partyIndex,
      partyDisplayName: legal,
      email: p.signerEmail,
      partyAddress: p.partyAddress.trim() || null,
      representativeName: p.signerName.trim() || null,
      title: p.signerTitle.trim() || null,
      blockHeading,
      isIndividual,
    };
  });
}

export function buildCanonicalFinalPartyManifestFromAuthority(
  authority: PaidProSignerMetadataAuthority,
  roleContext?: PaidProPartyRoleContext | null,
): CanonicalFinalPartyManifest {
  return {
    parties: authority.parties.map((p) => {
      const legal = sanitizeAuthorityPartyLegalName(p.partyLegalName);
      const isIndividual = legal ? isIndividualPartyName(legal) : false;
      const roleLabel = resolveRoleLabelForAuthorityParty(legal, p.partyIndex, roleContext);
      const role = manifestRoleFromRoleLabel(roleLabel, p.partyIndex);
      return {
        index: p.partyIndex,
        role,
        partyName: legal,
        email: p.signerEmail,
        signerName: p.signerName.trim() || null,
        signerTitle: p.signerTitle.trim() || null,
        roleLabel,
        signerKind: isIndividual ? ("individual" as const) : ("entity_representative" as const),
        isSenderSide: role === "client",
        isIndividual,
      };
    }),
  };
}

/** VS01 / draft merge input derived from consumed authority (never handoff inference). */
export function readRecipientSetupArraysFromConsumedAuthority(): {
  recipientPartySignerNames: string[];
  recipientPartySignerTitles: string[];
  recipientPartyEmails: string[];
  recipientPartyAddresses: string[];
} | null {
  const auth = readConsumedPaidProSignerMetadataAuthority();
  if (!auth?.parties.length) return null;
  return {
    recipientPartySignerNames: auth.parties.map((p) => p.signerName),
    recipientPartySignerTitles: auth.parties.map((p) => p.signerTitle),
    recipientPartyEmails: auth.parties.map((p) => p.signerEmail),
    recipientPartyAddresses: auth.parties.map((p) => p.partyAddress),
  };
}

export function paidProSignerMetadataForensicLineageEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    Boolean((import.meta.env as { VITE_PAID_PRO_SIGNER_METADATA_DEBUG?: string })?.VITE_PAID_PRO_SIGNER_METADATA_DEBUG)
  );
}

export function assertPreFinalizeSignerMetadataAuthorityParity(
  authority: PaidProSignerMetadataAuthority,
): void {
  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") return;
  for (const party of authority.parties) {
    for (const field of PAID_PRO_SIGNER_METADATA_FIELDS) {
      const v = readPaidProSignerMetadataFieldFromConsumedAuthority(party.partyIndex, field);
      const expected =
        field === "partyLegalName"
          ? party.partyLegalName
          : field === "signerEmail"
            ? party.signerEmail
            : field === "signerName"
              ? party.signerName
              : field === "signerTitle"
                ? party.signerTitle
                : party.partyAddress;
      if (v !== expected) {
        throw new Error(`[signer-authority-parity] party=${party.partyIndex} field=${field}`);
      }
    }
  }
}

export function fingerprintPaidProSignerMetadataAuthority(
  authority: PaidProSignerMetadataAuthority,
): string {
  return authority.hash;
}

export function signerMetadataAuthorityDrifted(
  frozen: PaidProSignerMetadataAuthority,
  live: PaidProSignerMetadataAuthority,
): boolean {
  return frozen.hash !== live.hash;
}

export function isLegacyPaidProSignerCtaReason(reason: string | null | undefined): boolean {
  const r = norm(reason);
  if (!r) return false;
  return LEGACY_PAID_PRO_SIGNER_CTA_REASONS.has(r);
}

export function assertCanonicalPaidProSignerCtaReason(args: {
  reason: string;
  canonicalSignerFlowActive: boolean;
}): string {
  if (!args.canonicalSignerFlowActive) return args.reason;
  if (isLegacyPaidProSignerCtaReason(args.reason)) {
    return "paid_pro_signer_details_required";
  }
  return args.reason;
}

function devLifecycleLogEnabled(): boolean {
  return paidProSignerMetadataForensicLineageEnabled();
}

export function logSignerMetadataLifecycleEvent(
  event: SignerMetadataLifecycleEvent | "snapshot-write",
  payload: Record<string, unknown>,
): void {
  if (!devLifecycleLogEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[paid-pro-signer-audit:${event}]`, payload);
}

export type ApplyPaidProSignerMetadataFieldUpdateArgs = {
  partyIndex: number;
  field: PaidProSignerMetadataField;
  raw: string;
  inputEventKind: "change" | "blur" | "input" | "paste" | "autofill";
  surface: string;
  /** When true, also emit metadata-freeze (session active). */
  sessionActive?: boolean;
};

/** Unified field update diagnostics — every signer field uses this path. */
export function emitPaidProSignerMetadataFieldDiagnostics(
  args: ApplyPaidProSignerMetadataFieldUpdateArgs,
): void {
  logSignerMetadataLifecycleEvent("metadata-input-change", {
    field: args.field,
    partyIndex: args.partyIndex,
    inputEventKind: args.inputEventKind,
    surface: args.surface,
    rawLen: args.raw.length,
  });
  if (args.sessionActive) {
    logSignerMetadataLifecycleEvent("metadata-freeze", {
      field: args.field,
      partyIndex: args.partyIndex,
      inputEventKind: args.inputEventKind,
      surface: args.surface,
    });
  }
}

export function emitPaidProSignerMetadataAuthoritativeWrite(payload: Record<string, unknown>): void {
  logSignerMetadataLifecycleEvent("authoritative-write", payload);
}

export function emitPaidProSignerMetadataCtaEvaluation(payload: Record<string, unknown>): void {
  logSignerMetadataLifecycleEvent("cta-evaluation", payload);
}

/** Parity check: live authority matches snapshot authority (post-finalize invariant). */
export function paidProSignerMetadataParity(args: {
  live: PaidProSignerMetadataAuthority;
  snapshot: PaidProSignerMetadataAuthority | null;
}): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (!args.snapshot) {
    mismatches.push("missing_snapshot");
    return { ok: false, mismatches };
  }
  if (args.live.hash !== args.snapshot.hash) {
    mismatches.push("hash");
  }
  const max = Math.max(args.live.parties.length, args.snapshot.parties.length);
  for (let i = 0; i < max; i++) {
    const l = args.live.parties[i];
    const s = args.snapshot.parties[i];
    if (!l || !s) {
      mismatches.push(`party_${i}_missing`);
      continue;
    }
    for (const field of PAID_PRO_SIGNER_METADATA_FIELDS) {
      const lk = field === "partyLegalName" ? l.partyLegalName : field === "signerEmail" ? l.signerEmail : field === "signerName" ? l.signerName : field === "signerTitle" ? l.signerTitle : l.partyAddress;
      const sk = field === "partyLegalName" ? s.partyLegalName : field === "signerEmail" ? s.signerEmail : field === "signerName" ? s.signerName : field === "signerTitle" ? s.signerTitle : s.partyAddress;
      if (lk !== sk) mismatches.push(`${field}@party${i}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
