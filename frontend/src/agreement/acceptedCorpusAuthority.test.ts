/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptPersistedPaidProCorpus,
  createAcceptedCorpusPersistenceBoundary,
  normalizeAcceptedCorpusAuthority,
  readRetainedAcceptedCorpusAuthority,
  resolveAcceptedCorpusLockAuthority,
  shouldCreateBackendAcceptedCorpus,
} from "./acceptedCorpusAuthority";
import { putSigningLock } from "./recipientAccessApi";

const AUTHORITY = {
  agreement_id: "ag-backend-1",
  version_id: `av_${"a".repeat(32)}`,
  corpus_sha256: "b".repeat(64),
  accepted_at: "2026-07-17T12:00:00Z",
  authority_state: "accepted" as const,
};

describe("backend accepted corpus authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("retains the backend acceptance version identity and corpus hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, accepted_version: AUTHORITY }),
      })) as unknown as typeof fetch,
    );

    const accepted = await acceptPersistedPaidProCorpus(AUTHORITY.agreement_id);

    expect(accepted).toEqual(AUTHORITY);
    expect(readRetainedAcceptedCorpusAuthority(AUTHORITY.agreement_id)).toEqual(AUTHORITY);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).get("X-Claw-Review-First-Persist")).toBe("1");
  });

  it("creates authority only at final Paid Pro review/signature persistence", () => {
    expect(
      shouldCreateBackendAcceptedCorpus({
        reviewFirstHandoffPersist: true,
        premiumSendIntent: "review",
      }),
    ).toBe(true);
    expect(
      shouldCreateBackendAcceptedCorpus({
        reviewFirstHandoffPersist: false,
        premiumSendIntent: "signature",
      }),
    ).toBe(true);
    expect(
      shouldCreateBackendAcceptedCorpus({
        reviewFirstHandoffPersist: false,
        premiumSendIntent: null,
      }),
    ).toBe(false);
  });

  it("never promotes a session-generated UUID into backend authority", () => {
    expect(
      normalizeAcceptedCorpusAuthority({
        agreement_id: AUTHORITY.agreement_id,
        version_id: "550e8400-e29b-41d4-a716-446655440000",
        corpus_sha256: AUTHORITY.corpus_sha256,
        accepted_at: AUTHORITY.accepted_at,
        authority_state: "accepted",
      }),
    ).toBeNull();
    expect(resolveAcceptedCorpusLockAuthority(AUTHORITY.agreement_id, null)).toBeNull();
  });

  it("submits only the backend accepted identity and hash to signing lock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })) as unknown as typeof fetch,
    );
    const lockAuthority = resolveAcceptedCorpusLockAuthority(
      AUTHORITY.agreement_id,
      AUTHORITY,
    );
    expect(lockAuthority).not.toBeNull();

    await putSigningLock(AUTHORITY.agreement_id, {
      ...lockAuthority!,
      locked_at: AUTHORITY.accepted_at,
      locked_by: "owner",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.accepted_version_id).toBe(AUTHORITY.version_id);
    expect(body.corpus_sha256).toBe(AUTHORITY.corpus_sha256);
    expect(body).not.toHaveProperty("locked_version_id");
  });

  it("does not retain authority or continue after acceptance failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: "accepted_version_conflict" }),
      })) as unknown as typeof fetch,
    );

    await expect(
      acceptPersistedPaidProCorpus(AUTHORITY.agreement_id),
    ).rejects.toThrow("accepted_version_conflict");
    expect(readRetainedAcceptedCorpusAuthority(AUTHORITY.agreement_id)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("accepted corpus persistence boundary", () => {
  it("deduplicates concurrent callers onto one workspace id and backend acceptance", async () => {
    const boundary = createAcceptedCorpusPersistenceBoundary(7);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ensureWorkspaceId = vi.fn(async () => "ag-shared");
    const acceptBackend = vi.fn(async (agreementId: string) => {
      await gate;
      return { ...AUTHORITY, agreement_id: agreementId };
    });
    const persist = async () => {
      const id = await ensureWorkspaceId();
      return acceptBackend(id);
    };

    const first = boundary.ensure(7, persist);
    const second = boundary.ensure(7, persist);

    expect(first).toBe(second);
    expect(boundary.currentPromise(7)).toBe(first);
    await vi.waitFor(() => expect(ensureWorkspaceId).toHaveBeenCalledTimes(1));
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ...AUTHORITY, agreement_id: "ag-shared" },
      { ...AUTHORITY, agreement_id: "ag-shared" },
    ]);
    expect(acceptBackend).toHaveBeenCalledTimes(1);
    expect(acceptBackend).toHaveBeenCalledWith("ag-shared");
  });

  it("allows authority-dependent continuation only after acceptance resolves", async () => {
    const boundary = createAcceptedCorpusPersistenceBoundary(1);
    let resolveAcceptance!: (authority: typeof AUTHORITY) => void;
    const pending = new Promise<typeof AUTHORITY>((resolve) => {
      resolveAcceptance = resolve;
    });
    const continueToPacket = vi.fn();
    const action = async () => {
      await boundary.ensure(1, () => pending);
      continueToPacket();
    };

    const running = action();
    await Promise.resolve();
    expect(continueToPacket).not.toHaveBeenCalled();
    resolveAcceptance(AUTHORITY);
    await running;
    expect(continueToPacket).toHaveBeenCalledTimes(1);
  });

  it("blocks continuation on rejection, clears in-flight state, and permits deliberate retry", async () => {
    const boundary = createAcceptedCorpusPersistenceBoundary(3);
    const continueToPacket = vi.fn();
    const rejected = boundary.ensure(3, async () => {
      throw new Error("accepted_version_conflict");
    });

    await expect(
      rejected.then(() => continueToPacket()),
    ).rejects.toThrow("accepted_version_conflict");
    expect(continueToPacket).not.toHaveBeenCalled();
    expect(boundary.currentPromise(3)).toBeNull();
    expect(boundary.currentAuthority(3)).toBeNull();

    const retryPersist = vi.fn(async () => AUTHORITY);
    await expect(boundary.ensure(3, retryPersist)).resolves.toEqual(AUTHORITY);
    expect(retryPersist).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale prior-session completion establish newer-session authority", async () => {
    const boundary = createAcceptedCorpusPersistenceBoundary(10);
    let resolveOld!: (authority: typeof AUTHORITY) => void;
    const oldPending = new Promise<typeof AUTHORITY>((resolve) => {
      resolveOld = resolve;
    });
    const old = boundary.ensure(10, () => oldPending);

    boundary.activateSession(11);
    const newer = { ...AUTHORITY, agreement_id: "ag-newer", version_id: `av_${"c".repeat(32)}` };
    await expect(boundary.ensure(11, async () => newer)).resolves.toEqual(newer);
    resolveOld(AUTHORITY);

    await expect(old).rejects.toThrow("accepted_corpus_stale_review_session");
    expect(boundary.currentAuthority(11)).toEqual(newer);
  });

  it("reuses completed authority for an identical later persistence", async () => {
    const boundary = createAcceptedCorpusPersistenceBoundary(4);
    const persist = vi.fn(async () => AUTHORITY);

    await expect(boundary.ensure(4, persist)).resolves.toEqual(AUTHORITY);
    await expect(boundary.ensure(4, persist)).resolves.toEqual(AUTHORITY);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
