/**
 * Terminal handling when POST /api/agreements/draft fails during paid create-flow review-first persist.
 */

import { hasPaidDashboardCreateContextActive } from "../../launch/paidDashboardCreateContext";
import {
  formatDraftCreateHttpUserMessage,
  readDraftCreateHttpErrorDetail,
} from "./draftCreateHttpError";

export const PAID_CREATE_FLOW_DRAFT_LIMIT_HEADLINE = "Draft limit reached";
export const PAID_CREATE_FLOW_DRAFT_LIMIT_BODY =
  "Your workspace has the maximum number of active drafts. Finish or delete an existing draft, then tap Retry Pro draft. Your intake text is still here.";
export const PAID_CREATE_FLOW_DRAFT_PERSIST_FAILED_BODY =
  "LawDog could not save a workspace draft row for this agreement. Your intake is still here — tap Retry Pro draft when ready.";

export function isDraftLimitReachedPersistError(error: unknown): boolean {
  return readDraftCreateHttpErrorDetail(error)?.code === "draft_limit_reached";
}

/** User-facing copy for paid create-flow draft persist failure — never imply Agreement ready. */
export function formatPaidCreateFlowDraftPersistFailureMessage(error: unknown): string {
  if (isDraftLimitReachedPersistError(error)) {
    if (hasPaidDashboardCreateContextActive()) {
      return PAID_CREATE_FLOW_DRAFT_LIMIT_BODY;
    }
    return (
      formatDraftCreateHttpUserMessage(error) ??
      "Free workspaces can have up to 2 active drafts. Finish an existing draft or upgrade to Pro to create another."
    );
  }
  return formatDraftCreateHttpUserMessage(error) ?? PAID_CREATE_FLOW_DRAFT_PERSIST_FAILED_BODY;
}

export function resolvePaidCreateFlowDraftPersistFailureHeadline(error: unknown): string {
  if (isDraftLimitReachedPersistError(error)) return PAID_CREATE_FLOW_DRAFT_LIMIT_HEADLINE;
  return "Could not save draft";
}
