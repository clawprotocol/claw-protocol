import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { recipientAgreementReadHeaders } from "../agreement/recipientAccessApi";

export type Vs01SensitiveReadAuth = {
  agreementId?: string | null;
  recipientAccessToken?: string | null;
  /** Include HttpOnly recipient bootstrap session cookie when true. */
  includeSessionCookie?: boolean;
};

/** Headers for owner org and/or validated recipient token reads of VS01 documents/receipts. */
export function vs01SensitiveReadHeaders(auth?: Vs01SensitiveReadAuth): HeadersInit {
  const aid = (auth?.agreementId ?? "").trim();
  const token = (auth?.recipientAccessToken ?? "").trim();
  const base = clawAgreementHeaders();
  const tokenHeaders = recipientAgreementReadHeaders(aid, token);
  return { ...base, ...tokenHeaders };
}

export function vs01SensitiveReadFetchInit(auth?: Vs01SensitiveReadAuth): RequestInit {
  const init: RequestInit = {
    headers: vs01SensitiveReadHeaders(auth),
  };
  if (auth?.includeSessionCookie) {
    init.credentials = "include";
  }
  return init;
}
