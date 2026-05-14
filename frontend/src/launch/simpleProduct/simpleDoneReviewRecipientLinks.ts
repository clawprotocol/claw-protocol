import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { agreementMagicLinkPath } from "../../agreement/AgreementRecipientReview";
import type { MintRecipientAccessTokenSuccess } from "../../agreement/recipientAccessApi";
import { mintRecipientAccessTokenResult } from "../../agreement/recipientAccessApi";
import { resolveReviewLinkAssumedOwnerPartyIndex, rowReadyForReviewLinkInvite } from "./reviewLinkRecipientEmailMerge";

/**
 * Session handoff: after simple-home review-link flow, `/app/done` can show copyable per-recipient magic links
 * (distinct from the public `/verify/...` URL).
 */
export const simpleDoneReviewRecipientLinksStorageKey = (agreementId: string) =>
  `claw_simple_done_review_recipient_links_v1_${encodeURIComponent(agreementId.trim())}`;

export type SimpleDoneReviewRecipientLinkRow = {
  displayName: string;
  reviewHref: string;
  /** Counterparty email when present on the minted party row. */
  recipientEmail?: string;
};

export type SimpleDoneReviewLinksPayload = {
  v: 1;
  intent: "review";
  recipients: SimpleDoneReviewRecipientLinkRow[];
  savedAt: number;
  /** True when mint was attempted but no usable URLs were stored (e.g. 503). */
  reviewLinksPending?: boolean;
  /**
   * Ordered display names from authoritative `draft.parties` at handoff write time.
   * Separate from `recipients` (review links / emails).
   */
  agreementPartyDisplayNames?: string[];
};

function shortAgreementId(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

export function writeSimpleDoneReviewRecipientLinks(payload: {
  agreementId: string;
  recipients: SimpleDoneReviewRecipientLinkRow[];
  reviewLinksPending?: boolean;
  agreementPartyDisplayNames?: string[];
}): void {
  const id = payload.agreementId.trim();
  if (!id) return;
  const partyNames = payload.agreementPartyDisplayNames?.filter((n) => typeof n === "string" && n.trim());
  const full: SimpleDoneReviewLinksPayload = {
    v: 1,
    intent: "review",
    recipients: payload.recipients,
    savedAt: Date.now(),
    ...(payload.reviewLinksPending === true ? { reviewLinksPending: true } : {}),
    ...(partyNames && partyNames.length > 0 ? { agreementPartyDisplayNames: partyNames } : {}),
  };
  try {
    sessionStorage.setItem(simpleDoneReviewRecipientLinksStorageKey(id), JSON.stringify(full));
  } catch {
    /* ignore */
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[simple-done-review-links-write]", {
      agreementIdShort: shortAgreementId(id),
      recipientLinkCount: full.recipients.length,
    });
  }
}

export function readSimpleDoneReviewRecipientLinks(agreementId: string): SimpleDoneReviewLinksPayload | null {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(simpleDoneReviewRecipientLinksStorageKey(id));
    if (!raw) return null;
    const o = JSON.parse(raw) as SimpleDoneReviewLinksPayload;
    if (o?.v !== 1 || o.intent !== "review" || !Array.isArray(o.recipients)) return null;
    const recipients = o.recipients.filter(
      (r) => r && typeof r.displayName === "string" && typeof r.reviewHref === "string" && r.reviewHref.trim(),
    );
    const out: SimpleDoneReviewLinksPayload = {
      v: 1,
      intent: "review",
      recipients,
      savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
    };
    if (o.reviewLinksPending === true) out.reviewLinksPending = true;
    const cachedParties = (o as { agreementPartyDisplayNames?: unknown }).agreementPartyDisplayNames;
    if (Array.isArray(cachedParties)) {
      const names = cachedParties.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
      if (names.length > 0) out.agreementPartyDisplayNames = names;
    }
    return out;
  } catch {
    return null;
  }
}

export function clearSimpleDoneReviewRecipientLinks(agreementId: string): void {
  try {
    sessionStorage.removeItem(simpleDoneReviewRecipientLinksStorageKey(agreementId.trim()));
  } catch {
    /* ignore */
  }
}

export const REVIEW_LINK_MINT_FAILURE_USER_COPY =
  "Review link could not be created. Please check the recipient email and try again.";

/** True when at least one row has a non-empty review href (caller’s success gate for navigation). */
export function reviewLinkMintHasUsableUrls(rows: Pick<SimpleDoneReviewRecipientLinkRow, "reviewHref">[]): boolean {
  return rows.some((r) => typeof r.reviewHref === "string" && r.reviewHref.trim().length > 0);
}

function resolveReviewHrefFromMint(
  agreementId: string,
  origin: string,
  data: MintRecipientAccessTokenSuccess,
): string {
  const url = (data.review_url || "").trim();
  if (url) {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
  }
  const tok = (data.token || "").trim();
  if (!tok) return "";
  return `${origin}${agreementMagicLinkPath(agreementId, tok)}`;
}

/** Mint personal review magic links for each counterparty row that passes review-link readiness (non-owner). */
export async function mintSimpleDoneReviewRecipientLinkRows(args: {
  agreementId: string;
  draft: AgreementDraft;
}): Promise<{
  rows: SimpleDoneReviewRecipientLinkRow[];
  attemptedMintCount: number;
  firstErrorStatus?: number;
  lastMintErrorDetail?: string;
  lastMintErrorCode?: string;
}> {
  const mintKey =
    (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env?.VITE_RECIPIENT_LINK_MINT_KEY ||
    "";
  const parties = args.draft.parties || [];
  const list = parties as AgreementParty[];
  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(list);
  const inviter = String(list[ownerIdx]?.name ?? "").trim();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const out: SimpleDoneReviewRecipientLinkRow[] = [];
  let attemptedMintCount = 0;
  let firstErrorStatus: number | undefined;
  let lastMintErrorDetail: string | undefined;
  let lastMintErrorCode: string | undefined;
  for (let i = 0; i < list.length; i++) {
    if (i === ownerIdx) continue;
    const p = list[i]!;
    if (!rowReadyForReviewLinkInvite(p, i, list)) continue;
    const wf = String(p.role || "").trim().toLowerCase();
    const role: "signer" | "reviewer" | "recipient" =
      wf === "signer" ? "signer" : wf === "reviewer" ? "reviewer" : "recipient";
    const partyId = p.id && !String(p.id).startsWith("legacy_") ? String(p.id).trim() : undefined;
    attemptedMintCount += 1;
    const res = await mintRecipientAccessTokenResult(
      args.agreementId,
      {
        mode: "review",
        role,
        recipient_party_id: partyId || undefined,
        inviter_display_name: inviter || undefined,
      },
      mintKey,
    );
    if (!res.ok) {
      if (firstErrorStatus === undefined) firstErrorStatus = res.status;
      lastMintErrorDetail = res.detail ?? res.message;
      lastMintErrorCode = res.code;
      continue;
    }
    const reviewHref = resolveReviewHrefFromMint(args.agreementId, origin, res.data).trim();
    if (!reviewHref) {
      if (firstErrorStatus === undefined) firstErrorStatus = 200;
      lastMintErrorDetail = "empty_review_href";
      lastMintErrorCode = "empty_review_href";
      continue;
    }
    const displayName = String(p.name || "").trim() || "Recipient";
    const recipientEmail = String((p as { email?: string }).email ?? "").trim() || undefined;
    out.push({ displayName, reviewHref, ...(recipientEmail ? { recipientEmail } : {}) });
  }
  return { rows: out, attemptedMintCount, firstErrorStatus, lastMintErrorDetail, lastMintErrorCode };
}
