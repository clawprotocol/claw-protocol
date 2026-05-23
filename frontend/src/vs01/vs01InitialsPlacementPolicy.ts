/**
 * Document-wide deterministic initials placement policy for VS01 prepare/signing.
 */

import { prepareAutoInitialsPlacementDims, type PlacedSigningField } from "./signingFields";
import { buildVs01PlacementContext, findSafeInitialsRectOnPage } from "./vs01FieldGeometry";
import {
  buildCorpusSimulatedPageLayouts,
  mergePageLayoutForInitials,
  pageLayoutForIndex,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import { layoutHasPlaceableInitialsContent } from "./vs01InitialsSafeZone";

export type Vs01InitialsPlacementMode = "placed_all_eligible" | "suppressed_document_wide";

export type Vs01InitialsPlacementPolicy = {
  mode: Vs01InitialsPlacementMode;
  witnessPageIndex: number;
  eligiblePages: number[];
  placedPages: number[];
  skippedPages: number[];
  suppressedReason?: string;
  /** Legacy — per-page placement uses {@link findSafeInitialsRectOnPage} directly. */
  rectByPartyIndex: Map<number, { x: number; y: number; width: number; height: number }>;
};

export function logVs01InitialsPolicy(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-policy]", payload);
}

function effectivePageLayout(
  pdfLayout: Vs01PageTextLayout | null,
  corpusLayout: Vs01PageTextLayout | null,
): Vs01PageTextLayout | null {
  return mergePageLayoutForInitials(pdfLayout, corpusLayout);
}

export function resolveVs01InitialsPlacementPolicy(args: {
  pageCount: number;
  partyIndices: readonly number[];
  corpusText?: string | null;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
  existingFields?: readonly PlacedSigningField[];
}): Vs01InitialsPlacementPolicy {
  const pageCount = Math.max(1, args.pageCount);
  const placementCtx = buildVs01PlacementContext({
    corpusText: args.corpusText,
    pageCount,
    pageLayouts: args.pageLayouts,
    documentId: args.documentId,
    roleCount: Math.max(2, args.partyIndices.length),
  });
  const witnessPageIndex = placementCtx.witnessPageIndex ?? pageCount - 1;
  const corpus = (args.corpusText ?? "").trim();
  const corpusLayouts =
    corpus.length >= 40 ? buildCorpusSimulatedPageLayouts(corpus, pageCount) : [];
  const dims = prepareAutoInitialsPlacementDims();
  const eligiblePages: number[] = [];
  const skippedPages: number[] = [];

  for (let p = 0; p < pageCount; p += 1) {
    const layout = pageLayoutForIndex(placementCtx.layouts, p);
    const corpusPage = pageLayoutForIndex(corpusLayouts, p);
    const effective = effectivePageLayout(layout, corpusPage);
    if (!layoutHasPlaceableInitialsContent(effective)) {
      skippedPages.push(p);
      continue;
    }
    eligiblePages.push(p);
  }

  const rectByPartyIndex = new Map<number, { x: number; y: number; width: number; height: number }>();
  if (eligiblePages.length === 0 || args.partyIndices.length === 0) {
    const policy: Vs01InitialsPlacementPolicy = {
      mode: "suppressed_document_wide",
      witnessPageIndex,
      eligiblePages,
      placedPages: [],
      skippedPages,
      suppressedReason: "no_eligible_pages",
      rectByPartyIndex,
    };
    logVs01InitialsPolicy({
      pageCount,
      witnessPageIndex,
      eligiblePages,
      placedPages: [],
      skippedPages,
      mode: policy.mode,
      reason: policy.suppressedReason,
    });
    return policy;
  }

  let verifiedPages = 0;
  for (const partyIndex of args.partyIndices) {
    for (const p of eligiblePages) {
      const onPage = (args.existingFields ?? []).filter((f) => f.page === p);
      const fieldObstacles = onPage.map((f) => ({
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      }));
      const safe = findSafeInitialsRectOnPage({
        page: p,
        partyIndex,
        pageLayout: effectivePageLayout(
          pageLayoutForIndex(placementCtx.layouts, p),
          pageLayoutForIndex(corpusLayouts, p),
        ),
        corpusText: args.corpusText,
        fieldObstacles,
        dims,
        isSignaturePage: p === witnessPageIndex,
      });
      if (safe.rect) {
        rectByPartyIndex.set(partyIndex, safe.rect);
        verifiedPages += 1;
        break;
      }
    }
  }

  if (rectByPartyIndex.size < args.partyIndices.length) {
    const policy: Vs01InitialsPlacementPolicy = {
      mode: "suppressed_document_wide",
      witnessPageIndex,
      eligiblePages,
      placedPages: [],
      skippedPages,
      suppressedReason: "no_verified_safe_zone",
      rectByPartyIndex: new Map(),
    };
    logVs01InitialsPolicy({
      pageCount,
      witnessPageIndex,
      eligiblePages,
      placedPages: [],
      skippedPages,
      mode: policy.mode,
      reason: policy.suppressedReason,
      verifiedPages,
    });
    return policy;
  }

  const placedPages = [...eligiblePages];
  const policy: Vs01InitialsPlacementPolicy = {
    mode: "placed_all_eligible",
    witnessPageIndex,
    eligiblePages,
    placedPages,
    skippedPages,
    rectByPartyIndex,
  };
  logVs01InitialsPolicy({
    pageCount,
    witnessPageIndex,
    eligiblePages,
    placedPages,
    skippedPages,
    mode: policy.mode,
    includesSignaturePage: eligiblePages.includes(witnessPageIndex),
  });
  return policy;
}

export const VS01_INITIALS_SUPPRESSED_DOCUMENT_COPY =
  "Initials could not be placed safely on every page — only signature fields are required.";
