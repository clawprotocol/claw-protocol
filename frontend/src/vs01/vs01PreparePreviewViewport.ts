import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";

export type Vs01PreparePreviewViewportGeometry = {
  scrollClientHeight: number;
  scrollScrollHeight: number;
  scrollOverflowY: string;
  pageSurfaceHeight: number;
  pageSurfaceWidth: number;
  pageStackGap: string;
  pageSurfaceHasFooterSafe: boolean;
  pageSurfaceBoxShadow: string;
};

export function readPreparePreviewViewportGeometry(args: {
  scrollEl: HTMLElement;
  pageSurfaceEl: HTMLElement;
}): Vs01PreparePreviewViewportGeometry {
  const scrollStyle = getComputedStyle(args.scrollEl);
  const surfaceStyle = getComputedStyle(args.pageSurfaceEl);
  const pagesInner = args.pageSurfaceEl.closest(".vs01-sign-pages-inner");
  const pagesInnerStyle = pagesInner ? getComputedStyle(pagesInner as HTMLElement) : null;
  return {
    scrollClientHeight: args.scrollEl.clientHeight,
    scrollScrollHeight: args.scrollEl.scrollHeight,
    scrollOverflowY: scrollStyle.overflowY,
    pageSurfaceHeight: args.pageSurfaceEl.clientHeight,
    pageSurfaceWidth: args.pageSurfaceEl.clientWidth,
    pageStackGap: pagesInnerStyle?.gap ?? "",
    pageSurfaceHasFooterSafe: args.pageSurfaceEl.classList.contains("vs01-sign-page-surface--footer-safe"),
    pageSurfaceBoxShadow: surfaceStyle.boxShadow,
  };
}

export function logVs01PreviewViewportGeometry(
  pageIndex: number,
  geometry: Vs01PreparePreviewViewportGeometry,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-preview-viewport-geometry]", {
    page: pageIndex,
    scaledPageHeight: geometry.pageSurfaceHeight,
    scaledPageWidth: geometry.pageSurfaceWidth,
    expectedPageHeight: VS01_PACKET_PAGE_HEIGHT_PT,
    expectedPageWidth: VS01_PACKET_PAGE_WIDTH_PT,
    scrollContainerHeight: geometry.scrollClientHeight,
    scrollContentHeight: geometry.scrollScrollHeight,
    overflowMode: geometry.scrollOverflowY,
    pageStackGap: geometry.pageStackGap,
    footerSafeClass: geometry.pageSurfaceHasFooterSafe,
    boxShadow: geometry.pageSurfaceBoxShadow,
  });
}

export function canonicalPreparePageSurfaceHasFooterInsetFade(boxShadow: string): boolean {
  return /inset/i.test(boxShadow);
}

export function preparePreviewPageSurfaceDimensionsMatchLetter(
  geometry: Pick<Vs01PreparePreviewViewportGeometry, "pageSurfaceHeight" | "pageSurfaceWidth">,
): boolean {
  return (
    Math.abs(geometry.pageSurfaceHeight - VS01_PACKET_PAGE_HEIGHT_PT) <= 2 &&
    Math.abs(geometry.pageSurfaceWidth - VS01_PACKET_PAGE_WIDTH_PT) <= 2
  );
}
