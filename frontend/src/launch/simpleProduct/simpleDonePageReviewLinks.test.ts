import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SimpleDonePage review-link receipt", () => {
  it("uses paid Pro review done shell with copy/back, remint retry, and no stale pending copy", () => {
    const p = join(__dirname, "SimpleDonePage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("readSimpleDoneReviewRecipientLinks");
    expect(s).toContain("Agreement ready");
    expect(s).toContain("Copy review link");
    expect(s).toContain("Review link ready");
    expect(s).toContain("Back to draft");
    expect(s).toContain("mintSimpleDoneReviewRecipientLinkRows");
    expect(s).toContain("retryRemintReviewLink");
    expect(s).toContain("Review link is still preparing");
    expect(s).toContain("Copy public verify link");
    expect(s).toContain("/app/send/");
    expect(s).not.toContain("ProofOpportunityBridgeCard");
    expect(s).not.toContain("Retry review links");
    expect(s).not.toContain("Review links are not ready yet");
  });
});
