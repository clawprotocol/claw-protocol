import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  fetchAgreementDraft,
  patchAgreementField,
} from "../../agreement/agreementWorkspaceApi";
import { partiesPayloadPreservingIds } from "../../components/agreements/preserveConfirmedPartyIds";
import type { RecipientSetupEmailInput } from "./agreementToVs01SigningBridge";
import {
  mergeLiveDraftWithRecipientSetupForReviewLinks,
  mergeReviewLinkRecipientEmailsOntoHydratedDraft,
  resolveReviewLinkAssumedOwnerPartyIndex,
  unionNamedLegalParties,
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
function namedLegalPartyCount(parties: readonly AgreementParty[]): number {
  return parties.filter((p) => String(p.name || "").trim().length >= 2).length;
}

export function ensureExplicitReviewEmailPartyRoles(
  parties: readonly AgreementParty[],
): AgreementParty[] {
  const list = parties.map((p) => ({ ...p }));
  if (!list.length) return list;

  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(list);

  // Three- and four-party deals: every named legal party reviews and signs.
  // Do not rewrite a commercial role into workspace-owner or reviewer.
  // Two-party Harbor-style drafts still stamp index 0 as owner for Resend exclusion.
  if (namedLegalPartyCount(list) >= 3) {
    return list;
  }
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
    const signerNameChanged =
      String(prev?.signerName ?? "").trim() !== String(p.signerName ?? "").trim();
    const signerTitleChanged =
      String(prev?.signerTitle ?? "").trim() !== String(p.signerTitle ?? "").trim();
    return roleChanged || emailChanged || signerNameChanged || signerTitleChanged;
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
  const parties = unionNamedLegalParties(merged.parties ?? [], [
    ...(serverDraft.parties ?? []),
    ...(localWithContact.parties ?? []),
  ]);
  return rejectCrossPartyEmailReuse(ensureExplicitReviewEmailPartyRoles(parties));
}

/** A persisted email belongs to one legal party. Never copy a sibling's address onto another row. */
export function rejectCrossPartyEmailReuse(parties: readonly AgreementParty[]): AgreementParty[] {
  const claimed = new Set<string>();
  return parties.map((party) => {
    const email = String(party.email || "").trim();
    const key = email.toLowerCase();
    if (!key) return { ...party };
    if (claimed.has(key)) return { ...party, email: undefined };
    claimed.add(key);
    return { ...party, email };
  });
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
  const parties = partiesPayloadPreservingIds(
    prepareReviewEmailPartyRowsForServer(serverBase, draft, recipientSetup),
    serverBase.parties ?? [],
  );
  if (namedLegalPartyCount(parties) < namedLegalPartyCount(serverBase.parties ?? [])) {
    return { ok: false, draft: serverBase, rolesPersisted: false };
  }
  const nextDraft = { ...serverBase, parties };

  const needPersist = reviewEmailPartyContactNeedPersist(serverBase.parties ?? [], parties);
  if (!needPersist) return { ok: true, draft: nextDraft, rolesPersisted: false };

  const ok = await patchAgreementField(id, "parties", parties);
  if (!ok) return { ok: false, draft: nextDraft, rolesPersisted: false };
  const refreshed = await fetchAgreementDraft(id);
  const persistedDraft = refreshed.ok && refreshed.draft ? refreshed.draft : nextDraft;
  if (namedLegalPartyCount(persistedDraft.parties ?? []) < namedLegalPartyCount(nextDraft.parties ?? [])) {
    return { ok: true, draft: nextDraft, rolesPersisted: true };
  }
  return { ok: true, draft: persistedDraft, rolesPersisted: true };
}
