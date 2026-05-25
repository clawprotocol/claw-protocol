/**
 * Persist the authoritative VS01 canonical signing packet (corpus + hash) for prepare/recipient parity.
 * Stored alongside packet manifests so Review/sign can render the same model as Prepare.
 */

import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const VS01_CANONICAL_PACKET_SEED_SCOPE = "__canonical_packet__";
export const VS01_CANONICAL_PACKET_QUERY = "vs01_cpacket";

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
};

const SS_PREFIX = "claw_vs01_canonical_seed_ss_";
const LS_PREFIX = "claw_vs01_canonical_seed_ls_";

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

export function buildVs01CanonicalPacketPortable(args: {
  seed: Vs01CanonicalPacketSeedV1;
  fields: readonly Vs01RecipientPlacedField[];
  roles: readonly Vs01PrepareSigningRole[];
  pageCount: number;
  witnessPageIndex: number;
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
      enabled: fields.some((f) => f.type === "initials" && f.autoInitials === true),
      bodyPagesOnly: fields.every((f) => f.type !== "initials" || f.page !== args.witnessPageIndex),
    },
    fieldCount: fields.length,
  };
}

export function encodeVs01CanonicalPacketPortable(packet: Vs01CanonicalPacketPortableV1): string {
  return utf8ToBase64Url(JSON.stringify(packet));
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
  source: "stored_seed" | "bridge_session" | "guided_handoff_session";
  renderMode: "canonical" | "pdf_blocked_fallback";
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-canonical-packet-seed]", payload);
}
