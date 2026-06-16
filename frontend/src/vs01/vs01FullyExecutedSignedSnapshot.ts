/**
 * VS01 fully-executed signed corpus snapshot — authoritative post-signing document text.
 * Burned signatures + per-signer dates in witness blocks; persisted on server via portable packet.
 */

import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  buildVs01CanonicalPacketSeed,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import type { Vs01RecipientPlacedField } from "./types";
import {
  countSignedWitnessBlocks,
  formatSigningDateDisplayFromIso,
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
} from "./vs01WitnessBlockSigningDate";

export type Vs01FullyExecutedSignedSnapshotV1 = {
  v: 1;
  corpusPlain: string;
  corpusHash: string;
  savedAt: string;
  signerRoleIds: string[];
};

export type Vs01SignatureCompletedEvent = {
  signerRoleId: string;
  signedDateIso: string;
  signedDateDisplay: string;
  displayName: string;
};

export function parseSignatureCompletedEventsFromAudit(
  audit: AgreementDraft["audit_log"] | null | undefined,
): Vs01SignatureCompletedEvent[] {
  const out: Vs01SignatureCompletedEvent[] = [];
  for (const event of audit ?? []) {
    if (!event || typeof event !== "object") continue;
    if (String((event as { event_type?: string }).event_type ?? "") !== "signature_completed") continue;
    const val = (event as { value?: Record<string, unknown> }).value;
    if (!val || typeof val !== "object") continue;
    const signerRoleId = String(val.signer_role_id ?? "").trim();
    if (!signerRoleId) continue;
    out.push({
      signerRoleId,
      signedDateIso: String(val.signed_date_iso ?? "").trim(),
      signedDateDisplay: String(val.signed_date_display ?? "").trim(),
      displayName: String(val.participant_display_name ?? "").trim(),
    });
  }
  return out;
}

export function signatureTextForSignerRole(
  fields: readonly Vs01RecipientPlacedField[],
  signerRoleId: string,
): string {
  const rid = signerRoleId.trim();
  const sigField = fields.find(
    (f) =>
      f.type === "signature" &&
      ((f.assignedSignerRoleId ?? "").trim() === rid || (!f.assignedSignerRoleId && rid)),
  );
  const v = typeof sigField?.value === "string" ? sigField.value.trim() : "";
  if (v) return v;
  return "";
}

function mergeRecipientFields(
  portable: Vs01CanonicalPacketPortableV1,
  recipientFields?: readonly Vs01RecipientPlacedField[],
): Vs01RecipientPlacedField[] {
  if (!recipientFields?.length) return [...portable.fields];
  const byId = new Map(portable.fields.map((f) => [f.id, f]));
  for (const field of recipientFields) {
    byId.set(field.id, { ...byId.get(field.id), ...field });
  }
  return [...byId.values()];
}

/**
 * Apply one signer's signature + date into portable corpus and field values.
 */
export function applySignerCompletionToPortablePacket(args: {
  portable: Vs01CanonicalPacketPortableV1;
  agreementId: string;
  documentId: string;
  signerRoleId: string;
  partyIndex: number;
  signingDateIso: string;
  signatureText: string;
  recipientFields?: readonly Vs01RecipientPlacedField[];
}): {
  portable: Vs01CanonicalPacketPortableV1;
  corpusStamped: boolean;
  signatureStamped: boolean;
} {
  const signingDateIso = (args.signingDateIso || "").trim() || new Date().toISOString().slice(0, 10);
  const signatureText =
    (args.signatureText || "").trim() ||
    signatureTextForSignerRole(args.recipientFields ?? args.portable.fields, args.signerRoleId);

  let corpus = args.portable.seed.corpusPlain;
  let corpusStamped = false;
  let signatureStamped = false;

  if (signatureText) {
    const sig = stampWitnessBlockPartySignature(corpus, args.partyIndex, signatureText);
    if (sig.stamped) {
      corpus = sig.text;
      signatureStamped = true;
    }
  }

  const dated = stampWitnessBlockPartySigningDate(corpus, args.partyIndex, signingDateIso);
  if (dated.stamped) {
    corpus = dated.text;
    corpusStamped = true;
  }

  const nextFields = mergeRecipientFields(
    { ...args.portable, fields: args.portable.fields },
    args.recipientFields,
  );
  const nextSeed =
    buildVs01CanonicalPacketSeed({
      documentId: args.documentId.trim(),
      agreementId: args.agreementId.trim(),
      corpusPlain: corpus,
    }) ?? args.portable.seed;

  return {
    portable: {
      ...args.portable,
      seed: nextSeed,
      fields: nextFields,
    },
    corpusStamped,
    signatureStamped,
  };
}

export function buildFullyExecutedSignedSnapshot(
  portable: Vs01CanonicalPacketPortableV1,
): Vs01FullyExecutedSignedSnapshotV1 | null {
  const corpusPlain = (portable.seed.corpusPlain || "").trim();
  if (corpusPlain.length < 80) return null;
  const { signed, total } = countSignedWitnessBlocks(corpusPlain);
  const required = Math.max(total, portable.roles.filter((r) => r.requiresSignature !== false).length, 2);
  if (signed < required) return null;

  const signerRoleIds = portable.roles
    .filter((r) => r.requiresSignature !== false)
    .map((r) => r.roleId)
    .filter(Boolean);

  return {
    v: 1,
    corpusPlain,
    corpusHash: fingerprintAgreementBody(corpusPlain),
    savedAt: new Date().toISOString(),
    signerRoleIds,
  };
}

export function attachFullyExecutedSnapshotToPortable(
  portable: Vs01CanonicalPacketPortableV1,
): Vs01CanonicalPacketPortableV1 {
  const snap = buildFullyExecutedSignedSnapshot(portable);
  if (!snap) return portable;
  return { ...portable, fullyExecutedSnapshot: snap };
}

export function readFullyExecutedSnapshotFromDraft(
  draft: AgreementDraft | null | undefined,
): Vs01FullyExecutedSignedSnapshotV1 | null {
  if (!draft) return null;
  const stored = (draft as { vs01_signing_packet_v1?: Record<string, unknown> }).vs01_signing_packet_v1;
  if (!stored || typeof stored !== "object") return null;

  const serverSnap = stored.fully_executed_snapshot;
  if (serverSnap && typeof serverSnap === "object") {
    const corpusPlain = String((serverSnap as { corpus_plain?: string }).corpus_plain ?? "").trim();
    if (corpusPlain.length >= 80) {
      return {
        v: 1,
        corpusPlain,
        corpusHash: String((serverSnap as { corpus_hash?: string }).corpus_hash ?? "").trim(),
        savedAt: String((serverSnap as { saved_at?: string }).saved_at ?? "").trim(),
        signerRoleIds: [],
      };
    }
  }

  const portable = stored.portable as Vs01CanonicalPacketPortableV1 | undefined;
  if (portable?.fullyExecutedSnapshot?.corpusPlain?.trim()) {
    return portable.fullyExecutedSnapshot;
  }
  if (portable?.seed?.corpusPlain?.trim()) {
    const snap = buildFullyExecutedSignedSnapshot(portable);
    if (snap) return snap;
  }
  return null;
}

export function reconstructSignedCorpusFromAuditAndPortable(args: {
  draft: AgreementDraft;
  portable: Vs01CanonicalPacketPortableV1 | null;
}): string | null {
  const events = parseSignatureCompletedEventsFromAudit(args.draft.audit_log);
  if (!events.length || !args.portable) return null;

  let portable = args.portable;
  for (const event of events) {
    const role = portable.roles.find((r) => r.roleId === event.signerRoleId);
    const partyIndex = role?.partyIndex ?? 0;
    const sig =
      signatureTextForSignerRole(portable.fields, event.signerRoleId) ||
      event.displayName;
    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId: String(args.draft.id ?? portable.seed.agreementId),
      documentId: portable.seed.documentId,
      signerRoleId: event.signerRoleId,
      partyIndex,
      signingDateIso: event.signedDateIso || new Date().toISOString().slice(0, 10),
      signatureText: sig,
    });
    portable = applied.portable;
  }
  const snap = buildFullyExecutedSignedSnapshot(portable);
  return snap?.corpusPlain ?? null;
}

export function resolveVs01FullyExecutedSignedCorpus(
  draft: AgreementDraft | null | undefined,
): { text: string; source: "fully_executed_snapshot" | "reconstructed" } | null {
  const snap = readFullyExecutedSnapshotFromDraft(draft);
  if (snap?.corpusPlain?.trim()) {
    return { text: snap.corpusPlain.trim(), source: "fully_executed_snapshot" };
  }

  const stored = (draft as { vs01_signing_packet_v1?: Record<string, unknown> })?.vs01_signing_packet_v1;
  const portable = stored?.portable as Vs01CanonicalPacketPortableV1 | undefined;
  if (portable) {
    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({ draft: draft!, portable });
    if (rebuilt?.trim()) {
      return { text: rebuilt.trim(), source: "reconstructed" };
    }
  }
  return null;
}

export function formatSigningDateDisplayFromIsoExport(iso: string): string {
  return formatSigningDateDisplayFromIso(iso);
}
