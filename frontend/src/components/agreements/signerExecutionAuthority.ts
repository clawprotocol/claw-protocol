/**
 * Phase 2 — signer/execution records linked to legal parties by agreementPartyId.
 * Signer data enriches a legal party; it never replaces legal entity identity.
 */

import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";

export type SignerExecutionSource =
  | "signer_setup"
  | "intake_contact"
  | "saved_metadata"
  | "user_edit";

export type SignerNoticeContact = {
  name?: string;
  email?: string;
  address?: string;
};

export type SignerExecutionRecord = {
  agreementPartyId: string;
  signerRecordId: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  reviewRecipientName?: string;
  reviewRecipientEmail?: string;
  noticeContact?: SignerNoticeContact;
  isSigningParty: boolean;
  signingOrder?: number;
  source: SignerExecutionSource;
};

export type SignerExecutionAuthoritySnapshot = {
  version: 1;
  agreementSessionId: string;
  intakeFingerprint: string;
  records: SignerExecutionRecord[];
  establishedAt: number;
};

const STORAGE_KEY_PREFIX = "claw_signer_execution_authority_v1:";

let inMemorySignerAuthority = new Map<string, SignerExecutionAuthoritySnapshot>();

function storageKey(generationId: string): string {
  return `${STORAGE_KEY_PREFIX}${generationId}`;
}

function stableSignerRecordId(agreementPartyId: string, ordinal: number): string {
  return `signer:${agreementPartyId}:${ordinal}`;
}

export function clearSignerExecutionAuthorityForTests(): void {
  inMemorySignerAuthority = new Map();
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

export function clearSignerExecutionAuthorityForCurrentSession(): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  inMemorySignerAuthority.delete(generationId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(generationId));
  } catch {
    /* ignore */
  }
}

function persistSnapshot(snapshot: SignerExecutionAuthoritySnapshot): void {
  inMemorySignerAuthority.set(snapshot.agreementSessionId, snapshot);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(snapshot.agreementSessionId), JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export function readSignerExecutionAuthority(
  intakeText?: string | null,
): SignerExecutionAuthoritySnapshot | null {
  const generationId = getOrInitSessionAgreementGenerationId();
  const mem = inMemorySignerAuthority.get(generationId);
  if (mem) {
    if (intakeText && mem.intakeFingerprint !== shortIntakeFingerprint(intakeText)) return null;
    return mem;
  }
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(generationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignerExecutionAuthoritySnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return null;
    if (parsed.agreementSessionId !== generationId) return null;
    if (intakeText && parsed.intakeFingerprint !== shortIntakeFingerprint(intakeText)) return null;
    inMemorySignerAuthority.set(generationId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeSignerExecutionAuthority(
  records: readonly SignerExecutionRecord[],
  intakeText: string | null | undefined,
): SignerExecutionAuthoritySnapshot {
  const agreementSessionId = getOrInitSessionAgreementGenerationId();
  const snapshot: SignerExecutionAuthoritySnapshot = {
    version: 1,
    agreementSessionId,
    intakeFingerprint: shortIntakeFingerprint(String(intakeText ?? "")),
    records: records.map((r) => ({ ...r })),
    establishedAt: Date.now(),
  };
  persistSnapshot(snapshot);

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV && import.meta.env.MODE !== "test") {
    for (const record of snapshot.records) {
      // eslint-disable-next-line no-console
      console.info("[signer-authority-attached]", {
        partyId: record.agreementPartyId,
        hasSignerName: Boolean(record.signerName?.trim()),
        hasTitle: Boolean(record.signerTitle?.trim()),
        hasEmail: Boolean(record.signerEmail?.trim()),
        source: record.source,
      });
    }
  }

  return snapshot;
}

export function upsertSignerExecutionRecord(
  record: SignerExecutionRecord,
  intakeText?: string | null,
): SignerExecutionAuthoritySnapshot {
  const existing = readSignerExecutionAuthority(intakeText);
  const records = [...(existing?.records ?? [])];
  const idx = records.findIndex(
    (r) =>
      r.signerRecordId === record.signerRecordId ||
      (r.agreementPartyId === record.agreementPartyId && r.signingOrder === record.signingOrder),
  );
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  return writeSignerExecutionAuthority(records, intakeText);
}

export function attachSignerToParty(input: {
  agreementPartyId: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  reviewRecipientName?: string;
  reviewRecipientEmail?: string;
  noticeContact?: SignerNoticeContact;
  isSigningParty?: boolean;
  signingOrder?: number;
  source?: SignerExecutionSource;
  intakeText?: string | null;
  signerOrdinal?: number;
}): SignerExecutionRecord {
  const record: SignerExecutionRecord = {
    agreementPartyId: input.agreementPartyId,
    signerRecordId: stableSignerRecordId(input.agreementPartyId, input.signerOrdinal ?? 0),
    signerName: input.signerName?.trim() || undefined,
    signerTitle: input.signerTitle?.trim() || undefined,
    signerEmail: input.signerEmail?.trim() || undefined,
    reviewRecipientName: input.reviewRecipientName?.trim() || undefined,
    reviewRecipientEmail: input.reviewRecipientEmail?.trim() || undefined,
    noticeContact: input.noticeContact,
    isSigningParty: input.isSigningParty ?? true,
    signingOrder: input.signingOrder,
    source: input.source ?? "signer_setup",
  };
  upsertSignerExecutionRecord(record, input.intakeText);
  return record;
}

export function readSignerRecordsForParty(
  agreementPartyId: string,
  intakeText?: string | null,
): SignerExecutionRecord[] {
  const authority = readSignerExecutionAuthority(intakeText);
  if (!authority) return [];
  return authority.records.filter((r) => r.agreementPartyId === agreementPartyId);
}

export function readSignerRecordCount(intakeText?: string | null): number {
  return readSignerExecutionAuthority(intakeText)?.records.length ?? 0;
}

export function buildSignerRecordsFromManifestSlots(input: {
  parties: ReadonlyArray<{
    agreementPartyId: string;
    legalEntityName: string;
    signerName?: string | null;
    signerTitle?: string | null;
    signerEmail?: string | null;
    reviewRecipientName?: string | null;
    reviewRecipientEmail?: string | null;
    signingOrder?: number;
  }>;
  intakeText?: string | null;
  source?: SignerExecutionSource;
}): SignerExecutionRecord[] {
  return input.parties.map((party, index) => ({
    agreementPartyId: party.agreementPartyId,
    signerRecordId: stableSignerRecordId(party.agreementPartyId, 0),
    signerName: party.signerName?.trim() || undefined,
    signerTitle: party.signerTitle?.trim() || undefined,
    signerEmail: party.signerEmail?.trim() || undefined,
    reviewRecipientName: party.reviewRecipientName?.trim() || undefined,
    reviewRecipientEmail: party.reviewRecipientEmail?.trim() || undefined,
    isSigningParty: Boolean(party.signerName?.trim() || party.signerEmail?.trim()),
    signingOrder: party.signingOrder ?? index,
    source: input.source ?? "signer_setup",
  }));
}
