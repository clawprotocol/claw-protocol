/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  canonicalFlowZoneUtilizationPct,
  isWitnessSigningPacketPage,
  VS01_PACKET_PAGE_WIDTH_PT,
  vs01PaginationTextRectBottomLimitNorm,
} from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { measureCanonicalFlowBodyDom } from "./vs01CanonicalFlowBodyDomMeasure";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_clip",
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

/** Long Pro agreement shape: 13 numbered sections, witness block, initials on each page. */
export function qaThirteenSectionProCorpus(): string {
  const clause =
    "Service Provider shall perform commercially reasonable services, maintain documentation, deliver milestones on schedule, and support Client acceptance testing. ";
  const sections = Array.from({ length: 13 }, (_, i) => {
    const n = i + 1;
    return `${n}. SECTION TITLE ${n}\n${n}.1 Scope and deliverables.\n${clause.repeat(3)}\n${n}.2 Operational terms and cooperation.\n${clause.repeat(2)}\n${n}.3 Suspension and cure mechanics when payment or access issues arise.`;
  }).join("\n\n");
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${sections}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Harry Manny
Title: COO
Date: ____________________`;
}

function renderCanonicalPageSurface(page: Parameters<typeof Vs01CanonicalSigningPage>[0]["page"]) {
  return render(
    <div
      className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
      style={{ width: VS01_PACKET_PAGE_WIDTH_PT, height: 792, position: "relative" }}
    >
      <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
    </div>,
  );
}

describe("VS01 canonical flow body clipping", () => {
  it(
    "paginates 13-section Pro corpus to about ten pages without DOM clipping on body pages",
    () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThanOrEqual(8);
    expect(model.pages.length).toBeLessThanOrEqual(11);
    expect(model.fields.filter((f) => f.type === "initials").length).toBeGreaterThan(0);

    const bodyPages = model.pages.filter(
      (page) => !isWitnessSigningPacketPage(page) && page.initialsBandRect.height > 0.001,
    );
    const fullBodyPages = bodyPages.filter((page) => canonicalFlowZoneUtilizationPct(page) >= 85);
    expect(fullBodyPages.length).toBeGreaterThanOrEqual(6);
    const avgUtil =
      fullBodyPages.reduce((sum, page) => sum + canonicalFlowZoneUtilizationPct(page), 0) /
      fullBodyPages.length;
    expect(avgUtil).toBeGreaterThanOrEqual(88);

    for (const page of bodyPages) {
      const stackBottom = canonicalFlowStackBottomNorm(page);
      const limit = vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y);
      expect(stackBottom).toBeLessThanOrEqual(limit + 0.001);
      for (const rect of page.textBlocks) {
        expect(rect.y + rect.height).toBeLessThanOrEqual(limit + 0.001);
      }
      expect(stackBottom).toBeLessThanOrEqual(page.initialsBandRect.y + 0.001);
    }

    for (const page of fullBodyPages) {
      const limit = vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y);
      const { container } = renderCanonicalPageSurface(page);
      const flowBody = container.querySelector(".vs01-canonical-flow-body") as HTMLElement;
      expect(flowBody).toBeTruthy();
      const dom = measureCanonicalFlowBodyDom(flowBody, page, VS01_PACKET_PAGE_WIDTH_PT);
      expect(dom.clipped).toBe(false);
      expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(page.contentRect.y + page.contentRect.height + 0.002);
      expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(page.initialsBandRect.y + 0.002);
      expect(dom.actualDomContentBottomNorm).toBeLessThanOrEqual(limit + 0.004);
    }
    },
    20_000,
  );
});
