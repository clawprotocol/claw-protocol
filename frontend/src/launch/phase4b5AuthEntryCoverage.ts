/**
 * Phase 4B.5 `/app/sign-in` + `/app/auth/callback` coverage.
 * Fail closed if prefix-based redirect acceptance returns, if caller `next`
 * can beat server continuation, or if recipient tokens/private paper can ride
 * through sign-in URLs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAllowlistedInternalPath,
  resolveAuthCallbackDestination,
  resolveSafeRedirectPath,
  resolveSignInContinuationDestination,
} from "../auth/safeRedirectResolver";
import { isPublicProductionHostname } from "./devPaymentBypass";
import { isStagingAuthMagicLinkClientSurface } from "../auth/stagingAuthMagicLink";
import { matchAppRoute } from "./routes";

export const PHASE4B5_COVERAGE_AGREEMENT_ID = "ag-phase4b5-orion";
export const PHASE4B5_COVERAGE_CONTINUATION_ID = "cont-phase4b5-orion";
export const PHASE4B5_COVERAGE_AUTH_CODE = "sb-phase4b5-auth-code";
export const PHASE4B5_COVERAGE_RECIPIENT_TOKEN = "tok-phase4b5-recipient-secret";
export const PHASE4B5_COVERAGE_OTHER_TITLE = "OTHER-CUSTOMER-AGREEMENT-MUST-NOT-RENDER";

const FRONTEND_AUTH_REDIRECT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../auth/safeRedirectResolver.ts",
);
const BACKEND_AUTH_REDIRECT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../backend/security/safe_redirect.py",
);

function assertNoPrefixAllowlist(source: string, label: string): void {
  if (source.includes("ALLOWED_PREFIXES")) {
    throw new Error(`${label} restored prefix-based redirect acceptance`);
  }
  if (/p\.startsWith\(prefix\)|path\.startswith\(prefix\)/.test(source)) {
    throw new Error(`${label} restored prefix startswith redirect acceptance`);
  }
}

export function assertPhase4b5AuthEntryRoutes(): void {
  assertNoPrefixAllowlist(readFileSync(FRONTEND_AUTH_REDIRECT, "utf8"), "frontend safeRedirectResolver");
  assertNoPrefixAllowlist(readFileSync(BACKEND_AUTH_REDIRECT, "utf8"), "backend safe_redirect");

  if (matchAppRoute("/app/sign-in")?.routeId !== "sign-in") {
    throw new Error("/app/sign-in lost its public sign-in route");
  }
  if (matchAppRoute("/app/auth/callback")?.routeId !== "auth-callback") {
    throw new Error("/app/auth/callback lost its public callback route");
  }

  const allowed = [
    "/app",
    `/app/create?agreementId=${PHASE4B5_COVERAGE_AGREEMENT_ID}`,
    "/app/create?restore=starterReview",
    `/app/checkout/${PHASE4B5_COVERAGE_AGREEMENT_ID}`,
    `/app/send/${PHASE4B5_COVERAGE_AGREEMENT_ID}`,
    `/app/send/${PHASE4B5_COVERAGE_AGREEMENT_ID}?phase=send`,
    `/app/done/${PHASE4B5_COVERAGE_AGREEMENT_ID}`,
    "/app/settings",
    "/app/billing",
  ];
  for (const path of allowed) {
    if (!isAllowlistedInternalPath(path)) {
      throw new Error(`valid LawDog destination was rejected: ${path}`);
    }
  }
  if (!isAllowlistedInternalPath("/dashboard")) {
    throw new Error("dashboard alias was rejected");
  }
  if (resolveSafeRedirectPath("/dashboard", "/app/billing") !== "/app") {
    throw new Error("dashboard alias must canonicalize to /app for sign-in return");
  }

  const rejected = [
    "/app.evil",
    "/app/evil",
    "/reviewevil",
    "/signature",
    "/review",
    "/sign",
    "/app/quick",
    "/app/admin",
    `javascript:alert(1)`,
    "//evil.example",
    "https://evil.example/phish",
    `/%2f%2fevil.example`,
    `/app/create?t=${PHASE4B5_COVERAGE_RECIPIENT_TOKEN}`,
    `/agreements/${PHASE4B5_COVERAGE_AGREEMENT_ID}/sign?t=${PHASE4B5_COVERAGE_RECIPIENT_TOKEN}`,
    `/app/esign/doc-1?vs01_recipient_sign=1&t=${PHASE4B5_COVERAGE_RECIPIENT_TOKEN}`,
  ];
  for (const path of rejected) {
    if (isAllowlistedInternalPath(path)) {
      throw new Error(`unsafe post-auth destination was accepted: ${path}`);
    }
    if (resolveSafeRedirectPath(path, "/app") !== "/app") {
      throw new Error(`unsafe destination did not fail closed: ${path}`);
    }
  }

  const serverDest = `/app/create?agreementId=${PHASE4B5_COVERAGE_AGREEMENT_ID}`;
  const forgedNext = "/app.evil";
  if (
    resolveAuthCallbackDestination({
      serverDestination: serverDest,
      usedContinuation: true,
      callerNext: forgedNext,
    }) !== serverDest
  ) {
    throw new Error("caller next beat a valid server continuation");
  }
  if (
    resolveAuthCallbackDestination({
      serverDestination: "",
      usedContinuation: true,
      callerNext: "/app/billing",
    }) !== "/app"
  ) {
    throw new Error("invalid server continuation fell through to caller next");
  }
  if (
    resolveSignInContinuationDestination(
      `?next=${encodeURIComponent(`/app/create?t=${PHASE4B5_COVERAGE_RECIPIENT_TOKEN}`)}`,
      "/app",
    ) !== "/app"
  ) {
    throw new Error("recipient token survived sign-in next");
  }

  for (const host of ["lawdog.me", "www.lawdog.me", "lawdog.ai", "www.lawdog.ai", "app.lawdog.ai"]) {
    if (!isPublicProductionHostname(host)) {
      throw new Error(`production hostname lost: ${host}`);
    }
  }
  if (isPublicProductionHostname("127.0.0.1") || isPublicProductionHostname("localhost")) {
    throw new Error("loopback was classified as public production");
  }
  if (typeof window !== "undefined" && isPublicProductionHostname(window.location.hostname)) {
    if (isStagingAuthMagicLinkClientSurface()) {
      throw new Error("production hostname must not expose staging/direct-login controls");
    }
  }
}

export function phase4b5SignInPath(next?: string): string {
  if (!next) return "/app/sign-in";
  return `/app/sign-in?next=${encodeURIComponent(next)}`;
}

export function phase4b5CallbackPath(args?: {
  continuationId?: string;
  next?: string;
  code?: string;
}): string {
  const q = new URLSearchParams();
  if (args?.code) q.set("code", args.code);
  if (args?.continuationId) q.set("continuation_id", args.continuationId);
  if (args?.next) q.set("next", args.next);
  const search = q.toString();
  return search ? `/app/auth/callback?${search}` : "/app/auth/callback";
}
