/** @vitest-environment jsdom */
/**
 * Path rule: after-pay persist is not done until the paying LawDog user
 * (checkout-created demo session) sees that same agreement on the existing
 * dashboard / signatures list. Do not invent a new dashboard. Outside
 * signers still only get the private link + ceremony.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import {
  createDemoSessionUser,
  clearDemoSessionUser,
  hasDemoSessionUser,
} from "./guestCheckoutAuthority";
import { deriveCreatorDashboardStatus } from "./creatorDashboardPresentation";
import { markAgreementPacketPrepared } from "../vs01/vs01WorkspaceSigningStatus";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";

const repo = join(__dirname, "..");

function src(rel: string): string {
  return readFileSync(join(repo, rel), "utf8");
}

function row(id: string, extra?: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id,
    title: "Services Agreement",
    updated_at: "2026-08-25T00:00:00Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 0,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...extra,
  };
}

afterEach(() => {
  try {
    sessionStorage.clear();
    localStorage.clear();
    clearDemoSessionUser();
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("after-pay LawDog dashboard visibility (existing list, not a new page)", () => {
  it("dashboard and signatures load the existing workspace-index, not a new route", () => {
    const dashboard = src("launch/AppDashboard.tsx");
    const signatures = src("launch/LawdogSignaturesPage.tsx");
    const api = src("agreement/agreementWorkspaceApi.ts");
    const routes = src("launch/routes.ts");

    expect(dashboard).toContain("fetchWorkspaceIndex");
    expect(signatures).toContain("fetchWorkspaceIndex");
    expect(api).toContain("clawAgreementHeaders()");
    expect(api).toContain("/api/agreements/workspace-index");
    expect(routes).toContain('p === "/app/signatures"');
    expect(routes).not.toMatch(/\/app\/signatures\/new|\/app\/payer-agreements/);
  });

  it("workspace-index request carries the checkout-created demo receipt (same principal as persist)", () => {
    createDemoSessionUser({
      displayName: "Paid LawDog",
      email: "payer@example.com",
      settlementReceiptId: "rcpt_dashboard_4242_abcd",
    });
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Demo-Checkout-Receipt"]).toBe("rcpt_dashboard_4242_abcd");
  });

  it("existing dashboard gate treats the checkout-created user as signed-in on /app and /app/signatures", () => {
    const gate = src("auth/RequireAuthenticatedDashboard.tsx");
    const current = src("account/currentUser.ts");
    expect(gate).toContain("hasDemoSessionUser");
    expect(gate).toContain("/app and /app/signatures");
    expect(current).toContain('source: "demo_checkout"');
    expect(current).toContain("isAuthenticated: true");
    expect(current).toContain('p === "/app"');
    expect(current).toContain('p === "/app/billing" || p === "/app/settings" || p === "/app/signatures"');
  });

  it("fresh tab still carries the receipt after sessionStorage is empty (same durability as persist)", () => {
    createDemoSessionUser({
      displayName: "Paid LawDog",
      email: "payer@example.com",
      settlementReceiptId: "rcpt_dashboard_4242_abcd",
    });
    sessionStorage.clear();
    expect(hasDemoSessionUser()).toBe(true);
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Demo-Checkout-Receipt"]).toBe("rcpt_dashboard_4242_abcd");
  });

  it("persisted after-pay row is visible on the dashboard as a draft before Send signing links", () => {
    expect(deriveCreatorDashboardStatus(row("agr_after_pay"))).toBe("draft");
  });

  it("after Send signing links, the same row is signing_in_progress on the existing signatures list", () => {
    markAgreementPacketPrepared("agr_after_pay");
    const status = deriveCreatorDashboardStatus(row("agr_after_pay"));
    expect(status).toBe("signing_in_progress");
    expect(status === "signing_in_progress" || status === "completed").toBe(true);
  });

  it("does not mark the packet prepared on workspace persist (Send signing links must still run)", () => {
    const persist = src("vs01/paidProAfterPayEsignPacketPersist.test.ts");
    const wizard = src("vs01/Vs01Wizard.tsx");
    expect(persist).not.toContain("markAgreementPacketPrepared");
    expect(wizard).toContain("if (isAgreementPacketPrepared(linkedAgreementId))");
    expect(wizard).toContain("completeBridgePreparePacket()");
  });
});
