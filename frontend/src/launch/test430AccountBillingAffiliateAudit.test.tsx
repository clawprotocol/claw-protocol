/**
 * TEST430 — Account, billing, affiliate, and payment UX regression corpus.
 * Focused invariant tests for non-agreement product flows (pre-GTM audit).
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getOrgId, setOrgId } from "./orgContext";
import {
  readStoredDisplayName,
  resolveCurrentUser,
  writeCurrentUserDisplayName,
} from "../account/currentUser";
import {
  PRODUCT_LEGAL_ACK_VERSION,
  PRODUCT_LEGAL_PRIVACY_VERSION_ID,
  PRODUCT_LEGAL_TERMS_VERSION_ID,
  readProductLegalAccepted,
} from "./legal/legalAcceptanceLocal";
import {
  buildAffiliateReferralLink,
  resolveAffiliateDashboardSnapshot,
  writeAffiliateUserSlug,
} from "../account/affiliatePresentation";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import {
  createFiatToCryptoOnrampIntent,
  demoConfirmFiatToCryptoOnrampFromCard,
} from "./clawCheckoutSettlement";
import { finalizeSettlementAndActivatePlan } from "./checkoutCompletion";
import {
  clearPaidPremiumCompletionSession,
  hasStoredPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "../components/agreements/premiumCompletionStorage";
import {
  clearCheckoutBackRestoreSnapshot,
  hasCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
} from "../components/agreements/checkoutBackRestore";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { isProEntitledForAgreement } from "../components/agreements/proAgreementEntitlement";
import { appendReturnToQueryParam } from "./checkoutParams";
import { LawdogAffiliatePage } from "./LawdogAffiliatePage";
import {
  earningPayoutLabel,
  timelineActiveStepIndex,
  timelinePhaseLabel,
  type EarningTimelineRow,
} from "./affiliate/affiliatePayoutTimelineUx";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/affiliate",
    search: "",
    hash: "",
    navigate: vi.fn(),
  }),
}));

const SAMPLE_DRAFT: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Acme LLC", role: "vendor" },
    { name: "Beta Inc.", role: "client" },
  ],
  purpose: "Monthly SaaS support",
  payment_terms: "Net 30",
  payment: { amount: null, cadence: null, valid: false },
  duration: "1 year",
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

describe("TEST430 — auth and workspace persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("persists org id across simulated refresh", () => {
    setOrgId("org-test430-refresh");
    expect(getOrgId()).toBe("org-test430-refresh");
    expect(getOrgId()).toBe("org-test430-refresh");
  });

  it("persists display name and resolves current user from org context", () => {
    setOrgId("org-test430-user");
    writeCurrentUserDisplayName("QA Partner");
    expect(readStoredDisplayName()).toBe("QA Partner");
    const user = resolveCurrentUser();
    expect(user.id).toBe("org-test430-user");
    expect(user.displayName).toBe("QA Partner");
    expect(user.isAuthenticated).toBe(true);
  });

  it("records product legal assent locally for signup continuity", () => {
    expect(readProductLegalAccepted()).toBe(false);
    localStorage.setItem(
      "lawdog_tos_privacy_ack_v1",
      JSON.stringify({
        v: PRODUCT_LEGAL_ACK_VERSION,
        at: new Date().toISOString(),
        terms_version_id: PRODUCT_LEGAL_TERMS_VERSION_ID,
        privacy_version_id: PRODUCT_LEGAL_PRIVACY_VERSION_ID,
        client_assent_id: "test430-assent-id",
      }),
    );
    expect(readProductLegalAccepted()).toBe(true);
  });

  it("scopes agreement API headers to workspace org id", () => {
    setOrgId("org-test430-headers");
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Org-Id"]).toBe("org-test430-headers");
  });
});

describe("TEST430 — payment success restores Pro agreement context", () => {
  const agreementId = "__create_flow__";

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, "location", {
      value: { href: "https://example.test/app/create?premiumCompletion=1", origin: "https://example.test" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    clearPaidPremiumCompletionSession();
  });

  it("marks paid premium completion session after checkout settlement", () => {
    expect(hasStoredPaidPremiumCompletionSession()).toBe(false);
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(hasStoredPaidPremiumCompletionSession()).toBe(true);
  });

  it("finalizeSettlement stores agreement-scoped unlock markers", async () => {
    const intent = createFiatToCryptoOnrampIntent({
      agreementId,
      tierId: "pro",
      cadence: "monthly",
      amountUsd: 39,
    });
    const confirm = await demoConfirmFiatToCryptoOnrampFromCard({
      intent,
      cardNumberDigits: "4242424242424242",
    });
    expect(confirm.ok).toBe(true);
    if (!confirm.ok) return;
    finalizeSettlementAndActivatePlan(confirm.receipt);
    const key = `claw_plan_active_${encodeURIComponent(agreementId)}`;
    expect(sessionStorage.getItem(key)).toBeTruthy();
    expect(sessionStorage.getItem(`claw_settlement_receipt_id_${encodeURIComponent(agreementId)}`)).toBe(
      confirm.receipt.receiptId,
    );
  });

  it("paid session marker entitles Pro generation path", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(
      isProEntitledForAgreement({
        tier: "free",
        draft: SAMPLE_DRAFT,
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: null,
      }),
    ).toBe(true);
  });

  it("builds create return URL with premiumCompletion flag for post-payment restore", () => {
    expect(appendReturnToQueryParam("/app/create", "premiumCompletion", "1")).toBe(
      "/app/create?premiumCompletion=1",
    );
  });
});

describe("TEST430 — payment cancel/retry does not corrupt agreement state", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    vi.restoreAllMocks();
  });

  it("declined demo card does not activate plan markers", async () => {
    const intent = createFiatToCryptoOnrampIntent({
      agreementId: "__create_flow__",
      tierId: "pro",
      cadence: "monthly",
      amountUsd: 39,
    });
    const confirm = await demoConfirmFiatToCryptoOnrampFromCard({
      intent,
      cardNumberDigits: "4000000000000002",
    });
    expect(confirm.ok).toBe(false);
    if (confirm.ok) return;
    expect(confirm.error).toContain("Payment failed");
    expect(hasStoredPaidPremiumCompletionSession()).toBe(false);
    expect(sessionStorage.getItem("claw_plan_active___create_flow__")).toBeNull();
  });

  it("checkout back restore snapshot survives failed payment attempt", async () => {
    persistStarterReviewBeforeCheckout({
      intakeText: "SaaS between Acme LLC and Beta Inc.",
      draft: SAMPLE_DRAFT,
    });
    expect(hasCheckoutBackRestoreSnapshot()).toBe(true);

    const intent = createFiatToCryptoOnrampIntent({
      agreementId: "__create_flow__",
      tierId: "pro",
      cadence: "monthly",
      amountUsd: 39,
    });
    const confirm = await demoConfirmFiatToCryptoOnrampFromCard({
      intent,
      cardNumberDigits: "4000000000000002",
    });
    expect(confirm.ok).toBe(false);

    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.draft.title).toBe("Services Agreement");
    expect(hasCheckoutBackRestoreSnapshot()).toBe(true);
  });
});

describe("TEST430 — affiliate dashboard states", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "location", {
      value: { href: "https://lawdog.test/app/affiliate", origin: "https://lawdog.test" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("empty affiliate snapshot shows zero KPIs and referral link", () => {
    const snap = resolveAffiliateDashboardSnapshot();
    expect(snap.referrals).toBe(0);
    expect(snap.activeSubscribers).toBe(0);
    expect(snap.monthlyEarningsUsd).toBe(0);
    expect(snap.referralLink).toMatch(/\/r\//);
  });

  it("LawdogAffiliatePage renders empty-state KPI cards and copy link CTA", () => {
    render(<LawdogAffiliatePage />);
    expect(screen.getByTestId("affiliate-referral-link").textContent).toMatch(/\/r\//);
    expect(screen.getByTestId("affiliate-kpi-referrals").textContent).toContain("0");
    expect(screen.getByTestId("affiliate-copy-link").textContent).toContain("Copy Link");
  });

  it("enrolled affiliate earnings timeline renders payout phases", () => {
    const row: EarningTimelineRow = {
      id: "tl-1",
      amount_usd: 11.7,
      status: "pending",
      unlock_at: "2026-07-01T00:00:00Z",
    };
    expect(timelinePhaseLabel(row)).toBe("Pending");
    expect(timelineActiveStepIndex(row)).toBe(1);
    expect(earningPayoutLabel(row, 30).headline.length).toBeGreaterThan(0);
  });

  it("affiliate slug persists for referral link continuity", () => {
    writeAffiliateUserSlug("Velox Partner");
    expect(buildAffiliateReferralLink("velox-partner", "https://lawdog.test")).toBe(
      "https://lawdog.test/r/velox-partner",
    );
  });
});
