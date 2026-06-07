import type { LawdogViewerContext } from "./lawdogViewerContext";

export const RECIPIENT_APPROVED_WAITING_HEADER = "Approved — waiting for sender";

export const RECIPIENT_APPROVED_WAITING_BODY =
  "You approved this draft. The sender will prepare signature links if they choose to move forward.";

export const RECIPIENT_SIGNING_LINKS_READY_HEADER = "Signing links are ready";

export const RECIPIENT_SIGNING_LINKS_READY_BODY =
  "The sender prepared signature links. You can open your signing link or refresh to check status.";

export type RecipientApprovedWaitingPanelCopy = {
  header: string;
  body: string;
  buttonLabel: string;
  pollHint: string | null;
};

export function resolveRecipientApprovedWaitingPanelCopy(
  signingLinksExist: boolean,
): RecipientApprovedWaitingPanelCopy {
  if (signingLinksExist) {
    return {
      header: RECIPIENT_SIGNING_LINKS_READY_HEADER,
      body: RECIPIENT_SIGNING_LINKS_READY_BODY,
      buttonLabel: "Refresh signing status",
      pollHint: null,
    };
  }
  return {
    header: RECIPIENT_APPROVED_WAITING_HEADER,
    body: RECIPIENT_APPROVED_WAITING_BODY,
    buttonLabel: "Check for updates",
    pollHint: null,
  };
}

let lastRecipientApprovedWaitingLogKey = "";

export function logRecipientApprovedWaitingVisible(payload: {
  agreementId: string;
  viewerContext: LawdogViewerContext;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastRecipientApprovedWaitingLogKey) return;
  lastRecipientApprovedWaitingLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[recipient-approved-waiting-visible]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    viewerContext: payload.viewerContext,
  });
}
