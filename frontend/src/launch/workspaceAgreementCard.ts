import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { workspaceSigningStatusLabel } from "../vs01/vs01WorkspaceSigningStatus";
import { CUSTOMER_JOURNEY_STATE } from "../components/agreements/customerJourneyReadiness";

export type WorkspaceAgreementCardAction = {
  label: string;
  kind: "resume" | "track_signing" | "open" | "review";
};

/** Canonical dashboard/list status badge text. */
export function workspaceAgreementStatusBadge(row: WorkspaceIndexAgreement): string {
  return workspaceSigningStatusLabel(row);
}

export function workspaceAgreementPrimaryAction(
  row: WorkspaceIndexAgreement,
): WorkspaceAgreementCardAction {
  const status = workspaceSigningStatusLabel(row);
  if (status === CUSTOMER_JOURNEY_STATE.fullyExecuted) {
    return { label: "Open", kind: "open" };
  }
  if (status === CUSTOMER_JOURNEY_STATE.waitingForSignatures) {
    return { label: "Track signing", kind: "track_signing" };
  }
  if (status === CUSTOMER_JOURNEY_STATE.waitingForReview || status.includes("reviewer")) {
    return { label: "Review", kind: "review" };
  }
  return { label: "Resume", kind: "resume" };
}
