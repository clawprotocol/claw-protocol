/**
 * Admin Console — present per-user audited actions (Genesis grant/revoke/reset, etc.).
 */

export type AdminConsoleUserHistoryAction = {
  id: string;
  actionType: string;
  reason: string | null;
  adminUserId: string | null;
  actorRole: string | null;
  createdAt: string | null;
  agreementsUsedBefore: number | null;
  agreementsUsedAfter: number | null;
  refundedCount: number | null;
  dryRun: boolean;
  createdSource: string | null;
  raw: Record<string, unknown>;
};

export type AdminConsoleUserHistoryPresentation = {
  title: string;
  detailLine: string;
  metaLine: string;
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

export function normalizeAdminConsoleUserHistoryAction(
  raw: Record<string, unknown>,
): AdminConsoleUserHistoryAction {
  return {
    id: String(raw.id || "").trim(),
    actionType: String(raw.action_type || "").trim(),
    reason: strOrNull(raw.reason),
    adminUserId: strOrNull(raw.admin_user_id),
    actorRole: strOrNull(raw.actor_role),
    createdAt: strOrNull(raw.created_at),
    agreementsUsedBefore: numOrNull(raw.agreements_used_before),
    agreementsUsedAfter: numOrNull(raw.agreements_used_after),
    refundedCount: numOrNull(raw.refunded_count),
    dryRun: Boolean(raw.dry_run),
    createdSource: strOrNull(raw.created_source),
    raw,
  };
}

function formatWhen(iso: string | null): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function presentAdminConsoleUserHistoryAction(
  action: AdminConsoleUserHistoryAction,
): AdminConsoleUserHistoryPresentation {
  const type = action.actionType;
  let title = type || "Admin action";
  let detailLine = action.reason || "No reason recorded";

  if (type === "user_created") {
    title = "User created";
    const source = action.createdSource ? ` · source=${action.createdSource}` : "";
    detailLine = `${action.reason || "LawDog account first recorded"}${source}`;
    return {
      title,
      detailLine,
      metaLine: `Account created · ${formatWhen(action.createdAt)}`,
    };
  }
  if (type === "genesis_usage_reconcile") {
    title = action.dryRun ? "Reset Genesis monthly usage (dry run)" : "Reset Genesis monthly usage";
    const parts: string[] = [];
    if (action.agreementsUsedBefore != null || action.agreementsUsedAfter != null) {
      parts.push(
        `used ${action.agreementsUsedBefore ?? "?"} → ${action.agreementsUsedAfter ?? "?"}`,
      );
    }
    if (action.refundedCount != null) {
      parts.push(
        `refunded ${action.refundedCount} meter row${action.refundedCount === 1 ? "" : "s"}`,
      );
    }
    if (action.reason) parts.push(action.reason);
    detailLine = parts.join(" · ") || detailLine;
  } else if (type === "genesis_entitlement_grant") {
    title = "Grant Genesis Dog";
  } else if (type === "genesis_entitlement_revoke") {
    title = "Revoke Genesis Dog";
  } else if (type === "set_user_status") {
    title = "Account status change";
  } else if (type === "refresh_entitlement") {
    title = "Refresh entitlement";
  }

  const actor = action.adminUserId || "unknown";
  const role = action.actorRole ? ` (${action.actorRole})` : "";
  const metaLine = `by ${actor}${role} · ${formatWhen(action.createdAt)}`;

  return { title, detailLine, metaLine };
}
