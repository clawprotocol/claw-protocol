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
  extractRoleEntityNamesFromPortableRoles,
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
  stripWitnessExecutionOverlays,
} from "./vs01WitnessBlockSigningDate";
import { sanitizeVs01RenderCorpus } from "./vs01CorpusOrphanSectionSanitizer";
import {
  assertCompletedExecutionMetadataInvariant,
  logCompletedExecutionCorpusOverlaySources,
  resolveAuthoritativeCompletedExecutionCorpus,
} from "./paidProCompletedExecutionMetadataAuthority";
import {
  resolveCompletedSignerByFromEvent,
  resolveCompletedSignerByText,
} from "./completedSignerOverlayResolver";

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
  signedAt?: string;
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
      signedAt: String((event as { at?: string }).at ?? "").trim(),
    });
  }
  return out;
}

export function signatureTextForSignerRole(
  fields: readonly Vs01RecipientPlacedField[],
  signerRoleId: string,
  opts?: { partyIndex?: number; signerEmail?: string | null; auditDisplayName?: string | null; roleSignerName?: string | null },
): string {
  const resolved = resolveCompletedSignerByText({
    agreementId: "",
    source: "signatureTextForSignerRole",
    signerRoleId,
    partyIndex: opts?.partyIndex ?? -1,
    signerEmail: opts?.signerEmail,
    roleSignerName: opts?.roleSignerName,
    auditDisplayName: opts?.auditDisplayName,
    fields,
  });
  return resolved.byText;
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
  const role = args.portable.roles.find((r) => (r.roleId ?? "").trim() === args.signerRoleId.trim());
  const signatureText =
    (args.signatureText || "").trim() ||
    signatureTextForSignerRole(args.recipientFields ?? args.portable.fields, args.signerRoleId, {
      partyIndex: args.partyIndex,
      signerEmail: role?.signerEmail ?? role?.reviewEmail,
      roleSignerName: role?.signerName,
    });

  const roleEntityNames = extractRoleEntityNamesFromPortableRoles(args.portable.roles);

  let corpus = args.portable.seed.corpusPlain;
  let corpusStamped = false;
  let signatureStamped = false;

  if (signatureText) {
    const sig = stampWitnessBlockPartySignature(corpus, args.partyIndex, signatureText, roleEntityNames);
    if (sig.stamped) {
      corpus = sig.text;
      signatureStamped = true;
    }
  }

  const dated = stampWitnessBlockPartySigningDate(corpus, args.partyIndex, signingDateIso, roleEntityNames);
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
  const rawCorpus = (portable.seed.corpusPlain || "").trim();
  const corpusPlain = sanitizeVs01RenderCorpus(rawCorpus, {
    boundary: "vs01_signed_snapshot",
  }).text.trim();
  if (corpusPlain.length < 80) return null;
  const roleEntityNames = extractRoleEntityNamesFromPortableRoles(portable.roles);
  const { signed, total } = countSignedWitnessBlocks(corpusPlain, roleEntityNames);
  const requiredRoles = portable.roles.filter((r) => r.requiresSignature !== false).length;
  const required = Math.max(total, requiredRoles, 2);
  const sigFieldsFilled = portable.fields.filter(
    (f) =>
      f.type === "signature" &&
      !f.autoInitials &&
      typeof f.value === "string" &&
      f.value.trim().length > 0,
  ).length;
  const tailFilledBy = (corpusPlain.slice(-8000).match(/^[^\n]*by\s*:\s*(?!_{2,})\S/im) || []).length;
  const witnessComplete = signed >= required;
  const fieldsComplete = sigFieldsFilled >= required && tailFilledBy >= required;
  if (!witnessComplete && !fieldsComplete) return null;

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
  source?: string;
}): string | null {
  const events = parseSignatureCompletedEventsFromAudit(args.draft.audit_log);
  if (!events.length || !args.portable) return null;

  const agreementId = String(args.draft.id ?? args.portable.seed.agreementId).trim();
  const overlaySource = args.source ?? "reconstructSignedCorpusFromAuditAndPortable";
  const baseline = stripWitnessExecutionOverlays(args.portable.seed.corpusPlain);

  let portable: Vs01CanonicalPacketPortableV1 = {
    ...args.portable,
    seed: {
      ...args.portable.seed,
      corpusPlain: baseline,
    },
  };

  for (const event of events) {
    const resolved = resolveCompletedSignerByFromEvent({
      agreementId,
      source: overlaySource,
      portable,
      event,
    });
    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId,
      documentId: portable.seed.documentId,
      signerRoleId: event.signerRoleId,
      partyIndex: resolved.partyIndex,
      signingDateIso:
        event.signedDateIso ||
        (event.signedAt ? event.signedAt.slice(0, 10) : "") ||
        new Date().toISOString().slice(0, 10),
      signatureText: resolved.byText,
    });
    portable = applied.portable;
  }
  const snap = buildFullyExecutedSignedSnapshot(portable);
  return snap?.corpusPlain ?? null;
}

export function resolveVs01FullyExecutedSignedCorpus(
  draft: AgreementDraft | null | undefined,
): { text: string; source: "fully_executed_snapshot" | "reconstructed" | "portable_packet" } | null {
  if (!draft) return null;

  const stored = (draft as { vs01_signing_packet_v1?: Record<string, unknown> })?.vs01_signing_packet_v1;
  const portable = (stored?.portable as Vs01CanonicalPacketPortableV1 | undefined) ?? null;
  const snap = readFullyExecutedSnapshotFromDraft(draft);

  const authoritative = resolveAuthoritativeCompletedExecutionCorpus({
    draft,
    portable,
    snapshotCorpus: snap?.corpusPlain ?? null,
    preferSource: snap?.corpusPlain?.trim() ? "fully_executed_snapshot" : undefined,
  });
  if (authoritative) {
    const agreementId = String(draft.id ?? portable?.seed?.agreementId ?? "").trim();
    if (agreementId) {
      logCompletedExecutionCorpusOverlaySources({
        agreementId,
        source: `resolveVs01FullyExecutedSignedCorpus:${authoritative.source}`,
        corpusPlain: authoritative.text,
        portable,
      });
    }
    return { text: authoritative.text, source: authoritative.source };
  }

  if (portable) {
    const fromPortable = buildFullyExecutedSignedSnapshot(portable);
    if (fromPortable?.corpusPlain?.trim()) {
      const text = fromPortable.corpusPlain.trim();
      assertCompletedExecutionMetadataInvariant({
        corpusPlain: text,
        portable,
        source: "portable_packet",
      });
      return { text, source: "portable_packet" };
    }
  }
  return null;
}

export function formatSigningDateDisplayFromIsoExport(iso: string): string {
  return formatSigningDateDisplayFromIso(iso);
}
