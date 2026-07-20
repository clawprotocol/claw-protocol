import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_AGREEMENT_CREATE_PATH,
  isKnownProductRoute,
  isLegacyAgreementCreateRoute,
  isSpaDeepLinkPath,
  normalizeProductPath,
  resolveLegacyAgreementCreateRedirect,
} from "./gtmLaunchRoutes";

describe("gtmLaunchRoutes", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizeProductPath("/app/create/")).toBe("/app/create");
    expect(normalizeProductPath("/")).toBe("/");
  });

  it("identifies legacy wizard create route", () => {
    expect(isLegacyAgreementCreateRoute("/app/agreements/new")).toBe(true);
    expect(isLegacyAgreementCreateRoute("/app/agreements/new/")).toBe(true);
    expect(isLegacyAgreementCreateRoute("/app/create")).toBe(false);
    expect(isLegacyAgreementCreateRoute("/app/agreements/abc-123")).toBe(false);
  });

  it("redirects legacy create while preserving query", () => {
    expect(resolveLegacyAgreementCreateRedirect("?intent=enterprise")).toBe(
      `${CANONICAL_AGREEMENT_CREATE_PATH}?intent=enterprise`,
    );
    expect(resolveLegacyAgreementCreateRedirect("")).toBe(CANONICAL_AGREEMENT_CREATE_PATH);
  });

  it("recognizes GTM product routes for SPA deep links", () => {
    expect(isKnownProductRoute("/")).toBe(true);
    expect(isKnownProductRoute("/terms")).toBe(true);
    expect(isKnownProductRoute("/app/create")).toBe(true);
    expect(isKnownProductRoute("/app/send/ag_1")).toBe(true);
    expect(isKnownProductRoute("/agreements/ag_1/review")).toBe(true);
    expect(isKnownProductRoute("/agreements/ag_1/sign", "?t=abc")).toBe(true);
    expect(isKnownProductRoute("/verify/ag_1")).toBe(true);
    expect(isKnownProductRoute("/app/verify/ag_1")).toBe(true);
    expect(isKnownProductRoute("/r/partner")).toBe(true);
    expect(isKnownProductRoute("/@acme")).toBe(true);
    expect(isKnownProductRoute("/doginal/acme")).toBe(true);
    expect(isKnownProductRoute("/app/agreements/new")).toBe(true);
  });

  it("treats unknown paths as not found candidates", () => {
    expect(isKnownProductRoute("/definitely-not-a-route")).toBe(false);
    expect(isKnownProductRoute("/app/unknown-surface")).toBe(false);
    expect(isKnownProductRoute("/@")).toBe(false);
  });

  it("mirrors deep-link classification for static hosting", () => {
    expect(isSpaDeepLinkPath("/agreements/deal/review")).toBe(true);
    expect(isSpaDeepLinkPath("/missing-page")).toBe(false);
  });
});

describe("ClawProductApp routing (static)", () => {
  const app = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");

  it("falls back to NotFoundPage for unknown paths", () => {
    expect(app).toContain("return <NotFoundPage />");
    expect(app).not.toContain("return <LaunchHomePage />;\n}");
  });

  it("redirects legacy wizard create to canonical /app/create", () => {
    expect(app).toContain("isLegacyAgreementCreateRoute");
    expect(app).toContain("resolveLegacyAgreementCreateRedirect");
    expect(app).toContain("<LaunchRouteRedirect");
  });
});
