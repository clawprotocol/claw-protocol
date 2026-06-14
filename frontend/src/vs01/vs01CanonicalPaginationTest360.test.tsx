/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import {
  bodyPageHasSectionMarkerOrphan,
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  canonicalFlowZoneUtilizationPct,
  isWitnessSigningPacketPage,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
  vs01PaginationTextRectBottomLimitNorm,
} from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { measureCanonicalFlowBodyDom } from "./vs01CanonicalFlowBodyDomMeasure";
import { qaThirteenSectionProCorpus } from "./vs01CanonicalFlowBodyClipping.test";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import {
  canonicalPreparePageSurfaceHasFooterInsetFade,
  readPreparePreviewViewportGeometry,
  resetPrepareCanonicalPreviewScroll,
} from "./vs01PreparePreviewViewport";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test360",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "Author",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Harry Manny",
        signerTitle: "COO",
      },
    ],
  });
}

function bodyPagesWithInitials(model: ReturnType<typeof buildVs01SigningPacketModel>) {
  return model.pages.filter(
    (page) => !isWitnessSigningPacketPage(page) && page.initialsBandRect.height > 0.001,
  );
}

function renderPreparePreviewShell(pages: ReturnType<typeof buildVs01SigningPacketModel>["pages"]) {
  return render(
    <div className="vs01-sign-workspace vs01-sign-workspace--prepare">
      <div
        className="vs01-sign-scroll"
        data-testid="vs01-prepare-scroll"
        style={{ overflow: "auto", maxHeight: "84vh" }}
      >
        <div className="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge">
          <div className="vs01-sign-pages-inner">
            {pages.map((page) => (
              <div key={page.pageIndex} className="vs01-sign-page-stack" data-vs01-sign-page={page.pageIndex}>
                <div
                  className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
                  style={{ width: VS01_PACKET_PAGE_WIDTH_PT, height: VS01_PACKET_PAGE_HEIGHT_PT }}
                >
                  <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
  );
}

describe("test360 VS01 canonical prepare preview regression", () => {
  it("long Paid Pro corpus: no section-marker orphans, strong flow utilization, DOM not clipped, page 1 at top", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThanOrEqual(8);
    expect(model.pages.length).toBeLessThanOrEqual(12);

    const witnessPageIndex = model.pages.findIndex((page) => isWitnessSigningPacketPage(page));
    expect(witnessPageIndex).toBeGreaterThan(0);

    const bodyPages = bodyPagesWithInitials(model);
    const fullBodyPages = bodyPages.filter((page) => canonicalFlowZoneUtilizationPct(page) >= 80);
    expect(fullBodyPages.length).toBeGreaterThanOrEqual(6);

    const avgUtil =
      fullBodyPages.reduce((sum, page) => sum + canonicalFlowZoneUtilizationPct(page), 0) /
      fullBodyPages.length;
    expect(avgUtil).toBeGreaterThanOrEqual(85);

    for (const page of bodyPages) {
      expect(bodyPageHasSectionMarkerOrphan(page)).toBe(false);

      const stackBottom = canonicalFlowStackBottomNorm(page);
      const limit = vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y);
      expect(stackBottom).toBeLessThanOrEqual(limit + 0.001);
      for (const rect of page.textBlocks) {
        expect(rect.y + rect.height).toBeLessThanOrEqual(limit + 0.001);
      }

      const util = canonicalFlowZoneUtilizationPct(page);
      if (page.pageIndex !== witnessPageIndex - 1) {
        expect(util).toBeGreaterThanOrEqual(72);
      }
    }

    const page0 = model.pages[0]!;
    const firstMeaningful = page0.flowLines.map((l) => l.trim()).find(Boolean) ?? "";
    expect(firstMeaningful).toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT/i);

    const { container } = renderPreparePreviewShell(model.pages);
    const scroll = container.querySelector('[data-testid="vs01-prepare-scroll"]') as HTMLElement;
    scroll.scrollTop = 480;
    resetPrepareCanonicalPreviewScroll(scroll);
    expect(scroll.scrollTop).toBe(0);

    const firstStack = container.querySelector('[data-vs01-sign-page="0"]') as HTMLElement;
    const firstSurface = firstStack.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement;
    const geometry = readPreparePreviewViewportGeometry({ scrollEl: scroll, pageSurfaceEl: firstSurface });
    expect(canonicalPreparePageSurfaceHasFooterInsetFade(geometry.pageSurfaceBoxShadow)).toBe(false);
    expect(geometry.pageSurfaceHasFooterSafe).toBe(false);

    for (const page of fullBodyPages) {
      const stack = container.querySelector(`[data-vs01-sign-page="${page.pageIndex}"]`) as HTMLElement;
      const surface = stack.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement;
      const flowBody = surface.querySelector(".vs01-canonical-flow-body") as HTMLElement;
      const dom = measureCanonicalFlowBodyDom(flowBody, page, VS01_PACKET_PAGE_WIDTH_PT);
      expect(dom.clipped).toBe(false);
      expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(page.initialsBandRect.y + 0.004);
    }
  });

  it("prepare bridge load resets scroll and selects page 1 at document top", () => {
    const prepareSrc = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(prepareSrc).toContain("resetPrepareCanonicalPreviewScroll");
    expect(prepareSrc).toContain("setCurrentPage(1)");
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).not.toMatch(
      /\.vs01-sign-workspace--prepare \.vs01-sign-scroll[\s\S]*contain:\s*layout style/,
    );
  });
});
