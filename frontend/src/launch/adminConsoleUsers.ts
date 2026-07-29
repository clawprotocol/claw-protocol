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
  raw: Record<string, unknown>;
};

function strOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export function normalizeAdminConsoleUser(raw: Record<string, unknown>): AdminConsoleUserRow {
  const id = String(raw.id || "").trim();
  const orgId = strOrNull(raw.org_id) || id;
  const userId = strOrNull(raw.user_id);
  const email = strOrNull(raw.email);
  const displayName = strOrNull(raw.display_name);
  return {
    id,
    orgId,
    userId,
    email,
    displayName,
    accountStatus: String(raw.account_status || "active"),
    planType: String(raw.plan_type || "free"),
    premiumActive: Boolean(raw.premium_active),
    agreementCount: Number(raw.agreement_count || 0),
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
