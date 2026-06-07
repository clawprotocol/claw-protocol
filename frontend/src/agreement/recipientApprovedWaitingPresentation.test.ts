import { describe, expect, it } from "vitest";
import {
  RECIPIENT_APPROVED_WAITING_BODY,
  RECIPIENT_APPROVED_WAITING_HEADER,
  resolveRecipientApprovedWaitingPanelCopy,
} from "./recipientApprovedWaitingPresentation";

describe("recipientApprovedWaitingPresentation", () => {
  it("uses sender-waiting copy before signature links exist", () => {
    const copy = resolveRecipientApprovedWaitingPanelCopy(false);
    expect(copy.header).toBe(RECIPIENT_APPROVED_WAITING_HEADER);
    expect(copy.body).toBe(RECIPIENT_APPROVED_WAITING_BODY);
    expect(copy.buttonLabel).toBe("Check for updates");
  });

  it("uses refresh signing status when signature links exist", () => {
    const copy = resolveRecipientApprovedWaitingPanelCopy(true);
    expect(copy.buttonLabel).toBe("Refresh signing status");
  });
});
