import type { AgreementDraft } from "./agreementTypes";
import { participantDisplayName } from "./participantModel";
import { finalizePartyDisplayNameForUserFacing } from "./partyNameDisplayCasing";

/**
 * Ordered display names for every agreement party on the draft — authoritative for send / review / done summaries.
 * Does not use recipient or signer rows; only `draft.parties`.
 *
 * When `intakeText` is provided, party casing is aligned to raw intake spans plus suffix normalization.
 */
export function orderedAuthoritativePartyDisplayNames(
  parties: AgreementDraft["parties"] | null | undefined,
  intakeText?: string | null,
): string[] {
  return (parties ?? [])
    .map((p, idx) =>
      finalizePartyDisplayNameForUserFacing(participantDisplayName(p, idx).trim(), intakeText ?? null),
    )
    .filter((n) => n.length > 0);
}

/**
 * Single-line headline for simple-flow cards.
 * Uses `↔` only when there are exactly two agreement parties; otherwise joins with middle dots.
 */
export function formatAuthoritativeAgreementPartiesHeadline(
  parties: AgreementDraft["parties"] | null | undefined,
  intakeText?: string | null,
): string {
  const names = orderedAuthoritativePartyDisplayNames(parties, intakeText);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} ↔ ${names[1]}`;
  return names.join(" · ");
}

/**
 * Inline list (comma, middle dot, etc.) with an optional cap and "+N more" tail for extremely long rosters.
 */
export function formatAuthoritativeAgreementPartiesInline(
  parties: AgreementDraft["parties"] | null | undefined,
  opts?: { maxShown?: number; separator?: string; intakeText?: string | null },
): string {
  const sep = opts?.separator ?? " · ";
  const maxShown = Math.max(1, opts?.maxShown ?? 48);
  const names = orderedAuthoritativePartyDisplayNames(parties, opts?.intakeText);
  if (names.length === 0) return "—";
  if (names.length <= maxShown) return names.join(sep);
  const head = names.slice(0, maxShown);
  return `${head.join(sep)}${sep}+${names.length - maxShown} more`;
}

export function authoritativeAgreementPartyCount(
  parties: AgreementDraft["parties"] | null | undefined,
): number {
  return (parties ?? []).length;
}

/** Email / display rows from send or review forms — never substitute for `draft.parties`. */
export type HandoffContactRowInput = {
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
};

function orderedHandoffContactLabels(rows: readonly HandoffContactRowInput[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const email = String(r.email ?? "").trim();
    const name = String(r.displayName ?? r.name ?? "").trim();
    const label =
      name && email && name.toLowerCase() !== email.toLowerCase() ? `${name} (${email})` : name || email;
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Review / recipient rows — use under “Reviewers” / “Recipients,” not “Parties.” */
export function orderedReviewerRecipientLabels(rows: readonly HandoffContactRowInput[]): string[] {
  return orderedHandoffContactLabels(rows);
}

/** Signer setup rows — display only; do not merge back into `draft.parties`. */
export function orderedSignerSetupRowLabels(rows: readonly HandoffContactRowInput[]): string[] {
  return orderedHandoffContactLabels(rows);
}

export function formatReviewerRecipientsInline(
  rows: readonly HandoffContactRowInput[],
  opts?: { separator?: string },
): string {
  const labels = orderedReviewerRecipientLabels(rows);
  if (labels.length === 0) return "—";
  return labels.join(opts?.separator ?? " · ");
}

export function formatSignerRowsInline(
  rows: readonly HandoffContactRowInput[],
  opts?: { separator?: string },
): string {
  const labels = orderedSignerSetupRowLabels(rows);
  if (labels.length === 0) return "—";
  return labels.join(opts?.separator ?? " · ");
}
