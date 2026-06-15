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
  canonicalDescriptorDomStackUnits,
  canonicalFlowLineDescriptorsForPage,
  canonicalPageDomMatchesModel,
  canonicalPageRenderStackUnits,
  canonicalModelStackBottomNorm,
} from "./vs01CanonicalPageLayoutContract";
import {
  VS01_CANONICAL_BODY_FONT_SIZE_PX,
  VS01_CANONICAL_BODY_LINE_HEIGHT_PX,
  canonicalDescriptorDomHeightUnits,
} from "./vs01CanonicalPreWrapMeasure";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test361",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "Author",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Heath Lincoln",
        signerTitle: "Member",
      },
    ],
  });
}

function renderCanonicalPageShell(
  pages: ReturnType<typeof buildVs01SigningPacketModel>["pages"],
  shellClass: "prepare" | "recipient",
) {
  const workspaceClass =
    shellClass === "prepare"
      ? "vs01-sign-workspace vs01-sign-workspace--prepare"
      : "vs01-recipient-signing-view";
  const scrollClass = shellClass === "prepare" ? "vs01-sign-scroll" : "vs01-recipient-signing-scroll vs01-sign-scroll";
  return render(
    <div className={workspaceClass}>
      <div className={scrollClass} data-testid={`vs01-${shellClass}-scroll`} style={{ overflow: "auto", maxHeight: "84vh" }}>
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

function renderCanonicalPageSurface(page: ReturnType<typeof buildVs01SigningPacketModel>["pages"][number]) {
  return render(
    <div
      className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
      style={{ width: VS01_PACKET_PAGE_WIDTH_PT, height: VS01_PACKET_PAGE_HEIGHT_PT, position: "relative" }}
    >
      <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
    </div>,
  );
}

function assertBodyPagesMatchLayoutContract(model: ReturnType<typeof buildVs01SigningPacketModel>): void {
  const witnessPageIndex = model.pages.findIndex((page) => isWitnessSigningPacketPage(page));
  const bodyPages = model.pages.filter(
    (page) => !isWitnessSigningPacketPage(page) && page.initialsBandRect.height > 0.001,
  );

  for (const page of bodyPages) {
    expect(bodyPageHasSectionMarkerOrphan(page)).toBe(false);

    const stackBottom = canonicalFlowStackBottomNorm(page);
    const limit = vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y);
    expect(stackBottom).toBeLessThanOrEqual(limit + 0.001);

    const descriptors = canonicalFlowLineDescriptorsForPage(page.flowLines, page.pageIndex ?? 0);
    const renderUnits = canonicalPageRenderStackUnits(page.flowLines, page.pageIndex ?? 0);
    expect(renderUnits).toBeGreaterThan(0);
    for (const descriptor of descriptors) {
      if (!descriptor.trimmed) continue;
      const units = canonicalDescriptorDomStackUnits(descriptor);
      const heightUnits = canonicalDescriptorDomHeightUnits(descriptor);
      if (descriptor.kind === "heading") {
        expect(units).toBeCloseTo(heightUnits * 1.02, 5);
      } else if (descriptor.kind !== "signature_label" && !descriptor.isSignatureExecutionLine) {
        expect(units).toBeCloseTo(heightUnits, 5);
      }
    }
    expect(stackBottom).toBeCloseTo(
      page.contentRect.y + renderUnits * (VS01_CANONICAL_BODY_LINE_HEIGHT_PX / VS01_PACKET_PAGE_HEIGHT_PT),
      5,
    );

    const { container } = renderCanonicalPageSurface(page);
    const flowBody = container.querySelector(".vs01-canonical-flow-body") as HTMLElement;
    const dom = measureCanonicalFlowBodyDom(flowBody, page, VS01_PACKET_PAGE_WIDTH_PT);

    expect(dom.clipped).toBe(false);
    expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(page.initialsBandRect.y + 0.004);
    if (dom.actualDomContentBottomNorm > page.contentRect.y + 0.05) {
      expect(dom.modelDomMatches).toBe(true);
      expect(
        canonicalPageDomMatchesModel({
          modelStackBottomNorm: stackBottom,
          actualDomContentBottomNorm: dom.actualDomContentBottomNorm,
          clipped: dom.clipped,
        }),
      ).toBe(true);
    }

    if (page.pageIndex !== witnessPageIndex - 1) {
      expect(canonicalFlowZoneUtilizationPct(page)).toBeGreaterThanOrEqual(72);
    }
  }
}

describe("test361 VS01 canonical model-vs-DOM layout contract", () => {
  it("locks shared typography constants used by paginator and Vs01CanonicalSigningPage", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain("--vs01-canonical-line-height");
    expect(css).toMatch(/\.vs01-canonical-flow-line[\s\S]*line-height:\s*var\(--vs01-canonical-line-height/);
    expect(VS01_CANONICAL_BODY_FONT_SIZE_PX).toBe(13);
    expect(VS01_CANONICAL_BODY_LINE_HEIGHT_PX).toBe(17.5);
    const prepareSrc = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const recipientSrc = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(prepareSrc).toContain("Vs01CanonicalSigningPage");
    expect(recipientSrc).toContain("Vs01CanonicalSigningPage");
    expect(prepareSrc).toContain("vs01-sign-page-surface--canonical");
    expect(recipientSrc).toContain("vs01-sign-page-surface--canonical");
  });

  it("paginator stack bottom matches descriptor layout contract on every page", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    for (const page of model.pages) {
      const fromDescriptors = canonicalModelStackBottomNorm(
        page.contentRect.y,
        page.flowLines,
        page.pageIndex,
      );
      expect(canonicalFlowStackBottomNorm(page)).toBeCloseTo(fromDescriptors, 5);
      if (!isWitnessSigningPacketPage(page) && page.initialsBandRect.height > 0.001) {
        expect(canonicalFlowStackBottomNorm(page)).toBeLessThanOrEqual(
          vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y) + 0.001,
        );
      }
    }
  });

  it("prepare shell: model stack bottom matches measured DOM on every body page", async () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);

    const firstMeaningful = model.pages[0]!.flowLines.map((l) => l.trim()).find(Boolean) ?? "";
    expect(firstMeaningful).toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT/i);

    assertBodyPagesMatchLayoutContract(model);
    const { container } = renderCanonicalPageShell(model.pages, "prepare");
    expect(container.querySelector(".vs01-sign-workspace--prepare")).toBeTruthy();
    expect(container.querySelectorAll(".vs01-sign-page-surface--canonical").length).toBe(model.pages.length);
  });

  it("recipient signing shell: renders the same canonical page model without DOM clipping", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    assertBodyPagesMatchLayoutContract(model);
    const { container } = renderCanonicalPageShell(model.pages, "recipient");
    expect(container.querySelector(".vs01-recipient-signing-view")).toBeTruthy();
    expect(container.querySelectorAll(".vs01-sign-page-surface--canonical").length).toBe(model.pages.length);
  });
});
