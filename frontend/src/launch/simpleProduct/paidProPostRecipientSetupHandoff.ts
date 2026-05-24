import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  assertGuidedProVs01BridgeCorpusReady,
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
import {
  tryNavigatePaidProAgreementSenderFirstVs01Esign,
  type RecipientSetupEmailInput,
} from "./agreementToVs01SigningBridge";
import {
  peekPaidProStarterSignatureSendFromCreateFlow,
  peekPremiumSenderSignFirst,
  type PremiumSendIntent,
} from "./premiumSendIntent";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  reviewLinkMintHasUsableUrls,
  REVIEW_LINK_MINT_FAILURE_USER_COPY,
  writeSimpleDoneReviewRecipientLinks,
} from "./simpleDoneReviewRecipientLinks";

export type PaidProPostRecipientSetupFailure = {
  userMessage: string;
  reason: "review_link_mint" | "vs01_seed";
  agreementId: string;
  premiumSendIntent: PremiumSendIntent;
};

export type PaidProPostRecipientSetupResult =
  | { ok: true; destination: "vs01" | "done" }
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

async function mintAndPersistReviewLinksForHandoff(
  agreementId: string,
  draft: AgreementDraft,
  premiumSendIntent: PremiumSendIntent,
): Promise<{ ok: true } | { ok: false; failure: PaidProPostRecipientSetupFailure }> {
  let linkRows: Awaited<ReturnType<typeof mintSimpleDoneReviewRecipientLinkRows>>["rows"] = [];
  let mintThrew = false;
  try {
    const minted = await mintSimpleDoneReviewRecipientLinkRows({ agreementId, draft });
    linkRows = minted.rows;
  } catch {
    mintThrew = true;
    linkRows = [];
  }
  const mintSucceeded = reviewLinkMintHasUsableUrls(linkRows);
  if (!mintSucceeded || mintThrew) {
    return {
      ok: false,
      failure: {
        agreementId,
        reason: "review_link_mint",
        userMessage: REVIEW_LINK_MINT_FAILURE_USER_COPY,
        premiumSendIntent,
      },
    };
  }
  writeSimpleDoneReviewRecipientLinks({
    agreementId,
    recipients: linkRows,
    agreementPartyDisplayNames: orderedAuthoritativePartyDisplayNames(draft.parties),
  });
  return { ok: true };
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
  logSource: string;
  /** Final agreement plain text for VS01 signature-block anchor placement. */
  agreementCorpusText?: string | null;
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
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
    const minted = await mintAndPersistReviewLinksForHandoff(id, options.draft, options.premiumSendIntent);
    if (!minted.ok) return { ok: false, failure: minted.failure };
    markSimpleFlowSent(id);
    emitActionCompleted("send", { agreementId: id });
    void options.navigate(`/app/done/${encodeURIComponent(id)}`);
    return { ok: true, destination: "done" };
  }

  const handoff = resolveGuidedVs01SigningHandoffForBridge(options.guidedSigningHandoff);
  const draftForBridge = mergeAgreementDraftWithGuidedSigningHandoff(options.draft, handoff);
  const signingCorpusPlain = (handoff?.corpusText ?? options.agreementCorpusText ?? "").trim();

  if (options.premiumSendIntent === "signature" && handoff) {
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

  try {
    const minted = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: id,
      draft: draftForBridge,
      signingCorpusPlain: signingCorpusPlain || undefined,
      signingCorpusSource: handoff?.source,
    });
    if (reviewLinkMintHasUsableUrls(minted.rows)) {
      writeSimpleDoneReviewRecipientLinks({
        agreementId: id,
        recipients: minted.rows,
        agreementPartyDisplayNames: orderedAuthoritativePartyDisplayNames(options.draft.parties),
      });
    }
  } catch {
    /* VS01 bridge may still proceed; owner can copy links from done later if needed */
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
  });

  if (vs01Ok) {
    // eslint-disable-next-line no-console
    console.info("[send-flow-vs01-bridge-success]", { agreementId: id, source: options.logSource });
    return { ok: true, destination: "vs01" };
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
