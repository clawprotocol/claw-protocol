import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import { findOpenRecipientProposals } from "../agreement/recipientProposal";
import {
  resolveGuidedVs01SigningHandoffForBridge,
  mergeAgreementDraftWithGuidedSigningHandoff,
} from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import {
  buildAgreementVs01BridgeSession,
  fetchAgreementVs01SigningSeed,
  resolveBridgeAgreementCorpusFromDraft,
  setPaidProAgreementBridgeSkipMarker,
  tryNavigatePaidProAgreementSenderFirstVs01Esign,
  writeAgreementVs01BridgeSession,
} from "./simpleProduct/agreementToVs01SigningBridge";
import { resolveAgreementCorpusForPrepareHandoff } from "../vs01/vs01PrepareBridgeCorpus";
import { ensureReviewCorpusOnEsignEntry } from "../vs01/vs01EsignRemountReviewBind";
import { resolveExistingPreparedDocumentId } from "../vs01/vs01PreparePlacementBeforeLinks";
import { mergeReviewLinkRecipientEmailsOntoHydratedDraft } from "./simpleProduct/reviewLinkRecipientEmailMerge";
import {
  buildVs01OwnerPrepareEsignPath,
  resolveVs01OwnerPrepareEsignRoute,
} from "./vs01OwnerPrepareRoute";

export type CreatorPrepareSignatureLinksResult = {
  navigated: boolean;
  destination: string | null;
  bridgeAttempted: boolean;
  blockReason: string | null;
  vs01RouteAttempted: boolean;
};

async function tryNavigateVs01PrepareFromPersistedSeed(options: {
  agreementId: string;
  draft: AgreementDraft;
  navigate: (path: string) => void | Promise<void>;
  reviewerApprovedCleanHandoff: boolean;
}): Promise<string | null> {
  const id = options.agreementId.trim();
  const guidedSigningHandoff = resolveGuidedVs01SigningHandoffForBridge(undefined);
  const mergedDraft = mergeAgreementDraftWithGuidedSigningHandoff(options.draft, guidedSigningHandoff);
  const seed = await fetchAgreementVs01SigningSeed(id, mergedDraft);
  if (!seed.ok || !seed.documentId.trim()) return null;
  const bridge = buildAgreementVs01BridgeSession({
    agreementId: id,
    vs01DocumentId: seed.documentId,
    draft: mergedDraft,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: options.reviewerApprovedCleanHandoff,
    agreementCorpusText: resolveBridgeAgreementCorpusFromDraft(mergedDraft) || undefined,
  });
  writeAgreementVs01BridgeSession(bridge);
  setPaidProAgreementBridgeSkipMarker(seed.documentId);
  const route = buildVs01OwnerPrepareEsignPath(seed.documentId);
  void options.navigate(route);
  return route;
}

/** Resume creator signature prep from dashboard or review-complete — same VS01 bridge path as Review Link Ready. */
export async function navigateCreatorPrepareSignatureLinks(options: {
  agreementId: string;
  navigate: (path: string) => void | Promise<void>;
  /** When already loaded (dashboard hydration / prepare click), skip redundant fetch. */
  draft?: AgreementDraft | null;
  lockedVersionId?: string | null;
  /**
   * When true, navigate to negotiation workspace on missing draft / bridge failure (legacy tests only).
   * Default false — production surfaces show inline notices or stay put.
   */
  navigateOnBridgeFailure?: boolean;
  /** Diagnostic source label (dashboard vs review-complete). */
  logSource?: "creator_dashboard" | "creator_review_complete";
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
      const destination = `/app/agreements/${encodeURIComponent(id)}`;
      if (options.navigateOnBridgeFailure === true) {
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
  const agreementCorpusText = resolveAgreementCorpusForPrepareHandoff({
    agreementId: id,
    draft: emailMergedDraft,
  });
  const guidedSigningHandoff = resolveGuidedVs01SigningHandoffForBridge(undefined);

  const navigated = await tryNavigatePaidProAgreementSenderFirstVs01Esign({
    navigate: options.navigate,
    agreementId: id,
    draft: emailMergedDraft,
    logReason: signingLockActive
      ? "creator_dashboard_continue_vs01"
      : options.logSource === "creator_review_complete"
        ? "creator_review_complete_prepare_signature_links"
        : "creator_dashboard_prepare_signature_links",
    reviewerApprovedCleanHandoff: true,
    recipientSetup: null,
    agreementCorpusText: agreementCorpusText || null,
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

  const existingRoute = resolveVs01OwnerPrepareEsignRoute(id);
  if (existingRoute) {
    const leftoverDoc = resolveExistingPreparedDocumentId(id);
    if (leftoverDoc) {
      await ensureReviewCorpusOnEsignEntry({
        documentId: leftoverDoc,
        agreementId: id,
        draft: emailMergedDraft,
        reviewCorpus: agreementCorpusText || null,
      });
    }
    void options.navigate(existingRoute);
    return {
      navigated: true,
      destination: existingRoute,
      bridgeAttempted: true,
      blockReason: null,
      vs01RouteAttempted: true,
    };
  }

  const seededRoute = await tryNavigateVs01PrepareFromPersistedSeed({
    agreementId: id,
    draft: emailMergedDraft,
    navigate: options.navigate,
    reviewerApprovedCleanHandoff: true,
  });
  if (seededRoute) {
    return {
      navigated: true,
      destination: seededRoute,
      bridgeAttempted: true,
      blockReason: null,
      vs01RouteAttempted: true,
    };
  }

  if (options.navigateOnBridgeFailure === true) {
    const destination = `/app/agreements/${encodeURIComponent(id)}`;
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
