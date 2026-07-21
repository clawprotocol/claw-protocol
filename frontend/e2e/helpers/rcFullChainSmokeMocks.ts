/**
 * RC Journey 7 Smoke — mocked authority helpers only.
 * Do not use in authority-certification journeys.
 */
import { expect, type Page } from "@playwright/test";
import type { PublicVerifyPayload } from "../../src/agreement/agreementPublicVerify";
import type { RcDraftRecord } from "./rcPaidProApiMocks";

export type RcFullChainSmokeState = {
  anonAgreementId: string;
  ownedAgreementId: string;
  drafts: Map<string, RcDraftRecord>;
  fullyExecuted: boolean;
  signaturesRecorded: number;
  signerPartyCount: number;
};

export function buildSmokePublicVerifyPayload(state: RcFullChainSmokeState): PublicVerifyPayload {
  const draft = state.drafts.get(state.ownedAgreementId);
  const now = new Date().toISOString();
  return {
    agreement_id: state.ownedAgreementId,
    summary: {
      title: draft?.title ?? "Professional Services Agreement",
      status: state.fullyExecuted ? "fully_executed" : "signing_in_progress",
      created_at: draft?.created_at ?? now,
      updated_at: now,
    },
    participants: (draft?.parties ?? []).map((p) => ({ name: p.name, role: p.role })),
    version_history: [{ version: 1, created_at: now, version_hash: "smoke_v1" }],
    signature_status: {
      fully_executed: state.fullyExecuted,
      signatures_recorded: state.signaturesRecorded,
      signer_party_count: state.signerPartyCount,
    },
    signature_events: [],
    verification: { agreement_hash: "smoke_agreement_hash", schema: "claw.agreement.public_verify/v1" },
  };
}

export async function installRcFullChainSmokeExtensions(page: Page, state: RcFullChainSmokeState): Promise<void> {
  await page.route(/\/(v1\/billing\/|public\/.*\/verify)/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/v1/billing/verify-checkout-session") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          subscription: { plan_code: "pro", status: "active" },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/public/") && url.includes("/verify") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildSmokePublicVerifyPayload(state)),
      });
      return;
    }

    await route.fallback();
  });
}

/** Smoke-only ownership simulation — bypasses finalize-auth / bind-user-org. */
export async function seedRcFullChainSmokeOwnership(
  page: Page,
  args: { priorId: string; canonicalId: string },
): Promise<void> {
  await page.evaluate(
    ({ priorId, canonicalId }) => {
      try {
        sessionStorage.setItem("claw_agreement_create_review_resume_v1", canonicalId);
        sessionStorage.setItem(
          "claw_ownership_migration_receipt_v1",
          JSON.stringify({
            canonicalAgreementId: canonicalId,
            migratedAgreementIds: [canonicalId],
            supersededAgreementIds: priorId !== canonicalId ? [priorId] : [],
            migrationEpoch: Date.now(),
          }),
        );
      } catch {
        /* ignore */
      }
    },
    args,
  );
}

export async function assertSmokeOwnershipReceipt(page: Page, canonicalId: string): Promise<void> {
  const resumeId = await page.evaluate(() => sessionStorage.getItem("claw_agreement_create_review_resume_v1"));
  expect(resumeId).toBe(canonicalId);
}

/** Smoke-only completed state — not executed-artifact authority. */
export function markRcFullChainSmokeCompletedState(state: RcFullChainSmokeState): void {
  state.signaturesRecorded = state.signerPartyCount;
  state.fullyExecuted = true;
  const now = new Date().toISOString();
  let draft = state.drafts.get(state.ownedAgreementId);
  if (!draft) {
    draft = {
      id: state.ownedAgreementId,
      title: "Professional Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      purpose: "Professional services.",
      payment_terms: "$96,000",
      duration: "12 months",
      due_date: null,
      effective_date: "2026-01-01",
      versions: [{ version: 1, created_at: now, note: "created" }],
      audit_log: [],
      created_at: now,
      updated_at: now,
    };
  }
  draft.audit_log.push({ event_type: "signature_completed", at: now, value: { fully_executed: true } });
  draft.updated_at = now;
  state.drafts.set(state.ownedAgreementId, draft);
}
