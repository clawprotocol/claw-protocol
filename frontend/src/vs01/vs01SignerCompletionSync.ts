import { postVs01SignerComplete } from "../agreement/agreementWorkspaceApi";
import {
  assignedFieldsFromRecipient,
  confirmRecipientCompletionResponse,
  recipientCompletionIsRetryable,
  versionedRecipientConsentIntent,
  type Vs01ConsentIntent,
  type Vs01CompletionStatus,
  type Vs01UploadedPdfReceiptPointer,
} from "./vs01RecipientCompletionContract";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import {
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
import { formatSigningDateDisplayFromIso } from "./vs01WitnessBlockSigningDate";
import {
  applySignerCompletionToPortablePacket,
  attachFullyExecutedSnapshotToPortable,
  signatureTextForSignerRole,
} from "./vs01FullyExecutedSignedSnapshot";
import {
  assertVs01CompletionIdentityAuthoritative,
  findPortableRoleBySignerRoleId,
  portableRolePartyId,
} from "./vs01RecipientIdentityAuthority";

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
  consent?: Vs01ConsentIntent | null;
  packetRevision?: string | null;
};

export type RecordVs01SignerCompletionResult = {
  localSnapshot: Vs01SigningPacketStatusSnapshot | null;
  fullySigned: boolean;
  serverSynced: boolean;
  serverFullyExecuted: boolean;
  completionEmailsSent: boolean;
  corpusStamped: boolean;
  errorCode?: string;
  error?: string;
  status?: number;
  retryable?: boolean;
  completion?: Vs01CompletionStatus;
  receiptStatus?: string;
  receipt?: Vs01UploadedPdfReceiptPointer | null;
};

const completionInFlight = new Map<string, Promise<RecordVs01SignerCompletionResult>>();

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
    return {
      agreementId,
      updatedAt: new Date().toISOString(),
      bySignerKey: { [signerRoleId]: "waiting" },
      fullySigned: false,
    };
  }
  const bySignerKey: Vs01SigningPacketStatusSnapshot["bySignerKey"] = {};
  for (const key of keys) bySignerKey[key] = "waiting";
  return {
    agreementId,
    updatedAt: new Date().toISOString(),
    bySignerKey,
    fullySigned: false,
  };
}

function persistSignerCompletionToPortablePacket(args: {
  documentId: string;
  agreementId: string;
  signerRoleId: string;
  partyIndex: number;
  signingDateIso: string;
  displayName?: string | null;
  recipientFields?: readonly Vs01RecipientPlacedField[];
  attachFinalSnapshot: boolean;
}): {
  portable: Vs01CanonicalPacketPortableV1 | null;
  corpusStamped: boolean;
  signatureStamped: boolean;
} {
  const did = args.documentId.trim();
  if (!did) return { portable: null, corpusStamped: false, signatureStamped: false };
  const portable = loadVs01CanonicalPacketPortable(did);
  if (!portable) return { portable: null, corpusStamped: false, signatureStamped: false };

  const role = portable.roles.find((r) => (r.roleId ?? "").trim() === args.signerRoleId.trim());
  const signatureText = signatureTextForSignerRole(
    args.recipientFields ?? portable.fields,
    args.signerRoleId,
    {
      partyIndex: args.partyIndex,
      signerEmail: role?.signerEmail ?? role?.reviewEmail,
      roleSignerName: role?.signerName,
      auditDisplayName: args.displayName,
    },
  );

  const applied = applySignerCompletionToPortablePacket({
    portable,
    agreementId: args.agreementId.trim(),
    documentId: did,
    signerRoleId: args.signerRoleId,
    partyIndex: args.partyIndex,
    signingDateIso: args.signingDateIso,
    signatureText,
    recipientFields: args.recipientFields,
  });

  let nextPortable = applied.portable;
  if (args.attachFinalSnapshot) {
    nextPortable = attachFullyExecutedSnapshotToPortable(nextPortable);
  }

  storeVs01CanonicalPacketPortable(did, nextPortable);
  return {
    portable: nextPortable,
    corpusStamped: applied.corpusStamped,
    signatureStamped: applied.signatureStamped,
  };
}

function applyLocalSignerPacketStatus(
  agreementId: string,
  signerRoleId: string,
  serverFullyExecuted: boolean,
): Vs01SigningPacketStatusSnapshot | null {
  const bootstrap = ensureSnapshotForSigner(agreementId, signerRoleId);
  if (bootstrap && !readSigningPacketStatus(agreementId)) {
    writeSigningPacketStatus(bootstrap);
  }
  const bootstrapKeys = bootstrapSignerKeys(agreementId);
  const keys = bootstrapKeys.length ? bootstrapKeys : [signerRoleId];
  if (serverFullyExecuted) {
    let snap = readSigningPacketStatus(agreementId);
    if (!snap && bootstrap) {
      writeSigningPacketStatus(bootstrap);
      snap = bootstrap;
    }
    if (snap) {
      const bySignerKey = { ...snap.bySignerKey };
      for (const key of keys) bySignerKey[key] = "signed";
      const next: Vs01SigningPacketStatusSnapshot = {
        ...snap,
        updatedAt: new Date().toISOString(),
        bySignerKey,
        fullySigned: true,
      };
      writeSigningPacketStatus(next);
      return next;
    }
  }
  return patchSignerPacketStatus(agreementId, signerRoleId, "signed", keys);
}

function resolveAuthoritativeCompletionIdentity(args: RecordVs01SignerCompletionArgs): {
  signerRoleId: string;
  participantId: string;
  partyIndex: number;
  blocked?: { code: string; message: string };
} {
  const signerRoleId = args.signerRoleId.trim();
  const documentId = args.documentId.trim();
  const portable = documentId ? loadVs01CanonicalPacketPortable(documentId) : null;
  const guard = assertVs01CompletionIdentityAuthoritative({
    portable,
    signerRoleId,
    participantId: args.participantId,
  });
  if (!guard.ok) {
    return {
      signerRoleId,
      participantId: (args.participantId ?? "").trim(),
      partyIndex: args.partyIndex ?? 0,
      blocked: { code: guard.code, message: guard.message },
    };
  }
  const role = portable ? findPortableRoleBySignerRoleId(portable, signerRoleId) : null;
  const participantId =
    (role ? portableRolePartyId(role) : "") ||
    (args.participantId ?? "").trim();
  const partyIndex = role?.partyIndex ?? args.partyIndex ?? 0;
  return { signerRoleId, participantId, partyIndex };
}

async function recordVs01SignerCompletionInner(
  args: RecordVs01SignerCompletionArgs,
): Promise<RecordVs01SignerCompletionResult> {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  const authoritative = resolveAuthoritativeCompletionIdentity(args);
  if (authoritative.blocked) {
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[vs01-recipient-identity-mismatch]", {
        code: authoritative.blocked.code,
        surface: "completion_persist",
      });
    }
    return {
      localSnapshot: readSigningPacketStatus(agreementId),
      fullySigned: false,
      serverSynced: false,
      serverFullyExecuted: false,
      completionEmailsSent: false,
      corpusStamped: false,
    };
  }
  const signerRoleId = authoritative.signerRoleId;
  const participantId = authoritative.participantId;
  const signingDateIso = (args.signingDateIso ?? "").trim() || todayIsoDateLocal();
  const signedDateDisplay = formatSigningDateDisplayFromIso(signingDateIso);
  const partyIndex = authoritative.partyIndex;
  const isLocalBridge = agreementId.startsWith("local_ag_");
  const consent = args.consent ?? versionedRecipientConsentIntent();
  const assignedFields = assignedFieldsFromRecipient(args.recipientFields, signerRoleId);
  const completionBody = {
    signer_role_id: signerRoleId,
    participant_id: participantId,
    document_id: documentId,
    display_name: (args.displayName ?? "").trim(),
    signed_date_iso: signingDateIso,
    signed_date_display: signedDateDisplay,
    assigned_fields: assignedFields,
    consent,
    packet_revision: (args.packetRevision ?? "").trim() || undefined,
  };

  let portable: Vs01CanonicalPacketPortableV1 | null = loadVs01CanonicalPacketPortable(documentId);
  let corpusStamped = false;
  let serverSynced = isLocalBridge;
  let serverFullyExecuted = false;
  let completionEmailsSent = false;
  let errorCode: string | undefined;
  let error: string | undefined;
  let status: number | undefined;
  let retryable = false;
  let completion: Vs01CompletionStatus | undefined;
  let receiptStatus: string | undefined;
  let receipt: Vs01UploadedPdfReceiptPointer | null | undefined;

  if (agreementId && !isLocalBridge) {
    try {
      const res = await postVs01SignerComplete(
        agreementId,
        {
          ...completionBody,
          portable_packet: portable ? (portable as unknown as Record<string, unknown>) : undefined,
        },
        args.recipientAccessToken,
      );
      serverSynced = res.ok;
      serverFullyExecuted = Boolean(res.fully_executed);
      completionEmailsSent = Boolean(res.completion_emails_sent);
      errorCode = res.errorCode;
      error = res.error;
      status = res.status;
      retryable = Boolean(res.retryable) || recipientCompletionIsRetryable(res.status ?? 0, res.errorCode ?? "");
      completion = res.completion as Vs01CompletionStatus | undefined;
      receiptStatus = res.receipt_status;
      receipt = res.uploaded_final_pdf_receipt;

      if (
        !res.ok
        || !confirmRecipientCompletionResponse({
          agreementId,
          documentId,
          signerRoleId,
          participantId,
          packetRevision: (args.packetRevision ?? "").trim() || undefined,
          completion,
        })
      ) {
        return {
          localSnapshot: readSigningPacketStatus(agreementId),
          fullySigned: false,
          serverSynced: false,
          serverFullyExecuted: false,
          completionEmailsSent: false,
          corpusStamped: false,
          errorCode: res.ok ? "completion_confirmation_mismatch" : errorCode,
          error: res.ok ? "completion_confirmation_mismatch" : error,
          status,
          retryable,
        };
      }

      const stamped = persistSignerCompletionToPortablePacket({
        documentId,
        agreementId,
        signerRoleId,
        partyIndex,
        signingDateIso,
        displayName: args.displayName,
        recipientFields: args.recipientFields,
        attachFinalSnapshot: serverFullyExecuted,
      });
      portable = stamped.portable ?? portable;
      corpusStamped = stamped.corpusStamped;
    } catch {
      return {
        localSnapshot: readSigningPacketStatus(agreementId),
        fullySigned: false,
        serverSynced: false,
        serverFullyExecuted: false,
        completionEmailsSent: false,
        corpusStamped: false,
        errorCode: "network",
        error: "network",
        status: 0,
        retryable: true,
      };
    }
  } else if (isLocalBridge) {
    const stamped = persistSignerCompletionToPortablePacket({
      documentId,
      agreementId,
      signerRoleId,
      partyIndex,
      signingDateIso,
      displayName: args.displayName,
      recipientFields: args.recipientFields,
      attachFinalSnapshot: false,
    });
    portable = stamped.portable ?? portable;
    corpusStamped = stamped.corpusStamped;
  }

  if (!serverSynced && !isLocalBridge) {
    return {
      localSnapshot: readSigningPacketStatus(agreementId),
      fullySigned: false,
      serverSynced: false,
      serverFullyExecuted: false,
      completionEmailsSent: false,
      corpusStamped: false,
      errorCode,
      error,
      status,
      retryable,
    };
  }

  const snap = applyLocalSignerPacketStatus(agreementId, signerRoleId, serverFullyExecuted);
  const localFullySigned = Boolean(snap?.fullySigned);

  return {
    localSnapshot: snap ?? readSigningPacketStatus(agreementId),
    fullySigned: serverFullyExecuted || localFullySigned,
    serverSynced,
    serverFullyExecuted,
    completionEmailsSent,
    corpusStamped,
    errorCode,
    error,
    status,
    retryable,
    completion,
    receiptStatus,
    receipt,
  };
}

/**
 * Record VS01 signer completion — server is authoritative when available; local packet is cache.
 */
export async function recordVs01SignerCompletion(
  args: RecordVs01SignerCompletionArgs,
): Promise<RecordVs01SignerCompletionResult> {
  const key = `${args.agreementId.trim()}:${args.signerRoleId.trim()}`;
  const inflight = completionInFlight.get(key);
  if (inflight) return inflight;

  const promise = recordVs01SignerCompletionInner(args).finally(() => {
    completionInFlight.delete(key);
  });
  completionInFlight.set(key, promise);
  return promise;
}

export function portableCorpusHash(portable: Vs01CanonicalPacketPortableV1 | null): string | null {
  if (!portable?.seed?.corpusPlain) return null;
  return fingerprintAgreementBody(portable.seed.corpusPlain);
}

/** Test-only: reset in-flight dedupe between cases. */
export function resetVs01SignerCompletionInFlightForTests(): void {
  completionInFlight.clear();
}
