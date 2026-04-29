import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { featureFlags } from "../../config/featureFlags";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import { describePaidProSendModalBranch } from "../../components/agreements/sendHandoffAuthoritativeCorpus";

describe("SimpleSendPage paid-pro send gate (post-hydrate draft shape)", () => {
  it("server_full_document_text corpus bypasses professional-send upsell after persist-style hydrate", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "s".repeat(620),
      purpose: "structured stub",
      premium_server_full_document_text: "",
      premium_full_document_text: "",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d, { agreementId: "agr-1" });
    expect(m.paidProSendAllowed).toBe(true);
    expect(m.hasMaterialPremiumPipelineCorpus).toBe(true);
    expect(
      isPaidProAgreementAuthoritative({ draft: d, agreementId: "agr-1", includeLocalCompletionMarker: false }),
    ).toBe(true);
  });

  it("optional send payment UI flag is off until explicitly enabled", () => {
    expect(featureFlags.sendPaymentRequestsUi).toBe(false);
  });
});

describe("SimpleSendPage + AgreementReview integration (static)", () => {
  it("premiumSendUnlocked includes paid authoritative branches", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("sendAuthoritative");
    expect(s).toContain("paidProSendBranch.paidProSendAllowed");
  });

  it("Create review links path requires recipient readiness (no silent bypass)", () => {
    const p = join(__dirname, "..", "..", "components", "agreements", "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("const recipientGateBlocksSend = useMemo(() => sendInviteReadyCount < 1");
    expect(s).toContain("[create-review-links-click]");
  });
});
