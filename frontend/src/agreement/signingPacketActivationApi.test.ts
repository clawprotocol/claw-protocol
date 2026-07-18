import { describe, expect, it, vi, afterEach } from "vitest";
import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import {
  cacheConfirmedSigningPacketActivation,
  clearCachedSigningPacketActivation,
  clearSigningPacketActivationForTests,
  loadSigningPacketActivation,
  normalizeSigningPacketActivation,
  persistSigningPacketActivation,
  readCachedSigningPacketActivation,
} from "./signingPacketActivationApi";

const AGREEMENT_ID = "ag_test_activation";
const DOCUMENT_ID = "doc_test_activation";

function sampleActivation() {
  return {
    v: 1 as const,
    packet_state: "active" as const,
    document_id: DOCUMENT_ID,
    packet_revision: "a".repeat(64),
    activated_at: "2026-07-17T12:00:00Z",
    accepted_version_id: "av_test123",
    accepted_corpus_sha256: "b".repeat(64),
    frozen_authority_material_hash: "c".repeat(64),
    signing_lock: {
      locked_version_id: "av_test123",
      content_sha256: "b".repeat(64),
      accepted_corpus_sha256: "b".repeat(64),
    },
  };
}

describe("signingPacketActivationApi", () => {
  afterEach(() => {
    clearSigningPacketActivationForTests();
    clearCachedSigningPacketActivation(AGREEMENT_ID);
  });

  it("normalizes and caches metadata-only backend activation", () => {
    const activation = sampleActivation();
    expect(normalizeSigningPacketActivation({ activation }, AGREEMENT_ID)).toEqual(activation);
    cacheConfirmedSigningPacketActivation(activation, AGREEMENT_ID);
    expect(readCachedSigningPacketActivation(AGREEMENT_ID)).toEqual(activation);
  });

  it("rejects activation payloads that include portable corpus", () => {
    const activation = {
      ...sampleActivation(),
      portable: { v: 1 },
    };
    expect(normalizeSigningPacketActivation({ activation }, AGREEMENT_ID)).toBeNull();
  });

  it("persistSigningPacketActivation stores confirmed metadata only", async () => {
    const activation = sampleActivation();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, activation }),
    } as Response);
    const portable = {
      v: 1,
      seed: {
        v: 1,
        documentId: DOCUMENT_ID,
        agreementId: AGREEMENT_ID,
        corpusPlain: "x".repeat(1600),
        corpusHash: "1600:abc",
        savedAt: "2026-07-17T12:00:00Z",
      },
      fields: [],
      roles: [],
      pageCount: 1,
      witnessPageIndex: 0,
      initialsPolicy: { enabled: false, bodyPagesOnly: true },
      fieldCount: 0,
    } satisfies Vs01CanonicalPacketPortableV1;
    const confirmed = await persistSigningPacketActivation(AGREEMENT_ID, {
      documentId: DOCUMENT_ID,
      portablePacket: portable,
    });
    expect(confirmed).toEqual(activation);
    expect(readCachedSigningPacketActivation(AGREEMENT_ID)).toEqual(activation);
  });

  it("loadSigningPacketActivation clears stale cache when backend has no activation", async () => {
    cacheConfirmedSigningPacketActivation(sampleActivation(), AGREEMENT_ID);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);
    const loaded = await loadSigningPacketActivation(AGREEMENT_ID);
    expect(loaded).toBeNull();
    expect(readCachedSigningPacketActivation(AGREEMENT_ID)).toBeNull();
  });
});
