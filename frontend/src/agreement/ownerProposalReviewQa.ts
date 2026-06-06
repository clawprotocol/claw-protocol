import type { RecipientProposalLifecycleStatus } from "./recipientProposalHistory";

const QA_QUERY_KEY = "qaReview";
const QA_STORAGE_KEY = "lawdogQaOwnerReview";

function qaOrigin(origin?: string): string {
  return (
    (origin || "").trim() ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
}

/** SPA path for owner QA review on Done page (use with app router `navigate`). */
export function buildOwnerQaReviewDonePath(agreementId: string): string {
  const id = encodeURIComponent(String(agreementId || "").trim());
  return `/app/done/${id}?${QA_QUERY_KEY}=1`;
}

/** SPA path for owner workspace proposal review (Suggested changes received panel). */
export function buildOwnerQaWorkspacePath(agreementId: string): string {
  const id = encodeURIComponent(String(agreementId || "").trim());
  return `/app/agreements/${id}?${QA_QUERY_KEY}=1`;
}

/** Absolute URL safe to paste in a fresh browser tab (avoids file:/// relative paths). */
export function buildOwnerQaReviewAbsoluteLink(agreementId: string, origin?: string): string {
  const id = encodeURIComponent(String(agreementId || "").trim());
  return `${qaOrigin(origin)}/app/done/${id}?${QA_QUERY_KEY}=1`;
}

/** Absolute owner workspace URL for QA party-simulation after reviewer submit. */
export function buildOwnerQaWorkspaceAbsoluteLink(agreementId: string, origin?: string): string {
  const id = encodeURIComponent(String(agreementId || "").trim());
  return `${qaOrigin(origin)}/app/agreements/${id}?${QA_QUERY_KEY}=1`;
}

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

export function logOwnerReviewLinkBuilt(payload: {
  agreementId: string;
  absoluteUrl: string;
  path?: string;
  source: string;
}): void {
  logOwnerReview("[owner-review-link-built]", payload);
}

export function logQaOwnerReviewLinkBuilt(payload: {
  agreementId: string;
  absoluteUrl: string;
  path?: string;
  source: string;
}): void {
  logOwnerReview("[qa-owner-review-link-built]", payload);
}

export function logReviewerProposalSubmitted(payload: {
  agreementId: string;
  proposalId: string;
  participantPid?: string | null;
}): void {
  logOwnerReview("[reviewer-proposal-submitted]", payload);
}

export function logReviewerDisplayCopyParity(payload: {
  agreementId: string;
  copyHasSignatureBlock: boolean;
  displayHasSignatureBlock: boolean;
  parity: boolean;
  copyCorpusHash?: string;
  displayHtmlLength?: number;
}): void {
  logOwnerReview("[reviewer-display-copy-parity]", payload);
}

export function logReviewerOwnerCtaHidden(payload: {
  agreementId: string;
  surface: string;
}): void {
  logOwnerReview("[reviewer-owner-cta-hidden]", payload);
}

export function corpusHasSignatureBlock(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    /\bIN WITNESS WHEREOF\b/i.test(t) ||
    /\b(signature|execution)\s+block\b/i.test(t) ||
    /\b(By|Name|Title|Notice)\s*:/i.test(t) ||
    /\b(CEO|President|Chief Executive Officer)\b/i.test(t)
  );
}

export function htmlHasSignatureBlock(html: string): boolean {
  const h = (html || "").trim();
  if (!h) return false;
  return (
    /premium-doc-signature/i.test(h) ||
    /\bIN WITNESS WHEREOF\b/i.test(h) ||
    /\bCEO\b/i.test(h) ||
    /\bPresident\b/i.test(h)
  );
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
