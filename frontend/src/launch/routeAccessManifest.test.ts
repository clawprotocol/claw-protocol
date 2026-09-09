import { describe, expect, it } from "vitest";
import {
  APP_ROUTE_MANIFEST,
  matchAppRoute,
  routeRequiresAuthenticatedSession,
  type AppRouteAccess,
  type AppSection,
} from "./routes";

type RouteExpectation = {
  path: string;
  kind: AppSection["kind"];
  access: AppRouteAccess;
  search?: string;
};

const ROUTE_EXPECTATIONS: RouteExpectation[] = [
  { path: "/app", kind: "dashboard", access: "authenticated" },
  { path: "/dashboard", kind: "dashboard", access: "authenticated" },
  { path: "/app/create", kind: "simpleCreate", access: "authenticated" },
  { path: "/app/quick", kind: "quickSend", access: "guest_workflow" },
  { path: "/app/sign-in", kind: "signIn", access: "public" },
  { path: "/app/auth/callback", kind: "authCallback", access: "public" },
  { path: "/app/billing", kind: "billing", access: "authenticated" },
  { path: "/app/settings", kind: "settings", access: "authenticated" },
  { path: "/app/signatures", kind: "signatures", access: "authenticated" },
  { path: "/app/work-product", kind: "advancedWorkProduct", access: "paid" },
  { path: "/app/agreements", kind: "agreements", access: "authenticated" },
  { path: "/app/agreements/new", kind: "agreements", access: "authenticated" },
  { path: "/app/agreements/ag-1", kind: "agreements", access: "authenticated" },
  { path: "/app/agreements/ag-1/view", kind: "ownerAgreementView", access: "authenticated" },
  { path: "/app/agreements/ag-1/view-signed", kind: "ownerSignedAgreementView", access: "authenticated" },
  { path: "/app/ready/ag-1", kind: "simpleReady", access: "authenticated" },
  { path: "/app/checkout/ag-1", kind: "simpleCheckout", access: "authenticated" },
  { path: "/app/send/ag-1", kind: "simpleSend", access: "authenticated" },
  { path: "/app/done/ag-1", kind: "simpleDone", access: "authenticated" },
  { path: "/app/review-changes/ag-1", kind: "ownerProposalReview", access: "authenticated" },
  { path: "/app/signing-status/ag-1", kind: "ownerSigningStatus", access: "authenticated" },
  { path: "/app/verification/ag-1", kind: "simpleVerification", access: "authenticated" },
  { path: "/app/field-review/analysis-1", kind: "fieldReview", access: "paid" },
  { path: "/app/receipts/usage-1", kind: "receipt", access: "authenticated" },
  { path: "/app/esign/new", kind: "esign", access: "guest_workflow" },
  { path: "/app/esign/doc-1", kind: "esign", access: "recipient_token" },
  { path: "/app/admin", kind: "adminConsole", access: "admin" },
  { path: "/app/ops/growth", kind: "opsGrowth", access: "admin" },
  { path: "/app/ops/paid-funnel", kind: "opsPaidFunnel", access: "admin" },
];

describe("app route/access manifest", () => {
  it.each(ROUTE_EXPECTATIONS)("classifies $path as $access", ({ path, search, kind, access }) => {
    expect(matchAppRoute(path, search)).toMatchObject({
      access,
      section: { kind },
    });
  });

  it("keeps every manifest example unique and matched by its declaring route", () => {
    const examples = APP_ROUTE_MANIFEST.flatMap((route) =>
      route.examplePaths.map((path) => ({ path, routeId: route.id })),
    );
    expect(new Set(examples.map(({ path }) => path)).size).toBe(examples.length);
    for (const { path, routeId } of examples) {
      expect(matchAppRoute(path)?.routeId).toBe(routeId);
    }
  });

  it("classifies legacy agreement token links from either first or later query position", () => {
    expect(matchAppRoute("/app/agreements/ag-1", "?token=secret")?.access).toBe("recipient_token");
    expect(matchAppRoute("/app/agreements/ag-1", "?return=1&t=secret")?.access).toBe("recipient_token");
    expect(matchAppRoute("/app/agreements/ag-1?token=secret")?.access).toBe("recipient_token");
  });

  it("does not grant recipient access for an empty token", () => {
    expect(matchAppRoute("/app/agreements/ag-1", "?token=")?.access).toBe("authenticated");
  });

  it("requires a validated session for owner, paid, and admin access classes", () => {
    expect(routeRequiresAuthenticatedSession("public")).toBe(false);
    expect(routeRequiresAuthenticatedSession("guest_workflow")).toBe(false);
    expect(routeRequiresAuthenticatedSession("recipient_token")).toBe(false);
    expect(routeRequiresAuthenticatedSession("authenticated")).toBe(true);
    expect(routeRequiresAuthenticatedSession("paid")).toBe(true);
    expect(routeRequiresAuthenticatedSession("admin")).toBe(true);
  });

  it("fails closed for unknown app paths", () => {
    expect(matchAppRoute("/app/not-a-real-screen")).toBeNull();
  });
});
