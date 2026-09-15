/**
 * Customer-confirmed content answers bound to organization + agreement.
 * Generated paper is not confirmation. Verified saved answers may be restored
 * after a fresh session without asking again.
 */

const STORAGE_KEY = "claw_confirmed_content_answers_v1";

export type ConfirmedContentAnswersScope = {
  userId?: string | null;
  organizationId?: string | null;
  agreementId?: string | null;
  revisionId?: string | null;
};

export type ConfirmedContentAnswersRecord = {
  userId: string;
  organizationId: string;
  agreementId: string;
  revisionId?: string;
  answers: string;
  snapshotId?: string;
  digest?: string;
};

let memoryRows: ConfirmedContentAnswersRecord[] = [];

function normalizeId(value?: string | null): string {
  return (value || "").trim();
}

function readAll(): ConfirmedContentAnswersRecord[] {
  const fromStorage = (): ConfirmedContentAnswersRecord[] => {
    if (typeof localStorage === "undefined") return memoryRows;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return memoryRows;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return memoryRows;
      return parsed.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const rec = row as Partial<ConfirmedContentAnswersRecord>;
        const userId = normalizeId(rec.userId);
        const organizationId = normalizeId(rec.organizationId);
        const agreementId = normalizeId(rec.agreementId);
        const answers = typeof rec.answers === "string" ? rec.answers.trim() : "";
        if (!userId || !organizationId || !agreementId || !answers) return [];
        const next: ConfirmedContentAnswersRecord = {
          userId,
          organizationId,
          agreementId,
          answers,
        };
        const revisionId = normalizeId(rec.revisionId);
        const snapshotId = normalizeId(rec.snapshotId);
        const digest = normalizeId(rec.digest);
        if (revisionId) next.revisionId = revisionId;
        if (snapshotId) next.snapshotId = snapshotId;
        if (digest) next.digest = digest;
        return [next];
      });
    } catch {
      return memoryRows;
    }
  };
  memoryRows = fromStorage().slice(-48);
  return memoryRows;
}

function writeAll(rows: ConfirmedContentAnswersRecord[]): void {
  memoryRows = rows.slice(-48);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRows));
  } catch {
    /* ignore quota */
  }
}

export function persistConfirmedContentAnswers(
  scope: ConfirmedContentAnswersScope & { answers: string; snapshotId?: string; digest?: string },
): void {
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  const answers = (scope.answers || "").trim();
  if (!userId || !organizationId || !agreementId || !answers) return;
  const next = readAll().filter(
    (row) =>
      !(
        row.userId === userId &&
        row.organizationId === organizationId &&
        row.agreementId === agreementId
      ),
  );
  next.push({
    userId,
    organizationId,
    agreementId,
    revisionId: normalizeId(scope.revisionId) || undefined,
    answers,
    snapshotId: normalizeId(scope.snapshotId) || undefined,
    digest: normalizeId(scope.digest) || undefined,
  });
  writeAll(next);
}

export function readConfirmedContentAnswers(scope?: ConfirmedContentAnswersScope | null): string {
  if (!scope) return "";
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  if (!userId || !organizationId || !agreementId) return "";
  const revisionId = normalizeId(scope.revisionId);
  const rows = readAll().filter(
    (row) =>
      row.userId === userId &&
      row.organizationId === organizationId &&
      row.agreementId === agreementId,
  );
  if (revisionId) {
    const exact = rows.find((row) => (row.revisionId || "") === revisionId);
    if (exact) return exact.answers;
  }
  return rows[rows.length - 1]?.answers || "";
}

export function restoreConfirmedContentAnswersFromVerifiedSnapshot(args: {
  userId?: string | null;
  organizationId?: string | null;
  agreementId?: string | null;
  revisionId?: string | null;
  answers?: string | null;
  snapshotId?: string | null;
  digest?: string | null;
}): string {
  const answers = (args.answers || "").trim();
  if (!answers) return readConfirmedContentAnswers(args);
  persistConfirmedContentAnswers({
    userId: args.userId,
    organizationId: args.organizationId,
    agreementId: args.agreementId,
    revisionId: args.revisionId,
    answers,
    snapshotId: args.snapshotId || undefined,
    digest: args.digest || undefined,
  });
  return answers;
}

export function clearConfirmedContentAnswersForTests(): void {
  memoryRows = [];
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
