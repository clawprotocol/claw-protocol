/**
 * Live free-starter sticky CTA review gate.
 *
 * AgreementBuilderIntake.unifiedPrimaryCta must call this — tests evaluate the
 * same expression. Isolation of getDraftFirstReviewBlocker is not enough:
 * empty Party 1/2 slots or a generic title can still label the button
 * "Fix details" after the blocker returns null.
 */
import { PRO_CTA_CONTINUE } from "../../launch/simpleProduct/proConversionCopy";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  draftHasPlaceholderParties,
  dumpStatedPartiesPaintedInBody,
  extractRealPartyNamesFromPreview,
  getDraftFirstReviewBlocker,
  partyNamesResolvedViaRenderedPreview,
  type DraftReviewFirstBlocker,
} from "./reviewPlaceholderGuard";

export const FREE_STARTER_FIX_DETAILS_LABEL = "Fix details";
export const FREE_STARTER_ADD_PARTY_NAMES_LABEL = "Add party names";
export const FREE_STARTER_FIX_DOCUMENT_LABEL = "Fix document";

export type FreeStarterStickyReviewCta = {
  reviewIncomplete: boolean;
  firstBlocker: DraftReviewFirstBlocker | null;
  /** Sticky fix label when reviewIncomplete. */
  fixLabel: string | null;
  /** Existing free-paint continue when dump-stated names are already on the page. */
  continueLabel: typeof PRO_CTA_CONTINUE;
  dumpStatedPartiesPainted: boolean;
};

function bodyHasDumpStatedTwoPartyNames(
  intakeText: string | null | undefined,
  visibleBody: string | null | undefined,
): boolean {
  if (dumpStatedPartiesPaintedInBody(intakeText, visibleBody)) return true;
  return extractRealPartyNamesFromPreview(visibleBody || "") !== null;
}

function bodyHasAskedCommercialTenets(visibleBody: string | null | undefined): boolean {
  const body = String(visibleBody || "");
  if (body.length < 50) return false;
  const payment = /\$\s*[\d,]+|\b[\d,]+\s*(?:dollars?|usd)\b|\bdue on signing\b/i.test(body);
  const term = /\b\d+\s*(?:day|days|week|weeks|month|months)\b|\bstarting\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/i.test(
    body,
  );
  const law = /\b(?:texas|delaware|california|new york|florida|governing law)\b/i.test(body);
  return payment && term && law;
}

/**
 * The live `reviewIncomplete` + fixLabel block from unifiedPrimaryCta.
 * When the visitor-visible document already has the dump-stated two-party names,
 * never return Fix details / Add party names.
 */
export function resolveFreeStarterStickyReviewCta(args: {
  draft: ParsedDraftShape | null | undefined;
  /** Visitor-visible document (not a stale rebuild). */
  userVisibleFullDocumentPlain: string | null | undefined;
  /** Dump + answers. Must survive a cleared step buffer. */
  intakeText: string | null | undefined;
  limitedReviewIgnoresGenericTitleOnly?: boolean;
  basicPartyNamesResolvedViaLivePreview?: boolean;
}): FreeStarterStickyReviewCta {
  const draft = args.draft;
  const visible = args.userVisibleFullDocumentPlain;
  const intakeText = args.intakeText;
  const dumpStatedPartiesPainted = Boolean(
    draft && bodyHasDumpStatedTwoPartyNames(intakeText, visible),
  );
  const askedTenetsInBody = bodyHasAskedCommercialTenets(visible);

  const firstBlocker = draft
    ? getDraftFirstReviewBlocker(draft, {
        userVisibleFullDocumentPlain: visible,
        intakeText,
      })
    : null;

  const partyNamesResolvedViaRenderedDoc = Boolean(
    draft &&
      (partyNamesResolvedViaRenderedPreview(draft, visible, intakeText) || dumpStatedPartiesPainted),
  );
  const partyNamesIncompleteForProgress = Boolean(
    draft &&
      draftHasPlaceholderParties(draft) &&
      !args.basicPartyNamesResolvedViaLivePreview &&
      !partyNamesResolvedViaRenderedDoc,
  );

  // Universal: dump-stated names already on the visitor-visible page.
  // Empty Party 1/2 slots, generic title, or payment/term/law that landed in
  // the body must not keep the sticky button on Fix details / Add party names.
  if (dumpStatedPartiesPainted && firstBlocker !== "identity_placeholder_in_corpus") {
    return {
      reviewIncomplete: false,
      firstBlocker: askedTenetsInBody || firstBlocker === "other_placeholder" ? null : firstBlocker,
      fixLabel: null,
      continueLabel: PRO_CTA_CONTINUE,
      dumpStatedPartiesPainted,
    };
  }

  const reviewIncomplete = Boolean(
    draft &&
      (partyNamesIncompleteForProgress ||
        firstBlocker === "identity_placeholder_in_corpus" ||
        (!args.limitedReviewIgnoresGenericTitleOnly && firstBlocker === "other_placeholder")),
  );

  if (!reviewIncomplete) {
    return {
      reviewIncomplete: false,
      firstBlocker,
      fixLabel: null,
      continueLabel: PRO_CTA_CONTINUE,
      dumpStatedPartiesPainted,
    };
  }

  const fixLabel =
    firstBlocker === "party_placeholder"
      ? FREE_STARTER_ADD_PARTY_NAMES_LABEL
      : firstBlocker === "identity_placeholder_in_corpus"
        ? FREE_STARTER_FIX_DOCUMENT_LABEL
        : FREE_STARTER_FIX_DETAILS_LABEL;

  return {
    reviewIncomplete: true,
    firstBlocker,
    fixLabel,
    continueLabel: PRO_CTA_CONTINUE,
    dumpStatedPartiesPainted,
  };
}
