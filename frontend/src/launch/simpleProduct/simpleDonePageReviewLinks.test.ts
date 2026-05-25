import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SimpleDonePage review-link receipt", () => {
  it("uses paid Pro review done shell with copy/back, remint retry, and owner handoff copy", () => {
    const p = join(__dirname, "SimpleDonePage.tsx");
    const signals = join(__dirname, "../../components/agreements/draftRecipientReviewSignals.ts");
    const s = readFileSync(p, "utf8");
    const signalsSrc = readFileSync(signals, "utf8");
    expect(s).toContain("readSimpleDoneReviewRecipientLinks");
    expect(s).toContain("Copy review link");
    expect(s).toContain("reviewApprovalAgg.flowShellTitle");
    expect(signalsSrc).toContain("Review link created");
    expect(s).toContain("Open reviewer view");
    expect(s).toContain("Back to draft");
    expect(s).toContain("mintSimpleDoneReviewRecipientLinkRows");
    expect(s).toContain("retryRemintReviewLink");
    expect(s).toContain("Review link could not be created. Please try again.");
    expect(s).toContain("Copy public verify link");
    expect(s).toContain("/app/send/");
    expect(s).toContain("linearPremiumRecipientSlots");
    expect(s).toContain("recipientPartyEmails");
    expect(s).not.toContain("ProofOpportunityBridgeCard");
    expect(s).not.toContain("Retry review links");
    expect(s).not.toContain("Review links are not ready yet");
  });
});
