/**
 * Phase 4A paid-owner browser fixtures.
 * Entitlement is org-scoped mocked server state — never path, UI tier, React, or storage.
 */
import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";

export const PHASE4A_ORG_A = "user-phase4a-paid-owner";
export const PHASE4A_ORG_B = "user-phase4a-other-org";

export const PHASE4A_PAID_USER = {
  id: "user-phase4a-paid",
  email: "paid.owner@example.com",
  name: "Phase 4A Paid Owner",
};

export const PHASE4A_FREE_USER = {
  id: "user-phase4a-free",
  email: "free.user@example.com",
  name: "Phase 4A Free User",
};

export const PHASE4A_IDS = {
  example: "example-agreement",
  draft: "ag-phase4a-draft",
  pending: "ag-phase4a-pending",
  frozen: "ag-phase4a-frozen",
  sent: "ag-phase4a-sent",
  partial: "ag-phase4a-partial",
  executed: "ag-phase4a-executed",
  otherOrg: "ag-phase4a-other-org",
  missing: "ag-phase4a-missing",
  receipt: "example-usage",
  analysis: "example-analysis",
  batch5: "ag-phase4a-batch5-saas",
} as const;

export const PHASE4A_TITLE = "SaaS Subscription Agreement";
export const PHASE4A_PARTY_0 = "Orion Labs LLC";
export const PHASE4A_PARTY_1 = "Contoso Retail Inc";
export const PHASE4A_FEE = "$180,000";
export const PHASE4A_LAW = "New York";

export const PHASE4A_FROZEN_BODY = [
  "SAAS SUBSCRIPTION AGREEMENT",
  `This Agreement is entered into by and between ${PHASE4A_PARTY_0} ("Provider") and ${PHASE4A_PARTY_1} ("Customer").`,
  "",
  "1. Scope",
  "Provider will supply the hosted SaaS platform and related onboarding described in the order form.",
  "",
  "2. Fees",
  `Customer will pay ${PHASE4A_FEE} annual subscription fees.`,
  "",
  "3. Term",
  "The initial term is twelve months and renews unless terminated on thirty days' notice.",
  "",
  "4. Confidentiality and intellectual property",
  "Each party will protect confidential information. Customer owns its data. Provider owns the platform.",
  "",
  "5. Governing law",
  `This Agreement is governed by the laws of ${PHASE4A_LAW}.`,
  "",
  "6. Notices",
  `Notices to ${PHASE4A_PARTY_0} and ${PHASE4A_PARTY_1} must be in writing.`,
  "",
  "IN WITNESS WHEREOF, the parties execute this Agreement.",
  `${PHASE4A_PARTY_0}`,
  `${PHASE4A_PARTY_1}`,
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

export const PHASE4A_FROZEN_SHA = createHash("sha256").update(PHASE4A_FROZEN_BODY, "utf8").digest("hex");

export type Phase4aActor = "paid" | "free" | "signed_out";

function authSeed(actor: "paid" | "free") {
  const user = actor === "paid" ? PHASE4A_PAID_USER : PHASE4A_FREE_USER;
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: actor === "paid" ? "e2e-phase4a-paid-token" : "e2e-phase4a-free-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: user.id,
      email: user.email,
      user_metadata: { full_name: user.name },
      identities: [{ provider: "email", id: `${user.id}-id` }],
    },
  };
}

function paidUsageSummary() {
  return {
    tier: "paid",
    state: "pro",
    grant_source: "stripe",
    agreements_used: 3,
    agreements_limit: 100,
    agreements_remaining: 97,
    can_create_persisted_agreement: true,
    can_save_guest_draft: false,
    watermark_required: false,
    paywall_required: false,
    commercial: {
      state: "pro",
      entitlement: "paid_pro",
      grant_source: "stripe",
      agreement_allowance: 100,
      agreements_used: 3,
      agreements_remaining: 97,
      can_create_persisted_agreement: true,
      create_allowed: true,
      upgrade_required: false,
      reason: null,
    },
  };
}

function freeUsageSummary() {
  return {
    tier: "free",
    state: "none",
    grant_source: "none",
    agreements_used: 0,
    agreements_limit: 1,
    agreements_remaining: 1,
    can_create_persisted_agreement: false,
    can_save_guest_draft: true,
    watermark_required: true,
    paywall_required: true,
    commercial: {
      state: "none",
      entitlement: "none",
      grant_source: "none",
      agreement_allowance: 0,
      agreements_used: 0,
      agreements_remaining: 0,
      can_create_persisted_agreement: false,
      create_allowed: false,
      upgrade_required: true,
      reason: "entitlement_required",
    },
  };
}

function draftRecord(id: string, extras?: Record<string, unknown>) {
  return {
    id,
    title: PHASE4A_TITLE,
    jurisdiction: PHASE4A_LAW,
    parties: [
      {
        name: PHASE4A_PARTY_0,
        role: "Provider",
        signerName: "Alex Rivera",
        signerEmail: "alex.rivera@orion-labs.example",
        email: "alex.rivera@orion-labs.example",
      },
      {
        name: PHASE4A_PARTY_1,
        role: "Customer",
        signerName: "Jordan Blake",
        signerEmail: "jordan.blake@contoso.example",
        email: "jordan.blake@contoso.example",
      },
    ],
    purpose: "Hosted SaaS subscription and onboarding.",
    payment_terms: `${PHASE4A_FEE} annual`,
    duration: "12 months",
    due_date: null,
    effective_date: "2026-09-01",
    document_text: PHASE4A_FROZEN_BODY,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z" }],
    audit_log: [],
    ...extras,
  };
}

function indexRow(id: string, extras?: Record<string, unknown>) {
  return {
    id,
    title: PHASE4A_TITLE,
    updated_at: "2026-09-01T00:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    accepted_review_snapshot: {
      snapshot_id: `crs-${id}`,
      corpus_sha256: PHASE4A_FROZEN_SHA,
      corpus_length: PHASE4A_FROZEN_BODY.length,
      status: "accepted",
    },
    ...extras,
  };
}

function orgFromRequest(route: Route): string {
  return (route.request().headers()["x-claw-org-id"] || "").trim();
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function safePostJson(route: Route): Record<string, unknown> {
  try {
    const posted = route.request().postDataJSON();
    return posted && typeof posted === "object" ? (posted as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function fulfillPhase4aApi(route: Route, actor: Phase4aActor, knownDraftIds: Set<string>): Promise<void> {
    const url = route.request().url();
    const method = route.request().method();
    const orgId = orgFromRequest(route);

    if (url.includes("/v1/genesis-referral/affiliate/access")) {
      await json(route, { ok: true, allowed: false, reason: "genesis_affiliate_access_denied" });
      return;
    }

    if (url.includes("/v1/workspace/bind-user-org") || url.includes("/bind-user-org")) {
      await json(route, { org_id: PHASE4A_ORG_A, ok: true });
      return;
    }

    if (url.includes("/v1/subscriptions/") && method === "GET") {
      const requestedOrg = decodeURIComponent(url.split("/v1/subscriptions/")[1]?.split("?")[0] || "");
      if (actor === "signed_out") {
        await json(route, { error: "unauthorized" }, 401);
        return;
      }
      if (actor === "free") {
        await json(route, { subscription: null }, 404);
        return;
      }
      if (requestedOrg && requestedOrg !== PHASE4A_ORG_A) {
        await json(route, { error: "forbidden" }, 403);
        return;
      }
      await json(route, {
        subscription: {
          org_id: PHASE4A_ORG_A,
          plan_code: "pro",
          status: "active",
        },
      });
      return;
    }

    if (url.includes("/api/agreements/usage/summary") && method === "GET") {
      if (actor === "signed_out") {
        await json(route, { error: "unauthorized" }, 401);
        return;
      }
      await json(route, actor === "free" ? freeUsageSummary() : paidUsageSummary());
      return;
    }

    if (url.includes("/api/agreements/access/policy")) {
      await json(route, {
        recipient_link_token_required: false,
        mint_key_configured: true,
        signing_token_configured: true,
        review_link_mint_enabled: true,
      });
      return;
    }

    if (url.includes("/api/agreements/workspace-index") && method === "GET") {
      if (orgId === PHASE4A_ORG_B) {
        await json(route, { agreements: [], skipped: [], error: null });
        return;
      }
      if (actor !== "paid") {
        await json(route, { agreements: [], skipped: [], error: null });
        return;
      }
      await json(route, {
        agreements: [
          indexRow(PHASE4A_IDS.draft, { accepted_review_snapshot: null }),
          indexRow(PHASE4A_IDS.pending, { review_sent_at: "2026-09-02T00:00:00.000Z" }),
          indexRow(PHASE4A_IDS.frozen),
          indexRow(PHASE4A_IDS.sent, { review_sent_at: "2026-09-03T00:00:00.000Z" }),
          indexRow(PHASE4A_IDS.partial, { has_server_signing_lock: true }),
          indexRow(PHASE4A_IDS.executed, { completed_signed: true }),
          indexRow(PHASE4A_IDS.example),
          indexRow(PHASE4A_IDS.batch5),
        ],
        skipped: [],
        error: null,
      });
      return;
    }

    if (url.includes("/api/agreements/parse") && method === "POST") {
      const agreementId = PHASE4A_IDS.batch5;
      knownDraftIds.add(agreementId);
      await json(route, { draft: draftRecord(agreementId) });
      return;
    }

    if (url.includes("/premium-full-draft") && method === "POST") {
      const posted = safePostJson(route);
      const agreementId = String(posted.agreement_id || posted.agreementId || PHASE4A_IDS.batch5);
      knownDraftIds.add(agreementId);
      await json(route, {
        document_text: PHASE4A_FROZEN_BODY,
        server_full_document_text: PHASE4A_FROZEN_BODY,
        premium_full_document_text: PHASE4A_FROZEN_BODY,
        authoritative_draft: PHASE4A_FROZEN_BODY,
        premium_render_source: "server_full_document_text",
        agreement_id: agreementId,
        validation: { ok: true },
        generation_outcome: "ok",
      });
      return;
    }

    if (url.includes("/canonical-review-snapshot")) {
      const posted = safePostJson(route);
      const agreementId = String(posted.agreement_id || posted.agreementId || PHASE4A_IDS.batch5);
      knownDraftIds.add(agreementId);
      await json(route, {
        snapshot_id: `crs-${agreementId}`,
        agreement_id: agreementId,
        corpus_plain: PHASE4A_FROZEN_BODY,
        corpus_sha256: PHASE4A_FROZEN_SHA,
        corpus_length: PHASE4A_FROZEN_BODY.length,
        status: "accepted",
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const posted = safePostJson(route);
      const agreementId = String(posted.id || posted.agreement_id || PHASE4A_IDS.batch5);
      knownDraftIds.add(agreementId);
      const draft = draftRecord(agreementId, {
        document_text: PHASE4A_FROZEN_BODY,
        title: String(posted.title || PHASE4A_TITLE),
      });
      await json(route, {
        id: agreementId,
        draft,
        economics: {
          tier: actor === "paid" ? "paid" : "free",
          watermark_required: actor !== "paid",
          free_draft_expired: false,
        },
      });
      return;
    }

    const usageReceiptMatch = url.match(/\/v1\/usage\/([^/?]+)\/receipt/);
    if (usageReceiptMatch && method === "GET") {
      const usageId = decodeURIComponent(usageReceiptMatch[1]);
      if (usageId !== PHASE4A_IDS.receipt) {
        await json(route, { error: "not_found" }, 404);
        return;
      }
      await json(route, {
        usage_receipt: {
          usage_id: PHASE4A_IDS.receipt,
          org_id: PHASE4A_ORG_A,
          agreement_id: PHASE4A_IDS.frozen,
          title: PHASE4A_TITLE,
        },
        receipt_hash_sha256: PHASE4A_FROZEN_SHA,
      });
      return;
    }

    if (url.includes("/document-layout/analysis/") || url.includes("/field-review")) {
      await json(route, {
        ok: true,
        analysis_id: PHASE4A_IDS.analysis,
        document_id_ref: null,
        page_count: 0,
        field_candidates_enriched: [],
        manual_fields: [],
      });
      return;
    }

    if (url.includes("/advanced-work-product") || url.includes("/awp")) {
      await json(route, { templates: [], documents: [], ok: true });
      return;
    }

    const agreementMatch = url.match(/\/api\/agreements\/([^/?]+)$/);
    if (agreementMatch && method === "GET" && !url.includes("/workspace-index") && !url.includes("/usage")) {
      const id = decodeURIComponent(agreementMatch[1]);
      if (id === PHASE4A_IDS.missing) {
        await json(route, { error: "not_found" }, 404);
        return;
      }
      if (id === PHASE4A_IDS.otherOrg || orgId === PHASE4A_ORG_B) {
        await json(route, { error: "forbidden" }, 403);
        return;
      }
      if (!knownDraftIds.has(id)) {
        await json(route, { error: "not_found" }, 404);
        return;
      }
      await json(route, { draft: draftRecord(id) });
      return;
    }

    if (url.includes("/health")) {
      await json(route, { ok: true });
      return;
    }

    await json(route, { ok: true });
}

export async function installPhase4aServerMocks(page: Page, actor: Phase4aActor = "paid"): Promise<void> {
  const knownDraftIds = new Set<string>(Object.values(PHASE4A_IDS));
  const handler = (route: Route) => fulfillPhase4aApi(route, actor, knownDraftIds);
  await page.route("**/api/**", handler);
  await page.route("**/v1/**", handler);
  await page.route("**/health", handler);
  await page.route("**/version", handler);
}

export async function seedPhase4aPaidOwner(page: Page): Promise<void> {
  await seedE2eAuthSession(page, authSeed("paid"));
  await page.addInitScript(
    ({ orgId, name }) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        localStorage.setItem("claw_user_display_name", name);
        sessionStorage.setItem("claw_authenticated_workspace_session", "1");
      } catch {
        /* ignore */
      }
    },
    { orgId: PHASE4A_ORG_A, name: PHASE4A_PAID_USER.name },
  );
  await installPhase4aServerMocks(page, "paid");
}

export async function seedPhase4aFreeUser(page: Page): Promise<void> {
  await seedE2eAuthSession(page, authSeed("free"));
  await page.addInitScript(
    ({ orgId, name }) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        localStorage.setItem("claw_user_display_name", name);
        sessionStorage.setItem("claw_authenticated_workspace_session", "1");
        localStorage.removeItem("claw_subscription_entitlement_v1");
        localStorage.removeItem("claw_dev_access_tier");
        localStorage.removeItem("lawdog_mock_monetization_plan");
      } catch {
        /* ignore */
      }
    },
    { orgId: PHASE4A_ORG_A, name: PHASE4A_FREE_USER.name },
  );
  await installPhase4aServerMocks(page, "free");
}

export async function seedPhase4aSignedOut(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("claw_subscription_entitlement_v1");
      localStorage.removeItem("claw_dev_access_tier");
      localStorage.removeItem("lawdog_mock_monetization_plan");
    } catch {
      /* ignore */
    }
  });
  await installPhase4aServerMocks(page, "signed_out");
}
