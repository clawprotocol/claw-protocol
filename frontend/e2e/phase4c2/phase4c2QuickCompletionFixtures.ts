/**
 * Phase 4C.2 Quick completion fixtures. Playwright route interception only.
 */
import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";

export const PHASE4C2_OWNER = {
  id: "user-phase4c2-owner",
  email: "avery.owner@lawdog.test",
  name: "Avery Owner",
  orgId: "user-phase4c2-owner",
};

export const PHASE4C2_RECIPIENT = {
  name: "Riley Recipient",
  email: "riley.recipient@lawdog.test",
};

export const PHASE4C2_OTHER_ORG = "user-phase4c2-other";
export const PHASE4C2_DOCUMENT_ID = "doc_phase4c2_pdf";
export const PHASE4C2_AGREEMENT_ID = "ag-phase4c2-envelope";
export const PHASE4C2_OWNER_PARTY_ID = "party_qs_owner";
export const PHASE4C2_RECIPIENT_PARTY_ID = "party_qs_recipient";
export const PHASE4C2_TOKEN = "tok-phase4c2-sign-recipient-secret";
export const PHASE4C2_REVOKED = "tok-phase4c2-revoked-secret";
export const PHASE4C2_REISSUED = "tok-phase4c2-reissued-secret";
export const PHASE4C2_PDF = Buffer.from(
  [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000184 00000 n ",
    "trailer<</Size 5/Root 1 0 R>>",
    "startxref",
    "253",
    "%%EOF",
    "",
  ].join("\n"),
  "utf8",
);
export const PHASE4C2_PDF_SHA = createHash("sha256").update(PHASE4C2_PDF).digest("hex");
export const PHASE4C2_PDF_TYPE = "application/pdf";
export const PHASE4C2_PACKET_REVISION = "qpk_1";
export const PHASE4C2_RECEIPT_ID = "rcpt_phase4c2_uploaded_pdf";
export const PHASE4C2_RECEIPT_DIGEST = createHash("sha256").update("phase4c2-uploaded-pdf-receipt").digest("hex");

export type Phase4c2FixtureState = {
  entitlement: "paid" | "guest" | "auth_fail";
  ownerOrgId: string;
  documentPosts: Array<{ orgId: string; hasAuth: boolean }>;
  envelopeCreates: number;
  fieldSaves: number;
  prepareHits: number;
  copyHits: number;
  ownerCompleteHits: number;
  reissueHits: number;
  receiptGets: number;
  bundleGets: number;
  activeToken: string;
  packetHits: number;
  validateHits: number;
  contentHits: Array<{ hasOwnerAuth: boolean; hasRecipientToken: boolean }>;
  completeHits: Array<{ signerRoleId: string; participantId: string }>;
  completeBodies: Array<Record<string, unknown>>;
  completeFailOnce: "503" | "403" | "network" | null;
  signedRoles: Set<string>;
  receiptIssued: boolean;
  envelopeWrites: number;
  envelopeCreated: boolean;
  fieldsSaved: boolean;
  prepared: boolean;
  failNetwork: boolean;
  hashMismatch: boolean;
  revokeToken: boolean;
  getStatus: number;
};

export function createPhase4c2State(partial?: Partial<Phase4c2FixtureState>): Phase4c2FixtureState {
  return {
    entitlement: "paid",
    ownerOrgId: PHASE4C2_OWNER.orgId,
    documentPosts: [],
    envelopeCreates: 0,
    fieldSaves: 0,
    prepareHits: 0,
    copyHits: 0,
    ownerCompleteHits: 0,
    reissueHits: 0,
    receiptGets: 0,
    activeToken: PHASE4C2_TOKEN,
    bundleGets: 0,
    packetHits: 0,
    validateHits: 0,
    contentHits: [],
    completeHits: [],
    completeBodies: [],
    completeFailOnce: null,
    signedRoles: new Set(),
    receiptIssued: false,
    envelopeWrites: 0,
    envelopeCreated: false,
    fieldsSaved: false,
    prepared: false,
    failNetwork: false,
    hashMismatch: false,
    revokeToken: false,
    getStatus: 200,
    ...partial,
  };
}

export function phase4c2OwnerSession() {
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: "e2e-phase4c2-access-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: PHASE4C2_OWNER.id,
      email: PHASE4C2_OWNER.email,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: PHASE4C2_OWNER.name },
      identities: [{ provider: "email", id: "e2e-phase4c2-id" }],
    },
  };
}

export async function seedPhase4c2Owner(page: Page): Promise<void> {
  await seedE2eAuthSession(page, phase4c2OwnerSession());
  await page.addInitScript(
    ({ orgId }) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        localStorage.setItem("claw_tier", "paid");
      } catch {
        /* ignore */
      }
    },
    { orgId: PHASE4C2_OWNER.orgId },
  );
}

export function phase4c2RecipientHref(token = PHASE4C2_TOKEN): string {
  const q = new URLSearchParams({
    vs01_recipient_sign: "1",
    document_id: PHASE4C2_DOCUMENT_ID,
    agreement_id: PHASE4C2_AGREEMENT_ID,
    recipient_index: "0",
    counterparty_id: PHASE4C2_RECIPIENT_PARTY_ID,
    signer_role_id: RECIPIENT_ROLE_ID,
    t: token,
  });
  return `/app/esign/${PHASE4C2_DOCUMENT_ID}?${q.toString()}`;
}

function envelope(state: Phase4c2FixtureState) {
  return {
    document_id: PHASE4C2_DOCUMENT_ID,
    agreement_id: PHASE4C2_AGREEMENT_ID,
    content_sha256: PHASE4C2_PDF_SHA,
    size_bytes: PHASE4C2_PDF.length,
    content_type: PHASE4C2_PDF_TYPE,
    owner_name: PHASE4C2_OWNER.name,
    owner_email: PHASE4C2_OWNER.email,
    recipient_name: PHASE4C2_RECIPIENT.name,
    recipient_email: PHASE4C2_RECIPIENT.email,
    owner_party_id: PHASE4C2_OWNER_PARTY_ID,
    recipient_party_id: PHASE4C2_RECIPIENT_PARTY_ID,
    owner_role_id: OWNER_ROLE_ID,
    recipient_role_id: RECIPIENT_ROLE_ID,
    kind: "uploaded_final_pdf",
    locked: state.prepared || state.signedRoles.has(OWNER_ROLE_ID),
    page_count: 2,
    max_recipients: 1,
    fields: state.fieldsSaved
      ? [
          {
            field_id: "fld_owner_sig",
            signer_role_id: OWNER_ROLE_ID,
            field_type: "signature",
            page_index: 1,
            x: 0.12,
            y: 0.72,
            w: 0.32,
            h: 0.1,
            required: true,
          },
          {
            field_id: "fld_recipient_sig",
            signer_role_id: RECIPIENT_ROLE_ID,
            field_type: "signature",
            page_index: 1,
            x: 0.56,
            y: 0.72,
            w: 0.32,
            h: 0.1,
            required: true,
          },
        ]
      : [],
    packet_revision: PHASE4C2_PACKET_REVISION,
    delivery_state: state.prepared ? "link_prepared" : "not_prepared",
    recipient_link_ready: state.prepared,
    recipient_token_jti: state.prepared ? "jti-phase4c2-active" : undefined,
  };
}

function completion(state: Phase4c2FixtureState) {
  const owner = state.signedRoles.has(OWNER_ROLE_ID);
  const recipient = state.signedRoles.has(RECIPIENT_ROLE_ID);
  const fully = owner && recipient;
  return {
    owner_signed: owner,
    recipient_signed: recipient,
    fully_executed: fully,
    required_signer_count: 2,
    completed_signer_count: Number(owner) + Number(recipient),
    status: fully ? "fully_executed" : owner ? "awaiting_recipient" : "preparing",
  };
}

function portable(state: Phase4c2FixtureState) {
  return {
    v: 1,
    schema: "vs01_signing_packet_v1",
    kind: "uploaded_final_pdf",
    authorityMode: "uploaded_final_pdf",
    seed: {
      v: 1,
      documentId: PHASE4C2_DOCUMENT_ID,
      agreementId: PHASE4C2_AGREEMENT_ID,
      contentSha256: PHASE4C2_PDF_SHA,
      savedAt: "2026-09-11T18:00:00.000Z",
    },
    roles: [
      {
        roleId: OWNER_ROLE_ID,
        partyId: PHASE4C2_OWNER_PARTY_ID,
        partyIndex: 0,
        kind: "owner",
        vs01CounterpartyId: PHASE4C2_OWNER_PARTY_ID,
        entityName: PHASE4C2_OWNER.name,
        signerEmail: PHASE4C2_OWNER.email,
        requiresSignature: true,
      },
      {
        roleId: RECIPIENT_ROLE_ID,
        partyId: PHASE4C2_RECIPIENT_PARTY_ID,
        partyIndex: 1,
        kind: "counterparty",
        vs01CounterpartyId: PHASE4C2_RECIPIENT_PARTY_ID,
        entityName: PHASE4C2_RECIPIENT.name,
        signerEmail: PHASE4C2_RECIPIENT.email,
        requiresSignature: true,
      },
    ],
    fields: [
      {
        id: "fld_owner_sig",
        type: "signature",
        page: 1,
        x: 0.12,
        y: 0.72,
        width: 0.32,
        height: 0.1,
        assignedSignerRoleId: OWNER_ROLE_ID,
        assignedPartyIndex: 0,
        counterpartyId: PHASE4C2_OWNER_PARTY_ID,
      },
      {
        id: "fld_recipient_sig",
        type: "signature",
        page: 1,
        x: 0.56,
        y: 0.72,
        width: 0.32,
        height: 0.1,
        assignedSignerRoleId: RECIPIENT_ROLE_ID,
        assignedPartyIndex: 1,
        counterpartyId: PHASE4C2_RECIPIENT_PARTY_ID,
      },
    ],
    pageCount: 2,
    fieldCount: 2,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    lockedContentSha256: PHASE4C2_PDF_SHA,
  };
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

const API_GLOBS = ["**/api/**", "**/v1/**", "**/health", "**/health/**", "**/version", "**/version/**", "**/__supabase/**"] as const;

export async function installPhase4c2ApiMocks(page: Page, state: Phase4c2FixtureState): Promise<void> {
  for (const glob of API_GLOBS) {
    await page.route(glob, (route) => fulfillPhase4c2Api(route, state));
  }
}

async function fulfillPhase4c2Api(route: Route, state: Phase4c2FixtureState): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const orgId = (req.headers()["x-claw-org-id"] || "").trim();
  const hasAuth = Boolean((req.headers().authorization || "").trim());
  const recipTok = (req.headers()["x-claw-recipient-access-token"] || "").trim();

  if (url.includes("/__supabase")) {
    const session = phase4c2OwnerSession();
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

  if (url.includes("/v1/workspace/bind-user-org") && method === "POST") {
    await json(route, { ok: true, org_id: PHASE4C2_OWNER.orgId, user_id: PHASE4C2_OWNER.id });
    return;
  }

  if (url.includes("/api/agreements/usage/summary")) {
    if (state.entitlement === "auth_fail") {
      await json(route, { detail: "unauthorized" }, 401);
      return;
    }
    await json(route, paidSummary());
    return;
  }

  if (/\/v1\/documents\/?$/.test(new URL(url).pathname) && method === "POST") {
    state.documentPosts.push({ orgId, hasAuth });
    await json(route, {
      ok: true,
      document_id: PHASE4C2_DOCUMENT_ID,
      content_sha256: PHASE4C2_PDF_SHA,
      size_bytes: PHASE4C2_PDF.length,
      content_type: PHASE4C2_PDF_TYPE,
      owner_org_id: PHASE4C2_OWNER.orgId,
    });
    return;
  }

  if (url.includes("/v1/documents/") && method === "GET") {
    const parsed = new URL(url);
    const token = recipTok || parsed.searchParams.get("t") || "";
    state.contentHits.push({ hasOwnerAuth: hasAuth, hasRecipientToken: Boolean(token) });
    if (orgId && orgId !== state.ownerOrgId && !token) {
      await json(route, { detail: { code: "document_org_mismatch" } }, 403);
      return;
    }
    if (state.getStatus !== 200 && !token) {
      await json(route, { detail: { code: "document_org_mismatch" } }, state.getStatus);
      return;
    }
    if (token && (token === PHASE4C2_REVOKED || state.revokeToken)) {
      await json(route, { detail: { code: "invalid_token" } }, 403);
      return;
    }
    if (url.includes("/content")) {
      await route.fulfill({ status: 200, contentType: PHASE4C2_PDF_TYPE, body: PHASE4C2_PDF });
      return;
    }
    await json(route, {
      ok: true,
      document: {
        document_id: PHASE4C2_DOCUMENT_ID,
        content_sha256: PHASE4C2_PDF_SHA,
        size_bytes: PHASE4C2_PDF.length,
        content_type: PHASE4C2_PDF_TYPE,
        owner_org_id: PHASE4C2_OWNER.orgId,
        agreement_id: state.envelopeCreated ? PHASE4C2_AGREEMENT_ID : "",
      },
    });
    return;
  }

  if (url.includes("/api/agreements/access/validate")) {
    state.validateHits += 1;
    const parsed = new URL(url);
    const token = (parsed.searchParams.get("token") || recipTok || "").trim();
    if (!token || token === PHASE4C2_REVOKED || state.revokeToken) {
      await json(route, { detail: { code: "invalid_token", message: "This link is invalid or expired." } }, 403);
      return;
    }
    if (token !== state.activeToken) {
      await json(route, { detail: { code: "invalid_token", message: "This link is invalid or expired." } }, 403);
      return;
    }
    await json(route, {
      ok: true,
      agreement_id: PHASE4C2_AGREEMENT_ID,
      mode: "sign",
      locked_version_id: "lv-phase4c2-quick-pdf",
      recipient_party_id: PHASE4C2_RECIPIENT_PARTY_ID,
      signer_role_id: RECIPIENT_ROLE_ID,
    });
    return;
  }

  if (url.includes("/vs01-signing-packet")) {
    state.packetHits += 1;
    const parsed = new URL(url);
    const token = (parsed.searchParams.get("t") || recipTok || "").trim();
    const documentId = (parsed.searchParams.get("document_id") || "").trim();
    if (!token || token === PHASE4C2_REVOKED || state.revokeToken || token !== state.activeToken) {
      await json(route, { detail: { code: "invalid_token" } }, 403);
      return;
    }
    if (documentId && documentId !== PHASE4C2_DOCUMENT_ID) {
      await json(route, { detail: "packet_document_mismatch" }, 404);
      return;
    }
    await json(route, {
      ok: true,
      portable: portable(state),
      signer_already_completed: state.signedRoles.has(RECIPIENT_ROLE_ID),
    });
    return;
  }

  if (url.includes("/vs01-signer-complete") && method === "POST") {
    const body = readJsonBody(route);
    state.completeBodies.push(body);
    if (state.completeFailOnce === "network") {
      state.completeFailOnce = null;
      await route.abort("failed");
      return;
    }
    if (state.completeFailOnce === "503") {
      state.completeFailOnce = null;
      await json(route, { detail: { code: "network_retryable", message: "try again" } }, 503);
      return;
    }
    if (state.completeFailOnce === "403") {
      state.completeFailOnce = null;
      await json(route, { detail: { code: "invalid_token", message: "This link is invalid or expired." } }, 403);
      return;
    }
    const token = recipTok;
    if (!token || token !== state.activeToken || state.revokeToken) {
      await json(route, { detail: { code: "invalid_token" } }, 403);
      return;
    }
    const role = String(body.signer_role_id || "").trim();
    const pid = String(body.participant_id || "").trim();
    if (role !== RECIPIENT_ROLE_ID || pid !== PHASE4C2_RECIPIENT_PARTY_ID) {
      await json(route, { detail: { code: "party_mismatch" } }, 403);
      return;
    }
    const consent = body.consent as { accepted?: boolean; action?: string } | undefined;
    const fields = Array.isArray(body.assigned_fields) ? body.assigned_fields : [];
    const signature = fields.find((row) => String((row as { field_type?: string }).field_type || "") === "signature");
    const foreign = fields.some((row) => String((row as { field_id?: string }).field_id || "") === "fld_o");
    if (foreign) {
      await json(route, { detail: { code: "foreign_field", message: "A submitted field belongs to another signer." } }, 403);
      return;
    }
    if (!consent || consent.accepted !== true || String(consent.action || "") !== "agree_and_sign") {
      await json(route, { detail: { code: "consent_required", message: "Affirmative electronic-signature consent is required." } }, 400);
      return;
    }
    if (!signature || !String((signature as { value?: string }).value || "").trim()) {
      await json(route, { detail: { code: "signature_required", message: "A required signature field is empty." } }, 400);
      return;
    }
    const already = state.signedRoles.has(role);
    if (already) {
      const prior = state.completeBodies[0]?.assigned_fields;
      if (JSON.stringify(prior) !== JSON.stringify(fields)) {
        await json(route, { detail: { code: "completion_evidence_mismatch" } }, 409);
        return;
      }
    }
    state.signedRoles.add(role);
    state.completeHits.push({ signerRoleId: role, participantId: pid });
    const fully = state.signedRoles.has(OWNER_ROLE_ID) && state.signedRoles.has(RECIPIENT_ROLE_ID);
    if (fully) state.receiptIssued = true;
    await json(route, {
      ok: true,
      already_signed: already,
      fully_signed: fully,
      fully_executed: fully,
      receipt_status: fully ? "issued" : "not_applicable",
      completion: {
        status: already ? "already_signed" : "completed",
        signed_at: "2026-09-11T18:00:00.000Z",
        signer_role_id: role,
        participant_id: pid,
        document_id: PHASE4C2_DOCUMENT_ID,
      },
      uploaded_final_pdf_receipt: fully
        ? { receipt_id: PHASE4C2_RECEIPT_ID, receipt_hash_sha256: PHASE4C2_RECEIPT_DIGEST, kind: "uploaded_final_pdf_receipt.v1" }
        : null,
    });
    return;
  }

  if (url.includes("/api/agreements/quick-pdf-envelope")) {
    if (state.failNetwork) {
      await route.abort("failed");
      return;
    }
    if (!hasAuth) {
      await json(route, { detail: { code: "unauthorized" } }, 401);
      return;
    }
    if (orgId && orgId !== state.ownerOrgId) {
      await json(route, { detail: { code: "document_org_mismatch" } }, 403);
      return;
    }
    const body = readJsonBody(route);
    if (state.hashMismatch || (typeof body.content_sha256 === "string" && body.content_sha256 && body.content_sha256 !== PHASE4C2_PDF_SHA)) {
      await json(route, { detail: { code: "document_hash_mismatch" } }, 409);
      return;
    }

    if (url.includes("/fields") && method === "POST") {
      const posted = Array.isArray(body.fields) ? (body.fields as Array<{ page_index?: number }>) : [];
      if (posted.some((field) => Number(field.page_index) < 0 || Number(field.page_index) > 1)) {
        await json(route, { detail: { code: "off_page_field" } }, 400);
        return;
      }
      state.fieldSaves += 1;
      state.fieldsSaved = true;
      await json(route, { ok: true, envelope: envelope(state) });
      return;
    }
    if (url.includes("/reissue") && method === "POST") {
      state.reissueHits += 1;
      state.prepared = true;
      state.activeToken = PHASE4C2_REISSUED;
      await json(route, {
        ok: true,
        reissued: true,
        envelope: envelope(state),
        delivery: { state: "link_prepared", email: "unavailable", copied_manually: false },
        recipient_open_path: phase4c2RecipientHref(PHASE4C2_REISSUED),
      });
      return;
    }
    if (url.includes("/prepare") && method === "POST") {
      state.prepareHits += 1;
      const first = !state.prepared;
      state.prepared = true;
      await json(route, {
        ok: true,
        idempotent: !first,
        envelope: envelope(state),
        delivery: { state: "link_prepared", email: "unavailable", copied_manually: false },
        ...(first ? { recipient_open_path: phase4c2RecipientHref(state.activeToken) } : {}),
      });
      return;
    }
    if (url.includes("/copy-link") && method === "POST") {
      state.copyHits += 1;
      await json(route, {
        ok: true,
        envelope: envelope(state),
        delivery: { state: "copied_manually", email: "unavailable", copied_manually: true },
      });
      return;
    }
    if (url.includes("/owner-complete") && method === "POST") {
      const typed = String(body.signature_text || "").trim();
      const consent = body.consent === true;
      if (!consent || typed.length < 2) {
        await json(route, { detail: { code: "owner_ceremony_incomplete" } }, 400);
        return;
      }
      state.ownerCompleteHits += 1;
      state.envelopeWrites += 1;
      const already = state.signedRoles.has(OWNER_ROLE_ID);
      state.signedRoles.add(OWNER_ROLE_ID);
      const done = completion(state);
      if (done.fully_executed) state.receiptIssued = true;
      await json(route, {
        ok: true,
        already_signed: already,
        envelope: envelope(state),
        completion: done,
        receipt: done.fully_executed
          ? { receipt_id: PHASE4C2_RECEIPT_ID, receipt_hash_sha256: PHASE4C2_RECEIPT_DIGEST, kind: "uploaded_final_pdf_receipt.v1" }
          : null,
      });
      return;
    }
    if (url.includes("/receipt") && method === "GET") {
      state.receiptGets += 1;
      const done = completion(state);
      if (done.fully_executed && !state.receiptIssued) {
        await json(route, { detail: { code: "receipt_pending", completion: done, envelope: envelope(state) } }, 409);
        return;
      }
      await json(route, {
        ok: true,
        envelope: envelope(state),
        completion: done,
        document_kind: "uploaded_final_pdf",
        receipt_state: done.fully_executed && state.receiptIssued ? "issued" : null,
        receipt: done.fully_executed && state.receiptIssued
          ? { receipt_id: PHASE4C2_RECEIPT_ID, receipt_hash_sha256: PHASE4C2_RECEIPT_DIGEST, kind: "uploaded_final_pdf_receipt.v1" }
          : null,
      });
      return;
    }
    if (url.includes("/bundle") && method === "GET") {
      state.bundleGets += 1;
      if (!completion(state).fully_executed) {
        await json(route, { detail: { code: "agreement_not_fully_executed" } }, 409);
        return;
      }
      if (!state.receiptIssued) {
        await json(route, { detail: { code: "receipt_pending" } }, 409);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/zip",
        body: Buffer.from("PK\u0003\u0004quick-pdf-verification"),
      });
      return;
    }
    if (method === "POST") {
      const owner = (body.owner || {}) as { name?: string; email?: string };
      const recipient = (body.recipient || {}) as { name?: string; email?: string };
      const ownerName = String(owner.name || "").trim().toLowerCase();
      const recipName = String(recipient.name || "").trim().toLowerCase();
      if (!ownerName || ownerName === "owner" || !recipName || recipName === "recipient") {
        await json(route, { detail: { code: "invalid_party_name" } }, 400);
        return;
      }
      state.envelopeCreates += 1;
      state.envelopeWrites += 1;
      state.envelopeCreated = true;
      await json(route, { ok: true, envelope: envelope(state) });
      return;
    }
    if (method === "GET") {
      const done = state.envelopeCreated ? completion(state) : undefined;
      const issued = Boolean(done?.fully_executed && state.receiptIssued);
      await json(route, {
        ok: true,
        envelope: state.envelopeCreated ? envelope(state) : null,
        completion: done,
        receipt_state: issued ? "issued" : done?.fully_executed ? "receipt_pending" : null,
        receipt: issued
          ? { receipt_id: PHASE4C2_RECEIPT_ID, receipt_hash_sha256: PHASE4C2_RECEIPT_DIGEST, kind: "uploaded_final_pdf_receipt.v1" }
          : null,
      });
      return;
    }
  }

  if (url.includes("/api/agreements/workspace-index")) {
    await json(route, {
      ok: true,
      agreements: [
        {
          id: PHASE4C2_AGREEMENT_ID,
          title: "Uploaded final PDF — e-sign preparation",
          created_at: "2026-09-11T18:00:00.000Z",
          updated_at: "2026-09-11T18:00:00.000Z",
          party_count: 2,
          signer_count: 2,
          version_ledger_count: 0,
          completed_signed: false,
          has_server_signing_lock: true,
          locked_version_id: "lv-phase4c2-quick-pdf",
          workspace_archived_at: null,
          review_sent_at: null,
          document_kind: "uploaded_final_pdf",
          uploaded_final_pdf: {
            kind: "uploaded_final_pdf",
            document_id: PHASE4C2_DOCUMENT_ID,
            content_sha256: PHASE4C2_PDF_SHA,
            page_count: 2,
            label: "Uploaded final PDF signed through LawDog",
          },
          accepted_review_snapshot: null,
        },
      ],
      skipped: [],
    });
    return;
  }

  if (url.includes("/api/agreements/public/") && url.includes("/verify")) {
    await json(route, {
      agreement_id: PHASE4C2_AGREEMENT_ID,
      summary: { title: "Uploaded final PDF — e-sign preparation", status: "partially_signed" },
      participants: [],
      version_history: [],
      signature_status: { fully_executed: false, signatures_recorded: 1, signer_party_count: 2 },
      signature_events: [],
      verification: {
        agreement_hash: "",
        document_kind: "uploaded_final_pdf",
        accepted_review_snapshot: null,
        uploaded_final_pdf: {
          kind: "uploaded_final_pdf",
          document_id: PHASE4C2_DOCUMENT_ID,
          content_sha256: PHASE4C2_PDF_SHA,
          page_count: 2,
          label: "Uploaded final PDF signed through LawDog — not a LawDog-drafted agreement.",
        },
      },
    });
    return;
  }

  if (url.includes("/v1/sign-sessions") && method === "POST") {
    await json(route, { detail: "not_owner_unauthenticated" }, 403);
    return;
  }

  if (url.includes("/v1/subscriptions") || url.includes("/api/agreements")) {
    await json(route, { ok: true, agreements: [], subscription: { org_id: PHASE4C2_OWNER.orgId, plan_code: "pro", status: "active" } });
    return;
  }

  await json(route, { ok: true });
}
