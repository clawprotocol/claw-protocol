/**
 * Phase 4B.2 recipient-signing browser fixtures.
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
import { phase4b2SigningPath } from "../../src/launch/phase4b2RecipientSigningCoverage";

export const PHASE4B2_AGREEMENT_A = "ag-phase4b2-orion";
export const PHASE4B2_AGREEMENT_B = "ag-phase4b2-other";
export const PHASE4B2_PARTY_0 = "p-orion";
export const PHASE4B2_PARTY_1 = "p-contoso";
export const PHASE4B2_LOCKED_VERSION = "lv-phase4b2-orion-v1";
export const PHASE4B2_WRONG_VERSION = "lv-phase4b2-wrong";
export const PHASE4B2_SIGNER_ROLE_0 = "role-orion";
export const PHASE4B2_SIGNER_ROLE_1 = "role-contoso";
export const PHASE4B2_TITLE = PHASE4A_TITLE;
export const PHASE4B2_PARTY_0_NAME = PHASE4A_PARTY_0;
export const PHASE4B2_PARTY_1_NAME = PHASE4A_PARTY_1;
export const PHASE4B2_SIGNER_0_NAME = "Dana Orion";
export const PHASE4B2_SIGNER_0_TITLE = "Chief Executive Officer";
export const PHASE4B2_SIGNER_1_NAME = "Casey Contoso";
export const PHASE4B2_SIGNER_1_TITLE = "General Counsel";
export const PHASE4B2_FROZEN_BODY = PHASE4A_FROZEN_BODY;
export const PHASE4B2_FROZEN_SHA = PHASE4A_FROZEN_SHA;
export const PHASE4B2_FROZEN_LENGTH = PHASE4A_FROZEN_BODY.length;

export const PHASE4B2_OTHER_BODY = [
  "OTHER-ORG SERVICES AGREEMENT",
  "CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK",
  PHASE4A_FROZEN_BODY,
].join("\n");
export const PHASE4B2_OTHER_SHA = createHash("sha256").update(PHASE4B2_OTHER_BODY, "utf8").digest("hex");

export const PHASE4B2_TOKENS = {
  signAParty0: "tok-phase4b2-sign-a-party0-secret",
  signAParty1: "tok-phase4b2-sign-a-party1-secret",
  signB: "tok-phase4b2-sign-b-secret",
  expired: "tok-phase4b2-expired-secret",
  revoked: "tok-phase4b2-revoked-secret",
  superseded: "tok-phase4b2-superseded-secret",
  reviewMode: "tok-phase4b2-review-mode-secret",
  malformed: "not-a-valid-sign-token",
  wrongParty: "tok-phase4b2-wrong-party-secret",
  wrongRole: "tok-phase4b2-wrong-role-secret",
  missingLock: "tok-phase4b2-missing-lock-secret",
  wrongVersion: "tok-phase4b2-wrong-version-secret",
  hashMismatch: "tok-phase4b2-hash-mismatch-secret",
} as const;

export const OWNER_ONLY_API = /workspace-index|\/v1\/subscriptions|usage\/summary|recipient-access-token/;

type TokenRecord = {
  agreementId: string;
  partyId: string;
  mode: "review" | "sign";
  signerRoleId: string;
  lockedVersionId?: string;
  status:
    | "ok"
    | "expired"
    | "revoked"
    | "superseded"
    | "malformed"
    | "wrong_party"
    | "wrong_role"
    | "missing_lock";
  hashMismatch?: boolean;
};

const TOKEN_TABLE: Record<string, TokenRecord> = {
  [PHASE4B2_TOKENS.signAParty0]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "ok",
  },
  [PHASE4B2_TOKENS.signAParty1]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_1,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_1,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "ok",
  },
  [PHASE4B2_TOKENS.signB]: {
    agreementId: PHASE4B2_AGREEMENT_B,
    partyId: PHASE4B2_PARTY_1,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_1,
    lockedVersionId: "lv-phase4b2-other-v1",
    status: "ok",
  },
  [PHASE4B2_TOKENS.expired]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "expired",
  },
  [PHASE4B2_TOKENS.revoked]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "revoked",
  },
  [PHASE4B2_TOKENS.superseded]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "superseded",
  },
  [PHASE4B2_TOKENS.reviewMode]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "review",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "ok",
  },
  [PHASE4B2_TOKENS.malformed]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    status: "malformed",
  },
  [PHASE4B2_TOKENS.wrongParty]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: "p-stranger",
    mode: "sign",
    signerRoleId: "role-stranger",
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "wrong_party",
  },
  [PHASE4B2_TOKENS.wrongRole]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_1,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "wrong_role",
  },
  [PHASE4B2_TOKENS.missingLock]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    status: "missing_lock",
  },
  [PHASE4B2_TOKENS.wrongVersion]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_WRONG_VERSION,
    status: "ok",
  },
  [PHASE4B2_TOKENS.hashMismatch]: {
    agreementId: PHASE4B2_AGREEMENT_A,
    partyId: PHASE4B2_PARTY_0,
    mode: "sign",
    signerRoleId: PHASE4B2_SIGNER_ROLE_0,
    lockedVersionId: PHASE4B2_LOCKED_VERSION,
    status: "ok",
    hashMismatch: true,
  },
};

export type Phase4b2CompleteBody = {
  agreementId: string;
  participant_id?: string;
  typed_name?: string;
  locked_version_id?: string;
  signer_role_id?: string;
};

export type Phase4b2FixtureState = {
  completeCount: Map<string, number>;
  signedParties: Set<string>;
  completeBodies: Phase4b2CompleteBody[];
  failGets: boolean;
  ownerOnlyHits: string[];
  recipientReads: Array<{ url: string; token: string; hasAuth: boolean }>;
};

export function createPhase4b2FixtureState(): Phase4b2FixtureState {
  return {
    completeCount: new Map(),
    signedParties: new Set(),
    completeBodies: [],
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

function draftRecord(agreementId: string, state: Phase4b2FixtureState, hashMismatch = false) {
  const isA = agreementId === PHASE4B2_AGREEMENT_A;
  const body = hashMismatch ? PHASE4B2_OTHER_BODY : isA ? PHASE4B2_FROZEN_BODY : PHASE4B2_OTHER_BODY;
  const sha = hashMismatch ? PHASE4B2_OTHER_SHA : isA ? PHASE4B2_FROZEN_SHA : PHASE4B2_OTHER_SHA;
  const title = isA ? PHASE4B2_TITLE : "Other Org Services Agreement";
  const party0 = isA ? PHASE4B2_PARTY_0 : "p-other-0";
  const party1 = isA ? PHASE4B2_PARTY_1 : "p-other-1";
  const audit_log: Array<{ event_type: string; at: string; value?: Record<string, unknown> }> = [];
  for (const partyId of [party0, party1]) {
    if (state.signedParties.has(`${agreementId}:${partyId}`)) {
      audit_log.push({
        event_type: "signature_completed",
        at: "2026-09-10T16:00:00.000Z",
        value: { participant_id: partyId },
      });
    }
  }
  const bothSigned =
    state.signedParties.has(`${agreementId}:${party0}`) &&
    state.signedParties.has(`${agreementId}:${party1}`);
  if (bothSigned) {
    audit_log.push({
      event_type: "signed",
      at: "2026-09-10T16:05:00.000Z",
      value: { fully_executed: true },
    });
  }
  const lockedVersionId = isA ? PHASE4B2_LOCKED_VERSION : "lv-phase4b2-other-v1";
  return {
    draft: {
      id: agreementId,
      title,
      jurisdiction: "New York",
      parties: [
        {
          id: party0,
          name: PHASE4B2_PARTY_0_NAME,
          role: "signer",
          signerName: PHASE4B2_SIGNER_0_NAME,
          signerTitle: PHASE4B2_SIGNER_0_TITLE,
        },
        {
          id: party1,
          name: PHASE4B2_PARTY_1_NAME,
          role: "signer",
          signerName: PHASE4B2_SIGNER_1_NAME,
          signerTitle: PHASE4B2_SIGNER_1_TITLE,
        },
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
      updated_at: "2026-09-10T16:00:00.000Z",
    },
    signing_lock: {
      locked_version_id: lockedVersionId,
      locked_at: "2026-09-10T15:00:00.000Z",
      locked_by: "owner",
      content_sha256: isA ? PHASE4B2_FROZEN_SHA : PHASE4B2_OTHER_SHA,
    },
    accepted_review_snapshot: {
      agreement_id: agreementId,
      locked_version_id: lockedVersionId,
      corpus_sha256: sha,
      corpus_length: body.length,
      corpus_plain: body,
      status: "accepted",
    },
  };
}

function authorizeSign(req: Request, agreementId: string): TokenRecord | { error: { status: number; code: string; message: string } } {
  const token = tokenFromRequest(req);
  const rec = TOKEN_TABLE[token];
  if (!rec || rec.status !== "ok" || rec.mode !== "sign") {
    return {
      error: {
        status: 403,
        code: "access_denied",
        message: "This link is invalid or expired. Request a new link from the sender.",
      },
    };
  }
  if (rec.agreementId !== agreementId) {
    return {
      error: {
        status: 403,
        code: "wrong_agreement",
        message: "This link is invalid or expired. Request a new link from the sender.",
      },
    };
  }
  return rec;
}

export async function fulfillPhase4b2Api(route: Route, state: Phase4b2FixtureState): Promise<void> {
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
    if (rec.status === "superseded") {
      await deny(route, "token_superseded", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (rec.status === "wrong_party") {
      await deny(route, "party_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (rec.status === "wrong_role") {
      await deny(route, "role_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (rec.status === "missing_lock") {
      await deny(route, "missing_lock", "This link is invalid or expired. Request a new link from the sender.");
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
      locked_version_id: rec.lockedVersionId || "",
      role: rec.mode === "sign" ? "signer" : "reviewer",
      signer_role_id: rec.signerRoleId,
      recipient_party_id: rec.partyId,
      inviter_display_name: PHASE4B2_PARTY_0_NAME,
    });
    return;
  }

  const renderMatch = url.match(/\/api\/agreements\/([^/]+)\/render/);
  if (renderMatch && method === "POST") {
    const agreementId = decodeURIComponent(renderMatch[1]);
    const auth = authorizeSign(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const payload = draftRecord(agreementId, state, Boolean(auth.hashMismatch));
    await json(route, {
      rendered_html: `<article><pre>${String(payload.draft.server_full_document_text)}</pre></article>`,
    });
    return;
  }

  const startMatch = url.match(/\/api\/agreements\/([^/]+)\/signing-ceremony\/start/);
  if (startMatch && method === "POST") {
    const agreementId = decodeURIComponent(startMatch[1]);
    const auth = authorizeSign(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const body = (req.postDataJSON() as { participant_id?: string } | null) || {};
    if (body.participant_id && body.participant_id !== auth.partyId) {
      await deny(route, "party_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    await json(route, {
      ok: true,
      locked_version_id: auth.lockedVersionId || PHASE4B2_LOCKED_VERSION,
      agreement_version_hash: PHASE4B2_FROZEN_SHA,
      participant_display_name: auth.partyId === PHASE4B2_PARTY_1 ? PHASE4B2_SIGNER_1_NAME : PHASE4B2_SIGNER_0_NAME,
    });
    return;
  }

  const completeMatch = url.match(/\/api\/agreements\/([^/]+)\/signing-ceremony\/complete/);
  if (completeMatch && method === "POST") {
    const agreementId = decodeURIComponent(completeMatch[1]);
    const auth = authorizeSign(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    const body =
      (req.postDataJSON() as {
        participant_id?: string;
        typed_name?: string;
        locked_version_id?: string;
        signer_role_id?: string;
      } | null) || {};
    state.completeBodies.push({
      agreementId,
      participant_id: body.participant_id,
      typed_name: body.typed_name,
      locked_version_id: body.locked_version_id,
      signer_role_id: body.signer_role_id,
    });
    if (body.participant_id && body.participant_id !== auth.partyId) {
      await deny(route, "party_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    if (body.locked_version_id && body.locked_version_id !== auth.lockedVersionId) {
      await json(route, { detail: "locked_version_mismatch" }, 400);
      return;
    }
    if (body.signer_role_id && body.signer_role_id !== auth.signerRoleId) {
      await deny(route, "role_mismatch", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    const key = `${agreementId}:${auth.partyId}`;
    if (state.signedParties.has(key)) {
      await json(route, { detail: "already_signed" }, 409);
      return;
    }
    state.completeCount.set(key, (state.completeCount.get(key) || 0) + 1);
    state.signedParties.add(key);
    const bothSigned =
      state.signedParties.has(`${agreementId}:${PHASE4B2_PARTY_0}`) &&
      state.signedParties.has(`${agreementId}:${PHASE4B2_PARTY_1}`);
    await json(route, {
      ok: true,
      signed_at: "2026-09-10T16:00:00.000Z",
      agreement_version_hash: PHASE4B2_FROZEN_SHA,
      participant_display_name: auth.partyId === PHASE4B2_PARTY_1 ? PHASE4B2_SIGNER_1_NAME : PHASE4B2_SIGNER_0_NAME,
      fully_executed: bothSigned,
    });
    return;
  }

  const getMatch = url.match(/\/api\/agreements\/([^/?]+)$/);
  if (getMatch && method === "GET" && !url.includes("/access/")) {
    if (state.failGets) {
      await json(
        route,
        { detail: { code: "network_retryable", message: "We couldn't load this agreement. Please try again." } },
        503,
      );
      return;
    }
    const agreementId = decodeURIComponent(getMatch[1]);
    const auth = authorizeSign(req, agreementId);
    state.recipientReads.push({ url, token: tokenFromRequest(req), hasAuth: hasOwnerJwt(req) });
    if ("error" in auth) {
      await deny(route, auth.error.code, auth.error.message, auth.error.status);
      return;
    }
    await json(route, draftRecord(agreementId, state, Boolean(auth.hashMismatch)));
    return;
  }

  await json(route, { ok: true });
}

export async function installPhase4b2RecipientMocks(page: Page, state: Phase4b2FixtureState): Promise<void> {
  const handler = (route: Route) => fulfillPhase4b2Api(route, state);
  await page.route("**/api/**", handler);
  await page.route("**/v1/**", handler);
  await page.route("**/health", handler);
  await page.route("**/version", handler);
}

export async function seedPhase4b2UnsignedSigner(page: Page, state: Phase4b2FixtureState): Promise<void> {
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
  await installPhase4b2RecipientMocks(page, state);
}

export function primarySignHref(token: string, partyId = PHASE4B2_PARTY_0): string {
  return phase4b2SigningPath(PHASE4B2_AGREEMENT_A, token, partyId);
}
