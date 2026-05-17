import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { workspaceSigningStatusLabel } from "../vs01/vs01WorkspaceSigningStatus";

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
  if (status === "Fully signed") {
    return { label: "Open", kind: "open" };
  }
  if (status === "Signing in progress") {
    return { label: "Track signing", kind: "track_signing" };
  }
  if (status === "Waiting for review" || status.includes("reviewer")) {
    return { label: "Review", kind: "review" };
  }
  return { label: "Resume", kind: "resume" };
}
