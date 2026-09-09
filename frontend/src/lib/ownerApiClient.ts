import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getCachedAccessToken, refreshCachedAccessToken } from "../auth/authAccessTokenCache";
import { apiUrl } from "./clawApi";

/**
 * Canonical request boundary for signed-in owner and paid-workspace APIs.
 * It closes cold-open token races and applies the same auth + organization
 * identity to reads, writes, and binary downloads.
 */
export async function ownerApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!getCachedAccessToken()) {
    await refreshCachedAccessToken();
  }
  return fetch(apiUrl(path), {
    ...init,
    headers: clawAgreementHeaders(init.headers),
  });
}
