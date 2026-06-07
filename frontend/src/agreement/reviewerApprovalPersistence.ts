/**
 * Reviewer approval local persistence — supplements server audit for immediate UI
 * and owner QA flows. Does not mutate agreement corpus.
 */

import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";
import { safeStorageGetItem, safeStorageSetItem } from "../lib/safeBrowserStorage";

const STORAGE_PREFIX = "claw_reviewer_approval_v1:";

export type ReviewerApprovalLocalRecord = {
  agreementId: string;
  participantPartyId: string;
  approvedAt: string;
  tokenFingerprint?: string;
};

function storageKey(agreementId: string, participantPartyId: string, tokenFingerprint: string): string {
  const aid = (agreementId || "").trim();
  const pid = (participantPartyId || "").trim();
  const tok = (tokenFingerprint || "").trim();
  const scope = pid || tok || "anonymous";
  return `${STORAGE_PREFIX}${aid}:${scope}`;
}

export function readReviewerApprovalLocalState(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
}): ReviewerApprovalLocalRecord | null {
  const aid = (args.agreementId || "").trim();
  if (!aid) return null;
  const pid = (args.participantPartyId || "").trim();
  const tokFp = recipientLinkTokenFingerprint(args.recipientAccessToken || "");
  const keys = [
    pid ? storageKey(aid, pid, "") : "",
    tokFp ? storageKey(aid, "", tokFp) : "",
    storageKey(aid, pid, tokFp),
  ].filter(Boolean);
  for (const key of keys) {
    if (typeof localStorage === "undefined") continue;
    const raw = safeStorageGetItem(localStorage, key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as ReviewerApprovalLocalRecord;
      if (parsed?.agreementId === aid && parsed.approvedAt) return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function writeReviewerApprovalLocalState(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
  approvedAt?: string;
}): ReviewerApprovalLocalRecord {
  const record: ReviewerApprovalLocalRecord = {
    agreementId: (args.agreementId || "").trim(),
    participantPartyId: (args.participantPartyId || "").trim(),
    approvedAt: args.approvedAt ?? new Date().toISOString(),
    tokenFingerprint: recipientLinkTokenFingerprint(args.recipientAccessToken || "") || undefined,
  };
  const key = storageKey(record.agreementId, record.participantPartyId, record.tokenFingerprint ?? "");
  if (typeof localStorage !== "undefined") {
    safeStorageSetItem(localStorage, key, JSON.stringify(record));
  }
  return record;
}

export function clearReviewerApprovalLocalState(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
}): void {
  const aid = (args.agreementId || "").trim();
  if (!aid || typeof localStorage === "undefined") return;
  const pid = (args.participantPartyId || "").trim();
  const tokFp = recipientLinkTokenFingerprint(args.recipientAccessToken || "");
  for (const key of [storageKey(aid, pid, tokFp), storageKey(aid, pid, ""), storageKey(aid, "", tokFp)]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function logReviewerApprovalSubmitStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-approval-submit-start]", payload);
}

export function logReviewerApprovalSubmitSuccess(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-approval-submit-success]", payload);
}

export function logReviewerApprovalSubmitFailed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[reviewer-approval-submit-failed]", payload);
}

export function logReviewerApprovalLocalStateApplied(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-approval-local-state-applied]", payload);
}
