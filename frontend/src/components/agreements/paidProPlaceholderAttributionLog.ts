/**
 * DEV-only placeholder attribution logs for Paid Pro ORG_* / drafting-stub investigations.
 * Never logs full agreement text, intake, or signer metadata.
 */

const LOGGED_ORIGIN_KEYS = new Set<string>();
const LOGGED_CONTEXT_KEYS = new Set<string>();

function devOnlyEnabled(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env.DEV && import.meta.env.MODE !== "test";
}

function parseOrgSlot(placeholder: string): number | null {
  const m = String(placeholder || "").match(/(?:ORG|PARTY)[_\s-]*([1-9]\d*)/i);
  if (!m) return null;
  const slot = parseInt(m[1], 10);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
}

export type PaidProPlaceholderOriginInput = {
  placeholder: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceValue: string | null;
};

export function logPaidProPlaceholderOrigin(args: PaidProPlaceholderOriginInput): void {
  if (!devOnlyEnabled()) return;
  const key = `${args.sourceModule}|${args.placeholder}|${args.sourceEntityType}|${args.sourceValue ?? ""}`;
  if (LOGGED_ORIGIN_KEYS.has(key)) return;
  LOGGED_ORIGIN_KEYS.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-placeholder-origin]", {
    placeholder: args.placeholder.slice(0, 80),
    sourceModule: args.sourceModule,
    sourceEntityType: args.sourceEntityType,
    sourceValue: args.sourceValue,
  });
}

export function logPaidProPlaceholderRepair(args: {
  sourceModule: string;
  beforeCount: number;
  afterCount: number;
  unresolvedPlaceholders: readonly string[];
  collapsedExtraOrgSlots?: readonly number[];
}): void {
  if (!devOnlyEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-placeholder-repair]", {
    sourceModule: args.sourceModule,
    beforeCount: args.beforeCount,
    afterCount: args.afterCount,
    unresolvedPlaceholders: args.unresolvedPlaceholders.slice(0, 16),
    ...(args.collapsedExtraOrgSlots?.length
      ? { collapsedExtraOrgSlots: args.collapsedExtraOrgSlots.slice(0, 16) }
      : {}),
  });
}

export function sanitizePlaceholderSurroundingText(text: string, index: number, radius = 48): string {
  const t = String(text || "");
  const start = Math.max(0, index - radius);
  const end = Math.min(t.length, index + radius);
  return t
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function logPaidProPlaceholderContext(args: {
  placeholder: string;
  surroundingText: string;
}): void {
  if (!devOnlyEnabled()) return;
  const key = `${args.placeholder}|${args.surroundingText}`;
  if (LOGGED_CONTEXT_KEYS.has(key)) return;
  LOGGED_CONTEXT_KEYS.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-placeholder-context]", {
    placeholder: args.placeholder.slice(0, 80),
    surroundingText: args.surroundingText.slice(0, 120),
  });
}

export type PaidProEntityMapInput = {
  organizations: readonly string[];
  signers: readonly string[];
  noticeRecipients: readonly string[];
  affiliates: readonly string[];
  sourceModule: string;
};

export function logPaidProEntityMap(args: PaidProEntityMapInput): void {
  if (!devOnlyEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-entity-map]", {
    sourceModule: args.sourceModule,
    organizations: args.organizations.slice(0, 12),
    signers: args.signers.slice(0, 12),
    noticeRecipients: args.noticeRecipients.slice(0, 12),
    affiliates: args.affiliates.slice(0, 12),
  });
}

export function countIdentityPlaceholders(text: string): number {
  const re =
    /\[\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\b(?:ORG|PARTY|COMPANY)[1-9]\d*\b/gi;
  return (String(text || "").match(re) || []).length;
}

export function listUnresolvedIdentityPlaceholderTokens(text: string): string[] {
  const re =
    /\[\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\b(?:ORG|PARTY|COMPANY)[1-9]\d*\b/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of String(text || "").matchAll(re)) {
    const tok = m[0].trim();
    const low = tok.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      out.push(tok);
    }
  }
  return out.slice(0, 24);
}

/** Infer origin metadata for numbered ORG/PARTY slots (no agreement text). */
export function inferOrgSlotOriginMetadata(
  placeholder: string,
  canonicalPartyCount: number,
): Pick<PaidProPlaceholderOriginInput, "sourceEntityType" | "sourceValue"> {
  const slot = parseOrgSlot(placeholder);
  if (slot == null) {
    return { sourceEntityType: "unknown_identity_slot", sourceValue: null };
  }
  if (slot <= canonicalPartyCount) {
    return {
      sourceEntityType: "contracting_party_slot",
      sourceValue: String(slot),
    };
  }
  if (slot === 3) {
    return { sourceEntityType: "extra_org_slot_likely_notice_or_affiliate", sourceValue: "3" };
  }
  if (slot === 4) {
    return { sourceEntityType: "extra_org_slot_likely_subsidiary_or_contact", sourceValue: "4" };
  }
  return { sourceEntityType: "extra_org_slot_beyond_canonical_parties", sourceValue: String(slot) };
}

export function resetPaidProPlaceholderAttributionLogsForTests(): void {
  LOGGED_ORIGIN_KEYS.clear();
  LOGGED_CONTEXT_KEYS.clear();
}

export function logOrgPlaceholderOriginsFromText(args: {
  text: string;
  sourceModule: string;
  canonicalPartyCount: number;
}): void {
  for (const token of listUnresolvedIdentityPlaceholderTokens(args.text)) {
    const meta = inferOrgSlotOriginMetadata(token, args.canonicalPartyCount);
    logPaidProPlaceholderOrigin({
      placeholder: token,
      sourceModule: args.sourceModule,
      ...meta,
    });
  }
}

export function logDraftingStubOriginsFromText(args: { text: string; sourceModule: string }): void {
  const re = /\b(?:fill\s+in\s+later|to\s+be\s+completed|insert\s+here|fill\s+in\s+with\s+counsel)\b/gi;
  const seen = new Set<string>();
  for (const m of String(args.text || "").matchAll(re)) {
    const phrase = m[0].trim().toLowerCase();
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    logPaidProPlaceholderOrigin({
      placeholder: phrase,
      sourceModule: args.sourceModule,
      sourceEntityType: "drafting_stub_phrase",
      sourceValue: phrase,
    });
  }
}
