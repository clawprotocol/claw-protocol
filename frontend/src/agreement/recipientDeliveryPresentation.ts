import type { RecipientDeliveryRow, RecipientDeliveryStatusKind } from "./recipientDeliveryStatus";

export function recipientDeliveryStatusLabel(status: RecipientDeliveryStatusKind): string {
  switch (status) {
    case "not_sent":
      return "Not sent";
    case "sent":
      return "Sent";
    case "opened":
      return "Opened";
    case "approved":
      return "Approved";
    case "signed":
      return "Signed";
    case "replaced":
      return "Replaced";
    case "blocked":
      return "Blocked";
    default:
      return status;
  }
}

export function recipientDeliveryRoleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "reviewer") return "Reviewer";
  if (r === "signer") return "Signer";
  if (r === "counterparty") return "Counterparty";
  return role || "Party";
}

export function formatRecipientDeliveryTimestamp(iso: string | null | undefined): string {
  const raw = (iso ?? "").trim();
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function recipientDisplayName(row: RecipientDeliveryRow): string {
  const entity = row.entity_name.trim();
  const human = (row.human_name ?? "").trim();
  if (human && human !== entity) return `${entity} (${human})`;
  return entity || human || row.participant_id;
}

export function filterRecipientRowsByPhase(
  rows: readonly RecipientDeliveryRow[],
  phase: "review" | "signing" | "all",
): RecipientDeliveryRow[] {
  if (phase === "all") return [...rows];
  return rows.filter((r) => r.phase === phase);
}
