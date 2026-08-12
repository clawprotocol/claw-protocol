/**
 * Hydrate prior signer signature marks into portable corpus + packet status for recipient view.
 */

import {
  applySignerCompletionToPortablePacket,
} from "./vs01FullyExecutedSignedSnapshot";
import {
  resolveCompletedSignerByText,
  logCompletedSignerOverlaySource,
} from "./completedSignerOverlayResolver";
import {
  storeVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import { todayIsoDateLocal } from "./vs01FieldValueResolution";
import { patchSignerPacketStatus } from "./vs01SigningPacketStatusStore";
import { isRecipientSignerMarkedComplete } from "./recipientSigningFieldUtils";
import { witnessBlockPartyHasFilledSignature } from "./vs01WitnessBlockSigningDate";

/** True only when packet explicitly enabled initials (initialsOnEachPage / initialsPolicy). */
export function isVs01InitialsEnabledForPacket(
  portable: Pick<Vs01CanonicalPacketPortableV1, "initialsPolicy"> | null | undefined,
): boolean {
  return portable?.initialsPolicy?.enabled === true;
}

/** Parse initials flag from prepare-time packet revision (`{hash}_{0|1}_{count}`). */
export function parseInitialsEnabledFromPacketRevision(
  packetRevision: string | null | undefined,
): boolean | null {
  const rev = (packetRevision ?? "").trim();
  // Hash segment may contain underscores after sanitization — read flag from suffix.
  const match = /_(0|1)_(\d+)$/.exec(rev);
  if (!match) return null;
  return match[1] === "1";
}

function stripInitialsFromPortable(
  portable: Vs01CanonicalPacketPortableV1,
): Vs01CanonicalPacketPortableV1 {
  const fields = portable.fields.filter((f) => f.type !== "initials");
  return {
    ...portable,
    fields,
    fieldCount: fields.length,
    initialsPolicy: {
      enabled: false,
      bodyPagesOnly: portable.initialsPolicy?.bodyPagesOnly ?? true,
    },
  };
}

/**
 * Strip initials fields and force policy off unless explicitly enabled.
 * Prevents stale initials fields from re-enabling initials on later signer hydration.
 */
function portableHasAuthoritativeInitials(
  portable: Vs01CanonicalPacketPortableV1,
): boolean {
  return (
    portable.initialsPolicy?.enabled === true &&
    portable.fields.some((f) => f.type === "initials")
  );
}

export function normalizeVs01PortableInitialsPolicy(
  portable: Vs01CanonicalPacketPortableV1,
  opts?: { packetRevision?: string | null },
): Vs01CanonicalPacketPortableV1 {
  const fromRevision = parseInitialsEnabledFromPacketRevision(opts?.packetRevision);
  if (fromRevision === false) {
    // Server/stored portable with explicit initials beats stale URL revision suffix.
    if (portableHasAuthoritativeInitials(portable)) return portable;
    return stripInitialsFromPortable(portable);
  }
  if (portableHasAuthoritativeInitials(portable)) return portable;
  return stripInitialsFromPortable(portable);
}

/** Authoritative initials gate for recipient signing (portable policy + optional URL revision). */
export function resolveRecipientInitialsEnabled(args: {
  portable: Vs01CanonicalPacketPortableV1 | null | undefined;
  packetRevision?: string | null;
}): boolean {
  // Authoritative server portable beats a stale URL `_0_` suffix (TEST473/475).
  // Prepare-time `_0_` still wins over polluted portable when revision fieldCount disagrees (TEST368).
  const fromRevision = parseInitialsEnabledFromPacketRevision(args.packetRevision);
  const hasAuth = Boolean(args.portable && portableHasAuthoritativeInitials(args.portable));
  if (fromRevision === false) {
    if (!hasAuth || !args.portable) return false;
    const countMatch = /_(0|1)_(\d+)$/.exec((args.packetRevision ?? "").trim());
    const revCount = countMatch ? Number(countMatch[2]) : NaN;
    if (Number.isFinite(revCount) && revCount !== args.portable.fieldCount) {
      return false;
    }
    return true;
  }
  if (hasAuth) return true;
  const portable = args.portable
    ? normalizeVs01PortableInitialsPolicy(args.portable, { packetRevision: args.packetRevision })
    : null;
  return isVs01InitialsEnabledForPacket(portable);
}

/**
 * Burn field-level signature values into corpus and bootstrap packet status for completed signers.
 */
export function hydratePortableSignerMarksForRecipientView(args: {
  portable: Vs01CanonicalPacketPortableV1;
  agreementId: string;
  documentId: string;
  /** Current signer opening the link — never burn or mark this role as completed here. */
  viewingSignerRoleId?: string | null;
}): Vs01CanonicalPacketPortableV1 {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  const viewingRole = (args.viewingSignerRoleId ?? "").trim();
  if (!agreementId || !documentId) return args.portable;

  let portable = args.portable;
  const roleKeys = portable.roles.map((r) => r.roleId).filter(Boolean);
  let mutated = false;

  for (const role of portable.roles) {
    const rid = (role.roleId ?? "").trim();
    if (!rid || (viewingRole && rid === viewingRole)) continue;

    const partyIndex = role.partyIndex ?? 0;
    const corpusHasSig = witnessBlockPartyHasFilledSignature(portable.seed.corpusPlain, partyIndex);
    const markedSigned = isRecipientSignerMarkedComplete(agreementId, rid);
    const resolved = resolveCompletedSignerByText({
      agreementId,
      source: "hydratePortableSignerMarksForRecipientView",
      signerRoleId: rid,
      partyIndex,
      signerEmail: role.signerEmail ?? role.reviewEmail,
      roleSignerName: role.signerName,
      fields: portable.fields,
    });
    const sig = resolved.byText;
    logCompletedSignerOverlaySource({
      agreementId,
      source: "hydratePortableSignerMarksForRecipientView",
      partyIndex,
      partyName: (role.entityName || role.partyName || "").trim(),
      signerRoleId: rid,
      auditDisplayName: (role.signerName ?? "").trim(),
      fieldAssignedSignerRoleId: resolved.fieldAssignedSignerRoleId,
      resolvedBy: sig,
      resolvedName: (role.signerName ?? "").trim(),
      fallbackUsed: resolved.fallbackUsed,
    });
    if (!sig || (!corpusHasSig && !markedSigned)) continue;

    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId,
      documentId,
      signerRoleId: rid,
      partyIndex: role.partyIndex ?? 0,
      signingDateIso: todayIsoDateLocal(),
      signatureText: sig,
      recipientFields: portable.fields,
    });
    if (applied.signatureStamped || applied.corpusStamped) {
      portable = applied.portable;
      mutated = true;
    }
    patchSignerPacketStatus(agreementId, rid, "signed", roleKeys);
  }

  if (mutated) {
    storeVs01CanonicalPacketPortable(documentId, portable);
  }
  return portable;
}
