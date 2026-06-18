/**
 * Canonical party identity model — stable partyId + sourceSlot own signer/notice metadata.
 * roleLabel is presentation only; recipient1/recipient2 are legacy derived outputs.
 */

import type { AuthoritativeSigningSnapshotRecipientMetadata } from "./authoritativeSigningSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  isUnknownIntakePlaceholderValue,
  parseLabeledPartyBlocks,
  tripartiteRoleLabelForPartyIndex,
  type LabeledPartyBlock,
} from "./labeledPartyBlockParse";
/** Slot-indexed authority party record — mirrors PaidProSignerMetadataParty without circular imports. */
export type AuthorityPartySlot = {
  partyIndex: number;
  partyLegalName: string;
  signerEmail: string;
  signerName: string;
  signerTitle: string;
  partyAddress: string;
};

export type PartyIdentitySource =
  | "labeled_party_block"
  | "manifest"
  | "server"
  | "manual_edit"
  | "fallback"
  | "legacy_recipient_slot";

export type UserPartyRelation = "party" | "coordinator" | "agent" | "lawyer" | "observer";

export type PartyIdentity = {
  partyId: string;
  /** 0-based slot — labeled Party N maps to sourceSlot N - 1. */
  sourceSlot: number;
  legalName: string;
  roleLabel?: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  noticeEmail?: string;
  noticeAddress?: string;
  isSigningParty: boolean;
  isUserParty?: boolean;
  userRelation?: UserPartyRelation;
  source: PartyIdentitySource;
};

export type AgreementCoordinatorProfile = {
  coordinatorId: string;
  isUser: boolean;
  displayName?: string;
  email?: string;
  userRelation: Exclude<UserPartyRelation, "party">;
};

export type PartyIdentityMetadataSlot = {
  partyId: string;
  sourceSlot: number;
  roleLabel?: string;
  isSigningParty?: boolean;
};

export type NormalizePartyIdentitiesInput = {
  intakeText?: string | null;
  authorityParties?: readonly AuthorityPartySlot[];
  recipientMetadata?: AuthoritativeSigningSnapshotRecipientMetadata;
  roleLabels?: readonly string[];
  coordinator?: AgreementCoordinatorProfile | null;
  /** When true, user is coordinating only — never injected as a legal party. */
  userIsCoordinatorOnly?: boolean;
};

function cleanField(value: string | null | undefined): string {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return isUnknownIntakePlaceholderValue(t) ? "" : t;
}

function sortedBySourceSlot(parties: readonly PartyIdentity[]): PartyIdentity[] {
  return [...parties].sort((a, b) => a.sourceSlot - b.sourceSlot);
}

/** Deterministic party id for labeled Party N blocks (1-based N → party_N). */
export function partyIdForLabeledPartyNumber(partyNumber: number): string {
  return `party_${partyNumber}`;
}

/** Stable hash party id when labeled block index is unavailable. */
export function partyIdFromStableKey(legalName: string, sourceSlot: number): string {
  const key = `${sourceSlot}:${legalName.replace(/\s+/g, " ").trim().toLowerCase()}`;
  const fp = fingerprintAgreementBody(key);
  return `party_${fp.slice(0, 12)}`;
}

export function resolvePartyId(
  legalName: string,
  sourceSlot: number,
  labeledPartyNumber?: number,
  existingPartyId?: string,
): string {
  if (existingPartyId?.trim()) return existingPartyId.trim();
  if (labeledPartyNumber != null && labeledPartyNumber >= 1) {
    return partyIdForLabeledPartyNumber(labeledPartyNumber);
  }
  const name = cleanField(legalName);
  if (name.length >= 2) return partyIdFromStableKey(name, sourceSlot);
  return partyIdFromStableKey(`slot_${sourceSlot}`, sourceSlot);
}

function partyFromLabeledBlock(
  block: LabeledPartyBlock,
  authority: AuthorityPartySlot | undefined,
  roleLabel: string | undefined,
): PartyIdentity {
  const sourceSlot = block.index - 1;
  return {
    partyId: partyIdForLabeledPartyNumber(block.index),
    sourceSlot,
    legalName: cleanField(authority?.partyLegalName) || cleanField(block.legalEntity),
    roleLabel: roleLabel?.trim() || tripartiteRoleLabelForPartyIndex(sourceSlot),
    signerName: cleanField(authority?.signerName) || cleanField(block.signerName),
    signerTitle: cleanField(authority?.signerTitle) || cleanField(block.signerTitle),
    signerEmail: cleanField(authority?.signerEmail) || cleanField(block.signerEmail),
    noticeEmail: cleanField(authority?.signerEmail) || cleanField(block.signerEmail),
    noticeAddress: cleanField(authority?.partyAddress) || cleanField(block.address),
    isSigningParty: true,
    isUserParty: false,
    source: "labeled_party_block",
  };
}

function partyFromAuthoritySlot(
  party: AuthorityPartySlot,
  roleLabel: string | undefined,
  labeledPartyNumber?: number,
  existingPartyId?: string,
): PartyIdentity {
  const sourceSlot = party.partyIndex ?? 0;
  const legalName = cleanField(party.partyLegalName);
  return {
    partyId: resolvePartyId(legalName, sourceSlot, labeledPartyNumber, existingPartyId),
    sourceSlot,
    legalName,
    roleLabel: roleLabel?.trim() || tripartiteRoleLabelForPartyIndex(sourceSlot),
    signerName: cleanField(party.signerName),
    signerTitle: cleanField(party.signerTitle),
    signerEmail: cleanField(party.signerEmail),
    noticeEmail: cleanField(party.signerEmail),
    noticeAddress: cleanField(party.partyAddress),
    isSigningParty: true,
    isUserParty: false,
    source: labeledPartyNumber != null ? "labeled_party_block" : "manifest",
  };
}

function mergePartyIdentity(base: PartyIdentity, overlay: PartyIdentity): PartyIdentity {
  return {
    ...base,
    legalName: overlay.legalName.trim() || base.legalName,
    roleLabel: overlay.roleLabel?.trim() || base.roleLabel,
    signerName: overlay.signerName?.trim() || base.signerName,
    signerTitle: overlay.signerTitle?.trim() || base.signerTitle,
    signerEmail: overlay.signerEmail?.trim() || base.signerEmail,
    noticeEmail: overlay.noticeEmail?.trim() || base.noticeEmail,
    noticeAddress: overlay.noticeAddress?.trim() || base.noticeAddress,
    source: base.source === "labeled_party_block" ? base.source : overlay.source,
  };
}

/**
 * Normalize heterogeneous party inputs into canonical PartyIdentity[].
 * Labeled Party N blocks win for slot + partyId; authority fills gaps only.
 */
export function normalizePartyIdentities(input: NormalizePartyIdentitiesInput): PartyIdentity[] {
  const labeled = parseLabeledPartyBlocks(input.intakeText ?? "");
  const labeledBySlot = new Map(labeled.map((b) => [b.index - 1, b]));
  const authority = input.authorityParties ?? [];
  const roleLabels = input.roleLabels ?? [];

  if (labeled.length >= 2) {
    const maxSlot = Math.max(
      ...labeled.map((b) => b.index - 1),
      ...authority.map((p) => p.partyIndex ?? 0),
      (input.recipientMetadata?.partyIds?.length ?? 0) - 1,
      1,
    );
    const out: PartyIdentity[] = [];
    for (let sourceSlot = 0; sourceSlot <= maxSlot; sourceSlot++) {
      const block = labeledBySlot.get(sourceSlot);
      const auth = authority.find((p) => (p.partyIndex ?? 0) === sourceSlot) ?? authority[sourceSlot];
      const metaSlot = input.recipientMetadata?.partyMetadata?.find((m) => m.sourceSlot === sourceSlot);
      const existingId =
        input.recipientMetadata?.partyIds?.[sourceSlot] ?? metaSlot?.partyId;
      if (block) {
        const fromBlock = partyFromLabeledBlock(block, auth, roleLabels[sourceSlot] ?? metaSlot?.roleLabel);
        if (existingId) fromBlock.partyId = existingId;
        out.push(auth ? mergePartyIdentity(fromBlock, partyFromAuthoritySlot(auth, roleLabels[sourceSlot], block.index, existingId)) : fromBlock);
      } else if (auth) {
        out.push(partyFromAuthoritySlot(auth, roleLabels[sourceSlot] ?? metaSlot?.roleLabel, undefined, existingId));
      }
    }
    return sortedBySourceSlot(out.filter((p) => p.legalName.length >= 2 || p.signerEmail || p.noticeAddress));
  }

  if (authority.length) {
    return sortedBySourceSlot(
      authority.map((p, i) =>
        partyFromAuthoritySlot(
          p,
          roleLabels[i] ?? input.recipientMetadata?.partyMetadata?.[i]?.roleLabel,
          undefined,
          input.recipientMetadata?.partyIds?.[i],
        ),
      ),
    );
  }

  if (input.recipientMetadata) {
    return fromRecipientMetadata(input.recipientMetadata);
  }

  return [];
}

export function getSigningParties(parties: readonly PartyIdentity[]): PartyIdentity[] {
  return parties.filter((p) => p.isSigningParty && p.legalName.trim().length >= 2);
}

export function getPartyById(parties: readonly PartyIdentity[], partyId: string): PartyIdentity | null {
  const id = partyId.trim();
  if (!id) return null;
  return parties.find((p) => p.partyId === id) ?? null;
}

export function getPartyBySourceSlot(parties: readonly PartyIdentity[], slot: number): PartyIdentity | null {
  if (!Number.isFinite(slot) || slot < 0) return null;
  return parties.find((p) => p.sourceSlot === slot) ?? null;
}

export function createCoordinatorProfile(args: {
  isUser: boolean;
  email?: string;
  displayName?: string;
  userRelation?: AgreementCoordinatorProfile["userRelation"];
}): AgreementCoordinatorProfile {
  const email = cleanField(args.email);
  const displayName = cleanField(args.displayName);
  const key = `coordinator:${email || displayName || "user"}`;
  return {
    coordinatorId: `coord_${fingerprintAgreementBody(key).slice(0, 12)}`,
    isUser: args.isUser,
    displayName: displayName || undefined,
    email: email || undefined,
    userRelation: args.userRelation ?? "coordinator",
  };
}

/** Legal parties only — coordinator is never a signing party in Parties[]. */
export function legalPartyIdentitiesExcludingCoordinator(
  parties: readonly PartyIdentity[],
  coordinator: AgreementCoordinatorProfile | null | undefined,
  userIsCoordinatorOnly?: boolean,
): PartyIdentity[] {
  if (!coordinator && !userIsCoordinatorOnly) return [...parties];
  return parties.filter((p) => !p.isUserParty || p.userRelation === "party");
}

export function toPaidProSignerMetadataParties(
  parties: readonly PartyIdentity[],
): AuthorityPartySlot[] {
  return sortedBySourceSlot(parties).map((p) => ({
    partyIndex: p.sourceSlot,
    partyLegalName: p.legalName,
    signerEmail: p.noticeEmail?.trim() || p.signerEmail?.trim() || "",
    signerName: p.signerName?.trim() || "",
    signerTitle: p.signerTitle?.trim() || "",
    partyAddress: p.noticeAddress?.trim() || "",
  }));
}

export function toRecipientMetadata(
  parties: readonly PartyIdentity[],
  extraPartyReviewEmails: readonly string[] = [],
): AuthoritativeSigningSnapshotRecipientMetadata {
  const sorted = sortedBySourceSlot(parties);
  const slot0 = getPartyBySourceSlot(sorted, 0) ?? sorted[0];
  const slot1 = getPartyBySourceSlot(sorted, 1) ?? sorted[1];
  return {
    partySignerNames: sorted.map((p) => p.signerName?.trim() ?? ""),
    partySignerTitles: sorted.map((p) => p.signerTitle?.trim() ?? ""),
    partyAddresses: sorted.map((p) => p.noticeAddress?.trim() ?? ""),
    partyLegalNames: sorted.map((p) => p.legalName),
    partyIds: sorted.map((p) => p.partyId),
    partyMetadata: sorted.map((p) => ({
      partyId: p.partyId,
      sourceSlot: p.sourceSlot,
      roleLabel: p.roleLabel,
      isSigningParty: p.isSigningParty,
    })),
    recipient1Name: slot0?.legalName ?? "",
    recipient2Name: slot1?.legalName ?? "",
    recipient1Email: slot0?.noticeEmail?.trim() || slot0?.signerEmail?.trim() || "",
    recipient2Email: slot1?.noticeEmail?.trim() || slot1?.signerEmail?.trim() || "",
    extraPartyReviewEmails: [...extraPartyReviewEmails],
  };
}

export function fromRecipientMetadata(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): PartyIdentity[] {
  const addresses = meta.partyAddresses ?? [];
  const legalNames = meta.partyLegalNames ?? [];
  const count = Math.max(
    meta.partySignerNames.length,
    meta.partySignerTitles.length,
    addresses.length,
    legalNames.length,
    meta.partyIds?.length ?? 0,
    meta.partyMetadata?.length ?? 0,
    meta.recipient1Name.trim() || meta.recipient2Name.trim() ? 2 : 0,
  );
  const parties: PartyIdentity[] = [];
  for (let sourceSlot = 0; sourceSlot < count; sourceSlot++) {
    const metaSlot = meta.partyMetadata?.find((m) => m.sourceSlot === sourceSlot) ?? meta.partyMetadata?.[sourceSlot];
    const legalFromManifest = cleanField(legalNames[sourceSlot] ?? "");
    const legalName =
      legalFromManifest ||
      cleanField(
        sourceSlot === 0
          ? meta.recipient1Name
          : sourceSlot === 1
            ? meta.recipient2Name
            : "",
      );
    const signerEmail = cleanField(
      sourceSlot === 0
        ? meta.recipient1Email
        : sourceSlot === 1
          ? meta.recipient2Email
          : meta.extraPartyReviewEmails[sourceSlot - 2] ?? "",
    );
    parties.push({
      partyId: resolvePartyId(
        legalName,
        sourceSlot,
        undefined,
        meta.partyIds?.[sourceSlot] ?? metaSlot?.partyId,
      ),
      sourceSlot,
      legalName,
      roleLabel: metaSlot?.roleLabel?.trim() || tripartiteRoleLabelForPartyIndex(sourceSlot),
      signerName: cleanField(meta.partySignerNames[sourceSlot]),
      signerTitle: cleanField(meta.partySignerTitles[sourceSlot]),
      signerEmail,
      noticeEmail: signerEmail,
      noticeAddress: cleanField(addresses[sourceSlot]),
      isSigningParty: metaSlot?.isSigningParty ?? true,
      source: "legacy_recipient_slot",
    });
  }
  return sortedBySourceSlot(parties.filter((p) => p.legalName.length >= 2 || p.signerEmail || p.noticeAddress));
}

/**
 * Remaining two-party assumptions — Phase 1 audit (compatibility adapters not yet migrated).
 * Each entry documents a hotspot; status "legacy_adapter" means derived recipient1/2 only.
 */
export const REMAINING_TWO_PARTY_ASSUMPTIONS_AUDIT = [
  {
    area: "LiveSignerMetadataUiState",
    assumption: "recipient1/recipient2 + partySignerNames arrays",
    status: "legacy_adapter_derived",
    file: "paidProSignerMetadataAuthority.ts",
  },
  {
    area: "AuthoritativeSigningSnapshotRecipientMetadata",
    assumption: "recipient1Name/recipient2Name required fields",
    status: "legacy_adapter_derived",
    file: "authoritativeSigningSnapshot.ts",
  },
  {
    area: "partySlotIdentityNormalize",
    assumption: "selectAuthoritativeTwoPartySlots caps to 2 names",
    status: "active_two_party_cap",
    file: "partySlotIdentityNormalize.ts",
  },
  {
    area: "partyBetweenParse",
    assumption: "extractBetweenPartyNameList returns slice(0,2)",
    status: "active_two_party_cap",
    file: "partyBetweenParse.ts",
  },
  {
    area: "paidProExecutionBlockNormalization",
    assumption: "default headings CLIENT/SERVICE PROVIDER for index 0/1",
    status: "presentation_fallback",
    file: "paidProExecutionBlockNormalization.ts",
  },
  {
    area: "AgreementBuilderIntake",
    assumption: "recipient1/recipient2 UI state and extra emails from index 2",
    status: "legacy_ui",
    file: "AgreementBuilderIntake.tsx",
  },
  {
    area: "agreementToVs01SigningBridge",
    assumption: "recipient1/recipient2 bridge handoff",
    status: "legacy_adapter",
    file: "launch/simpleProduct/agreementToVs01SigningBridge.ts",
  },
  {
    area: "reviewReadyHydratedDisplayCorpus",
    assumption: "recipient1/recipient2 display hydration",
    status: "legacy_adapter",
    file: "launch/simpleProduct/reviewReadyHydratedDisplayCorpus.ts",
  },
  {
    area: "creatorDashboardSignatureTrack",
    assumption: "recipient1/recipient2 status columns",
    status: "legacy_dashboard",
    file: "launch/creatorDashboardSignatureTrack.ts",
  },
  {
    area: "canonicalPartyIdentityResolver",
    assumption: "organizations slice(0,2) for opening recital",
    status: "active_two_party_cap",
    file: "canonicalPartyIdentityResolver.ts",
  },
  {
    area: "buildPaidProSignerMetadataParties",
    assumption: "Math.max(ui.partyCount, 2) floor for slot count",
    status: "legacy_minimum_floor",
    file: "paidProSignerMetadataAuthority.ts",
  },
  {
    area: "authoritativeSigningSnapshot",
    assumption: "while (partyAddresses.length < 2) push empty",
    status: "legacy_padding",
    file: "authoritativeSigningSnapshot.ts",
  },
  {
    area: "signerSetupPartyIdentity",
    assumption: "selectAuthoritativeTwoPartySlots for collapsed rows",
    status: "active_two_party_cap",
    file: "signerSetupPartyIdentity.ts",
  },
  {
    area: "guidedDealCompletion/resolveGuidedPreReviewSignerSlots",
    assumption: "recipient1/recipient2 slot resolution",
    status: "legacy_adapter",
    file: "guidedDealCompletion/resolveGuidedPreReviewSignerSlots.ts",
  },
  {
    area: "paidProNPartySignerSetup",
    assumption: "coordinator toggle exists; parties still indexed 0..n",
    status: "partial_n_party",
    file: "paidProNPartySignerSetup.ts",
  },
] as const;
