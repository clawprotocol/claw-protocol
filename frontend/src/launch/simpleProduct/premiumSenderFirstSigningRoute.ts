import { agreementSigningPath } from "../../agreement/AgreementRecipientReview";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import {
  fetchRecipientAccessPolicy,
  mintRecipientAccessTokenResult,
} from "../../agreement/recipientAccessApi";
import { resolveApiBase } from "../../lib/clawApi";

const POLL_MS = 220;
const MAX_LOCK_POLLS = 18;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

/** Polls GET /api/agreements/:id until signing_lock.locked_version_id appears (persist can trail navigation). */
export async function waitForSigningLockLockedVersionId(agreementId: string): Promise<string | null> {
  for (let i = 0; i < MAX_LOCK_POLLS; i++) {
    const lv = await fetchSigningLockLockedVersionId(agreementId);
    if (lv) return lv;
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
 * Owner “sign first” after paid Pro send: same surface as counterparty signers
 * (`/agreements/:id/sign` → AgreementSignGate → AgreementRecipientReview).
 * 409 / failed mint is treated as “lock not ready or duplicate mint”; we poll GET for signing_lock
 * and prefer `agreementSigningPath` with `v=` + party when tokens are not strictly required.
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
    return {
      path: agreementSigningPath(id, d.locked_version_id.trim(), d.token.trim(), ownerPid),
      reason: "minted_sign_token",
      tokenStatus: "minted",
      lockedVersionId: d.locked_version_id.trim(),
      ownerPartyId: ownerPid,
    };
  }

  const policy = await fetchRecipientAccessPolicy();
  const tokenStrict = Boolean(policy?.recipient_link_token_required);

  const lv = await waitForSigningLockLockedVersionId(id);
  if (!lv) return null;

  if (tokenStrict) {
    const second = await mintRecipientAccessTokenResult(
      id,
      {
        mode: "sign",
        role: "signer",
        ...(ownerPid ? { recipient_party_id: ownerPid } : {}),
      },
      mintKey,
    );
    if (!second.ok) return null;
    const d = second.data;
    return {
      path: agreementSigningPath(id, d.locked_version_id.trim(), d.token.trim(), ownerPid),
      reason: "minted_after_signing_lock",
      tokenStatus: "minted_after_lock",
      lockedVersionId: d.locked_version_id.trim(),
      ownerPartyId: ownerPid,
    };
  }

  return {
    path: agreementSigningPath(id, lv, undefined, ownerPid),
    reason: "signing_lock_legacy_v_param",
    tokenStatus: "legacy_v_param",
    lockedVersionId: lv,
    ownerPartyId: ownerPid,
  };
}
