/**
 * Phase 3 — immutable frozen signing authority bound to accepted corpus hash.
 * Post-freeze signing consumers must resolve identity from this snapshot, not slot index or prose.
 */

import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import type { AuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { partyIdFromStableKey } from "./canonicalPartyIdentityModel";
import { readStarterToPaidPartyHandoff } from "./starterToPaidPartyHandoff";
import {
  readSignerExecutionAuthority,
  type SignerExecutionRecord,
} from "./signerExecutionAuthority";
import { looksLikeEmail } from "./recipientEmailValidation";
import {
  fetchFrozenSigningAuthorityFromBackend,
  persistFrozenSigningAuthorityToBackend,
} from "../../agreement/frozenSigningAuthorityApi";

export type FrozenSigningAuthorityPartyV1 = {
  agreementPartyId: string;
  legalEntityName: string;
  agreementRole?: string;
  canonicalOrder: number;
};

export type FrozenSigningAuthoritySignerV1 = {
  signerRecordId: string;
  agreementPartyId: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail: string;
  signingOrder: number;
  requiresSignature: boolean;
  requiresInitials: boolean;
};

export type FrozenSigningAuthorityRecipientV1 = {
  recipientRecordId: string;
  agreementPartyId?: string;
  signerRecordId?: string;
  recipientType: "signer" | "reviewer" | "cc";
  email: string;
};

export type FrozenSigningAuthorityExecutionV1 = {
  partyOrder: string[];
  signerOrder: string[];
  executionBlockHash: string;
};

export type RequiredSigningAction = {
  actionId: string;
  signerRecordId: string;
  agreementPartyId: string;
  type: "signature" | "initials" | "date";
  fieldId: string;
  anchor?: string;
  required: boolean;
  completedAt?: string;
};

export type FrozenSigningAuthorityPacketState =
  | "draft"
  | "active"
  | "partially_signed"
  | "completed"
  | "cancelled"
  | "superseded";

export type FrozenSigningAuthoritySnapshotV1 = {
  version: 1;
  agreementId: string;
  agreementSessionId: string;
  frozenCorpusHash: string;
  frozenAt: string;
  parties: FrozenSigningAuthorityPartyV1[];
  signers: FrozenSigningAuthoritySignerV1[];
  recipients: FrozenSigningAuthorityRecipientV1[];
  execution: FrozenSigningAuthorityExecutionV1;
  packetState?: FrozenSigningAuthorityPacketState;
  activePacketRevision?: string;
  requiredActions?: RequiredSigningAction[];
};

export type FrozenSigningAuthorityValidationError =
  | "unknown_party_id"
  | "duplicate_signer_record_id"
  | "missing_required_signer_email"
  | "execution_party_mismatch"
  | "corpus_hash_mismatch"
  | "stale_handoff_fingerprint"
  | "empty_parties"
  | "unsupported_version"
  | "agreement_id_mismatch"
  | "packet_id_mismatch"
  | "stale_packet_revision";

const STORAGE_KEY_PREFIX = "claw_frozen_signing_authority_v1:";

let inMemorySnapshotBySession = new Map<string, FrozenSigningAuthoritySnapshotV1>();

function storageKey(agreementSessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${agreementSessionId.trim()}`;
}

function executionTailHash(corpus: string): string {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : corpus.slice(Math.floor(corpus.length * 0.72));
  return hashPaidProCorpus(tail.trim());
}

function resolveAgreementPartyIdForManifestIndex(args: {
  index: number;
  legalName: string;
  handoffPartyIds: readonly string[];
  snapshotPartyIds: readonly string[];
}): string {
  const fromSnapshot = args.snapshotPartyIds[args.index]?.trim();
  if (fromSnapshot) return fromSnapshot;
  const handoff = readStarterToPaidPartyHandoff();
  if (handoff) {
    const byOrder = handoff.parties.find((p) => p.canonicalOrder === args.index);
    if (byOrder?.agreementPartyId) return byOrder.agreementPartyId;
    const byName = handoff.parties.find((p) =>
      partyLegalNamesMatch(p.legalEntityName, args.legalName),
    );
    if (byName?.agreementPartyId) return byName.agreementPartyId;
  }
  if (args.handoffPartyIds[args.index]?.trim()) return args.handoffPartyIds[args.index].trim();
  return partyIdFromStableKey(args.legalName, args.index);
}

function stableRecipientRecordId(signerRecordId: string, recipientType: string): string {
  return `recipient:${recipientType}:${signerRecordId}`;
}

export function validateFrozenSigningAuthoritySnapshot(
  snapshot: FrozenSigningAuthoritySnapshotV1,
  acceptedCorpusHash?: string | null,
  opts?: {
    expectedAgreementId?: string;
    expectedVersion?: number;
    expectedPacketRevision?: string;
  },
): { ok: true } | { ok: false; error: FrozenSigningAuthorityValidationError; detail?: string } {
  if (opts?.expectedVersion != null && snapshot.version !== opts.expectedVersion) {
    return { ok: false, error: "unsupported_version", detail: String(snapshot.version) };
  }
  if (snapshot.version !== 1) {
    return { ok: false, error: "unsupported_version", detail: String(snapshot.version) };
  }
  if (opts?.expectedAgreementId && snapshot.agreementId !== opts.expectedAgreementId.trim()) {
    return { ok: false, error: "agreement_id_mismatch", detail: snapshot.agreementId };
  }
  if (
    opts?.expectedPacketRevision &&
    snapshot.activePacketRevision &&
    snapshot.activePacketRevision !== opts.expectedPacketRevision.trim()
  ) {
    return { ok: false, error: "stale_packet_revision", detail: snapshot.activePacketRevision };
  }
  if (!snapshot.parties.length) {
    return { ok: false, error: "empty_parties" };
  }

  const partyIds = new Set(snapshot.parties.map((p) => p.agreementPartyId));
  const signerIds = new Set<string>();

  for (const signer of snapshot.signers) {
    if (!partyIds.has(signer.agreementPartyId)) {
      return {
        ok: false,
        error: "unknown_party_id",
        detail: signer.agreementPartyId,
      };
    }
    if (signerIds.has(signer.signerRecordId)) {
      return { ok: false, error: "duplicate_signer_record_id", detail: signer.signerRecordId };
    }
    signerIds.add(signer.signerRecordId);
    if (signer.requiresSignature && !looksLikeEmail(signer.signerEmail)) {
      return {
        ok: false,
        error: "missing_required_signer_email",
        detail: signer.signerRecordId,
      };
    }
  }

  if (acceptedCorpusHash && snapshot.frozenCorpusHash !== acceptedCorpusHash.trim()) {
    return { ok: false, error: "corpus_hash_mismatch" };
  }

  const expectedPartyOrder = [...snapshot.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.agreementPartyId);
  if (snapshot.execution.partyOrder.join("|") !== expectedPartyOrder.join("|")) {
    return { ok: false, error: "execution_party_mismatch" };
  }

  return { ok: true };
}

export function extractRequiredSigningActions(
  snapshot: FrozenSigningAuthoritySnapshotV1,
): RequiredSigningAction[] {
  if (snapshot.requiredActions?.length) return [...snapshot.requiredActions];
  const actions: RequiredSigningAction[] = [];
  for (const signer of snapshot.signers) {
    if (!signer.requiresSignature) continue;
    actions.push({
      actionId: `signature:${signer.signerRecordId}`,
      signerRecordId: signer.signerRecordId,
      agreementPartyId: signer.agreementPartyId,
      type: "signature",
      fieldId: `signature:${signer.signerRecordId}`,
      required: true,
    });
    if (signer.requiresInitials) {
      actions.push({
        actionId: `initials:${signer.signerRecordId}`,
        signerRecordId: signer.signerRecordId,
        agreementPartyId: signer.agreementPartyId,
        type: "initials",
        fieldId: `initials:${signer.signerRecordId}`,
        required: true,
      });
    }
  }
  return actions;
}

export type BuildFrozenSigningAuthoritySnapshotArgs = {
  agreementId: string;
  authoritativeSnapshot: AuthoritativeSigningSnapshot;
  intakeText?: string | null;
  requiresInitialsByPartyId?: ReadonlyMap<string, boolean>;
  /** Review-only emails not tied to a signing party. */
  reviewerEmails?: readonly { email: string; agreementPartyId?: string }[];
};

export function buildFrozenSigningAuthoritySnapshotV1(
  args: BuildFrozenSigningAuthoritySnapshotArgs,
): FrozenSigningAuthoritySnapshotV1 {
  const agreementSessionId = getOrInitSessionAgreementGenerationId();
  const manifest = args.authoritativeSnapshot.partyManifest;
  const meta = args.authoritativeSnapshot.signerMetadata;
  const snapshotPartyIds = meta.partyIds ?? [];
  const handoff = readStarterToPaidPartyHandoff(args.intakeText ?? undefined);
  const handoffPartyIds = handoff?.parties.map((p) => p.agreementPartyId) ?? [];
  const executionRecords = readSignerExecutionAuthority(args.intakeText)?.records ?? [];

  const parties: FrozenSigningAuthorityPartyV1[] = manifest.parties
    .filter((p) => String(p.partyName ?? "").trim().length >= 2)
    .map((p) => {
      const legalEntityName = String(p.partyName ?? "").trim();
      const handoffParty =
        handoff?.parties.find((hp) => hp.canonicalOrder === p.index) ??
        handoff?.parties.find((hp) => partyLegalNamesMatch(hp.legalEntityName, legalEntityName));
      return {
        agreementPartyId: resolveAgreementPartyIdForManifestIndex({
          index: p.index,
          legalName: legalEntityName,
          handoffPartyIds,
          snapshotPartyIds,
        }),
        legalEntityName,
        agreementRole: handoffParty?.agreementRole ?? (p.roleLabel?.trim() || undefined),
        canonicalOrder: p.index,
      };
    });

  const partyById = new Map(parties.map((p) => [p.agreementPartyId, p] as const));

  const signers: FrozenSigningAuthoritySignerV1[] = [];
  const usedExecutionRecords = new Set<string>();

  for (const party of parties) {
    const execRecords = executionRecords.filter((r) => r.agreementPartyId === party.agreementPartyId);
    const manifestEntry = manifest.parties.find((m) => m.index === party.canonicalOrder);
    const email =
      execRecords.find((r) => r.signerEmail?.trim())?.signerEmail?.trim() ||
      String(manifestEntry?.email ?? "").trim() ||
      (party.canonicalOrder === 0
        ? meta.recipient1Email
        : party.canonicalOrder === 1
          ? meta.recipient2Email
          : meta.extraPartyReviewEmails[party.canonicalOrder - 2] ?? "") ||
      "";
    const signerName =
      execRecords.find((r) => r.signerName?.trim())?.signerName?.trim() ||
      String(manifestEntry?.signerName ?? "").trim() ||
      (meta.partySignerNames[party.canonicalOrder] ?? "").trim() ||
      undefined;
    const signerTitle =
      execRecords.find((r) => r.signerTitle?.trim())?.signerTitle?.trim() ||
      String(manifestEntry?.signerTitle ?? "").trim() ||
      (meta.partySignerTitles[party.canonicalOrder] ?? "").trim() ||
      undefined;

    const requiresSignature = Boolean(
      (execRecords.some((r) => r.isSigningParty !== false) ||
        signerName ||
        looksLikeEmail(email)) &&
      looksLikeEmail(email),
    );
    if (!requiresSignature && !signerName && !looksLikeEmail(email)) continue;

    const execRecord = execRecords[0];
    const signerRecordId =
      execRecord?.signerRecordId ??
      `signer:${party.agreementPartyId}:0`;
    usedExecutionRecords.add(signerRecordId);

    signers.push({
      signerRecordId,
      agreementPartyId: party.agreementPartyId,
      signerName,
      signerTitle,
      signerEmail: email,
      signingOrder: execRecord?.signingOrder ?? party.canonicalOrder,
      requiresSignature: true,
      requiresInitials: args.requiresInitialsByPartyId?.get(party.agreementPartyId) ?? false,
    });
  }

  // Include execution records for parties not yet in manifest loop (multi-signer per party).
  for (const record of executionRecords) {
    if (usedExecutionRecords.has(record.signerRecordId)) continue;
    if (!partyById.has(record.agreementPartyId)) continue;
    if (!record.isSigningParty && !record.signerEmail?.trim()) continue;
    signers.push({
      signerRecordId: record.signerRecordId,
      agreementPartyId: record.agreementPartyId,
      signerName: record.signerName?.trim() || undefined,
      signerTitle: record.signerTitle?.trim() || undefined,
      signerEmail: record.signerEmail?.trim() || "",
      signingOrder: record.signingOrder ?? signers.length,
      requiresSignature: record.isSigningParty !== false,
      requiresInitials: args.requiresInitialsByPartyId?.get(record.agreementPartyId) ?? false,
    });
  }

  signers.sort((a, b) => a.signingOrder - b.signingOrder || a.signerRecordId.localeCompare(b.signerRecordId));

  const recipients: FrozenSigningAuthorityRecipientV1[] = signers.map((s) => ({
    recipientRecordId: stableRecipientRecordId(s.signerRecordId, "signer"),
    agreementPartyId: s.agreementPartyId,
    signerRecordId: s.signerRecordId,
    recipientType: "signer" as const,
    email: s.signerEmail,
  }));

  for (const reviewer of args.reviewerEmails ?? []) {
    const email = reviewer.email.trim();
    if (!looksLikeEmail(email)) continue;
    const partyId = reviewer.agreementPartyId?.trim();
    recipients.push({
      recipientRecordId: stableRecipientRecordId(
        partyId ? `review:${partyId}` : `review:${email}`,
        "reviewer",
      ),
      agreementPartyId: partyId,
      recipientType: "reviewer",
      email,
    });
  }

  const partyOrder = [...parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.agreementPartyId);
  const signerOrder = signers.map((s) => s.signerRecordId);

  return {
    version: 1,
    agreementId: args.agreementId.trim() || agreementSessionId,
    agreementSessionId,
    frozenCorpusHash: args.authoritativeSnapshot.hash,
    frozenAt: new Date(args.authoritativeSnapshot.frozenAt).toISOString(),
    parties,
    signers,
    recipients,
    execution: {
      partyOrder,
      signerOrder,
      executionBlockHash: executionTailHash(args.authoritativeSnapshot.corpus),
    },
  };
}

function persistSnapshot(snapshot: FrozenSigningAuthoritySnapshotV1): void {
  inMemorySnapshotBySession.set(snapshot.agreementSessionId, snapshot);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(snapshot.agreementSessionId), JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export function createFrozenSigningAuthoritySnapshot(
  args: BuildFrozenSigningAuthoritySnapshotArgs & { persistToBackend?: boolean },
): FrozenSigningAuthoritySnapshotV1 | null {
  const snapshot = buildFrozenSigningAuthoritySnapshotV1(args);
  const validation = validateFrozenSigningAuthoritySnapshot(
    snapshot,
    args.authoritativeSnapshot.hash,
    { expectedAgreementId: args.agreementId },
  );
  if (!validation.ok) {
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[frozen-signing-authority-rejected]", validation);
    }
    return null;
  }
  const withActions: FrozenSigningAuthoritySnapshotV1 = {
    ...snapshot,
    packetState: "draft",
    requiredActions: extractRequiredSigningActions(snapshot),
  };
  persistSnapshot(withActions);
  if (args.persistToBackend !== false && args.agreementId.trim()) {
    const shouldPersistBackend =
      args.persistToBackend ??
      !(typeof import.meta !== "undefined" && import.meta.env?.MODE === "test");
    if (shouldPersistBackend) {
      void persistFrozenSigningAuthorityToBackend(args.agreementId.trim(), withActions);
    }
  }
  return withActions;
}

export type LoadFrozenSigningAuthorityArgs = {
  agreementId: string;
  packetId?: string;
  expectedCorpusHash?: string;
  expectedVersion?: number;
  expectedPacketRevision?: string;
};

/** Backend > verified local cache > fail closed. Local never outranks valid backend. */
export async function loadFrozenSigningAuthority(
  args: LoadFrozenSigningAuthorityArgs,
): Promise<FrozenSigningAuthoritySnapshotV1 | null> {
  const agreementId = args.agreementId.trim();
  if (!agreementId) return null;

  const backend = await fetchFrozenSigningAuthorityFromBackend(agreementId);
  if (backend) {
    const validation = validateFrozenSigningAuthoritySnapshot(backend, args.expectedCorpusHash, {
      expectedAgreementId: agreementId,
      expectedVersion: args.expectedVersion ?? 1,
      expectedPacketRevision: args.expectedPacketRevision,
    });
    if (!validation.ok) return null;
    persistSnapshot(backend);
    return backend;
  }

  const local = readFrozenSigningAuthoritySnapshot();
  if (local && local.agreementId === agreementId) {
    const validation = validateFrozenSigningAuthoritySnapshot(local, args.expectedCorpusHash, {
      expectedAgreementId: agreementId,
      expectedVersion: args.expectedVersion ?? 1,
      expectedPacketRevision: args.expectedPacketRevision,
    });
    if (!validation.ok) return null;
    return local;
  }

  return null;
}

export function readFrozenSigningAuthoritySnapshot(
  agreementSessionId?: string | null,
): FrozenSigningAuthoritySnapshotV1 | null {
  const sessionId = (agreementSessionId ?? getOrInitSessionAgreementGenerationId()).trim();
  const mem = inMemorySnapshotBySession.get(sessionId);
  if (mem) return mem;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FrozenSigningAuthoritySnapshotV1;
    if (parsed?.version !== 1 || parsed.agreementSessionId !== sessionId) return null;
    inMemorySnapshotBySession.set(sessionId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function hasFrozenSigningAuthoritySnapshot(): boolean {
  return Boolean(readFrozenSigningAuthoritySnapshot());
}

/**
 * Bind a backend-loaded frozen snapshot to this tab's session id so remount readers
 * (`readFrozenSigningAuthoritySnapshot()` with no args) see it. Does not POST.
 */
export function adoptFrozenSigningAuthoritySnapshotForCurrentSession(
  snapshot: FrozenSigningAuthoritySnapshotV1,
): FrozenSigningAuthoritySnapshotV1 {
  const sessionId = getOrInitSessionAgreementGenerationId();
  const adopted: FrozenSigningAuthoritySnapshotV1 = {
    ...snapshot,
    agreementSessionId: sessionId,
  };
  persistSnapshot(adopted);
  return adopted;
}

export function clearFrozenSigningAuthoritySnapshotForSession(agreementSessionId?: string): void {
  const sessionId = (agreementSessionId ?? getOrInitSessionAgreementGenerationId()).trim();
  inMemorySnapshotBySession.delete(sessionId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    /* ignore */
  }
}

export function clearFrozenSigningAuthoritySnapshotForTests(): void {
  inMemorySnapshotBySession = new Map();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function resolveFrozenPartyByAgreementPartyId(
  agreementPartyId: string,
  snapshot?: FrozenSigningAuthoritySnapshotV1 | null,
): FrozenSigningAuthorityPartyV1 | null {
  const snap = snapshot ?? readFrozenSigningAuthoritySnapshot();
  if (!snap) return null;
  return snap.parties.find((p) => p.agreementPartyId === agreementPartyId) ?? null;
}

export function resolveFrozenSignerByRecordId(
  signerRecordId: string,
  snapshot?: FrozenSigningAuthoritySnapshotV1 | null,
): FrozenSigningAuthoritySignerV1 | null {
  const snap = snapshot ?? readFrozenSigningAuthoritySnapshot();
  if (!snap) return null;
  return snap.signers.find((s) => s.signerRecordId === signerRecordId) ?? null;
}

export function resolveFrozenSignerForPartyIndex(
  partyIndex: number,
  snapshot?: FrozenSigningAuthoritySnapshotV1 | null,
): FrozenSigningAuthoritySignerV1 | null {
  const snap = snapshot ?? readFrozenSigningAuthoritySnapshot();
  if (!snap) return null;
  const party = snap.parties.find((p) => p.canonicalOrder === partyIndex);
  if (!party) return null;
  return snap.signers.find((s) => s.agreementPartyId === party.agreementPartyId) ?? null;
}

export function resolveFrozenAgreementPartyIdForIndex(
  partyIndex: number,
  snapshot?: FrozenSigningAuthoritySnapshotV1 | null,
): string | null {
  const snap = snapshot ?? readFrozenSigningAuthoritySnapshot();
  if (!snap) return null;
  return snap.parties.find((p) => p.canonicalOrder === partyIndex)?.agreementPartyId ?? null;
}

export type SigningStatusCounts = {
  legalPartyCount: number;
  signerCount: number;
  requiredSignerCount: number;
  invitationCount: number;
  completedSignerCount: number;
  completedRequiredActionCount: number;
};

export function resolveSigningStatusCounts(args: {
  snapshot: FrozenSigningAuthoritySnapshotV1;
  completedSignerRecordIds?: readonly string[];
  completedActionIds?: readonly string[];
}): SigningStatusCounts {
  const requiredSigners = args.snapshot.signers.filter((s) => s.requiresSignature);
  const invitations = args.snapshot.recipients.filter((r) => r.recipientType === "signer");
  const completed = new Set(args.completedSignerRecordIds ?? []);
  const completedRequired = requiredSigners.filter((s) => completed.has(s.signerRecordId));
  const requiredActions = extractRequiredSigningActions(args.snapshot);
  const completedActionSet = new Set(args.completedActionIds ?? []);
  const completedRequiredActions = requiredActions.filter(
    (a) => a.required && completedActionSet.has(a.actionId),
  );
  return {
    legalPartyCount: args.snapshot.parties.length,
    signerCount: args.snapshot.signers.length,
    requiredSignerCount: requiredSigners.length,
    invitationCount: invitations.length,
    completedSignerCount: completedRequired.length,
    completedRequiredActionCount:
      completedRequiredActions.length || completedRequired.length,
  };
}

export function frozenSnapshotToLegalPartyRows(
  snapshot: FrozenSigningAuthoritySnapshotV1,
): Array<{
  id: string;
  name: string;
  role: "owner" | "party";
  email?: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  requiresSignature: boolean;
}> {
  return snapshot.parties.map((party) => {
    const signer = snapshot.signers.find((s) => s.agreementPartyId === party.agreementPartyId);
    const isOwner = party.canonicalOrder === 0;
    return {
      id: party.agreementPartyId,
      name: party.legalEntityName,
      role: isOwner ? "owner" : "party",
      email: signer?.signerEmail,
      signerName: signer?.signerName,
      signerTitle: signer?.signerTitle,
      signerEmail: signer?.signerEmail,
      requiresSignature: signer?.requiresSignature ?? false,
    };
  });
}

export function attachSignerExecutionRecordsToFrozenSnapshot(
  records: readonly SignerExecutionRecord[],
  intakeText?: string | null,
): void {
  void records;
  void intakeText;
  /* Phase 2 records are consumed at build time via readSignerExecutionAuthority. */
}
