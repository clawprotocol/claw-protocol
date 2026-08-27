/** @vitest-environment jsdom */
/**
 * After-pay: verify 200 + checkout_session_id without sessionStorage resume
 * binds metadata.agreement_id, GET/resumes that persist, and starts Pro generation
 * — not Starter intake, Retry, or a second POST /draft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPreAuthCheckoutAgreementId } from "../auth/preAuthCheckoutAgreement";
import { readCreateComplexityResume } from "../components/agreements/agreementCreateComplexityResume";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { readOriginalUserIntakeRaw } from "../components/agreements/originalUserIntakeRawStorage";
import { handleCheckoutReturnEntitlement } from "./checkoutReturnEntitlement";
import { setOrgId } from "./orgContext";
import {
  bindAfterPayPersistAgreementId,
  readVerifiedAfterPayAgreementId,
  resumeAfterPayPersistForProGeneration,
} from "./afterPayPersistResume";

const PAID_PERSIST = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const CS =
  "cs_test_a1tfvd12sloPecj8WZjfDjA3B3JPGc2ogj8gPkrxT51EdRs3D9KXdYEVgO";

const starterDraft = {
  id: PAID_PERSIST,
  title: "Professional services agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  purpose: "Harbor Peak will automate Red Mesa dispatch reporting for twelve months.",
  payment_terms: "$4,800 per month",
  duration: "12 months",
  due_date: null,
  effective_date: null,
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
  versions: [],
  audit_log: [],
};

describe("after-pay persist resume from verified checkout", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setOrgId("user-83caa7c7-f671-44ec-897a-ed673503c008");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("verified metadata.agreement_id is persist authority; sentinel is ignored", () => {
    expect(readVerifiedAfterPayAgreementId({ agreement_id: PAID_PERSIST })).toBe(PAID_PERSIST);
    expect(readVerifiedAfterPayAgreementId({ agreement_id: "__claw_create_checkout__" })).toBeNull();
    expect(readVerifiedAfterPayAgreementId({})).toBeNull();
  });

  it("bind writes resume + pre-auth without a prior sessionStorage resume", () => {
    expect(readCreateReviewAgreementResumeId()).toBeNull();
    expect(bindAfterPayPersistAgreementId(PAID_PERSIST)).toBe(PAID_PERSIST);
    expect(readCreateReviewAgreementResumeId()).toBe(PAID_PERSIST);
    expect(readPreAuthCheckoutAgreementId()).toBe(PAID_PERSIST);
  });

  it("verify 200 without sessionStorage resume binds the same persist", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: `https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=${CS}`,
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("verify-checkout-session")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              ok: true,
              agreement_id: PAID_PERSIST,
              subscription: { plan_code: "pro", status: "active" },
            }),
        };
      }
      return { ok: false, status: 404, text: async () => "not found" };
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(readCreateReviewAgreementResumeId()).toBeNull();
    const ok = await handleCheckoutReturnEntitlement();
    expect(ok).toBe(true);
    expect(readCreateReviewAgreementResumeId()).toBe(PAID_PERSIST);
    expect(readPreAuthCheckoutAgreementId()).toBe(PAID_PERSIST);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/agreements/draft"))).toBe(
      false,
    );
  });

  it("GET /api/agreements/:id resumes starter facts for Pro generation, no remint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes(`/api/agreements/${PAID_PERSIST}`) && (!init?.method || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ draft: starterDraft }),
        };
      }
      throw new Error(`unexpected fetch ${init?.method || "GET"} ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resumed = await resumeAfterPayPersistForProGeneration(PAID_PERSIST);
    expect(resumed?.agreementId).toBe(PAID_PERSIST);
    expect(resumed?.prior.title).toBe("Professional services agreement");
    expect(resumed?.prior.parties.map((p) => p.name)).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
    ]);
    expect(resumed?.intake).toMatch(/Harbor Peak will automate Red Mesa/);
    expect(readOriginalUserIntakeRaw()).toMatch(/Harbor Peak will automate Red Mesa/);
    expect(readCreateComplexityResume()?.pending.title).toBe("Professional services agreement");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/agreements/${PAID_PERSIST}`);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/agreements/draft"))).toBe(
      false,
    );
  });
});

describe("after-pay intake wiring (persist GET)", () => {
  const intake = readFileSync(
    join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const returnUx = readFileSync(join(__dirname, "checkoutReturnEntitlement.ts"), "utf8");
  const billing = readFileSync(join(__dirname, "billingCheckoutApi.ts"), "utf8");

  it("verify response carries agreement_id and handleCheckout binds it", () => {
    expect(billing).toContain("agreement_id?: string");
    expect(returnUx).toContain("readVerifiedAfterPayAgreementId");
    expect(returnUx).toContain("bindAfterPayPersistAgreementId");
  });

  it("post-checkout effect GET/resumes the paid persist after verify 200", () => {
    const effectIdx = intake.indexOf("After create-flow checkout: premium completion");
    expect(effectIdx).toBeGreaterThan(-1);
    const effect = intake.slice(effectIdx, intake.indexOf("const upgradeContextReasons", effectIdx));
    expect(effect).toContain("handleCheckoutReturnEntitlement");
    expect(effect).toContain("resumeAfterPayPersistForProGeneration");
    expect(effect).toContain("readCreateReviewAgreementResumeId");
    const verifyIdx = effect.indexOf("handleCheckoutReturnEntitlement");
    const resumeIdx = effect.indexOf("resumeAfterPayPersistForProGeneration");
    expect(resumeIdx).toBeGreaterThan(verifyIdx);
    const abortIdx = effect.indexOf("premium_rewrite_aborted");
    const stripAfterAbort = effect.indexOf("stripPremiumCompletionQueryParam()", abortIdx);
    expect(stripAfterAbort).toBe(-1);
  });
});
