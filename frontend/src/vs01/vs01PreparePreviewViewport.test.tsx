/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import {
  buildVs01SigningPacketModel,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { measureCanonicalFlowBodyDom } from "./vs01CanonicalFlowBodyDomMeasure";
import { qaThirteenSectionProCorpus } from "./vs01CanonicalFlowBodyClipping.test";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import {
  canonicalPreparePageSurfaceHasFooterInsetFade,
  readPreparePreviewViewportGeometry,
} from "./vs01PreparePreviewViewport";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test356",
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

function renderPreparePreviewShell(pages: ReturnType<typeof buildVs01SigningPacketModel>["pages"]) {
  return render(
    <div className="vs01-sign-workspace vs01-sign-workspace--prepare">
      <div className="vs01-sign-scroll" data-testid="vs01-prepare-scroll" style={{ overflow: "auto", maxHeight: "84vh" }}>
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

describe("test356 VS01 prepare preview viewport", () => {
  it("does not apply footer-safe inset fade on canonical prepare pages", () => {
    const prepareSrc = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(prepareSrc).toContain('className="vs01-sign-page-surface vs01-sign-page-surface--canonical"');
    expect(prepareSrc).not.toContain(
      "vs01-sign-page-surface--footer-safe vs01-sign-page-surface--canonical",
    );
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toMatch(
      /\.vs01-sign-page-surface--canonical\.vs01-sign-page-surface--footer-safe[\s\S]*box-shadow/,
    );
    expect(css).toMatch(/\.vs01-canonical-flow-body[\s\S]*overflow:\s*hidden/);
  });

  it("renders stacked canonical pages at full letter size without user-visible body clipping", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThanOrEqual(8);
    expect(model.pages.length).toBeLessThanOrEqual(12);

    const { container } = renderPreparePreviewShell(model.pages);
    const scroll = container.querySelector('[data-testid="vs01-prepare-scroll"]') as HTMLElement;
    const stacks = container.querySelectorAll(".vs01-sign-page-stack");
    expect(stacks.length).toBe(model.pages.length);
    const scrollOverflow = getComputedStyle(scroll).overflowY;
    expect(scrollOverflow === "auto" || scrollOverflow === "").toBe(true);

    for (const stack of stacks) {
      const surface = stack.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement;
      expect(surface).toBeTruthy();
      expect(surface.classList.contains("vs01-sign-page-surface--footer-safe")).toBe(false);

      const geometry = readPreparePreviewViewportGeometry({ scrollEl: scroll, pageSurfaceEl: surface });
      expect(surface.style.width).toBe(`${VS01_PACKET_PAGE_WIDTH_PT}px`);
      expect(surface.style.height).toBe(`${VS01_PACKET_PAGE_HEIGHT_PT}px`);
      expect(canonicalPreparePageSurfaceHasFooterInsetFade(geometry.pageSurfaceBoxShadow)).toBe(false);

      const pageIndex = Number(surface.closest("[data-vs01-sign-page]")?.getAttribute("data-vs01-sign-page"));
      const page = model.pages.find((p) => p.pageIndex === pageIndex);
      expect(page).toBeTruthy();
      const flowBody = surface.querySelector(".vs01-canonical-flow-body") as HTMLElement;
      const dom = measureCanonicalFlowBodyDom(flowBody, page!, VS01_PACKET_PAGE_WIDTH_PT);
      expect(dom.clipped).toBe(false);
      expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(page!.initialsBandRect.y + 0.004);

      const surfaceRect = surface.getBoundingClientRect();
      const flowRect = flowBody.getBoundingClientRect();
      expect(flowRect.top).toBeGreaterThanOrEqual(surfaceRect.top - 1);
      expect(flowRect.bottom).toBeLessThanOrEqual(surfaceRect.bottom + 1);
    }
  });
});
