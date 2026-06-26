/**
 * Opening / introductory recital role-label guard — parentheticals must match intake/manifest,
 * not inverted labels inferred from generated prose.
 */

import type { CanonicalPartyIdentityRecord } from "./canonicalPartyIdentityResolver";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

const OPENING_ROLE_SCAN_MAX = 12_000;
const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normRole(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when parenthetical role already matches canonical manifest label. */
export function openingRoleLabelsMatch(canonicalRoleLabel: string, foundRole: string): boolean {
  const c = normRole(canonicalRoleLabel);
  const f = normRole(foundRole);
  if (!c || !f) return true;
  if (c === f) return true;
  if (c === "service provider" && f === "provider") return true;
  if (c === "client" && (f === "customer" || f === "company")) return true;
  return false;
}

function openingSliceBounds(text: string): { start: number; end: number } {
  const body = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = body.search(WITNESS_RE);
  const end =
    witnessIdx >= 0 ? witnessIdx : Math.min(body.length, OPENING_ROLE_SCAN_MAX);
  return { start: 0, end };
}

function entityRoleParentheticalRe(legalName: string): RegExp {
  return new RegExp(
    `(${escapeRe(legalName)})\\s*\\(\\s*(["'“”\u2018\u2019\u201C\u201D]?)([^)"'“”\u2018\u2019\u201C\u201D]+)\\2\\s*\\)`,
    "gi",
  );
}

function repairEntityRoleParentheticalsInSlice(
  slice: string,
  legalName: string,
  canonicalRoleLabel: string,
): { slice: string; repairs: string[] } {
  const repairs: string[] = [];
  const re = entityRoleParentheticalRe(legalName);
  const next = slice.replace(re, (full, namePart, quote, foundRole) => {
    const found = String(foundRole || "").trim();
    if (!found || openingRoleLabelsMatch(canonicalRoleLabel, found)) {
      return full;
    }
    const q = quote || '"';
    repairs.push(
      `opening_role_label:${normRole(found)}->${canonicalRoleLabel.replace(/\s+/g, "_")}`,
    );
    return `${namePart} (${q}${canonicalRoleLabel}${q})`;
  });
  return { slice: next, repairs };
}

/**
 * Correct inverted/wrong parenthetical role labels beside each manifest legal entity
 * in the opening / introductory slice (before execution). Preserves entity names and
 * non-role wording.
 */
export function repairOpeningRecitalRoleLabelsFromManifest(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  if (records.length < 2) return { text, repairs: [] };
  const body = (text || "").replace(/\r\n/g, "\n");
  const { start, end } = openingSliceBounds(body);
  let slice = body.slice(start, end);
  const repairs: string[] = [];

  for (const rec of records) {
    const legal = rec.fullLegalName.replace(/\s+/g, " ").trim();
    const role = rec.roleLabel.replace(/\s+/g, " ").trim();
    if (!legal || !role) continue;
    const fixed = repairEntityRoleParentheticalsInSlice(slice, legal, role);
    slice = fixed.slice;
    repairs.push(...fixed.repairs);
  }

  if (repairs.length === 0) {
    return { text, repairs: [] };
  }

  const out = body.slice(0, start) + slice + body.slice(end);
  return { text: out, repairs: [...new Set(repairs)] };
}

/** Detect quoted parenthetical aliases that are another party's legal entity name (TEST442). */
export function detectOpeningRecitalCrossMappedLegalNameAliases(
  text: string,
  partyNames: readonly string[],
): boolean {
  if (partyNames.length < 3) return false;
  const body = (text || "").replace(/\r\n/g, "\n");
  const { start, end } = openingSliceBounds(body);
  const slice = body.slice(start, end);

  for (const legal of partyNames) {
    const trimmed = legal.trim();
    if (!trimmed) continue;
    const re = entityRoleParentheticalRe(trimmed);
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null) {
      const alias = (m[3] || "").trim();
      if (!alias || !isAuthoritativeLegalEntityName(alias)) continue;
      const matchesSelf = partyLegalNamesMatch(trimmed, alias);
      const matchesOther = partyNames.some(
        (other) => !partyLegalNamesMatch(other, trimmed) && partyLegalNamesMatch(other, alias),
      );
      if (!matchesSelf && matchesOther) return true;
    }
  }
  return false;
}

/** Detect any manifest entity with a wrong parenthetical role in the opening slice. */
export function detectOpeningRecitalRoleLabelInversion(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  const body = (text || "").replace(/\r\n/g, "\n");
  const { start, end } = openingSliceBounds(body);
  const slice = body.slice(start, end);

  for (const rec of records) {
    const legal = rec.fullLegalName.trim();
    const role = rec.roleLabel.trim();
    if (!legal || !role) continue;
    const re = entityRoleParentheticalRe(legal);
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null) {
      const found = (m[3] || "").trim();
      if (found && !openingRoleLabelsMatch(role, found)) {
        return true;
      }
    }
  }
  return false;
}

/** Manifest entries from draft parties (name + role), intake order preserved. */
export function canonicalRecordsFromDraftParties(
  partyNames: readonly string[],
  partyRoles: readonly string[],
): CanonicalPartyIdentityRecord[] {
  const out: CanonicalPartyIdentityRecord[] = [];
  for (let i = 0; i < Math.min(partyNames.length, partyRoles.length, 12); i += 1) {
    const fullLegalName = String(partyNames[i] || "").replace(/\s+/g, " ").trim();
    const roleLabel = String(partyRoles[i] || "").trim() || (i === 0 ? "Client" : "Service Provider");
    if (fullLegalName.length < 3) continue;
    out.push({
      fullLegalName,
      roleLabel,
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: null,
      signerTitle: null,
      partyAddress: null,
    });
  }
  return out.length >= 2 ? out : [];
}

export function manifestMatchesEntity(
  records: readonly CanonicalPartyIdentityRecord[],
  legalName: string,
): CanonicalPartyIdentityRecord | null {
  const hit = records.find((r) => partyLegalNamesMatch(r.fullLegalName, legalName));
  return hit ?? null;
}
