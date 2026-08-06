/**
 * Admin Console Users helpers — identity display + search for safe Genesis grants.
 * Operates only on privileged /v1/admin/users payloads (no agreement bodies).
 */

export type AdminConsoleUserRow = {
  id: string;
  orgId: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  accountStatus: string;
  planType: string;
  premiumActive: boolean;
  agreementCount: number;
  /** Operator-facing access type: genesis_dog | paid_pro | pending_genesis | guest | free */
  accessType: string | null;
  commercialState: string | null;
  commercialGrantSource: string | null;
  agreementAllowance: number | null;
  agreementsUsed: number | null;
  agreementsRemaining: number | null;
  periodEndsAt: string | null;
  canCreatePersistedAgreement: boolean;
  raw: Record<string, unknown>;
};

function strOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAdminConsoleUser(raw: Record<string, unknown>): AdminConsoleUserRow {
  const id = String(raw.id || "").trim();
  const orgId = strOrNull(raw.org_id) || id;
  const userId = strOrNull(raw.user_id);
  const email = strOrNull(raw.email);
  const displayName = strOrNull(raw.display_name);
  const agreementCount = Number(raw.agreement_count || 0);
  return {
    id,
    orgId,
    userId,
    email,
    displayName,
    accountStatus: String(raw.account_status || "active"),
    planType: String(raw.plan_type || "free"),
    premiumActive: Boolean(raw.premium_active),
    agreementCount,
    accessType: strOrNull(raw.access_type),
    commercialState: strOrNull(raw.commercial_state),
    commercialGrantSource: strOrNull(raw.commercial_grant_source),
    agreementAllowance: numOrNull(raw.agreement_allowance),
    agreementsUsed: numOrNull(raw.agreements_used) ?? agreementCount,
    agreementsRemaining: numOrNull(raw.agreements_remaining),
    periodEndsAt: strOrNull(raw.period_ends_at),
    canCreatePersistedAgreement: Boolean(raw.can_create_persisted_agreement),
    raw,
  };
}

/** Target id for Genesis grant/revoke — prefer stable auth user id. */
export function adminConsoleGenesisTargetId(user: AdminConsoleUserRow): string {
  return (user.userId || user.id || "").trim();
}

export function adminConsoleUserSearchHaystack(user: AdminConsoleUserRow): string {
  return [user.email, user.displayName, user.userId, user.orgId, user.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function adminConsoleUserMatchesQuery(user: AdminConsoleUserRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // Exact email match when the query looks like an address — preserves Gmail plus-aliases
  // (no normalization that strips +tag) and avoids accidental substring hits.
  if (q.includes("@")) {
    const email = (user.email || "").trim().toLowerCase();
    return email === q;
  }
  return adminConsoleUserSearchHaystack(user).includes(q);
}

export function filterAdminConsoleUsers(
  users: AdminConsoleUserRow[],
  query: string,
): AdminConsoleUserRow[] {
  const q = query.trim();
  if (!q) return users;
  return users.filter((u) => adminConsoleUserMatchesQuery(u, q));
}
