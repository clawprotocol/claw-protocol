/**
 * Phase 4B.3 public-verify fixtures.
 * Deterministic public payloads only — no owner JWT, recipient token, or private paper.
 */
import type { Page, Route } from "@playwright/test";
import {
  PHASE4A_FEE,
  PHASE4A_LAW,
  PHASE4A_PARTY_0,
  PHASE4A_PARTY_1,
  PHASE4A_TITLE,
} from "../phase4a/phase4aPaidOwnerFixtures";
import type { PublicVerifyPayload } from "../../src/agreement/agreementPublicVerify";
import {
  phase4b3CanonicalVerifyPath,
  phase4b3LegacyVerifyPath,
} from "../../src/launch/phase4b3PublicVerifyCoverage";

export const PHASE4B3_LOCKED_ID = "ag-phase4b3-locked";
export const PHASE4B3_PARTIAL_ID = "ag-phase4b3-partial";
export const PHASE4B3_EXECUTED_ID = "ag-phase4b3-executed";
export const PHASE4B3_PENDING_ID = "ag-phase4b3-pending";
export const PHASE4B3_FORGED_ID = "ag-phase4b3-forged";
export const PHASE4B3_DIGEST_ID = "ag-phase4b3-digest";
export const PHASE4B3_COUNT_ID = "ag-phase4b3-count";
export const PHASE4B3_MISSING_ID = "ag-phase4b3-missing";

export const PHASE4B3_TITLE = PHASE4A_TITLE;
export const PHASE4B3_PARTY_0_NAME = PHASE4A_PARTY_0;
export const PHASE4B3_PARTY_1_NAME = PHASE4A_PARTY_1;
export const PHASE4B3_LAW = PHASE4A_LAW;
export const PHASE4B3_PARTY_0 = "p-orion";
export const PHASE4B3_PARTY_1 = "p-contoso";
export const PHASE4B3_SIGNER_ROLE_0 = "sr-orion-ceo";
export const PHASE4B3_SIGNER_ROLE_1 = "sr-contoso-gc";
export const PHASE4B3_LOCKED_VERSION = "lv-phase4b3-orion-v1";
export const PHASE4B3_OVERVIEW_HASH = "aa".repeat(32);
export const PHASE4B3_COMMITMENT = "bb".repeat(32);
export const PHASE4B3_SNAP_SHA = "cc".repeat(32);
export const PHASE4B3_PACKET_SHA = "dd".repeat(32);
export const PHASE4B3_VERSION_HASH = "ee".repeat(32);

/** Private material the public handler must never return or paint. */
export const PHASE4B3_PRIVATE = {
  body: "SAAS SUBSCRIPTION AGREEMENT This Agreement is entered into by and between Orion Labs LLC",
  purpose: "Hosted SaaS subscription and onboarding for Contoso retail stores.",
  payment: PHASE4A_FEE,
  email: "alex.rivera@orion-labs.example",
  address: "100 Orion Way, New York, NY 10001",
  hmac: "hmac-phase4b3-secret-must-not-leak",
  ownerToken: "owner-jwt-phase4b3-must-not-leak",
  recipientToken: "tok-phase4b3-recipient-must-not-leak",
} as const;

export const OWNER_ONLY_API = /workspace-index|\/v1\/subscriptions|usage\/summary|recipient-access-token/;

export type Phase4b3FixtureState = {
  failGets: boolean;
  verifyHits: string[];
  ownerOnlyHits: string[];
  pdfHits: string[];
};

export function createPhase4b3FixtureState(): Phase4b3FixtureState {
  return { failGets: false, verifyHits: [], ownerOnlyHits: [], pdfHits: [] };
}

function basePayload(id: string, extras: Partial<PublicVerifyPayload> = {}): PublicVerifyPayload {
  return {
    agreement_id: id,
    summary: {
      title: PHASE4B3_TITLE,
      jurisdiction: PHASE4B3_LAW,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-10T16:00:00.000Z",
      status: "locked_for_signing",
    },
    participants: [
      { name: PHASE4B3_PARTY_0_NAME, role: "Provider" },
      { name: PHASE4B3_PARTY_1_NAME, role: "Customer" },
    ],
    version_history: [
      {
        version: 1,
        created_at: "2026-09-01T00:00:00.000Z",
        version_hash: PHASE4B3_VERSION_HASH,
        note: "Commercial fee $180,000 — must not paint",
      },
    ],
    signature_status: {
      fully_executed: false,
      signatures_recorded: 0,
      signer_party_count: 2,
      locked_version_id: PHASE4B3_LOCKED_VERSION,
      signing_commitment_hash: PHASE4B3_COMMITMENT,
    },
    signature_events: [],
    verification: {
      agreement_hash: PHASE4B3_OVERVIEW_HASH,
      signing_commitment_hash: PHASE4B3_COMMITMENT,
      schema: "claw.agreement.public_verify/v1",
      envelope_attestation_valid: true,
      accepted_review_snapshot: {
        snapshot_id: `crs-${id}`,
        corpus_sha256: PHASE4B3_SNAP_SHA,
        corpus_length: 1636,
      },
      envelope_provenance: {
        acceptedSoTDigest: PHASE4B3_SNAP_SHA,
        acceptedSoTLength: 1636,
        packetDigest: PHASE4B3_PACKET_SHA,
      },
    },
    ...extras,
  };
}

function executedPayload(id: string): PublicVerifyPayload {
  return basePayload(id, {
    summary: {
      title: PHASE4B3_TITLE,
      jurisdiction: PHASE4B3_LAW,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-10T16:05:00.000Z",
      status: "fully_executed",
    },
    signature_status: {
      fully_executed: true,
      signatures_recorded: 2,
      signer_party_count: 2,
      locked_version_id: PHASE4B3_LOCKED_VERSION,
      signing_commitment_hash: PHASE4B3_COMMITMENT,
    },
    signature_events: [
      {
        event_type: "signed",
        at: "2026-09-10T16:01:00.000Z",
        participant_id: PHASE4B3_PARTY_0,
        signer_role_id: PHASE4B3_SIGNER_ROLE_0,
        participant_display_name: PHASE4B3_PARTY_0_NAME,
        locked_version_id: PHASE4B3_LOCKED_VERSION,
      },
      {
        event_type: "signed",
        at: "2026-09-10T16:05:00.000Z",
        participant_id: PHASE4B3_PARTY_1,
        signer_role_id: PHASE4B3_SIGNER_ROLE_1,
        participant_display_name: PHASE4B3_PARTY_1_NAME,
        locked_version_id: PHASE4B3_LOCKED_VERSION,
        fully_executed: true,
      },
    ],
  });
}

export function phase4b3PublicVerifyPayload(agreementId: string): PublicVerifyPayload | null {
  if (agreementId === PHASE4B3_LOCKED_ID) {
    return basePayload(agreementId, { summary: { ...basePayload(agreementId).summary, status: "locked_for_signing" } });
  }
  if (agreementId === PHASE4B3_PARTIAL_ID) {
    return basePayload(agreementId, {
      summary: { ...basePayload(agreementId).summary, status: "partially_signed" },
      signature_status: {
        fully_executed: false,
        signatures_recorded: 1,
        signer_party_count: 2,
        locked_version_id: PHASE4B3_LOCKED_VERSION,
        signing_commitment_hash: PHASE4B3_COMMITMENT,
      },
      signature_events: [
        {
          event_type: "signed",
          at: "2026-09-10T16:01:00.000Z",
          participant_id: PHASE4B3_PARTY_0,
          signer_role_id: PHASE4B3_SIGNER_ROLE_0,
          participant_display_name: PHASE4B3_PARTY_0_NAME,
        },
      ],
    });
  }
  if (agreementId === PHASE4B3_EXECUTED_ID) return executedPayload(agreementId);
  if (agreementId === PHASE4B3_PENDING_ID) {
    return {
      agreement_id: agreementId,
      record_status: "pending",
      record_status_reason: "verification_bundle_incomplete",
      summary: {
        title: PHASE4B3_TITLE,
        jurisdiction: PHASE4B3_LAW,
        status: "locked_for_signing",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-10T16:00:00.000Z",
      },
      participants: [
        { name: PHASE4B3_PARTY_0_NAME, role: "Provider" },
        { name: PHASE4B3_PARTY_1_NAME, role: "Customer" },
      ],
      version_history: [],
      signature_status: {
        fully_executed: false,
        signatures_recorded: 0,
        signer_party_count: 2,
        locked_version_id: null,
        signing_commitment_hash: null,
      },
      signature_events: [],
      verification: {
        agreement_hash: "",
        signing_commitment_hash: null,
        schema: "claw.agreement.public_verify/v1",
        record_note: "Public verification details are still preparing.",
      },
    };
  }
  if (agreementId === PHASE4B3_FORGED_ID) {
    const row = executedPayload(agreementId);
    return {
      ...row,
      verification: {
        ...row.verification,
        envelope_attestation_valid: false,
        envelope_attestation_reason: "envelope_mac_mismatch",
        envelope_provenance: null,
      },
    };
  }
  if (agreementId === PHASE4B3_DIGEST_ID) {
    const row = executedPayload(agreementId);
    return {
      ...row,
      verification: {
        ...row.verification,
        envelope_attestation_valid: false,
        envelope_attestation_reason: "accepted_snapshot_digest_mismatch",
        accepted_review_snapshot: null,
        envelope_provenance: {
          acceptedSoTDigest: "ff".repeat(32),
          packetDigest: PHASE4B3_PACKET_SHA,
        },
      },
    };
  }
  if (agreementId === PHASE4B3_COUNT_ID) {
    const row = executedPayload(agreementId);
    return {
      ...row,
      signature_status: {
        ...row.signature_status,
        signatures_recorded: 1,
        signer_party_count: 2,
      },
    };
  }
  return null;
}

export function canonicalVerifyHref(agreementId: string): string {
  return phase4b3CanonicalVerifyPath(agreementId);
}

export function legacyVerifyHref(agreementId: string): string {
  return phase4b3LegacyVerifyPath(agreementId);
}

export async function seedPhase4b3PublicVerify(page: Page, state: Phase4b3FixtureState): Promise<void> {
  await page.route(/\/api\/agreements\/public\/[^/]+\/verify(?:\?|$)/, async (route: Route) => {
    const url = route.request().url();
    const id = decodeURIComponent(url.match(/\/public\/([^/]+)\/verify/)?.[1] || "");
    state.verifyHits.push(id);
    if (state.failGets) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
      return;
    }
    const payload = phase4b3PublicVerifyPayload(id);
    if (!payload) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "agreement_not_found" } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route(/completed-signed-export-pdf/, async (route: Route) => {
    state.pdfHits.push(route.request().url());
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: "forbidden" }) });
  });
  await page.route(OWNER_ONLY_API, async (route: Route) => {
    state.ownerOnlyHits.push(route.request().url());
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
}
