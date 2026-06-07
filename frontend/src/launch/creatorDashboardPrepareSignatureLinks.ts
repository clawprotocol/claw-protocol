import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import { findOpenRecipientProposals } from "../agreement/recipientProposal";
import {
  linearPremiumRecipientSlots,
  MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS,
  readPremiumRecipientHandoff,
} from "../components/agreements/premiumPartyNamesHandoff";
import { tryNavigatePaidProAgreementSenderFirstVs01Esign } from "./simpleProduct/agreementToVs01SigningBridge";
import { mergeReviewLinkRecipientEmailsOntoHydratedDraft } from "./simpleProduct/reviewLinkRecipientEmailMerge";

/** Resume creator signature prep from dashboard — same VS01 bridge path as Review Link Ready. */
export async function navigateCreatorPrepareSignatureLinks(options: {
  agreementId: string;
  navigate: (path: string) => void | Promise<void>;
}): Promise<void> {
  const id = options.agreementId.trim();
  if (!id) return;

  const { ok, draft, lockedVersionId } = await fetchAgreementDraftWithSigningLock(id);
  const signingLockActive = Boolean((lockedVersionId || "").trim());

  if (!ok || !draft) {
    void options.navigate(`/app/done/${encodeURIComponent(id)}`);
    return;
  }

  const openCount = findOpenRecipientProposals(draft.audit_log).length;
  if (openCount > 0) {
    void options.navigate(`/app/agreements/${encodeURIComponent(id)}`);
    return;
  }

  const emailMergedDraft = mergeReviewLinkRecipientEmailsOntoHydratedDraft(draft, null);
  const handoff = readPremiumRecipientHandoff();
  const partyCap = Math.min((emailMergedDraft.parties ?? []).length, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  const recipientSetup =
    handoff && partyCap > 0
      ? {
          recipientPartyEmails: linearPremiumRecipientSlots(handoff, partyCap).map((s) => s.email || ""),
          recipientPartySignerNames: linearPremiumRecipientSlots(handoff, partyCap).map(
            (s) => s.signerName || "",
          ),
          recipientPartySignerTitles: linearPremiumRecipientSlots(handoff, partyCap).map(
            (s) => s.signerTitle || "",
          ),
        }
      : null;

  const navigated = await tryNavigatePaidProAgreementSenderFirstVs01Esign({
    navigate: options.navigate,
    agreementId: id,
    draft: emailMergedDraft,
    logReason: signingLockActive ? "creator_dashboard_continue_vs01" : "creator_dashboard_prepare_signature_links",
    reviewerApprovedCleanHandoff: true,
    recipientSetup,
  });

  if (!navigated) {
    void options.navigate(`/app/done/${encodeURIComponent(id)}`);
  }
}
