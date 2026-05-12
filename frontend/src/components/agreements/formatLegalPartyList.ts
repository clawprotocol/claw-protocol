/**
 * Formats a list of parties into proper legal prose with:
 * - Oxford comma for 3+ parties
 * - Grouped role labels (no repetition)
 * - "collectively" phrasing for same-role groups
 *
 * Reused across starter draft preview, premium review, export rendering, and signing summaries.
 */

export type PartyEntry = {
  name: string;
  role?: string;
};

const GENERIC_ROLES = new Set(["party", "parties", "signer", "signatory", ""]);

function isGenericRole(role: string | undefined): boolean {
  return !role || GENERIC_ROLES.has(role.toLowerCase().trim());
}

function titleCaseRole(role: string): string {
  return role
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function pluralizeRole(role: string): string {
  const t = role.trim();
  if (/y$/i.test(t) && !/[aeiou]y$/i.test(t)) return t.slice(0, -1) + "ies";
  if (/s$/i.test(t)) return t;
  return t + "s";
}

/**
 * Join names with Oxford comma.
 * 2: "A and B"
 * 3+: "A, B, and C"
 */
export function joinOxfordComma(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

type RoleGroup = {
  role: string;
  names: string[];
};

function groupByRole(parties: PartyEntry[]): RoleGroup[] {
  const groups: RoleGroup[] = [];
  const map = new Map<string, RoleGroup>();

  for (const p of parties) {
    const role = isGenericRole(p.role) ? "" : (p.role || "").trim();
    const key = role.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.names.push(p.name);
    } else {
      const group: RoleGroup = { role, names: [p.name] };
      groups.push(group);
      map.set(key, group);
    }
  }
  return groups;
}

/**
 * Format a single role group with proper label grammar.
 * Single party: 'Name ("Role")'
 * Multiple same-role: 'A, B, and C (collectively, the "Roles")'
 */
function formatRoleGroup(group: RoleGroup): string {
  const nameList = joinOxfordComma(group.names);
  if (!group.role) return nameList;

  const displayRole = titleCaseRole(group.role);
  if (group.names.length === 1) {
    return `${nameList} ("${displayRole}")`;
  }
  const plural = titleCaseRole(pluralizeRole(group.role));
  return `${nameList} (collectively, the "${plural}")`;
}

/**
 * Format parties into legal prose for the preamble line.
 * Handles:
 * - All generic roles: "A, B, and C (collectively, the "Parties")"
 * - Single shared role: "A and B (collectively, the "Clients")"
 * - Mixed roles: "A ("Company") and B, C, and D (collectively, the "Developers")"
 */
export function formatLegalPartyList(parties: PartyEntry[]): string {
  const valid = parties.filter((p) => (p.name || "").trim());
  if (valid.length === 0) return "";
  if (valid.length === 1) {
    const p = valid[0];
    if (isGenericRole(p.role)) return p.name;
    return `${p.name} ("${titleCaseRole(p.role!)}")`;
  }

  const allGeneric = valid.every((p) => isGenericRole(p.role));
  if (allGeneric) {
    const names = joinOxfordComma(valid.map((p) => p.name));
    if (valid.length === 2) return names;
    return `${names} (collectively, the "Parties")`;
  }

  const groups = groupByRole(valid);
  if (groups.length === 1) {
    return formatRoleGroup(groups[0]);
  }

  const parts = groups.map((g) => formatRoleGroup(g));
  return joinOxfordComma(parts);
}

/**
 * Full preamble sentence for agreement prose.
 * Always appends (collectively, the "Parties") for 2+ parties as standard legal form.
 */
export function formatLegalPartyPreamble(parties: PartyEntry[]): string {
  const valid = parties.filter((p) => (p.name || "").trim());
  if (valid.length === 0) {
    return `This Agreement (\u201cAgreement\u201d) is entered into by the parties identified above (the \u201cParties\u201d).`;
  }
  const list = formatLegalPartyList(valid);
  const needsCollectively = !list.includes("collectively");
  const suffix = needsCollectively ? ` (collectively, the \u201cParties\u201d)` : "";
  return `This Agreement (\u201cAgreement\u201d) is entered into by and between:\n${list}${suffix}.`;
}
