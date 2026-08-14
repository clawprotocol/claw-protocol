/**
 * RC Paid Pro E2E mocks — substantive professional corpus from shared fixture system.
 */
import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  SHARED_ACCEPTED_PAID_BODY,
  SHARED_TWO_PARTY_INTAKE,
} from "../../src/components/agreements/paidProSharedFixtureSystem";
import {
  buildRcQuadPartyPaidBody,
  RC_QUAD_PARTY_INTAKE,
  RC_QUAD_PENDING_DRAFT,
} from "../fixtures/rcQuadPartyProfessional";
import { seedE2eAuthSession } from "./rcE2eAuthBridge";

/** Production-faithful corpus digest for canonical-review-snapshot mock contract. */
function rcSha256Hex(corpusPlain: string): string {
  return createHash("sha256").update((corpusPlain || "").trim(), "utf8").digest("hex");
}

export const RC_PAID_ECONOMICS = {
  tier: "paid",
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

export const RC_ENTITLED_USAGE = {
  tier: "paid",
  state: "pro",
  grant_source: "stripe",
  agreements_used: 0,
  agreements_limit: 100,
  agreements_created: 0,
  agreements_completed: 0,
  drafts_active: 0,
  agreements_remaining: 100,
  drafts_remaining: 100,
  agreement_allowance: 100,
  period_ends_at: "2026-09-01T00:00:00.000Z",
  can_create_persisted_agreement: true,
  can_save_guest_draft: false,
  watermark_required: false,
  storage_persistent: true,
  paywall_required: false,
  soft_throttle: false,
  commercial: {
    state: "pro",
    entitlement: "paid_pro",
    grant_source: "stripe",
    agreement_allowance: 100,
    agreements_used: 0,
    agreements_remaining: 100,
    period_ends_at: "2026-09-01T00:00:00.000Z",
    can_create_persisted_agreement: true,
    can_save_guest_draft: false,
    create_allowed: true,
    upgrade_required: false,
    reason: null,
  },
};

export type RcDraftRecord = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

const RC_PAID_USER_ORG = "user-e2e-user-rc-authority";
const RC_ANON_ORG = "anon-rc-paid-pro-org";

/** In-process mock store for canonical review snapshots (POST→GET→accept). */
const rcCanonicalSnapshotStore = new Map<
  string,
  {
    snapshot_id: string;
    agreement_id: string;
    corpus_plain: string;
    corpus_sha256: string;
    corpus_length: number;
    status: string;
    schema_version?: string;
    created_at?: string;
    accepted_at?: string;
    generation_session_id?: string | null;
  }
>();

/** Frozen signer authority must survive its production POST → GET boundary in browser proofs. */
const rcFrozenSigningAuthorityStore = new Map<string, unknown>();

export async function seedEntitledPaidProBrowserState(page: Page): Promise<void> {
  await seedE2eAuthSession(page);
  await page.addInitScript((orgId: string) => {
    try {
      const generationId = "rc-e2e-entitled";
      const entitlementMarker = JSON.stringify({
        v: 1,
        generationId,
        markedAt: Date.now(),
      });
      localStorage.setItem("claw_org_id", orgId);
      localStorage.setItem("claw_subscription_entitlement_v1", "paid");
      localStorage.setItem(
        "claw_workspace_usage_tier_v1",
        JSON.stringify({ orgId, tier: "paid", fetchedAt: Date.now() }),
      );
      sessionStorage.setItem("claw_authenticated_workspace_session", "1");
      sessionStorage.setItem("claw_active_agreement_generation_id_v1", generationId);
      sessionStorage.setItem("claw_pro_entitlement_session_v1", entitlementMarker);
      sessionStorage.setItem("claw_pro_intent_session_v1", entitlementMarker);
      sessionStorage.setItem("claw_paid_dashboard_create_context_v1", "dashboard_paid_create");
    } catch {
      /* ignore */
    }
  }, RC_PAID_USER_ORG);
}

const RC_TWO_PARTY_PENDING_DRAFT = {
  title: "Professional Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  purpose: "Professional technology and consulting services.",
  payment_terms: "$96,000 milestone installments",
  duration: "12 months",
  due_date: null,
  effective_date: "2026-01-01",
  agreement_family: "services_agreement",
};

/** Clear RC journey session keys without touching unrelated browser state. */
export async function resetRcPaidBrowserState(page: Page): Promise<void> {
  await clearRcApiMocks(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      const sessionKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith("claw_") || key.startsWith("lawdog_"))) sessionKeys.push(key);
      }
      for (const key of sessionKeys) sessionStorage.removeItem(key);
      sessionStorage.removeItem("claw_rc_e2e_mock_parties_v1");
      sessionStorage.removeItem("claw_rc_e2e_parse_parties_v1");
      sessionStorage.removeItem("claw_rc_checkout_return_seeded_v1");
      localStorage.removeItem("claw_premium_completed");
      localStorage.removeItem("claw_paid_dashboard_create_context_v1");
    } catch {
      /* ignore */
    }
  });
}

/**
 * Seed browser as if checkout completed.
 * Once-only via sessionStorage (survives reload). A window flag does NOT — reload would
 * wipe claw_premium_completion_snapshot_v1 and re-trigger grant+resume generation.
 */
export async function seedRcPaidCheckoutReturn(
  page: Page,
  intake = SHARED_TWO_PARTY_INTAKE,
  draftId = "ag_rc_paid_two_party",
  pendingDraft = RC_TWO_PARTY_PENDING_DRAFT,
): Promise<void> {
  await seedE2eAuthSession(page);
  await page.addInitScript(
    ({ orgId, intakeText, pending, agreementId }) => {
      try {
        if (sessionStorage.getItem("claw_rc_checkout_return_seeded_v1") === "1") return;
        sessionStorage.setItem("claw_rc_checkout_return_seeded_v1", "1");
        localStorage.setItem("claw_org_id", orgId);
        localStorage.removeItem("claw_premium_completed");
        sessionStorage.removeItem("claw_premium_completion_snapshot_v1");
        sessionStorage.removeItem("claw_paid_premium_completion_session_v1");
        sessionStorage.removeItem("claw_paid_dashboard_create_context_v1");
        sessionStorage.setItem("claw_advanced_full_draft_checkout_ok_v1", String(Date.now()));
        // Production create-review resume key — required for prepare/GET display authority.
        sessionStorage.setItem("claw_agreement_create_review_resume_v1", agreementId);
        sessionStorage.setItem(
          "claw_create_complexity_resume_v1",
          JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            rawIntake: intakeText,
            pending,
            awaitingProCheckout: true,
            resume_kind: "optional_full_upgrade",
            originalUserIntakeRaw: intakeText,
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { orgId: RC_PAID_USER_ORG, intakeText: intake, pending: pendingDraft, agreementId: draftId },
  );
}

export async function clearRcApiMocks(page: Page): Promise<void> {
  rcCanonicalSnapshotStore.clear();
  rcFrozenSigningAuthorityStore.clear();
  const ctx = page.context();
  const patterns: Array<string | RegExp> = [
    /\/(api\/|v1\/|health)/,
    /\/(api\/|v1\/workspace\/)/,
    "**/v1/workspace/finalize-auth**",
    "**/v1/workspace/bind-user-org**",
    "**/v1/workspace/auth-continuation**",
    "**/v1/billing/verify-checkout-session**",
    "**/v1/subscriptions/**",
    "**/api/agreements/premium-full-draft**",
    /\/api\/agreements\/[^/?]+/,
    "**/api/agreements/**/frozen-signing-authority**",
    "**/api/agreements/**/signing-packet/**",
    "**/api/agreements/**/signing-links-sent**",
    "**/api/agreements/**/vs01-signer-complete**",
    "**/api/agreements/**/vs01-ensure-signed-snapshot**",
    "**/api/agreements/public/**",
    "**/v1/documents/*/content**",
  ];
  for (const pattern of patterns) {
    await page.unroute(pattern).catch(() => undefined);
    await ctx.unroute(pattern).catch(() => undefined);
  }
}

export async function installRcPaidProApiRoutes(
  page: Page,
  drafts: Map<string, RcDraftRecord>,
  opts?: {
    draftId?: string;
    partyCount?: 2 | 3 | 4;
    /** Override premium-full-draft body (e.g. quad corpus on stable two-party checkout handoff). */
    premiumBody?: string;
    /** When false, parse mock stays two-party while premium body may still be quad. */
    parsePartyCount?: 2 | 3 | 4;
    /** Fail POST /premium-full-draft inside the catch-all mock (overrides success body). */
    premiumFullDraftFailure?: {
      status: number;
      detail: unknown;
      /** When set, fail this many times then succeed. */
      failRemaining?: { current: number };
    };
  },
) {
  const draftId = opts?.draftId ?? "ag_rc_paid_pro";
  const partyCount = opts?.partyCount ?? 2;
  const parsePartyCount = opts?.parsePartyCount ?? partyCount;
  const paidBody = opts?.premiumBody ?? (partyCount >= 4 ? buildRcQuadPartyPaidBody() : SHARED_ACCEPTED_PAID_BODY);
  const mockPartyNames =
    parsePartyCount >= 4
      ? [
          "Redwood Biologics, Inc.",
          "Summit AI Consulting LLC",
          "Blue Harbor Systems LLC",
          "Iron Gate Security LLC",
        ]
      : parsePartyCount === 3
        ? ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC", "Blue Canyon Analytics LLC"]
        : ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"];

  await clearRcApiMocks(page);
  // Seed party names outside the route handler — page.evaluate during fulfill can race the network.
  await page.addInitScript((partyNames) => {
    try {
      sessionStorage.setItem("claw_rc_e2e_mock_parties_v1", JSON.stringify(partyNames));
    } catch {
      /* ignore */
    }
  }, mockPartyNames);

  return page.route(/\/(api\/|v1\/|health)/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/health") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: true,
          signing_token_configured: true,
          review_link_mint_enabled: true,
          signing_token_env_var_detected: "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET",
        }),
      });
      return;
    }

    if (url.includes("/frozen-signing-authority")) {
      const agreementMatch = url.match(/\/api\/agreements\/([^/?]+)\/frozen-signing-authority/);
      const agreementId = agreementMatch?.[1] ? decodeURIComponent(agreementMatch[1]) : draftId;
      if (method === "POST") {
        const body = (route.request().postDataJSON() ?? {}) as { snapshot?: unknown };
        rcFrozenSigningAuthorityStore.set(agreementId, body.snapshot ?? null);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, snapshot: body.snapshot ?? null }),
        });
        return;
      }
      const snapshot = rcFrozenSigningAuthorityStore.get(agreementId);
      await route.fulfill({
        status: snapshot ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(snapshot ? { snapshot } : { detail: "not_found" }),
      });
      return;
    }

    if (url.includes("/v1/workspace/bind-user-org") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          org_id: RC_PAID_USER_ORG,
          user_id: "e2e-user-rc-authority",
          migrated_agreement_count: 0,
          migrated_agreement_ids: [],
        }),
      });
      return;
    }

    // Server-authoritative canonical review snapshot (commercial first-seal authority).
    // Module store so POST → GET → accept mirrors production lifecycle (mocked).
    if (url.includes("/canonical-review-snapshot/migrate-legacy") && method === "POST") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail: { code: "legacy_migration_not_applicable_already_accepted" },
        }),
      });
      return;
    }

    if (url.includes("/canonical-review-snapshot/accept") && method === "POST") {
      let body: {
        snapshot_id?: string;
        expected_digest?: string;
        display_snapshot_id?: string;
        display_digest?: string;
        display_length?: number;
        corpus_plain?: string;
      } = {};
      try {
        body = route.request().postDataJSON() as typeof body;
      } catch {
        /* ignore */
      }
      if (body.corpus_plain !== undefined) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ detail: { code: "accept_must_not_include_corpus" } }),
        });
        return;
      }
      const stored = rcCanonicalSnapshotStore.get(draftId);
      const snapshotId = String(body.snapshot_id || stored?.snapshot_id || "crs_rc_e2e").trim();
      const digest = String(body.expected_digest || stored?.corpus_sha256 || "").trim().toLowerCase();
      if (
        body.display_snapshot_id &&
        String(body.display_snapshot_id).trim() !== snapshotId
      ) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ detail: { code: "display_authority_mismatch" } }),
        });
        return;
      }
      if (
        body.display_digest &&
        String(body.display_digest).trim().toLowerCase() !== digest
      ) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ detail: { code: "display_authority_mismatch" } }),
        });
        return;
      }
      const accepted = {
        snapshot_id: snapshotId,
        agreement_id: draftId,
        corpus_plain: stored?.corpus_plain || "",
        corpus_sha256: digest || "e".repeat(64),
        corpus_length: stored?.corpus_length ?? (stored?.corpus_plain || "").length,
        status: "accepted",
        schema_version: "claw.canonical_review_snapshot/v1",
        accepted_at: new Date().toISOString(),
        created_at: stored?.created_at,
        generation_session_id: stored?.generation_session_id ?? null,
      };
      rcCanonicalSnapshotStore.set(draftId, { ...accepted, status: "accepted" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          accepted,
          registry_version: 2,
        }),
      });
      return;
    }

    if (url.includes("/canonical-review-snapshot") && method === "POST") {
      let body: {
        corpus_plain?: string;
        claimed_digest?: string;
        generation_session_id?: string;
      } = {};
      try {
        body = route.request().postDataJSON() as typeof body;
      } catch {
        /* ignore */
      }
      const corpus = String(body.corpus_plain || "").trim();
      // Server authority: digest is computed from corpus bytes (not client-claimed alone).
      const digest = rcSha256Hex(corpus);
      const claimed = String(body.claimed_digest || "").trim().toLowerCase();
      if (claimed && claimed !== digest) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ detail: { code: "claimed_digest_mismatch" } }),
        });
        return;
      }
      const snapshot = {
        snapshot_id: `crs_rc_${draftId}`,
        agreement_id: draftId,
        corpus_plain: corpus,
        corpus_sha256: digest,
        corpus_length: corpus.length,
        generation_session_id: body.generation_session_id ?? null,
        created_at: new Date().toISOString(),
        schema_version: "claw.canonical_review_snapshot/v1",
        status: "pending",
      };
      rcCanonicalSnapshotStore.set(draftId, snapshot);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          snapshot,
          registry_version: 1,
          accepted: null,
        }),
      });
      return;
    }

    if (url.includes("/canonical-review-snapshot") && method === "GET") {
      const stored = rcCanonicalSnapshotStore.get(draftId);
      if (!stored) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "canonical_review_snapshot_not_found" }),
        });
        return;
      }
      // Production contract: GET returns the exact persisted corpus bytes + digest + length.
      const corpusPlain = String(stored.corpus_plain || "").trim();
      const corpusLength = corpusPlain.length;
      const corpusSha = rcSha256Hex(corpusPlain);
      if (!corpusPlain || Number(stored.corpus_length) !== corpusLength) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: { code: "canonical_review_snapshot_corrupt" } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: stored.status === "accepted" ? "accepted" : "pending",
          snapshot: {
            snapshot_id: stored.snapshot_id,
            agreement_id: stored.agreement_id || draftId,
            corpus_plain: corpusPlain,
            corpus_sha256: corpusSha,
            corpus_length: corpusLength,
            generation_session_id: stored.generation_session_id ?? null,
            created_at: stored.created_at ?? new Date().toISOString(),
            accepted_at: stored.accepted_at ?? null,
            schema_version: stored.schema_version || "claw.canonical_review_snapshot/v1",
            status: stored.status,
          },
          registry_version: stored.status === "accepted" ? 2 : 1,
          public:
            stored.status === "accepted"
              ? {
                  snapshot_id: stored.snapshot_id,
                  corpus_sha256: corpusSha,
                  corpus_length: corpusLength,
                  status: "accepted",
                }
              : null,
        }),
      });
      return;
    }

    if (url.includes("/recipient-access-token") && method === "POST") {
      let partyKey = "party";
      try {
        const body = route.request().postDataJSON() as { recipient_party_id?: string };
        partyKey = String(body?.recipient_party_id ?? "").trim() || "party";
      } catch {
        /* ignore */
      }
      // Fingerprint uses token.slice(0, 12) — uniqueness must appear in the prefix.
      const prefix = `t${Math.random().toString(36).slice(2, 10)}${partyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4)}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: `${prefix}${Date.now().toString(36)}`.slice(0, 64),
          expires_in_seconds: 86400,
          locked_version_id: "v1",
          review_url: "https://example.test/agreements/rc-e2e/review",
        }),
      });
      return;
    }

    if (url.includes("/recipient-links/mint") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              partyId: "p-1",
              displayName: "Harbor Peak Automation LLC",
              email: "michael.torres@example.com",
              reviewHref: "https://example.test/review/rc-e2e/1",
            },
          ],
        }),
      });
      return;
    }

    if (url.includes("/v1/workspace/anonymous-session") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          org_id: RC_ANON_ORG,
          session_id: "rc-e2e-session",
          token: "rc-e2e-token",
          expires_in_seconds: 86400,
        }),
      });
      return;
    }

    if (url.includes("/v1/subscriptions/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          subscription: {
            id: "sub_rc_paid_pro",
            org_id: RC_PAID_USER_ORG,
            plan_code: "pro",
            status: "active",
          },
        }),
      });
      return;
    }

    if (url.includes("/v1/genesis-referral/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, allowed: false, reason: "genesis_affiliate_access_denied" }),
      });
      return;
    }

    if (url.includes("/api/agreements/usage") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RC_ENTITLED_USAGE),
      });
      return;
    }

    if (!url.includes("/api/agreements/") && !url.includes("premium-full-draft")) {
      await route.continue();
      return;
    }

    if (url.includes("/api/agreements/premium-missing-facts") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ questions: [] }),
      });
      return;
    }

    if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
      const fail = opts?.premiumFullDraftFailure;
      if (fail) {
        const remaining = fail.failRemaining;
        const shouldFail = !remaining || remaining.current > 0;
        if (remaining && remaining.current > 0) remaining.current -= 1;
        if (shouldFail) {
          await route.fulfill({
            status: fail.status,
            contentType: "application/json",
            body: JSON.stringify({ detail: fail.detail }),
          });
          return;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title:
            parsePartyCount >= 4
              ? "Multi-Party Professional Services Agreement"
              : "Professional Services Agreement",
          agreement_family: "services_agreement",
          generation_outcome: "ok",
          generation_ok: true,
          document_text: paidBody,
          server_full_document_text: paidBody,
          premium_full_document_text: paidBody,
          authoritative_draft: paidBody,
          premium_render_source: "server_full_document_text",
          key_terms_found: ["Parties", "Fees", "Delaware", "Confidentiality"],
          missing_material_info: [],
          model: "rc-e2e-mock",
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/parse")) {
      const parties =
        parsePartyCount >= 4
          ? [
              { name: "Redwood Biologics, Inc.", role: "Client" },
              { name: "Summit AI Consulting LLC", role: "Lead Provider" },
              { name: "Blue Harbor Systems LLC", role: "Implementation Partner" },
              { name: "Iron Gate Security LLC", role: "Cybersecurity Auditor" },
            ]
          : parsePartyCount === 3
            ? [
                { name: "Red Mesa Logistics LLC", role: "Client" },
                { name: "Harbor Peak Automation LLC", role: "Service Provider" },
                { name: "Blue Canyon Analytics LLC", role: "Technology Partner" },
              ]
            : [
                { name: "Red Mesa Logistics LLC", role: "Client" },
                { name: "Harbor Peak Automation LLC", role: "Service Provider" },
              ];
      await page.evaluate((partyNames) => {
        try {
          sessionStorage.setItem("claw_rc_e2e_parse_parties_v1", JSON.stringify(partyNames));
        } catch {
          /* ignore */
        }
      }, parties.map((p) => p.name));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "Professional Services Agreement",
            jurisdiction: "Delaware",
            parties,
            purpose: "Professional technology and consulting services.",
            payment_terms: "$96,000 milestone installments",
            duration: "12 months",
            due_date: null,
            effective_date: "2026-01-01",
            agreement_family: "services_agreement",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const now = new Date().toISOString();
      const rec: RcDraftRecord = {
        id: draftId,
        title: String(body.title || "Professional Services Agreement"),
        jurisdiction: String(body.jurisdiction || "Delaware"),
        parties: (Array.isArray(body.parties) ? body.parties : []) as RcDraftRecord["parties"],
        purpose: String(body.purpose || ""),
        payment_terms: String(body.payment_terms || ""),
        duration: body.duration == null ? null : String(body.duration),
        due_date: body.due_date == null ? null : String(body.due_date),
        effective_date: body.effective_date == null ? null : String(body.effective_date),
        versions: [{ version: 1, created_at: now, note: "created" }],
        audit_log: [],
        created_at: now,
        updated_at: now,
      };
      drafts.set(draftId, rec);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: draftId, draft: rec, economics: RC_PAID_ECONOMICS }),
      });
      return;
    }

    if (url.includes("/render")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: `<p>${paidBody.slice(0, 500)}</p>` }),
      });
      return;
    }

    if (url.includes("/vs01-signing-seed") && method === "POST") {
      const seedMatch = url.match(/\/api\/agreements\/([^/?]+)/);
      const seedAgreementId = seedMatch?.[1] ? decodeURIComponent(seedMatch[1]) : draftId;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          document_id: `doc_${seedAgreementId}`,
          content_sha256: "rc_e2e_seed_hash_v1",
        }),
      });
      return;
    }

    if (url.includes("/v1/documents/") && url.includes("/content") && method === "GET") {
      const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
      await route.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
      return;
    }

    if (method !== "GET") {
      const allowServiceBoundaryFallback =
        url.includes("/signing-links-sent") ||
        url.includes("/signing-packet/") ||
        url.includes("/vs01-signer-complete") ||
        url.includes("/vs01-ensure-signed-snapshot") ||
        url.includes("/agreements/public/");
      if (allowServiceBoundaryFallback) {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const segment = m?.[1] ? decodeURIComponent(m[1]) : "";
    const rec = drafts.get(segment);
    await route.fulfill({
      status: rec ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(rec ? { draft: rec, economics: RC_PAID_ECONOMICS } : { detail: "not_found" }),
    });
  });
}

export async function waitForAuthoritativeProReview(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/app\/ops\//, { timeout: 5_000 });
  await expect(page.getByText("We couldn't safely finalize the Pro version.")).toHaveCount(0);
  await expect(page.getByText(/Retry Pro draft/i)).toHaveCount(0);
  const reviewHeading = page
    .locator("#premium-pro-review-scroll-anchor")
    .or(page.getByRole("heading", { name: /Review your Pro agreement/i }).first());
  await expect(reviewHeading).toBeVisible({ timeout: 180_000 });
  const waitTitle = page.getByRole("heading", {
    name: /Preparing final agreement|Preparing signature-ready version|Generating your final Pro agreement/i,
  });
  await expect(waitTitle.first()).toBeHidden({ timeout: 120_000 }).catch(() => undefined);
  await expect
    .poll(async () => {
      const overlayLen = await page.evaluate(() => {
        const text = document.body?.textContent ?? "";
        const auth = text.match(/authoritativeLen:\s*(\d+)/i);
        if (auth) return Number.parseInt(auth[1] ?? "0", 10) || 0;
        const working = text.match(/workingCorpusLen:\s*(\d+)/i);
        return Number.parseInt(working?.[1] ?? "0", 10) || 0;
      });
      const snap = await page.evaluate(() => {
        try {
          const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
          if (!raw) return { len: 0, hash: "" };
          const parsed = JSON.parse(raw) as {
            paidProSourceOfTruthText?: string;
            paidProSourceOfTruthHash?: string;
            premiumWinningBodyText?: string;
            premiumReadonlyPlainText?: string;
          };
          const text =
            parsed.paidProSourceOfTruthText ||
            parsed.premiumWinningBodyText ||
            parsed.premiumReadonlyPlainText ||
            "";
          return {
            len: text.length,
            hash: (parsed.paidProSourceOfTruthHash || "").trim(),
          };
        } catch {
          return { len: 0, hash: "" };
        }
      });
      // Authoritative when SoT hash is present or corpus length clears the substantive bar.
      if (snap.hash && snap.len > 8_000) return snap.len;
      return Math.max(overlayLen, snap.len);
    }, { timeout: 180_000 })
    .toBeGreaterThan(8_000);
}

export { SHARED_ACCEPTED_PAID_BODY as RC_SUBSTANTIVE_PAID_BODY };
