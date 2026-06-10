import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { patchAgreementField } from "../../agreement/agreementWorkspaceApi";
import { resolveReviewLinkAssumedOwnerPartyIndex } from "./reviewLinkRecipientEmailMerge";

const OWNER_NORMALIZED = new Set(["owner", "sender", "landlord"]);

/** Matches backend ``_normalize_workflow_role`` owner bucket for live Resend exclusion. */
export function isOwnerNormalizedWorkflowRole(role: string | undefined | null): boolean {
  return OWNER_NORMALIZED.has(String(role ?? "").trim().toLowerCase());
}

/**
 * Ensure persisted draft parties carry explicit owner/reviewer roles for live Resend review invites.
 * Paid Pro drafts often use ``client`` / ``service_provider`` — not owner-normalized — until this runs.
 */
export function ensureExplicitReviewEmailPartyRoles(
  parties: readonly AgreementParty[],
): AgreementParty[] {
  const list = parties.map((p) => ({ ...p }));
  if (!list.length) return list;

  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(list);

  if (!isOwnerNormalizedWorkflowRole(list[ownerIdx]?.role)) {
    const prev = list[ownerIdx];
    if (prev) list[ownerIdx] = { ...prev, role: "owner" };
  }

  for (let i = 0; i < list.length; i++) {
    if (i === ownerIdx) continue;
    const p = list[i];
    if (!p || isOwnerNormalizedWorkflowRole(p.role)) continue;
    const r = String(p.role ?? "").trim().toLowerCase();
    if (r === "reviewer" || r === "signer" || r === "signatory") continue;
    list[i] = { ...p, role: "reviewer" };
  }
  return list;
}

export function reviewEmailPartyRolesNeedPersist(
  before: readonly AgreementParty[],
  after: readonly AgreementParty[],
): boolean {
  if (before.length !== after.length) return true;
  return after.some((p, i) => String(before[i]?.role ?? "") !== String(p.role ?? ""));
}

/** PATCH ``parties`` on the server draft when review-email roles are missing. */
export async function persistReviewEmailPartyRolesOnServer(
  agreementId: string,
  draft: AgreementDraft,
): Promise<{ ok: boolean; draft: AgreementDraft; rolesPersisted: boolean }> {
  const id = agreementId.trim();
  const parties = ensureExplicitReviewEmailPartyRoles(draft.parties ?? []);
  const nextDraft = { ...draft, parties };
  if (!id) return { ok: false, draft: nextDraft, rolesPersisted: false };

  const needPersist = reviewEmailPartyRolesNeedPersist(draft.parties ?? [], parties);
  if (!needPersist) return { ok: true, draft: nextDraft, rolesPersisted: false };

  const ok = await patchAgreementField(id, "parties", parties);
  if (!ok) return { ok: false, draft: nextDraft, rolesPersisted: false };
  return { ok: true, draft: nextDraft, rolesPersisted: true };
}
