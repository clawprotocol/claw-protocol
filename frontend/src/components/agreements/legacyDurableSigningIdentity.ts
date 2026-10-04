/**
 * Legacy signing identity: map generated frozen party IDs onto persisted durable
 * UUIDs only when the strict legal-name rule matches one-to-one.
 * The accepted canonical corpus stays the signing text.
 */
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERATED_PARTY_ID_RE = /^party_\d+$/i;
const GENERATED_HASH_PARTY_ID_RE = /^party_[0-9a-f]+:[0-9a-f]+$/i;
const ENTITY_SUFFIX_RE = /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC|LP)\b/i;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(input: string): string {
  const msg = new TextEncoder().encode(input);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(7, w[t - 15]!) ^ rotr(18, w[t - 15]!) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(17, w[t - 2]!) ^ rotr(19, w[t - 2]!) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let t = 0; t < 64; t += 1) {
      const s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[t]! + w[t]!) >>> 0;
      const s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

export class SigningIdentityAuthorityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SigningIdentityAuthorityError";
    this.code = code;
  }
}

export type PreparedExecutionParty = {
  partyId: string;
  legalName: string;
  role: string;
  order: number;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  legacyPartyId: string;
};

export type PreparedExecutionAuthority = {
  corpus: string;
  digest: string;
  length: number;
  corpusSource: "accepted_canonical";
  parties: PreparedExecutionParty[];
  alias: Record<string, string>;
  participantIds: string[];
};

export function strictCanonicalLegalNameKey(name: string): string {
  let key = String(name ?? "")
    .split(/\s+/)
    .join(" ")
    .trim()
    .toLowerCase();
  while (key && ".,;:".includes(key[key.length - 1]!)) key = key.slice(0, -1);
  return key;
}

export function isDurablePartyUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export function isGeneratedLegacyPartyId(value: string): boolean {
  const token = String(value || "").trim();
  return GENERATED_PARTY_ID_RE.test(token) || GENERATED_HASH_PARTY_ID_RE.test(token);
}

function roleKey(role: string): string {
  return String(role || "").split(/\s+/).join(" ").trim().toLowerCase();
}

function acceptedHumanSignerName(signerName: string, entityName: string): string {
  const signer = String(signerName || "").trim();
  if (!signer) return "";
  const entity = String(entityName || "").trim();
  if (entity && strictCanonicalLegalNameKey(signer) === strictCanonicalLegalNameKey(entity)) return "";
  if (ENTITY_SUFFIX_RE.test(signer)) return "";
  return signer;
}

export function signingCorpusAuthority(args: {
  acceptedCorpus: string;
  acceptedDigest: string;
  frozenCorpus?: string;
  frozenDigest?: string;
  preferFrozen?: boolean;
}): { corpus: string; digest: string; source: "accepted_canonical" } {
  const acceptedCorpus = String(args.acceptedCorpus || "");
  const acceptedDigest = String(args.acceptedDigest || "").trim().toLowerCase();
  const frozenDigest = String(args.frozenDigest || "").trim().toLowerCase();
  if (args.preferFrozen && frozenDigest && acceptedDigest && frozenDigest !== acceptedDigest) {
    throw new SigningIdentityAuthorityError("frozen_corpus_mismatch");
  }
  if (!acceptedCorpus || sha256Hex(acceptedCorpus) !== acceptedDigest) {
    throw new SigningIdentityAuthorityError("accepted_snapshot_invalid");
  }
  return { corpus: acceptedCorpus, digest: acceptedDigest, source: "accepted_canonical" };
}

export function legacyReconciliationApplies(
  draft: AgreementDraft | null | undefined,
  frozen: FrozenSigningAuthoritySnapshotV1 | null | undefined,
): boolean {
  const parties = draft?.parties ?? [];
  if (parties.length < 2 || !parties.every((party) => isDurablePartyUuid(String(party.id || "")))) {
    return false;
  }
  const frozenParties = frozen?.parties ?? [];
  return frozenParties.some((party) => isGeneratedLegacyPartyId(party.agreementPartyId));
}

export function prepareDurableExecutionAuthority(args: {
  draft: AgreementDraft;
  frozen: FrozenSigningAuthoritySnapshotV1 | null;
}): PreparedExecutionAuthority {
  const accepted = args.draft.accepted_review_snapshot_v1;
  if (!accepted || String(accepted.status || "").trim().toLowerCase() !== "accepted") {
    throw new SigningIdentityAuthorityError("accepted_snapshot_missing");
  }
  const corpus = String(accepted.corpusPlain || "");
  const digest = String(accepted.corpusSha256 || "").trim().toLowerCase();
  const length = Number(accepted.corpusLength || 0);
  if (!corpus || length !== corpus.length || sha256Hex(corpus) !== digest) {
    throw new SigningIdentityAuthorityError("accepted_snapshot_invalid");
  }
  const frozen = args.frozen;
  if (!frozen || !Array.isArray(frozen.parties) || frozen.parties.length === 0) {
    throw new SigningIdentityAuthorityError("accepted_snapshot_missing");
  }
  const persisted = args.draft.parties ?? [];
  if (frozen.parties.length !== persisted.length) {
    throw new SigningIdentityAuthorityError("party_count_mismatch");
  }
  if (persisted.length < 2 || persisted.length > 4) {
    throw new SigningIdentityAuthorityError("party_count_unsupported");
  }
  if (persisted.some((party) => !isDurablePartyUuid(String(party.id || "")))) {
    throw new SigningIdentityAuthorityError("durable_party_id_required");
  }

  const persistedKeys = persisted.map((party) => strictCanonicalLegalNameKey(party.name));
  const frozenKeys = frozen.parties.map((party) => strictCanonicalLegalNameKey(party.legalEntityName));
  if (persistedKeys.some((key) => !key) || frozenKeys.some((key) => !key)) {
    throw new SigningIdentityAuthorityError("missing_legal_name");
  }
  if (new Set(persistedKeys).size !== persistedKeys.length || new Set(frozenKeys).size !== frozenKeys.length) {
    throw new SigningIdentityAuthorityError("ambiguous_legal_name");
  }

  const used = new Set<string>();
  const alias: Record<string, string> = {};
  const signerByDurable = new Map<string, PreparedExecutionParty>();

  frozen.parties.forEach((frozenParty) => {
    const frozenId = String(frozenParty.agreementPartyId || "").trim();
    const explicit = persisted.find((party) => String(party.id || "").trim() === frozenId && isDurablePartyUuid(frozenId));
    let matched: AgreementParty | undefined;
    if (explicit) {
      if (strictCanonicalLegalNameKey(explicit.name) !== strictCanonicalLegalNameKey(frozenParty.legalEntityName)) {
        throw new SigningIdentityAuthorityError("explicit_mapping_name_conflict");
      }
      matched = explicit;
    } else if (isDurablePartyUuid(frozenId)) {
      throw new SigningIdentityAuthorityError("mixed_party_identity");
    } else if (!isGeneratedLegacyPartyId(frozenId)) {
      throw new SigningIdentityAuthorityError("mixed_party_identity");
    } else {
      const key = strictCanonicalLegalNameKey(frozenParty.legalEntityName);
      const hits = persisted.filter((party) => strictCanonicalLegalNameKey(party.name) === key);
      if (hits.length !== 1) throw new SigningIdentityAuthorityError("ambiguous_legal_name");
      matched = hits[0];
    }
    const durableId = String(matched?.id || "").trim();
    if (!durableId || used.has(durableId)) throw new SigningIdentityAuthorityError("ambiguous_legal_name");
    used.add(durableId);
    const persistedRole = roleKey(String(matched?.role || ""));
    const frozenRole = roleKey(String(frozenParty.agreementRole || ""));
    if (persistedRole && frozenRole && persistedRole !== frozenRole) {
      throw new SigningIdentityAuthorityError("role_conflict");
    }
    alias[frozenId] = durableId;
    signerByDurable.set(durableId, {
      partyId: durableId,
      legalName: String(matched?.name || ""),
      role: String(matched?.role || ""),
      order: persisted.findIndex((party) => party.id === durableId),
      signerName: "",
      signerTitle: "",
      signerEmail: "",
      legacyPartyId: frozenId,
    });
  });

  if (used.size !== persisted.length) throw new SigningIdentityAuthorityError("party_count_mismatch");

  const signers = frozen.signers ?? [];
  const seenSignerParties = new Set<string>();
  for (const signer of signers) {
    const sourceId = String(signer.agreementPartyId || "").trim();
    const durableId = alias[sourceId];
    if (!durableId) throw new SigningIdentityAuthorityError("unknown_generated_party");
    if (seenSignerParties.has(durableId)) throw new SigningIdentityAuthorityError("multiple_signers_for_party");
    seenSignerParties.add(durableId);
    const row = signerByDurable.get(durableId);
    if (!row) throw new SigningIdentityAuthorityError("unknown_generated_party");
    const human = acceptedHumanSignerName(String(signer.signerName || ""), row.legalName);
    if (!human) throw new SigningIdentityAuthorityError("human_signer_name_missing");
    row.signerName = human;
    row.signerTitle = String(signer.signerTitle || "").trim();
    row.signerEmail = String(signer.signerEmail || "").trim();
  }
  if (seenSignerParties.size !== persisted.length) {
    throw new SigningIdentityAuthorityError("missing_signer_record");
  }

  const parties = persisted.map((party, index) => {
    const row = signerByDurable.get(String(party.id || ""));
    if (!row) throw new SigningIdentityAuthorityError("party_count_mismatch");
    return { ...row, order: index };
  });

  return {
    corpus,
    digest,
    length,
    corpusSource: "accepted_canonical",
    parties,
    alias,
    participantIds: parties.map((party) => party.partyId),
  };
}
