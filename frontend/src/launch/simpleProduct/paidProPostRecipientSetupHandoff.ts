import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fetchAgreementDraft, postReviewSentServer } from "../../agreement/agreementWorkspaceApi";
import {
  assertGuidedProVs01BridgeCorpusReady,
  buildGuidedVs01SigningHandoff,
  logGuidedProVs01BridgeCorpusBlocked,
  type GuidedVs01SigningHandoff,
} from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  mergeAgreementDraftWithGuidedSigningHandoff,
  resolveGuidedVs01SigningHandoffForBridge,
  writeGuidedVs01SigningHandoffSession,
} from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import { orderedAuthoritativePartyDisplayNames } from "../../agreement/handoffPartyDisplay";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import { emitActionCompleted } from "../../joy/joyTelemetry";
import { markSimpleFlowSent } from "../simpleFlowSent";
import { writeCreateReviewAgreementResumeId } from "../../components/agreements/agreementIntakeStorage";
import {
  tryNavigateGuidedSignatureTrackLocalVs01Esign,
  tryNavigatePaidProAgreementSenderFirstVs01Esign,
  type RecipientSetupEmailInput,
} from "./agreementToVs01SigningBridge";
import {
  mergePaidSessionSignatureTrackDraft,
  resolvePaidSessionSignatureTrackHandoff,
} from "../../components/agreements/paidProPaidSessionLanding";
import {
  peekPaidProStarterSignatureSendFromCreateFlow,
  peekPremiumSenderSignFirst,
  type PremiumSendIntent,
} from "./premiumSendIntent";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  reviewLinkMintFailureUserCopy,
  reviewLinkMintHasUsableUrls,
  writeSimpleDoneReviewRecipientLinks,
} from "./simpleDoneReviewRecipientLinks";
import { REVIEW_LINKS_ALREADY_READY_MESSAGE } from "./reviewLinkMintIdempotency";
import {
  logReviewFirstOwnerRouteResolved,
  resolveOwnerPostReviewSendRoute,
} from "./reviewDeliveryOwnerRouting";
import { writeReviewDeliveryHandoffNotice } from "../reviewDeliveryHandoffNotice";
import {
  logReviewFirstMintError,
  logReviewFirstMintStart,
  logReviewFirstMintSuccess,
} from "../../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning";
import { resolveReviewFirstMintPolicyGate } from "./reviewFirstAccessPolicy";
import { persistReviewEmailPartyRolesOnServer } from "./reviewEmailPartyRoles";
import {
  clearReviewFirstMintInFlight,
  mergeDraftWithReviewFirstPinnedCorpus,
  peekReviewFirstMintInFlight,
  peekReviewFirstPinnedCorpus,
  isReviewFirstSigningTokenSecretNotConfigured,
  logReviewFirstEnvTokenSecretMissing,
  resolveReviewFirstMintFailureUserMessage,
  setReviewFirstMintInFlight,
} from "./reviewFirstSendSurface";

export type PaidProPostRecipientSetupFailure = {
  userMessage: string;
  reason: "review_link_mint" | "vs01_seed";
  agreementId: string;
  premiumSendIntent: PremiumSendIntent;
  mintErrorCode?: string | null;
};

export type PaidProPostRecipientSetupResult =
  | {
      ok: true;
      destination: "vs01" | "done" | "dashboard";
      ownerRoutePath: string;
      alreadyReady?: boolean;
      userMessage?: string;
    }
  | { ok: false; failure: PaidProPostRecipientSetupFailure };

/** Paid/pro paths that already confirmed recipients in intake — skip `/app/send` “Prepare review link”. */
export function shouldSkipPaidProPrepareReviewLinkInterstitial(params: {
  draft: AgreementDraft | null;
  agreementId: string;
  premiumSendIntent: PremiumSendIntent | null;
}): boolean {
  if (!isPaidProAgreementAuthoritative({ draft: params.draft, agreementId: params.agreementId })) {
    return false;
  }
  const intent = params.premiumSendIntent;
  if (intent === "review") return true;
  if (intent === "signature" && (peekPremiumSenderSignFirst() || peekPaidProStarterSignatureSendFromCreateFlow())) {
    return true;
  }
  return false;
}

const reviewLinkHandoffInFlight = new Map<
  string,
  Promise<{ ok: true; alreadyReady: boolean } | { ok: false; failure: PaidProPostRecipientSetupFailure }>
>();

async function mintAndPersistReviewLinksForHandoff(
  agreementId: string,
  draft: AgreementDraft,
  premiumSendIntent: PremiumSendIntent,
  agreementCorpusText?: string | null,
  logSource?: string,
  agreementCorpusSource?: string | null,
): Promise<
  | { ok: true; alreadyReady: boolean }
  | { ok: false; failure: PaidProPostRecipientSetupFailure }
> {
  const id = agreementId.trim();
  const existing = reviewLinkHandoffInFlight.get(id);
  if (existing) return existing;
  const work = mintAndPersistReviewLinksForHandoffUnlocked(
    id,
    draft,
    premiumSendIntent,
    agreementCorpusText,
    logSource,
    agreementCorpusSource,
  );
  reviewLinkHandoffInFlight.set(id, work);
  try {
    return await work;
  } finally {
    if (reviewLinkHandoffInFlight.get(id) === work) reviewLinkHandoffInFlight.delete(id);
  }
}

async function mintAndPersistReviewLinksForHandoffUnlocked(
  id: string,
  draft: AgreementDraft,
  premiumSendIntent: PremiumSendIntent,
  agreementCorpusText?: string | null,
  logSource?: string,
  agreementCorpusSource?: string | null,
): Promise<
  | { ok: true; alreadyReady: boolean }
  | { ok: false; failure: PaidProPostRecipientSetupFailure }
> {
  const draftForMint = mergeDraftWithReviewFirstPinnedCorpus(draft, id);
  const signingCorpusPlain = (agreementCorpusText ?? peekReviewFirstPinnedCorpus(id) ?? "").trim();
  const draftDocumentLen = Math.max(
    String((draftForMint as { document_text?: string }).document_text ?? "").length,
    String((draftForMint as { server_full_document_text?: string }).server_full_document_text ?? "").length,
    String((draftForMint as { premium_full_document_text?: string }).premium_full_document_text ?? "").length,
  );
  const policyGate = await resolveReviewFirstMintPolicyGate({
    agreementId: id,
    source: logSource ?? null,
  });
  if (!policyGate.ok) {
    return {
      ok: false,
      failure: {
        agreementId: id,
        reason: "review_link_mint",
        userMessage: policyGate.userMessage,
        premiumSendIntent,
        mintErrorCode: policyGate.mintErrorCode,
      },
    };
  }

  logReviewFirstMintStart({
    agreementId: id,
    source: logSource ?? null,
    signingCorpusLen: signingCorpusPlain.length,
    draftDocumentLen,
  });
  let linkRows: Awaited<ReturnType<typeof mintSimpleDoneReviewRecipientLinkRows>>["rows"] = [];
  let mintThrew = false;
  let mintMeta: {
    firstErrorStatus?: number;
    lastMintErrorDetail?: string;
    lastMintErrorCode?: string;
  } = {};
  try {
    const minted = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: id,
      draft: draftForMint,
      includeOwnerWithReadyReviewEmail: true,
      signingCorpusPlain: signingCorpusPlain || undefined,
      signingCorpusSource: signingCorpusPlain
        ? (agreementCorpusSource ?? "review_first_pinned_corpus").trim() || "review_first_pinned_corpus"
        : undefined,
    });
    linkRows = minted.rows;
    mintMeta = {
      firstErrorStatus: minted.firstErrorStatus,
      lastMintErrorDetail: minted.lastMintErrorDetail,
      lastMintErrorCode: minted.lastMintErrorCode,
    };
    if (minted.alreadyReady && minted.attemptedMintCount === 0) {
      writeSimpleDoneReviewRecipientLinks({
        agreementId: id,
        recipients: linkRows,
        agreementPartyDisplayNames: orderedAuthoritativePartyDisplayNames(draftForMint.parties),
      });
      logReviewFirstMintSuccess({
        agreementId: id,
        source: logSource ?? null,
        recipientCount: linkRows.length,
      });
      return { ok: true, alreadyReady: true };
    }
  } catch {
    mintThrew = true;
    linkRows = [];
  }
  const mintSucceeded = reviewLinkMintHasUsableUrls(linkRows);
  if (!mintSucceeded || mintThrew) {
    const userMessage = resolveReviewFirstMintFailureUserMessage({
      ...mintMeta,
      fallback: reviewLinkMintFailureUserCopy(mintMeta),
    });
    const mintErrorCode = mintMeta.lastMintErrorCode ?? null;
    logReviewFirstMintError({
      agreementId: id,
      source: logSource ?? null,
      code: mintErrorCode,
      status: mintMeta.firstErrorStatus ?? null,
    });
    if (
      isReviewFirstSigningTokenSecretNotConfigured({
        errorCode: mintErrorCode,
        message: userMessage,
      })
    ) {
      logReviewFirstEnvTokenSecretMissing({ agreementId: id, source: logSource ?? null });
    }
    return {
      ok: false,
      failure: {
        agreementId: id,
        reason: "review_link_mint",
        userMessage,
        premiumSendIntent,
        mintErrorCode,
      },
    };
  }
  logReviewFirstMintSuccess({ agreementId: id, source: logSource ?? null, recipientCount: linkRows.length });
  writeSimpleDoneReviewRecipientLinks({
    agreementId: id,
    recipients: linkRows,
    agreementPartyDisplayNames: orderedAuthoritativePartyDisplayNames(draftForMint.parties),
  });
  return { ok: true, alreadyReady: false };
}

export type ReviewSentHandoffResult = {
  attempted: boolean;
  ok: boolean;
  inviteEmailsSent: boolean;
  skipped?: "invite_emails_already_sent";
};

export function reviewInviteEmailsAlreadySent(draft: AgreementDraft | null | undefined): boolean {
  return Boolean(String(draft?.review_invite_emails_sent_at ?? "").trim());
}

/** Notify server that review was sent (sets review_sent_at, webhooks, optional Resend). */
export async function maybePostReviewSentAfterReviewFirstHandoff(
  agreementId: string,
  draft: AgreementDraft,
  logSource?: string,
): Promise<ReviewSentHandoffResult> {
  const id = agreementId.trim();
  if (!id) return { attempted: false, ok: false, inviteEmailsSent: false };

  const { ok: fetchOk, draft: serverDraft } = await fetchAgreementDraft(id);
  const draftForCheck = fetchOk && serverDraft ? serverDraft : draft;

  if (reviewInviteEmailsAlreadySent(draftForCheck)) {
    // eslint-disable-next-line no-console
    console.info("[review-first-review-sent-skipped]", {
      agreementId: id,
      reason: "invite_emails_already_sent",
      reviewSentAtPresent: Boolean((draftForCheck.review_sent_at || "").trim()),
      source: logSource ?? null,
    });
    return {
      attempted: false,
      ok: true,
      inviteEmailsSent: true,
      skipped: "invite_emails_already_sent",
    };
  }

  // Mint may have set review_sent_at during corpus persist; still POST so email delivery runs once.
  const result = await postReviewSentServer(id);
  // eslint-disable-next-line no-console
  console.info("[review-first-review-sent]", {
    agreementId: id,
    ok: result.ok,
    inviteEmailsSent: result.inviteEmailsSent,
    reviewSentAtPresent: Boolean((draftForCheck.review_sent_at || "").trim()),
    source: logSource ?? null,
  });
  return {
    attempted: true,
    ok: result.ok,
    inviteEmailsSent: result.inviteEmailsSent,
  };
}

/**
 * After paid Pro recipient setup + intake confirm: mint review links when needed, then VS01 (sender-first)
 * or owner done page (review). Skips the redundant `/app/send` interstitial.
 */
export async function executePaidProPostRecipientSetupHandoff(options: {
  navigate: (to: string) => void | Promise<void>;
  agreementId: string;
  draft: AgreementDraft;
  premiumSendIntent: PremiumSendIntent;
  recipientSetup?: RecipientSetupEmailInput | null;
  onReviewLinksReady?: (info: { alreadyReady: boolean }) => void;
  logSource: string;
  /** Final agreement plain text for VS01 signature-block anchor placement. */
  agreementCorpusText?: string | null;
  /** Corpus source label for review-link mint (e.g. authoritative_signing_snapshot). */
  agreementCorpusSource?: string | null;
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
  /** After-pay visible deal + complete names+emails: do not swallow VS01 on 1500-char / By-line asserts. */
  relaxPaidSessionCorpusAssert?: boolean;
}): Promise<PaidProPostRecipientSetupResult> {
  const id = String(options.agreementId || "").trim();
  if (!id) {
    return {
      ok: false,
      failure: {
        agreementId: id,
        reason: "vs01_seed",
        userMessage: "We could not open the e-sign workspace. Try again in a moment.",
        premiumSendIntent: options.premiumSendIntent,
      },
    };
  }

  // eslint-disable-next-line no-console
  console.info("[send-flow-skip-review-link-interstitial]", {
    agreementId: id,
    premiumSendIntent: options.premiumSendIntent,
    source: options.logSource,
  });

  if (options.premiumSendIntent === "review") {
    if (peekReviewFirstMintInFlight(id)) {
      // eslint-disable-next-line no-console
      console.info("[review-first-mint-duplicate-suppressed]", {
        agreementId: id,
        source: options.logSource,
      });
      const minted = await mintAndPersistReviewLinksForHandoff(
        id,
        options.draft,
        options.premiumSendIntent,
        options.agreementCorpusText,
        options.logSource,
        options.agreementCorpusSource,
      );
      if (minted.ok) {
        const route = resolveOwnerPostReviewSendRoute(id, {
          reviewSentOk: true,
          reviewEmailDeliveryAttempted: true,
          reviewInviteEmailsSent: true,
        });
        options.onReviewLinksReady?.({ alreadyReady: true });
        void options.navigate(route.path);
        return {
          ok: true,
          destination: route.destination,
          ownerRoutePath: route.path,
          alreadyReady: true,
          userMessage: REVIEW_LINKS_ALREADY_READY_MESSAGE,
        };
      }
      return {
        ok: false,
        failure: minted.failure,
      };
    }
    setReviewFirstMintInFlight(id);
    try {
      const minted = await mintAndPersistReviewLinksForHandoff(
        id,
        options.draft,
        options.premiumSendIntent,
        options.agreementCorpusText,
        options.logSource,
        options.agreementCorpusSource,
      );
      if (!minted.ok) return { ok: false, failure: minted.failure };
      const alreadyReady = minted.alreadyReady === true;
      const rolePersist = await persistReviewEmailPartyRolesOnServer(
        id,
        options.draft,
        options.recipientSetup ?? null,
      );
      if (!rolePersist.ok) {
        // eslint-disable-next-line no-console
        console.warn("[review-email-party-roles-persist-failed]", {
          agreementId: id,
          source: options.logSource,
        });
      } else if (rolePersist.rolesPersisted) {
        // eslint-disable-next-line no-console
        console.info("[review-email-party-roles-persisted]", {
          agreementId: id,
          source: options.logSource,
        });
      }
      const reviewSent = await maybePostReviewSentAfterReviewFirstHandoff(
        id,
        rolePersist.draft,
        options.logSource,
      );
      markSimpleFlowSent(id);
      emitActionCompleted("send", { agreementId: id });
      const deliveryCompleted =
        reviewSent.inviteEmailsSent ||
        reviewSent.skipped === "invite_emails_already_sent";
      const route = resolveOwnerPostReviewSendRoute(id, {
        reviewSentOk: reviewSent.ok && deliveryCompleted,
        reviewEmailDeliveryAttempted:
          reviewSent.attempted || reviewSent.skipped === "invite_emails_already_sent",
        reviewInviteEmailsSent: deliveryCompleted,
      });
      logReviewFirstOwnerRouteResolved({
        agreementId: id,
        destination: route.destination,
        reason: route.reason,
        deliveryMode: route.deliveryMode,
        reviewSentOk: reviewSent.ok,
        reviewEmailDeliveryAttempted: reviewSent.attempted,
        reviewInviteEmailsSent: reviewSent.inviteEmailsSent,
      });
      writeReviewDeliveryHandoffNotice({
        agreementId: id,
        routeReason: route.reason,
      });
      if (route.destination === "dashboard") {
        writeCreateReviewAgreementResumeId(id);
      }
      options.onReviewLinksReady?.({ alreadyReady });
      void options.navigate(route.path);
      return {
        ok: true,
        destination: route.destination,
        ownerRoutePath: route.path,
        alreadyReady,
        ...(alreadyReady ? { userMessage: REVIEW_LINKS_ALREADY_READY_MESSAGE } : {}),
      };
    } finally {
      clearReviewFirstMintInFlight();
    }
  }

  const resolvedHandoff = resolvePaidSessionSignatureTrackHandoff({
    relaxPaidSessionCorpusAssert: Boolean(options.relaxPaidSessionCorpusAssert),
    explicitHandoff: options.guidedSigningHandoff,
    leftoverSessionHandoff: resolveGuidedVs01SigningHandoffForBridge(null),
  });
  const signingCorpusPlain = (
    resolvedHandoff?.corpusText ??
    options.agreementCorpusText ??
    ""
  ).trim();
  const handoff =
    resolvedHandoff ??
    (options.relaxPaidSessionCorpusAssert && signingCorpusPlain
      ? buildGuidedVs01SigningHandoff({
          corpusText: signingCorpusPlain,
          source: "finalized_signer_applied_guided_corpus",
        })
      : null);
  const draftForBridge = options.relaxPaidSessionCorpusAssert
    ? mergePaidSessionSignatureTrackDraft(options.draft, signingCorpusPlain)
    : mergeAgreementDraftWithGuidedSigningHandoff(options.draft, handoff);

  if (options.premiumSendIntent === "signature" && handoff && !options.relaxPaidSessionCorpusAssert) {
    const corpusAssert = assertGuidedProVs01BridgeCorpusReady(handoff);
    if (!corpusAssert.ok) {
      logGuidedProVs01BridgeCorpusBlocked({
        agreementId: id,
        source: options.logSource,
        reason: corpusAssert.reason,
        ...corpusAssert.diagnostics,
      });
      return {
        ok: false,
        failure: {
          agreementId: id,
          reason: "vs01_seed",
          userMessage:
            "The finalized agreement is not ready for signing yet. Return to final review and try again.",
          premiumSendIntent: options.premiumSendIntent,
        },
      };
    }
    writeGuidedVs01SigningHandoffSession(handoff);
  }
  if (options.relaxPaidSessionCorpusAssert && handoff) {
    writeGuidedVs01SigningHandoffSession(handoff);
  }

  // eslint-disable-next-line no-console
  console.info("[send-flow-vs01-bridge-start]", {
    agreementId: id,
    source: options.logSource,
    signingCorpusLen: signingCorpusPlain.length || null,
    signingCorpusSource: handoff?.source ?? null,
    draftDocumentTextLen: Math.max(
      String((draftForBridge as { document_text?: string }).document_text ?? "").length,
      String((draftForBridge as { server_full_document_text?: string }).server_full_document_text ?? "").length,
      String((draftForBridge as { premium_full_document_text?: string }).premium_full_document_text ?? "").length,
    ),
  });

  const vs01Ok = await tryNavigatePaidProAgreementSenderFirstVs01Esign({
    navigate: options.navigate,
    agreementId: id,
    draft: draftForBridge,
    logReason: options.logSource,
    recipientSetup: options.recipientSetup ?? null,
    agreementCorpusText: signingCorpusPlain || options.agreementCorpusText,
    guidedSigningHandoff: handoff,
    relaxPaidSessionCorpusAssert: options.relaxPaidSessionCorpusAssert,
  });

  if (vs01Ok) {
    // eslint-disable-next-line no-console
    console.info("[send-flow-vs01-bridge-success]", { agreementId: id, source: options.logSource });
    return { ok: true, destination: "vs01", ownerRoutePath: "" };
  }

  if (options.relaxPaidSessionCorpusAssert && signingCorpusPlain && handoff) {
    const localBridge = tryNavigateGuidedSignatureTrackLocalVs01Esign({
      navigate: options.navigate,
      localAgreementId: id,
      draft: draftForBridge,
      logReason: `${options.logSource}_paid_session_local_bridge`,
      recipientSetup: options.recipientSetup ?? null,
      agreementCorpusText: signingCorpusPlain,
      guidedSigningHandoff: handoff,
      relaxPaidSessionCorpusAssert: true,
    });
    if (localBridge.ok) {
      // eslint-disable-next-line no-console
      console.info("[send-flow-vs01-bridge-success]", {
        agreementId: id,
        source: options.logSource,
        localBridge: true,
      });
      return { ok: true, destination: "vs01", ownerRoutePath: "" };
    }
  }

  // eslint-disable-next-line no-console
  console.warn("[send-flow-vs01-bridge-failed]", { agreementId: id, source: options.logSource });
  return {
    ok: false,
    failure: {
      agreementId: id,
      reason: "vs01_seed",
      userMessage: "We could not open the e-sign workspace. Try again in a moment.",
      premiumSendIntent: options.premiumSendIntent,
    },
  };
}
