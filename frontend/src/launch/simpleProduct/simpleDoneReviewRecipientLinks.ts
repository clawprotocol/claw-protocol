import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { agreementMagicLinkPath } from "../../agreement/AgreementRecipientReview";
import type { MintRecipientAccessTokenSuccess } from "../../agreement/recipientAccessApi";
import { mintRecipientAccessTokenResult } from "../../agreement/recipientAccessApi";
import { resolveReviewLinkAssumedOwnerPartyIndex, rowReadyForReviewLinkInvite } from "./reviewLinkRecipientEmailMerge";
import type { ReviewerLinkRow } from "./reviewerLinkRowModel";
import { extractReviewLinkTokenFromHref, redactReviewUrlForLog } from "./reviewerLinkRowModel";
import { recipientLinkTokenFingerprint } from "../../agreement/recipientLinkTokenFingerprint";

/**
 * Session handoff: after simple-home review-link flow, `/app/done` can show copyable per-recipient magic links
 * (distinct from the public `/verify/...` URL).
 */
export const simpleDoneReviewRecipientLinksStorageKey = (agreementId: string) =>
  `claw_simple_done_review_recipient_links_v1_${encodeURIComponent(agreementId.trim())}`;

/** One minted reviewer-specific link row (session handoff). */
export type SimpleDoneReviewRecipientLinkRow = ReviewerLinkRow;

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
    const recipients = o.recipients
      .filter(
        (r) => r && typeof r.displayName === "string" && typeof r.reviewHref === "string" && r.reviewHref.trim(),
      )
      .map((r) => {
        const row = r as Record<string, unknown>;
        const base: SimpleDoneReviewRecipientLinkRow = {
          displayName: String(row.displayName || "").trim(),
          reviewHref: String(row.reviewHref || "").trim(),
        };
        const em = String(row.recipientEmail ?? row.reviewer_email ?? "").trim();
        if (em) {
          base.recipientEmail = em;
          base.reviewer_email = em;
        }
        const pid = String(row.recipientPartyId ?? row.reviewer_id ?? "").trim();
        if (pid) {
          base.recipientPartyId = pid;
          base.reviewer_id = pid;
        }
        if (typeof row.party_index === "number" && Number.isFinite(row.party_index)) {
          base.party_index = row.party_index;
        }
        const pn = String(row.party_name ?? "").trim();
        if (pn) base.party_name = pn;
        const rn = String(row.reviewer_name ?? "").trim();
        if (rn) base.reviewer_name = rn;
        const ts = String(row.token_status ?? "").trim();
        if (ts === "active" || ts === "unknown" || ts === "expired") base.token_status = ts;
        const ca = String(row.created_at ?? "").trim();
        if (ca) base.created_at = ca;
        const lo = String(row.last_opened_at ?? "").trim();
        if (lo) base.last_opened_at = lo;
        return base;
      });
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
  /** Authoritative signing corpus for preflight logging (guided Pro handoff). */
  signingCorpusPlain?: string | null;
  signingCorpusSource?: string | null;
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
  const signingCorpusLen = (args.signingCorpusPlain ?? "").trim().length;
  const draftDocumentLen = Math.max(
    String((args.draft as { document_text?: string }).document_text ?? "").length,
    String((args.draft as { server_full_document_text?: string }).server_full_document_text ?? "").length,
    String((args.draft as { premium_full_document_text?: string }).premium_full_document_text ?? "").length,
  );
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
      {
        recipientCount: Math.max(0, list.length - 1),
        signerCount: list.filter((p) => (p.name || "").trim().length > 0).length,
        hasDocumentText: signingCorpusLen > 0 || draftDocumentLen > 0,
        documentTextLen: signingCorpusLen > 0 ? signingCorpusLen : draftDocumentLen || undefined,
        hasTitle: Boolean((args.draft.title || "").trim()),
        hasPartyLabels: list.filter((p) => (p.name || "").trim()).length > 0,
        documentTextSource:
          signingCorpusLen > 0
            ? args.signingCorpusSource ?? "signing_corpus_plain"
            : draftDocumentLen > 0
              ? "draft_fields"
              : "none",
      },
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
    const createdAt = new Date().toISOString();
    const row: SimpleDoneReviewRecipientLinkRow = {
      displayName,
      reviewHref,
      party_index: i,
      party_name: displayName,
      reviewer_name: displayName,
      token_status: "active",
      created_at: createdAt,
      ...(recipientEmail ? { recipientEmail, reviewer_email: recipientEmail } : {}),
      ...(partyId ? { recipientPartyId: partyId, reviewer_id: partyId } : {}),
    };
    out.push(row);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[review-link-mint-row]", {
        agreementIdShort: args.agreementId.trim().length <= 12 ? args.agreementId.trim() : `${args.agreementId.trim().slice(0, 8)}…`,
        partyIndex: i,
        reviewUrlForLog: redactReviewUrlForLog(reviewHref),
      });
    }
  }
  if (import.meta.env.DEV && out.length > 1) {
    const hrefSet = new Set(out.map((r) => r.reviewHref.trim()));
    if (hrefSet.size !== out.length) {
      const id = args.agreementId.trim();
      // eslint-disable-next-line no-console
      console.error("[review-link-mint-invariant]", {
        kind: "duplicate_reviewHref",
        agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
        rowCount: out.length,
        uniqueHrefCount: hrefSet.size,
      });
    }
    const fpList = out.map((r) => recipientLinkTokenFingerprint(extractReviewLinkTokenFromHref(r.reviewHref)));
    const nonempty = fpList.filter(Boolean);
    if (nonempty.length > 0 && new Set(nonempty).size !== nonempty.length) {
      const id = args.agreementId.trim();
      // eslint-disable-next-line no-console
      console.error("[review-link-mint-invariant]", {
        kind: "duplicate_token_fingerprint",
        agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
        rowCount: out.length,
      });
    }
  }
  return { rows: out, attemptedMintCount, firstErrorStatus, lastMintErrorDetail, lastMintErrorCode };
}
