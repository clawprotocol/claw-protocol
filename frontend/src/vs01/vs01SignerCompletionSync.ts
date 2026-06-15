import { postVs01SignerComplete } from "../agreement/agreementWorkspaceApi";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import {
  buildVs01CanonicalPacketSeed,
  loadVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import { todayIsoDateLocal } from "./vs01FieldValueResolution";
import { resolveOwnerSigningHandoff } from "../launch/ownerSigningStatusResolver";
import type { Vs01RecipientPlacedField } from "./types";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
  readSigningPacketStatus,
  signerKeyForHandoffRow,
  writeSigningPacketStatus,
  type Vs01SigningPacketStatusSnapshot,
} from "./vs01SigningPacketStatusStore";
import {
  formatSigningDateDisplayFromIso,
  stampWitnessBlockPartySigningDate,
} from "./vs01WitnessBlockSigningDate";

export type RecordVs01SignerCompletionArgs = {
  agreementId: string;
  documentId: string;
  signerRoleId: string;
  partyIndex: number | null;
  participantId?: string | null;
  displayName?: string | null;
  recipientFields?: readonly Vs01RecipientPlacedField[];
  recipientAccessToken?: string | null;
  signingDateIso?: string;
};

export type RecordVs01SignerCompletionResult = {
  localSnapshot: Vs01SigningPacketStatusSnapshot | null;
  fullySigned: boolean;
  serverSynced: boolean;
  serverFullyExecuted: boolean;
  completionEmailsSent: boolean;
  corpusStamped: boolean;
};

function bootstrapSignerKeys(agreementId: string): string[] {
  const handoff = resolveOwnerSigningHandoff(agreementId);
  if (!handoff) return [];
  const keys = new Set<string>();
  const ownerKey = (handoff.ownerSignerRoleId ?? "").trim();
  if (ownerKey) keys.add(ownerKey);
  for (const row of handoff.signers) {
    keys.add(signerKeyForHandoffRow(row, row.signerRoleId));
  }
  return [...keys];
}

function ensureSnapshotForSigner(
  agreementId: string,
  signerRoleId: string,
): Vs01SigningPacketStatusSnapshot | null {
  const existing = readSigningPacketStatus(agreementId);
  if (existing) return existing;
  const handoff = resolveOwnerSigningHandoff(agreementId);
  if (handoff) {
    const ownerKey = (handoff.ownerSignerRoleId ?? "").trim() || signerRoleId;
    return ensureSigningPacketStatusFromHandoff(handoff, ownerKey);
  }
  const keys = bootstrapSignerKeys(agreementId);
  if (!keys.length) {
    const snap: Vs01SigningPacketStatusSnapshot = {
      agreementId,
      updatedAt: new Date().toISOString(),
      bySignerKey: { [signerRoleId]: "waiting" },
      fullySigned: false,
    };
    return snap;
  }
  const bySignerKey: Vs01SigningPacketStatusSnapshot["bySignerKey"] = {};
  for (const key of keys) bySignerKey[key] = "waiting";
  const snap: Vs01SigningPacketStatusSnapshot = {
    agreementId,
    updatedAt: new Date().toISOString(),
    bySignerKey,
    fullySigned: false,
  };
  return snap;
}

function persistSignedDateToPortablePacket(args: {
  documentId: string;
  agreementId: string;
  partyIndex: number;
  signingDateIso: string;
  recipientFields?: readonly Vs01RecipientPlacedField[];
}): { portable: Vs01CanonicalPacketPortableV1 | null; corpusStamped: boolean } {
  const did = args.documentId.trim();
  if (!did) return { portable: null, corpusStamped: false };
  const portable = loadVs01CanonicalPacketPortable(did);
  if (!portable) return { portable: null, corpusStamped: false };

  const stamped = stampWitnessBlockPartySigningDate(
    portable.seed.corpusPlain,
    args.partyIndex,
    args.signingDateIso,
  );
  let nextCorpus = portable.seed.corpusPlain;
  let corpusStamped = false;
  if (stamped.stamped) {
    nextCorpus = stamped.text;
    corpusStamped = true;
  }

  const nextSeed =
    buildVs01CanonicalPacketSeed({
      documentId: did,
      agreementId: args.agreementId.trim(),
      corpusPlain: nextCorpus,
    }) ?? portable.seed;

  const nextFields = args.recipientFields
    ? portable.fields.map((field) => {
        const updated = args.recipientFields!.find((f) => f.id === field.id);
        return updated ? { ...field, ...updated } : field;
      })
    : portable.fields;

  const nextPortable: Vs01CanonicalPacketPortableV1 = {
    ...portable,
    seed: nextSeed,
    fields: nextFields,
  };
  storeVs01CanonicalPacketPortable(did, nextPortable);
  return { portable: nextPortable, corpusStamped };
}

/** Record VS01 signer completion locally and sync to server when available. */
export async function recordVs01SignerCompletion(
  args: RecordVs01SignerCompletionArgs,
): Promise<RecordVs01SignerCompletionResult> {
  const agreementId = args.agreementId.trim();
  const signerRoleId = args.signerRoleId.trim();
  const documentId = args.documentId.trim();
  const signingDateIso = (args.signingDateIso ?? "").trim() || todayIsoDateLocal();
  const signedDateDisplay = formatSigningDateDisplayFromIso(signingDateIso);
  const partyIndex = args.partyIndex ?? 0;

  const bootstrap = ensureSnapshotForSigner(agreementId, signerRoleId);
  if (bootstrap && !readSigningPacketStatus(agreementId)) {
    writeSigningPacketStatus(bootstrap);
  }

  const { portable, corpusStamped } = persistSignedDateToPortablePacket({
    documentId,
    agreementId,
    partyIndex,
    signingDateIso,
    recipientFields: args.recipientFields,
  });

  const bootstrapKeys = bootstrapSignerKeys(agreementId);
  const next = patchSignerPacketStatus(
    agreementId,
    signerRoleId,
    "signed",
    bootstrapKeys.length ? bootstrapKeys : [signerRoleId],
  );
  const snap = next ?? readSigningPacketStatus(agreementId);
  const fullySigned = Boolean(snap?.fullySigned);

  let serverSynced = false;
  let serverFullyExecuted = false;
  let completionEmailsSent = false;

  if (agreementId && !agreementId.startsWith("local_ag_")) {
    try {
      const res = await postVs01SignerComplete(
        agreementId,
        {
          signer_role_id: signerRoleId,
          participant_id: (args.participantId ?? "").trim(),
          document_id: documentId,
          display_name: (args.displayName ?? "").trim(),
          signed_date_iso: signingDateIso,
          signed_date_display: signedDateDisplay,
          portable_packet: portable ? (portable as unknown as Record<string, unknown>) : undefined,
        },
        args.recipientAccessToken,
      );
      serverSynced = res.ok;
      serverFullyExecuted = Boolean(res.fully_executed);
      completionEmailsSent = Boolean(res.completion_emails_sent);
    } catch {
      serverSynced = false;
    }
  }

  return {
    localSnapshot: snap,
    fullySigned: fullySigned || serverFullyExecuted,
    serverSynced,
    serverFullyExecuted,
    completionEmailsSent,
    corpusStamped,
  };
}

export function portableCorpusHash(portable: Vs01CanonicalPacketPortableV1 | null): string | null {
  if (!portable?.seed?.corpusPlain) return null;
  return fingerprintAgreementBody(portable.seed.corpusPlain);
}
