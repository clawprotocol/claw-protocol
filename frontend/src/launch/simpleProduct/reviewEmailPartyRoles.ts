import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  fetchAgreementDraft,
  patchAgreementField,
} from "../../agreement/agreementWorkspaceApi";
import type { RecipientSetupEmailInput } from "./agreementToVs01SigningBridge";
import {
  mergeLiveDraftWithRecipientSetupForReviewLinks,
  mergeReviewLinkRecipientEmailsOntoHydratedDraft,
  resolveReviewLinkAssumedOwnerPartyIndex,
} from "./reviewLinkRecipientEmailMerge";

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
  return reviewEmailPartyContactNeedPersist(before, after);
}

/** True when server parties need a PATCH for review-email roles and/or contact emails. */
export function reviewEmailPartyContactNeedPersist(
  serverParties: readonly AgreementParty[],
  preparedParties: readonly AgreementParty[],
): boolean {
  if (serverParties.length !== preparedParties.length) return true;
  return preparedParties.some((p, i) => {
    const prev = serverParties[i];
    const roleChanged = String(prev?.role ?? "") !== String(p.role ?? "");
    const emailChanged =
      String(prev?.email ?? "").trim().toLowerCase() !== String(p.email ?? "").trim().toLowerCase();
    return roleChanged || emailChanged;
  });
}

function mergeLocalRecipientContactOntoDraft(
  draft: AgreementDraft,
  recipientSetup?: RecipientSetupEmailInput | null,
): AgreementDraft {
  if (!recipientSetup) return draft;
  return mergeLiveDraftWithRecipientSetupForReviewLinks(draft, recipientSetup) ?? draft;
}

/** Merge session/local contact fields onto the server draft, then normalize review-email roles. */
export function prepareReviewEmailPartyRowsForServer(
  serverDraft: AgreementDraft,
  localDraft: AgreementDraft,
  recipientSetup?: RecipientSetupEmailInput | null,
): AgreementParty[] {
  const localWithContact = mergeLocalRecipientContactOntoDraft(localDraft, recipientSetup);
  const merged = mergeReviewLinkRecipientEmailsOntoHydratedDraft(serverDraft, localWithContact);
  return ensureExplicitReviewEmailPartyRoles(merged.parties ?? []);
}

/** PATCH ``parties`` on the server draft when review-email roles or emails are missing. */
export async function persistReviewEmailPartyRolesOnServer(
  agreementId: string,
  draft: AgreementDraft,
  recipientSetup?: RecipientSetupEmailInput | null,
): Promise<{ ok: boolean; draft: AgreementDraft; rolesPersisted: boolean }> {
  const id = agreementId.trim();
  if (!id) return { ok: false, draft, rolesPersisted: false };

  const { ok: fetchOk, draft: serverDraft } = await fetchAgreementDraft(id);
  const serverBase = fetchOk && serverDraft ? serverDraft : draft;
  const parties = prepareReviewEmailPartyRowsForServer(serverBase, draft, recipientSetup);
  const nextDraft = { ...serverBase, parties };

  const needPersist = reviewEmailPartyContactNeedPersist(serverBase.parties ?? [], parties);
  if (!needPersist) return { ok: true, draft: nextDraft, rolesPersisted: false };

  const ok = await patchAgreementField(id, "parties", parties);
  if (!ok) return { ok: false, draft: nextDraft, rolesPersisted: false };
  return { ok: true, draft: nextDraft, rolesPersisted: true };
}
