/**
 * Phase 4B.5.1 success-landing fixtures.
 * Playwright route interception only — no window.fetch replacement, no pre-seeded destination.
 */
import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import {
  PHASE4B51_AGREEMENT_ID,
  PHASE4B51_AUTH_CODE,
  PHASE4B51_CONTINUATION_ID,
  PHASE4B51_CREATE_AGREEMENT_ID,
  PHASE4B51_CREATE_CONTINUATION_ID,
  PHASE4B51_CREATE_DEST,
  PHASE4B51_DONE_DEST,
  PHASE4B51_OTHER_TITLE,
  PHASE4B51_RECIPIENT_TOKEN,
  PHASE4B51_TITLE,
} from "../../src/launch/phase4b51AuthSuccessLandingCoverage";

export const PHASE4B51_OWNER = {
  id: "user-phase4b51-owner",
  email: "owner.phase4b51@example.com",
  name: "Phase 4B.5.1 Owner",
  orgId: "user-phase4b51-owner",
};

export const PHASE4B51_PAPER = [
  PHASE4B51_TITLE,
  "This Agreement is entered into by and between Orion Harbor LLC (\"Provider\") and Northwind Retail Inc (\"Customer\").",
  "",
  "1. Scope",
  "Provider will supply the hosted SaaS platform and related onboarding described in the order form.",
  "",
  "2. Fees",
  "Customer will pay $180,000 annual subscription fees.",
  "",
  "3. Term",
  "The initial term is twelve months and renews unless terminated on thirty days' notice.",
  "",
  "4. Confidentiality and intellectual property",
  "Each party will protect confidential information. Customer owns its data. Provider owns the platform.",
  "",
  "5. Governing law",
  "This Agreement is governed by the laws of New York.",
  "",
  "6. Notices",
  "Notices to Orion Harbor LLC and Northwind Retail Inc must be in writing.",
  "",
  "IN WITNESS WHEREOF, the parties execute this Agreement.",
  "Orion Harbor LLC",
  "Northwind Retail Inc",
  "",
  "7. Limitation of liability",
  "Except for confidentiality breaches and infringement indemnity, neither party's aggregate liability exceeds the fees paid in the twelve months before the claim.",
  "",
  "8. Data protection",
  "Provider will process Customer data only to perform this Agreement and will maintain commercially reasonable administrative, technical, and physical safeguards.",
  "",
  "9. Termination",
  "Either party may terminate for material breach that remains uncured thirty days after written notice.",
  "",
  "10. Entire agreement",
  "This Agreement, including the order form, is the entire agreement and supersedes prior discussions relating to the SaaS subscription.",
].join("\n");

export const PHASE4B51_PAPER_SHA = createHash("sha256").update(PHASE4B51_PAPER, "utf8").digest("hex");

export {
  PHASE4B51_AGREEMENT_ID,
  PHASE4B51_AUTH_CODE,
  PHASE4B51_CONTINUATION_ID,
  PHASE4B51_CREATE_AGREEMENT_ID,
  PHASE4B51_CREATE_CONTINUATION_ID,
  PHASE4B51_CREATE_DEST,
  PHASE4B51_DONE_DEST,
  PHASE4B51_OTHER_TITLE,
  PHASE4B51_RECIPIENT_TOKEN,
  PHASE4B51_TITLE,
};

export type Phase4b51FixtureState = {
  finalizeHits: Array<{ continuationId: string; userId: string }>;
  destinationPath: string;
  agreementId: string;
  continuationId: string;
  agreementGets: string[];
  draftPosts: number;
};

export function createPhase4b51DoneState(): Phase4b51FixtureState {
  return {
    finalizeHits: [],
    destinationPath: PHASE4B51_DONE_DEST,
    agreementId: PHASE4B51_AGREEMENT_ID,
    continuationId: PHASE4B51_CONTINUATION_ID,
    agreementGets: [],
    draftPosts: 0,
  };
}

export function createPhase4b51CreateState(): Phase4b51FixtureState {
  return {
    finalizeHits: [],
    destinationPath: PHASE4B51_CREATE_DEST,
    agreementId: PHASE4B51_CREATE_AGREEMENT_ID,
    continuationId: PHASE4B51_CREATE_CONTINUATION_ID,
    agreementGets: [],
    draftPosts: 0,
  };
}

export function phase4b51OwnerSession() {
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: "e2e-phase4b51-access-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: PHASE4B51_OWNER.id,
      email: PHASE4B51_OWNER.email,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: PHASE4B51_OWNER.name },
      identities: [{ provider: "email", id: "e2e-phase4b51-id" }],
    },
  };
}

/** Provider session only. No org, continuation, or destination storage. */
export async function seedPhase4b51ProviderSessionOnly(page: Page): Promise<void> {
  await seedE2eAuthSession(page, phase4b51OwnerSession());
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

function draftRecord(id: string) {
  return {
    id,
    title: PHASE4B51_TITLE,
    jurisdiction: "New York",
    parties: [
      { name: "Orion Harbor LLC", role: "Provider", signerName: "Alex Rivera", signerEmail: "alex@orion.example" },
      { name: "Northwind Retail Inc", role: "Customer", signerName: "Jordan Blake", signerEmail: "jordan@northwind.example" },
    ],
    purpose: "Hosted SaaS subscription.",
    payment_terms: "$180,000 annual",
    duration: "12 months",
    document_text: PHASE4B51_PAPER,
    server_full_document_text: PHASE4B51_PAPER,
    premium_full_document_text: PHASE4B51_PAPER,
    premium_server_full_document_text: PHASE4B51_PAPER,
    authoritative_draft: PHASE4B51_PAPER,
    premium_render_source: "server_full_document_text",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z" }],
    audit_log: [],
    accepted_review_snapshot: {
      snapshot_id: `crs-${id}`,
      status: "accepted",
      corpus_plain: PHASE4B51_PAPER,
      corpus_sha256: PHASE4B51_PAPER_SHA,
      corpus_length: PHASE4B51_PAPER.length,
    },
    completed_signed: id === PHASE4B51_AGREEMENT_ID,
  };
}

function snapshotRecord(id: string) {
  return {
    ok: true,
    snapshot_id: `crs-${id}`,
    agreement_id: id,
    corpus_plain: PHASE4B51_PAPER,
    corpus_sha256: PHASE4B51_PAPER_SHA,
    corpus_length: PHASE4B51_PAPER.length,
    status: "accepted",
    registry_version: 1,
  };
}

const API_GLOBS = ["**/api/**", "**/v1/**", "**/health", "**/health/**", "**/version", "**/version/**", "**/__supabase/**"] as const;

export async function installPhase4b51ApiMocks(page: Page, state: Phase4b51FixtureState): Promise<void> {
  for (const glob of API_GLOBS) {
    await page.route(glob, (route) => fulfillPhase4b51Api(route, state));
  }
}

async function fulfillPhase4b51Api(route: Route, state: Phase4b51FixtureState): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();

  if (url.includes("/__supabase")) {
    if (url.includes("/auth/v1/token") || url.includes("/auth/v1/session") || url.includes("/auth/v1/user")) {
      const session = phase4b51OwnerSession();
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

  if (url.includes("/v1/workspace/finalize-auth") && method === "POST") {
    const body = readJsonBody(route);
    const continuationId = String(body.continuation_id || "").trim();
    const auth = (req.headers().authorization || "").trim();
    const userId =
      auth.includes(PHASE4B51_OWNER.id) || auth.includes("e2e-phase4b51")
        ? PHASE4B51_OWNER.id
        : "user-phase4b51-other";
    state.finalizeHits.push({ continuationId, userId });
    if (continuationId !== state.continuationId) {
      await json(route, { detail: { code: "continuation_not_found" } }, 404);
      return;
    }
    await json(route, {
      ok: true,
      org_id: PHASE4B51_OWNER.orgId,
      user_id: PHASE4B51_OWNER.id,
      destination_path: state.destinationPath,
      migrated_agreement_count: state.finalizeHits.length > 1 ? 0 : 1,
      migrated_agreement_ids: state.finalizeHits.length > 1 ? [] : [state.agreementId],
      idempotent: state.finalizeHits.length > 1,
    });
    return;
  }

  if (url.includes("/v1/workspace/bind-user-org") && method === "POST") {
    await json(route, {
      ok: true,
      org_id: PHASE4B51_OWNER.orgId,
      user_id: PHASE4B51_OWNER.id,
      migrated_agreement_count: 0,
      migrated_agreement_ids: [],
    });
    return;
  }

  if (url.includes("/v1/workspace/anonymous-session")) {
    await json(route, {
      ok: true,
      org_id: "anon-phase4b51-must-not-win",
      session_id: "anon-session-phase4b51",
      token: "anon-token-phase4b51",
    });
    return;
  }

  if (url.includes("/v1/subscriptions")) {
    await json(route, {
      ok: true,
      subscription: { org_id: PHASE4B51_OWNER.orgId, plan_code: "pro", status: "active" },
    });
    return;
  }

  if (url.includes("/api/agreements/usage/summary")) {
    await json(route, {
      tier: "paid",
      state: "pro",
      grant_source: "stripe",
      agreements_used: 1,
      agreements_limit: 100,
      agreements_remaining: 99,
      can_create_persisted_agreement: true,
      can_save_guest_draft: false,
      watermark_required: false,
      paywall_required: false,
      commercial: {
        state: "pro",
        entitlement: "paid_pro",
        grant_source: "stripe",
        agreement_allowance: 100,
        agreements_used: 1,
        agreements_remaining: 99,
        can_create_persisted_agreement: true,
        create_allowed: true,
        upgrade_required: false,
        reason: null,
      },
    });
    return;
  }

  if (url.includes("/api/agreements/workspace-index")) {
    await json(route, {
      agreements: [
        {
          id: state.agreementId,
          title: PHASE4B51_TITLE,
          updated_at: "2026-09-01T00:00:00.000Z",
          party_count: 2,
          signer_count: 2,
          accepted_review_snapshot: {
            snapshot_id: `crs-${state.agreementId}`,
            status: "accepted",
            corpus_plain: PHASE4B51_PAPER,
            corpus_sha256: PHASE4B51_PAPER_SHA,
            corpus_length: PHASE4B51_PAPER.length,
          },
        },
      ],
      skipped: [],
      error: null,
    });
    return;
  }

  if (url.includes("/canonical-review-snapshot")) {
    const match = url.match(/\/api\/agreements\/([^/?]+)\/canonical-review-snapshot/);
    const id = decodeURIComponent(match?.[1] || state.agreementId);
    await json(route, snapshotRecord(id));
    return;
  }

  if (url.includes("/render")) {
    const match = url.match(/\/api\/agreements\/([^/?]+)\/render/);
    const id = decodeURIComponent(match?.[1] || state.agreementId);
    await json(route, {
      ok: true,
      agreement_id: id,
      rendered_html: `<article><pre>${PHASE4B51_PAPER}</pre></article>`,
      document_text: PHASE4B51_PAPER,
      server_full_document_text: PHASE4B51_PAPER,
      premium_render_source: "server_full_document_text",
    });
    return;
  }

  const exactAgreementGet = url.match(/\/api\/agreements\/([^/?#]+)(?:\?|#|$)/);
  if (exactAgreementGet && method === "GET" && !url.includes("/api/agreements/usage") && !url.includes("/workspace-index")) {
    const id = decodeURIComponent(exactAgreementGet[1] || "");
    state.agreementGets.push(id || url);
    if (id === PHASE4B51_AGREEMENT_ID || id === PHASE4B51_CREATE_AGREEMENT_ID) {
      await json(route, { draft: draftRecord(id), ok: true });
      return;
    }
    if (id && id !== "access" && id !== "parse") {
      await json(route, { error: "not_found" }, 404);
      return;
    }
  }

  if (url.includes("/verify") || url.includes("/public/")) {
    await json(route, { ok: true, status: "recorded", agreement_id: state.agreementId });
    return;
  }

  if (url.includes("/premium-full-draft") && method === "POST") {
    await json(route, {
      document_text: PHASE4B51_PAPER,
      server_full_document_text: PHASE4B51_PAPER,
      premium_full_document_text: PHASE4B51_PAPER,
      authoritative_draft: PHASE4B51_PAPER,
      premium_render_source: "server_full_document_text",
      agreement_id: state.agreementId,
      generation_outcome: "ok",
      generation_ok: true,
      validation: { ok: true },
    });
    return;
  }

  if (url.includes("/api/agreements/draft") && method === "POST") {
    state.draftPosts += 1;
    await json(route, {
      id: state.agreementId,
      draft: draftRecord(state.agreementId),
      economics: { tier: "paid", watermark_required: false, free_draft_expired: false },
    });
    return;
  }

  await json(route, { ok: true });
}

export function phase4b51CallbackPath(args: { continuationId: string; next?: string }): string {
  const q = new URLSearchParams({ continuation_id: args.continuationId });
  if (args.next) q.set("next", args.next);
  return `/app/auth/callback?${q.toString()}`;
}
