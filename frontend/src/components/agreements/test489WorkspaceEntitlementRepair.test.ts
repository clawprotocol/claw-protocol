/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  logDraftPostHttpFailure,
  readDraftCreateHttpErrorDetail,
} from "./draftCreateHttpError";
import {
  resolveEntitlementRepairOrgCandidates,
  resolvePrimaryEntitlementRepairOrg,
  writePaidCheckoutOrgId,
} from "../../launch/paidCheckoutOrgContext";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { markPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import { setOrgId } from "../../launch/orgContext";

describe("TEST489 — already-bound entitlement repair", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setOrgId("user-supabase-489");
  });

  it("resolveEntitlementRepairOrgCandidates includes local-org when paid session active", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(resolveEntitlementRepairOrgCandidates()).toContain("local-org");
    expect(resolvePrimaryEntitlementRepairOrg()).toBe("local-org");
  });

  it("clawAgreementHeaders sends entitlement repair org for paid session", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Org-Id"]).toBe("user-supabase-489");
    expect(headers["X-Claw-Entitlement-Repair-Org"]).toBe("local-org");
  });

  it("bindAuthenticatedUserToWorkspace sends entitlement_repair_candidates", () => {
    writePaidCheckoutOrgId("local-org");
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const src = readFileSync(join(__dirname, "../../auth/workspaceBindingApi.ts"), "utf8");
    expect(src).toContain("entitlement_repair_candidates");
    expect(src).toContain("resolveEntitlementRepairOrgCandidates");
  });

  it("logs full backend draft POST detail object without truncation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logDraftPostHttpFailure({
      status: 403,
      payload: {
        detail: {
          code: "draft_limit_reached",
          message: "Free workspaces can have up to 2 active drafts.",
          paywall: true,
        },
      },
    });
    expect(warn).toHaveBeenCalled();
    const arg = warn.mock.calls[0]?.[1] as { detail?: { code?: string } };
    expect(arg.detail?.code).toBe("draft_limit_reached");
    warn.mockRestore();
  });

  it("readDraftCreateHttpErrorDetail preserves structured backend codes", () => {
    const detail = readDraftCreateHttpErrorDetail({
      httpStatus: 403,
      responseBody: {
        detail: {
          code: "usage_restricted",
          message: "This workspace needs verification or an upgrade to create new drafts.",
          paywall: true,
        },
      },
    });
    expect(detail?.code).toBe("usage_restricted");
    expect(detail?.message).toContain("verification");
  });
});
