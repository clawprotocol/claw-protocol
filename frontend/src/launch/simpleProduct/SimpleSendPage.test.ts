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

  it("sender-first paid Pro uses VS01 seed only: no /agreements sign, no /app/send navigate, hard-block UI on seed failure", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("SENDER_FIRST_WORKSPACE_ROUTED_SS_KEY");
    expect(s).not.toContain("senderFirstGaveUpStorageKey");
    expect(s).toContain("peekPremiumSenderSignFirst()");
    expect(s).not.toContain("resolvePremiumSenderFirstSigningPath");
    expect(s).not.toContain("premiumSenderFirstSigningRoute");
    expect(s).not.toMatch(/navigate\([^)]*\/agreements\/[^)]*sign/);
    expect(s).not.toMatch(/navigate\(`\/app\/send\//);
    expect(s).toContain("logAgreementVs01SeedBlocked");
    expect(s).toContain("senderFirstVs01SeedBlocked");
    expect(s).toContain("We could not open the e-sign workspace.");
    expect(s).toContain("Continue without VS01 e-sign");
    expect(s).toContain("const route = `/app/esign/${encodeURIComponent(vs01Seed.documentId)}?agreement_bridge=1`");
    expect(s).toContain("[agreement-vs01-bridge-session-written]");
    expect(s).toContain("logAgreementVs01BridgePreflight");
    expect(s).toContain("logAgreementVs01RecipientEmailMergeDiagnostics");
    expect(s).toContain("bridgeHandoffDraftRef");
    expect(s).toContain("onBridgeHandoffDraftSnapshot");
    expect(s).toContain("setPaidProAgreementBridgeSkipMarker");
  });

  it("sender-first redirect is gated on signature handoff intent and peekPremiumSenderSignFirst", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toMatch(/simpleFlowPremiumHandoffIntent\s*!==\s*["']signature["']/);
    expect(s).toContain("peekPremiumSenderSignFirst()");
  });

  it("AgreementReview publishes live draft for VS01 bridge handoff", () => {
    const p = join(__dirname, "..", "..", "components", "agreements", "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("onBridgeHandoffDraftSnapshot");
    expect(s).toContain("onBridgeHandoffDraftSnapshot(draft ?? initialDraftSnapshot ?? null)");
  });

  it("Send path still gates on recipient readiness (no silent bypass)", () => {
    const p = join(__dirname, "..", "..", "components", "agreements", "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("const recipientGateBlocksSend = useMemo(() => sendInviteReadyCount < 1");
    expect(s).toContain("[create-review-links-click]");
    expect(s).toContain("paidProAuthoritativeSendHappyPath");
  });
});
