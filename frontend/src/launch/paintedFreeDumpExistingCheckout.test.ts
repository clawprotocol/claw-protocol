/** @vitest-environment jsdom */
/**
 * Path rule: a painted free dump’s Continue with Pro opens existing TEST checkout.
 * Leftover guest quota / leftover checkout identity must not loop billing ↔ create.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
  resolveAuthoritativeCreateFlowReviewShell,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionFreeStarterIntent,
  paintedFreeDumpOpensExistingCheckout,
} from "../components/agreements/paidProSessionEligibility";
import {
  clearPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "../components/agreements/premiumCompletionStorage";
import { isProEntitledForAgreement } from "../components/agreements/proAgreementEntitlement";
import {
  buildCreateFlowProCheckoutPath,
  isCreateFlowUpgradeReturnTo,
} from "./checkoutParams";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import { buildCreateReturnToWithStarterReviewRestore } from "../components/agreements/checkoutBackRestore";

const intakeSrc = readFileSync(
  join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);
const createPageSrc = readFileSync(join(__dirname, "simpleProduct/SimpleCreatePage.tsx"), "utf8");
const billingSrc = readFileSync(join(__dirname, "BillingPage.tsx"), "utf8");
const shellSrc = readFileSync(
  join(__dirname, "../components/agreements/authoritativeCreateFlowReviewShell.ts"),
  "utf8",
);

describe("painted free dump → existing checkout (path rule)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidPremiumCompletionSession();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidPremiumCompletionSession();
  });

  it("leftover paid-completion identity does not raise a free starter dump to already-paid", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    markCurrentSessionFreeStarterIntent();
    expect(paintedFreeDumpOpensExistingCheckout()).toBe(true);
    expect(resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" })).toBe(
      "free_starter",
    );
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive({ workspaceProEntitled: false, tier: "free" })).toBe(
      false,
    );
    expect(
      isProEntitledForAgreement({
        tier: "free",
        draft: null,
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: null,
      }),
    ).toBe(false);
  });

  it("create-flow Upgrade to Pro returnTo opens __claw_create_checkout__, not /app/create", () => {
    const returnTo = buildCreateReturnToWithStarterReviewRestore();
    expect(isCreateFlowUpgradeReturnTo(returnTo)).toBe(true);
    expect(
      buildCreateFlowProCheckoutPath({
        agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
        returnTo,
      }),
    ).toContain("/app/checkout/__claw_create_checkout__");
  });

  it("Continue with Pro captures painted-dump latch before Pro intent so leftover identity cannot bypass", () => {
    const i = intakeSrc.indexOf('button: "unlock_premium_rewrite_checkout"');
    expect(i).toBeGreaterThan(-1);
    const j = intakeSrc.indexOf("checkout_bypass_already_pro", i);
    const block = intakeSrc.slice(i, j);
    expect(block).toContain("paintedFreeDumpOpensExistingCheckout()");
    expect(block.indexOf("const paintedDumpOpensCheckout")).toBeLessThan(
      block.indexOf("markCurrentSessionProIntent();"),
    );
    expect(intakeSrc.slice(i, j + 40)).toContain("!paintedDumpOpensCheckout &&");
  });

  it("launch_pro_checkout still opens existing checkout; leftover paid invariant cannot no-op a free dump", () => {
    const i = intakeSrc.indexOf('case "launch_pro_checkout"');
    const j = intakeSrc.indexOf('case "continue_basic_draft"', i);
    const block = intakeSrc.slice(i, j);
    expect(block).toContain("launchCreateFlowProCheckoutRef.current");
    expect(shellSrc).toContain("paintedFreeDumpOpensExistingCheckout()");
    expect(shellSrc).toMatch(
      /if \(resolveAuthoritativeCreateFlowReviewShell\(input\) === "paid_pro"\) return true;[\s\S]*paintedFreeDumpOpensExistingCheckout\(\)/,
    );
  });

  it("leftover guest quota / Choose Pro / billing Upgrade do not bounce create↔billing", () => {
    expect(createPageSrc).toContain("leftoverQuotaMustNotCoverPaintedDump");
    expect(createPageSrc).toContain("paintedFreeDumpOpensExistingCheckout()");
    expect(createPageSrc).toContain("CREATE_FLOW_CHECKOUT_AGREEMENT_ID");
    expect(createPageSrc).toContain("onChoosePro=");
    expect(createPageSrc).toMatch(
      /onChoosePro=\{\(\) => \{[\s\S]*buildCreateFlowProCheckoutPath[\s\S]*guestCheckout/,
    );
    expect(billingSrc).toContain("isCreateFlowUpgradeReturnTo(returnToSimpleSend)");
    expect(billingSrc).toContain("paintedFreeDumpOpensExistingCheckout()");
    expect(billingSrc).toContain("CREATE_FLOW_CHECKOUT_AGREEMENT_ID");
    const cta = billingSrc.indexOf("function ctaForTier");
    const createReturn = billingSrc.indexOf("isCreateFlowUpgradeReturnTo(returnToSimpleSend)", cta);
    const bounce = billingSrc.indexOf('navigate("/app/create")', cta);
    expect(createReturn).toBeGreaterThan(cta);
    expect(createReturn).toBeLessThan(bounce);
  });
});
