import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";
import {
  loadRecipientMagicLinkSession,
  type RecipientMagicLinkSession,
} from "./recipientMagicLinkSession";

function safeParse(raw: string | null): RecipientMagicLinkSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as RecipientMagicLinkSession;
    if (!o || typeof o.agreementId !== "string" || typeof o.token !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Recover a scoped magic-link session after the URL token query was stripped.
 * Only returns rows for the requested agreement id.
 */
export function loadAnyRecipientMagicLinkSessionForAgreement(
  agreementId: string,
): RecipientMagicLinkSession | null {
  const want = (agreementId || "").trim();
  if (!want || typeof sessionStorage === "undefined") return null;
  try {
    const prefix = `claw_rml_v2:${want}:`;
    let best: RecipientMagicLinkSession | null = null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const cur = safeParse(sessionStorage.getItem(key));
      if (!cur || cur.agreementId !== want || !cur.token.trim()) continue;
      best = cur;
      break;
    }
    return best;
  } catch {
    return null;
  }
}

export function resolveReviewerEffectiveAccessToken(args: {
  agreementId: string;
  urlToken?: string | null;
  propToken?: string | null;
}): { token: string; source: "url" | "session" | "prop" | "none" } {
  const urlTok = (args.urlToken || "").trim();
  if (urlTok) return { token: urlTok, source: "url" };
  const propTok = (args.propToken || "").trim();
  if (propTok) return { token: propTok, source: "prop" };
  const session = loadAnyRecipientMagicLinkSessionForAgreement(args.agreementId);
  if (session?.token.trim()) return { token: session.token.trim(), source: "session" };
  return { token: "", source: "none" };
}

export function resolveReviewerEffectiveParticipantId(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
  validatedPartyId?: string | null;
  urlPartyId?: string | null;
  tokenValidatedPartyId?: string | null;
  draftParties?: Array<{ id?: string; role?: string }> | null;
}): string {
  return resolveReviewFirstStageProposerId(args).proposerId;
}

export type ReviewFirstStageProposerSource =
  | "participant_prop"
  | "token_validation"
  | "url_party_param"
  | "session"
  | "single_non_owner_party"
  | "deferred_to_backend_token"
  | "none";

export function readReviewUrlPartyId(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URL(window.location.href).searchParams.get("p")?.trim() || "";
  } catch {
    return "";
  }
}

export function inferSingleNonOwnerPartyId(
  parties: Array<{ id?: string; role?: string }> | null | undefined,
): string {
  if (!parties?.length) return "";
  const candidates: string[] = [];
  for (const p of parties) {
    const id = String(p.id ?? "").trim();
    if (!id || id.startsWith("legacy_")) continue;
    const role = String(p.role ?? "").trim().toLowerCase();
    if (role === "owner" || role === "viewer") continue;
    candidates.push(id);
  }
  return candidates.length === 1 ? candidates[0] : "";
}

export function resolveReviewFirstStageProposerId(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
  validatedPartyId?: string | null;
  urlPartyId?: string | null;
  tokenValidatedPartyId?: string | null;
  draftParties?: Array<{ id?: string; role?: string }> | null;
}): { proposerId: string; source: ReviewFirstStageProposerSource } {
  const fromProp = (args.participantPartyId || "").trim();
  if (fromProp) return { proposerId: fromProp, source: "participant_prop" };

  const fromTokenValidation = (args.tokenValidatedPartyId || args.validatedPartyId || "").trim();
  if (fromTokenValidation) return { proposerId: fromTokenValidation, source: "token_validation" };

  const fromUrl = (args.urlPartyId || readReviewUrlPartyId()).trim();
  if (fromUrl) return { proposerId: fromUrl, source: "url_party_param" };

  const tok = (args.recipientAccessToken || "").trim();
  if (tok) {
    const session = loadRecipientMagicLinkSession(args.agreementId, tok);
    const fromScopedSession = (session?.recipientPartyId || "").trim();
    if (fromScopedSession) return { proposerId: fromScopedSession, source: "session" };
  }
  const anySession = loadAnyRecipientMagicLinkSessionForAgreement(args.agreementId);
  const fromAnySession = (anySession?.recipientPartyId || "").trim();
  if (fromAnySession) return { proposerId: fromAnySession, source: "session" };

  const inferred = inferSingleNonOwnerPartyId(args.draftParties);
  if (inferred) return { proposerId: inferred, source: "single_non_owner_party" };

  if (tok) return { proposerId: "", source: "deferred_to_backend_token" };

  return { proposerId: "", source: "none" };
}

export function reviewerNeedsPersonalizedLink(args: {
  entryKind: string;
  partiesHaveIds: boolean;
  participantPid: string;
  recipientAccessToken: string;
}): boolean {
  if (args.entryKind !== "review") return false;
  if (!args.partiesHaveIds) return false;
  if (args.recipientAccessToken.trim()) return false;
  return !args.participantPid.trim();
}

export function logReviewerTokenDetected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-detected]", payload);
}

export function logReviewerTokenPersisted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-persisted]", payload);
}

export function logReviewerTokenMissing(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-missing]", payload);
}

export function logReviewFirstSubmitAuthority(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-authority]", payload);
}

export function reviewerTokenHashShort(token: string): string | null {
  const t = (token || "").trim();
  if (!t) return null;
  return recipientLinkTokenFingerprint(t);
}
