import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { agreementMagicLinkPath } from "../../agreement/AgreementRecipientReview";
import { mintRecipientAccessToken } from "../../agreement/recipientAccessApi";
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
};

export type SimpleDoneReviewLinksPayload = {
  v: 1;
  intent: "review";
  recipients: SimpleDoneReviewRecipientLinkRow[];
  savedAt: number;
};

function shortAgreementId(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

export function writeSimpleDoneReviewRecipientLinks(payload: {
  agreementId: string;
  recipients: SimpleDoneReviewRecipientLinkRow[];
}): void {
  const id = payload.agreementId.trim();
  if (!id) return;
  const full: SimpleDoneReviewLinksPayload = {
    v: 1,
    intent: "review",
    recipients: payload.recipients,
    savedAt: Date.now(),
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
    return {
      v: 1,
      intent: "review",
      recipients: o.recipients.filter(
        (r) => r && typeof r.displayName === "string" && typeof r.reviewHref === "string" && r.reviewHref.trim(),
      ),
      savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
    };
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

/** Mint personal review magic links for each counterparty row that passes review-link readiness (non-owner). */
export async function mintSimpleDoneReviewRecipientLinkRows(args: {
  agreementId: string;
  draft: AgreementDraft;
}): Promise<SimpleDoneReviewRecipientLinkRow[]> {
  const mintKey =
    (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env?.VITE_RECIPIENT_LINK_MINT_KEY ||
    "";
  const parties = args.draft.parties || [];
  const list = parties as AgreementParty[];
  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(list);
  const inviter = String(list[ownerIdx]?.name ?? "").trim();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const out: SimpleDoneReviewRecipientLinkRow[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i === ownerIdx) continue;
    const p = list[i]!;
    if (!rowReadyForReviewLinkInvite(p, i, list)) continue;
    const wf = String(p.role || "").trim().toLowerCase();
    const role: "signer" | "reviewer" | "recipient" =
      wf === "signer" ? "signer" : wf === "reviewer" ? "reviewer" : "recipient";
    const partyId = p.id && !String(p.id).startsWith("legacy_") ? String(p.id).trim() : undefined;
    const minted = await mintRecipientAccessToken(
      args.agreementId,
      {
        mode: "review",
        role,
        recipient_party_id: partyId || undefined,
        inviter_display_name: inviter || undefined,
      },
      mintKey,
    );
    if (!minted?.token) continue;
    const reviewHref = `${origin}${agreementMagicLinkPath(args.agreementId, minted.token)}`;
    const displayName = String(p.name || "").trim() || "Recipient";
    out.push({ displayName, reviewHref });
  }
  return out;
}
