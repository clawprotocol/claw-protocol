/**
 * Single authority model for paid Pro signer metadata — live edits, freeze, and snapshot parity.
 */

import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import type { CanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
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
import { isPreservableIntakeRole } from "./canonicalPartyRoleAuthority";
import { resolveAcceptedCorpusRoleLabelForLegalName } from "./paidProAcceptedCorpusPartyRoles";
import {
  isQuadripartiteLabeledPartiesIntake,
  isTripartiteLabeledPartiesIntake,
  labeledPartyBlocksForSignerMetadata,
} from "./labeledPartyBlockParse";
import { normalizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import {
  authorityPartiesFromIntakeSignerMetadata,
  mergeIntakeSignerMetadataIntoAuthorityParties,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { resolveAuthoritativeLegalPartyIdentities } from "./legalPartyIdentityAuthority";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
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

function authorityPartyForLegalEntity(
  legalName: string,
  source: readonly PaidProSignerMetadataParty[],
  slotIndex: number,
): PaidProSignerMetadataParty | undefined {
  const trimmed = legalName.trim();
  if (trimmed) {
    const byName = source.find((p) => partyLegalNamesMatch(p.partyLegalName, trimmed));
    if (byName) return byName;
  }
  return source.find((p) => (p.partyIndex ?? 0) === slotIndex) ?? source[slotIndex];
}

function mergeSignerContactFieldsForLegalEntity(args: {
  slot: PaidProSignerMetadataParty;
  auth: PaidProSignerMetadataParty | undefined;
  source: readonly PaidProSignerMetadataParty[];
  resolvedLegal: string;
}): Pick<
  PaidProSignerMetadataParty,
  "signerEmail" | "signerName" | "signerTitle" | "partyAddress"
> {
  const canonicalAuth =
    args.auth && partyLegalNamesMatch(args.auth.partyLegalName, args.resolvedLegal)
      ? args.auth
      : authorityPartyForLegalEntity(args.resolvedLegal, args.source, args.slot.partyIndex ?? 0);
  if (canonicalAuth) {
    return {
      signerEmail: canonicalAuth.signerEmail.trim() || args.slot.signerEmail.trim(),
      signerName: canonicalAuth.signerName.trim() || args.slot.signerName.trim(),
      signerTitle: canonicalAuth.signerTitle.trim() || args.slot.signerTitle.trim(),
      partyAddress: canonicalAuth.partyAddress.trim() || args.slot.partyAddress.trim(),
    };
  }
  return {
    signerEmail: args.slot.signerEmail.trim(),
    signerName: args.slot.signerName.trim(),
    signerTitle: args.slot.signerTitle.trim(),
    partyAddress: args.slot.partyAddress.trim(),
  };
}

/** Preserve consumed signer metadata — legal entity is canonical; contact fields bind by entity match. */
export function preserveSlotIndexedSignerMetadataParties(
  merged: readonly PaidProSignerMetadataParty[],
  source: readonly PaidProSignerMetadataParty[],
  maxSlots?: number,
): PaidProSignerMetadataParty[] {
  const max = Math.max(merged.length, source.length);
  const cap = maxSlots != null && maxSlots >= 2 ? Math.min(max, maxSlots) : max;
  const out: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < cap; i++) {
    const slot = merged.find((p) => (p.partyIndex ?? 0) === i) ?? merged[i];
    const slotLegal = resolveAuthorityPartyLegalNameField(slot?.partyLegalName ?? "", "");
    const auth = authorityPartyForLegalEntity(slotLegal, source, i);
    if (!auth && slot) {
      out.push({ ...slot, partyIndex: i });
      continue;
    }
    if (!slot && auth) {
      out.push({ ...auth, partyIndex: i });
      continue;
    }
    if (!slot || !auth) continue;
    const resolvedLegal =
      resolveAuthorityPartyLegalNameField(slot.partyLegalName.trim() || auth.partyLegalName.trim(), "") ||
      resolveAuthorityPartyLegalNameField(auth.partyLegalName.trim(), "");
    const contact = mergeSignerContactFieldsForLegalEntity({
      slot,
      auth,
      source,
      resolvedLegal,
    });
    out.push({
      partyIndex: i,
      partyLegalName: resolvedLegal,
      ...contact,
    });
  }
  return out;
}

/** Hydrate signer contact fields from structured draft party rows when authority slots are still blank. */
export function mergeDraftSignerContactFieldsOntoParties(
  parties: readonly PaidProSignerMetadataParty[],
  draft?: ParsedDraftShape | null,
): PaidProSignerMetadataParty[] {
  const draftParties = draft?.parties ?? [];
  if (!draftParties.length) return [...parties];
  return parties.map((party) => {
    const byIndex = draftParties[party.partyIndex] as {
      name?: string;
      email?: string;
      signerEmail?: string;
      partyAddress?: string;
      address?: string;
      signerName?: string;
      signerTitle?: string;
    } | undefined;
    const byName = draftParties.find(
      (p: { name?: string }) =>
        String(p.name ?? "").trim().toLowerCase() ===
        party.partyLegalName.trim().toLowerCase(),
    ) as typeof byIndex;
    const draftParty = byIndex?.name?.trim() ? byIndex : byName;
    if (!draftParty) return party;
    // ParsedDraftShape parties carry the contact email under `email` (see intakeSmartDefaults);
    // read `signerEmail` too for callers that already pass metadata-shaped parties. Reading only
    // `signerEmail` here silently dropped the draft email, so rebuilt notice stanzas emitted
    // `Attn:`/`Address:` but no `Email:` line (TEST392 / TEST546 blank-review root cause).
    const email = String(draftParty.signerEmail ?? draftParty.email ?? "").trim();
    const address = String(draftParty.partyAddress ?? draftParty.address ?? "").trim();
    const signerName = String(draftParty.signerName ?? "").trim();
    const signerTitle = String(draftParty.signerTitle ?? "").trim();
    return {
      ...party,
      signerEmail: party.signerEmail.trim() || email,
      partyAddress: party.partyAddress.trim() || address,
      signerName: party.signerName.trim() || signerName,
      signerTitle: party.signerTitle.trim() || signerTitle,
    };
  });
}

/** Intake / draft canonical names when slot parties lack authoritative legal entities. */
function resolveMergeLegalEntitiesForPartyAuthority(
  parties: readonly PaidProSignerMetadataParty[],
  intakeText?: string | null,
  legalEntities?: readonly string[],
): string[] {
  const explicit = (legalEntities ?? [])
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length >= 2);
  if (explicit.filter(isAuthoritativeLegalEntityName).length >= 2) return explicit;

  const fromParties = parties
    .map((p) => p.partyLegalName.trim())
    .filter((n) => n.length >= 2);
  if (fromParties.filter(isAuthoritativeLegalEntityName).length >= 2) return fromParties;

  const intake = (intakeText ?? "").trim();
  if (intake) {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      intake,
      fromParties.length ? fromParties : parties.map((p) => p.partyLegalName),
    );
    if (records.length >= 2) return records.map((r) => r.fullLegalName);
  }
  return explicit.length ? explicit : fromParties;
}

/** Merge labeled intake authority into review parties — slot index is authoritative; UI fills gaps only. */
export function mergeLabeledPartyAuthorityIntoParties(
  parties: readonly PaidProSignerMetadataParty[],
  intakeText?: string | null,
  legalEntities?: readonly string[],
): PaidProSignerMetadataParty[] {
  const resolvedLegalEntities = resolveMergeLegalEntitiesForPartyAuthority(
    parties,
    intakeText,
    legalEntities,
  );
  const intakeParties = authorityPartiesFromIntakeSignerMetadata(
    intakeText,
    resolvedLegalEntities.length ? resolvedLegalEntities : parties.map((p) => p.partyLegalName).filter(Boolean),
  );
  if (intakeParties.length >= 2 && !parties.length) {
    return intakeParties;
  }
  if (
    parties.length >= 2 &&
    parties.filter((p) => isAuthoritativeLegalEntityName(p.partyLegalName.trim())).length < 2 &&
    resolvedLegalEntities.filter(isAuthoritativeLegalEntityName).length >= 2
  ) {
    return mergeIntakeSignerMetadataIntoAuthorityParties(
      parties,
      intakeText,
      resolvedLegalEntities,
    );
  }
  const normalized = normalizePartyIdentities({
    intakeText,
    authorityParties: parties.length ? parties : intakeParties,
  });
  if (normalized.length < 2 && parties.length >= 2) {
    return mergeIntakeSignerMetadataIntoAuthorityParties(
      parties,
      intakeText,
      resolvedLegalEntities,
    );
  }
  const merged = toPaidProSignerMetadataParties(normalized) as PaidProSignerMetadataParty[];
  if (!parties.length) return merged;
  const slotMerged = preserveSlotIndexedSignerMetadataParties(merged, parties);
  return mergeIntakeSignerMetadataIntoAuthorityParties(
    slotMerged,
    intakeText,
    resolveMergeLegalEntitiesForPartyAuthority(slotMerged, intakeText, resolvedLegalEntities),
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

import { normalizeAgreementPartyName } from "./partySlotIdentityNormalize";

function normalizedLegalNameKey(name: string): string {
  return normalizeAgreementPartyName(name)
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

function resolveUiSlotIndexForLegalEntity(
  ui: LiveSignerMetadataUiState,
  legalName: string,
  fallbackIndex: number,
): number {
  const legal = resolveAuthorityPartyLegalNameField(legalName.trim(), "");
  if (!legal) return fallbackIndex;
  const max = Math.max(ui.partyCount, 2);
  for (let slot = 0; slot < max; slot++) {
    const uiLegal = partyLegalNameForIndex(ui, slot);
    if (uiLegal && partyLegalNamesMatch(uiLegal, legal)) return slot;
  }
  return fallbackIndex;
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
  // Intake-declared commercial roles (Buyer/Vendor/Agency/…) win over opening-parenthetical
  // defaults that freeze prep may have normalized to Client/Service Provider.
  const intakeRole = resolveIntakeRoleLabelForLegalName(legalName, context);
  if (intakeRole && isPreservableIntakeRole(intakeRole)) return intakeRole;
  const corpusRole = resolveAcceptedCorpusRoleLabelForLegalName(
    legalName,
    context?.acceptedCorpus ?? null,
  );
  if (corpusRole) return corpusRole;
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

/**
 * True when execution blocks must use legal-entity headings.
 * Mirrors enforcePaidProSingleExecutionBlock: tripartite labeled intakes keep role headings.
 */
export function shouldUseAuthorityEntityExecutionHeadings(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): boolean {
  if (parties.length < 3) return false;
  const intake = (roleContext?.intakeText ?? "").trim();
  const quadLabeled = Boolean(intake && isQuadripartiteLabeledPartiesIntake(intake));
  // Exact-three labeled intakes keep role headings; unlabeled 3-party and all 4+ use entity headings.
  const tripartiteLabeled = Boolean(intake && isTripartiteLabeledPartiesIntake(intake));
  if (tripartiteLabeled && !quadLabeled) return false;
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
    const frozenName = frozen[i]?.trim() ?? "";
    if (frozenName.length >= 2 && isAuthoritativeLegalEntityName(frozenName)) {
      const sanitized = sanitizeSignerPartyLegalEntityDisplay(frozenName, {
        partyIndex: i,
        source: "metadata_authority",
      });
      if (sanitized !== party.partyLegalName) {
        return { ...party, partyLegalName: sanitized };
      }
      return party;
    }
    const resolved =
      party.partyLegalName.trim() ||
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
  const frozenNames = readFrozenCanonicalManifestPartyNames();
  const hasFrozenManifest = frozenNames.filter((n) => n.trim().length >= 2).length >= 2;
  const authorityIdentities = hasFrozenManifest
    ? []
    : resolveAuthoritativeLegalPartyIdentities({
        intakeText: opts?.intakeText,
        draftPartyNames: opts?.draftPartyNames,
        consumerPartyCount: ui.partyCount,
        surface: "metadata_authority_parties",
      });
  const count = hasFrozenManifest
    ? consumeAuthoritativeSignerCount(
        "metadata_authority_parties:frozen_manifest",
        {
          intakeText: opts?.intakeText,
          draftPartyNames: opts?.draftPartyNames,
          manifestPartyCount: frozenNames.length,
          rawPartyCount: ui.partyCount,
          userExpandedPartyCount: ui.partyCount,
        },
        frozenNames.length,
      )
    : authorityIdentities.length >= 2
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
    const frozenLegal = (frozenNames[i] ?? "").trim();
    const authorityLegal = authorityIdentities[i]?.legalEntityName ?? "";
    const uiLegal = partyLegalNameForIndex(ui, i);
    const uiLegalClean = resolveAuthorityPartyLegalNameField(uiLegal, "");
    const draftLegalClean = resolveAuthorityPartyLegalNameField(
      (opts?.draftPartyNames?.[i] ?? "").trim(),
      "",
    );
    // Legal Party Authority wins over corrupted draft fragments / wrong UI names.
    // Metadata and draft rows may enrich slots but must not substitute intake legal identities.
    const resolvedLegal =
      hasFrozenManifest && frozenLegal
        ? frozenLegal
        : authorityIdentities.length >= 2 && authorityLegal
          ? authorityLegal
          : draftLegalClean || authorityLegal || uiLegalClean;
    const uiSlot = resolveUiSlotIndexForLegalEntity(ui, resolvedLegal, i);
    parties.push({
      partyIndex: i,
      partyLegalName: sanitizeSignerPartyLegalEntityDisplay(resolvedLegal, {
        partyIndex: i,
        source: "metadata_authority",
      }),
      signerEmail: signerEmailForIndex(ui, uiSlot),
      signerName: norm(ui.partySignerNames[uiSlot]),
      signerTitle: norm(ui.partySignerTitles[uiSlot]),
      partyAddress: normalizeCanonicalPartyAddress(ui.partyAddresses[uiSlot], {
        slot: i,
        source: "metadata_authority_parties",
      }),
    });
  }
  const filled = fillPartyLegalNamesFromFrozenManifestAndIntake(parties, opts);
  const legalEntitiesForMerge = hasFrozenManifest
    ? frozenNames.slice(0, count)
    : filled.map((p) => p.partyLegalName);
  return mergeIntakeSignerMetadataIntoAuthorityParties(
    filled,
    opts?.intakeText,
    legalEntitiesForMerge,
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

/** Promote live UI edits into the consumed authority store (projection from canonical bundle). */
export function setConsumedPaidProSignerMetadataAuthority(
  authority: PaidProSignerMetadataAuthority,
  opts?: { projectionBundleId?: string },
): void {
  consumedLiveAuthority = authority;
  if (opts?.projectionBundleId) {
    lastConsumedProjectionBundleId = opts.projectionBundleId;
  }
  clearPaidProVisibleRenderMemo();
}

let lastConsumedProjectionBundleId: string | null = null;

export function readConsumedProjectionBundleId(): string | null {
  return lastConsumedProjectionBundleId;
}

export function clearConsumedProjectionBundleId(): void {
  lastConsumedProjectionBundleId = null;
}

export function clearConsumedPaidProSignerMetadataAuthority(): void {
  consumedLiveAuthority = null;
  clearConsumedProjectionBundleId();
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
  // Heading mode is invariant across parties for one call — avoid re-parsing intake per party.
  const useEntityHeadings = shouldUseAuthorityEntityExecutionHeadings(parties, roleContext);
  return parties.map((p) => {
    const authorityLegal = sanitizeAuthorityPartyLegalName(p.partyLegalName);
    const legal = authorityLegal || slotIsolatedCanonicalEntity(p.partyIndex, slots);
    const signerName = p.signerName.trim();
    // Distinct human signer ⇒ entity representative, even when the party label looks
    // individual/brand-like (e.g. "PixelForge Labs" + signer "Pixel Gin").
    const isIndividual = legal
      ? isIndividualPartyName(legal) &&
        (!signerName || partyLegalNamesMatch(signerName, legal))
      : false;
    const roleLabel = resolveRoleLabelForAuthorityParty(legal, p.partyIndex, roleContext);
    const blockHeading = useEntityHeadings
      ? authorityExecutionBlockHeading(p)
      : blockHeadingFromRoleLabel(roleLabel, p.partyIndex);
    return {
      index: p.partyIndex,
      partyDisplayName: legal,
      email: p.signerEmail,
      partyAddress: p.partyAddress.trim() || null,
      representativeName: signerName || null,
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
      const signerName = p.signerName.trim();
      const isIndividual = legal
        ? isIndividualPartyName(legal) &&
          (!signerName || partyLegalNamesMatch(signerName, legal))
        : false;
      const roleLabel = resolveRoleLabelForAuthorityParty(legal, p.partyIndex, roleContext);
      const role = manifestRoleFromRoleLabel(roleLabel, p.partyIndex);
      return {
        index: p.partyIndex,
        role,
        partyName: legal,
        email: p.signerEmail,
        signerName: signerName || null,
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
