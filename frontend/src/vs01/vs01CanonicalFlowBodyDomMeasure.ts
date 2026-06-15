import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
  VS01_PACKET_PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM,
  canonicalFlowStackBottomNorm,
  type Vs01SigningPacketPage,
} from "./buildVs01SigningPacketModel";
import {
  canonicalPageDomMatchesModel,
  canonicalModelDomStackDeltaNorm,
} from "./vs01CanonicalPageLayoutContract";

export type Vs01CanonicalFlowBodyDomMetrics = {
  flowStackBottomLimit: number;
  visualLastLineBottomNorm: number;
  actualDomContentBottomNorm: number;
  flowBodyHeightNorm: number;
  modelFlowStackBottomNorm: number;
  modelDomStackDeltaNorm: number;
  modelDomMatches: boolean;
  clipped: boolean;
};

export function maxCanonicalFlowBodyChildBottomPx(flowBody: HTMLElement): number {
  let maxBottom = 0;
  const children = flowBody.querySelectorAll(
    "[data-vs01-canonical-text], .vs01-canonical-flow-spacer",
  );
  for (const node of children) {
    const el = node as HTMLElement;
    maxBottom = Math.max(maxBottom, el.offsetTop + el.offsetHeight);
  }
  return maxBottom;
}

export function measureCanonicalFlowBodyDom(
  flowBody: HTMLElement,
  page: Pick<Vs01SigningPacketPage, "contentRect" | "flowLines" | "textBlocks" | "pageIndex">,
  pageWidthPx = VS01_PACKET_PAGE_WIDTH_PT,
): Vs01CanonicalFlowBodyDomMetrics {
  const pageHeightPx = (pageWidthPx * VS01_PACKET_PAGE_HEIGHT_PT) / VS01_PACKET_PAGE_WIDTH_PT;
  const maxChildBottomPx = maxCanonicalFlowBodyChildBottomPx(flowBody);
  const flowBodyHeightPx = flowBody.clientHeight || flowBody.offsetHeight;
  const actualDomContentBottomNorm = page.contentRect.y + maxChildBottomPx / pageHeightPx;
  const flowBodyHeightNorm = flowBodyHeightPx / pageHeightPx;
  const clipped = maxChildBottomPx > flowBodyHeightPx + 2;
  const modelFlowStackBottomNorm = canonicalFlowStackBottomNorm(page);
  const modelDomStackDeltaNorm = canonicalModelDomStackDeltaNorm(
    modelFlowStackBottomNorm,
    actualDomContentBottomNorm,
  );
  return {
    flowStackBottomLimit: VS01_PACKET_PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM,
    visualLastLineBottomNorm: actualDomContentBottomNorm,
    actualDomContentBottomNorm,
    flowBodyHeightNorm,
    modelFlowStackBottomNorm,
    modelDomStackDeltaNorm,
    modelDomMatches: canonicalPageDomMatchesModel({
      modelStackBottomNorm: modelFlowStackBottomNorm,
      actualDomContentBottomNorm,
      clipped,
    }),
    clipped,
  };
}

export function logVs01CanonicalFlowBodyDomDiagnostics(
  pageIndex: number,
  metrics: Vs01CanonicalFlowBodyDomMetrics,
  modelFlowStackBottom?: number,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-canonical-pagination-page-dom]", {
    page: pageIndex,
    flowStackBottom: modelFlowStackBottom ?? metrics.modelFlowStackBottomNorm,
    visualLastLineBottom: metrics.visualLastLineBottomNorm,
    flowStackBottomLimit: metrics.flowStackBottomLimit,
    actualDomContentBottom: metrics.actualDomContentBottomNorm,
    flowBodyHeightNorm: metrics.flowBodyHeightNorm,
    modelDomStackDelta: metrics.modelDomStackDeltaNorm,
    modelDomMatches: metrics.modelDomMatches,
    clipped: metrics.clipped,
  });
}
