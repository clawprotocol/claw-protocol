/**
 * Intake contracting-party editor — 2–4 legal entities alongside natural-language extraction.
 * Does not collect signers, reviewers, titles, or emails.
 */

export const INTAKE_PARTY_EDITOR_MIN = 2;
export const INTAKE_PARTY_EDITOR_MAX = 4;

export const INTAKE_ADD_CONTRACTING_PARTY_LABEL = "Add contracting party";
export const INTAKE_REMOVE_CONTRACTING_PARTY_LABEL = "Remove party";
export const INTAKE_PARTY_EDITOR_SCOPE_COPY =
  "This version supports 2–4 contracting parties. Party 1 and Party 2 are required.";
export const INTAKE_PARTY_EDITOR_AT_CAP_COPY =
  "Four contracting parties is the maximum this version supports.";

export type IntakeContractingPartyRow = {
  slot: number;
  name: string;
};

export function normalizeIntakePartyEditorRows(extracted: readonly string[]): string[] {
  const names = extracted.map((n) => String(n || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const rows = names.slice(0, INTAKE_PARTY_EDITOR_MAX);
  while (rows.length < INTAKE_PARTY_EDITOR_MIN) rows.push("");
  return rows;
}

export function canAddIntakeContractingParty(rowCount: number): boolean {
  return rowCount < INTAKE_PARTY_EDITOR_MAX;
}

export function canRemoveIntakeContractingParty(index: number, rowCount: number): boolean {
  return rowCount > INTAKE_PARTY_EDITOR_MIN && index === rowCount - 1 && index >= INTAKE_PARTY_EDITOR_MIN;
}

export function addIntakeContractingParty(rows: readonly string[]): string[] {
  if (!canAddIntakeContractingParty(rows.length)) return [...rows];
  return [...rows, ""];
}

export function removeIntakeContractingParty(rows: readonly string[], index: number): string[] {
  if (!canRemoveIntakeContractingParty(index, rows.length)) return [...rows];
  return rows.filter((_, i) => i !== index);
}

export function namedIntakeContractingParties(rows: readonly string[]): string[] {
  return rows.map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n.length >= 2);
}

/** Write/replace `Party N:` labeled lines without deleting the user's original prose. */
export function upsertLabeledPartyRows(source: string, names: readonly string[]): string {
  const rows = names
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, INTAKE_PARTY_EDITOR_MAX);
  if (rows.length < INTAKE_PARTY_EDITOR_MIN) return source;
  const withoutLabeled = String(source || "")
    .replace(/(?:^|\n)\s*Party\s*[1-4]\s*[:\-]\s*[^\n]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const block = rows.map((name, i) => `Party ${i + 1}: ${name}`).join("\n");
  return withoutLabeled ? `${withoutLabeled}\n\n${block}` : block;
}
