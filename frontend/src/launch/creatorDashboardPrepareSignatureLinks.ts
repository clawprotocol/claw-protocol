import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import { findOpenRecipientProposals } from "../agreement/recipientProposal";
import { resolveGuidedVs01SigningHandoffForBridge } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import {
  linearPremiumRecipientSlots,
  MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS,
  readPremiumRecipientHandoff,
} from "../components/agreements/premiumPartyNamesHandoff";
import { tryNavigatePaidProAgreementSenderFirstVs01Esign } from "./simpleProduct/agreementToVs01SigningBridge";
import { mergeReviewLinkRecipientEmailsOntoHydratedDraft } from "./simpleProduct/reviewLinkRecipientEmailMerge";

export type CreatorPrepareSignatureLinksResult = {
  navigated: boolean;
  destination: string | null;
  bridgeAttempted: boolean;
  blockReason: string | null;
  vs01RouteAttempted: boolean;
};

/** Resume creator signature prep from dashboard — same VS01 bridge path as Review Link Ready. */
export async function navigateCreatorPrepareSignatureLinks(options: {
  agreementId: string;
  navigate: (path: string) => void | Promise<void>;
  /** When already loaded (dashboard hydration / prepare click), skip redundant fetch. */
  draft?: AgreementDraft | null;
  lockedVersionId?: string | null;
  /** When false, do not fall back to /app/done on bridge failure (dashboard shows inline notice). */
  navigateOnBridgeFailure?: boolean;
}): Promise<CreatorPrepareSignatureLinksResult> {
  const id = options.agreementId.trim();
  if (!id) {
    return {
      navigated: false,
      destination: null,
      bridgeAttempted: false,
      blockReason: "missing_agreement_id",
      vs01RouteAttempted: false,
    };
  }

  let draft = options.draft ?? null;
  let lockedVersionId = options.lockedVersionId ?? null;
  if (!draft) {
    const fetched = await fetchAgreementDraftWithSigningLock(id);
    draft = fetched.draft;
    lockedVersionId = fetched.lockedVersionId;
    if (!fetched.ok || !draft) {
      const destination = `/app/done/${encodeURIComponent(id)}`;
      if (options.navigateOnBridgeFailure !== false) {
        void options.navigate(destination);
        return {
          navigated: true,
          destination,
          bridgeAttempted: false,
          blockReason: "missing_draft",
          vs01RouteAttempted: false,
        };
      }
      return {
        navigated: false,
        destination: null,
        bridgeAttempted: false,
        blockReason: "missing_draft",
        vs01RouteAttempted: false,
      };
    }
  }

  const signingLockActive = Boolean((lockedVersionId || "").trim());

  const openCount = findOpenRecipientProposals(draft.audit_log).length;
  if (openCount > 0) {
    const destination = `/app/agreements/${encodeURIComponent(id)}`;
    void options.navigate(destination);
    return {
      navigated: true,
      destination,
      bridgeAttempted: false,
      blockReason: "open_recipient_proposals",
      vs01RouteAttempted: false,
    };
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

  const guidedSigningHandoff = resolveGuidedVs01SigningHandoffForBridge(null);

  const navigated = await tryNavigatePaidProAgreementSenderFirstVs01Esign({
    navigate: options.navigate,
    agreementId: id,
    draft: emailMergedDraft,
    logReason: signingLockActive ? "creator_dashboard_continue_vs01" : "creator_dashboard_prepare_signature_links",
    reviewerApprovedCleanHandoff: true,
    recipientSetup,
    guidedSigningHandoff,
  });

  if (navigated) {
    return {
      navigated: true,
      destination: null,
      bridgeAttempted: true,
      blockReason: null,
      vs01RouteAttempted: true,
    };
  }

  if (options.navigateOnBridgeFailure !== false) {
    const destination = `/app/done/${encodeURIComponent(id)}`;
    void options.navigate(destination);
    return {
      navigated: true,
      destination,
      bridgeAttempted: true,
      blockReason: "vs01_bridge_failed",
      vs01RouteAttempted: true,
    };
  }

  return {
    navigated: false,
    destination: null,
    bridgeAttempted: true,
    blockReason: "vs01_bridge_failed",
    vs01RouteAttempted: true,
  };
}
