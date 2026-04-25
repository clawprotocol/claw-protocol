/**
 * Deterministic field-level comparison for agreement snapshots (no AI).
 */

import type { AgreementSnapshot } from "../agreement/agreementVersionStore";

export type AgreementFieldChange = {
  field: string;
  before: string | null;
  after: string | null;
  changed: boolean;
};

export type AgreementCompareResult = {
  changedFields: AgreementFieldChange[];
  changedFieldKeys: string[];
  hasChanges: boolean;
};

const SNAPSHOT_KEYS = [
  "title",
  "jurisdiction",
  "effective_date",
  "purpose",
  "payment_terms",
  "duration",
  "due_date",
  "parties",
] as const satisfies readonly (keyof AgreementSnapshot)[];

function normText(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function partiesFingerprint(parties: AgreementSnapshot["parties"] | undefined): string {
  const rows = (parties || []).map((p) => ({
    name: normText(p?.name),
    role: normText(p?.role),
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
  return JSON.stringify(rows);
}

function valueForKey(snap: AgreementSnapshot, key: (typeof SNAPSHOT_KEYS)[number]): string | null {
  switch (key) {
    case "parties":
      return partiesFingerprint(snap.parties);
    case "title":
    case "jurisdiction":
    case "purpose":
    case "payment_terms":
    case "duration":
    case "due_date":
    case "effective_date":
      return normText(snap[key] as string | null | undefined) || null;
    default:
      return null;
  }
}

/** Human-readable single-field display (not used for equality). */
export function agreementFieldDisplayValue(
  snap: AgreementSnapshot,
  key: (typeof SNAPSHOT_KEYS)[number]
): string | null {
  if (key === "parties") {
    const ps = snap.parties || [];
    if (ps.length === 0) return null;
    return ps.map((p) => `${normText(p.name) || "—"} (${normText(p.role) || "party"})`).join("; ");
  }
  const v = snap[key];
  if (v === null || v === undefined) return null;
  const t = normText(String(v));
  return t || null;
}

export function agreementFieldLabel(field: string): string {
  switch (field) {
    case "title":
      return "Title";
    case "jurisdiction":
      return "Governing law";
    case "effective_date":
      return "Effective date";
    case "purpose":
      return "Purpose";
    case "payment_terms":
      return "Payment terms";
    case "duration":
      return "Duration";
    case "due_date":
      return "Due date";
    case "parties":
      return "Parties";
    default:
      return field;
  }
}

/**
 * Compare two snapshots and list per-field changes. Equality is normalized (trimmed strings;
 * parties compared as sorted name/role tuples).
 */
export function compareAgreementSnapshots(
  before: AgreementSnapshot,
  after: AgreementSnapshot
): AgreementCompareResult {
  const changedFields: AgreementFieldChange[] = [];

  for (const key of SNAPSHOT_KEYS) {
    const bRaw = valueForKey(before, key);
    const aRaw = valueForKey(after, key);
    const changed = bRaw !== aRaw;
    const beforeDisp =
      key === "parties"
        ? agreementFieldDisplayValue(before, key)
        : bRaw;
    const afterDisp =
      key === "parties" ? agreementFieldDisplayValue(after, key) : aRaw;
    changedFields.push({
      field: key,
      before: beforeDisp,
      after: afterDisp,
      changed,
    });
  }

  const changedFieldKeys = changedFields.filter((r) => r.changed).map((r) => r.field);
  return {
    changedFields,
    changedFieldKeys,
    hasChanges: changedFieldKeys.length > 0,
  };
}
