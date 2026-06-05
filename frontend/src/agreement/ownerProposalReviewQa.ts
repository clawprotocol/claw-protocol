import type { RecipientProposalLifecycleStatus } from "./recipientProposalHistory";

const QA_QUERY_KEY = "qaReview";
const QA_STORAGE_KEY = "lawdogQaOwnerReview";

export function isOwnerProposalReviewQaEnabled(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(QA_QUERY_KEY) === "1") return true;
    return window.localStorage?.getItem(QA_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableOwnerProposalReviewQaLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(QA_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function corpusFingerprint(text: string): string {
  const body = (text || "").trim();
  let h = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${body.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function logOwnerReview(event: string, payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info(event, payload);
}

export function logOwnerReviewOpened(payload: {
  agreementId: string;
  proposalCount: number;
  openProposalCount: number;
}): void {
  logOwnerReview("[owner-review-opened]", payload);
}

export function logOwnerProposalListLoaded(payload: {
  agreementId: string;
  proposalCount: number;
  statuses: RecipientProposalLifecycleStatus[];
}): void {
  logOwnerReview("[owner-proposal-list-loaded]", payload);
}

export function logOwnerProposalSelected(payload: {
  agreementId: string;
  proposalId: string;
  proposalStatus: RecipientProposalLifecycleStatus;
  changeCount: number;
  proposerId?: string | null;
}): void {
  logOwnerReview("[owner-proposal-selected]", payload);
}

export function logOwnerProposalAccepted(payload: {
  agreementId: string;
  proposalId: string;
  previousCorpusHash: string;
  updatedCorpusHash: string;
  acceptedCorpusHash: string;
}): void {
  logOwnerReview("[owner-proposal-accepted]", payload);
}

export function logOwnerProposalRejected(payload: {
  agreementId: string;
  proposalId: string;
  previousCorpusHash: string;
  rejectedCorpusHash: string;
}): void {
  logOwnerReview("[owner-proposal-rejected]", payload);
}

export function logOwnerCorpusUpdated(payload: {
  agreementId: string;
  proposalId?: string | null;
  previousCorpusHash: string;
  updatedCorpusHash: string;
  source: "accept" | "refresh";
}): void {
  logOwnerReview("[owner-corpus-updated]", payload);
}
