/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipientSessionFieldMutationResult } from "./recipientSessionSigningApi";
import { RecipientSessionFieldMutationCoordinator, type FieldMutationSnapshot } from "./recipientSessionFieldMutationCoordinator";

function okResult(
  fieldId: string,
  value: string,
  fieldValues: Record<string, string> = { [fieldId]: value },
  fieldRevisions: Record<string, number> = { [fieldId]: 1 },
): RecipientSessionFieldMutationResult {
  return {
    ok: true,
    field_id: fieldId,
    idempotent: false,
    field_values: fieldValues,
    field_revisions: fieldRevisions,
    readiness: "ready_for_signing",
    signer_complete: false,
    finish_ready: true,
    required_field_count: 1,
    completed_field_count: 1,
    missing_field_ids: [],
  };
}

describe("recipientSessionFieldMutationCoordinator", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid successive values so the final confirmed value wins", async () => {
    const calls: string[] = [];
    const mutate = vi.fn(async (fieldId: string, value: string) => {
      calls.push(value);
      return okResult(fieldId, value);
    });
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "A");
    coordinator.enqueue("f1", "B");
    coordinator.enqueue("f1", "C");
    const flush = await coordinator.flushAll();
    expect(flush.ok).toBe(true);
    expect(coordinator.getSnapshot("f1")?.confirmedValue).toBe("C");
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["A", "C"]);
  });

  it("coalesces concurrent equivalent mutations into one in-flight request with one mutation id", async () => {
    const calls: string[] = [];
    const mutationIds: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const mutate = vi.fn(
      async (_fieldId: string, value: string, _expectedRevision: number, mutationId: string) => {
        calls.push(value);
        mutationIds.push(mutationId);
        return new Promise<RecipientSessionFieldMutationResult>((resolve) => {
          resolveFirst = () => resolve(okResult("f1", value));
        });
      },
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Same");
    coordinator.enqueue("f1", "Same");
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["Same"]);
    expect(mutationIds).toHaveLength(1);
    const flushPromise = coordinator.flushAll();
    let settled = false;
    void flushPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveFirst?.();
    const flush = await flushPromise;
    expect(flush.ok).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutationIds).toHaveLength(1);
    expect(coordinator.getSnapshot("f1")?.confirmedValue).toBe("Same");
  });

  it("ignores out-of-order responses when a newer value was requested", async () => {
    let resolveFirst: (() => void) | undefined;
    const mutate = vi.fn()
      .mockImplementationOnce(
        () =>
          new Promise<RecipientSessionFieldMutationResult>((resolve) => {
            resolveFirst = () => resolve(okResult("f1", "Old"));
          }),
      )
      .mockImplementationOnce(async () => okResult("f1", "New"));
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Old");
    coordinator.enqueue("f1", "New");
    resolveFirst?.();
    await coordinator.flushAll();
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot("f1")?.confirmedValue).toBe("New");
  });

  it("blocks completion flush until the latest required write is saved", async () => {
    let release: (() => void) | undefined;
    const mutate = vi.fn(
      () =>
        new Promise<RecipientSessionFieldMutationResult>((resolve) => {
          release = () => resolve(okResult("f1", "Jane Signer"));
        }),
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Jane Signer");
    const flushPromise = coordinator.flushAll();
    let settled = false;
    void flushPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release?.();
    const flush = await flushPromise;
    expect(flush.ok).toBe(true);
  });

  it("surfaces retryable failure and supports retry", async () => {
    const mutate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "network_error",
        message: "network down",
        kind: "network",
      } as const)
      .mockResolvedValueOnce(okResult("f1", "Jane"));
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Jane");
    const flush = await coordinator.flushAll();
    expect(flush).toEqual({ ok: false, reason: "retryable-failure" });
    coordinator.retry("f1");
    const retryFlush = await coordinator.flushAll();
    expect(retryFlush.ok).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("marks stale session without applying superseded values after dispose", async () => {
    let release: (() => void) | undefined;
    const mutate = vi.fn(
      () =>
        new Promise<RecipientSessionFieldMutationResult>((resolve) => {
          release = () =>
            resolve({
              ok: false,
              code: "bootstrap_invalid_or_expired",
              message: "stale",
              kind: "authority",
            });
        }),
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Jane");
    coordinator.dispose();
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(coordinator.getSnapshot("f1")?.status).not.toBe("saved");
  });

  it("serializes distinct fields without dropping either value", async () => {
    const mutate = vi.fn(async (fieldId: string, value: string) => okResult(fieldId, value));
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("sig", "Signer");
    coordinator.enqueue("init", "JS");
    const flush = await coordinator.flushAll();
    expect(flush.ok).toBe(true);
    expect(coordinator.getSnapshot("sig")?.confirmedValue).toBe("Signer");
    expect(coordinator.getSnapshot("init")?.confirmedValue).toBe("JS");
  });

  it("preserves mutation id when identical value is re-enqueued during in-flight network failure recovery", async () => {
    const mutationIds: string[] = [];
    let releaseMutate: (() => void) | undefined;
    let mutateCalls = 0;
    const mutate = vi.fn(
      (_fieldId: string, _value: string, _expectedRevision: number, mutationId: string) => {
        mutationIds.push(mutationId);
        mutateCalls += 1;
        if (mutateCalls === 1) {
          return new Promise<RecipientSessionFieldMutationResult>((resolve) => {
            releaseMutate = () =>
              resolve({
                ok: false,
                code: "network_error",
                message: "network down",
                kind: "network",
              });
          });
        }
        if (mutateCalls === 2) {
          return Promise.resolve({
            ...okResult("f1", "Jane Signer"),
            idempotent: true,
          });
        }
        return Promise.resolve({
          ok: false,
          code: "network_error",
          message: "network down",
          kind: "network",
        } as const);
      },
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Jane Signer");
    await Promise.resolve();
    expect(mutationIds).toHaveLength(1);
    const originalMutationId = mutationIds[0];
    coordinator.enqueue("f1", "Jane Signer");
    expect(mutationIds).toHaveLength(1);
    releaseMutate?.();
    const flush = await coordinator.flushAll();
    expect(flush).toEqual({ ok: false, reason: "retryable-failure" });
    expect(mutationIds).toEqual([originalMutationId]);
    coordinator.retry("f1");
    const retryFlush = await coordinator.flushAll();
    expect(retryFlush.ok).toBe(true);
    expect(coordinator.getSnapshot("f1")?.confirmedValue).toBe("Jane Signer");
    expect(mutationIds).toEqual([originalMutationId, originalMutationId]);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("mints a new mutation id when the desired value changes during an unresolved write", async () => {
    const mutationIds: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const mutate = vi.fn(
      (_fieldId: string, value: string, _expectedRevision: number, mutationId: string) => {
        mutationIds.push(mutationId);
        if (mutationIds.length === 1) {
          return new Promise<RecipientSessionFieldMutationResult>((resolve) => {
            releaseFirst = () => resolve(okResult("f1", value));
          });
        }
        return Promise.resolve(okResult("f1", value));
      },
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "First");
    await Promise.resolve();
    const firstMutationId = mutationIds[0];
    coordinator.enqueue("f1", "Second");
    releaseFirst?.();
    const flush = await coordinator.flushAll();
    expect(flush.ok).toBe(true);
    expect(coordinator.getSnapshot("f1")?.confirmedValue).toBe("Second");
    expect(mutationIds.length).toBeGreaterThanOrEqual(2);
    expect(mutationIds[0]).toBe(firstMutationId);
    expect(mutationIds[mutationIds.length - 1]).not.toBe(firstMutationId);
  });

  it("reuses mutation id when retrying after a network failure", async () => {
    const mutationIds: string[] = [];
    const mutate = vi.fn(
      async (_fieldId: string, value: string, _expectedRevision: number, mutationId: string) => {
        mutationIds.push(mutationId);
        if (mutationIds.length === 1) {
          return {
            ok: false,
            code: "network_error",
            message: "network down",
            kind: "network",
          } as const;
        }
        return okResult("f1", value);
      },
    );
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    coordinator.enqueue("f1", "Jane");
    const flush = await coordinator.flushAll();
    expect(flush).toEqual({ ok: false, reason: "retryable-failure" });
    coordinator.retry("f1");
    const retryFlush = await coordinator.flushAll();
    expect(retryFlush.ok).toBe(true);
    expect(mutationIds.length).toBe(2);
    expect(mutationIds[0]).toBe(mutationIds[1]);
  });

  it("returns referentially stable snapshots until state changes", async () => {
    const mutate = vi.fn(async (_fieldId: string, value: string) => okResult("f1", value));
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    const first = coordinator.getAllSnapshots();
    const second = coordinator.getAllSnapshots();
    expect(first).toBe(second);
    coordinator.enqueue("f1", "B");
    await coordinator.flushAll();
    const third = coordinator.getAllSnapshots();
    expect(third).not.toBe(first);
  });

  it("notifies subscribers only after cached snapshot updates", async () => {
    const mutate = vi.fn(async (fieldId: string, value: string) => okResult(fieldId, value));
    const coordinator = new RecipientSessionFieldMutationCoordinator(mutate);
    const seen: FieldMutationSnapshot[][] = [];
    coordinator.subscribe(() => {
      seen.push(coordinator.getAllSnapshots());
    });
    coordinator.enqueue("f1", "A");
    await coordinator.flushAll();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((snapshots, index) => index === 0 || snapshots !== seen[index - 1])).toBe(true);
  });
});
