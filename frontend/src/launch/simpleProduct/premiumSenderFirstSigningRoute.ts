import { agreementSigningPath } from "../../agreement/AgreementRecipientReview";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { fetchWorkspaceIndex } from "../../agreement/agreementWorkspaceApi";
import {
  fetchRecipientAccessPolicy,
  mintRecipientAccessTokenResult,
} from "../../agreement/recipientAccessApi";
import { resolveApiBase } from "../../lib/clawApi";

const POLL_MS = 280;
const MAX_LOCK_POLLS = 42;

/**
 * Regression / doc anchor for QA: **agreements** product professional signing is the HTML ceremony at
 * `/agreements/:id/sign` → `AgreementSignGate` → `AgreementRecipientReview` (`entry.kind === "sign"`, typed-name
 * ceremony + `postSigningCeremonyComplete`). DocuSign-style **PDF field placement** (initials on every page,
 * printed name stamps, etc.) lives in **Vs01** (`RecipientSigningView` / `StepPrepareSignature`) under
 * `/app/quick` and `/app/esign/:seedDocumentId` — not wired to agreement IDs today.
 */
export const SENDER_FIRST_PROFESSIONAL_AGREEMENT_SIGNING_REGRESSION =
  "/agreements/:id/sign→AgreementSignGate→AgreementRecipientReview(kind=sign)";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function devSenderFirstProfessionalRoute(payload: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[sender-first-professional-esign-route]", payload);
  }
}

async function fetchSigningLockLockedVersionId(agreementId: string): Promise<string | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const res = await fetch(`${resolveApiBase()}/api/agreements/${encodeURIComponent(id)}`, {
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) return null;
    const pl = (await res.json()) as Record<string, unknown>;
    const sl = pl.signing_lock as Record<string, unknown> | null | undefined;
    const lv =
      sl && typeof sl.locked_version_id === "string" && sl.locked_version_id.trim()
        ? sl.locked_version_id.trim()
        : "";
    return lv || null;
  } catch {
    return null;
  }
}

async function fetchLockedVersionFromWorkspaceIndex(agreementId: string): Promise<string | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const { agreements, error } = await fetchWorkspaceIndex();
    if (error || !agreements?.length) return null;
    const row = agreements.find((a) => a.id === id);
    if (!row?.has_server_signing_lock) return null;
    const lv = (row.locked_version_id || "").trim();
    return lv || null;
  } catch {
    return null;
  }
}

/**
 * Polls GET `/api/agreements/:id` and periodically `workspace-index` until `locked_version_id` appears
 * (persist can trail navigation; index sometimes reflects lock when full GET omits it briefly).
 */
export async function waitForSigningLockLockedVersionId(agreementId: string): Promise<string | null> {
  const id = agreementId.trim();
  for (let i = 0; i < MAX_LOCK_POLLS; i++) {
    const fromGet = await fetchSigningLockLockedVersionId(agreementId);
    if (fromGet) {
      if (import.meta.env.DEV && i > 0) {
        devSenderFirstProfessionalRoute({
          event: "lock_observed_after_poll",
          agreementId: id,
          attempt: i + 1,
          source: "get_agreement",
          lockedVersionId: fromGet,
        });
      }
      return fromGet;
    }
    if (i % 2 === 1) {
      const fromIdx = await fetchLockedVersionFromWorkspaceIndex(agreementId);
      if (fromIdx) {
        devSenderFirstProfessionalRoute({
          event: "lock_from_workspace_index",
          agreementId: id,
          attempt: i + 1,
          lockedVersionId: fromIdx,
        });
        return fromIdx;
      }
    }
    if (i < MAX_LOCK_POLLS - 1) await sleep(POLL_MS);
  }
  return null;
}

export type PremiumSenderFirstSigningResolution = {
  path: string;
  reason: string;
  tokenStatus: "minted" | "minted_after_lock" | "legacy_v_param";
  lockedVersionId: string;
  ownerPartyId?: string | null;
};

function mintKeyFromEnv(): string {
  return (
    (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env
      ?.VITE_RECIPIENT_LINK_MINT_KEY || ""
  );
}

/**
 * Owner “sign first” after paid Pro send: **agreements** professional signing surface
 * (`/agreements/:id/sign` → AgreementSignGate → AgreementRecipientReview `kind: "sign"`).
 * `POST …/recipient-access-token` **409** (`signing_not_finalized_server_side`, etc.) is recoverable: poll until
 * signing lock / workspace index exposes `locked_version_id`, then mint again when tokens are required or use
 * `v=` + party when policy allows.
 */
export async function resolvePremiumSenderFirstSigningPath(params: {
  agreementId: string;
  ownerPartyId?: string | null;
}): Promise<PremiumSenderFirstSigningResolution | null> {
  const id = params.agreementId.trim();
  if (!id) return null;
  const mintKey = mintKeyFromEnv();
  const ownerPid = params.ownerPartyId?.trim() || undefined;

  const firstMint = await mintRecipientAccessTokenResult(
    id,
    {
      mode: "sign",
      role: "signer",
      ...(ownerPid ? { recipient_party_id: ownerPid } : {}),
    },
    mintKey,
  );
  if (firstMint.ok) {
    const d = firstMint.data;
    const path = agreementSigningPath(id, d.locked_version_id.trim(), d.token.trim(), ownerPid);
    devSenderFirstProfessionalRoute({
      agreementId: id,
      ownerPartyId: ownerPid ?? null,
      route: path,
      tokenStatus: "minted",
      lockedVersionId: d.locked_version_id.trim(),
      reason: "minted_sign_token",
    });
    return {
      path,
      reason: "minted_sign_token",
      tokenStatus: "minted",
      lockedVersionId: d.locked_version_id.trim(),
      ownerPartyId: ownerPid,
    };
  }

  if (import.meta.env.DEV) {
    devSenderFirstProfessionalRoute({
      agreementId: id,
      ownerPartyId: ownerPid ?? null,
      event: "mint_non_ok_will_poll",
      httpStatus: firstMint.ok ? 200 : firstMint.status,
      detail: !firstMint.ok ? firstMint.detail : undefined,
      recoverable: !firstMint.ok && firstMint.status === 409,
      lockedVersionId: null,
      reason: "await_signing_lock",
    });
  }

  const policy = await fetchRecipientAccessPolicy();
  const tokenStrict = Boolean(policy?.recipient_link_token_required);

  const lv = await waitForSigningLockLockedVersionId(id);
  if (!lv) {
    devSenderFirstProfessionalRoute({
      agreementId: id,
      ownerPartyId: ownerPid ?? null,
      event: "fallback_blocked_no_lock",
      route: null,
      tokenStatus: !firstMint.ok ? String(firstMint.status) : "unknown",
      lockedVersionId: null,
      reason: "no_locked_version_after_poll",
    });
    return null;
  }

  if (!firstMint.ok && firstMint.status === 409) {
    devSenderFirstProfessionalRoute({
      agreementId: id,
      ownerPartyId: ownerPid ?? null,
      event: "recovered_after_mint_409",
      lockedVersionId: lv,
      tokenStrict,
      reason: "signing_lock_ready",
    });
  }

  if (tokenStrict) {
    let last = await mintRecipientAccessTokenResult(
      id,
      {
        mode: "sign",
        role: "signer",
        ...(ownerPid ? { recipient_party_id: ownerPid } : {}),
      },
      mintKey,
    );
    for (let attempt = 1; attempt < 6 && !last.ok; attempt++) {
      devSenderFirstProfessionalRoute({
        agreementId: id,
        ownerPartyId: ownerPid ?? null,
        event: "strict_token_remint_retry",
        attempt,
        httpStatus: last.status,
        lockedVersionId: lv,
      });
      await sleep(380);
      last = await mintRecipientAccessTokenResult(
        id,
        {
          mode: "sign",
          role: "signer",
          ...(ownerPid ? { recipient_party_id: ownerPid } : {}),
        },
        mintKey,
      );
    }
    if (!last.ok) {
      devSenderFirstProfessionalRoute({
        agreementId: id,
        ownerPartyId: ownerPid ?? null,
        event: "fallback_blocked_remint_failed",
        route: null,
        tokenStatus: String(last.status),
        lockedVersionId: lv,
        reason: "recipient_token_required_remint_exhausted",
      });
      return null;
    }
    const d = last.data;
    const path = agreementSigningPath(id, d.locked_version_id.trim(), d.token.trim(), ownerPid);
    devSenderFirstProfessionalRoute({
      agreementId: id,
      ownerPartyId: ownerPid ?? null,
      route: path,
      tokenStatus: "minted_after_lock",
      lockedVersionId: d.locked_version_id.trim(),
      reason: "minted_after_signing_lock",
    });
    return {
      path,
      reason: "minted_after_signing_lock",
      tokenStatus: "minted_after_lock",
      lockedVersionId: d.locked_version_id.trim(),
      ownerPartyId: ownerPid,
    };
  }

  const path = agreementSigningPath(id, lv, undefined, ownerPid);
  devSenderFirstProfessionalRoute({
    agreementId: id,
    ownerPartyId: ownerPid ?? null,
    route: path,
    tokenStatus: "legacy_v_param",
    lockedVersionId: lv,
    reason: "signing_lock_legacy_v_param",
  });
  return {
    path,
    reason: "signing_lock_legacy_v_param",
    tokenStatus: "legacy_v_param",
    lockedVersionId: lv,
    ownerPartyId: ownerPid,
  };
}
