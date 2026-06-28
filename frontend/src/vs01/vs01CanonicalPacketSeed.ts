/**
 * Persist the authoritative VS01 canonical signing packet (corpus + hash) for prepare/recipient parity.
 * Stored alongside packet manifests so Review/sign can render the same model as Prepare.
 */

import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { Vs01FullyExecutedSignedSnapshotV1 } from "./vs01FullyExecutedSignedSnapshot";
import type { Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const VS01_CANONICAL_PACKET_SEED_SCOPE = "__canonical_packet__";
export const VS01_CANONICAL_PACKET_QUERY = "vs01_cpacket";
/** When set, full portable packet is read from browser storage (see storeVs01CanonicalPacketPortable). */
export const VS01_CANONICAL_PACKET_STORED_QUERY = "vs01_cpacket_stored";
/** Short revision token so recipient links match the latest prepare toggle/build. */
export const VS01_PACKET_REVISION_QUERY = "vs01_pkt_rev";

/** Max encoded portable payload length safe to embed in a public signing URL. */
export const VS01_CANONICAL_PACKET_MAX_URL_LEN = 512;

export type Vs01CanonicalPacketSeedV1 = {
  v: 1;
  documentId: string;
  agreementId: string;
  corpusPlain: string;
  corpusHash: string;
  savedAt: string;
};

export type Vs01CanonicalPacketPortableRole = Pick<
  Vs01PrepareSigningRole,
  | "roleId"
  | "partyIndex"
  | "partyId"
  | "entityName"
  | "partyName"
  | "roleLabel"
  | "signerName"
  | "signerTitle"
  | "signerEmail"
  | "reviewEmail"
  | "isEntityParty"
  | "requiresSignature"
  | "vs01CounterpartyId"
  | "kind"
>;

export type Vs01CanonicalPacketPortableV1 = {
  v: 1;
  seed: Vs01CanonicalPacketSeedV1;
  fields: Vs01RecipientPlacedField[];
  roles: Vs01CanonicalPacketPortableRole[];
  pageCount: number;
  witnessPageIndex: number;
  initialsPolicy: {
    enabled: boolean;
    bodyPagesOnly: boolean;
  };
  fieldCount: number;
  /** Present after all required signers finish — burned signatures + dates in corpus. */
  fullyExecutedSnapshot?: Vs01FullyExecutedSignedSnapshotV1;
};

const SS_PREFIX = "claw_vs01_canonical_seed_ss_";
const LS_PREFIX = "claw_vs01_canonical_seed_ls_";
const PORTABLE_SS_PREFIX = "claw_vs01_canonical_portable_ss_";
const PORTABLE_LS_PREFIX = "claw_vs01_canonical_portable_ls_";

function storageKey(documentId: string): string {
  return `${documentId.trim()}_${VS01_CANONICAL_PACKET_SEED_SCOPE}`;
}

function utf8ToBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function isValidSeed(o: unknown): o is Vs01CanonicalPacketSeedV1 {
  if (!o || typeof o !== "object") return false;
  const s = o as Vs01CanonicalPacketSeedV1;
  return (
    s.v === 1 &&
    typeof s.documentId === "string" &&
    s.documentId.trim().length > 0 &&
    typeof s.agreementId === "string" &&
    typeof s.corpusPlain === "string" &&
    s.corpusPlain.trim().length >= VS01_SIGNING_CORPUS_MIN_LEN &&
    typeof s.corpusHash === "string" &&
    s.corpusHash === fingerprintAgreementBody(s.corpusPlain)
  );
}

export function buildVs01CanonicalPacketSeed(args: {
  documentId: string;
  agreementId: string;
  corpusPlain: string;
}): Vs01CanonicalPacketSeedV1 | null {
  const documentId = args.documentId.trim();
  const agreementId = args.agreementId.trim();
  const corpusPlain = args.corpusPlain.trim();
  if (!documentId || !agreementId || corpusPlain.length < VS01_SIGNING_CORPUS_MIN_LEN) return null;
  return {
    v: 1,
    documentId,
    agreementId,
    corpusPlain,
    corpusHash: fingerprintAgreementBody(corpusPlain),
    savedAt: new Date().toISOString(),
  };
}

export function storeVs01CanonicalPacketSeed(seed: Vs01CanonicalPacketSeedV1): void {
  if (typeof window === "undefined") return;
  const key = storageKey(seed.documentId);
  const json = JSON.stringify(seed);
  try {
    sessionStorage.setItem(`${SS_PREFIX}${key}`, json);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(`${LS_PREFIX}${key}`, json);
  } catch {
    /* quota */
  }
}

export function computeVs01PacketRevision(args: {
  corpusHash: string;
  initialsEnabled: boolean;
  fieldCount: number;
}): string {
  const hash = (args.corpusHash || "").trim().slice(0, 16);
  const flag = args.initialsEnabled ? "1" : "0";
  const count = String(Math.max(0, args.fieldCount));
  return `${hash}_${flag}_${count}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

export function buildVs01CanonicalPacketPortable(args: {
  seed: Vs01CanonicalPacketSeedV1;
  fields: readonly Vs01RecipientPlacedField[];
  roles: readonly Vs01PrepareSigningRole[];
  pageCount: number;
  witnessPageIndex: number;
  initialsEnabled?: boolean;
}): Vs01CanonicalPacketPortableV1 {
  const roles = args.roles.map((r) => ({
    roleId: r.roleId,
    partyIndex: r.partyIndex,
    partyId: r.partyId,
    entityName: r.entityName,
    partyName: r.partyName,
    roleLabel: r.roleLabel,
    ...(r.signerName ? { signerName: r.signerName } : {}),
    ...(r.signerTitle ? { signerTitle: r.signerTitle } : {}),
    ...(r.signerEmail ? { signerEmail: r.signerEmail } : {}),
    ...(r.reviewEmail ? { reviewEmail: r.reviewEmail } : {}),
    isEntityParty: r.isEntityParty,
    requiresSignature: r.requiresSignature,
    vs01CounterpartyId: r.vs01CounterpartyId,
    kind: r.kind,
  }));
  const fields = args.fields.map((f) => ({ ...f }));
  return {
    v: 1,
    seed: args.seed,
    fields,
    roles,
    pageCount: args.pageCount,
    witnessPageIndex: args.witnessPageIndex,
    initialsPolicy: {
      enabled:
        args.initialsEnabled === true ||
        (args.initialsEnabled !== false &&
          fields.some((f) => f.type === "initials" && f.autoInitials === true)),
      bodyPagesOnly: fields.every((f) => f.type !== "initials" || f.page !== args.witnessPageIndex),
    },
    fieldCount: fields.length,
  };
}

export function encodeVs01CanonicalPacketPortable(packet: Vs01CanonicalPacketPortableV1): string {
  return utf8ToBase64Url(JSON.stringify(packet));
}

export function shouldEmbedCanonicalPacketInUrl(encoded: string): boolean {
  return encoded.trim().length > 0 && encoded.length <= VS01_CANONICAL_PACKET_MAX_URL_LEN;
}

export function storeVs01CanonicalPacketPortable(
  documentId: string,
  packet: Vs01CanonicalPacketPortableV1,
): void {
  if (typeof window === "undefined") return;
  const key = storageKey(documentId);
  const json = JSON.stringify(packet);
  try {
    sessionStorage.setItem(`${PORTABLE_SS_PREFIX}${key}`, json);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(`${PORTABLE_LS_PREFIX}${key}`, json);
  } catch {
    /* quota */
  }
}

function parsePortableFromRaw(raw: string | null): Vs01CanonicalPacketPortableV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const packet = parsed as Vs01CanonicalPacketPortableV1;
    if (packet.v !== 1 || !isValidSeed(packet.seed)) return null;
    if (!Array.isArray(packet.fields) || !Array.isArray(packet.roles)) return null;
    if (packet.fieldCount !== packet.fields.length) return null;
    if (typeof packet.pageCount !== "number" || packet.pageCount <= 0) return null;
    if (typeof packet.witnessPageIndex !== "number" || packet.witnessPageIndex < 0) return null;
    return packet;
  } catch {
    return null;
  }
}

/** Scan browser storage for a portable packet tied to an agreement id (post-refresh owner status). */
export function findVs01CanonicalPacketPortableByAgreementId(
  agreementId: string,
): Vs01CanonicalPacketPortableV1 | null {
  const aid = agreementId.trim();
  if (!aid || typeof window === "undefined") return null;

  const tryStorage = (storage: Storage, prefix: string): Vs01CanonicalPacketPortableV1 | null => {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const packet = parsePortableFromRaw(storage.getItem(key));
        if (packet?.seed.agreementId.trim() === aid) return packet;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  return (
    tryStorage(sessionStorage, PORTABLE_SS_PREFIX) ??
    tryStorage(localStorage, PORTABLE_LS_PREFIX)
  );
}

export function loadVs01CanonicalPacketPortable(documentId: string): Vs01CanonicalPacketPortableV1 | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(documentId);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(`${PORTABLE_SS_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(`${PORTABLE_LS_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  }
  if (!raw) return null;
  return parsePortableFromRaw(raw);
}

/** Persist portable packet and return URL-safe reference params (never embed huge corpus in URL). */
export function resolveCanonicalPacketUrlRefs(args: {
  documentId: string;
  packet: Vs01CanonicalPacketPortableV1;
  initialsEnabled: boolean;
}): { encodedInline: string | null; storedOnly: boolean; packetRevision: string } {
  storeVs01CanonicalPacketPortable(args.documentId, args.packet);
  const encoded = encodeVs01CanonicalPacketPortable(args.packet);
  const packetRevision = computeVs01PacketRevision({
    corpusHash: args.packet.seed.corpusHash,
    initialsEnabled: args.initialsEnabled,
    fieldCount: args.packet.fieldCount,
  });
  if (shouldEmbedCanonicalPacketInUrl(encoded)) {
    return { encodedInline: encoded, storedOnly: false, packetRevision };
  }
  return { encodedInline: null, storedOnly: true, packetRevision };
}

export function decodeVs01CanonicalPacketPortable(raw: string | null): Vs01CanonicalPacketPortableV1 | null {
  const encoded = (raw ?? "").trim();
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(base64UrlToUtf8(encoded)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const packet = parsed as Vs01CanonicalPacketPortableV1;
    if (packet.v !== 1 || !isValidSeed(packet.seed)) return null;
    if (!Array.isArray(packet.fields) || !Array.isArray(packet.roles)) return null;
    if (packet.fieldCount !== packet.fields.length) return null;
    if (typeof packet.pageCount !== "number" || packet.pageCount <= 0) return null;
    if (typeof packet.witnessPageIndex !== "number" || packet.witnessPageIndex < 0) return null;
    return packet;
  } catch {
    return null;
  }
}

const SERVER_CANONICAL_SS_PREFIX = "vs01_recipient_canonical_server_";

/** True when a portable packet or standalone seed exists for this document. */
export function hasVs01CanonicalPacketCached(documentId: string): boolean {
  const did = documentId.trim();
  if (!did) return false;
  return Boolean(loadVs01CanonicalPacketPortable(did) || loadVs01CanonicalPacketSeed(did));
}

/** Mark that the canonical packet for this document was hydrated from the server this session. */
export function markVs01CanonicalPacketFromServer(documentId: string): void {
  if (typeof window === "undefined") return;
  const did = documentId.trim();
  if (!did) return;
  try {
    sessionStorage.setItem(`${SERVER_CANONICAL_SS_PREFIX}${did}`, "1");
  } catch {
    /* ignore */
  }
}

export function wasVs01CanonicalPacketFromServer(documentId: string): boolean {
  if (typeof window === "undefined") return false;
  const did = documentId.trim();
  if (!did) return false;
  try {
    return sessionStorage.getItem(`${SERVER_CANONICAL_SS_PREFIX}${did}`) === "1";
  } catch {
    return false;
  }
}

export function logVs01RecipientCanonicalSource(payload: {
  source: "portable_packet" | "server_packet" | "fallback_rebuild";
  pageCount: number | null;
  fieldCount: number;
  signerRoleIdShort: string | null;
  packetHashMatch: boolean | null;
  preparePacketHash: string | null;
  fallbackReason?: string;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-recipient-canonical-source]", payload);
}

export function loadVs01CanonicalPacketSeed(documentId: string): Vs01CanonicalPacketSeedV1 | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(documentId);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(`${SS_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isValidSeed(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function logVs01CanonicalPacketSeedUse(payload: {
  documentId: string;
  agreementId: string;
  corpusHash: string;
  source: "stored_seed" | "portable_packet" | "bridge_session" | "guided_handoff_session";
  renderMode: "canonical" | "pdf_blocked_fallback";
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-canonical-packet-seed]", payload);
}
