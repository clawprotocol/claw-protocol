/** Recipient review route builders/parsers — CSS-free so coverage and Playwright can import them. */

export type RecipientLinkRole = "signer" | "reviewer" | "counterparty";

export function agreementReviewPath(agreementId: string): string {
  return `/agreements/${encodeURIComponent(agreementId)}/review`;
}

/** Review link scoped to one participant (``?p=`` party id + ``?role=``). */
export function agreementReviewPathWithParticipant(
  agreementId: string,
  partyId: string,
  role: RecipientLinkRole = "reviewer",
): string {
  const q = new URLSearchParams();
  q.set("p", partyId);
  q.set("role", role);
  return `${agreementReviewPath(agreementId)}?${q.toString()}`;
}

function parseRecipientRoleParam(search: string): RecipientLinkRole | undefined {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const r = new URLSearchParams(q).get("role")?.trim().toLowerCase();
  if (r === "signer") return "signer";
  if (r === "reviewer") return "reviewer";
  if (r === "counterparty" || r === "recipient" || r === "viewer") return "counterparty";
  return undefined;
}

/** Primary recipient deep link: ``/agreements/{id}/review?t=…`` (no account required). */
export function agreementMagicLinkPath(agreementId: string, token: string): string {
  const a = encodeURIComponent(agreementId);
  const t = encodeURIComponent(token.trim());
  return `/agreements/${a}/review?t=${t}`;
}

export function parseAgreementReviewPath(
  pathname: string,
  search: string = "",
): { agreementId: string; token?: string; role?: RecipientLinkRole; participantPartyId?: string } | null {
  const path = pathname.replace(/\/$/, "");
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const t = params.get("t") || params.get("token") || undefined;
  let m = path.match(/^\/agreements\/([^/]+)\/review$/);
  if (!m) {
    /**
     * Legacy recipient-link compatibility only:
     * `/app/agreements/:id` without a token is now treated as owner workspace v1 route.
     */
    if (!t) return null;
    m = path.match(/^\/app\/agreements\/([^/]+)$/);
  }
  if (!m) return null;
  const agreementId = decodeURIComponent(m[1]);
  const role = parseRecipientRoleParam(search);
  const p = params.get("p");
  const participantPartyId = p?.trim() ? p.trim() : undefined;
  const base = {
    agreementId,
    ...(role ? { role } : {}),
    ...(participantPartyId ? { participantPartyId } : {}),
  };
  return t ? { ...base, token: t } : base;
}
