import type { Vs01Counterparty, Vs01Step, Vs01RecipientPlacedField } from "./types";
import { VS01_RECIPIENT_SIGN_QUERY } from "./StepReceipt";
import { VS01_CANONICAL_PACKET_STORED_QUERY, VS01_PACKET_REVISION_QUERY } from "./vs01CanonicalPacketSeed";
import { saveRecipientMagicLinkSession } from "../agreement/recipientMagicLinkSession";
import { resolveReviewerEffectiveAccessToken } from "../agreement/reviewerTokenPersistence";

function readRecipientAccessTokenFromSearchParams(params: URLSearchParams): string {
  return (params.get("t") || params.get("token") || "").trim();
}

/** Recipient signing step (complete assigned fields), not sender field placement. */
const RECIPIENT_SIGNER_STEP = 3 as Vs01Step;

export type Vs01UrlBootstrapResult = {
  documentId: string;
  receiptId: string;
  counterparties: Vs01Counterparty[];
  step: Vs01Step;
  furthestStep: Vs01Step;
  recipientSignerMode: boolean;
  recipientIndex: number;
  recipientLockedCounterpartyId: string;
  /** From `agreement_id` query — used with {@link recipientLockedSignerRoleId} for field scoping. */
  recipientAgreementId: string;
  /** From `signer_role_id` query — optional; legacy links omit this. */
  recipientLockedSignerRoleId: string | null;
  /** Fields from {@link VS01_RECIPIENT_MANIFEST_QUERY}, rebound to the URL counterparty id. */
  recipientHydratedFields: Vs01RecipientPlacedField[];
  /** True when the manifest query param was present (may decode to zero fields). */
  recipientManifestParamPresent: boolean;
  /** Set when the manifest param could not be decoded; do not treat as “no fields”. */
  recipientManifestDecodeError: string | null;
  /** From `packet_revision` when portable packet is stored-only in URL. */
  packetRevision: string | null;
  /** True when URL references stored canonical packet (vs01_cpacket_stored=1). */
  canonicalPacketStored: boolean;
  /** Recipient access token from `t` / `token` query (stripped after bootstrap). */
  recipientAccessToken: string;
};

let memo: Vs01UrlBootstrapResult | null | undefined;

/**
 * One-time read of VS01 deep-link query params. Clears search from the URL via replaceState
 * so reload does not re-apply; safe under React StrictMode (memoized).
 */
export function getVs01UrlBootstrap(): Vs01UrlBootstrapResult | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (memo !== undefined) {
    return memo;
  }

  const params = new URLSearchParams(window.location.search);
  const documentId = (params.get("document_id") ?? "").trim();
  const receiptId = (params.get("receipt_id") ?? "").trim();
  const idxRaw = (params.get("recipient_index") ?? params.get("recipient") ?? "").trim();
  const recipientIndex = parseInt(idxRaw, 10);

  const flagRaw = (params.get(VS01_RECIPIENT_SIGN_QUERY) ?? "").trim().toLowerCase();
  const explicitRecipientSign = flagRaw === "1" || flagRaw === "true" || flagRaw === "yes";

  if (
    !explicitRecipientSign ||
    !documentId ||
    !Number.isFinite(recipientIndex) ||
    recipientIndex < 0 ||
    idxRaw === ""
  ) {
    memo = null;
    return null;
  }

  const recipientName = (params.get("recipient_name") ?? "").trim();
  const recipientEmail = (params.get("recipient_email") ?? "").trim();
  const counterpartyIdFromUrl = (params.get("counterparty_id") ?? "").trim();
  const recipientAgreementId = (params.get("agreement_id") ?? "").trim();
  const recipientLockedSignerRoleIdRaw = (params.get("signer_role_id") ?? "").trim();
  const recipientLockedSignerRoleId = recipientLockedSignerRoleIdRaw || null;
  const recipientAccessTokenFromUrl = readRecipientAccessTokenFromSearchParams(params);

  const lockedId = counterpartyIdFromUrl;

  const packetRevisionFromUrl = (params.get(VS01_PACKET_REVISION_QUERY) ?? "").trim();
  const canonicalPacketStored = params.get(VS01_CANONICAL_PACKET_STORED_QUERY) === "1";
  const recipientHydratedFields: Vs01RecipientPlacedField[] = [];
  const recipientManifestDecodeError: string | null = null;
  const recipientManifestParamPresent = false;
  const counterparties: Vs01Counterparty[] = lockedId
    ? [{ id: lockedId, name: recipientName || "Recipient", email: recipientEmail, phone: "" }]
    : [];

  const recipientAccessToken = recipientAgreementId
    ? resolveReviewerEffectiveAccessToken({
        agreementId: recipientAgreementId,
        urlToken: recipientAccessTokenFromUrl,
      }).token
    : recipientAccessTokenFromUrl;

  if (recipientAccessToken && recipientAgreementId) {
    saveRecipientMagicLinkSession({
      agreementId: recipientAgreementId,
      token: recipientAccessToken,
      recipientPartyId: lockedId || undefined,
      recipientLinkRole: "signer",
    });
  }

  memo = {
    documentId,
    receiptId,
    counterparties,
    step: RECIPIENT_SIGNER_STEP,
    furthestStep: RECIPIENT_SIGNER_STEP,
    recipientSignerMode: true,
    recipientIndex,
    recipientLockedCounterpartyId: lockedId,
    recipientAgreementId,
    recipientLockedSignerRoleId,
    recipientHydratedFields,
    recipientManifestParamPresent,
    recipientManifestDecodeError,
    packetRevision: packetRevisionFromUrl || null,
    canonicalPacketStored,
    recipientAccessToken,
  };

  const retained = new URLSearchParams();
  retained.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  retained.set("document_id", documentId);
  if (recipientAgreementId) retained.set("agreement_id", recipientAgreementId);
  retained.set("recipient_index", String(recipientIndex));
  if (lockedId) retained.set("counterparty_id", lockedId);
  if (recipientLockedSignerRoleId) retained.set("signer_role_id", recipientLockedSignerRoleId);
  if (packetRevisionFromUrl) retained.set(VS01_PACKET_REVISION_QUERY, packetRevisionFromUrl);
  const nextSearch = retained.toString();
  window.history.replaceState({}, "", `${window.location.pathname}?${nextSearch}${window.location.hash}`);

  return memo;
}

/** Test-only: clear one-time URL bootstrap memo. */
export function resetVs01UrlBootstrapForTests(): void {
  memo = undefined;
}
