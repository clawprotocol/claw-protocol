import { resolveCurrentUser } from "../../account/currentUser";
import { getOrgId, subscribeToOrgContextChanges } from "../../launch/orgContext";
import {
  clearPaidProRevisionOperationsForTests,
  readActivePaidProRevisionOperation,
  readPaidProLiveRevisionView,
} from "./paidProRevisionOperation";
import { selectVerifiedPaidReviewPaper } from "./paidProVerifiedReviewPaper";
import {
  authorizedPaidProRevisionId,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruthState";
import {
  UNCONFIRMED_INVOICE_CADENCE_QUESTION,
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
  buildMaterialMissingItems,
  extractPaymentFacts,
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
  if (agreementId) {
    if (row.agreementId !== agreementId) return false;
    const revisionId = normalizeId(scope.revisionId);
    if (!revisionId) return false;
    return (row.revisionId || "") === revisionId;
  }
  const draftSessionId = normalizeId(scope.draftSessionId);
  return Boolean(draftSessionId) && !row.agreementId && row.draftSessionId === draftSessionId;
}

function handlerKey(scope?: PaymentClarificationScope | null): string | null {
  if (!hasExactScope(scope)) return null;
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  const draftSessionId = normalizeId(scope.draftSessionId);
  const revisionId = normalizeId(scope.revisionId);
  if (agreementId && !revisionId) return null;
  return `${userId}\u0000${organizationId}\u0000${agreementId ? `${agreementId}\u0000${revisionId}` : `draft:${draftSessionId}`}`;
}

function agreementSessionHandlerKey(scope?: PaymentClarificationScope | null): string | null {
  if (!hasExactScope(scope)) return null;
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  if (!userId || !organizationId || !agreementId) return null;
  return `${userId}\u0000${organizationId}\u0000session:${agreementId}`;
}

/** Current authorized paper hash. Used to rebind Apply after resume without inventing a revision. */
export function resolveLivePaymentClarificationRevision(agreementId?: string | null): string {
  const sotHash = getPaidProSourceOfTruth()?.hash?.trim() || "";
  if (sotHash && sotHash !== "empty") return sotHash;
  const sotText = getPaidProSourceOfTruthText().trim();
  const fromSot = authorizedPaidProRevisionId(sotText);
  if (fromSot) return fromSot;
  const id = normalizeId(agreementId);
  if (!id) return "";
  const verified = String(selectVerifiedPaidReviewPaper({ agreementId: id })?.plain || "").trim();
  return authorizedPaidProRevisionId(verified);
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
  clearPaidProRevisionOperationsForTests();
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

/**
 * Applied answers for Apply after resume. Exact revision wins. A prior revision’s
 * answers are reused only when the authorized paper already confirms them — never
 * to hide a gap the current paper still has.
 */
export function readRecoveredPaymentClarificationAnswers(
  scope?: PaymentClarificationScope | null,
  authorizedBody?: string | null,
): string {
  if (!scope || !hasExactScope(scope)) return "";
  const exact = readPaymentClarification(scope)?.appliedAnswers?.trim() || "";
  if (exact) return exact;
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  if (!agreementId) return "";
  const prior = readAll()
    .filter(
      (row) =>
        row.userId === userId &&
        row.organizationId === organizationId &&
        row.agreementId === agreementId &&
        row.appliedAnswers.trim(),
    )
    .map((row) => row.appliedAnswers.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!prior) return "";
  const body = String(authorizedBody || "").trim();
  if (!body) return "";
  if (!recoveredAnswersAgreeWithAuthorizedPaper(prior, body)) return "";
  const bodyOnly = paymentClarificationQuestions({
    intake: "",
    appliedAnswers: "",
    authorizedBody: body,
    body,
  });
  const withPrior = paymentClarificationQuestions({
    intake: "",
    appliedAnswers: prior,
    authorizedBody: body,
    body,
  });
  if (bodyOnly.some((question) => !withPrior.includes(question))) return "";
  return prior;
}

/**
 * Prior answers may suppress questions without matching current paper
 * (weekly/net-30 vs monthly/net-60). Recovery requires the values to agree.
 */
export function recoveredAnswersAgreeWithAuthorizedPaper(prior: string, authorizedBody: string): boolean {
  const paper = paymentSectionText(authorizedBody) || authorizedBody;
  const priorFacts = extractPaymentFacts("", prior);
  const paperFacts = extractPaymentFacts(paper, "");
  if (priorFacts.cadence && paperFacts.cadence && priorFacts.cadence !== paperFacts.cadence) return false;
  if (
    priorFacts.deadlineDays != null &&
    paperFacts.deadlineDays != null &&
    priorFacts.deadlineDays !== paperFacts.deadlineDays
  ) {
    return false;
  }
  return true;
}

/** Intake only. Does not return applied answers from another revision. */
export function readPaymentClarificationIntake(scope?: PaymentClarificationScope | null): string {
  if (!scope || !hasExactScope(scope)) return "";
  const exact = readPaymentClarification(scope)?.intake?.trim();
  if (exact) return exact;
  const userId = normalizeId(scope.userId);
  const organizationId = normalizeId(scope.organizationId);
  const agreementId = normalizeId(scope.agreementId);
  if (!agreementId) return "";
  return (
    readAll().find(
      (row) =>
        row.userId === userId &&
        row.organizationId === organizationId &&
        row.agreementId === agreementId &&
        row.intake.trim(),
    )?.intake || ""
  ).trim();
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
  if (normalizeId(record.agreementId) && !normalizeId(record.revisionId)) return;
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
  revisionId?: string | null;
}): PaymentClarificationRecord | null {
  const userId = normalizeId(args.userId);
  const organizationId = normalizeId(args.organizationId);
  const draftSessionId = normalizeId(args.draftSessionId);
  const agreementId = normalizeId(args.agreementId);
  const revisionId = normalizeId(args.revisionId);
  if (!userId || !organizationId || !draftSessionId || !agreementId) return null;
  const existing = readAll().find(
    (row) =>
      row.userId === userId &&
      row.organizationId === organizationId &&
      row.agreementId === agreementId &&
      (!revisionId || (row.revisionId || "") === revisionId),
  );
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
    revisionId: revisionId || draft.revisionId,
  });
  writeAll(next);
  notify();
  return next[next.length - 1] ?? null;
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
  const nextRevision = normalizeId(revisionId);
  if (!nextRevision) return;
  const remaining = readAll().filter((row) => !matchesScope(row, scope));
  writeAll(remaining);
  persistPaymentClarification({
    userId: prior.userId,
    organizationId: prior.organizationId,
    agreementId: prior.agreementId,
    draftSessionId: prior.draftSessionId,
    intake: prior.intake,
    appliedAnswers: appliedAnswers.trim(),
    pendingAnswer: "",
    applyStatus: "applied",
    revisionId: nextRevision,
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
  live: Pick<PaymentApplyTarget, "userId" | "organizationId" | "agreementId" | "revisionId">,
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
  const active = readActivePaidProRevisionOperation(captured.agreementId);
  if (!active || active.requestId !== captured.requestId) return false;
  return (
    captured.userId === normalizeId(live.userId) &&
    captured.organizationId === normalizeId(live.organizationId) &&
    captured.agreementId === normalizeId(live.agreementId) &&
    captured.revisionId === normalizeId(live.revisionId)
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
  const sessionKey = agreementSessionHandlerKey(scope);
  if (handler) {
    if (key) applyHandlers.set(key, handler);
    if (sessionKey) applyHandlers.set(sessionKey, handler);
    return;
  }
  if (key) applyHandlers.delete(key);
  if (sessionKey) applyHandlers.delete(sessionKey);
}

export function paymentApplyRequestedRevisionMatchesLive(
  requested?: string | null,
  live?: string | null,
): boolean {
  const req = normalizeId(requested);
  const cur = normalizeId(live);
  return Boolean(req && cur && req === cur);
}

export function applyPaymentClarificationAnswer(
  answer: string,
  scope?: PaymentClarificationScope | null,
): Promise<void> {
  const agreementId = normalizeId(scope?.agreementId);
  const requested = normalizeId(scope?.revisionId);
  const liveView = readPaidProLiveRevisionView();
  const liveFromView =
    liveView &&
    liveView.agreementId === agreementId &&
    liveView.userId === normalizeId(scope?.userId) &&
    liveView.organizationId === normalizeId(scope?.organizationId)
      ? normalizeId(liveView.revisionId)
      : "";
  const live = liveFromView || resolveLivePaymentClarificationRevision(agreementId);
  if (requested && live && !paymentApplyRequestedRevisionMatchesLive(requested, live)) {
    return Promise.reject(new Error("payment_clarification_stale_request"));
  }
  const key = handlerKey(scope);
  const exact = key ? applyHandlers.get(key) : undefined;
  if (exact) return exact(answer);
  if (agreementId && paymentApplyRequestedRevisionMatchesLive(requested, live)) {
    const sessionKey = agreementSessionHandlerKey(scope);
    const session = sessionKey ? applyHandlers.get(sessionKey) : undefined;
    if (session) return session(answer);
  }
  return Promise.reject(new Error("payment_clarification_apply_unavailable"));
}

if (typeof window !== "undefined") {
  subscribeToOrgContextChanges(() => {
    clearPaymentClarificationClientCache();
  });
}
