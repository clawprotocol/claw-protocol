/**
 * Phase 4B.4 `/app/esign/:documentId` dual-mode fixtures.
 * Server-attested packets and owner document bytes only — URL/local paper is never authority.
 */
import { createHash } from "node:crypto";
import type { Page, Request, Route } from "@playwright/test";
import { fingerprintAgreementBody } from "../../src/components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import {
  PHASE4A_FROZEN_BODY,
  PHASE4A_PARTY_0,
  PHASE4A_PARTY_1,
  PHASE4A_TITLE,
} from "../phase4a/phase4aPaidOwnerFixtures";
import {
  PHASE4B4_COVERAGE_AGREEMENT_ID,
  PHASE4B4_COVERAGE_DOCUMENT_ID,
  PHASE4B4_COVERAGE_PACKET_REVISION,
  PHASE4B4_COVERAGE_PARTY_ID,
  PHASE4B4_COVERAGE_SIGNER_ROLE_ID,
  phase4b4OwnerBridgePath,
  phase4b4RecipientSignPath,
} from "../../src/launch/phase4b4EsignDualModeCoverage";

export const PHASE4B4_DOCUMENT_ID = PHASE4B4_COVERAGE_DOCUMENT_ID;
export const PHASE4B4_AGREEMENT_ID = PHASE4B4_COVERAGE_AGREEMENT_ID;
export const PHASE4B4_PARTY_0 = "p-orion";
export const PHASE4B4_PARTY_1 = PHASE4B4_COVERAGE_PARTY_ID;
export const PHASE4B4_SIGNER_ROLE_0 = "sr-orion-ceo";
export const PHASE4B4_SIGNER_ROLE_1 = PHASE4B4_COVERAGE_SIGNER_ROLE_ID;
export const PHASE4B4_LOCKED_VERSION = "lv-phase4b4-orion-v1";
export const PHASE4B4_PACKET_REVISION = PHASE4B4_COVERAGE_PACKET_REVISION;
export const PHASE4B4_TITLE = PHASE4A_TITLE;
export const PHASE4B4_PARTY_0_NAME = PHASE4A_PARTY_0;
export const PHASE4B4_PARTY_1_NAME = PHASE4A_PARTY_1;
export const PHASE4B4_FROZEN_BODY = `${PHASE4A_FROZEN_BODY}\n\n${"Additional operative terms. ".repeat(40)}`.trim();
export const PHASE4B4_FROZEN_SHA = fingerprintAgreementBody(PHASE4B4_FROZEN_BODY);
export const PHASE4B4_FORGED_BODY = "FORGED-LOCAL-ESIGN-CORPUS-MUST-NOT-AUTHORIZE";

export const PHASE4B4_OWNER = {
  id: "user-phase4b4-owner",
  email: "owner.phase4b4@example.com",
  name: "Phase 4B.4 Owner",
  orgId: "org-phase4b4-owner",
};

export const PHASE4B4_OTHER_OWNER = {
  id: "user-phase4b4-other",
  email: "other.phase4b4@example.com",
  name: "Phase 4B.4 Other Owner",
  orgId: "org-phase4b4-other",
};

export const PHASE4B4_TOKENS = {
  signParty1: "tok-phase4b4-sign-a-party1-secret",
  signParty0: "tok-phase4b4-sign-a-party0-secret",
  expired: "tok-phase4b4-expired-secret",
  wrongParty: "tok-phase4b4-wrong-party-secret",
  wrongDoc: "tok-phase4b4-wrong-doc-secret",
} as const;

export const OWNER_ONLY_API = /workspace-index|\/v1\/subscriptions|usage\/summary|recipient-access-token/;

export type Phase4b4FixtureState = {
  ownerContentHits: string[];
  packetHits: string[];
  validateHits: string[];
  completeHits: Array<{ signerRoleId: string; participantId: string; token: string }>;
  ownerOnlyHits: string[];
  failNetwork: boolean;
  missingPacket: boolean;
  mismatchRevision: boolean;
  mismatchHash: boolean;
  signedRoles: Set<string>;
};

export function createPhase4b4FixtureState(): Phase4b4FixtureState {
  return {
    ownerContentHits: [],
    packetHits: [],
    validateHits: [],
    completeHits: [],
    ownerOnlyHits: [],
    failNetwork: false,
    missingPacket: false,
    mismatchRevision: false,
    mismatchHash: false,
    signedRoles: new Set(),
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

export function phase4b4OwnerHref(documentId = PHASE4B4_DOCUMENT_ID): string {
  return phase4b4OwnerBridgePath(documentId);
}

export function phase4b4RecipientHref(token = PHASE4B4_TOKENS.signParty1): string {
  return phase4b4RecipientSignPath(PHASE4B4_DOCUMENT_ID, token);
}

export function buildPhase4b4Portable(args?: { corpusHash?: string; revisionHint?: string }) {
  const corpusHash = args?.corpusHash ?? PHASE4B4_FROZEN_SHA;
  const role0 = {
    roleId: PHASE4B4_SIGNER_ROLE_0,
    partyIndex: 0,
    partyId: PHASE4B4_PARTY_0,
    entityName: PHASE4B4_PARTY_0_NAME,
    partyName: PHASE4B4_PARTY_0_NAME,
    roleLabel: "Provider",
    signerName: "Dana Orion",
    signerTitle: "CEO",
    signerEmail: "dana@orion.example",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: PHASE4B4_PARTY_0,
    kind: "owner" as const,
  };
  const role1 = {
    roleId: PHASE4B4_SIGNER_ROLE_1,
    partyIndex: 1,
    partyId: PHASE4B4_PARTY_1,
    entityName: PHASE4B4_PARTY_1_NAME,
    partyName: PHASE4B4_PARTY_1_NAME,
    roleLabel: "Customer",
    signerName: "Casey Contoso",
    signerTitle: "General Counsel",
    signerEmail: "casey@contoso.example",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: PHASE4B4_PARTY_1,
    kind: "counterparty" as const,
  };
  const field = (id: string, roleId: string, partyId: string, index: number) => ({
    id,
    counterpartyId: partyId,
    type: "signature" as const,
    page: 0,
    x: 0.12,
    y: 0.72 + index * 0.08,
    width: 0.36,
    height: 0.06,
    assignedSignerRoleId: roleId,
    assignedPartyIndex: index,
  });
  return {
    v: 1 as const,
    seed: {
      v: 1 as const,
      documentId: PHASE4B4_DOCUMENT_ID,
      agreementId: PHASE4B4_AGREEMENT_ID,
      corpusPlain: PHASE4B4_FROZEN_BODY,
      corpusHash,
      savedAt: "2026-09-10T15:00:00.000Z",
    },
    fields: [
      field("sig-orion", PHASE4B4_SIGNER_ROLE_0, PHASE4B4_PARTY_0, 0),
      field("sig-contoso", PHASE4B4_SIGNER_ROLE_1, PHASE4B4_PARTY_1, 1),
    ],
    roles: [role0, role1],
    pageCount: 1,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 2,
    packetRevision: args?.revisionHint ?? PHASE4B4_PACKET_REVISION,
  };
}

function tokenRecord(token: string) {
  if (token === PHASE4B4_TOKENS.signParty1) {
    return {
      agreement_id: PHASE4B4_AGREEMENT_ID,
      mode: "sign",
      locked_version_id: PHASE4B4_LOCKED_VERSION,
      recipient_party_id: PHASE4B4_PARTY_1,
      signer_role_id: PHASE4B4_SIGNER_ROLE_1,
    };
  }
  if (token === PHASE4B4_TOKENS.signParty0) {
    return {
      agreement_id: PHASE4B4_AGREEMENT_ID,
      mode: "sign",
      locked_version_id: PHASE4B4_LOCKED_VERSION,
      recipient_party_id: PHASE4B4_PARTY_0,
      signer_role_id: PHASE4B4_SIGNER_ROLE_0,
    };
  }
  return null;
}

const PHASE4B4_API_GLOBS = [
  "**/api/**",
  "**/v1/**",
  "**/health",
  "**/health/**",
  "**/version",
  "**/version/**",
] as const;

async function installPhase4b4ApiRoutes(
  page: Page,
  state: Phase4b4FixtureState,
  actor: "owner" | "other" | "signed_out",
) {
  for (const glob of PHASE4B4_API_GLOBS) {
    await page.route(glob, (route) => fulfillPhase4b4Api(route, state, actor));
  }
}

export async function seedPhase4b4Owner(page: Page, actor: "owner" | "other" | "signed_out", state: Phase4b4FixtureState) {
  if (actor !== "signed_out") {
    const user = actor === "owner" ? PHASE4B4_OWNER : PHASE4B4_OTHER_OWNER;
    await seedE2eAuthSession(page, {
      ...DEFAULT_E2E_AUTH_SESSION,
      access_token: actor === "owner" ? "e2e-phase4b4-owner-token" : "e2e-phase4b4-other-token",
      user: {
        ...DEFAULT_E2E_AUTH_SESSION.user,
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.name },
      },
    });
    await page.addInitScript(
      ({ orgId, forged }) => {
        try {
          localStorage.setItem("claw_org_id", orgId);
          localStorage.setItem("lawdog-forged-esign-corpus", forged);
        } catch {
          /* ignore */
        }
      },
      { orgId: user.orgId, forged: PHASE4B4_FORGED_BODY },
    );
  }
  await installPhase4b4ApiRoutes(page, state, actor);
}

export async function seedPhase4b4Recipient(page: Page, state: Phase4b4FixtureState) {
  await page.addInitScript((forged) => {
    try {
      localStorage.setItem("lawdog-forged-esign-corpus", forged);
    } catch {
      /* ignore */
    }
  }, PHASE4B4_FORGED_BODY);
  await installPhase4b4ApiRoutes(page, state, "signed_out");
}

export async function fulfillPhase4b4Api(
  route: Route,
  state: Phase4b4FixtureState,
  actor: "owner" | "other" | "signed_out",
): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();

  if (
    !url.includes("/api/") &&
    !url.includes("/v1/") &&
    !url.includes("/health") &&
    !url.includes("/version")
  ) {
    await route.continue();
    return;
  }

  if (url.includes("/health") || url.includes("/version")) {
    await json(route, { ok: true });
    return;
  }

  if (url.includes("/v1/workspace/bind-user-org") || url.includes("/bind-user-org")) {
    await json(route, { org_id: PHASE4B4_OWNER.orgId, ok: true });
    return;
  }

  if (url.includes("/v1/admin/operators/me")) {
    await json(route, { operator: null }, 404);
    return;
  }

  if (url.includes("/v1/genesis-referral/affiliate/access")) {
    await json(route, { ok: true, allowed: false, reason: "genesis_affiliate_access_denied" });
    return;
  }

  if (OWNER_ONLY_API.test(url) && actor === "signed_out") {
    state.ownerOnlyHits.push(`${method} ${url}`);
    await json(route, { detail: { code: "owner_auth_required", message: "Sign in required." } }, 401);
    return;
  }

  if (url.includes("/v1/subscriptions")) {
    if (actor === "signed_out") {
      await json(route, { error: "unauthorized" }, 401);
      return;
    }
    await json(route, {
      subscription: { org_id: PHASE4B4_OWNER.orgId, plan_code: "pro", status: "active" },
      ok: true,
      plan: "pro",
      status: "active",
    });
    return;
  }

  if (url.includes("/api/agreements/access/policy") && method === "GET") {
    await json(route, {
      recipient_link_token_required: true,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    return;
  }

  if (url.includes("/api/agreements/access/validate")) {
    state.validateHits.push(url);
    if (state.failNetwork) {
      await json(route, { detail: { code: "upstream" } }, 503);
      return;
    }
    const parsed = new URL(url);
    const token = (parsed.searchParams.get("token") || "").trim();
    const agreementId = (parsed.searchParams.get("agreement_id") || "").trim();
    if (token === PHASE4B4_TOKENS.expired) {
      await deny(route, "token_expired", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    const rec = tokenRecord(token);
    if (!rec || (agreementId && rec.agreement_id !== agreementId)) {
      await deny(route, "invalid_token", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    await json(route, { ok: true, ...rec });
    return;
  }

  if (url.includes("/vs01-signing-packet")) {
    state.packetHits.push(url);
    if (state.failNetwork) {
      await json(route, { detail: { code: "upstream" } }, 503);
      return;
    }
    if (state.missingPacket) {
      await json(route, { detail: "packet_not_found" }, 404);
      return;
    }
    const parsed = new URL(url);
    const token = (parsed.searchParams.get("t") || parsed.searchParams.get("token") || "").trim();
    const rec = tokenRecord(token);
    if (!rec) {
      await deny(route, "recipient_token_required", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    const documentId = (parsed.searchParams.get("document_id") || "").trim();
    if (documentId !== PHASE4B4_DOCUMENT_ID || token === PHASE4B4_TOKENS.wrongDoc) {
      await json(route, { detail: "packet_document_mismatch" }, 404);
      return;
    }
    const rev = (parsed.searchParams.get("packet_revision") || "").trim();
    if (state.mismatchRevision || (rev && rev !== PHASE4B4_PACKET_REVISION && rev !== "forged-rev")) {
      /* forged-rev is an explicit mismatch case from the spec */
    }
    if (state.mismatchRevision || rev === "forged-rev") {
      await json(route, { detail: "packet_revision_mismatch" }, 404);
      return;
    }
    const portable = buildPhase4b4Portable({
      corpusHash: state.mismatchHash ? createHash("sha256").update("tampered").digest("hex") : PHASE4B4_FROZEN_SHA,
    });
    await json(route, { ok: true, portable });
    return;
  }

  if (url.includes("/vs01-signer-complete") && method === "POST") {
    let body: { signer_role_id?: string; participant_id?: string } = {};
    try {
      body = JSON.parse(req.postData() || "{}") as { signer_role_id?: string; participant_id?: string };
    } catch {
      body = {};
    }
    const token = (req.headers()["x-claw-recipient-access-token"] || "").trim();
    const rec = tokenRecord(token);
    if (!rec) {
      await deny(route, "invalid_token", "This link is invalid or expired. Request a new link from the sender.");
      return;
    }
    const role = (body.signer_role_id || "").trim();
    const pid = (body.participant_id || "").trim();
    if (role !== rec.signer_role_id || pid !== rec.recipient_party_id) {
      await deny(route, "party_mismatch", "Signing could not be recorded for this party.");
      return;
    }
    const already = state.signedRoles.has(role);
    state.signedRoles.add(role);
    state.completeHits.push({ signerRoleId: role, participantId: pid, token });
    await json(route, {
      ok: true,
      already_signed: already,
      fully_signed: false,
    });
    return;
  }

  if (url.includes("/v1/documents/") && url.includes("/content")) {
    state.ownerContentHits.push(url);
    const auth = (req.headers().authorization || "").trim();
    if (actor !== "owner" || !auth) {
      await json(route, { detail: { code: "document_forbidden" } }, 403);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
    });
    return;
  }

  if (url.includes("/workspace-index") || url.includes("/api/agreements")) {
    await json(route, { ok: true, agreements: [] });
    return;
  }

  await route.continue();
}

export function hasOwnerJwt(req: Request): boolean {
  return Boolean((req.headers().authorization || "").trim());
}
