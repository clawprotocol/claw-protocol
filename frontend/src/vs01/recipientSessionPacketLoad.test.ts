import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchRecipientSessionPacket,
  type RecipientSessionPacketResult,
} from "./recipientSessionPacketApi";
import {
  beginRecipientSessionPacketLoad,
  invalidateRecipientSessionPacketLoads,
  resetRecipientSessionPacketLoadForTests,
} from "./recipientSessionPacketLoad";

vi.mock("./recipientSessionPacketApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recipientSessionPacketApi")>();
  return {
    ...actual,
    fetchRecipientSessionPacket: vi.fn(),
  };
});

const failureResult: RecipientSessionPacketResult = {
  ok: false,
  code: "bootstrap_invalid_or_expired",
  message: "stale",
  kind: "authority",
};

const successResult: RecipientSessionPacketResult = {
  ok: true,
  projection: {
    ok: true,
    v: 1,
    document_label: "Mutual NDA",
    accepted_version_id: "av_test",
    accepted_corpus_sha256: "abc123",
    packet_revision: "rev1",
    signer_record_id: "signer:party_a:0",
    signer_role_id: "vs01r:test:i0:party_a",
    party_id: "party_a",
    signer_display_name: "Jane Signer",
    corpus_plain: "MUTUAL NDA AGREEMENT",
    corpus_hash: "hash123",
    fields: [],
    page_count: 1,
    witness_page_index: 0,
    initials_policy: { enabled: false, bodyPagesOnly: true },
    readiness: "ready_for_signing",
  },
};

describe("recipientSessionPacketLoad", () => {
  beforeEach(() => {
    resetRecipientSessionPacketLoadForTests();
    vi.mocked(fetchRecipientSessionPacket).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps load B shared after obsolete load A settles and does not start load C", async () => {
    let resolveA: (value: RecipientSessionPacketResult) => void = () => {};
    let resolveB: (value: RecipientSessionPacketResult) => void = () => {};

    const promiseA = new Promise<RecipientSessionPacketResult>((resolve) => {
      resolveA = resolve;
    });
    const promiseB = new Promise<RecipientSessionPacketResult>((resolve) => {
      resolveB = resolve;
    });

    vi.mocked(fetchRecipientSessionPacket)
      .mockImplementationOnce(() => promiseA)
      .mockImplementationOnce(() => promiseB);

    const loadA = beginRecipientSessionPacketLoad();
    expect(fetchRecipientSessionPacket).toHaveBeenCalledTimes(1);

    invalidateRecipientSessionPacketLoads();

    const loadB = beginRecipientSessionPacketLoad();
    expect(fetchRecipientSessionPacket).toHaveBeenCalledTimes(2);
    expect(loadB.promise).not.toBe(loadA.promise);

    const joinedB = beginRecipientSessionPacketLoad();
    expect(fetchRecipientSessionPacket).toHaveBeenCalledTimes(2);
    expect(joinedB.promise).toBe(loadB.promise);

    resolveA(failureResult);
    await promiseA;

    const stillB = beginRecipientSessionPacketLoad();
    expect(fetchRecipientSessionPacket).toHaveBeenCalledTimes(2);
    expect(stillB.promise).toBe(loadB.promise);

    resolveB(successResult);
    await expect(loadB.promise).resolves.toEqual(successResult);
    await expect(stillB.promise).resolves.toEqual(successResult);
    expect(fetchRecipientSessionPacket).toHaveBeenCalledTimes(2);
  });
});
