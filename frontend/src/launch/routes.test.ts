import { describe, expect, it } from "vitest";
import { matchAppPath } from "./routes";

describe("matchAppPath", () => {
  it("maps launch IA paths", () => {
    expect(matchAppPath("/app")).toEqual({ kind: "dashboard" });
    expect(matchAppPath("/dashboard")).toEqual({ kind: "dashboard" });
    expect(matchAppPath("/app/billing")).toEqual({ kind: "billing" });
    expect(matchAppPath("/app/opportunity")).toEqual({ kind: "opportunity" });
    expect(matchAppPath("/app/agreements")).toEqual({ kind: "agreements", sub: "list" });
    expect(matchAppPath("/app/agreements/new")).toEqual({ kind: "agreements", sub: "new" });
    expect(matchAppPath("/app/agreements/abc-123")).toEqual({
      kind: "agreements",
      sub: { id: "abc-123" },
    });
    expect(matchAppPath("/app/esign/new")).toEqual({ kind: "esign", sub: "new" });
    expect(matchAppPath("/app/esign/doc-1")).toEqual({ kind: "esign", sub: { id: "doc-1" } });
    expect(matchAppPath("/app/receipts/u1")).toEqual({ kind: "receipt", id: "u1" });
    expect(matchAppPath("/app/ops/growth")).toEqual({ kind: "opsGrowth" });
    expect(matchAppPath("/app/ops/starter-pro-refine")).toEqual({ kind: "opsStarterProRefine" });
    expect(matchAppPath("/app/admin")).toEqual({ kind: "adminConsole" });
    expect(matchAppPath("/app/affiliate")).toEqual({ kind: "affiliate" });
    expect(matchAppPath("/app/settings")).toEqual({ kind: "settings" });
    expect(matchAppPath("/app/signatures")).toEqual({ kind: "signatures" });
    expect(matchAppPath("/app/create")).toEqual({ kind: "simpleCreate" });
    expect(matchAppPath("/app/quick")).toEqual({ kind: "quickSend" });
    expect(matchAppPath("/app/ready/ag_1")).toEqual({ kind: "simpleReady", agreementId: "ag_1" });
    expect(matchAppPath("/app/checkout/deal-1")).toEqual({ kind: "simpleCheckout", agreementId: "deal-1" });
    expect(matchAppPath("/app/send/ag_1")).toEqual({ kind: "simpleSend", agreementId: "ag_1" });
    expect(matchAppPath("/app/done/ag_1")).toEqual({ kind: "simpleDone", agreementId: "ag_1" });
    expect(matchAppPath("/app/review-changes/ag_1")).toEqual({
      kind: "ownerProposalReview",
      agreementId: "ag_1",
    });
    expect(matchAppPath("/app/verification/ag_1")).toEqual({
      kind: "simpleVerification",
      agreementId: "ag_1",
    });
  });

  it("returns null outside /app", () => {
    expect(matchAppPath("/")).toBeNull();
    expect(matchAppPath("/feed")).toBeNull();
  });
});
