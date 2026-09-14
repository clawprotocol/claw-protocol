import { resolveCurrentUser } from "../../account/currentUser";
import { getOrgId, subscribeToOrgContextChanges } from "../../launch/orgContext";
import {
  UNCONFIRMED_INVOICE_CADENCE_QUESTION,
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
  buildMaterialMissingItems,
  paymentSectionText,
} from "./proAgreementCompleteness";

const STORAGE_KEY = "claw_payment_clarification_v1";

export type PaymentClarificationApplyStatus = "idle" | "applying" | "failed" | "applied";

export type PaymentClarificationScope = {
  userId: string;
  organizationId: string;
  agreementId?: string;
  draftSessionId?: string;
  revisionId?: string;
};

export type PaymentClarificationIdentity = PaymentClarificationScope & {
  agreementId: string;
};

export type PaymentApplyTarget = {
  userId: string;
  organizationId: string;
  agreementId: string;
  revisionId: string;
  requestId: string;
};

export type PaymentClarificationRecord = {
  userId: string;
  organizationId: string;
  agreementId: string;
  draftSessionId?: string;
  revisionId?: string;
  intake: string;
  pendingAnswer: string;
  appliedAnswers: string;
  applyStatus: PaymentClarificationApplyStatus;
  applyError?: string;
  requestId?: string;
};

type ApplyHandler = (answer: string) => Promise<void>;

const listeners = new Set<() => void>();
const applyHandlers = new Map<string, ApplyHandler>();
let memoryRows: PaymentClarificationRecord[] = [];

function normalizeId(value?: string | null): string {
  return (value || "").trim();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function rowFromUnknown(raw: unknown): PaymentClarificationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PaymentClarificationRecord>;
  const userId = normalizeId(row.userId);
  const organizationId = normalizeId(row.organizationId);
  const agreementId = normalizeId(row.agreementId);
  const draftSessionId = normalizeId(row.draftSessionId);
  if (!userId || !organizationId || (!agreementId && !draftSessionId)) return null;
  const applyStatus: PaymentClarificationApplyStatus =
    row.applyStatus === "applying" || row.applyStatus === "failed" || row.applyStatus === "applied"
      ? row.applyStatus
      : "idle";
  return {
    userId,
    organizationId,
    agreementId,
    draftSessionId: draftSessionId || undefined,
    revisionId: normalizeId(row.revisionId) || undefined,
    intake: typeof row.intake === "string" ? row.intake : "",
    pendingAnswer: typeof row.pendingAnswer === "string" ? row.pendingAnswer : "",
    appliedAnswers: typeof row.appliedAnswers === "string" ? row.appliedAnswers : "",
    applyStatus,
    applyError: typeof row.applyError === "string" ? row.applyError : undefined,
    requestId: normalizeId(row.requestId) || undefined,
  };
}

function readAll(): PaymentClarificationRecord[] {
  if (typeof sessionStorage === "undefined") return memoryRows;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryRows;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return memoryRows;
    return parsed.map(rowFromUnknown).filter((row): row is PaymentClarificationRecord => Boolean(row));
  } catch {
    return memoryRows;
  }
}

function writeAll(rows: PaymentClarificationRecord[]): void {
  memoryRows = rows.slice(-48);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRows));
  } catch {
    /* ignore quota */
  }
}

function hasExactScope(scope?: PaymentClarificationScope | null): scope is PaymentClarificationScope {
  if (!scope) return false;
  if (!normalizeId(scope.userId) || !normalizeId(scope.organizationId)) return false;
  return Boolean(normalizeId(scope.agreementId) || normalizeId(scope.draftSessionId));
}

function matchesScope(row: PaymentClarificationRecord, scope: PaymentClarificationScope): boolean {
  if (row.userId !== normalizeId(scope.userId)) return false;
  if (row.organizationId !== normalizeId(scope.organizationId)) return false;
  const agreementId = normalizeId(scope.agreementId);
  if (agreementId) return row.agreementId === agreementId;
  const draftSessionId = normalizeId(scope.draftSessionId);
  return Boolean(draftSessionId) && !row.agreementId && row.draftSessionId === draftSessionId;
}

function handlerKey(scope?: PaymentClarificationScope | null): string | null {
  if (!hasExactScope(scope)) return null;
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  const draftSessionId = normalizeId(scope.draftSessionId);
  return `${userId}\u0000${organizationId}\u0000${agreementId || `draft:${draftSessionId}`}`;
}

function newOpaqueId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

export function createPaymentClarificationDraftSessionId(): string {
  return newOpaqueId("draft");
}

export function createPaymentApplyRequestId(): string {
  return newOpaqueId("payreq");
}

export function subscribePaymentClarification(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client cache only. Does not delete or mutate server records. */
export function clearPaymentClarificationClientCache(): void {
  memoryRows = [];
  applyHandlers.clear();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function clearPaymentClarificationForTests(): void {
  clearPaymentClarificationClientCache();
}

export function resolvePaymentClarificationScope(args?: {
  agreementId?: string | null;
  draftSessionId?: string | null;
  revisionId?: string | null;
}): PaymentClarificationIdentity | null {
  const user = resolveCurrentUser();
  const userId = normalizeId(user.id);
  const organizationId = normalizeId(getOrgId());
  const agreementId = normalizeId(args?.agreementId);
  const draftSessionId = normalizeId(args?.draftSessionId);
  if (!user.isAuthenticated || !userId || userId === "anonymous" || !organizationId) return null;
  if (!agreementId && !draftSessionId) return null;
  return {
    userId,
    organizationId,
    agreementId,
    draftSessionId: draftSessionId || undefined,
    revisionId: normalizeId(args?.revisionId) || undefined,
  };
}

export function readPaymentClarification(
  scope?: PaymentClarificationScope | string | null,
): PaymentClarificationRecord | null {
  if (!scope || typeof scope === "string") return null;
  if (!hasExactScope(scope)) return null;
  return readAll().find((row) => matchesScope(row, scope)) ?? null;
}

export function persistPaymentClarification(
  record: PaymentClarificationScope & {
    intake?: string;
    pendingAnswer?: string;
    appliedAnswers?: string;
    applyStatus?: PaymentClarificationApplyStatus;
    applyError?: string;
    requestId?: string;
  },
): void {
  if (!hasExactScope(record)) return;
  const prior = readPaymentClarification(record);
  const next = readAll().filter((row) => !matchesScope(row, record));
  next.push({
    userId: normalizeId(record.userId),
    organizationId: normalizeId(record.organizationId),
    agreementId: normalizeId(record.agreementId),
    draftSessionId: normalizeId(record.draftSessionId) || prior?.draftSessionId,
    revisionId: normalizeId(record.revisionId) || prior?.revisionId,
    intake: record.intake || prior?.intake || "",
    pendingAnswer: record.pendingAnswer ?? prior?.pendingAnswer ?? "",
    appliedAnswers: record.appliedAnswers ?? prior?.appliedAnswers ?? "",
    applyStatus: record.applyStatus ?? prior?.applyStatus ?? "idle",
    applyError: record.applyError ?? prior?.applyError,
    requestId: normalizeId(record.requestId) || prior?.requestId,
  });
  writeAll(next);
  notify();
}

export function ensurePaymentClarificationDraftSession(args: {
  userId: string;
  organizationId: string;
  draftSessionId: string;
  intake?: string;
}): PaymentClarificationRecord | null {
  const scope = {
    userId: normalizeId(args.userId),
    organizationId: normalizeId(args.organizationId),
    draftSessionId: normalizeId(args.draftSessionId),
  };
  if (!hasExactScope(scope)) return null;
  if (!readPaymentClarification(scope)) {
    persistPaymentClarification({
      ...scope,
      agreementId: "",
      intake: args.intake || "",
      pendingAnswer: "",
      appliedAnswers: "",
      applyStatus: "idle",
    });
  } else if (args.intake) {
    persistPaymentClarification({ ...scope, intake: args.intake });
  }
  return readPaymentClarification(scope);
}

export function bindPaymentClarificationDraftToAgreement(args: {
  userId: string;
  organizationId: string;
  draftSessionId: string;
  agreementId: string;
}): PaymentClarificationRecord | null {
  const userId = normalizeId(args.userId);
  const organizationId = normalizeId(args.organizationId);
  const draftSessionId = normalizeId(args.draftSessionId);
  const agreementId = normalizeId(args.agreementId);
  if (!userId || !organizationId || !draftSessionId || !agreementId) return null;
  const existing = readPaymentClarification({ userId, organizationId, agreementId });
  if (existing) return existing;
  const draft = readPaymentClarification({ userId, organizationId, draftSessionId });
  if (!draft) return null;
  const next = readAll().filter(
    (row) =>
      !(
        row.userId === userId &&
        row.organizationId === organizationId &&
        !row.agreementId &&
        row.draftSessionId === draftSessionId
      ),
  );
  next.push({
    ...draft,
    agreementId,
    draftSessionId,
  });
  writeAll(next);
  notify();
  return readPaymentClarification({ userId, organizationId, agreementId });
}

export function queuePaymentClarificationPending(
  scope: PaymentClarificationScope,
  answer: string,
  intake?: string,
): void {
  persistPaymentClarification({
    ...scope,
    intake,
    pendingAnswer: answer.trim(),
    applyStatus: "idle",
    applyError: "",
  });
}

export function markPaymentClarificationApplying(scope: PaymentClarificationScope, requestId: string): void {
  const id = normalizeId(requestId);
  if (!id) return;
  persistPaymentClarification({
    ...scope,
    applyStatus: "applying",
    requestId: id,
    applyError: "",
  });
}

export function markPaymentClarificationApplied(
  scope: PaymentClarificationScope,
  appliedAnswers: string,
  revisionId: string,
  requestId?: string,
): void {
  const prior = readPaymentClarification(scope);
  if (!prior) return;
  const expected = normalizeId(requestId);
  if (expected && prior.requestId && prior.requestId !== expected) return;
  persistPaymentClarification({
    ...scope,
    appliedAnswers: appliedAnswers.trim(),
    pendingAnswer: "",
    applyStatus: "applied",
    revisionId,
    requestId: expected || prior.requestId,
    applyError: "",
  });
}

export function markPaymentClarificationFailed(
  scope: PaymentClarificationScope,
  error: string,
  requestId?: string,
): void {
  const prior = readPaymentClarification(scope);
  if (!prior) return;
  const expected = normalizeId(requestId);
  if (expected && prior.requestId && prior.requestId !== expected) return;
  persistPaymentClarification({
    ...scope,
    applyStatus: "failed",
    applyError: error.trim() || "payment_clarification_apply_unavailable",
    requestId: expected || prior.requestId,
  });
}

export function paymentClarificationQuestions(args: {
  intake: string;
  appliedAnswers?: string;
  pendingAnswer?: string;
  answers?: string;
  body: string;
  authorizedBody?: string;
  serverMissing?: readonly string[];
}): string[] {
  void args.pendingAnswer;
  const applied = (args.appliedAnswers || args.answers || "").trim();
  const confirmedSection = paymentSectionText(args.authorizedBody || args.body || "");
  const items = buildMaterialMissingItems({
    intakeRaw: args.intake,
    userGapAnswers: [applied, confirmedSection].filter(Boolean).join("\n"),
    body: args.body,
    serverMissing: args.serverMissing,
  });
  return items
    .map((item) => item.question)
    .filter(
      (q) =>
        q === UNCONFIRMED_PAYMENT_TIMING_QUESTION ||
        q === UNCONFIRMED_INVOICE_CADENCE_QUESTION ||
        q === UNCONFIRMED_PAYMENT_DUE_QUESTION,
    );
}

export function capturePaymentApplyTarget(target: PaymentApplyTarget): PaymentApplyTarget {
  return {
    userId: normalizeId(target.userId),
    organizationId: normalizeId(target.organizationId),
    agreementId: normalizeId(target.agreementId),
    revisionId: normalizeId(target.revisionId),
    requestId: normalizeId(target.requestId),
  };
}

export function paymentApplyTargetMatches(
  captured: PaymentApplyTarget,
  current: PaymentApplyTarget,
): boolean {
  if (
    !captured.userId ||
    !captured.organizationId ||
    !captured.agreementId ||
    !captured.revisionId ||
    !captured.requestId
  ) {
    return false;
  }
  return (
    captured.userId === normalizeId(current.userId) &&
    captured.organizationId === normalizeId(current.organizationId) &&
    captured.agreementId === normalizeId(current.agreementId) &&
    captured.revisionId === normalizeId(current.revisionId) &&
    captured.requestId === normalizeId(current.requestId)
  );
}

export function samePaymentApplyOwner(
  captured: Pick<PaymentApplyTarget, "userId" | "organizationId" | "agreementId">,
  current: Partial<Pick<PaymentApplyTarget, "userId" | "organizationId" | "agreementId">>,
): boolean {
  const userId = normalizeId(current.userId);
  const organizationId = normalizeId(current.organizationId);
  const agreementId = normalizeId(current.agreementId);
  return Boolean(
    captured.userId &&
      captured.organizationId &&
      captured.agreementId &&
      captured.userId === userId &&
      captured.organizationId === organizationId &&
      captured.agreementId === agreementId,
  );
}

export function registerPaymentClarificationApply(
  scope: PaymentClarificationScope | null,
  handler?: ApplyHandler | null,
): void {
  const key = handlerKey(scope);
  if (!key) return;
  if (handler) applyHandlers.set(key, handler);
  else applyHandlers.delete(key);
}

export function applyPaymentClarificationAnswer(
  answer: string,
  scope?: PaymentClarificationScope | null,
): Promise<void> {
  const key = handlerKey(scope);
  const handler = key ? applyHandlers.get(key) : undefined;
  if (!handler) {
    return Promise.reject(new Error("payment_clarification_apply_unavailable"));
  }
  return handler(answer);
}

if (typeof window !== "undefined") {
  subscribeToOrgContextChanges(() => {
    clearPaymentClarificationClientCache();
  });
}
