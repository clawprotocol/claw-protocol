/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  formatRecipientDeliveryTimestamp,
  recipientDeliveryRoleLabel,
  recipientDeliveryStatusLabel,
  recipientDisplayName,
} from "./recipientDeliveryPresentation";
import type { RecipientDeliveryRow } from "./recipientDeliveryStatus";

describe("recipientDeliveryPresentation", () => {
  it("labels delivery statuses for owner UI", () => {
    expect(recipientDeliveryStatusLabel("sent")).toBe("Sent");
    expect(recipientDeliveryStatusLabel("opened")).toBe("Opened");
    expect(recipientDeliveryStatusLabel("approved")).toBe("Approved");
    expect(recipientDeliveryStatusLabel("signed")).toBe("Signed");
  });

  it("formats recipient display name with human signer", () => {
    const row: RecipientDeliveryRow = {
      phase: "signing",
      participant_id: "p1",
      entity_name: "Harbor Peak LLC",
      human_name: "Alex Rivera",
      email: "alex@example.com",
      role: "signer",
      status: "sent",
      last_sent_at: null,
      last_opened_at: null,
      resent_count: 0,
      locked: false,
      lock_reason: null,
      can_correct_email: true,
      can_resend_invite: true,
      can_copy_link: true,
    };
    expect(recipientDisplayName(row)).toContain("Harbor Peak LLC");
    expect(recipientDisplayName(row)).toContain("Alex Rivera");
    expect(recipientDeliveryRoleLabel("counterparty")).toBe("Counterparty");
    expect(formatRecipientDeliveryTimestamp(null)).toBe("—");
  });
});
