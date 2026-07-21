/**
 * Deterministic delivery adapter — captures invitation messages at the service boundary.
 */
import { expect } from "@playwright/test";

export type DeliveryMessageRecord = {
  messageId: string;
  destination: string;
  templateType: "signing_invitation" | "review_invitation" | "completion_notice";
  agreementId: string;
  packetId: string | null;
  signerId: string | null;
  partyId: string | null;
  linkType: "signing" | "review" | "verify";
  tokenFingerprint: string;
  sendAttempt: number;
  deliveryStatus: "queued" | "sent" | "failed";
  href: string;
  capturedAt: number;
};

export class RcDeliveryAdapter {
  readonly messages: DeliveryMessageRecord[] = [];
  private attemptCounter = 0;

  record(args: Omit<DeliveryMessageRecord, "messageId" | "sendAttempt" | "capturedAt">): DeliveryMessageRecord {
    this.attemptCounter += 1;
    const rec: DeliveryMessageRecord = {
      ...args,
      messageId: `msg_${this.attemptCounter}`,
      sendAttempt: this.attemptCounter,
      capturedAt: Date.now(),
    };
    this.messages.push(rec);
    return rec;
  }

  signingMessagesForAgreement(agreementId: string): DeliveryMessageRecord[] {
    return this.messages.filter(
      (m) => m.agreementId === agreementId && m.linkType === "signing" && m.templateType === "signing_invitation",
    );
  }

  assertDistinctTokenFingerprints(): void {
    const fps = this.signingMessages().map((m) => m.tokenFingerprint);
    expect(new Set(fps).size).toBe(fps.length);
  }

  signingMessages(): DeliveryMessageRecord[] {
    return this.messages.filter((m) => m.linkType === "signing");
  }
}

export function tokenFingerprintFromHref(href: string): string {
  try {
    const u = new URL(href, "http://localhost");
    const token = u.searchParams.get("t") || u.searchParams.get("token") || "";
    return token.slice(0, 12) || href.slice(-12);
  } catch {
    return href.slice(-12);
  }
}
