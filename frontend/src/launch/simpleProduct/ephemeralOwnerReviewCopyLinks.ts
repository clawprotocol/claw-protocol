/**
 * Ephemeral in-memory owner copy-link handoff (GTM Security Slice 3B).
 * Credential-bearing URLs must never enter sessionStorage/localStorage.
 */

import type { SimpleDoneReviewLinksPayload, SimpleDoneReviewRecipientLinkRow } from "./simpleDoneReviewRecipientLinks";

/** Short TTL — owner copy links are only needed briefly on the done page. */
export const EPHEMERAL_OWNER_REVIEW_COPY_LINK_TTL_MS = 15 * 60 * 1000;

type EphemeralEntry = SimpleDoneReviewLinksPayload & { expiresAt: number };

const ephemeralByAgreement = new Map<string, EphemeralEntry>();
let lifecycleInstalled = false;

function purgeExpiredEntries(now = Date.now()): void {
  for (const [id, entry] of ephemeralByAgreement.entries()) {
    if (entry.expiresAt <= now) {
      ephemeralByAgreement.delete(id);
    }
  }
}

export function writeEphemeralOwnerReviewCopyLinks(payload: {
  agreementId: string;
  recipients: SimpleDoneReviewRecipientLinkRow[];
  reviewLinksPending?: boolean;
  agreementPartyDisplayNames?: string[];
}): void {
  const id = payload.agreementId.trim();
  if (!id) return;
  purgeExpiredEntries();
  const partyNames = payload.agreementPartyDisplayNames?.filter((n) => typeof n === "string" && n.trim());
  const now = Date.now();
  ephemeralByAgreement.set(id, {
    v: 1,
    intent: "review",
    recipients: payload.recipients,
    savedAt: now,
    expiresAt: now + EPHEMERAL_OWNER_REVIEW_COPY_LINK_TTL_MS,
    ...(payload.reviewLinksPending === true ? { reviewLinksPending: true } : {}),
    ...(partyNames && partyNames.length > 0 ? { agreementPartyDisplayNames: partyNames } : {}),
  });
}

export function readEphemeralOwnerReviewCopyLinks(agreementId: string): SimpleDoneReviewLinksPayload | null {
  const id = agreementId.trim();
  if (!id) return null;
  purgeExpiredEntries();
  const entry = ephemeralByAgreement.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    ephemeralByAgreement.delete(id);
    return null;
  }
  const { expiresAt, ...payload } = entry;
  void expiresAt;
  return payload;
}

export function clearEphemeralOwnerReviewCopyLinks(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  ephemeralByAgreement.delete(id);
}

export function clearAllEphemeralOwnerReviewCopyLinks(): void {
  ephemeralByAgreement.clear();
}

/** Drop expired entries and any agreement not matching the active done-page id. */
export function pruneEphemeralOwnerReviewCopyLinks(activeAgreementId?: string): void {
  purgeExpiredEntries();
  const active = (activeAgreementId || "").trim();
  if (!active) return;
  for (const id of [...ephemeralByAgreement.keys()]) {
    if (id !== active) {
      ephemeralByAgreement.delete(id);
    }
  }
}

/** Install navigation/unmount cleanup for abandoned pre-done-page flows. */
export function installEphemeralOwnerReviewCopyLinkLifecycle(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  if (lifecycleInstalled) {
    return () => {};
  }
  lifecycleInstalled = true;
  const onPageHide = () => {
    purgeExpiredEntries();
  };
  window.addEventListener("pagehide", onPageHide);
  return () => {
    window.removeEventListener("pagehide", onPageHide);
    lifecycleInstalled = false;
    purgeExpiredEntries();
  };
}

/** @internal test helper */
export function ephemeralOwnerReviewCopyLinkAgreementIds(): string[] {
  purgeExpiredEntries();
  return [...ephemeralByAgreement.keys()];
}

/** @internal test helper */
export function resetEphemeralOwnerReviewCopyLinksForTests(): void {
  ephemeralByAgreement.clear();
  lifecycleInstalled = false;
}
