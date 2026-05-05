export type MintRecipientAccessTokenSuccess = {
  /** Opaque token for magic-link path when server returns a bare token. */
  token?: string;
  expires_in_seconds: number;
  locked_version_id: string;
  /** Absolute or site-relative URL when server returns a ready-to-share review link. */
  review_url?: string;
};

function coalesceTrimmedString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return "";
}

function partyIdsMatch(rowParty: unknown, requested?: string): boolean {
  const req = (requested || "").trim();
  if (!req) return false;
  if (!rowParty || typeof rowParty !== "object") return false;
  const o = rowParty as Record<string, unknown>;
  const id = coalesceTrimmedString(o.party_id, o.recipient_party_id, o.id, o.partyId);
  return Boolean(id && id === req);
}

/**
 * Normalize POST /recipient-access-token JSON across backend variants so a 200 with an alternate
 * shape still yields a usable token and/or ready-to-share review URL.
 */
export function normalizeMintRecipientAccessTokenBody(
  raw: unknown,
  requestedRecipientPartyId?: string,
): MintRecipientAccessTokenSuccess | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested = o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;

  let reviewUrl = coalesceTrimmedString(
    o.reviewUrl,
    o.review_url,
    o.magic_link,
    o.magicLink,
    o.link,
    nested?.reviewUrl,
    nested?.review_url,
    nested?.magic_link,
    nested?.link,
  );

  const links = o.links;
  if (!reviewUrl && Array.isArray(links)) {
    for (const entry of links) {
      if (!entry || typeof entry !== "object") continue;
      const l = entry as Record<string, unknown>;
      const u = coalesceTrimmedString(l.url, l.review_url, l.reviewUrl, l.href, l.link, l.magic_link);
      if (u) {
        reviewUrl = u;
        break;
      }
    }
  }

  const recipients = o.recipients;
  if (!reviewUrl && Array.isArray(recipients)) {
    for (const row of recipients) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (requestedRecipientPartyId && !partyIdsMatch(row, requestedRecipientPartyId)) continue;
      const u = coalesceTrimmedString(r.reviewUrl, r.review_url, r.url, r.link, r.magic_link, r.href);
      if (u) {
        reviewUrl = u;
        break;
      }
    }
  }

  const token = coalesceTrimmedString(
    o.token,
    o.access_token,
    o.recipient_token,
    o.recipientToken,
    nested?.token,
    nested?.access_token,
    nested?.recipient_token,
  );

  let locked = coalesceTrimmedString(
    o.locked_version_id,
    o.lockedVersionId,
    o.version_id,
    o.versionId,
    nested?.locked_version_id,
    nested?.lockedVersionId,
  );
  if (!locked) locked = "unknown";

  const expRaw = nested?.expires_in_seconds ?? o.expires_in_seconds;
  const expires =
    typeof expRaw === "number" && Number.isFinite(expRaw) && expRaw > 0 ? expRaw : 3600;

  if (!token && !reviewUrl) return null;

  const out: MintRecipientAccessTokenSuccess = {
    expires_in_seconds: expires,
    locked_version_id: locked,
  };
  if (token) out.token = token;
  if (reviewUrl) out.review_url = reviewUrl;
  return out;
}
