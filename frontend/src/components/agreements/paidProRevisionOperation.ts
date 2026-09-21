import { getOrgId } from "../../launch/orgContext";

export type PaidProRevisionOperation = {
  userId: string;
  organizationId: string;
  agreementId: string;
  revisionId: string;
  requestId: string;
};

const activeByAgreement = new Map<string, PaidProRevisionOperation>();
let liveView: Omit<PaidProRevisionOperation, "requestId"> | null = null;

function normalizeId(value?: string | null): string {
  return (value || "").trim();
}

function agreementKey(agreementId: string): string {
  return normalizeId(agreementId);
}

export function beginPaidProRevisionOperation(operation: PaidProRevisionOperation): PaidProRevisionOperation {
  const next: PaidProRevisionOperation = {
    userId: normalizeId(operation.userId),
    organizationId: normalizeId(operation.organizationId),
    agreementId: normalizeId(operation.agreementId),
    revisionId: normalizeId(operation.revisionId),
    requestId: normalizeId(operation.requestId),
  };
  if (next.agreementId && next.requestId) {
    activeByAgreement.set(agreementKey(next.agreementId), next);
  }
  return next;
}

export function readActivePaidProRevisionOperation(agreementId?: string | null): PaidProRevisionOperation | null {
  const key = agreementKey(agreementId || "");
  if (!key) return null;
  return activeByAgreement.get(key) ?? null;
}

export function endPaidProRevisionOperation(requestId?: string | null): void {
  const id = normalizeId(requestId);
  if (!id) return;
  for (const [key, operation] of activeByAgreement) {
    if (operation.requestId === id) activeByAgreement.delete(key);
  }
}

export function setPaidProLiveRevisionView(
  view: Omit<PaidProRevisionOperation, "requestId"> | null,
): void {
  if (!view) {
    liveView = null;
    return;
  }
  liveView = {
    userId: normalizeId(view.userId),
    organizationId: normalizeId(view.organizationId),
    agreementId: normalizeId(view.agreementId),
    revisionId: normalizeId(view.revisionId),
  };
}

export function readPaidProLiveRevisionView(): Omit<PaidProRevisionOperation, "requestId"> | null {
  return liveView;
}

export function paidProRevisionOperationAllowsPersist(operation: PaidProRevisionOperation): boolean {
  const active = readActivePaidProRevisionOperation(operation.agreementId);
  if (!active) return false;
  const liveOrg = normalizeId(getOrgId());
  return (
    active.requestId === normalizeId(operation.requestId) &&
    active.userId === normalizeId(operation.userId) &&
    active.organizationId === normalizeId(operation.organizationId) &&
    active.agreementId === normalizeId(operation.agreementId) &&
    liveOrg === normalizeId(operation.organizationId)
  );
}

export function paidProRevisionOperationAllowsDisplay(operation: PaidProRevisionOperation): boolean {
  if (!paidProRevisionOperationAllowsPersist(operation)) return false;
  const live = readPaidProLiveRevisionView();
  if (!live) return false;
  return (
    live.userId === normalizeId(operation.userId) &&
    live.organizationId === normalizeId(operation.organizationId) &&
    live.agreementId === normalizeId(operation.agreementId)
  );
}

export function clearPaidProRevisionOperationsForTests(): void {
  activeByAgreement.clear();
  liveView = null;
}
