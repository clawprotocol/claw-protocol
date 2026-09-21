import type { AgreementParty } from "../../agreement/agreementTypes";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { getCachedAccessToken, refreshCachedAccessToken } from "../../auth/authAccessTokenCache";
import { resolveApiBase } from "../../lib/clawApi";
import type { ReviewerLinkRow } from "./reviewerLinkRowModel";

export const REVIEW_LINKS_ALREADY_READY_MESSAGE = "Review links are already ready.";

export const RECIPIENT_LINK_INVALID_OR_EXPIRED_MESSAGE =
  "This link is invalid or expired. Request a new link from the sender.";

/** Stable party id for review-link identity. Never invent an id; never use `legacy_` rows. */
export function stableReviewRecipientPartyId(raw: string | null | undefined): string {
  const id = String(raw ?? "").trim();
  if (!id || id.toLowerCase().startsWith("legacy_")) return "";
  return id;
}

/**
 * Unique legal-name key for id recovery. Strips trailing punctuation and a leading
 * ordinal; never uses prefix/contains matching.
 */
export function normalizeReviewPartyNameKey(name: string | undefined | null): string {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .replace(/^\d+\s+/, "")
    .toLowerCase();
}

export function uniqueStableIdsByReviewPartyNameKey(
  authority: readonly AgreementParty[],
): Map<string, string> {
  const idsByKey = new Map<string, string[]>();
  for (const a of authority) {
    const id = stableReviewRecipientPartyId(a.id);
    const key = normalizeReviewPartyNameKey(a.name);
    if (!id || !key) continue;
    const list = idsByKey.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    idsByKey.set(key, list);
  }
  const unique = new Map<string, string>();
  for (const [key, ids] of idsByKey) {
    if (ids.length === 1) unique.set(key, ids[0]!);
  }
  return unique;
}

export function hydrateReviewPartyIdsFromAuthority(
  parties: readonly AgreementParty[],
  authority: readonly AgreementParty[],
): AgreementParty[] {
  const byUniqueKey = uniqueStableIdsByReviewPartyNameKey(authority);
  return parties.map((p) => {
    const existing = stableReviewRecipientPartyId(p.id);
    if (existing) return { ...p, id: existing };
    const recovered = byUniqueKey.get(normalizeReviewPartyNameKey(p.name)) ?? "";
    return recovered ? { ...p, id: recovered } : { ...p };
  });
}

export type ReviewPartyIdentityLogRow = {
  index: number;
  name: string;
  nameKey: string;
  hasStableId: boolean;
  idPrefix: string;
};

export function reviewPartyIdentityLogRow(
  party: AgreementParty | undefined,
  index: number,
): ReviewPartyIdentityLogRow {
  const id = stableReviewRecipientPartyId(party?.id);
  return {
    index,
    name: String(party?.name ?? "").trim(),
    nameKey: normalizeReviewPartyNameKey(party?.name),
    hasStableId: Boolean(id),
    idPrefix: id ? id.slice(0, 8) : "",
  };
}

export function activeReviewInvitePartyIdsFromRegistry(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!raw || typeof raw !== "object") return out;
  const recips = (raw as { recipients?: unknown }).recipients;
  if (!recips || typeof recips !== "object") return out;
  for (const [key, row] of Object.entries(recips as Record<string, unknown>)) {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const active = String(rec.active_jti ?? "").trim();
    if (!active) continue;
    const pid =
      stableReviewRecipientPartyId(typeof rec.participant_id === "string" ? rec.participant_id : "") ||
      stableReviewRecipientPartyId(key.replace(/^review:/i, ""));
    if (pid) out.add(pid);
  }
  return out;
}

export function existingReviewLinkRowForParty(
  rows: readonly ReviewerLinkRow[] | undefined,
  partyId: string,
): ReviewerLinkRow | undefined {
  const id = stableReviewRecipientPartyId(partyId);
  if (!id) return undefined;
  return (rows ?? []).find(
    (r) =>
      stableReviewRecipientPartyId(r.recipientPartyId) === id ||
      stableReviewRecipientPartyId(r.reviewer_id) === id,
  );
}

export function mergeReviewLinkRowsByPartyId(
  previous: readonly ReviewerLinkRow[] | undefined,
  next: readonly ReviewerLinkRow[],
): ReviewerLinkRow[] {
  const byId = new Map<string, ReviewerLinkRow>();
  const unkeyed: ReviewerLinkRow[] = [];
  for (const row of [...(previous ?? []), ...next]) {
    const id = stableReviewRecipientPartyId(row.recipientPartyId || row.reviewer_id);
    if (!id) {
      unkeyed.push(row);
      continue;
    }
    byId.set(id, row);
  }
  return [...byId.values(), ...unkeyed];
}

export type ReviewLinkMintAuthority = {
  parties: AgreementParty[];
  activeInvitePartyIds: Set<string>;
};

function shortAgreementId(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

export async function fetchReviewLinkMintAuthority(agreementId: string): Promise<ReviewLinkMintAuthority> {
  const id = agreementId.trim();
  if (!id) return { parties: [], activeInvitePartyIds: new Set() };
  try {
    const token = (await refreshCachedAccessToken()) || getCachedAccessToken();
    const res = await fetch(`${resolveApiBase().replace(/\/$/, "")}/api/agreements/${encodeURIComponent(id)}`, {
      headers: {
        ...(clawAgreementHeaders({ Accept: "application/json" }) as Record<string, string>),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.info("[review-link-mint-authority]", {
        agreementIdShort: shortAgreementId(id),
        httpOk: false,
        httpStatus: res.status,
        partyCount: 0,
        parties: [],
        source: "http_error",
      });
      return { parties: [], activeInvitePartyIds: new Set() };
    }
    const j = (await res.json()) as { draft?: Record<string, unknown> };
    const draft = j.draft && typeof j.draft === "object" ? j.draft : {};
    const parties: AgreementParty[] = [];
    if (Array.isArray(draft.parties)) {
      for (const p of draft.parties) {
        if (!p || typeof p !== "object") continue;
        const row = p as Record<string, unknown>;
        const name = String(row.name ?? "").trim();
        const pid = stableReviewRecipientPartyId(typeof row.id === "string" ? row.id : "");
        if (!name) continue;
        parties.push({
          name,
          role: String(row.role ?? "party"),
          email: row.email == null ? undefined : String(row.email),
          ...(pid ? { id: pid } : {}),
        });
      }
    }
    // eslint-disable-next-line no-console
    console.info("[review-link-mint-authority]", {
      agreementIdShort: shortAgreementId(id),
      httpOk: true,
      httpStatus: res.status,
      partyCount: parties.length,
      parties: parties.map((p, index) => reviewPartyIdentityLogRow(p, index)),
      source: "get_ok",
    });
    return {
      parties,
      activeInvitePartyIds: activeReviewInvitePartyIdsFromRegistry(draft.recipient_delivery_v1),
    };
  } catch {
    // eslint-disable-next-line no-console
    console.info("[review-link-mint-authority]", {
      agreementIdShort: shortAgreementId(id),
      httpOk: false,
      httpStatus: 0,
      partyCount: 0,
      parties: [],
      source: "network_error",
    });
    return { parties: [], activeInvitePartyIds: new Set() };
  }
}

const partyMintInFlight = new Set<string>();

export function reviewLinkPartyMintLockKey(agreementId: string, partyId: string): string {
  return `${agreementId.trim()}::${stableReviewRecipientPartyId(partyId)}`;
}

export function tryBeginReviewLinkPartyMint(agreementId: string, partyId: string): boolean {
  const key = reviewLinkPartyMintLockKey(agreementId, partyId);
  if (!key.endsWith("::") && partyMintInFlight.has(key)) return false;
  if (key.endsWith("::")) return false;
  partyMintInFlight.add(key);
  return true;
}

export function endReviewLinkPartyMint(agreementId: string, partyId: string): void {
  partyMintInFlight.delete(reviewLinkPartyMintLockKey(agreementId, partyId));
}

export function clearReviewLinkPartyMintLocksForTests(): void {
  partyMintInFlight.clear();
}
