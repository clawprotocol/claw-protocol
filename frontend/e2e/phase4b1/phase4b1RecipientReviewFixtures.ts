/**
 * Phase 4B.1 recipient-review browser fixtures.
 * Token-authorized server state only — no owner JWT, no intake/local/filler paper.
 */
import { createHash } from "node:crypto";
import type { Page, Request, Route } from "@playwright/test";
import {
  PHASE4A_FROZEN_BODY,
  PHASE4A_FROZEN_SHA,
  PHASE4A_PARTY_0,
  PHASE4A_PARTY_1,
  PHASE4A_TITLE,
} from "../phase4a/phase4aPaidOwnerFixtures";
import {
  phase4b1LegacyReviewPath,
  phase4b1PrimaryReviewPath,
} from "../../src/launch/phase4b1RecipientReviewCoverage";

export const PHASE4B1_AGREEMENT_A = "ag-phase4b1-orion";
export const PHASE4B1_AGREEMENT_B = "ag-phase4b1-other";
export const PHASE4B1_PARTY_0 = "p-orion";
export const PHASE4B1_PARTY_1 = "p-contoso";
export const PHASE4B1_LOCKED_VERSION = "lv-phase4b1-orion-v1";
export const PHASE4B1_TITLE = PHASE4A_TITLE;
export const PHASE4B1_PARTY_0_NAME = PHASE4A_PARTY_0;
export const PHASE4B1_PARTY_1_NAME = PHASE4A_PARTY_1;
export const PHASE4B1_FROZEN_BODY = PHASE4A_FROZEN_BODY;
export const PHASE4B1_FROZEN_SHA = PHASE4A_FROZEN_SHA;
export const PHASE4B1_FROZEN_LENGTH = PHASE4A_FROZEN_BODY.length;

export const PHASE4B1_OTHER_BODY = [
  "OTHER-ORG SERVICES AGREEMENT",
  "CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK",
  PHASE4A_FROZEN_BODY,
].join("\n");
export const PHASE4B1_OTHER_SHA = createHash("sha256").update(PHASE4B1_OTHER_BODY, "utf8").digest("hex");

export const PHASE4B1_TOKENS = {
  reviewAParty0: "tok-phase4b1-review-a-party0-secret",
  reviewAParty1: "tok-phase4b1-review-a-party1-secret",
  reviewB: "tok-phase4b1-review-b-secret",
  expired: "tok-phase4b1-expired-secret",
  revoked: "tok-phase4b1-revoked-secret",
  signMode: "tok-phase4b1-sign-mode-secret",
  malformed: "not-a-valid-review-token",
  wrongParty: "tok-phase4b1-wrong-party-secret",
} as const;

export const PHASE4B1_PROPOSED_TERM = "The initial term is twenty-four months and renews unless terminated on thirty days' notice.";
export const PHASE4B1_ORIGINAL_TERM = "The initial term is twelve months and renews unless terminated on thirty days' notice.";

export const OWNER_ONLY_API = /workspace-index|\/v1\/subscriptions|usage\/summary|recipient-access-token/;

type TokenRecord = {
  agreementId: string;
  partyId: string;
  mode: "review" | "sign";
  status: "ok" | "expired" | "revoked" | "malformed" | "wrong_party";
};

const TOKEN_TABLE: Record<string, TokenRecord> = {
  [PHASE4B1_TOKENS.reviewAParty0]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_0,
    mode: "review",
    status: "ok",
  },
  [PHASE4B1_TOKENS.reviewAParty1]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_1,
    mode: "review",
    status: "ok",
  },
  [PHASE4B1_TOKENS.reviewB]: {
    agreementId: PHASE4B1_AGREEMENT_B,
    partyId: PHASE4B1_PARTY_1,
    mode: "review",
    status: "ok",
  },
  [PHASE4B1_TOKENS.expired]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_0,
    mode: "review",
    status: "expired",
  },
  [PHASE4B1_TOKENS.revoked]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_0,
    mode: "review",
    status: "revoked",
  },
  [PHASE4B1_TOKENS.signMode]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_0,
    mode: "sign",
    status: "ok",
  },
  [PHASE4B1_TOKENS.malformed]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: PHASE4B1_PARTY_0,
    mode: "review",
    status: "malformed",
  },
  [PHASE4B1_TOKENS.wrongParty]: {
    agreementId: PHASE4B1_AGREEMENT_A,
    partyId: "p-stranger",
    mode: "review",
    status: "wrong_party",
  },
};

export type Phase4b1FixtureState = {
  approveCount: Map<string, number>;
  approvedParties: Set<string>;
  proposals: Array<{ agreementId: string; partyId: string; proposedText: string; proposalId: string }>;
  failNextValidate: boolean;
  failGets: boolean;
  ownerOnlyHits: string[];
  recipientReads: Array<{ url: string; token: string; hasAuth: boolean }>;
};

export function createPhase4b1FixtureState(): Phase4b1FixtureState {
  return {
    approveCount: new Map(),
    approvedParties: new Set(),
    proposals: [],
    failNextValidate: false,
    failGets: false,
    ownerOnlyHits: [],
    recipientReads: [],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function deny(route: Route, code: string, message: string, status = 403) {
  return json(route, { detail: { code, message } }, status);
}

function tokenFromRequest(req: Request): string {
  return (req.headers()["x-claw-recipient-access-token"] || "").trim();
}

function hasOwnerJwt(req: Request): boolean {
  return Boolean((req.headers().authorization || "").trim());
}

function draftRecord(agreementId: string, state: Phase4b1FixtureState) {
  const isA = agreementId === PHASE4B1_AGREEMENT_A;
  const body = isA ? PHASE4B1_FROZEN_BODY : PHASE4B1_OTHER_BODY;
  const sha = isA ? PHASE4B1_FROZEN_SHA : PHASE4B1_OTHER_SHA;
  const title = isA ? PHASE4B1_TITLE : "Other Org Services Agreement";
  const party0 = isA ? PHASE4B1_PARTY_0 : "p-other-0";
  const party1 = isA ? PHASE4B1_PARTY_1 : "p-other-1";
  const audit_log: Array<{ event_type: string; at: string; value?: Record<string, unknown> }> = [];
  for (const partyId of [party0, party1]) {
    if (state.approvedParties.has(`${agreementId}:${partyId}`)) {
      audit_log.push({
        event_type: "recipient_approved",
        at: "2026-09-10T12:00:00.000Z",
        value: { participant_id: partyId },
      });
    }
  }
  for (const proposal of state.proposals.filter((row) => row.agreementId === agreementId)) {
    audit_log.push({
      event_type: "recipient_proposal_pending",
      at: "2026-09-10T12:05:00.000Z",
      value: {
        proposal_id: proposal.proposalId,
        instruction: "Propose a term change",
        proposer_id: proposal.partyId,
        draft: { server_full_document_text: proposal.proposedText },
      },
    });
  }
  return {
    draft: {
      id: agreementId,
      title,
      jurisdiction: "New York",
      parties: [
        { id: party0, name: PHASE4B1_PARTY_0_NAME, role: "owner" },
        { id: party1, name: PHASE4B1_PARTY_1_NAME, role: "party" },
      ],
      purpose: body,
      payment_terms: "Annual subscription",
      duration: "12 months",
      due_date: null,
      effective_date: "2026-09-01",
      server_full_document_text: body,
      premium_full_document_text: body,
      premium_render_source: "server_full_document_text",
      versions: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z", note: "accepted" }],
      audit_log,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-10T12:00:00.000Z",
    },
    accepted_review_snapshot: {
      agreement_id: agreementId,
      locked_version_id: isA ? PHASE4B1_LOCKED_VERSION : "lv-phase4b1-other-v1",
      corpus_sha256: sha,
      corpus_length: body.length,
      corpus_plain: body,
      status: "accepted",
    },
  };
}

function authorizeRead(req: Request, agreementId: string): TokenRecord | { error: { status: number; code: string; message: string } } {
  const token = tokenFromRequest(req);
  const rec = TOKEN_TABLE[token];
  if (!rec || rec.status !== "ok" || rec.mode !== "review") {
    return { error: { status: 403, code: "access_denied", message: "This link is invalid or expired. Request a new link from the sender." } };
  }
  if (rec.agreementId !== agreementId) {
    return { error: { status: 403, code: "wrong_agreement", message: "This link is invalid or expired. Request a new link from the sender." } };
  }
  return rec;
}

export async function fulfillPhase4b1Api(route: Route, state: Phase4b1FixtureState): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();

  if (OWNER_ONLY_API.test(url)) {
    state.ownerOnlyHits.push(`${method} ${url}`);
    await json(route, { detail: { code: "owner_auth_required", message: "Sign in required." } }, 401);
    return;
  }

  if (url.includes("/health") || url.includes("/version")) {
    await json(route, { ok: true });
    return;
  }

  if (url.includes("/api/agreements/access/policy") && method === "GET") {
    await json(route, {
      recipient_link_token_required: true,
      mint_key_configured: true,
      signing_token_configured: true,
      review_link_mint_enabled: true,
    });
    return;
  }

  if (url.includes("/api/agreements/access/validate")) {
    if (state.failNextValidate) {
      state.failNextValidate = false;
      await json(route, { detail: "upstream_unavailable" }, 503);
      return;
    }
    const parsed = new URL(url);
    const token = (parsed.searchParams.get("token") || "").trim();
    const agreementId = (parsed.searchParams.get("agreement_id") || "").trim();
    const rec = TOKEN_TABLE[token];
    if (!rec || rec.status === "malformed") {
      await deny(route, "malformed_token", "This link is invalid or expired. Request a new link from the sender.", 400);
      return;
    }
    if (rec.status === "expired") {
      await deny(route, "token_expired", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (rec.status === "revoked") {
      await deny(route, "token_revoked", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (rec.status === "wrong_party") {
      await deny(route, "party_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (agreementId && rec.agreementId !== agreementId) {
      await deny(route, "wrong_agreement", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    await json(route, {
      ok: true,
      agreement_id: rec.agreementId,
      mode: rec.mode,
      locked_version_id: rec.agreementId === PHASE4B1_AGREEMENT_A ? PHASE4B1_LOCKED_VERSION : "lv-phase4b1-other-v1",
      role: rec.mode === "sign" ? "signer" : "reviewer",
      recipient_party_id: rec.partyId,
      inviter_display_name: PHASE4B1_PARTY_0_NAME,
    });
    return;
  }

  const renderMatch = url.match(/\/api\/agreements\/([^/]+)\/render/);
  if (renderMatch && method === "POST") {
    const agreementId = decodeURIComponent(renderMatch[1]);
    const auth = authorizeRead(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const payload = draftRecord(agreementId, state);
    await json(route, {
      rendered_html: `<article><pre>${String(payload.draft.server_full_document_text)}</pre></article>`,
    });
    return;
  }

  const approveMatch = url.match(/\/api\/agreements\/([^/]+)\/recipient-approve/);
  if (approveMatch && method === "POST") {
    const agreementId = decodeURIComponent(approveMatch[1]);
    const auth = authorizeRead(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const key = `${agreementId}:${auth.partyId}`;
    state.approveCount.set(key, (state.approveCount.get(key) || 0) + 1);
    state.approvedParties.add(key);
    await json(route, { ok: true, draft: draftRecord(agreementId, state).draft });
    return;
  }

  const stageMatch = url.match(/\/api\/agreements\/([^/]+)\/recipient-proposal\/stage/);
  if (stageMatch && method === "POST") {
    const agreementId = decodeURIComponent(stageMatch[1]);
    const auth = authorizeRead(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const proposalId = `prop-phase4b1-${state.proposals.length + 1}`;
    const body =
      (req.postDataJSON() as {
        draft?: { purpose?: string; server_full_document_text?: string };
        instruction?: string;
      } | null) || {};
    const proposedText = String(
      body.draft?.server_full_document_text || body.draft?.purpose || body.instruction || "",
    );
    state.proposals.push({ agreementId, partyId: auth.partyId, proposedText, proposalId });
    await json(route, { proposal_id: proposalId, staged: true });
    return;
  }

  const finalizeMatch = url.match(/\/api\/agreements\/([^/]+)\/recipient-proposal(?:\?|$)/);
  if (finalizeMatch && method === "POST" && !url.includes("/apply") && !url.includes("/reject") && !url.includes("/stage")) {
    const agreementId = decodeURIComponent(finalizeMatch[1]);
    const auth = authorizeRead(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const body = (req.postDataJSON() as { proposal_id?: string } | null) || {};
    await json(route, { ok: true, proposal_id: body.proposal_id || "prop-phase4b1-1" });
    return;
  }

  const getMatch = url.match(/\/api\/agreements\/([^/?]+)$/);
  if (getMatch && method === "GET" && !url.includes("/access/")) {
    if (state.failGets) {
      await json(route, { detail: { code: "network_retryable", message: "We couldn't load this agreement. Please try again." } }, 503);
      return;
    }
    const agreementId = decodeURIComponent(getMatch[1]);
    const auth = authorizeRead(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    await json(route, draftRecord(agreementId, state));
    return;
  }

  await json(route, { ok: true });
}

export async function installPhase4b1RecipientMocks(page: Page, state: Phase4b1FixtureState): Promise<void> {
  const handler = (route: Route) => fulfillPhase4b1Api(route, state);
  await page.route("**/api/**", handler);
  await page.route("**/v1/**", handler);
  await page.route("**/health", handler);
  await page.route("**/version", handler);
}

export async function seedPhase4b1UnsignedRecipient(page: Page, state: Phase4b1FixtureState): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("claw_subscription_entitlement_v1");
      localStorage.removeItem("claw_dev_access_tier");
      localStorage.removeItem("lawdog_mock_monetization_plan");
      localStorage.removeItem("claw_e2e_auth_session_v1");
      sessionStorage.removeItem("claw_e2e_auth_session_v1");
      sessionStorage.removeItem("claw_authenticated_workspace_session");
    } catch {
      /* ignore */
    }
  });
  await installPhase4b1RecipientMocks(page, state);
}

export function primaryReviewHref(token: string, extras = `&role=reviewer&p=${PHASE4B1_PARTY_0}`): string {
  return `${phase4b1PrimaryReviewPath(PHASE4B1_AGREEMENT_A, token)}${extras}`;
}

export function legacyReviewHref(token: string, extras = `&role=reviewer&p=${PHASE4B1_PARTY_0}`): string {
  return `${phase4b1LegacyReviewPath(PHASE4B1_AGREEMENT_A, token)}${extras}`;
}

export function proposedFrozenBody(): string {
  return PHASE4B1_FROZEN_BODY.replace(PHASE4B1_ORIGINAL_TERM, PHASE4B1_PROPOSED_TERM);
}
