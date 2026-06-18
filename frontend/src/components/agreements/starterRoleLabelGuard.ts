/**
 * Distinguish agreement role labels (Client, Service Provider) from signer titles (CEO, President).
 * Signer titles must never appear as parenthetical role labels in Free Starter recitals.
 */

const GENERIC_PARTY_ROLES = new Set(["", "party", "parties", "signer", "signatory"]);

const AGREEMENT_ROLE_LABELS = new Set([
  "client",
  "customer",
  "service provider",
  "provider",
  "consultant",
  "contractor",
  "vendor",
  "landlord",
  "lessor",
  "tenant",
  "lessee",
  "buyer",
  "purchaser",
  "seller",
  "licensor",
  "licensee",
  "guarantor",
  "party 1",
  "party 2",
  "party 3",
  "party 4",
]);

const SIGNER_TITLE_EXACT = new Set([
  "ceo",
  "cfo",
  "coo",
  "cto",
  "cmo",
  "cio",
  "president",
  "vice president",
  "vp",
  "director",
  "managing director",
  "managing partner",
  "general partner",
  "partner",
  "owner",
  "founder",
  "co-founder",
  "secretary",
  "treasurer",
  "chairman",
  "chairwoman",
  "chair",
  "principal",
  "manager",
  "member",
  "officer",
  "authorized signatory",
  "authorized representative",
]);

const SIGNER_TITLE_PREFIX_RE =
  /^(chief|executive|senior|associate|assistant|regional|national)\s+/i;

export function normalizeRoleLabelToken(role: string | null | undefined): string {
  return String(role ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAgreementRoleLabel(role: string | null | undefined): boolean {
  const r = normalizeRoleLabelToken(role).toLowerCase();
  if (!r || GENERIC_PARTY_ROLES.has(r)) return false;
  return AGREEMENT_ROLE_LABELS.has(r);
}

/** True when a party.role value looks like a signer job title, not an agreement role. */
export function isSignerTitleLikeRole(role: string | null | undefined): boolean {
  const r = normalizeRoleLabelToken(role).toLowerCase();
  if (!r || GENERIC_PARTY_ROLES.has(r)) return false;
  if (isAgreementRoleLabel(r)) return false;
  if (SIGNER_TITLE_EXACT.has(r)) return true;
  if (SIGNER_TITLE_PREFIX_RE.test(r)) return true;
  if (/\b(ceo|cfo|coo|cto|president|director|partner|secretary|treasurer|chair(?:man|woman)?)\b/i.test(r)) {
    return true;
  }
  return false;
}

export function starterCommercialRoleForIndex(index: number, partyCount: number): string {
  if (partyCount === 2) return index === 0 ? "Client" : "Service Provider";
  return `Party ${index + 1}`;
}

export function isInvalidVisibleScheduleValue(value: string | null | undefined): boolean {
  const t = normalizeRoleLabelToken(value).toLowerCase();
  if (!t) return true;
  if (t === "null" || t === "undefined" || t === "[object object]") return true;
  if (/^until\s+null$/i.test(t)) return true;
  return false;
}

export function extractTermDurationFromIntake(intake: string | null | undefined): string {
  const text = String(intake || "").trim();
  if (!text) return "";
  const labeled = text.match(/(?:^|\n)\s*Term:\s*([^\n.]+)/i);
  if (labeled?.[1]) {
    const candidate = labeled[1].trim();
    if (!isInvalidVisibleScheduleValue(candidate)) return candidate;
  }
  const months = text.match(/\b(?:for\s+)?twelve\s*\(\s*12\s*\)\s*months?\b/i);
  if (months) return "twelve (12) months";
  const genericMonths = text.match(/\b(\d+)\s*[- ]?months?\b/i);
  if (genericMonths) return genericMonths[0].trim();
  return "";
}
