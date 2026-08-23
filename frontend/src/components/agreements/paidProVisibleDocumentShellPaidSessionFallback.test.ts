/** @vitest-environment jsdom */
/**
 * Issue #83: Paid session + 200-999 non-hollow acceptedCanonicalPlain must paint.
 *
 * LOCKED PRODUCT RULE: After pay, the visitor dump IS the deal. Generate may fail.
 * The AGREEMENT DRAFT element must show that deal (rebuildBodyFromIntakeForProFailure
 * of the original dump / acceptedCanonicalPlain) OR a clear 2-5 missing-tenet ask.
 * Empty skeleton is never a valid landing when intake exists.
 *
 * The body that hides Retry MUST be the body the card paints. Same predicate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import {
  rebuildBodyFromIntakeForProFailure,
  isNonHollowBody,
} from "./freeStarterReviewBodyResolver";
import {
  meetsPaidSessionFallbackPaintFloor,
  PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN,
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
} from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

/**
 * Sample intake 1: Priya/Diego/$2,400/Texas
 * This is the live failure case from issue #83.
 */
const PRIYA_DIEGO_INTAKE = `
Priya Shah of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC for a branding project.
Payment: $2,400 total.
Governing law: Texas.
The project involves logo design and brand guidelines delivery within 6 weeks.
`;

/**
 * Sample intake 2: Marcus/Elena/$5,500/California
 * A different visitor to prove the rule is universal.
 */
const MARCUS_ELENA_INTAKE = `
Marcus Thompson from Apex Consulting Group is engaging Elena Rodriguez of Brightwave Marketing Agency.
Payment: $5,500 for a strategic marketing campaign.
Governing law: California.
Deliverables include market research, competitor analysis, and a comprehensive marketing plan over 8 weeks.
`;

const HOLLOW_DRAFT: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "",
  parties: [
    { name: "Party A", role: "Client" },
    { name: "Party B", role: "Service Provider" },
  ],
  purpose: "covers due. Work.",
  payment_terms: "",
  payment: null,
  duration: null,
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

describe("Issue #83: Paid session + 200-999 char rebuild paints", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
  });

  describe("meetsPaidSessionFallbackPaintFloor predicate", () => {
    it("returns true for Priya/Diego rebuild ≥200 non-hollow", () => {
      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);

      expect(rebuilt.length).toBeGreaterThanOrEqual(PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN);
      expect(isNonHollowBody(rebuilt, PRIYA_DIEGO_INTAKE)).toBe(true);
      expect(meetsPaidSessionFallbackPaintFloor(rebuilt, PRIYA_DIEGO_INTAKE)).toBe(true);
    });

    it("returns true for Marcus/Elena rebuild ≥200 non-hollow", () => {
      const rebuilt = rebuildBodyFromIntakeForProFailure(MARCUS_ELENA_INTAKE, HOLLOW_DRAFT);

      expect(rebuilt.length).toBeGreaterThanOrEqual(PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN);
      expect(isNonHollowBody(rebuilt, MARCUS_ELENA_INTAKE)).toBe(true);
      expect(meetsPaidSessionFallbackPaintFloor(rebuilt, MARCUS_ELENA_INTAKE)).toBe(true);
    });

    it("returns false for body < 200 chars", () => {
      const shortBody = "This is a short body.";
      expect(meetsPaidSessionFallbackPaintFloor(shortBody, PRIYA_DIEGO_INTAKE)).toBe(false);
    });

    it("returns false for hollow body (Party A/B)", () => {
      const hollowBody = `SERVICES AGREEMENT

This Agreement is entered into by and between:

Party A ("Client")
and
Party B ("Service Provider")

1. SERVICES
Service Provider agrees to provide covers due. Work.

2. PAYMENT TERMS
To be agreed.

3. GOVERNING LAW
To be determined.`;
      expect(meetsPaidSessionFallbackPaintFloor(hollowBody, PRIYA_DIEGO_INTAKE)).toBe(false);
    });
  });

  describe("resolvePaidProVisibleShellRenderBranch with paidSessionFallbackActive", () => {
    it("paints canonical_plain_forced for 200-999 char body when paidSessionFallbackActive", () => {
      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolvePaidProVisibleShellRenderBranch({
        hasSoT: false,
        sotLen: 0,
        htmlLen: 0,
        canonicalPlainLen: rebuilt.length,
        canonicalPlainSource: "paid_session_intake_rebuild",
        paidProFirstReviewActive: true,
        paidSessionFallbackActive: true,
      });

      expect(result.branch).toBe("canonical_plain_forced");
      expect(result.reason).toBe("paid_session_intake_rebuild");
    });

    it("paints empty when paidSessionFallbackActive is false and body < 1001", () => {
      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolvePaidProVisibleShellRenderBranch({
        hasSoT: false,
        sotLen: 0,
        htmlLen: 0,
        canonicalPlainLen: rebuilt.length,
        canonicalPlainSource: "paid_session_intake_rebuild",
        paidProFirstReviewActive: true,
        paidSessionFallbackActive: false,
      });

      expect(result.branch).toBe("empty");
      expect(result.reason).toBe("paid_pro_awaiting_display_authority");
    });

    it("paints canonical_plain_forced for 200-999 body even when paidProFirstReviewActive is false", () => {
      const rebuilt = rebuildBodyFromIntakeForProFailure(MARCUS_ELENA_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolvePaidProVisibleShellRenderBranch({
        hasSoT: false,
        sotLen: 0,
        htmlLen: 0,
        canonicalPlainLen: rebuilt.length,
        canonicalPlainSource: "paid_session_intake_rebuild",
        paidProFirstReviewActive: false,
        paidSessionFallbackActive: true,
      });

      expect(result.branch).toBe("canonical_plain_forced");
      expect(result.reason).toBe("paid_session_intake_rebuild");
    });
  });

  describe("resolveCanonicalPlainForVisibleShell with paid session", () => {
    it("returns 200-999 char rebuild when paid session is active (Priya/Diego)", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolveCanonicalPlainForVisibleShell({
        acceptedCanonicalPlain: rebuilt,
        intakeText: PRIYA_DIEGO_INTAKE,
        paidProActive: false,
        agreementId: "",
      });

      expect(result.plain.length).toBeGreaterThanOrEqual(200);
      expect(result.plain).toContain("Priya Shah");
      expect(result.plain).toContain("$2,400");
      expect(result.plain).toContain("Texas");
    });

    it("returns 200-999 char rebuild when paid session is active (Marcus/Elena)", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const rebuilt = rebuildBodyFromIntakeForProFailure(MARCUS_ELENA_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolveCanonicalPlainForVisibleShell({
        acceptedCanonicalPlain: rebuilt,
        intakeText: MARCUS_ELENA_INTAKE,
        paidProActive: false,
        agreementId: "",
      });

      expect(result.plain.length).toBeGreaterThanOrEqual(200);
      expect(result.plain).toContain("Marcus Thompson");
      expect(result.plain).toContain("$5,500");
      expect(result.plain).toContain("California");
    });

    it("returns empty when no paid session and body < 1001", () => {
      clearPaidPremiumCompletionSession();
      expect(hasPaidPremiumCompletionSession()).toBe(false);

      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(200);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolveCanonicalPlainForVisibleShell({
        acceptedCanonicalPlain: rebuilt,
        intakeText: PRIYA_DIEGO_INTAKE,
        paidProActive: false,
        agreementId: "",
      });

      expect(result.plain).toBe("");
    });
  });

  describe("resolvePaidProFirstReviewVisibleDisplayPlain with paid session", () => {
    it("returns 200-499 char body when paid session is active (below 500 authority floor)", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const shortRebuilt = `SERVICES AGREEMENT

This Agreement is entered into by Priya Shah of Northline Studio and Diego Alvarez of Harbor Marks LLC.

1. PAYMENT: $2,400 total for branding project.

2. GOVERNING LAW: Texas.

3. SCOPE: Logo design and brand guidelines.

IN WITNESS WHEREOF, the parties have executed this Agreement.`;

      expect(shortRebuilt.length).toBeGreaterThanOrEqual(200);
      expect(shortRebuilt.length).toBeLessThan(500);

      const result = resolvePaidProFirstReviewVisibleDisplayPlain({
        acceptedCanonicalPlain: shortRebuilt,
        intakeText: PRIYA_DIEGO_INTAKE,
        paidProActive: false,
        agreementId: "",
      });

      expect(result.plain.length).toBeGreaterThanOrEqual(200);
      expect(result.source).toBe("paid_session_intake_rebuild");
    });

    it("returns 500+ char body at normal authority floor (not needing paid session fallback)", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);
      expect(rebuilt.length).toBeGreaterThanOrEqual(500);
      expect(rebuilt.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

      const result = resolvePaidProFirstReviewVisibleDisplayPlain({
        acceptedCanonicalPlain: rebuilt,
        intakeText: PRIYA_DIEGO_INTAKE,
        paidProActive: false,
        agreementId: "",
      });

      expect(result.plain.length).toBeGreaterThanOrEqual(500);
      expect(result.source).toBe("paid_pro_accepted_canonical_source_of_truth");
    });
  });

  describe("Retry lockout and paint use the same predicate", () => {
    it("Priya/Diego: body that passes paint floor also passes Retry lockout", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_DIEGO_INTAKE, HOLLOW_DRAFT);

      const paintFloorMet = meetsPaidSessionFallbackPaintFloor(rebuilt, PRIYA_DIEGO_INTAKE);
      const retryLockoutMet = rebuilt.trim().length >= 200 && isNonHollowBody(rebuilt, PRIYA_DIEGO_INTAKE);

      expect(paintFloorMet).toBe(true);
      expect(retryLockoutMet).toBe(true);
      expect(paintFloorMet).toBe(retryLockoutMet);
    });

    it("Marcus/Elena: body that passes paint floor also passes Retry lockout", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const rebuilt = rebuildBodyFromIntakeForProFailure(MARCUS_ELENA_INTAKE, HOLLOW_DRAFT);

      const paintFloorMet = meetsPaidSessionFallbackPaintFloor(rebuilt, MARCUS_ELENA_INTAKE);
      const retryLockoutMet = rebuilt.trim().length >= 200 && isNonHollowBody(rebuilt, MARCUS_ELENA_INTAKE);

      expect(paintFloorMet).toBe(true);
      expect(retryLockoutMet).toBe(true);
      expect(paintFloorMet).toBe(retryLockoutMet);
    });

    it("hollow body: neither paint floor nor Retry lockout passes", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const hollowBody = `SERVICES AGREEMENT

This Agreement is entered into by and between:

Party A ("Client")
and
Party B ("Service Provider")

1. SERVICES
Service Provider agrees to provide covers due. Work.

2. PAYMENT TERMS
To be agreed.

3. GOVERNING LAW
To be determined.`;

      const paintFloorMet = meetsPaidSessionFallbackPaintFloor(hollowBody, PRIYA_DIEGO_INTAKE);
      const retryLockoutMet = hollowBody.trim().length >= 200 && isNonHollowBody(hollowBody, PRIYA_DIEGO_INTAKE);

      expect(paintFloorMet).toBe(false);
      expect(retryLockoutMet).toBe(false);
      expect(paintFloorMet).toBe(retryLockoutMet);
    });
  });

  describe("Universal rule: two different dumps prove non-visitor-specific behavior", () => {
    it("both dumps produce valid 200-999 char rebuilds that paint", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const intakes = [PRIYA_DIEGO_INTAKE, MARCUS_ELENA_INTAKE];

      for (const intake of intakes) {
        const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);

        expect(rebuilt.length).toBeGreaterThanOrEqual(200);
        expect(meetsPaidSessionFallbackPaintFloor(rebuilt, intake)).toBe(true);

        const shellResult = resolveCanonicalPlainForVisibleShell({
          acceptedCanonicalPlain: rebuilt,
          intakeText: intake,
          paidProActive: false,
          agreementId: "",
        });

        expect(shellResult.plain.length).toBeGreaterThanOrEqual(200);
        expect(shellResult.plain).not.toBe("");
      }
    });

    it("both dumps: Retry lockout matches paint decision", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const intakes = [PRIYA_DIEGO_INTAKE, MARCUS_ELENA_INTAKE];

      for (const intake of intakes) {
        const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);

        const paintFloorMet = meetsPaidSessionFallbackPaintFloor(rebuilt, intake);
        const retryLockoutMet = rebuilt.trim().length >= 200 && isNonHollowBody(rebuilt, intake);

        expect(paintFloorMet).toBe(retryLockoutMet);
      }
    });
  });
});
