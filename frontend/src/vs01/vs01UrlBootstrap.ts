import type { Vs01Counterparty, Vs01Step, Vs01RecipientPlacedField } from "./types";
import { VS01_RECIPIENT_SIGN_QUERY } from "./StepReceipt";
import {
  decodeRecipientManifestParam,
  ensureRecipientFieldDefaults,
  rebindRecipientFieldsToCounterparty,
  VS01_RECIPIENT_MANIFEST_QUERY,
} from "./recipientManifestUrl";

function newCpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
  recipientLockedCounterpartyId: string;
  /** Fields from {@link VS01_RECIPIENT_MANIFEST_QUERY}, rebound to the URL counterparty id. */
  recipientHydratedFields: Vs01RecipientPlacedField[];
  /** True when the manifest query param was present (may decode to zero fields). */
  recipientManifestParamPresent: boolean;
  /** Set when the manifest param could not be decoded; do not treat as “no fields”. */
  recipientManifestDecodeError: string | null;
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
    !receiptId ||
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

  const counterparties: Vs01Counterparty[] = [];
  for (let i = 0; i < recipientIndex; i++) {
    counterparties.push({ id: newCpId(), name: "", email: "", phone: "" });
  }
  const lockedId = counterpartyIdFromUrl || newCpId();
  counterparties.push({
    id: lockedId,
    name: recipientName || "Recipient",
    email: recipientEmail,
    phone: "",
  });

  const manifestRaw = params.get(VS01_RECIPIENT_MANIFEST_QUERY);
  const recipientManifestParamPresent = manifestRaw !== null;
  const decoded = decodeRecipientManifestParam(manifestRaw);

  let recipientHydratedFields: Vs01RecipientPlacedField[] = [];
  let recipientManifestDecodeError: string | null = null;

  if (decoded.ok) {
    recipientHydratedFields = ensureRecipientFieldDefaults(
      rebindRecipientFieldsToCounterparty(decoded.fields, lockedId),
      recipientName || "Recipient"
    );
  } else {
    recipientManifestDecodeError = decoded.error;
  }

  memo = {
    documentId,
    receiptId,
    counterparties,
    step: RECIPIENT_SIGNER_STEP,
    furthestStep: RECIPIENT_SIGNER_STEP,
    recipientSignerMode: true,
    recipientLockedCounterpartyId: lockedId,
    recipientHydratedFields,
    recipientManifestParamPresent,
    recipientManifestDecodeError,
  };

  const path = window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", path);

  return memo;
}
