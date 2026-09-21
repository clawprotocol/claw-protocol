/** Recipient signing route builders/parsers — CSS-free so coverage and Playwright can import them. */

export type ParsedAgreementSignPath = {
  agreementId: string;
  versionId?: string;
  token?: string;
  participantPartyId?: string;
};

/**
 * Handoff URL for signers. Production: pass ``accessToken`` (HMAC minted by API).
 * Legacy: ``lockedVersionId`` query ``v=`` (fail-closed when token policy is on).
 */
export function agreementSigningPath(
  agreementId: string,
  lockedVersionId: string,
  accessToken?: string | null,
  participantPartyId?: string | null,
): string {
  const a = encodeURIComponent(agreementId);
  const q = new URLSearchParams();
  if (accessToken && accessToken.trim()) {
    q.set("t", accessToken.trim());
    if (participantPartyId?.trim()) q.set("p", participantPartyId.trim());
    return `/agreements/${a}/sign?${q.toString()}`;
  }
  q.set("v", lockedVersionId);
  if (participantPartyId?.trim()) q.set("p", participantPartyId.trim());
  return `/agreements/${a}/sign?${q.toString()}`;
}

export function parseAgreementSignPath(
  pathname: string,
  search: string = "",
): ParsedAgreementSignPath | null {
  const m = pathname.replace(/\/$/, "").match(/^\/agreements\/([^/]+)\/sign$/);
  if (!m) return null;
  const agreementId = decodeURIComponent(m[1]);
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const t = q.get("t") || q.get("token") || undefined;
  const p = q.get("p")?.trim();
  const participantPartyId = p || undefined;
  const vid = q.get("v");
  return {
    agreementId,
    ...(t ? { token: t } : {}),
    ...(vid ? { versionId: decodeURIComponent(vid) } : {}),
    ...(participantPartyId ? { participantPartyId } : {}),
  };
}
