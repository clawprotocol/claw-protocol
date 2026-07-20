import type { RecipientSessionFieldMutationResult } from "./recipientSessionSigningApi";
import { createRecipientFieldMutationId } from "./recipientSessionSigningApi";

export type FieldSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "validation-error"
  | "retryable-failure"
  | "stale-session";

export type FieldMutationSnapshot = {
  fieldId: string;
  desiredValue: string;
  confirmedValue: string;
  confirmedRevision: number;
  status: FieldSaveStatus;
  errorMessage: string | null;
};

export type FlushResult =
  | { ok: true }
  | { ok: false; reason: "stale-session" | "validation-error" | "retryable-failure" | "pending" };

type FieldRecord = {
  desiredValue: string;
  confirmedValue: string;
  confirmedRevision: number;
  mutationId: string | null;
  status: FieldSaveStatus;
  errorMessage: string | null;
  inFlight: boolean;
  generation: number;
};

type MutateFn = (
  fieldId: string,
  value: string,
  expectedRevision: number,
  mutationId: string,
) => Promise<RecipientSessionFieldMutationResult>;

export class RecipientSessionFieldMutationCoordinator {
  private readonly fields = new Map<string, FieldRecord>();
  private readonly activeChains = new Map<string, Promise<void>>();
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private cachedSnapshots: FieldMutationSnapshot[] = [];
  private snapshotsDirty = true;

  constructor(
    private readonly mutate: MutateFn,
    initialConfirmed: Record<string, string> = {},
    initialRevisions: Record<string, number> = {},
  ) {
    for (const [fieldId, value] of Object.entries(initialConfirmed)) {
      const id = fieldId.trim();
      if (!id) continue;
      this.fields.set(id, {
        desiredValue: value,
        confirmedValue: value,
        confirmedRevision: initialRevisions[id] ?? 0,
        mutationId: null,
        status: "saved",
        errorMessage: null,
        inFlight: false,
        generation: 0,
      });
    }
    for (const [fieldId, revision] of Object.entries(initialRevisions)) {
      const id = fieldId.trim();
      if (!id || this.fields.has(id)) continue;
      this.fields.set(id, {
        desiredValue: "",
        confirmedValue: "",
        confirmedRevision: revision,
        mutationId: null,
        status: "idle",
        errorMessage: null,
        inFlight: false,
        generation: 0,
      });
    }
    this.rebuildSnapshots();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  getSnapshot(fieldId: string): FieldMutationSnapshot | null {
    const rec = this.fields.get(fieldId.trim());
    if (!rec) return null;
    return this.toSnapshot(fieldId.trim(), rec);
  }

  getAllSnapshots(): FieldMutationSnapshot[] {
    if (this.snapshotsDirty) {
      this.rebuildSnapshots();
    }
    return this.cachedSnapshots;
  }

  enqueue(fieldId: string, value: string): void {
    if (this.disposed) return;
    const id = fieldId.trim();
    const rec = this.getOrCreate(id);
    const previousDesiredValue = rec.desiredValue;
    rec.desiredValue = value;
    if (rec.confirmedValue === value && rec.status === "saved" && !rec.inFlight) {
      return;
    }
    if (value !== previousDesiredValue || rec.mutationId === null) {
      rec.mutationId = createRecipientFieldMutationId();
    }
    rec.status = "saving";
    rec.errorMessage = null;
    this.notify();
    this.ensureDrain(id);
  }

  retry(fieldId: string): void {
    if (this.disposed) return;
    const id = fieldId.trim();
    const rec = this.fields.get(id);
    if (!rec) return;
    rec.errorMessage = null;
    rec.status = "saving";
    this.notify();
    this.ensureDrain(id);
  }

  hasUnresolvedWrites(): boolean {
    for (const rec of this.fields.values()) {
      if (rec.inFlight) return true;
      if (rec.desiredValue !== rec.confirmedValue) return true;
      if (rec.status === "saving") return true;
    }
    return false;
  }

  hasBlockingFailure(): boolean {
    const snapshots = this.getAllSnapshots();
    return snapshots.some(
      (snap) =>
        snap.status === "validation-error" ||
        snap.status === "retryable-failure" ||
        snap.status === "stale-session",
    );
  }

  async flushAll(): Promise<FlushResult> {
    if (this.disposed) {
      return { ok: false, reason: "stale-session" };
    }
    for (const fieldId of this.fields.keys()) {
      const rec = this.fields.get(fieldId);
      if (!rec) continue;
      if (rec.desiredValue !== rec.confirmedValue) {
        this.ensureDrain(fieldId);
      }
    }
    await this.awaitActiveChains();
    const snapshots = this.getAllSnapshots();
    if (this.hasBlockingFailure()) {
      if (snapshots.some((snap) => snap.status === "stale-session")) {
        return { ok: false, reason: "stale-session" };
      }
      if (snapshots.some((snap) => snap.status === "validation-error")) {
        return { ok: false, reason: "validation-error" };
      }
      return { ok: false, reason: "retryable-failure" };
    }
    if (this.hasUnresolvedWrites()) {
      return { ok: false, reason: "pending" };
    }
    return { ok: true };
  }

  applyServerFieldValues(
    fieldValues: Record<string, string>,
    fieldRevisions: Record<string, number> = {},
  ): void {
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      const rec = this.fields.get(fieldId);
      if (!rec) continue;
      rec.confirmedValue = value;
      if (fieldId in fieldRevisions) {
        rec.confirmedRevision = fieldRevisions[fieldId] ?? rec.confirmedRevision;
      }
      if (rec.desiredValue === value) {
        rec.status = "saved";
        rec.errorMessage = null;
        rec.inFlight = false;
      }
    }
    this.notify();
  }

  private toSnapshot(fieldId: string, rec: FieldRecord): FieldMutationSnapshot {
    return {
      fieldId,
      desiredValue: rec.desiredValue,
      confirmedValue: rec.confirmedValue,
      confirmedRevision: rec.confirmedRevision,
      status: rec.status,
      errorMessage: rec.errorMessage,
    };
  }

  private rebuildSnapshots(): void {
    this.cachedSnapshots = [...this.fields.entries()].map(([fieldId, rec]) =>
      this.toSnapshot(fieldId, rec),
    );
    this.snapshotsDirty = false;
  }

  private getOrCreate(fieldId: string): FieldRecord {
    const existing = this.fields.get(fieldId);
    if (existing) return existing;
    const created: FieldRecord = {
      desiredValue: "",
      confirmedValue: "",
      confirmedRevision: 0,
      mutationId: null,
      status: "idle",
      errorMessage: null,
      inFlight: false,
      generation: 0,
    };
    this.fields.set(fieldId, created);
    this.snapshotsDirty = true;
    return created;
  }

  private ensureDrain(fieldId: string): void {
    if (this.activeChains.has(fieldId)) return;
    const chain = this.runDrainLoop(fieldId).finally(() => {
      this.activeChains.delete(fieldId);
    });
    this.activeChains.set(fieldId, chain);
  }

  private async awaitActiveChains(): Promise<void> {
    while (this.activeChains.size > 0) {
      const chains = [...this.activeChains.values()];
      await Promise.all(chains);
    }
  }

  private applyMutationResult(
    current: FieldRecord,
    result: Extract<RecipientSessionFieldMutationResult, { ok: true }>,
    fieldId: string,
    snapshotValue: string,
  ): void {
    const confirmed = result.field_values[fieldId] ?? snapshotValue;
    current.confirmedValue = confirmed;
    const revisions = result.field_revisions ?? {};
    if (fieldId in revisions) {
      current.confirmedRevision = revisions[fieldId] ?? current.confirmedRevision;
    } else if (!result.idempotent) {
      current.confirmedRevision += 1;
    }
    if (result.field_values) {
      for (const [otherId, otherValue] of Object.entries(result.field_values)) {
        const other = this.fields.get(otherId);
        if (!other) continue;
        other.confirmedValue = otherValue;
        if (otherId in revisions) {
          other.confirmedRevision = revisions[otherId] ?? other.confirmedRevision;
        }
        if (other.desiredValue === otherValue) {
          other.status = "saved";
          other.inFlight = false;
          other.errorMessage = null;
        }
      }
    }
  }

  private async runDrainLoop(fieldId: string): Promise<void> {
    while (!this.disposed) {
      const rec = this.fields.get(fieldId);
      if (!rec) return;
      if (rec.desiredValue === rec.confirmedValue) {
        rec.status = "saved";
        rec.inFlight = false;
        rec.errorMessage = null;
        this.notify();
        return;
      }

      const snapshotValue = rec.desiredValue;
      const expectedRevision = rec.confirmedRevision;
      const mutationId = rec.mutationId ?? createRecipientFieldMutationId();
      rec.mutationId = mutationId;
      const generation = ++rec.generation;
      rec.inFlight = true;
      rec.status = "saving";
      rec.errorMessage = null;
      this.notify();

      const result = await this.mutate(fieldId, snapshotValue, expectedRevision, mutationId);
      if (this.disposed) return;

      const current = this.fields.get(fieldId);
      if (!current || current.generation !== generation) {
        continue;
      }

      if (!result.ok) {
        current.inFlight = false;
        if (result.kind === "authority") {
          current.status = "stale-session";
        } else if (result.kind === "validation" || result.kind === "conflict") {
          current.status = "validation-error";
          current.errorMessage = result.message;
        } else {
          current.status = "retryable-failure";
          current.errorMessage = result.message;
        }
        this.notify();
        return;
      }

      this.applyMutationResult(current, result, fieldId, snapshotValue);
      current.inFlight = false;
      current.mutationId = null;
      if (current.desiredValue === current.confirmedValue) {
        current.status = "saved";
        current.errorMessage = null;
        this.notify();
        return;
      }
      this.notify();
    }
  }

  private notify(): void {
    if (this.disposed) return;
    this.snapshotsDirty = true;
    this.rebuildSnapshots();
    for (const listener of this.listeners) {
      listener();
    }
  }
}
