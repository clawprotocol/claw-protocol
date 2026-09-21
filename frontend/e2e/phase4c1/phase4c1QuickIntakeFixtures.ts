/**
 * Phase 4C.1 Quick intake fixtures. Playwright route interception only.
 */
import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import {
  PHASE4C1_COMPLETE_SAAS,
  PHASE4C1_SPARSE_SAAS,
} from "../../src/launch/phase4c1QuickIntakeCoverage";
import { QUICK_PDF_RETURN_PATH } from "../../src/launch/quickPdfReturnAuthority";

export const PHASE4C1_OWNER = {
  id: "user-phase4c1-owner",
  email: "owner.phase4c1@example.com",
  name: "Phase 4C.1 Owner",
  orgId: "user-phase4c1-owner",
};

export const PHASE4C1_OTHER_ORG = "user-phase4c1-other";
export const PHASE4C1_CONTINUATION_ID = "cont-phase4c1-quick-pdf";
export const PHASE4C1_AUTH_CODE = "sb-phase4c1-auth-code";
export const PHASE4C1_DOCUMENT_ID = "doc_phase4c1_pdf";
export const PHASE4C1_PDF = Buffer.from("%PDF-1.4 phase4c1-small-owner-bytes\n", "utf8");
export const PHASE4C1_PDF_SHA = createHash("sha256").update(PHASE4C1_PDF).digest("hex");
export const PHASE4C1_PDF_TYPE = "application/pdf";

export { PHASE4C1_COMPLETE_SAAS, PHASE4C1_SPARSE_SAAS, QUICK_PDF_RETURN_PATH };

export type Phase4c1Entitlement = "paid" | "guest" | "auth_fail" | "forbidden" | "probe_fail";

export type Phase4c1FixtureState = {
  entitlement: Phase4c1Entitlement;
  finalizeHits: number;
  documentPosts: Array<{ orgId: string; hasAuth: boolean }>;
  documentGets: string[];
  continuationCreates: Array<{ dest: string; purpose: string }>;
  signSessionPosts: number;
  uploadStatus: number | "network";
  uploadDetail?: string;
  getStatus: number;
  ownerOrgId: string;
};

export function createPhase4c1State(partial?: Partial<Phase4c1FixtureState>): Phase4c1FixtureState {
  return {
    entitlement: "paid",
    finalizeHits: 0,
    documentPosts: [],
    documentGets: [],
    continuationCreates: [],
    signSessionPosts: 0,
    uploadStatus: 200,
    getStatus: 200,
    ownerOrgId: PHASE4C1_OWNER.orgId,
    ...partial,
  };
}

export function phase4c1OwnerSession() {
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: "e2e-phase4c1-access-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: PHASE4C1_OWNER.id,
      email: PHASE4C1_OWNER.email,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: PHASE4C1_OWNER.name },
      identities: [{ provider: "email", id: "e2e-phase4c1-id" }],
    },
  };
}

export async function seedPhase4c1Owner(page: Page, args?: { staleTier?: string }): Promise<void> {
  await seedE2eAuthSession(page, phase4c1OwnerSession());
  await page.addInitScript(
    ({ orgId, tier }) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        if (tier) localStorage.setItem("claw_tier", tier);
      } catch {
        /* ignore */
      }
    },
    { orgId: PHASE4C1_OWNER.orgId, tier: args?.staleTier || "" },
  );
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function readJsonBody(route: Route): Record<string, unknown> {
  try {
    return JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function paidSummary() {
  return {
    tier: "paid",
    state: "pro",
    grant_source: "stripe",
    agreements_used: 1,
    agreements_remaining: 99,
    agreements_created: 1,
    agreements_completed: 0,
    drafts_active: 0,
    drafts_remaining: 99,
    watermark_required: false,
    storage_persistent: true,
    paywall_required: false,
    soft_throttle: false,
    can_create_persisted_agreement: true,
    can_save_guest_draft: false,
    commercial: {
      state: "pro",
      entitlement: "paid_pro",
      grant_source: "stripe",
      create_allowed: true,
      upgrade_required: false,
      can_create_persisted_agreement: true,
      can_save_guest_draft: false,
    },
  };
}

function guestSummary() {
  return {
    tier: "guest",
    state: "guest",
    grant_source: "none",
    agreements_used: 0,
    agreements_remaining: 0,
    agreements_created: 0,
    agreements_completed: 0,
    drafts_active: 0,
    drafts_remaining: 0,
    watermark_required: true,
    storage_persistent: false,
    paywall_required: true,
    soft_throttle: false,
    can_create_persisted_agreement: false,
    can_save_guest_draft: true,
    commercial: {
      state: "guest",
      entitlement: "guest",
      grant_source: "none",
      create_allowed: false,
      upgrade_required: true,
      can_create_persisted_agreement: false,
      can_save_guest_draft: true,
    },
  };
}

const API_GLOBS = ["**/api/**", "**/v1/**", "**/health", "**/health/**", "**/version", "**/version/**", "**/__supabase/**"] as const;

export async function installPhase4c1ApiMocks(page: Page, state: Phase4c1FixtureState): Promise<void> {
  for (const glob of API_GLOBS) {
    await page.route(glob, (route) => fulfillPhase4c1Api(route, state));
  }
}

async function fulfillPhase4c1Api(route: Route, state: Phase4c1FixtureState): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const orgId = (req.headers()["x-claw-org-id"] || "").trim();
  const hasAuth = Boolean((req.headers().authorization || "").trim());

  if (url.includes("/__supabase")) {
    const session = phase4c1OwnerSession();
    if (url.includes("/auth/v1/token") || url.includes("/auth/v1/session") || url.includes("/auth/v1/user")) {
      await json(route, {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: "bearer",
        expires_in: 3600,
        user: session.user,
      });
      return;
    }
    await json(route, { ok: true });
    return;
  }

  if (url.includes("/health") || url.includes("/version")) {
    await json(route, { ok: true });
    return;
  }

  if (url.includes("/v1/workspace/auth-continuation") && method === "POST") {
    const body = readJsonBody(route);
    state.continuationCreates.push({
      dest: String(body.destination_path || ""),
      purpose: String(body.auth_purpose || ""),
    });
    await json(route, {
      ok: true,
      continuation_id: PHASE4C1_CONTINUATION_ID,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      org_id: "",
      destination_path:
        String(body.auth_purpose || "") === "quick_pdf_return" &&
        String(body.destination_path || "") === QUICK_PDF_RETURN_PATH
          ? QUICK_PDF_RETURN_PATH
          : "/app",
    });
    return;
  }

  if (url.includes("/v1/workspace/finalize-auth") && method === "POST") {
    state.finalizeHits += 1;
    await json(route, {
      ok: true,
      org_id: PHASE4C1_OWNER.orgId,
      user_id: PHASE4C1_OWNER.id,
      destination_path: QUICK_PDF_RETURN_PATH,
      migrated_agreement_count: 0,
      migrated_agreement_ids: [],
    });
    return;
  }

  if (url.includes("/v1/workspace/bind-user-org") && method === "POST") {
    await json(route, {
      ok: true,
      org_id: PHASE4C1_OWNER.orgId,
      user_id: PHASE4C1_OWNER.id,
      migrated_agreement_count: 0,
      migrated_agreement_ids: [],
    });
    return;
  }

  if (url.includes("/v1/workspace/anonymous-session")) {
    await json(route, {
      ok: true,
      org_id: "anon-phase4c1-must-not-own",
      session_id: "anon-session-phase4c1",
      token: "anon-token-phase4c1",
    });
    return;
  }

  if (url.includes("/api/agreements/usage/summary")) {
    if (state.entitlement === "auth_fail") {
      await json(route, { detail: "unauthorized" }, 401);
      return;
    }
    if (state.entitlement === "forbidden") {
      await json(route, { detail: { code: "document_org_mismatch" } }, 403);
      return;
    }
    if (state.entitlement === "probe_fail") {
      await json(route, { detail: "unavailable" }, 503);
      return;
    }
    await json(route, state.entitlement === "guest" ? guestSummary() : paidSummary());
    return;
  }

  if (url.includes("/v1/sign-sessions") && method === "POST") {
    state.signSessionPosts += 1;
    await json(route, { detail: "not_in_phase_4c1" }, 403);
    return;
  }

  if (/\/v1\/documents\/?$/.test(new URL(url).pathname) && method === "POST") {
    state.documentPosts.push({ orgId, hasAuth });
    if (state.uploadStatus === "network") {
      await route.abort("failed");
      return;
    }
    if (state.uploadStatus !== 200) {
      await json(route, { detail: state.uploadDetail || "document_unavailable" }, state.uploadStatus);
      return;
    }
    await json(route, {
      ok: true,
      document_id: PHASE4C1_DOCUMENT_ID,
      content_sha256: PHASE4C1_PDF_SHA,
      size_bytes: PHASE4C1_PDF.length,
      content_type: PHASE4C1_PDF_TYPE,
      owner_org_id: PHASE4C1_OWNER.orgId,
    });
    return;
  }

  if (url.includes("/v1/documents/") && method === "GET") {
    const did = decodeURIComponent(url.split("/v1/documents/")[1]?.split(/[/?#]/)[0] || "");
    state.documentGets.push(did);
    if (orgId && orgId !== state.ownerOrgId) {
      await json(route, { detail: { code: "document_org_mismatch" } }, 403);
      return;
    }
    if (state.getStatus !== 200) {
      await json(route, { detail: { code: "document_org_mismatch" } }, state.getStatus);
      return;
    }
    if (url.includes("/content")) {
      await route.fulfill({
        status: 200,
        contentType: PHASE4C1_PDF_TYPE,
        body: PHASE4C1_PDF,
      });
      return;
    }
    await json(route, {
      ok: true,
      document: {
        document_id: PHASE4C1_DOCUMENT_ID,
        content_sha256: PHASE4C1_PDF_SHA,
        size_bytes: PHASE4C1_PDF.length,
        content_type: PHASE4C1_PDF_TYPE,
        owner_org_id: PHASE4C1_OWNER.orgId,
      },
    });
    return;
  }

  if (method === "POST" && url.includes("/api/agreements")) {
    await json(route, { id: "ag-phase4c1-create", title: "Phase 4C.1 draft" });
    return;
  }

  if (url.includes("/v1/subscriptions") || url.includes("/api/agreements")) {
    await json(route, {
      ok: true,
      agreements: [],
      skipped: [],
      subscription: { org_id: PHASE4C1_OWNER.orgId, plan_code: "pro", status: "active" },
    });
    return;
  }

  await json(route, { ok: true });
}

export function phase4c1CallbackPath(args?: { next?: string }): string {
  const q = new URLSearchParams();
  q.set("code", PHASE4C1_AUTH_CODE);
  q.set("continuation_id", PHASE4C1_CONTINUATION_ID);
  if (args?.next) q.set("next", args.next);
  return `/app/auth/callback?${q.toString()}`;
}
